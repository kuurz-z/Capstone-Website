import test from "node:test";
import assert from "node:assert/strict";
import {
  getAllowedAnalyticsTabs,
  normalizeAnalyticsState,
} from "./analyticsNavigation.mjs";

test("branch admins only get branch-safe tabs", () => {
  assert.deepEqual(getAllowedAnalyticsTabs(false), [
    "overview",
    "occupancy",
    "billing",
    "operations",
  ]);
});

test("owners get owner-only tabs", () => {
  assert.deepEqual(getAllowedAnalyticsTabs(true), [
    "overview",
    "occupancy",
    "billing",
    "operations",
    "financials",
    "monitoring",
  ]);
});

test("invalid branch-admin tab falls back to overview", () => {
  const state = normalizeAnalyticsState({
    requestedTab: "financials",
    requestedRange: "3m",
    requestedBranch: "all",
    isOwner: false,
    userBranch: "guadalupe",
  });

  assert.equal(state.activeTab, "overview");
  assert.equal(state.range, "30d");
  assert.equal(state.branch, "guadalupe");
});

test("owner invalid branch falls back to all", () => {
  const state = normalizeAnalyticsState({
    requestedTab: "monitoring",
    requestedRange: "60d",
    requestedBranch: "invalid-branch",
    isOwner: true,
  });

  assert.equal(state.activeTab, "monitoring");
  assert.equal(state.range, "60d");
  assert.equal(state.branch, "all");
});

test("billing range is normalized to allowed month ranges", () => {
  const state = normalizeAnalyticsState({
    requestedTab: "billing",
    requestedRange: "30d",
    requestedBranch: "all",
    isOwner: true,
  });

  assert.equal(state.activeTab, "billing");
  assert.equal(state.range, "3m");
});
