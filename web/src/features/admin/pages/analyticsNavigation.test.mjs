import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyticsSummaryHref,
  buildAnalyticsDetailsHref,
  getAllowedAnalyticsTabs,
  LEGACY_ANALYTICS_REDIRECTS,
  normalizeAnalyticsSummaryState,
  normalizeAnalyticsState,
} from "./analyticsNavigation.mjs";

test("branch admins only get branch-safe tabs", () => {
  assert.deepEqual(getAllowedAnalyticsTabs(false), [
    "occupancy",
    "billing",
    "operations",
  ]);
});

test("owners get owner-only tabs", () => {
  assert.deepEqual(getAllowedAnalyticsTabs(true), [
    "occupancy",
    "billing",
    "operations",
    "consolidated",
    "financials",
    "monitoring",
  ]);
});

test("detailed analytics defaults to occupancy when no tab is provided", () => {
  const state = normalizeAnalyticsState({
    requestedTab: null,
    requestedRange: null,
    requestedBranch: null,
    isOwner: false,
    userBranch: "gil-puyat",
  });

  assert.equal(state.activeTab, "occupancy");
  assert.equal(state.range, "30d");
  assert.equal(state.branch, "gil-puyat");
});

test("invalid branch-admin tab falls back to occupancy", () => {
  const state = normalizeAnalyticsState({
    requestedTab: "financials",
    requestedRange: "3m",
    requestedBranch: "all",
    isOwner: false,
    userBranch: "guadalupe",
  });

  assert.equal(state.activeTab, "occupancy");
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

test("summary state keeps short day ranges and owner branch filters", () => {
  const state = normalizeAnalyticsSummaryState({
    requestedRange: "60d",
    requestedBranch: "guadalupe",
    isOwner: true,
  });

  assert.equal(state.range, "60d");
  assert.equal(state.branch, "guadalupe");
});

test("summary detail links map short summary ranges to valid detailed billing ranges", () => {
  const href = buildAnalyticsDetailsHref({
    tab: "billing",
    range: "90d",
    branch: "all",
    isOwner: true,
  });

  assert.equal(href, "/admin/analytics/details?tab=billing&range=12m&branch=all");
});

test("detail summary links map month ranges back to summary-safe day ranges", () => {
  const href = buildAnalyticsSummaryHref({
    range: "12m",
    branch: "all",
    isOwner: true,
  });

  assert.equal(href, "/admin/analytics?range=90d&branch=all");
});

test("legacy redirects point to the detailed analytics workspace", () => {
  assert.deepEqual(LEGACY_ANALYTICS_REDIRECTS, {
    occupancy: "/admin/analytics/details?tab=occupancy",
    billing: "/admin/analytics/details?tab=billing",
    operations: "/admin/analytics/details?tab=operations",
    financials: "/admin/analytics/details?tab=financials",
    monitoring: "/admin/analytics/details?tab=monitoring",
  });
});
