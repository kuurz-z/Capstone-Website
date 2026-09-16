import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./reconcile_stay_contract_dates.mjs', import.meta.url));
describe('reviewed Stay date repair CLI', () => {
  let mongo, client, db, directory, sequence = 0;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    client = new MongoClient(mongo.getUri('repair_test'));
    await client.connect(); db = client.db();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stay-date-repair-test-'));
  }, 120000);
  afterAll(async () => { await client?.close(); await mongo?.stop(); await fs.rm(directory, { recursive: true, force: true }); }, 120000);
  beforeEach(async () => { await db.dropDatabase(); });
  const output = () => path.join(directory, `evidence-${++sequence}.json`);
  const run = (...args) => execute(process.execPath, [script, '--dotenv-path', path.join(directory, 'absent.env'), '--expected-db', 'repair_test', ...args], {
    env: { ...process.env, MONGODB_URI: mongo.getUri('repair_test') }, timeout: 60000,
  });
  async function seed() {
    const tenantId = new ObjectId(), stayId = new ObjectId(), reservationId = new ObjectId(), roomId = new ObjectId(), contractId = new ObjectId();
    const start = new Date('2026-08-24T16:00:00Z'), end = new Date('2099-02-24T16:00:00Z');
    const contract = { _id: contractId, tenantId, reservationId, roomId, isCurrent: true, isCanonical: true, status: 'published',
      leaseStartDate: start, leaseEndDate: end, leaseDurationMonths: 870, updatedAt: new Date() };
    await db.collection('users').insertOne({ _id: tenantId, role: 'tenant', tenantStatus: 'active' });
    await db.collection('rooms').insertOne({ _id: roomId });
    await db.collection('reservations').insertOne({ _id: reservationId, userId: tenantId, roomId, currentStayId: stayId, status: 'moveIn' });
    await db.collection('stays').insertOne({ _id: stayId, tenantId, reservationId, roomId, status: 'active', leaseStartDate: start,
      leaseEndDate: new Date('2099-02-28T00:00:00Z'), updatedAt: new Date() });
    await db.collection('contracts').insertOne(contract);
    return { stayId, reservationId, contract };
  }
  test('dry-run never writes; apply backs up and changes only Stay end; repeat is empty', async () => {
    const f = await seed(), plan = output(), backup = output();
    const before = await db.collection('stays').findOne({ _id: f.stayId });
    await run('--output', plan);
    expect(await db.collection('stays').findOne({ _id: f.stayId })).toEqual(before);
    const report = JSON.parse(await fs.readFile(plan, 'utf8'));
    expect(report.repairs).toHaveLength(1);
    await run('--apply', '--plan', plan, '--output', backup);
    expect(JSON.parse(await fs.readFile(backup, 'utf8')).records[0].before.leaseEndDate).toBe(before.leaseEndDate.toISOString());
    const after = await db.collection('stays').findOne({ _id: f.stayId });
    expect(after.leaseEndDate).toEqual(f.contract.leaseEndDate);
    expect({ ...after, updatedAt: before.updatedAt, leaseEndDate: before.leaseEndDate }).toEqual(before);
    expect(await db.collection('contracts').findOne({ _id: f.contract._id })).toEqual(f.contract);
    const repeat = output(); await run('--output', repeat);
    expect(JSON.parse(await fs.readFile(repeat, 'utf8')).repairs).toEqual([]);
  }, 90000);
  test('a stale reviewed plan fails without overwriting a newer Stay', async () => {
    const f = await seed(), plan = output(); await run('--output', plan);
    const edited = new Date('2099-03-01T00:00:00Z');
    await db.collection('stays').updateOne({ _id: f.stayId }, { $set: { leaseEndDate: edited } });
    await expect(run('--apply', '--plan', plan, '--output', output())).rejects.toThrow();
    expect((await db.collection('stays').findOne({ _id: f.stayId })).leaseEndDate).toEqual(edited);
  }, 90000);
  test('pending renewal offers remain untouched and require review', async () => {
    const f = await seed(), plan = output();
    await db.collection('reservations').updateOne({ _id: f.reservationId }, { $set: { renewalOffers: [{ status: 'pending' }] } });
    await run('--output', plan);
    const report = JSON.parse(await fs.readFile(plan, 'utf8'));
    expect(report.repairs).toEqual([]);
    expect(report.review[0]).toMatchObject({ reason: 'open_workflow', blockers: ['renewal_offer'] });
  }, 90000);
});
