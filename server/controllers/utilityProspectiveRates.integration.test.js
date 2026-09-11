import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AuditLog, Bill, BedHistory, Reservation, Room, User, UtilityPeriod, UtilityReading, UtilityFinalization } from '../models/index.js';
import BusinessSettings from '../models/BusinessSettings.js';
import { openUtilityPeriod, generateHistoricalUtilityPeriod, closeUtilityPeriod, recoverWaterOpening, previewWaterBilling } from './utilityBillingController.js';
import { updateBusinessRules } from './settingsController.js';
import { recordWaterOpeningRecovery } from '../services/billing/waterOpeningRecovery.js';
import { createOpenUtilityPeriodWithBoundary } from '../services/billing/utilityPeriodLifecycleService.js';

const models = [AuditLog, Bill, BedHistory, Reservation, Room, User, UtilityPeriod, UtilityReading, UtilityFinalization, BusinessSettings];
let mongo, admin, room, tenant, reservation;
const start = new Date('2026-08-01T00:00:00+08:00');
jest.setTimeout(120000);
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Build the indexes relevant to these transactions explicitly. AuditLog's
  // unrelated legacy retention index uses a partial $ne unsupported by Mongo.
  await mongoose.connect(mongo.getUri(), { dbName: 'prospective_utilities', autoIndex: false });
  await Promise.all(models.map(model => model.createCollection()));
  await UtilityPeriod.syncIndexes();
  await AuditLog.collection.createIndex({ logId: 1 }, { unique: true });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  for (const model of models) await model.deleteMany({});
  const user = role => User.create({ firebaseUid: String(new mongoose.Types.ObjectId()), username: String(new mongoose.Types.ObjectId()), email: `${new mongoose.Types.ObjectId()}@example.test`, firstName: role, lastName: 'Test', role, branch: 'gil-puyat' });
  admin = await user('owner'); tenant = await user('tenant');
  room = await Room.create({ name: 'Rate test', roomNumber: 'RT', branch: 'gil-puyat', type: 'private', capacity: 1, currentOccupancy: 1, price: 5000 });
  reservation = await Reservation.create({ userId: tenant._id, roomId: room._id, status: 'moveIn', moveInDate: new Date('2026-07-01'), leaseDuration: 6, preferredRoomType: 'private', agreedToPrivacy: true, agreedToCertification: true, monthlyRent: 5000, totalPrice: 5000 });
  await BedHistory.create({ roomId: room._id, reservationId: reservation._id, tenantId: tenant._id, bedId: 'a', moveInDate: reservation.moveInDate, observedStartAt: reservation.moveInDate, status: 'active' });
  await BusinessSettings.create({ key: 'global', defaultElectricityRatePerKwh: 23, defaultWaterRatePerUnit: 61 });
});
async function invoke(controller, utilityType, body, id) {
  let error;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await controller({ user: { uid: admin.firebaseUid, email: admin.email, role: 'owner' }, params: { utilityType, id }, body, query: {} }, res, value => { error = value; });
  return { ...res, error };
}
const recovery = extra => ({ admin: { _id: admin._id, isOwner: true, branch: 'gil-puyat' }, roomId: room._id, reading: 100, observedAt: start.toISOString(), source: 'documented-history', reason: 'Recovered signed meter sheet', evidenceReferences: ['meter-sheet-01'], ...extra });
async function snapshot(selected = models) {
  return JSON.stringify(await Promise.all(selected.map(model => model.collection.find({}).sort({ _id: 1 }).toArray())));
}
async function evidence(type, date = start, reading = 100) {
  return UtilityReading.create({ utilityType: type, roomId: room._id, branch: room.branch, date, reading, eventType: 'regularBilling', recordedBy: admin._id });
}
for (const type of ['electricity', 'water']) {
  test(`${type}: a configured zero tariff is captured without a fallback`, async () => {
    await BusinessSettings.updateOne({key:'global'}, {$set:{defaultElectricityRatePerKwh:0,defaultWaterRatePerUnit:0}});
    await evidence(type);
    const opened = await invoke(openUtilityPeriod, type, {roomId:room._id,startDate:'2026-08-01',startReading:100,ratePerUnit:99});
    expect(opened.error).toBeUndefined();
    expect((await UtilityPeriod.findOne({status:'open'})).ratePerUnit).toBe(0);
  });
  test(`${type}: a new isolated cycle ignores the previous and stale submitted tariff`, async () => {
    await UtilityPeriod.create({ utilityType: type, roomId: room._id, branch: room.branch, startDate: new Date('2026-07-01'), endDate: start, startReading: 80, endReading: 100, ratePerUnit: 7, status: 'closed' });
    await evidence(type);
    const result = await invoke(generateHistoricalUtilityPeriod, type, { roomId: room._id, startDate: '2026-08-01', endDate: '2026-09-01', startReading: 100, endReading: 110, ratePerUnit: 7 });
    expect(result.error).toBeUndefined();
    const period = await UtilityPeriod.findById(result.body.result.periodId);
    expect(period.ratePerUnit).toBe(type === 'electricity' ? 23 : 61);
    expect(period.computedTotalCost).toBe(type === 'electricity' ? 230 : 610);
    expect(result.body.result.nextPeriodId).toBeNull();
    expect(await UtilityPeriod.countDocuments({ status: 'open' })).toBe(0);
  });
  test(`${type}: settings update preserves all financial records and the already-open tariff`, async () => {
    const period = await createOpenUtilityPeriodWithBoundary({ utilityType: type, room, startDate: start, startReading: 100, ratePerUnit: 9, actorId: admin._id });
    for (const status of ['draft', 'pending', 'partially-paid', 'paid']) {
      await Bill.collection.insertOne({ status, roomId: room._id, userId: tenant._id, charges: { [type]: 90 }, paidAmount: status === 'paid' ? 90 : status === 'partially-paid' ? 40 : 0, utilityDispatch: { [type]: { state: status === 'draft' ? 'draft' : 'sent', amount: 90 } } });
    }
    await UtilityPeriod.create({ utilityType: type, roomId: room._id, branch: room.branch, status: 'closed', startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), startReading: 80, endReading: 90, ratePerUnit: 5 });
    const before = await snapshot([Room, UtilityPeriod, UtilityReading, Bill, Reservation, BedHistory]);
    const settings = await invoke(updateBusinessRules, type, { defaultElectricityRatePerKwh: 31, defaultWaterRatePerUnit: 73 });
    expect(settings.error).toBeUndefined();
    expect(await snapshot([Room, UtilityPeriod, UtilityReading, Bill, Reservation, BedHistory])).toBe(before);
    // Remove only unrelated fixture invoices from this tenant's cycle lookup.
    await Bill.deleteMany({});
    const closed = await invoke(closeUtilityPeriod, type, { endDate: '2026-09-01', endReading: 110 }, String(period._id));
    expect(closed.error).toBeUndefined();
    expect((await UtilityPeriod.findById(period._id)).ratePerUnit).toBe(9);
    expect((await UtilityPeriod.findById(period._id)).computedTotalCost).toBe(90);
    if (type === 'electricity') expect((await UtilityPeriod.findById(closed.body.result.nextPeriodId)).ratePerUnit).toBe(31);
  });
  for (const roomType of type === 'water' ? ['private', 'double-sharing'] : ['private', 'double-sharing', 'quadruple-sharing']) {
    test(`${type}: ${roomType} manual initialization captures the global rate`, async () => {
      await Room.updateOne({ _id: room._id }, { $set: { type: roomType } });
      await evidence(type);
      const result = await invoke(openUtilityPeriod, type, { roomId: room._id, startDate: '2026-08-01', startReading: 100, ratePerUnit: 999 });
      expect(result.error).toBeUndefined(); expect(result.statusCode).toBe(201);
      expect((await UtilityPeriod.findById(result.body.period.id || result.body.period._id)).ratePerUnit).toBe(type === 'electricity' ? 23 : 61);
    });
  }
}
test('Water preview uses the global rate for a new cycle', async () => {
  await evidence('water');
  const result = await invoke(previewWaterBilling, 'water', { roomId: room._id, startDate: '2026-08-01', startReading: 100, endDate: '2026-09-01', endReading: 110, ratePerUnit: 1 });
  expect(result.error).toBeUndefined(); expect(result.body.result.computedTotalCost).toBe(610);
});
test('legacy Water retains its cycle charge and closes without silently applying a PHP/m3 tariff', async () => {
  const period = await UtilityPeriod.create({ utilityType: 'water', roomId: room._id, branch: room.branch, status: 'open', startDate: start, startReading: 0, ratePerUnit: 300 });
  const result = await invoke(closeUtilityPeriod, 'water', { endDate: '2026-09-01' }, String(period._id));
  expect(result.error).toBeUndefined();
  expect((await UtilityPeriod.findById(period._id)).computedTotalCost).toBe(300);
  expect(result.body.result.nextPeriodId).toBeNull();
  expect(await UtilityPeriod.countDocuments({ status: 'open' })).toBe(0);
});
test('recovered historical baseline is exact, idempotent, audited and creates no charges or tenant events', async () => {
  await Bill.collection.insertOne({ status: 'paid', paidAmount: 300, roomId: room._id, charges: { water: 300 } });
  const before = await snapshot([Bill, Reservation, BedHistory]);
  const result = await recordWaterOpeningRecovery(recovery());
  expect(result.period.ratePerUnit).toBe(61);
  expect(result.reading.date).toEqual(start);
  expect(result.reading.tenantId).toBeNull();
  expect(result.unknownConsumptionBeforeBaseline).toBe(true);
  expect(await snapshot([Bill, Reservation, BedHistory])).toBe(before);
  expect(await AuditLog.countDocuments({ action: 'water_opening_recovered' })).toBe(1);
  const saved = await snapshot();
  expect((await recordWaterOpeningRecovery(recovery())).idempotent).toBe(true);
  expect(await snapshot()).toBe(saved);
});
test('current physical baseline uses its actual time, never the old tenant move-in date', async () => {
  const observedAt = new Date(Date.now() - 1000).toISOString();
  const result = await recordWaterOpeningRecovery(recovery({ observedAt, source: 'current-observation', evidenceReferences: [] }));
  expect(result.period.startDate).toEqual(new Date(observedAt));
  expect((await Reservation.findById(reservation._id)).moveInDate).toEqual(reservation.moveInDate);
  expect(await Bill.countDocuments()).toBe(0);
});

test('recovered observation resumes preview and draft generation from its exact instant only', async () => {
  const observedAt = '2026-08-20T10:35:00+08:00';
  const recovered = await recordWaterOpeningRecovery(recovery({observedAt, reading:123.45}));
  expect(await Bill.countDocuments()).toBe(0);
  const payload = {roomId:room._id, periodId:String(recovered.period._id), startDate:'2026-08-20', startReading:123.45, endDate:'2026-09-01', endReading:130.45};
  const preview = await invoke(previewWaterBilling, 'water', payload);
  expect(preview.error).toBeUndefined();
  const closed = await invoke(closeUtilityPeriod, 'water', payload, String(recovered.period._id));
  expect(closed.error).toBeUndefined();
  const saved = await UtilityPeriod.findById(recovered.period._id);
  expect(saved.startDate).toEqual(new Date(observedAt));
  expect(saved.computedTotalUsage).toBeCloseTo(7);
  expect(saved.computedTotalCost).toBeCloseTo(427);
  expect(saved.tenantSummaries).toHaveLength(1);
  expect(closed.body.result.nextPeriodId).toBeNull();
});
test.each([
  [{ reading: [] }, 'WATER_READING_INVALID'],
  [{ reading: {} }, 'WATER_READING_INVALID'],
  [{ evidenceReferences: [] }, 'WATER_HISTORICAL_EVIDENCE_REQUIRED'],
  [{ source: 'current-observation' }, 'WATER_HISTORICAL_EVIDENCE_REQUIRED'],
  [{ observedAt: '2099-01-01T10:00:00+08:00' }, 'WATER_OBSERVATION_INVALID'],
  [{ observedAt: '2026-08-01' }, 'WATER_OBSERVATION_INVALID'],
  [{ observedAt: '2026-08-01T10:00' }, 'WATER_OBSERVATION_INVALID'],
  [{ reading: '' }, 'PHYSICAL_METER_READING_REQUIRED'],
])('invalid recovery %j never persists changes', async (extra, code) => {
  const before = await snapshot();
  const error = await recordWaterOpeningRecovery(recovery(extra)).catch(error => error);
  if (extra.reading === '') expect(error).toBeInstanceOf(Error); else expect(error.code).toBe(code);
  expect(await snapshot()).toBe(before);
});
test('missing evidence on an unbilled open measured period can be recovered without changing its tariff', async () => {
  const period = await UtilityPeriod.create({ utilityType: 'water', calculationVersion: 'water-meter-v1', roomId: room._id, branch: room.branch, status: 'open', startDate: new Date('2026-07-01'), startReading: 0, ratePerUnit: 17, pricingSnapshot: { ratePerUnit: 17, unit: 'm3' } });
  const result = await recordWaterOpeningRecovery(recovery());
  expect(String(result.period._id)).toBe(String(period._id));
  expect(result.period.pricingSnapshot.ratePerUnit).toBe(17);
  expect(result.period.startDate).toEqual(start);
  expect((await AuditLog.findOne()).metadata.before.startDate).toEqual(period.startDate);
});
test.each(['draft', 'pending', 'partially-paid', 'paid'])('an open period linked to a %s allocation cannot be recovered', async status => {
  const period = await UtilityPeriod.create({ utilityType: 'water', calculationVersion: 'water-meter-v1', roomId: room._id, branch: room.branch, status: 'open', startDate: start, startReading: 0, ratePerUnit: 17 });
  await Bill.collection.insertOne({ status, waterAllocations: [{ utilityPeriodId: period._id, amount: 100, state: status === 'draft' ? 'draft' : 'sent' }] });
  const before = await snapshot();
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toMatchObject({ code: 'UTILITY_FINANCIAL_HISTORY_LOCKED' });
  expect(await snapshot()).toBe(before);
});

test('a finalization locks a missing opening even without an invoice', async () => {
  const period = await UtilityPeriod.create({utilityType:'water',calculationVersion:'water-meter-v1',roomId:room._id,branch:room.branch,status:'open',startDate:start,startReading:0,ratePerUnit:17});
  await UtilityFinalization.collection.insertOne({utilityPeriodId:period._id,utilityType:'water'});
  const before = await snapshot();
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toMatchObject({code:'UTILITY_FINANCIAL_HISTORY_LOCKED'});
  expect(await snapshot()).toBe(before);
});
test('chronology, existing coverage and legacy cutover reject unsafe recovery', async () => {
  await evidence('water', new Date('2026-08-02'), 90);
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toBeInstanceOf(Error);
  expect(await UtilityPeriod.countDocuments()).toBe(0);
  await UtilityReading.deleteMany({});
  await UtilityPeriod.create({ utilityType: 'water', roomId: room._id, branch: room.branch, status: 'closed', startDate: start, endDate: new Date('2026-09-01'), startReading: 0, endReading: 10, ratePerUnit: 300 });
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toMatchObject({ code: 'UTILITY_PERIOD_DATE_OVERLAP' });
  await UtilityPeriod.deleteMany({});
  await UtilityPeriod.create({ utilityType: 'water', roomId: room._id, branch: room.branch, status: 'open', startDate: start, startReading: 0, ratePerUnit: 300 });
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toMatchObject({ code: 'WATER_LEGACY_CUTOVER_REQUIRED' });
});
test.each([['gil-puyat', 'quadruple-sharing'], ['guadalupe', 'quadruple-sharing']])('excluded %s/%s cannot recover Water baseline', async (branch, type) => {
  await Room.updateOne({ _id: room._id }, { $set: { branch, type } });
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toMatchObject({ code: 'WATER_ROOM_EXCLUDED' });
});
test('foreign branch recovery is denied', async () => {
  const result = await recordWaterOpeningRecovery(recovery({ admin: { _id: admin._id, branch: 'guadalupe', isOwner: false } })).catch(error => error);
  expect(result.code).toBe('WATER_BRANCH_FORBIDDEN');
});
test('audit failure rolls back the baseline, period and coordination counter', async () => {
  const before = await snapshot();
  jest.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit failure'));
  await expect(recordWaterOpeningRecovery(recovery())).rejects.toThrow('audit failure');
  expect(await snapshot()).toBe(before);
});
test('concurrent retries produce one baseline, one period, one audit and one counter increment', async () => {
  const before = await Room.findById(room._id).lean();
  const results = await Promise.all([recordWaterOpeningRecovery(recovery()), recordWaterOpeningRecovery(recovery())]);
  expect(results.filter(result => result.idempotent)).toHaveLength(1);
  expect(await UtilityPeriod.countDocuments()).toBe(1); expect(await UtilityReading.countDocuments()).toBe(1);
  expect(await AuditLog.countDocuments({ action: 'water_opening_recovered' })).toBe(1);
  const after = await Room.findById(room._id).lean();
  expect(after).toEqual({ ...before, waterObservationRevision: before.waterObservationRevision + 1 });
});
test('recovery endpoint returns the verified baseline without invoking billing', async () => {
  const { admin: unused, ...body } = recovery();
  const result = await invoke(recoverWaterOpening, 'water', body);
  expect(result.error).toBeUndefined(); expect(result.statusCode).toBe(201);
  expect(result.body.data.reading.reading).toBe(100); expect(await Bill.countDocuments()).toBe(0);
});
