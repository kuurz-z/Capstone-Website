/** Index-only repair. Never imports application models or modifies documents.
 * Usage: node scripts/migrate_rent_bill_cycle_index.mjs --manifest <review.json>
 *   --database <expected-name> --evidence <new-output.json> [--apply]
 * Manifest: {database, groups:[{classification:'C', action:'preserve-both',
 *   evidence:'review explanation', bills:[{id,sha256},{id,sha256}]}]}.
 * Review evidence and hashes must come from a prior read-only audit.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { RENT_BILL_CYCLE_INDEX as spec } from '../services/billing/rentBillCycleIndex.js';

export const billHash = bill => createHash('sha256').update(JSON.stringify(bill)).digest('hex');
const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
export const matchesIndex = index => Boolean(index && index.name === spec.name && index.unique === true
  && JSON.stringify(index.key) === JSON.stringify(spec.key) && !index.sparse && !index.hidden
  && !index.collation && canonical(index.partialFilterExpression) === canonical(spec.partialFilterExpression));

export async function inspect(db, manifest) {
  const blockers = [];
  const groups = Array.isArray(manifest.groups) ? manifest.groups : [];
  if (manifest.database !== db.databaseName || !groups.length) blockers.push('Database mismatch or empty review');
  const entries = groups.flatMap(g => g.bills || []);
  const ids = entries.map(b => b.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !/^[a-f0-9]{24}$/.test(id))) {
    throw new Error('Review must contain distinct explicit ObjectIds');
  }
  const bills = await db.collection('bills').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }).toArray();
  const hashes = Object.fromEntries(bills.map(b => [String(b._id), billHash(b)]));
  for (const entry of entries) if (hashes[entry.id] !== entry.sha256) blockers.push(`Audited state changed/missing: ${entry.id}`);
  const summaries = groups.map((g, i) => {
    const docs = (g.bills || []).map(b => bills.find(d => String(d._id) === b.id)).filter(Boolean);
    const rent = docs.filter(b => b.billType === 'monthly' && b.charges?.rent > 0 && !b.parentInvoiceId && b.isArchived === false);
    const legacy = docs.filter(b => b.billType === 'monthly' && b.charges?.rent === 0 && b.isArchived === false
      && (b.utilityDispatch?.electricity?.periodId || b.utilityDispatch?.water?.periodId || b.utilityCycleStart));
    const sameCycle = docs.length === 2 && String(docs[0].reservationId) === String(docs[1].reservationId)
      && docs[0].billingCycleStart instanceof Date && docs[1].billingCycleStart instanceof Date
      && +docs[0].billingCycleStart === +docs[1].billingCycleStart;
    if (!['B', 'C'].includes(g.classification) || g.action !== 'preserve-both' || !g.evidence?.trim()
      || !sameCycle || rent.length !== 1 || legacy.length !== 1) blockers.push(`Group ${i + 1}: manual review required`);
    if (docs.length === 2 && docs.every(b => b.paidAmount > 0 || ['paid', 'partially-paid'].includes(b.status)
      || b.paymongoPaymentId)) blockers.push(`Group ${i + 1}: both bills have payment history; manual financial review required`);
    return { group: i + 1, bills: (g.bills || []).map(b => b.id), classification: g.classification,
      action: 'Preserve every bill and downstream reference unchanged', evidence: g.evidence };
  });
  const indexes = await db.collection('bills').listIndexes().toArray();
  const existing = indexes.find(i => i.name === spec.name);
  if (existing && !matchesIndex(existing)) blockers.push('Existing index name has different options; no drop permitted');
  if (!existing && indexes.some(i => JSON.stringify(i.key) === JSON.stringify(spec.key))) blockers.push('Same key exists under another name; review required');
  const duplicates = await db.collection('bills').aggregate([
    { $match: spec.partialFilterExpression },
    { $group: { _id: { reservationId: '$reservationId', cycle: '$billingCycleStart' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  if (duplicates.length) blockers.push(`${duplicates.length} actual rent-cycle duplicate groups require manual review`);
  return { recordsDetected: bills.length, recordsChanged: 0, recordsSkipped: bills.length, groups: summaries,
    blockers, duplicates, hashes, indexes, existingExact: matchesIndex(existing),
    totalBills: await db.collection('bills').countDocuments({}), intendedIndex: spec };
}

export async function reconcile(db, manifest, { apply = false, saveEvidence } = {}) {
  const before = await inspect(db, manifest);
  const result = { mode: apply ? 'apply' : 'dry-run', before, action: 'none', after: null };
  if (!apply || before.blockers.length) return result;
  if (typeof saveEvidence !== 'function') throw new Error('Apply requires durable before-state evidence');
  // The backup contains hashes/index definitions, never credentials or payment payloads.
  // There are no document mutations to reverse; an index rollback needs separate review.
  await saveEvidence({ phase: 'before', manifest, result });
  const checked = await inspect(db, manifest);
  if (checked.blockers.length) throw new Error(`Precondition failed: ${checked.blockers.join('; ')}`);
  if (!checked.existingExact) {
    await db.collection('bills').createIndex(spec.key, {
      name: spec.name, unique: true, partialFilterExpression: spec.partialFilterExpression,
    });
    result.action = 'created-index';
  } else result.action = 'already-exact-no-op';
  result.after = await inspect(db, manifest);
  if (!result.after.existingExact || result.after.blockers.length) {
    await saveEvidence({ phase: 'verification-failed', result });
    throw new Error('Postcondition failed; index may exist. Review evidence; do not drop or overwrite data.');
  }
  await saveEvidence({ phase: 'after', result });
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (['--manifest', '--database', '--evidence'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw new Error('Unknown/incomplete argument; require --manifest, --database, --evidence, optional --apply');
  }
  if (!options.manifest || !options.database || !options.evidence) throw new Error('Require --manifest, --database and new --evidence path');
  const manifest = JSON.parse((await readFile(options.manifest, 'utf8')).replace(/^\uFEFF/, ''));
  if (manifest.database !== options.database) throw new Error('Manifest database does not match explicit target');
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const client = new MongoClient(process.env.MONGODB_URI, { appName: 'ReviewedRentCycleIndexRepair', serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db();
    if (db.databaseName !== options.database) throw new Error('Configured database does not match explicit target');
    let sequence = 0;
    const saveEvidence = async data => writeFile(`${options.evidence}.${sequence++}.json`, JSON.stringify({ recordedAt: new Date(), ...data }, null, 2), { flag: 'wx' });
    const result = await reconcile(db, manifest, { apply: options.apply, saveEvidence });
    await saveEvidence({ phase: 'result', result });
    console.log(JSON.stringify(result, null, 2));
    if (result.before.blockers.length) process.exitCode = 2;
  } finally { await client.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
