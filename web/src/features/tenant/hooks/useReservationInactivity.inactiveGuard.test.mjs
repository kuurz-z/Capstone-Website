import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateInitialInactivityState } from "./useReservationInactivity.js";
import fs from "node:fs";

test("calculateInitialInactivityState never warns or expires when isActive is false", () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const state = calculateInitialInactivityState({
    reservationId: "res_confirmed_123",
    updatedAt: threeDaysAgo,
    isActive: false,
  });

  assert.equal(state.initialWarning, false, "Must not warn when reservation is not pending");
  assert.equal(state.isAlreadyExpired, false, "Must not expire when reservation is not pending");
  assert.equal(state.initialSeconds, 300, "Must reset seconds to full 5-minute countdown");
});

test("calculateInitialInactivityState never warns or expires when reservationId is missing", () => {
  const state = calculateInitialInactivityState({
    reservationId: null,
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    isActive: true,
  });

  assert.equal(state.initialWarning, false);
  assert.equal(state.isAlreadyExpired, false);
});

test("calculateInitialInactivityState calculates correct warning when isActive is true", () => {
  const now = Date.now();
  const twentySevenMinsAgo = new Date(now - 27 * 60 * 1000).toISOString();
  const state = calculateInitialInactivityState({
    reservationId: "res_draft_123",
    updatedAt: twentySevenMinsAgo,
    isActive: true,
    now,
  });

  assert.equal(state.initialWarning, true, "Must warn after 27 minutes on active pending reservation");
  assert.equal(state.isAlreadyExpired, false);
  assert.equal(state.initialSeconds, 180, "Must calculate remaining 3 minutes (180s)");
});

test("ReservationDashboard guards against confirmed or submitted applications", () => {
  const dashboardPath = "src/features/tenant/components/ReservationDashboard.jsx";
  const content = fs.readFileSync(dashboardPath, "utf8");

  assert.ok(
    content.includes("!hasSubmittedApplication(reservation)"),
    "ReservationDashboard must ensure hasSubmittedApplication disables hold timer"
  );
  assert.ok(
    content.includes("Boolean(reservation?._id)"),
    "ReservationDashboard must check reservation id presence"
  );
});
