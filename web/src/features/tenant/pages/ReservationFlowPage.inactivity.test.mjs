import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Reservation API and reservation views integrate inactivity heartbeat and modal", () => {
  const apiFile = fs.readFileSync("src/shared/api/reservationApi.js", "utf8");
  assert.ok(apiFile.includes("sendHeartbeat"), "reservationApi must export sendHeartbeat");

  const flowPage = fs.readFileSync("src/features/tenant/pages/ReservationFlowPage.jsx", "utf8");
  assert.ok(flowPage.includes("useReservationInactivity"), "ReservationFlowPage must use useReservationInactivity");
  assert.ok(flowPage.includes("ReservationInactivityModal"), "ReservationFlowPage must render ReservationInactivityModal");

  const dashboard = fs.readFileSync("src/features/tenant/components/ReservationDashboard.jsx", "utf8");
  assert.ok(dashboard.includes("useReservationInactivity"), "ReservationDashboard must use useReservationInactivity");
  assert.ok(dashboard.includes("ReservationInactivityModal"), "ReservationDashboard must render ReservationInactivityModal");
});
