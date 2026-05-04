import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_TRAIL_TAB,
  SECURITY_SIGNALS_TAB,
  buildAuditExportFilters,
  buildAuditLogQueryParams,
  createDefaultAuditFilters,
  formatAuditBranch,
  formatAuditLabel,
  getAllowedAuditTabs,
  mapAuditSeverityToBadgeStatus,
  normalizeAuditTab,
} from "./auditLogPageConfig.mjs";

test("owners get both audit views while branch admins stay on audit trail", () => {
  assert.deepEqual(getAllowedAuditTabs(false), [AUDIT_TRAIL_TAB]);
  assert.deepEqual(getAllowedAuditTabs(true), [
    AUDIT_TRAIL_TAB,
    SECURITY_SIGNALS_TAB,
  ]);
  assert.equal(normalizeAuditTab(SECURITY_SIGNALS_TAB, false), AUDIT_TRAIL_TAB);
  assert.equal(normalizeAuditTab(SECURITY_SIGNALS_TAB, true), SECURITY_SIGNALS_TAB);
});

test("default audit filters start with a bounded recent date range", () => {
  const now = new Date("2026-04-20T09:00:00.000Z");
  const filters = createDefaultAuditFilters(now);

  assert.equal(filters.type, "all");
  assert.equal(filters.severity, "all");
  assert.equal(filters.branch, "all");
  assert.equal(filters.role, "all");
  assert.equal(filters.startDate, "2026-04-13");
  assert.equal(filters.endDate, "2026-04-20");
});

test("audit query params align with backend enums and preserve pagination inputs", () => {
  const params = buildAuditLogQueryParams(
    {
      type: "data_modification",
      severity: "high",
      branch: "gil-puyat",
      role: "branch_admin",
      user: " admin@example.com ",
      search: " permission change ",
      startDate: "2026-04-01",
      endDate: "2026-04-20",
    },
    { currentPage: 3, itemsPerPage: 25 },
  );

  assert.deepEqual(params, {
    type: "data_modification",
    severity: "high",
    branch: "gil-puyat",
    role: "branch_admin",
    user: "admin@example.com",
    search: "permission change",
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: "2026-04-20T23:59:59.999Z",
    limit: "25",
    offset: "50",
  });

  const exportFilters = buildAuditExportFilters({
    type: "login",
    severity: "warning",
    startDate: "2026-04-18",
    endDate: "2026-04-20",
  });

  assert.deepEqual(exportFilters, {
    type: "login",
    severity: "warning",
    startDate: "2026-04-18T00:00:00.000Z",
    endDate: "2026-04-20T23:59:59.999Z",
  });
});

test("audit labels and severity badges stay readable", () => {
  assert.equal(formatAuditLabel("data_modification"), "Data Modification");
  assert.equal(formatAuditBranch("general"), "General / System");
  assert.equal(formatAuditBranch("gil-puyat"), "Gil Puyat");
  assert.equal(mapAuditSeverityToBadgeStatus("high"), "overdue");
  assert.equal(mapAuditSeverityToBadgeStatus("critical"), "banned");
});
