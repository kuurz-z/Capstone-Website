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
  room = await Room.create({ name: 'Test 301', roomNumber: '301', branch: 'gil-puyat', type: 'quadruple-sharing', capacity: 4, price: 6300 });
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
  expect((await Stay.findById(stay._id)).status).toBe('renewed');
  const successor = await Stay.findById(reviewed.successorStayId);
  expect(String(successor.previousStayId)).toBe(String(stay._id));
  expect(successor.leaseEndDate.toDateString()).toBe(new Date(request.requestedEndDate).toDateString());
  const updated = await Reservation.findById(reservation._id);
  expect(String(updated.currentStayId)).toBe(String(successor._id));
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
