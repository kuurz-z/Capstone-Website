import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tenantRoot = resolve(__dirname, "../..");

const readTenantSource = (relativePath) =>
  readFileSync(resolve(tenantRoot, relativePath), "utf8");

test("ActivityHistoryTab imports and integrates Pagination and SkeletonPulse", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes('import Pagination from "../../../../shared/components/Pagination";'),
    true,
    "ActivityHistoryTab must import the shared Pagination component",
  );
  assert.equal(
    source.includes('import SkeletonPulse from "../../../../shared/components/SkeletonPulse";'),
    true,
    "ActivityHistoryTab must import SkeletonPulse for loading skeleton states",
  );
  assert.equal(
    source.includes("ReservationCardSkeleton"),
    true,
    "ActivityHistoryTab must include ReservationCardSkeleton component",
  );
});

test("ActivityHistoryTab has 10 items default per page and expands first item", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes("useState(10)"),
    true,
    "Default itemsPerPage must be initialized to 10",
  );
  assert.equal(
    source.includes("pageSizeOptions={[10, 20, 50]}"),
    true,
    "Pagination must provide [10, 20, 50] selector options",
  );
  assert.equal(
    source.includes("paginatedReservations[0]._id"),
    true,
    "First item on the active page must be automatically expanded",
  );
});

test("ActivityHistoryTab handles loading skeleton state", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes("isLoading = false"),
    true,
    "ActivityHistoryTab must accept an isLoading prop",
  );
  assert.equal(
    source.includes("aria-busy=\"true\""),
    true,
    "Loading skeleton container must specify aria-busy",
  );
});

test("ProfilePage passes isLoading to ActivityHistoryTab", () => {
  const profilePageSource = readTenantSource("pages/ProfilePage.jsx");

  assert.equal(
    profilePageSource.includes("isLoading={reservationsLoading}"),
    true,
    "ProfilePage must forward reservationsLoading to ActivityHistoryTab",
  );
});

test("ActivityHistoryTab renders tenant-centric KPI summary cards instead of admin stats", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes('label: "Active Stay"'),
    true,
    "KPI card for Active Stay must be present",
  );
  assert.equal(
    source.includes('label: "Room Viewings"'),
    true,
    "KPI card for Room Viewings must be present",
  );
  assert.equal(
    source.includes('label: "Completed Stays"'),
    true,
    "KPI card for Completed Stays must be present",
  );
  assert.equal(
    source.includes('label: "Member Since"'),
    true,
    "KPI card for Member Since must be present",
  );
  assert.equal(
    source.includes('"Total Reservations"'),
    false,
    "Admin stat 'Total Reservations' must not be used in tenant view",
  );
});

test("ActivityHistoryTab styles Moved In status and milestone with Success Green tokens", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes('hasReservationStatus(s, "moveIn")) return { color: "#059669", bg: "#DCFCE7", label: "Move In" };'),
    true,
    "Move In status badge must use Success Green (#059669 on #DCFCE7)",
  );
  assert.equal(
    source.includes('status: "Official Tenant", statusColor: "#059669", statusBg: "#DCFCE7"'),
    true,
    "Official Tenant timeline milestone must use Success Green (#059669 on #DCFCE7)",
  );
});

test("ActivityHistoryTab integrates Current Stay and RoomTransferRequestPanel", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes("RoomTransferRequestPanel"),
    true,
    "ActivityHistoryTab must import and render RoomTransferRequestPanel",
  );
  assert.equal(
    source.includes("CurrentStayCard"),
    true,
    "ActivityHistoryTab must include CurrentStayCard component",
  );
  assert.equal(
    source.includes("Current Stay"),
    true,
    "Current Stay section header must be present",
  );
});

test("ActivityHistoryTab provides segmented filter tabs for All, Completed, and Cancelled", () => {
  const source = readTenantSource("components/profile/ActivityHistoryTab.jsx");

  assert.equal(
    source.includes("All Records"),
    true,
    "Filter tab for All Records must be present",
  );
  assert.equal(
    source.includes("Completed Stays"),
    true,
    "Filter tab for Completed Stays must be present",
  );
  assert.equal(
    source.includes("Cancelled"),
    true,
    "Filter tab for Cancelled must be present",
  );
  assert.equal(
    source.includes("historyFilter"),
    true,
    "historyFilter state must be present",
  );
});

