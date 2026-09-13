import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { jest, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';

const push = jest.fn().mockResolvedValue({ sent: 1 });
const generate = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('./notifications/mobilePushService.js', () => ({ sendMobilePushToRecipients: push, sendMobilePushBill: jest.fn(), sendMobilePushAnnouncement: jest.fn() }));
jest.unstable_mockModule('./autoContractOrchestratorService.js', () => ({ autoGenerateRenewalContract: generate }));
const { createStayExtension, reviewStayExtension, getMyStayExtension, extensionDates } = await import('./stayExtensionRequestService.js');
const { Reservation, Room, Stay, User, Contract } = await import('../models/index.js');
const { default: Request } = await import('../models/StayExtensionRequest.js');
const { default: Notification } = await import('../models/Notification.js');
const { getManilaToday } = await import('../utils/dateUtils.js');

jest.setTimeout(120000);
let mongo, tenant, room, reservation, stay, contract, actor;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'stay_extension_tests' });
  await Request.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  jest.clearAllMocks();
  tenant = await User.create({ firebaseUid: `test-${new mongoose.Types.ObjectId()}`, username: `t${new mongoose.Types.ObjectId()}`, email: `t${new mongoose.Types.ObjectId()}@example.test`, firstName: 'Extension', lastName: 'Tenant', role: 'tenant', tenantStatus: 'active' });
  room = await Room.create({ beds: [{ id: "bed-1", position: "upper", status: "occupied" }], name: 'Test 301', roomNumber: '301', branch: 'gil-puyat', type: 'quadruple-sharing', capacity: 4, price: 6300 });
  const start = getManilaToday().subtract(90, 'day').toDate(), end = getManilaToday().add(90, 'day').toDate();
  reservation = await Reservation.create({ userId: tenant._id, roomId: room._id, status: 'moveIn', leaseDuration: 6, reservationFeeAmount: 2000, preferredRoomType: 'quadruple-sharing', agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6300, monthlyRent: 6300, moveInDate: start, selectedBed: { id: 'bed-1' } });
  stay = await Stay.create({ tenantId: tenant._id, reservationId: reservation._id, branch: room.branch, roomId: room._id, bedId: 'bed-1', leaseStartDate: start, leaseEndDate: end, monthlyRent: 6300, status: 'active' });
  await Reservation.updateOne({ _id: reservation._id }, { $set: { currentStayId: stay._id } });
  const inserted = await Contract.collection.insertOne({ tenantId: tenant._id, reservationId: reservation._id, applicationId: reservation._id, stayId: stay._id, roomId: room._id, branch: room.branch, status: 'active', isCurrent: true, leaseStartDate: start, leaseEndDate: end, approvedMonthlyRate: 6300, contractNumber: 'TEST-EXTENSION', createdAt: new Date(), updatedAt: new Date() });
  contract = await Contract.findById(inserted.insertedId);
  actor = { _id: new mongoose.Types.ObjectId(), role: 'branch_admin', branch: room.branch };
});
const submit = (overrides = {}) => createStayExtension({ tenantId: tenant._id, payload: { stayId: String(stay._id), months: 6, reason: 'Continue studying', note: 'Same room', ...overrides } });

test('valid request snapshots canonical terms, notifies tenant/admin, and does not change the stay', async () => {
  const result = await submit();
  expect(result.status).toBe('pending');
  expect(String(result.stayId)).toBe(String(stay._id));
  expect((await Stay.findById(stay._id)).leaseEndDate).toEqual(stay.leaseEndDate);
  expect((await getMyStayExtension(tenant._id)).canRequest).toBe(false);
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Submitted' })).toBe(1);
  expect(push).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]), expect.objectContaining({ data: expect.objectContaining({ screen: 'extend-stay' }) }));
});
test.each([0, -1, 1.5, 25, 'bad'])('rejects invalid extension duration %s', async (months) => {
  await expect(submit({ months })).rejects.toMatchObject({ statusCode: 400 });
  expect(await Request.countDocuments()).toBe(0);
});
test('rejects invalid, past, and mismatched requested dates', async () => {
  for (const requestedEndDate of ['invalid', '2020-01-01', '2026-02-30']) await expect(submit({ requestedEndDate })).rejects.toBeDefined();
  expect(() => extensionDates('2020-01-01', 6)).toThrow();
  expect(await Request.countDocuments()).toBe(0);
});
test('simultaneous duplicate submissions persist only one pending request', async () => {
  const results = await Promise.allSettled([submit(), submit()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await Request.countDocuments({ status: 'pending' })).toBe(1);
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Submitted' })).toBe(1);
  expect(push.mock.calls.filter(([, payload]) => payload.title === 'Stay Extension Submitted')).toHaveLength(1);
});
test('approval atomically renews the correct stay and invokes canonical contract generation without repricing current bills', async () => {
  const request = await submit();
  const reviewed = await reviewStayExtension({ requestId: request._id, actor, decision: 'approved', adminNote: 'Approved for next term' });
  expect(reviewed.status).toBe('approved');
  expect((await Stay.findById(stay._id)).status).toBe('active');
  expect(String((await Reservation.findById(reservation._id)).currentStayId)).toBe(String(stay._id));
  const successor = await Stay.findById(reviewed.successorStayId);
  expect(String(successor.previousStayId)).toBe(String(stay._id));
  expect(successor.leaseEndDate.toDateString()).toBe(new Date(request.requestedEndDate).toDateString());
  const updated = await Reservation.findById(reservation._id);
  expect(String(updated.currentStayId)).toBe(String(stay._id));
  expect(updated.monthlyRent).toBe(6300);
  expect(updated.pendingExtensionRequestId).toBeNull();
  expect((await Contract.findById(contract._id)).leaseEndDate).toEqual(contract.leaseEndDate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Approved' })).toBe(1);
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).rejects.toMatchObject({ statusCode: 409 });
});
test('rejection preserves stay/contract, releases pending lock and notifies tenant', async () => {
  const request = await submit();
  await reviewStayExtension({ requestId: request._id, actor, decision: 'rejected', adminNote: 'Room unavailable next term' });
  expect((await Stay.findById(stay._id)).leaseEndDate).toEqual(stay.leaseEndDate);
  expect((await Reservation.findById(reservation._id)).pendingExtensionRequestId).toBeNull();
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Rejected' })).toBe(1);
  expect((await getMyStayExtension(tenant._id)).canRequest).toBe(true);
});
test('cannot submit as inactive tenant or against a historical stay', async () => {
  await User.updateOne({ _id: tenant._id }, { $set: { tenantStatus: 'inactive' } });
  await expect(submit()).rejects.toMatchObject({ statusCode: 403 });
  await User.updateOne({ _id: tenant._id }, { $set: { tenantStatus: 'active' } });
  await expect(submit({ stayId: String(new mongoose.Types.ObjectId()) })).rejects.toMatchObject({ statusCode: 409 });
});
test('stale or transferred-out stay cannot be approved and another branch cannot review', async () => {
  const request = await submit();
  await expect(reviewStayExtension({ requestId: request._id, actor: { ...actor, branch: 'guadalupe' }, decision: 'approved' })).rejects.toMatchObject({ statusCode: 403 });
  await Stay.updateOne({ _id: stay._id }, { $set: { status: 'terminated', endedAt: new Date() } });
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).rejects.toMatchObject({ statusCode: 409 });
  expect((await Request.findById(request._id)).status).toBe('pending');
  expect(await Stay.countDocuments()).toBe(1);
});

test('rejects dates equal to or before the future current end date', async () => {
  for (const requestedEndDate of [stay.leaseEndDate.toISOString(), new Date(stay.leaseEndDate.getTime() - 86400000).toISOString()]) {
    await expect(submit({ requestedEndDate })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(await Request.countDocuments()).toBe(0);
});

test('an active tenant without a current Stay cannot request an extension', async () => {
  await Stay.deleteMany({ tenantId: tenant._id });
  await expect(submit()).rejects.toMatchObject({ statusCode: 409 });
  expect(await Request.countDocuments()).toBe(0);
});

test('concurrent approvals create only one successor and one approval notification', async () => {
  const request = await submit();
  const review = () => reviewStayExtension({ requestId: request._id, actor, decision: 'approved' });
  const results = await Promise.allSettled([review(), review()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await Stay.countDocuments({ previousStayId: stay._id })).toBe(1);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(await Contract.countDocuments({ tenantId: tenant._id })).toBe(1); // Original retained; generator mocked.
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Approved' })).toBe(1);
  expect(push.mock.calls.filter(([, payload]) => payload.title === 'Stay Extension Approved')).toHaveLength(1);
  const current = await getMyStayExtension(tenant._id);
  expect(current.request.status).toBe('approved');
});

test('repeated rejection does not duplicate persisted or delivered notifications', async () => {
  const request = await submit();
  const review = () => reviewStayExtension({ requestId: request._id, actor, decision: 'rejected' });
  await review();
  await expect(review()).rejects.toMatchObject({ statusCode: 409 });
  expect(await Notification.countDocuments({ userId: tenant._id, title: 'Stay Extension Rejected' })).toBe(1);
  expect(push.mock.calls.filter(([, payload]) => payload.title === 'Stay Extension Rejected')).toHaveLength(1);
  expect((await getMyStayExtension(tenant._id)).request.status).toBe('rejected');
});

const { acknowledgeTenancyRequest } = await import('./requestAcknowledgementService.js');
const { createTenantTransferRequest, claimTenantTransferRequestForScheduling, getAdminTransferRequestForReservation } = await import('./tenantTransferRequestService.js');
const { executeDirectRoomSwapWorkflow } = await import('../utils/tenantActionService.js');
const { default: TransferRequest } = await import('../models/TenantTransferRequest.js');
const { default: Scheduled } = await import('../models/ScheduledRoomTransfer.js');
const transfer = () => createTenantTransferRequest({ tenantId: tenant._id, payload: { preferredRoomType: 'private', reason: 'Need privacy' } });

test.each(['transfer', 'extension'])('%s acknowledgement is idempotent metadata, never a tenancy mutation', async kind => {
  const request = kind === 'transfer' ? await transfer() : await submit();
  const before = await Reservation.findById(reservation._id).lean();
  const first = await acknowledgeTenancyRequest({ kind, requestId: request._id || request.id, actor });
  const second = await acknowledgeTenancyRequest({ kind, requestId: request._id || request.id, actor: { ...actor, _id: new mongoose.Types.ObjectId() } });
  expect(first.status).toBe('pending'); expect(second.acknowledgedAt).toEqual(first.acknowledgedAt);
  expect(String(second.acknowledgedBy)).toBe(String(actor._id));
  expect(await Reservation.findById(reservation._id).lean()).toEqual(before);
  expect(await Stay.countDocuments()).toBe(1);
  expect(await Notification.countDocuments({ dedupeKey: `tenancy_request_acknowledged:${kind}:${first._id}` })).toBe(1);
});

test('mobile transfer submissions produce exactly one Web request', async () => {
  await TransferRequest.init();
  const results = await Promise.allSettled([transfer(), transfer()]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await TransferRequest.countDocuments({ tenantId: tenant._id })).toBe(1);
  const web = await getAdminTransferRequestForReservation(reservation._id);
  expect(web.reason).toBe('Need privacy'); expect(web.status).toBe('pending');
});

test('mobile extension submissions produce exactly one persisted Web request', async () => {
  const results = await Promise.allSettled([submit(), submit()]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await Request.countDocuments({ tenantId: tenant._id })).toBe(1);
});

test('simultaneous transfer and extension serialize on the same tenancy', async () => {
  await TransferRequest.init();
  const results = await Promise.allSettled([transfer(), submit()]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await TransferRequest.countDocuments() + await Request.countDocuments()).toBe(1);
});

test('pending extension blocks admin transfer scheduling claim', async () => {
  await submit();
  const request = await TransferRequest.create({ tenantId: tenant._id, reservationId: reservation._id, stayId: stay._id, branch: room.branch, preferredRoomType: 'private', reason: 'Legacy request', currentRoomSnapshot: { roomId: room._id, branch: room.branch } });
  await expect(claimTenantTransferRequestForScheduling({ requestId: request._id, reservationId: reservation._id, actorId: actor._id })).rejects.toMatchObject({ statusCode: 409 });
  expect((await TransferRequest.findById(request._id)).status).toBe('pending');
});

test.each([null, 'running-token'])('scheduled/executing transfer blocks renewal approval (%s)', async executionToken => {
  const request = await submit();
  await Scheduled.collection.insertOne({ tenantId: tenant._id, reservationId: reservation._id, status: 'scheduled', executionToken });
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).rejects.toMatchObject({ statusCode: 409 });
  expect(await Stay.countDocuments()).toBe(1);
});

test('retired direct swap cannot mutate reservations, stays, or contracts', async () => {
  const before = await Reservation.findById(reservation._id).lean();
  await expect(executeDirectRoomSwapWorkflow(reservation._id, new mongoose.Types.ObjectId(), actor._id)).rejects.toMatchObject({ statusCode: 410 });
  expect(await Reservation.findById(reservation._id).lean()).toEqual(before);
});

test('extension checks another tenant future occupancy of the authoritative bed', async () => {
  const request = await submit(); const dates = extensionDates(stay.leaseEndDate, 6);
  await Stay.create({ tenantId: new mongoose.Types.ObjectId(), reservationId: new mongoose.Types.ObjectId(), roomId: room._id, branch: room.branch, bedId: 'bed-1', status: 'upcoming', leaseStartDate: dates.start, leaseEndDate: dates.end });
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).rejects.toMatchObject({ code: 'EXTENSION_OCCUPANCY_CONFLICT' });
  expect((await Request.findById(request._id)).status).toBe('pending');
});

test('another bed in the shared room does not conflict', async () => {
  const request = await submit(); const dates = extensionDates(stay.leaseEndDate, 6);
  await Stay.create({ tenantId: new mongoose.Types.ObjectId(), reservationId: new mongoose.Types.ObjectId(), roomId: room._id, branch: room.branch, bedId: 'bed-2', status: 'upcoming', leaseStartDate: dates.start, leaseEndDate: dates.end });
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).resolves.toMatchObject({ status: 'approved' });
});

test('future approval retains current Stay and legal contract and reports awaiting contract', async () => {
  const request = await submit(); await reviewStayExtension({ requestId: request._id, actor, decision: 'approved' });
  const current = await getMyStayExtension(tenant._id);
  expect(current.current.stayId).toBe(String(stay._id));
  expect(current.request.fulfillmentState).toBe('awaiting_contract');
  expect((await Contract.findById(contract._id)).isCurrent).toBe(true);
  expect(await Stay.countDocuments({ status: 'active' })).toBe(1);
  expect(await Stay.countDocuments({ status: 'upcoming' })).toBe(1);
});

test('contract generation failure leaves a durable upcoming Stay recoverable by Job 19', async () => {
  generate.mockRejectedValueOnce(new Error('storage unavailable'));
  const request = await submit(); await reviewStayExtension({ requestId: request._id, actor, decision: 'approved' });
  const { reconcileTenancyLifecycles } = await import('./tenancyLifecycleReconciliationService.js');
  generate.mockResolvedValueOnce({ success: true });
  const report = await reconcileTenancyLifecycles();
  expect(report.recovered).toBe(1); expect(generate).toHaveBeenCalledTimes(2);
  expect(await Stay.countDocuments({ previousStayId: stay._id })).toBe(1);
});

test('deterministic legacy early-switch recovery restores the effective Stay and BedHistory together', async () => {
  const request = await submit(); await reviewStayExtension({ requestId: request._id, actor, decision: 'approved' });
  const future = await Stay.findOne({ previousStayId: stay._id });
  await Stay.updateOne({ _id: future._id }, { $set: { status: 'active' } });
  await Stay.updateOne({ _id: stay._id }, { $set: { status: 'renewed', endedAt: future.leaseStartDate, endReason: 'renewed' } });
  await Reservation.updateOne({ _id: reservation._id }, { $set: { currentStayId: future._id } });
  const { BedHistory } = await import('../models/index.js');
  const history = await BedHistory.create({ bedId: stay.bedId, roomId: room._id, tenantId: tenant._id, reservationId: reservation._id, stayId: future._id, branch: room.branch, moveInDate: stay.leaseStartDate, status: 'active' });
  const { reconcileTenancyLifecycles } = await import('./tenancyLifecycleReconciliationService.js');
  await reconcileTenancyLifecycles(); await reconcileTenancyLifecycles();
  expect((await Stay.findById(future._id)).status).toBe('upcoming');
  expect((await Stay.findById(stay._id)).status).toBe('active');
  expect(String((await Reservation.findById(reservation._id)).currentStayId)).toBe(String(stay._id));
  expect(String((await BedHistory.findById(history._id)).stayId)).toBe(String(stay._id));
  expect((await Contract.findById(contract._id)).isCurrent).toBe(true);
});

test('reconciliation restores missing decision notification exactly once', async () => {
  const request = await submit(); await reviewStayExtension({ requestId: request._id, actor, decision: 'rejected', adminNote: 'Future bed hold' });
  await Notification.deleteMany({ title: 'Stay Extension Rejected' });
  const { reconcileTenancyLifecycles } = await import('./tenancyLifecycleReconciliationService.js');
  await reconcileTenancyLifecycles(); await reconcileTenancyLifecycles();
  expect(await Notification.countDocuments({ title: 'Stay Extension Rejected' })).toBe(1);
  expect((await getMyStayExtension(tenant._id)).request.adminNote).toBe('Future bed hold');
});

test.each(['reservation', 'scheduled hold'])('extension rejects conflicting future %s on the assigned bed', async kind => {
  const request = await submit(); const dates = extensionDates(stay.leaseEndDate, 6);
  if (kind === 'reservation') await Reservation.collection.insertOne({ roomId: room._id, userId: new mongoose.Types.ObjectId(), status: 'reserved', selectedBed: { id: 'bed-1' }, expectedMoveInDate: dates.start, leaseDuration: 6 });
  else await Scheduled.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(), reservationId: new mongoose.Types.ObjectId(), destinationRoomId: room._id, destinationBedId: 'bed-1', status: 'scheduled', effectiveTransferDate: dates.start });
  await expect(reviewStayExtension({ requestId: request._id, actor, decision: 'approved' })).rejects.toMatchObject({ code: 'EXTENSION_OCCUPANCY_CONFLICT' });
});

test('expired execution token is released without automatically executing the transfer', async () => {
  const inserted = await Scheduled.collection.insertOne({ tenantId: tenant._id, reservationId: reservation._id, status: 'scheduled', executionToken: 'crashed-worker', executionStartedAt: new Date(Date.now() - 20 * 60000), effectiveTransferDate: getManilaToday().toDate(), holdApplied: true });
  const { reconcileTenancyLifecycles } = await import('./tenancyLifecycleReconciliationService.js');
  await reconcileTenancyLifecycles();
  const schedule = await Scheduled.findById(inserted.insertedId).select('+executionToken');
  expect(schedule.executionToken).toBeNull(); expect(schedule.status).toBe('scheduled'); expect(schedule.holdApplied).toBe(true);
  expect((await Stay.findById(stay._id)).roomId).toEqual(room._id);
});

test('an effective extension stays fulfilled after a later transfer replaces its contract', async () => {
  const request = await submit(); const reviewed = await reviewStayExtension({ requestId: request._id, actor, decision: 'approved' });
  await Stay.updateOne({ _id: reviewed.successorStayId }, { $set: { status: 'active' } });
  await Contract.collection.insertOne({ stayId: reviewed.successorStayId, contractPurpose: 'renewal', status: 'replaced', isCurrent: false, statusHistory: [{ status: 'active' }] });
  const { serializeStayExtension } = await import('./stayExtensionRequestService.js');
  expect((await serializeStayExtension(reviewed)).fulfillmentState).toBe('effective');
});
