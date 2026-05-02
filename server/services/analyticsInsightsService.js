const MAX_FINDINGS = 4;
const MAX_ANOMALIES = 3;
const MAX_ACTIONS = 3;
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

const SNAPSHOT_BUILDERS = Object.freeze({
  occupancy: buildOccupancySnapshot,
  billing: buildBillingSnapshot,
  operations: buildOperationsSnapshot,
  audit: buildAuditSnapshot,
});

const heuristicInsightBuilders = {
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
    "recommendedActions",
    "confidence",
  ],
};

const clampText = (value, maxLength = 420) =>
  String(value || "").trim().slice(0, maxLength);

const clampList = (items, limit, maxLength = 220) =>
  (Array.isArray(items) ? items : [])
    .map((item) => clampText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);

const normalizeInsight = (insight) => {
  const normalized = {
    headline: clampText(insight?.headline, 180),
    summary: clampText(insight?.summary, 700),
    keyFindings: clampList(insight?.keyFindings, MAX_FINDINGS),
    anomalies: clampList(insight?.anomalies, MAX_ANOMALIES),
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
    "Generate a practical management insight for the selected report.",
    "Use only the JSON snapshot data. Do not invent facts, tenants, amounts, dates, or policy.",
    "Keep recommendations operational and human-review focused. Do not say that records were changed.",
    "For owner/all-branch scope, include planning or branch-comparison implications when supported by the data.",
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
  ].join("\n");

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
              responseSchema: analyticsInsightResponseSchema,
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
      recommendedActions: insight.recommendedActions || [],
      confidence: insight.confidence || "low",
      generatedAt: new Date().toISOString(),
      disclaimer:
        "This is an AI summary based on the report data shown here. Use it as a guide, not as the final basis for money, legal, or compliance decisions.",
    },
  };
};
