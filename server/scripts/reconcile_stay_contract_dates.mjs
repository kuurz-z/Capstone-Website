// Dry-run by default. Applies only a reviewed plan, with snapshots and CAS.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { selectCanonicalTenantContract } from '../services/tenantContractSelectionService.js';
import { planStayContractDateRepair } from '../services/stayContractRepairPlan.js';

const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const apply = args.includes('--apply');
const output = arg('--output');
const planPath = arg('--plan');
const expectedDb = arg('--expected-db');
if (!output || !expectedDb || (apply && !planPath)) throw new Error('Require --expected-db and --output; --apply also requires --plan.');
if (fs.existsSync(output)) throw new Error('Output already exists; refusing to overwrite evidence.');
dotenv.config({ path: arg('--dotenv-path') || '.env' });
if (!process.env.MONGODB_URI) throw new Error('Database connection unavailable.');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const counts = {};
const count = key => { counts[key] = (counts[key] || 0) + 1; };
let db;

async function inspect(tenant, session = undefined) {
  const opts = { session };
  const stays = await db.collection('stays').find({ tenantId: tenant._id, status: { $in: ['active', 'ending_soon'] } }, opts).sort({ leaseStartDate: -1 }).limit(2).toArray();
  if (stays.length !== 1) return { plan: { status: 'review', reason: 'missing_or_ambiguous_active_stay' } };
  const stay = stays[0];
  const contracts = await db.collection('contracts').find({ tenantId: tenant._id }, opts).toArray();
  let contract;
  try { contract = selectCanonicalTenantContract({ contracts, activeStay: stay, strictIntegrityCheck: true }); }
  catch { return { plan: { status: 'review', reason: 'ambiguous_current_contract' } }; }
  const reservation = await db.collection('reservations').findOne({ _id: stay.reservationId }, opts);
  const room = await db.collection('rooms').findOne({ _id: stay.roomId }, { ...opts, projection: { _id: 1 } });
  const preliminary = planStayContractDateRepair({ tenant, stays, contract, reservation, roomExists: Boolean(room) });
  if (preliminary.status !== 'repair') return { plan: preliminary, stay, contract, blockers: [] };
  const open = [
    ['stayextensionrequests', { tenantId: tenant._id, status: { $in: ['pending', 'approved'] } }],
    ['tenanttransferrequests', { tenantId: tenant._id, status: { $in: ['pending', 'scheduling', 'scheduled'] } }],
    ['scheduledroomtransfers', { tenantId: tenant._id, status: { $nin: ['completed', 'cancelled', 'rejected', 'failed'] }, isArchived: { $ne: true } }],
    ['moveoutclearances', { reservationId: stay.reservationId }],
    ['terminationreviews', { reservationId: stay.reservationId, $or: [{ status: { $in: ['open', 'under_review', 'pending_response'] } }, { executionStatus: 'pending_execution' }] }],
    ['leaserenewals', { reservationId: stay.reservationId, status: { $in: ['draft', 'pending_approval', 'approved', 'tenant_notified', 'tenant_acknowledged'] }, isArchived: { $ne: true } }],
    ['stays', { previousStayId: stay._id, status: { $nin: ['cancelled', 'terminated'] } }],
  ];
  if (contract) open.push(['contracts', { replacesContractId: contract._id, status: { $nin: ['cancelled', 'voided', 'rejected', 'archived', 'replaced', 'expired', 'terminated'] }, archivedAt: null }]);
  const blockers = [];
  // Deliberately sequential: transactions do not support parallel operations.
  for (const [collection, filter] of open) if (await db.collection(collection).findOne(filter, { ...opts, projection: { _id: 1 } })) blockers.push(collection);
  if (reservation?.renewalOffers?.some(offer => offer.status === 'pending')) blockers.push('renewal_offer');
  const plan = planStayContractDateRepair({ tenant, stays, contract, reservation, roomExists: Boolean(room), blockers });
  return { plan, stay, contract, blockers };
}

try {
  await client.connect(); db = client.db();
  if (db.databaseName !== expectedDb) throw new Error('Database name does not match --expected-db.');
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  if (!apply) {
    const repairs = [], review = [];
    for await (const tenant of db.collection('users').find({ role: 'tenant', tenantStatus: 'active' }, { projection: { _id: 1, role: 1, tenantStatus: 1 } })) {
      const { plan, blockers = [] } = await inspect(tenant);
      count(plan.status === 'review' ? plan.reason : plan.status);
      if (plan.status === 'repair') repairs.push(plan);
      if (plan.status === 'review') review.push({ tenantId: String(tenant._id), reason: plan.reason, blockers });
    }
    const report = { mode: 'dry-run', database: db.databaseName, generatedAt: new Date(), counts, repairs, review };
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ database: db.databaseName, counts, repairs, report: path.resolve(output) }, null, 2));
  } else {
    const raw = fs.readFileSync(planPath, 'utf8');
    const reviewed = JSON.parse(raw);
    if (reviewed.mode !== 'dry-run' || reviewed.database !== expectedDb || !Array.isArray(reviewed.repairs)) throw new Error('Invalid reviewed plan.');
    const runId = crypto.randomUUID();
    const evidence = { mode: 'apply', runId, database: expectedDb, planSha256: crypto.createHash('sha256').update(raw).digest('hex'), records: [] };
    // Before-image persisted before any writes. Outcomes append to a separate journal.
    for (const expected of reviewed.repairs) {
      const tenant = await db.collection('users').findOne({ _id: new ObjectId(expected.tenantId) }, { projection: { _id: 1, role: 1, tenantStatus: 1 } });
      const context = await inspect(tenant);
      if (JSON.stringify(context.plan) !== JSON.stringify(expected)) throw new Error(`Plan stale for Stay ${expected.stayId}; regenerate and review.`);
      evidence.records.push({ plan: expected, before: context.stay });
    }
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
    const journal = `${output}.outcomes.jsonl`;
    const fd = fs.openSync(journal, 'wx', 0o600);
    try {
      for (const expected of reviewed.repairs) {
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            const tenant = await db.collection('users').findOne({ _id: new ObjectId(expected.tenantId) }, { session, projection: { _id: 1, role: 1, tenantStatus: 1 } });
            const context = await inspect(tenant, session);
            if (JSON.stringify(context.plan) !== JSON.stringify(expected)) throw new Error(`Plan changed for Stay ${expected.stayId}; no write.`);
            const result = await db.collection('stays').updateOne({ _id: new ObjectId(expected.stayId), leaseEndDate: new Date(expected.oldEndDate), updatedAt: expected.stayUpdatedAt ? new Date(expected.stayUpdatedAt) : null },
              { $set: { leaseEndDate: new Date(expected.newEndDate), updatedAt: new Date() } }, { session });
            if (result.modifiedCount !== 1) throw new Error('Stay changed concurrently; repair aborted.');
          }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          fs.writeSync(fd, JSON.stringify({ stayId: expected.stayId, result: 'repaired', at: new Date() }) + '\n');
          count('repaired');
        } finally { await session.endSession(); }
      }
    } finally { fs.closeSync(fd); }
    console.log(JSON.stringify({ runId, counts, backup: path.resolve(output), journal: path.resolve(journal) }, null, 2));
  }
} finally { await client.close(); }
