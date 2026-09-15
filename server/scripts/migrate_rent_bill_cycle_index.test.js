import { afterAll as after, beforeAll as before, beforeEach, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { billHash, reconcile, matchesIndex } from './migrate_rent_bill_cycle_index.mjs';
import { RENT_BILL_CYCLE_INDEX as spec } from '../services/billing/rentBillCycleIndex.js';

let mongo, client, db, manifest, originals;
const cycle = new Date('2026-09-24T16:00:00Z');
const bill = (overrides = {}) => ({ _id: new ObjectId(), reservationId: new ObjectId(),
  billingCycleStart: cycle, billingCycleEnd: new Date('2026-10-24T16:00:00Z'),
  billType: 'monthly', charges: { rent: 5400 }, totalAmount: 5400, paidAmount: 0,
  status: 'pending', isArchived: false, createdAt: new Date('2026-09-01'), ...overrides });
before(async () => {
  mongo = await MongoMemoryServer.create(); client = new MongoClient(mongo.getUri());
  await client.connect(); db = client.db('rent_cycle_fixtures');
}, 120_000);
after(async () => { await client?.close(); await mongo?.stop(); }, 60_000);
beforeEach(async () => {
  await db.dropDatabase();
  // Synthetic copies of all five audited patterns; no production personal/provider data.
  const patterns = [
    [{ penalty: 45 }, 45, 0, 14400, 0], [{ penalty: 50 }, 50, 0, 5400, 5400],
    [{ electricity: 22080 }, 22080, 0, 6300, 0], [{ electricity: 800 }, 800, 800, 13500, 0],
    [{ water: 50 }, 50, 210, 13500, 0],
  ];
  originals = patterns.flatMap(([charges, total, paid, rent, rentPaid]) => {
    const reservationId = new ObjectId();
    return [bill({ reservationId, charges: { rent: 0, ...charges }, totalAmount: total, paidAmount: paid,
      status: paid ? 'paid' : 'draft', utilityCycleStart: new Date('2026-08-24'),
      utilityDispatch: { electricity: { periodId: new ObjectId(), amount: paid === 210 ? 160 : total } },
      paymongoPaymentId: paid ? 'fixture-utility-payment' : null }),
    bill({ reservationId, charges: { rent }, totalAmount: rent, paidAmount: rentPaid,
      status: rentPaid ? 'paid' : 'pending', paymongoPaymentId: rentPaid ? 'fixture-rent-payment' : null })];
  });
  await db.collection('bills').insertMany(originals);
  await db.collection('payments').insertMany(originals.filter(b => b.paidAmount).map(b => ({ billId: b._id,
    amount: b.paidAmount, referenceNumber: 'fixture-ref', paidAt: new Date('2026-09-01') })));
  manifest = { database: db.databaseName, groups: Array.from({ length: 5 }, (_, i) => ({ classification: 'C',
    action: 'preserve-both', evidence: 'Separate utility/penalty and recurring rent; preserve financial history',
    bills: originals.slice(i * 2, i * 2 + 2).map(b => ({ id: String(b._id), sha256: billHash(b) })) })) };
});
const apply = () => reconcile(db, manifest, { apply: true, saveEvidence: async () => {} });

test('dry run detects five patterns, writes no documents or index', async () => {
  const result = await reconcile(db, manifest);
  assert.equal(result.before.recordsDetected, 10); assert.deepEqual(result.before.blockers, []);
  assert.equal(result.action, 'none'); assert.equal((await db.collection('bills').listIndexes().toArray()).length, 1);
});
test('apply and repeated apply preserve every bill and downstream payment byte-for-byte', async () => {
  const before = JSON.stringify(await db.collection('bills').find().toArray());
  const payments = JSON.stringify(await db.collection('payments').find().toArray());
  assert.equal((await apply()).action, 'created-index');
  assert.equal((await apply()).action, 'already-exact-no-op');
  assert.equal(JSON.stringify(await db.collection('bills').find().toArray()), before);
  assert.equal(JSON.stringify(await db.collection('payments').find().toArray()), payments);
  assert.ok(matchesIndex((await db.collection('bills').listIndexes().toArray()).find(i => i.name === spec.name)));
});
for (const [name, paidAmount] of [['unpaid', 0], ['paid', 5400], ['partially paid', 100]]) {
  test(`actual ${name} rent duplicate blocks index without consolidating`, async () => {
    await db.collection('bills').insertOne(bill({ reservationId: originals[1].reservationId, paidAmount }));
    const snapshot = JSON.stringify(await db.collection('bills').find().toArray());
    const result = await apply(); assert.ok(result.before.blockers.length); assert.equal(result.action, 'none');
    assert.equal(JSON.stringify(await db.collection('bills').find().toArray()), snapshot);
  });
}
for (const classification of ['A', 'D', 'E']) test(`classification ${classification} requires manual review`, async () => {
  manifest.groups[0].classification = classification;
  assert.ok((await apply()).before.blockers.some(b => b.includes('manual review')));
});
test('two payment-bearing records marked D remain intact and require review', async () => {
  await db.collection('bills').updateOne({ _id: originals[0]._id }, { $set: { paidAmount: 45, status: 'paid' } });
  await db.collection('bills').updateOne({ _id: originals[1]._id }, { $set: { paidAmount: 14400, status: 'paid' } });
  const docs = await db.collection('bills').find({ _id: { $in: [originals[0]._id, originals[1]._id] } }).toArray();
  manifest.groups[0].bills = docs.map(b => ({ id: String(b._id), sha256: billHash(b) }));
  manifest.groups[0].classification = 'D';
  const snapshot = JSON.stringify(docs);
  assert.ok((await apply()).before.blockers.some(b => b.includes('manual review')));
  assert.equal(JSON.stringify(await db.collection('bills').find({ _id: { $in: docs.map(b => b._id) } }).toArray()), snapshot);
});
test('concurrent rent creation has exactly one winner', async () => {
  await apply(); const reservationId = new ObjectId();
  const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => db.collection('bills').insertOne(bill({ reservationId }))));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(o => o.status === 'rejected' && o.reason.code === 11000).length, 3);
});
test('changed audited state aborts before creation', async () => {
  await db.collection('bills').updateOne({ _id: originals[0]._id }, { $set: { updatedAt: new Date() } });
  assert.ok((await apply()).before.blockers.some(b => b.includes('Audited state changed')));
});
test('change between backup and mutation aborts', async () => {
  await assert.rejects(reconcile(db, manifest, { apply: true, saveEvidence: async () => {
    await db.collection('bills').updateOne({ _id: originals[0]._id }, { $set: { updatedAt: new Date() } });
  } }), /Precondition failed/);
  assert.equal((await db.collection('bills').listIndexes().toArray()).length, 1);
});
test('existing conflicting definition is preserved, never dropped', async () => {
  await db.collection('bills').createIndex(spec.key, { name: spec.name });
  assert.ok((await apply()).before.blockers.some(b => b.includes('different options')));
  assert.equal((await db.collection('bills').listIndexes().toArray()).find(i => i.name === spec.name).unique, undefined);
});
test('durable evidence is mandatory and evidence failure prevents index creation', async () => {
  await assert.rejects(reconcile(db, manifest, { apply: true }), /durable/);
  await assert.rejects(reconcile(db, manifest, { apply: true, saveEvidence: async () => { throw Error('disk failure'); } }), /disk failure/);
  assert.equal((await db.collection('bills').listIndexes().toArray()).length, 1);
});
test('original sparse plus partial definition is rejected by MongoDB', async () => {
  await assert.rejects(db.collection('bills').createIndex(spec.key, {
    name: 'old_invalid', unique: true, sparse: true, partialFilterExpression: spec.partialFilterExpression,
  }), /sparse.*partial|partial.*sparse/i);
});
test('exact production design permits legitimate non-rent flows and boundaries', async () => {
  await apply(); const reservationId = originals[1].reservationId;
  for (const overrides of [
    { charges: { rent: 0, electricity: 500 } }, { charges: { rent: 0, water: 50 } },
    { billType: 'penalty' },
    { billType: 'initial_payment' }, { billType: 'transfer_settlement' },
    { isArchived: true }, { isMilestoneSubInvoice: true, parentInvoiceId: originals[1]._id },
    { billingCycleStart: new Date('2026-10-24T16:00:00Z'), stayId: new ObjectId() },
    { billingCycleStart: new Date('2025-09-24T16:00:00Z') }, { reservationId: new ObjectId() },
  ]) await db.collection('bills').insertOne(bill({ reservationId, ...overrides }));
  await assert.rejects(db.collection('bills').insertOne(bill({ reservationId })), e => e.code === 11000);
});
for (const status of ['pending', 'paid', 'voided', 'waived', 'adjusted']) test(`${status} parent retains cycle ownership, including fully discounted rent`, async () => {
  await apply(); const reservationId = new ObjectId();
  await db.collection('bills').insertOne(bill({ reservationId, status, charges: { rent: 5400, discount: 5400 }, totalAmount: 0 }));
  await assert.rejects(db.collection('bills').insertOne(bill({ reservationId, stayId: new ObjectId() })), e => e.code === 11000);
});
