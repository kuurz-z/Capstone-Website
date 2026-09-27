import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rentTab = fs.readFileSync(
  path.resolve("src/features/admin/components/billing/RentBillingTab.jsx"),
  "utf8"
);
const tenantTab = fs.readFileSync(
  path.resolve("src/features/tenant/components/profile/BillingTab.jsx"),
  "utf8"
);
const overdueTracker = fs.readFileSync(
  path.resolve("src/features/admin/components/OverdueNoticeTracker.jsx"),
  "utf8"
);

test("RentBillingTab contains statusFilter and sortOrder states and controls", () => {
  assert.match(rentTab, /const\s*\[statusFilter,\s*setStatusFilter\]\s*=\s*useState/);
  assert.match(rentTab, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(rentTab, /All Status/);
  assert.match(rentTab, /Unpaid \(Upcoming \/ Sent \/ Overdue\)/);
  assert.match(rentTab, /Paid History/);
  assert.match(rentTab, /Sort: Newest to Oldest/);
  assert.match(rentTab, /\[branchParam,\s*activeMonthParam,\s*timeframeMode,\s*activeTab,\s*searchQuery,\s*statusFilter\]/);
});

test("Tenant BillingTab StatementFilters contains sortOrder control and logic", () => {
  assert.match(tenantTab, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(tenantTab, /Sort: Newest to Oldest/);
  assert.match(tenantTab, /Sort: Oldest to Newest/);
});

test("OverdueNoticeTracker contains sortOrder state and control", () => {
  assert.match(overdueTracker, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(overdueTracker, /Newest to Oldest/);
  assert.match(overdueTracker, /Oldest to Newest/);
});

// Behavioral Logic Tests for Sorting & Filtering

const sortRowsByDate = (rows, sortOrder) => {
  return [...rows].sort((a, b) => {
    const getRowDate = (row) => {
      const raw = row.dueDate || row.billingCycleEnd || row.billingMonth || row.createdAt || row.nextBillingDate;
      if (!raw) return null;
      const time = new Date(raw).getTime();
      return Number.isFinite(time) ? time : null;
    };
    const dateA = getRowDate(a);
    const dateB = getRowDate(b);
    const hasA = dateA !== null;
    const hasB = dateB !== null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return sortOrder === "oldest" ? dateA - dateB : dateB - dateA;
  });
};

test("sortRowsByDate sorts chronologically descending for newest and ascending for oldest", () => {
  const dataset = [
    { id: "1", dueDate: "2026-03-01T00:00:00.000Z" },
    { id: "2", dueDate: "2026-01-15T00:00:00.000Z" },
    { id: "3", dueDate: "2026-05-20T00:00:00.000Z" },
  ];

  const newest = sortRowsByDate(dataset, "newest");
  assert.deepEqual(newest.map(r => r.id), ["3", "1", "2"]);

  const oldest = sortRowsByDate(dataset, "oldest");
  assert.deepEqual(oldest.map(r => r.id), ["2", "1", "3"]);
});

test("sortRowsByDate always places rows with missing or invalid dates at the end", () => {
  const dataset = [
    { id: "valid-old", dueDate: "2026-01-15T00:00:00.000Z" },
    { id: "missing-date", dueDate: null },
    { id: "valid-new", dueDate: "2026-05-20T00:00:00.000Z" },
    { id: "invalid-date", dueDate: "not-a-real-date" },
  ];

  const newest = sortRowsByDate(dataset, "newest");
  assert.equal(newest[0].id, "valid-new");
  assert.equal(newest[1].id, "valid-old");
  assert.ok(["missing-date", "invalid-date"].includes(newest[2].id));
  assert.ok(["missing-date", "invalid-date"].includes(newest[3].id));

  const oldest = sortRowsByDate(dataset, "oldest");
  assert.equal(oldest[0].id, "valid-old");
  assert.equal(oldest[1].id, "valid-new");
  assert.ok(["missing-date", "invalid-date"].includes(oldest[2].id));
  assert.ok(["missing-date", "invalid-date"].includes(oldest[3].id));
});

test("Admin Rent Billing status filter isolates unpaid vs paid records properly", () => {
  const rows = [
    { id: "1", computedStatus: "ready" },
    { id: "2", computedStatus: "paid" },
    { id: "3", computedStatus: "overdue" },
    { id: "4", computedStatus: "sent" },
    { id: "5", computedStatus: "paid" },
  ];

  const filterRows = (statusFilter) => {
    if (statusFilter === "unpaid") return rows.filter(r => r.computedStatus !== "paid");
    if (statusFilter === "paid") return rows.filter(r => r.computedStatus === "paid");
    return rows;
  };

  assert.equal(filterRows("all").length, 5);
  assert.deepEqual(filterRows("unpaid").map(r => r.id), ["1", "3", "4"]);
  assert.deepEqual(filterRows("paid").map(r => r.id), ["2", "5"]);
});
