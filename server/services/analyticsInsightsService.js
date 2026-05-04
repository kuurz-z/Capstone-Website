const MAX_FINDINGS = 4;
const MAX_ANOMALIES = 3;
const MAX_ACTIONS = 3;
const MAX_RISK_ALERTS = 4;
const MAX_FORECAST_HIGHLIGHTS = 3;
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_API_VERSION = "v1beta";
const GEMINI_TIMEOUT_MS = 12000;
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

const safePercent = (value) => `${Number(value || 0)}%`;

const safeMoney = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const round = (value, digits = 1) =>
  Number(Number(value || 0).toFixed(digits));

const pickTopBy = (rows, key, limit = 3) =>
  [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => Number(right?.[key] || 0) - Number(left?.[key] || 0))
    .slice(0, limit);

const tableRows = (table) => {
  if (Array.isArray(table)) return table;
  return Array.isArray(table?.rows) ? table.rows : [];
};

const buildSnapshotMeta = ({
  reportType,
  scope,
  filters,
  question,
  snapshot,
  provider,
  usedFallback,
  model = null,
  fallbackReason = null,
}) => ({
  reportType,
  source: "analytics-report-snapshot",
  provider,
  usedFallback,
  model,
  fallbackReason,
  branch: scope.branch,
  branchesIncluded: scope.branchesIncluded,
  filters,
  question: question || null,
  generatedAt: new Date().toISOString(),
  promptPreview: {
    reportType,
    scope: {
      role: scope.role,
      branch: scope.branch,
      branchesIncluded: scope.branchesIncluded,
    },
    metricsIncluded: Object.keys(snapshot.metrics || {}),
  },
});

const buildOccupancySnapshot = (reportData) => {
  const kpis = reportData?.kpis || {};
  const trend = reportData?.series?.occupancyTrend || [];
  const roomTypes = reportData?.tables?.roomTypes || [];
  const inventory = tableRows(reportData?.tables?.inventory);
  const firstRate = Number(trend[0]?.totalRate || kpis.occupancyRate || 0);
  const lastRate = Number(trend[trend.length - 1]?.totalRate || kpis.occupancyRate || 0);

  return {
    metrics: {
      occupancyRate: Number(kpis.occupancyRate || 0),
      totalCapacity: Number(kpis.totalCapacity || 0),
      occupiedBeds: Number(kpis.occupiedBeds || 0),
      availableBeds: Number(kpis.availableBeds || 0),
      unavailableBeds: Number(kpis.unavailableBeds || 0),
      trendDelta: lastRate - firstRate,
    },
    trend: trend.slice(-7).map((entry) => ({
      label: entry.label,
      totalRate: Number(entry.totalRate || 0),
    })),
    topRoomTypes: roomTypes.map((entry) => ({
      label: entry.roomTypeLabel,
      occupancyRate: Number(entry.occupancyRate || 0),
      occupiedBeds: Number(entry.occupiedBeds || 0),
      capacity: Number(entry.capacity || 0),
    })),
    constrainedRooms: pickTopBy(
      inventory.filter((row) => Number(row.availableBeds || 0) <= 1),
      "occupancyRate",
      5,
    ).map((row) => ({
      roomNumber: row.roomNumber,
      branch: row.branch,
      occupancyRate: Number(row.occupancyRate || 0),
      availableBeds: Number(row.availableBeds || 0),
      unavailableBeds: Number(row.unavailableBeds || 0),
    })),
  };
};

const buildBillingSnapshot = (reportData) => {
  const kpis = reportData?.kpis || {};
  const revenueByMonth = reportData?.series?.revenueByMonth || [];
  const overdueAging = reportData?.series?.overdueAging || [];
  const unpaidBalances = reportData?.tables?.unpaidBalances || [];
  const lastMonth = revenueByMonth[revenueByMonth.length - 1] || {};
  const prevMonth = revenueByMonth[revenueByMonth.length - 2] || {};

  return {
    metrics: {
      billedAmount: Number(kpis.billedAmount || 0),
      collectedRevenue: Number(kpis.collectedRevenue || 0),
      outstandingBalance: Number(kpis.outstandingBalance || 0),
      overdueAmount: Number(kpis.overdueAmount || 0),
      collectionRate: Number(kpis.collectionRate || 0),
      revenueDelta: Number(lastMonth.collectedRevenue || 0) - Number(prevMonth.collectedRevenue || 0),
    },
    revenueByMonth: revenueByMonth.slice(-6).map((entry) => ({
      label: entry.label,
      billedAmount: Number(entry.billedAmount || 0),
      collectedRevenue: Number(entry.collectedRevenue || 0),
      outstandingBalance: Number(entry.outstandingBalance || 0),
    })),
    overdueAging: overdueAging.map((entry) => ({
      label: entry.label,
      count: Number(entry.count || 0),
      amount: Number(entry.amount || 0),
    })),
    largestBalances: pickTopBy(unpaidBalances, "balance", 5).map((entry) => ({
      roomName: entry.roomName,
      branch: entry.branch,
      balance: Number(entry.balance || 0),
      daysOverdue: Number(entry.daysOverdue || 0),
      status: entry.status,
    })),
  };
};

const buildFinancialsSnapshot = (reportData) => {
  const kpis = reportData?.kpis || {};
  const revenueByMonth = reportData?.series?.revenueByMonth || [];
  const overdueAging = reportData?.series?.overdueAging || [];
  const branchComparison = reportData?.series?.branchComparison || [];
  const overdueRooms = tableRows(reportData?.tables?.overdueRooms);
  const unpaidBalances = reportData?.tables?.unpaidBalances || [];
  const lastMonth = revenueByMonth[revenueByMonth.length - 1] || {};
  const prevMonth = revenueByMonth[revenueByMonth.length - 2] || {};

  return {
    metrics: {
      billedAmount: Number(kpis.billedAmount || 0),
      collectedRevenue: Number(kpis.collectedRevenue || 0),
      outstandingBalance: Number(kpis.outstandingBalance || 0),
      overdueAmount: Number(kpis.overdueAmount || 0),
      collectionRate: Number(kpis.collectionRate || 0),
      netPosition: Number(kpis.netPosition || 0),
      revenueDelta: Number(lastMonth.collectedRevenue || 0) - Number(prevMonth.collectedRevenue || 0),
    },
    revenueByMonth: revenueByMonth.slice(-6).map((entry) => ({
      label: entry.label,
      billedAmount: Number(entry.billedAmount || 0),
      collectedRevenue: Number(entry.collectedRevenue || 0),
      outstandingBalance: Number(entry.outstandingBalance || 0),
    })),
    overdueAging: overdueAging.map((entry) => ({
      label: entry.label,
      count: Number(entry.count || 0),
      amount: Number(entry.amount || 0),
    })),
    branchComparison: branchComparison.map((entry) => ({
      label: entry.label,
      branch: entry.branch,
      billedAmount: Number(entry.billedAmount || 0),
      collectedRevenue: Number(entry.collectedRevenue || 0),
      overdueAmount: Number(entry.overdueAmount || 0),
      collectionRate: Number(entry.collectionRate || 0),
    })),
    overdueRooms: pickTopBy(overdueRooms, "outstandingBalance", 5).map((entry) => ({
      roomName: entry.roomName,
      branch: entry.branch,
      tenantCount: Number(entry.tenantCount || 0),
      overdueCount: Number(entry.overdueCount || 0),
      outstandingBalance: Number(entry.outstandingBalance || 0),
    })),
    largestBalances: pickTopBy(unpaidBalances, "balance", 5).map((entry) => ({
      roomName: entry.roomName,
      branch: entry.branch,
      balance: Number(entry.balance || 0),
      daysOverdue: Number(entry.daysOverdue || 0),
      status: entry.status,
    })),
  };
};

const buildOperationsSnapshot = (reportData) => {
  const kpis = reportData?.kpis || {};
  const reservationsByPeriod = reportData?.series?.reservationsByPeriod || [];
  const maintenanceByType = reportData?.series?.maintenanceByType || [];
  const maintenanceIssues = tableRows(reportData?.tables?.maintenanceIssues);
  const peakInquiryWindows = reportData?.tables?.peakInquiryWindows || [];

  return {
    metrics: {
      reservations: Number(kpis.reservations || 0),
      inquiries: Number(kpis.inquiries || 0),
      maintenanceRequests: Number(kpis.maintenanceRequests || 0),
      avgResolutionHours: Number(kpis.avgResolutionHours || 0),
      slaComplianceRate: Number(kpis.slaComplianceRate || 0),
    },
    reservationsByPeriod: reservationsByPeriod.slice(-6).map((entry) => ({
      label: entry.label,
      count: Number(entry.count || 0),
    })),
    maintenanceByType: maintenanceByType.slice(0, 5).map((entry) => ({
      label: entry.label,
      count: Number(entry.count || 0),
    })),
    delayedRequests: maintenanceIssues
      .filter((entry) => entry.slaState === "delayed" || entry.slaState === "priority")
      .slice(0, 5)
      .map((entry) => ({
        typeLabel: entry.typeLabel,
        urgency: entry.urgency,
        status: entry.status,
        branch: entry.branch,
      })),
    peakInquiryWindows: peakInquiryWindows.slice(0, 3).map((entry) => ({
      label: entry.label,
      count: Number(entry.count || 0),
    })),
  };
};

const buildAuditSnapshot = (reportData) => {
  const kpis = reportData?.kpis || {};
  const branchSummary = reportData?.series?.branchSummary || [];
  const recentSecurityEvents = tableRows(reportData?.tables?.recentSecurityEvents);
  const suspiciousIps = reportData?.tables?.suspiciousIps || [];

  return {
    metrics: {
      failedLogins: Number(kpis.failedLogins || 0),
      suspiciousIpCount: Number(kpis.suspiciousIpCount || 0),
      highSeverityActions: Number(kpis.highSeverityActions || 0),
      accessOverrides: Number(kpis.accessOverrides || 0),
      criticalEvents: Number(kpis.criticalEvents || 0),
    },
    branchSummary: branchSummary.slice(0, 5).map((entry) => ({
      label: entry.label,
      highSeverityCount: Number(entry.highSeverityCount || 0),
      accessOverrideCount: Number(entry.accessOverrideCount || 0),
      totalEvents: Number(entry.totalEvents || 0),
    })),
    suspiciousIps: suspiciousIps.slice(0, 5).map((entry) => ({
      ipAddress: entry.ip || entry.ipAddress,
      attempts: Number(entry.count || entry.attempts || 0),
      targetedEmailsCount: Array.isArray(entry.targetedEmails)
        ? entry.targetedEmails.length
        : 0,
    })),
    recentSecurityEvents: recentSecurityEvents.slice(0, 5).map((entry) => ({
      branch: entry.branch,
      action: entry.action,
      severity: entry.severity,
      type: entry.type,
    })),
  };
};

const buildForecastSnapshot = (forecast = {}) => ({
  sufficientHistory: Boolean(forecast?.sufficientHistory),
  historyMonthsAvailable: Number(forecast?.historyMonthsAvailable || 0),
  requiredHistoryMonths: Number(forecast?.requiredHistoryMonths || 4),
  headline: forecast?.insights?.headline || "",
  recommendations: clampList(
    forecast?.insights?.recommendations,
    MAX_FORECAST_HIGHLIGHTS,
    260,
  ),
  projected: (forecast?.projected || []).slice(0, 6).map((entry) => ({
    label: entry.label,
    projectedOccupancyRate: Number(entry.projectedOccupancyRate || 0),
    baselineRate: Number(entry.baselineRate || 0),
    seasonalMultiplier: Number(entry.seasonalMultiplier || 1),
  })),
});

const buildHubSnapshot = (reportData) => {
  const occupancy = buildOccupancySnapshot(reportData?.reports?.occupancy || {});
  const billing = buildBillingSnapshot(reportData?.reports?.billing || {});
  const operations = buildOperationsSnapshot(reportData?.reports?.operations || {});
  const forecast = buildForecastSnapshot(reportData?.forecast || {});
  const audit = reportData?.reports?.audit
    ? buildAuditSnapshot(reportData.reports.audit)
    : null;
  const metrics = {
    occupancyRate: occupancy.metrics.occupancyRate,
    availableBeds: occupancy.metrics.availableBeds,
    unavailableBeds: occupancy.metrics.unavailableBeds,
    collectionRate: billing.metrics.collectionRate,
    outstandingBalance: billing.metrics.outstandingBalance,
    overdueAmount: billing.metrics.overdueAmount,
    maintenanceRequests: operations.metrics.maintenanceRequests,
    slaComplianceRate: operations.metrics.slaComplianceRate,
    forecastSufficientHistory: forecast.sufficientHistory,
    ...(audit
      ? {
          failedLogins: audit.metrics.failedLogins,
          criticalSecurityEvents: audit.metrics.criticalEvents,
        }
      : {}),
  };

  return {
    metrics,
    occupancy: {
      trendDelta: occupancy.metrics.trendDelta,
      constrainedRooms: occupancy.constrainedRooms,
      topRoomTypes: occupancy.topRoomTypes,
    },
    paymentRisk: {
      revenueDelta: billing.metrics.revenueDelta,
      overdueAging: billing.overdueAging,
      largestBalances: billing.largestBalances,
    },
    maintenanceRisk: {
      maintenanceByType: operations.maintenanceByType,
      delayedRequests: operations.delayedRequests,
      peakInquiryWindows: operations.peakInquiryWindows,
    },
    forecast,
    security: audit
      ? {
          failedLogins: audit.metrics.failedLogins,
          criticalEvents: audit.metrics.criticalEvents,
          suspiciousIps: audit.suspiciousIps,
          branchSummary: audit.branchSummary,
        }
      : null,
  };
};

const SNAPSHOT_BUILDERS = Object.freeze({
  hub: buildHubSnapshot,
  occupancy: buildOccupancySnapshot,
  billing: buildBillingSnapshot,
  financials: buildFinancialsSnapshot,
  operations: buildOperationsSnapshot,
  audit: buildAuditSnapshot,
});

const heuristicInsightBuilders = {
  hub: ({ snapshot, scope, question }) => {
    const metrics = snapshot.metrics || {};
    const constrainedRooms = snapshot.occupancy?.constrainedRooms || [];
    const largestBalance = snapshot.paymentRisk?.largestBalances?.[0];
    const overdueBucket = pickTopBy(snapshot.paymentRisk?.overdueAging, "amount", 1)[0];
    const delayedRequests = snapshot.maintenanceRisk?.delayedRequests || [];
    const topMaintenance = snapshot.maintenanceRisk?.maintenanceByType?.[0];
    const forecast = snapshot.forecast || {};
    const security = snapshot.security;
    const branchLabel =
      scope.branch === "all"
        ? "all branches"
        : String(scope.branch || "the selected branch").replace(/-/g, " ");

    const hasCoreData =
      Number(metrics.occupancyRate || 0) > 0 ||
      Number(metrics.outstandingBalance || 0) > 0 ||
      Number(metrics.maintenanceRequests || 0) > 0;

    if (!hasCoreData) {
      return {
        headline: "More report data is needed before the AI hub can highlight strong patterns.",
        summary: [
          `The hub checked occupancy, billing, operations, and forecast data for ${branchLabel}.`,
          "Current records are still too light for confident management recommendations.",
          question ? `You asked: ${question}` : null,
        ].filter(Boolean).join(" "),
        keyFindings: [
          "Occupancy, billing, and operations signals are available but not yet strong enough for a detailed pattern.",
        ],
        anomalies: [],
        riskAlerts: [],
        forecastHighlights: forecast.headline ? [forecast.headline] : [],
        recommendedActions: [
          "Continue collecting occupancy, billing, and maintenance history before relying on AI planning signals.",
        ],
        confidence: "low",
      };
    }

    const keyFindings = [
      `Occupancy is ${safePercent(metrics.occupancyRate)} with ${metrics.availableBeds} available bed(s).`,
      `Collections are at ${safePercent(metrics.collectionRate)} with ${safeMoney(metrics.outstandingBalance)} still unpaid.`,
      `${metrics.maintenanceRequests} maintenance request(s) appear in the selected operations window.`,
      security && Number(security.criticalEvents || 0) > 0
        ? `${security.criticalEvents} critical security event(s) need owner review.`
        : null,
    ].filter(Boolean).slice(0, MAX_FINDINGS);

    const riskAlerts = [
      Number(metrics.overdueAmount || 0) > 0
        ? `${safeMoney(metrics.overdueAmount)} is overdue across the selected billing scope.`
        : null,
      largestBalance
        ? `The largest visible unpaid room balance is ${safeMoney(largestBalance.balance)} for ${largestBalance.roomName || "a room"}.`
        : null,
      overdueBucket
        ? `${overdueBucket.label} is the largest overdue aging bucket at ${safeMoney(overdueBucket.amount)}.`
        : null,
      delayedRequests.length > 0
        ? `${delayedRequests.length} delayed or priority maintenance item(s) need follow-up.`
        : null,
      Number(metrics.unavailableBeds || 0) > 0
        ? `${metrics.unavailableBeds} bed(s) are unavailable and reduce usable capacity.`
        : null,
      security && Number(security.failedLogins || 0) >= 10
        ? `${security.failedLogins} failed login attempt(s) were detected in owner monitoring.`
        : null,
    ].filter(Boolean).slice(0, MAX_RISK_ALERTS);

    const forecastHighlights = [
      forecast.headline || null,
      ...(forecast.projected || []).slice(0, 2).map(
        (entry) =>
          `${entry.label}: projected occupancy ${safePercent(entry.projectedOccupancyRate)} against ${safePercent(entry.baselineRate)} baseline.`,
      ),
      ...((forecast.recommendations || []).slice(0, 1)),
    ].filter(Boolean).slice(0, MAX_FORECAST_HIGHLIGHTS);

    const recommendedActions = [
      Number(metrics.overdueAmount || 0) > 0
        ? "Prioritize collection follow-up by overdue amount and days overdue."
        : null,
      constrainedRooms.length > 0
        ? "Review constrained rooms and blocked beds before accepting more demand in those room types."
        : null,
      delayedRequests.length > 0
        ? "Assign delayed or priority maintenance first to protect SLA performance."
        : null,
      topMaintenance
        ? `Investigate repeated ${String(topMaintenance.label || "maintenance").toLowerCase()} issues before they become recurring costs.`
        : null,
      forecast.sufficientHistory === false
        ? "Collect more occupancy history before using forecasts for long-range planning."
        : null,
      security && Number(security.criticalEvents || 0) > 0
        ? "Review critical owner-level security events before the next operations review."
        : null,
    ].filter(Boolean).slice(0, MAX_ACTIONS);

    return {
      headline: `AI hub found ${riskAlerts.length} risk signal(s) for ${branchLabel}.`,
      summary: [
        `The strongest operational signals are ${safePercent(metrics.occupancyRate)} occupancy, ${safePercent(metrics.collectionRate)} collection rate, and ${metrics.maintenanceRequests} maintenance request(s).`,
        forecast.sufficientHistory
          ? "The forecast has enough history for short-range planning."
          : "The forecast needs more history before it should drive major planning decisions.",
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings,
      anomalies: riskAlerts.slice(0, MAX_ANOMALIES),
      riskAlerts,
      forecastHighlights,
      recommendedActions,
      confidence:
        forecast.sufficientHistory && keyFindings.length >= 3
          ? "medium"
          : "low",
    };
  },
  occupancy: ({ snapshot, scope, question }) => {
    const metrics = snapshot.metrics;
    const constrained = snapshot.constrainedRooms || [];
    const bestType = pickTopBy(snapshot.topRoomTypes, "occupancyRate", 1)[0];
    const weakestType = [...(snapshot.topRoomTypes || [])]
      .sort((left, right) => Number(left.occupancyRate || 0) - Number(right.occupancyRate || 0))[0];

    if (Number(metrics.totalCapacity || 0) === 0) {
      return {
        headline: "There is not enough occupancy data yet.",
        summary: "This report does not have enough room or occupancy data for a useful AI summary.",
        keyFindings: ["More room and occupancy data is needed before patterns can be explained clearly."],
        anomalies: [],
        recommendedActions: ["Check that room inventory and occupancy records are updating correctly."],
        confidence: "low",
      };
    }

    return {
      headline: `Occupancy is ${safePercent(metrics.occupancyRate)} right now.`,
      summary: [
        `${metrics.availableBeds} bed(s) are still open.`,
        Number(metrics.trendDelta || 0) >= 0
          ? `Occupancy has stayed steady or gone up by about ${safePercent(round(metrics.trendDelta, 0))}.`
          : `Occupancy has gone down by about ${safePercent(Math.abs(round(metrics.trendDelta, 0)))}.`,
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings: [
        bestType ? `${bestType.label} is filling the best at ${safePercent(bestType.occupancyRate)}.` : null,
        weakestType ? `${weakestType.label} is the weakest room type at ${safePercent(weakestType.occupancyRate)}.` : null,
        constrained.length > 0 ? `${constrained.length} room(s) are almost full or blocked by unavailable beds.` : "No major room-capacity problem stands out right now.",
      ].filter(Boolean).slice(0, MAX_FINDINGS),
      anomalies: [
        metrics.unavailableBeds > 0 ? `${metrics.unavailableBeds} bed(s) cannot be used right now, which lowers capacity.` : null,
        constrained[0]
          ? `Room ${constrained[0].roomNumber} only has ${constrained[0].availableBeds} bed(s) left.`
          : null,
      ].filter(Boolean).slice(0, MAX_ANOMALIES),
      recommendedActions: [
        constrained.length > 0 ? "Prepare high-demand rooms faster so they can be used again quickly." : null,
        metrics.unavailableBeds > 0 ? "Review locked or maintenance beds to recover capacity where possible." : null,
        weakestType ? `Review pricing, room condition, and promotion for ${weakestType.label}.` : null,
      ].filter(Boolean).slice(0, MAX_ACTIONS),
      confidence: snapshot.trend.length >= 4 ? "medium" : "low",
    };
  },
  billing: ({ snapshot, scope, question }) => {
    const metrics = snapshot.metrics;
    const largestBalance = snapshot.largestBalances[0];
    const oldestAging = pickTopBy(snapshot.overdueAging, "amount", 1)[0];

    if (Number(metrics.billedAmount || 0) === 0 && Number(metrics.collectedRevenue || 0) === 0) {
      return {
        headline: "There is not enough billing data yet.",
        summary: "This report does not have enough billing activity for a useful AI summary.",
        keyFindings: ["Bills or payments are needed before collection patterns can be explained."],
        anomalies: [],
        recommendedActions: ["Check that bills and payments are being recorded for this period."],
        confidence: "low",
      };
    }

    return {
      headline: `${safeMoney(metrics.collectedRevenue)} has been collected so far.`,
      summary: [
        `${safeMoney(metrics.outstandingBalance)} is still unpaid.`,
        Number(metrics.revenueDelta || 0) >= 0
          ? `Collections went up by ${safeMoney(metrics.revenueDelta)} compared with the previous visible month.`
          : `Collections went down by ${safeMoney(Math.abs(metrics.revenueDelta))} compared with the previous visible month.`,
        `Current collection rate is ${safePercent(metrics.collectionRate)}.`,
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings: [
        `${safeMoney(metrics.overdueAmount)} is already overdue.`,
        oldestAging ? `The biggest overdue group is ${oldestAging.label} with ${safeMoney(oldestAging.amount)} unpaid.` : null,
        largestBalance ? `${largestBalance.roomName} has the biggest visible unpaid balance at ${safeMoney(largestBalance.balance)}.` : null,
      ].filter(Boolean).slice(0, MAX_FINDINGS),
      anomalies: [
        Number(metrics.collectionRate || 0) < 80 ? `Collection rate is low at ${safePercent(metrics.collectionRate)}.` : null,
        largestBalance && Number(largestBalance.daysOverdue || 0) > 60
          ? `One of the biggest unpaid balances is already ${largestBalance.daysOverdue} days late.`
          : null,
      ].filter(Boolean).slice(0, MAX_ANOMALIES),
      recommendedActions: [
        "Follow up first on the biggest unpaid balances and the oldest overdue bills.",
        Number(metrics.collectionRate || 0) < 80 ? "Review reminder timing and follow-up steps for unpaid bills." : null,
        Number(metrics.overdueAmount || 0) > 0 ? "Track overdue payments weekly so late balances do not keep growing." : null,
      ].filter(Boolean).slice(0, MAX_ACTIONS),
      confidence: snapshot.revenueByMonth.length >= 3 ? "medium" : "low",
    };
  },
  financials: ({ snapshot, scope, question }) => {
    const metrics = snapshot.metrics;
    const branchRisk = pickTopBy(snapshot.branchComparison, "overdueAmount", 1)[0];
    const bestCollectionBranch = pickTopBy(snapshot.branchComparison, "collectionRate", 1)[0];
    const largestRoom = snapshot.overdueRooms[0];
    const largestBalance = snapshot.largestBalances[0];
    const biggestAging = pickTopBy(snapshot.overdueAging, "amount", 1)[0];
    const branchLabel =
      scope.branch === "all"
        ? "all branches"
        : String(scope.branch || "the selected branch").replace(/-/g, " ");

    if (Number(metrics.billedAmount || 0) === 0 && Number(metrics.collectedRevenue || 0) === 0) {
      return {
        headline: "There is not enough financial data yet.",
        summary: `The financial report for ${branchLabel} does not have enough billing or payment activity for a useful AI summary.`,
        keyFindings: ["Bills and payment records are needed before financial trends can be explained clearly."],
        anomalies: [],
        recommendedActions: ["Check that bills and payments are being recorded for the selected period."],
        confidence: "low",
      };
    }

    return {
      headline: `${safeMoney(metrics.collectedRevenue)} has been collected with ${safeMoney(metrics.outstandingBalance)} still outstanding.`,
      summary: [
        `The selected scope is running at a ${safePercent(metrics.collectionRate)} collection rate and a ${safeMoney(metrics.netPosition)} net position.`,
        Number(metrics.revenueDelta || 0) >= 0
          ? `Collections increased by ${safeMoney(metrics.revenueDelta)} compared with the previous visible month.`
          : `Collections decreased by ${safeMoney(Math.abs(metrics.revenueDelta))} compared with the previous visible month.`,
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings: [
        `${safeMoney(metrics.overdueAmount)} is overdue in the selected financial scope.`,
        branchRisk ? `${branchRisk.label} has the highest overdue exposure at ${safeMoney(branchRisk.overdueAmount)}.` : null,
        bestCollectionBranch ? `${bestCollectionBranch.label} has the strongest visible collection rate at ${safePercent(bestCollectionBranch.collectionRate)}.` : null,
        biggestAging ? `${biggestAging.label} is the largest overdue aging bucket at ${safeMoney(biggestAging.amount)}.` : null,
      ].filter(Boolean).slice(0, MAX_FINDINGS),
      anomalies: [
        Number(metrics.collectionRate || 0) < 80 ? `Collection rate is below target at ${safePercent(metrics.collectionRate)}.` : null,
        largestRoom ? `${largestRoom.roomName} carries ${safeMoney(largestRoom.outstandingBalance)} in visible room exposure.` : null,
        largestBalance && Number(largestBalance.daysOverdue || 0) > 60
          ? `One high-balance account is already ${largestBalance.daysOverdue} days overdue.`
          : null,
      ].filter(Boolean).slice(0, MAX_ANOMALIES),
      recommendedActions: [
        "Prioritize follow-up on the highest overdue rooms and oldest unpaid balances.",
        branchRisk ? `Review ${branchRisk.label} collection workflow before the next owner planning review.` : null,
        Number(metrics.collectionRate || 0) < 80 ? "Tighten payment reminders and escalation timing for unpaid bills." : null,
      ].filter(Boolean).slice(0, MAX_ACTIONS),
      confidence: snapshot.revenueByMonth.length >= 3 ? "medium" : "low",
    };
  },
  operations: ({ snapshot, question }) => {
    const metrics = snapshot.metrics;
    const topMaintenance = snapshot.maintenanceByType[0];
    const topWindow = snapshot.peakInquiryWindows[0];
    const delayedCount = snapshot.delayedRequests.length;

    if (
      Number(metrics.reservations || 0) === 0 &&
      Number(metrics.inquiries || 0) === 0 &&
      Number(metrics.maintenanceRequests || 0) === 0
    ) {
      return {
        headline: "There is not enough operations data yet.",
        summary: "This report does not have enough activity for a useful AI summary.",
        keyFindings: ["Recent reservation, inquiry, or maintenance activity is needed before patterns can be explained."],
        anomalies: [],
        recommendedActions: ["Check that reservation, inquiry, and maintenance records are reaching the report correctly."],
        confidence: "low",
      };
    }

    return {
      headline: `${metrics.maintenanceRequests} maintenance request(s) and ${metrics.reservations} reservation(s) were recorded in this period.`,
      summary: [
        `Average fix time is ${round(metrics.avgResolutionHours)} hours.`,
        `On-time fix rate is ${safePercent(metrics.slaComplianceRate)}.`,
        topWindow ? `Most inquiries come in around ${topWindow.label}.` : null,
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings: [
        topMaintenance ? `${topMaintenance.label} is the most common maintenance issue.` : null,
        delayedCount > 0 ? `${delayedCount} visible maintenance item(s) look delayed or urgent.` : "No clear maintenance delay pattern stands out right now.",
        `Inquiry volume stands at ${metrics.inquiries} for the reporting period.`,
      ].filter(Boolean).slice(0, MAX_FINDINGS),
      anomalies: [
        Number(metrics.slaComplianceRate || 0) < 85 ? `The on-time fix rate is low at ${safePercent(metrics.slaComplianceRate)}.` : null,
        delayedCount > 0 ? "Some maintenance requests may need faster follow-up." : null,
      ].filter(Boolean).slice(0, MAX_ANOMALIES),
      recommendedActions: [
        delayedCount > 0 ? "Prioritize delayed or urgent maintenance requests first." : null,
        topMaintenance ? `Look for repeat causes behind ${topMaintenance.label.toLowerCase()} issues.` : null,
        topWindow ? `Add more inquiry coverage around ${topWindow.label} if response times are slow.` : null,
      ].filter(Boolean).slice(0, MAX_ACTIONS),
      confidence: snapshot.reservationsByPeriod.length >= 3 ? "medium" : "low",
    };
  },
  audit: ({ snapshot, scope, question }) => {
    const metrics = snapshot.metrics;
    const hottestBranch = pickTopBy(snapshot.branchSummary, "highSeverityCount", 1)[0];
    const suspiciousIp = pickTopBy(snapshot.suspiciousIps, "attempts", 1)[0];

    if (
      Number(metrics.failedLogins || 0) === 0 &&
      Number(metrics.highSeverityActions || 0) === 0 &&
      Number(metrics.criticalEvents || 0) === 0
    ) {
      return {
        headline: "No major security issue stands out in this report.",
        summary: "This report does not show failed logins, critical events, or serious security actions right now.",
        keyFindings: ["No urgent security warning stands out in the current summary."],
        anomalies: [],
        recommendedActions: ["Keep regular monitoring and permission reviews in place."],
        confidence: "medium",
      };
    }

    return {
      headline: `${metrics.failedLogins} failed login attempt(s) and ${metrics.highSeverityActions} serious security action(s) were detected.`,
      summary: [
        `${metrics.accessOverrides} permission override or access-change event(s) were also found.`,
        suspiciousIp ? `The busiest suspicious IP had ${suspiciousIp.attempts} failed attempts.` : null,
        question ? `You asked: ${question}` : null,
      ].filter(Boolean).join(" "),
      keyFindings: [
        hottestBranch ? `${hottestBranch.label} shows the most serious security activity in this summary.` : null,
        suspiciousIp ? `One suspicious IP was linked to ${suspiciousIp.targetedEmailsCount} account target(s).` : null,
        `${metrics.criticalEvents} critical security event(s) were recorded in this period.`,
      ].filter(Boolean).slice(0, MAX_FINDINGS),
      anomalies: [
        Number(metrics.accessOverrides || 0) > 0 ? "There are permission-related actions that should be reviewed." : null,
        suspiciousIp && Number(suspiciousIp.attempts || 0) >= 5 ? "One IP address has an unusual number of failed logins." : null,
      ].filter(Boolean).slice(0, MAX_ANOMALIES),
      recommendedActions: [
        suspiciousIp ? "Review repeated failed-login sources and confirm blocking rules are strong enough." : null,
        Number(metrics.accessOverrides || 0) > 0 ? "Review recent permission or role changes and confirm they were approved." : null,
        hottestBranch ? `Check ${hottestBranch.label} first because it has the most serious activity in this summary.` : null,
      ].filter(Boolean).slice(0, MAX_ACTIONS),
      confidence: "medium",
    };
  },
};

const createHeuristicProvider = () => ({
  name: "heuristic-fallback",
  async generate({ reportType, scope, question, snapshot }) {
    const build = heuristicInsightBuilders[reportType];
    if (!build) {
      throw new Error(`Unsupported analytics insight report type: ${reportType}`);
    }

    return build({ snapshot, scope, question });
  },
});

const analyticsInsightResponseSchema = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One concise sentence that states the most important report insight.",
    },
    summary: {
      type: "string",
      description: "A short paragraph explaining the trend using only the provided snapshot data.",
    },
    keyFindings: {
      type: "array",
      minItems: 1,
      maxItems: MAX_FINDINGS,
      items: { type: "string" },
    },
    anomalies: {
      type: "array",
      maxItems: MAX_ANOMALIES,
      items: { type: "string" },
    },
    riskAlerts: {
      type: "array",
      maxItems: MAX_RISK_ALERTS,
      items: { type: "string" },
    },
    forecastHighlights: {
      type: "array",
      maxItems: MAX_FORECAST_HIGHLIGHTS,
      items: { type: "string" },
    },
    recommendedActions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_ACTIONS,
      items: { type: "string" },
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
  },
  required: [
    "headline",
    "summary",
    "keyFindings",
    "anomalies",
    "recommendedActions",
    "confidence",
  ],
  propertyOrdering: [
    "headline",
    "summary",
    "keyFindings",
    "anomalies",
    "riskAlerts",
    "forecastHighlights",
    "recommendedActions",
    "confidence",
  ],
};

const getInsightResponseSchema = (reportType) =>
  reportType === "hub"
    ? {
        ...analyticsInsightResponseSchema,
        required: [
          "headline",
          "summary",
          "keyFindings",
          "riskAlerts",
          "forecastHighlights",
          "recommendedActions",
          "confidence",
        ],
      }
    : analyticsInsightResponseSchema;

const clampText = (value, maxLength = 420) =>
  String(value || "").trim().slice(0, maxLength);

const clampList = (items, limit, maxLength = 220) =>
  (Array.isArray(items) ? items : [])
    .map((item) => clampText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);

const normalizeInsight = (insight) => {
  const anomalies = clampList(insight?.anomalies, MAX_ANOMALIES);
  const riskAlerts = clampList(
    insight?.riskAlerts || insight?.risk_alerts || anomalies,
    MAX_RISK_ALERTS,
  );

  const normalized = {
    headline: clampText(insight?.headline, 180),
    summary: clampText(insight?.summary, 700),
    keyFindings: clampList(insight?.keyFindings, MAX_FINDINGS),
    anomalies,
    riskAlerts,
    forecastHighlights: clampList(
      insight?.forecastHighlights || insight?.forecast_highlights,
      MAX_FORECAST_HIGHLIGHTS,
    ),
    recommendedActions: clampList(insight?.recommendedActions, MAX_ACTIONS),
    confidence: VALID_CONFIDENCE.has(insight?.confidence)
      ? insight.confidence
      : "low",
  };

  if (!normalized.headline || !normalized.summary) {
    throw new Error("Gemini insight response is missing headline or summary.");
  }
  if (!normalized.keyFindings.length || !normalized.recommendedActions.length) {
    throw new Error("Gemini insight response is missing required lists.");
  }

  return normalized;
};

const buildGeminiPrompt = ({ reportType, scope, filters, question, snapshot }) =>
  [
    "You are an analytics assistant for LilyCrest Dormitory Management.",
    reportType === "hub"
      ? "Generate one consolidated AI Insights Hub response across occupancy, billing, operations, forecasts, and allowed monitoring data."
      : "Generate a practical management insight for the selected report.",
    "Use only the JSON snapshot data. Do not invent facts, tenants, amounts, dates, or policy.",
    "When referencing collectedRevenue or collection amounts, call them collected payments or collections, not revenue.",
    "Keep recommendations operational and human-review focused. Do not say that records were changed.",
    "For owner/all-branch scope, include planning or branch-comparison implications when supported by the data.",
    reportType === "hub"
      ? "For the hub response, put immediate problems in riskAlerts and planning/projection notes in forecastHighlights."
      : null,
    "",
    `Report type: ${reportType}`,
    `Role: ${scope.role || "unknown"}`,
    `Branch scope: ${scope.branch || "all"}`,
    `Branches included: ${(scope.branchesIncluded || []).join(", ") || "none"}`,
    `Question: ${question || "No specific question."}`,
    "",
    "Filters:",
    JSON.stringify(filters || {}, null, 2),
    "",
    "Snapshot:",
    JSON.stringify(snapshot || {}, null, 2),
  ].filter((line) => line !== null).join("\n");

const parseGeminiText = (body) => {
  const text = body?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty insight response.");
  }

  return JSON.parse(text);
};

const createGeminiProvider = () => {
  const apiKey = String(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
  ).trim();
  const model = String(process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_AI_API_KEY is not configured.");
  }

  return {
    name: "gemini",
    model,
    async generate({ reportType, scope, filters, question, snapshot }) {
      if (typeof fetch !== "function") {
        throw new Error("Global fetch is not available for Gemini requests.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      const endpoint = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: buildGeminiPrompt({
                      reportType,
                      scope,
                      filters,
                      question,
                      snapshot,
                    }),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 900,
              responseMimeType: "application/json",
              responseSchema: getInsightResponseSchema(reportType),
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `Gemini request failed with ${response.status}: ${errorText.slice(0, 180)}`,
          );
        }

        const body = await response.json();
        return normalizeInsight(parseGeminiText(body));
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};

const createAnalyticsInsightsProvider = () => {
  const requestedProvider = String(process.env.AI_INSIGHTS_PROVIDER || "heuristic").trim().toLowerCase();

  switch (requestedProvider) {
    case "gemini":
      return createGeminiProvider();
    case "heuristic":
    default:
      return createHeuristicProvider();
  }
};

export const generateAnalyticsInsight = async ({
  reportType,
  scope,
  filters,
  reportData,
  question = "",
}) => {
  const snapshotBuilder = SNAPSHOT_BUILDERS[reportType];
  if (!snapshotBuilder) {
    throw new Error(`Unsupported analytics snapshot type: ${reportType}`);
  }

  const snapshot = snapshotBuilder(reportData);
  let provider;
  let insight;
  let usedFallback = false;
  let fallbackReason = null;

  try {
    provider = createAnalyticsInsightsProvider();
    insight = await provider.generate({
      reportType,
      scope,
      filters,
      question,
      snapshot,
    });
  } catch (error) {
    provider = createHeuristicProvider();
    insight = await provider.generate({
      reportType,
      scope,
      filters,
      question,
      snapshot,
    });
    usedFallback = true;
    fallbackReason = error?.message || "AI provider unavailable.";
  }

  return {
    snapshotMeta: buildSnapshotMeta({
      reportType,
      scope,
      filters,
      question,
      snapshot,
      provider: provider.name,
      usedFallback: usedFallback || provider.name === "heuristic-fallback",
      model: provider.model || null,
      fallbackReason,
    }),
    insight: {
      headline: insight.headline,
      summary: insight.summary,
      keyFindings: insight.keyFindings || [],
      anomalies: insight.anomalies || [],
      riskAlerts: insight.riskAlerts || [],
      forecastHighlights: insight.forecastHighlights || [],
      recommendedActions: insight.recommendedActions || [],
      confidence: insight.confidence || "low",
      generatedAt: new Date().toISOString(),
      disclaimer:
        "This is an AI summary based on the report data shown here. Use it as a guide, not as the final basis for money, legal, or compliance decisions.",
    },
  };
};
