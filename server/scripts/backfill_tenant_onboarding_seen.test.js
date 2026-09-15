import { jest } from '@jest/globals';
import {
  AUDIT_ACTION,
  parseCliArgs,
  runTenantOnboardingBackfill,
} from './backfill_tenant_onboarding_seen.mjs';

function cursorFor(documents) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const document of documents) yield document;
    },
  };
}

function harness(documents, { priorRun = null, auditFailure = null } = {}) {
  const users = documents.map((document) => ({ ...document }));
  const usersCollection = {
    find: jest.fn(() => cursorFor(users.filter((user) => user.tenant_onboarding_seen_at == null))),
    updateOne: jest.fn(async (filter, update) => {
      const user = users.find((candidate) => String(candidate._id) === String(filter._id));
      if (!user || user.tenant_onboarding_seen_at != null) return { modifiedCount: 0 };
      Object.assign(user, update.$set);
      return { modifiedCount: 1 };
    }),
  };
  const auditModel = {
    findOne: jest.fn(async () => priorRun),
    log: auditFailure
      ? jest.fn(async () => { throw auditFailure; })
      : jest.fn(async () => ({ logId: 'LOG-test' })),
  };
  return { users, usersCollection, auditModel };
}

const activeTenant = (id) => ({
  _id: id,
  user_id: 'user-' + id,
  role: 'tenant',
  tenantStatus: 'active',
  accountStatus: 'active',
  isActive: true,
  isArchived: false,
});

test('dry-run includes only canonical active tenants and performs zero writes', async () => {
  const setup = harness([
    activeTenant('active'),
    { ...activeTenant('applicant'), role: 'applicant', tenantStatus: 'applicant' },
    { ...activeTenant('inactive'), tenantStatus: 'inactive' },
    { ...activeTenant('admin'), role: 'branch_admin' },
    { ...activeTenant('suspended'), accountStatus: 'suspended' },
    { ...activeTenant('archived'), isArchived: true },
  ]);

  const result = await runTenantOnboardingBackfill({
    usersCollection: setup.usersCollection,
    auditModel: setup.auditModel,
  });

  expect(result).toEqual({
    scanned: 6,
    eligible: 1,
    modified: 0,
    skipped: 5,
    priorCompletedAudit: false,
  });
  expect(setup.usersCollection.updateOne).not.toHaveBeenCalled();
  expect(setup.auditModel.log).not.toHaveBeenCalled();
});

test('confirmed run writes only eligible users and records exact audit counts', async () => {
  const setup = harness([
    activeTenant('active'),
    { ...activeTenant('applicant'), role: 'applicant', tenantStatus: 'applicant' },
    { ...activeTenant('inactive'), tenantStatus: 'moved_out' },
  ]);
  const seenAt = new Date('2026-09-16T00:00:00Z');

  const result = await runTenantOnboardingBackfill({
    usersCollection: setup.usersCollection,
    auditModel: setup.auditModel,
    dryRun: false,
    seenAt,
  });

  expect(result).toEqual({
    scanned: 3,
    eligible: 1,
    modified: 1,
    skipped: 2,
    priorCompletedAudit: false,
  });
  expect(setup.users[0].tenant_onboarding_seen_at).toBe(seenAt);
  expect(setup.users[1].tenant_onboarding_seen_at).toBeUndefined();
  expect(setup.users[2].tenant_onboarding_seen_at).toBeUndefined();
  expect(setup.auditModel.log).toHaveBeenCalledWith(expect.objectContaining({
    action: AUDIT_ACTION,
    metadata: expect.objectContaining({
      status: 'completed', scanned: 3, eligible: 1, modified: 1, skipped: 2,
    }),
  }));
});

test('audit logging failure surfaces as a failed confirmed run', async () => {
  const setup = harness([activeTenant('active')], { auditFailure: new Error('audit unavailable') });
  await expect(runTenantOnboardingBackfill({
    usersCollection: setup.usersCollection,
    auditModel: setup.auditModel,
    dryRun: false,
  })).rejects.toThrow('audit unavailable');
});

test('completed audit blocks a second confirmed run before user writes', async () => {
  const setup = harness([activeTenant('active')], {
    priorRun: { timestamp: new Date('2026-09-15T00:00:00Z') },
  });
  await expect(runTenantOnboardingBackfill({
    usersCollection: setup.usersCollection,
    auditModel: setup.auditModel,
    dryRun: false,
  })).rejects.toThrow('already recorded');
  expect(setup.usersCollection.find).not.toHaveBeenCalled();
  expect(setup.usersCollection.updateOne).not.toHaveBeenCalled();
});

test('dry-run remains repeatable after a completed audit', async () => {
  const setup = harness([activeTenant('active')], {
    priorRun: { timestamp: new Date('2026-09-15T00:00:00Z') },
  });
  const first = await runTenantOnboardingBackfill(setup);
  const second = await runTenantOnboardingBackfill(setup);
  expect(first.priorCompletedAudit).toBe(true);
  expect(second).toEqual(first);
  expect(setup.usersCollection.updateOne).not.toHaveBeenCalled();
});

test('--force-rerun requires --confirm and explicitly permits a guarded repeat', async () => {
  expect(() => parseCliArgs(['--force-rerun'])).toThrow('requires --confirm');
  expect(parseCliArgs(['--confirm', '--force-rerun'])).toEqual({
    dryRun: false,
    forceRerun: true,
  });

  const setup = harness([activeTenant('active')], {
    priorRun: { timestamp: new Date('2026-09-15T00:00:00Z') },
  });
  const result = await runTenantOnboardingBackfill({
    usersCollection: setup.usersCollection,
    auditModel: setup.auditModel,
    dryRun: false,
    forceRerun: true,
  });
  expect(result.modified).toBe(1);
  expect(setup.auditModel.log).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({ forcedRerun: true }),
  }));
});
