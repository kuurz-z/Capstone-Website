export const BASE_ANALYTICS_TABS = ["overview", "occupancy", "billing", "operations"];
export const OWNER_ANALYTICS_TABS = ["financials", "monitoring"];
export const TAB_RANGE_OPTIONS = {
  overview: ["30d", "60d", "90d"],
  occupancy: ["30d", "60d", "90d"],
  billing: ["3m", "6m", "12m"],
  operations: ["30d", "60d", "90d"],
  financials: ["3m", "6m", "12m"],
  monitoring: ["30d", "60d", "90d"],
};
export const OWNER_BRANCH_OPTIONS = ["all", "gil-puyat", "guadalupe"];

export function getAllowedAnalyticsTabs(isOwner) {
  return isOwner
    ? [...BASE_ANALYTICS_TABS, ...OWNER_ANALYTICS_TABS]
    : [...BASE_ANALYTICS_TABS];
}

export function normalizeAnalyticsState({
  requestedTab,
  requestedRange,
  requestedBranch,
  isOwner,
  userBranch = "gil-puyat",
}) {
  const allowedTabs = getAllowedAnalyticsTabs(isOwner);
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : "overview";
  const allowedRanges = TAB_RANGE_OPTIONS[activeTab] || TAB_RANGE_OPTIONS.overview;
  const range = allowedRanges.includes(requestedRange)
    ? requestedRange
    : allowedRanges[0];

  const branch = isOwner
    ? OWNER_BRANCH_OPTIONS.includes(requestedBranch)
      ? requestedBranch
      : "all"
    : userBranch || "gil-puyat";

  return {
    activeTab,
    range,
    branch,
    allowedTabs,
    allowedRanges,
  };
}
