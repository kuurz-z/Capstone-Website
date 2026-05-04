export const ANALYTICS_SUMMARY_PATH = "/admin/analytics";
export const ANALYTICS_DETAILS_PATH = "/admin/analytics/details";

export const ANALYTICS_SUMMARY_RANGES = ["30d", "60d", "90d"];
export const BASE_ANALYTICS_TABS = ["occupancy", "billing", "operations"];
export const OWNER_ANALYTICS_TABS = ["financials", "monitoring"];
export const TAB_RANGE_OPTIONS = {
  occupancy: ["30d", "60d", "90d"],
  billing: ["3m", "6m", "12m"],
  operations: ["30d", "60d", "90d"],
  financials: ["3m", "6m", "12m"],
  monitoring: ["30d", "60d", "90d"],
};
export const OWNER_BRANCH_OPTIONS = ["all", "gil-puyat", "guadalupe"];
export const SUMMARY_TO_MONTH_RANGE = {
  "30d": "3m",
  "60d": "6m",
  "90d": "12m",
};
export const MONTH_TO_SUMMARY_RANGE = {
  "3m": "30d",
  "6m": "60d",
  "12m": "90d",
};
export const LEGACY_ANALYTICS_REDIRECTS = Object.freeze({
  occupancy: `${ANALYTICS_DETAILS_PATH}?tab=occupancy`,
  billing: `${ANALYTICS_DETAILS_PATH}?tab=billing`,
  operations: `${ANALYTICS_DETAILS_PATH}?tab=operations`,
  financials: `${ANALYTICS_DETAILS_PATH}?tab=financials`,
  monitoring: `${ANALYTICS_DETAILS_PATH}?tab=monitoring`,
});

export function getAllowedAnalyticsTabs(isOwner) {
  return isOwner
    ? [...BASE_ANALYTICS_TABS, ...OWNER_ANALYTICS_TABS]
    : [...BASE_ANALYTICS_TABS];
}

export function getAllowedSummaryRanges() {
  return [...ANALYTICS_SUMMARY_RANGES];
}

export function getAnalyticsDetailsRange(tab, requestedRange) {
  const allowedRanges = TAB_RANGE_OPTIONS[tab] || TAB_RANGE_OPTIONS.occupancy;
  return allowedRanges.includes(requestedRange)
    ? requestedRange
    : allowedRanges[0];
}

export function getSummaryDetailRange(tab, summaryRange) {
  if (tab === "billing" || tab === "financials") {
    return SUMMARY_TO_MONTH_RANGE[summaryRange] || SUMMARY_TO_MONTH_RANGE["30d"];
  }

  return getAnalyticsDetailsRange(tab, summaryRange);
}

export function normalizeAnalyticsSummaryState({
  requestedRange,
  requestedBranch,
  isOwner,
  userBranch = "gil-puyat",
}) {
  const range = ANALYTICS_SUMMARY_RANGES.includes(requestedRange)
    ? requestedRange
    : ANALYTICS_SUMMARY_RANGES[0];

  const branch = isOwner
    ? OWNER_BRANCH_OPTIONS.includes(requestedBranch)
      ? requestedBranch
      : "all"
    : userBranch || "gil-puyat";

  return {
    range,
    branch,
    allowedRanges: getAllowedSummaryRanges(),
  };
}

export function normalizeAnalyticsState({
  requestedTab,
  requestedRange,
  requestedBranch,
  isOwner,
  userBranch = "gil-puyat",
}) {
  const allowedTabs = getAllowedAnalyticsTabs(isOwner);
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : allowedTabs[0];
  const allowedRanges = TAB_RANGE_OPTIONS[activeTab] || TAB_RANGE_OPTIONS.occupancy;
  const range = getAnalyticsDetailsRange(activeTab, requestedRange);

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

export function buildAnalyticsDetailsHref({
  tab = BASE_ANALYTICS_TABS[0],
  range = ANALYTICS_SUMMARY_RANGES[0],
  branch,
  isOwner = false,
}) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("range", getSummaryDetailRange(tab, range));

  if (isOwner && branch) {
    params.set("branch", branch);
  }

  return `${ANALYTICS_DETAILS_PATH}?${params.toString()}`;
}

export function getDetailSummaryRange(range) {
  return MONTH_TO_SUMMARY_RANGE[range] || getAnalyticsDetailsRange("occupancy", range);
}

export function buildAnalyticsSummaryHref({
  range = ANALYTICS_SUMMARY_RANGES[0],
  branch,
  isOwner = false,
}) {
  const params = new URLSearchParams();
  params.set("range", getDetailSummaryRange(range));

  if (isOwner && branch) {
    params.set("branch", branch);
  }

  return `${ANALYTICS_SUMMARY_PATH}?${params.toString()}`;
}
