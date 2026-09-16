import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Contract, Reservation, Stay } from '../models/index.js';
import { canRealignMoveInDraft, synchronizeMoveInDraftDates } from './moveInContractDateSync.js';

describe('atomic move-in draft date alignment', () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: 'movein_date_sync' });
  }, 120000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); }, 120000);
  beforeEach(async () => { await Promise.all([Contract.deleteMany({}), Reservation.deleteMany({}), Stay.deleteMany({})]); });
  async function fixture() {
    const objectId = () => new mongoose.Types.ObjectId();
    const tenantId = objectId(), reservationId = objectId(), roomId = objectId(), stayId = objectId();
    const originalEnd = new Date('2027-03-01T00:00:00Z');
    const update = { leaseStartDate: new Date('2026-09-10T00:00:00Z'), leaseEndDate: new Date('2027-03-10T00:00:00Z'), leaseDurationMonths: 6 };
    await Reservation.collection.insertOne({ _id: reservationId, userId: tenantId, roomId, currentStayId: stayId, status: 'moveIn' });
    await Stay.collection.insertOne({ _id: stayId, tenantId, reservationId, roomId, status: 'active', leaseStartDate: update.leaseStartDate, leaseEndDate: originalEnd });
    const contractId = objectId();
    await Contract.collection.insertOne({ _id: contractId, tenantId, reservationId, roomId, status: 'draft', isCurrent: true,
      leaseStartDate: new Date('2026-09-01T00:00:00Z'), leaseEndDate: originalEnd, updatedAt: new Date('2026-09-10T01:00:00.100Z') });
    return { contract: await Contract.findById(contractId), stayId, update, originalEnd };
  }
  test('updates both dates together and preserves the actual occupancy start', async () => {
    const f = await fixture();
    await synchronizeMoveInDraftDates(f.contract, f.update);
    expect((await Stay.findById(f.stayId)).leaseEndDate).toEqual(f.update.leaseEndDate);
    expect((await Stay.findById(f.stayId)).leaseStartDate).toEqual(f.update.leaseStartDate);
    expect((await Contract.findById(f.contract._id)).leaseEndDate).toEqual(f.update.leaseEndDate);
  });
  test('a contract write failure rolls the Stay update back', async () => {
    const f = await fixture();
    const spy = jest.spyOn(Contract, 'updateOne').mockRejectedValueOnce(new Error('injected write failure'));
    try { await expect(synchronizeMoveInDraftDates(f.contract, f.update)).rejects.toThrow('injected write failure'); }
    finally { spy.mockRestore(); }
    expect((await Stay.findById(f.stayId)).leaseEndDate).toEqual(f.originalEnd);
    expect((await Contract.findById(f.contract._id)).leaseEndDate).toEqual(f.originalEnd);
  });
  test('detects a concurrent edit within the same second', async () => {
    const f = await fixture();
    await Contract.collection.updateOne({ _id: f.contract._id }, { $set: { updatedAt: new Date('2026-09-10T01:00:00.200Z') } });
    await expect(synchronizeMoveInDraftDates(f.contract, f.update)).rejects.toMatchObject({ code: 'MOVE_IN_CONTRACT_CHANGED' });
    expect((await Stay.findById(f.stayId)).leaseEndDate).toEqual(f.originalEnd);
  });
  test('a published contract stays protected even without a final document', async () => {
    const f = await fixture();
    await Contract.collection.updateOne({ _id: f.contract._id }, { $set: { status: 'published' } });
    await expect(synchronizeMoveInDraftDates(f.contract, f.update)).rejects.toMatchObject({ code: 'MOVE_IN_CONTRACT_CHANGED' });
    expect((await Stay.findById(f.stayId)).leaseEndDate).toEqual(f.originalEnd);
  });
  test('refuses a changed current Stay relationship', async () => {
    const f = await fixture();
    await Reservation.collection.updateOne({ _id: f.contract.reservationId }, { $set: { currentStayId: new mongoose.Types.ObjectId() } });
    await expect(synchronizeMoveInDraftDates(f.contract, f.update)).rejects.toMatchObject({ code: 'MOVE_IN_STAY_CHANGED' });
    expect((await Contract.findById(f.contract._id)).leaseEndDate).toEqual(f.originalEnd);
  });
  test.each([
    { status: 'signed' }, { status: 'published' }, { finalDocument: {} },
    { signedDocuments: [{}] }, { notarizedDocuments: [{}] }, { publishedAt: new Date() },
    { replacesContractId: 'previous' }, { contractPurpose: 'renewal' },
  ])('does not realign protected or successor contracts: %j', overrides => {
    expect(canRealignMoveInDraft({ status: 'draft', ...overrides })).toBe(false);
  });
});
