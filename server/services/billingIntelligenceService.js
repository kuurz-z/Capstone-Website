const MAX_FINDINGS = 3;
const MAX_ACTIONS = 3;
const MAX_RISK_DRIVERS = 3;
const MAX_CHECKLIST_ITEMS = 4;
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-lite";
const GEMINI_API_VERSION = "v1beta";
const GEMINI_TIMEOUT_MS = 12000;
const VALID_RISK_LEVELS = new Set(["none", "low", "medium", "high", "blocked"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

const clampText = (value, maxLength = 600) =>
  String(value || "").trim().slice(0, maxLength);

const clampList = (items, limit, maxLength = 240) =>
  (Array.isArray(items) ? items : [])
    .map((item) => clampText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const roundNumber = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : null;
};

const toTimestamp = (value) => {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getPeriodId = (period) => String(period?._id || period?.id || "");

const getPeriodSortTime = (period) =>
  toTimestamp(period?.endDate) ||
  toTimestamp(period?.closedAt) ||
  toTimestamp(period?.startDate) ||
  toTimestamp(period?.createdAt) ||
  0;

const getPeriodTotalUsage = (period) => {
  const computed = toNumberOrNull(period?.computedTotalUsage);
  if (computed != null) return computed;

  const startReading = toNumberOrNull(period?.startReading);
  const endReading = toNumberOrNull(period?.endReading);
  if (startReading == null || endReading == null) return null;
  return Math.max(0, endReading - startReading);
};

const getPeriodTotalCost = (period) => {
  const computed = toNumberOrNull(period?.computedTotalCost);
  if (computed != null) return computed;

  const totalUsage = getPeriodTotalUsage(period);
  const ratePerUnit = toNumberOrNull(period?.ratePerUnit);
  if (totalUsage == null || ratePerUnit == null) return null;
  return totalUsage * ratePerUnit;
};

const getTenantDays = (period) =>
  (period?.tenantSummaries || []).reduce(
    (sum, entry) =>
      sum +
      (toNumberOrNull(
        entry?.coveredDays ??
          entry?.tenantDays ??
          entry?.occupiedDays ??
          entry?.billableDays ??
          0,
      ) || 0),
    0,
  );

const getKwhPerTenantDay = (period) => {
  const totalUsage = getPeriodTotalUsage(period);
  const tenantDays = getTenantDays(period);
  if (totalUsage == null || tenantDays <= 0) return null;
  return totalUsage / tenantDays;
};

const buildDelta = (current, previous, digits = 2) => {
  if (current == null || previous == null) {
    return { delta: null, deltaPercent: null };
  }

  const delta = current - previous;
  return {
    delta: roundNumber(delta, digits),
    deltaPercent:
      previous === 0 ? null : roundNumber((delta / previous) * 100, 1),
  };
};

const findPreviousPeriod = ({ period, periods = [] } = {}) => {
  const currentId = getPeriodId(period);
  if (!period || !Array.isArray(periods) || periods.length < 2) return null;

  const orderedPeriods = periods
    .filter((entry) => getPeriodId(entry) !== currentId)
    .filter((entry) => entry?.utilityType === "electricity" || !entry?.utilityType)
    .sort((a, b) => getPeriodSortTime(a) - getPeriodSortTime(b));
  const currentSortTime = getPeriodSortTime(period);
  const previousByDate = orderedPeriods
    .filter((entry) => getPeriodSortTime(entry) <= currentSortTime)
    .at(-1);

  return previousByDate || null;
};

const buildPreviousPeriodComparison = ({
  period,
  periods,
  currentKwhPerTenantDay,
} = {}) => {
  const previousPeriod = findPreviousPeriod({ period, periods });
  if (!previousPeriod) return null;

  const currentTotalKwh = getPeriodTotalUsage(period);
  const previousTotalKwh = getPeriodTotalUsage(previousPeriod);
  const currentTotalCost = getPeriodTotalCost(period);
  const previousTotalCost = getPeriodTotalCost(previousPeriod);
  const normalizedCurrentKwhPerTenantDay =
    currentKwhPerTenantDay == null
      ? getKwhPerTenantDay(period)
      : currentKwhPerTenantDay;
  const previousKwhPerTenantDay = getKwhPerTenantDay(previousPeriod);
  const usageDelta = buildDelta(currentTotalKwh, previousTotalKwh);
  const costDelta = buildDelta(currentTotalCost, previousTotalCost);
  const tenantDayDelta = buildDelta(
    normalizedCurrentKwhPerTenantDay,
    previousKwhPerTenantDay,
    4,
  );

  return {
    previousPeriodId: getPeriodId(previousPeriod),
    previousStatus: previousPeriod.status || null,
    previousStartDate: previousPeriod.startDate || null,
    previousEndDate: previousPeriod.endDate || null,
    currentTotalKwh: roundNumber(currentTotalKwh),
    previousTotalKwh: roundNumber(previousTotalKwh),
    usageDeltaKwh: usageDelta.delta,
    usageDeltaPercent: usageDelta.deltaPercent,
    currentTotalCost: roundNumber(currentTotalCost),
    previousTotalCost: roundNumber(previousTotalCost),
    costDelta: costDelta.delta,
    costDeltaPercent: costDelta.deltaPercent,
    currentKwhPerTenantDay: roundNumber(normalizedCurrentKwhPerTenantDay, 4),
    previousKwhPerTenantDay: roundNumber(previousKwhPerTenantDay, 4),
    kwhPerTenantDayDelta: tenantDayDelta.delta,
    kwhPerTenantDayDeltaPercent: tenantDayDelta.deltaPercent,
  };
};

const riskRank = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  blocked: 4,
});

const maxRisk = (...levels) =>
  levels.reduce(
    (current, level) =>
      (riskRank[level] || 0) > (riskRank[current] || 0) ? level : current,
    "none",
  );

export const buildBillingIntelligenceSnapshot = ({
  period,
  periods = [],
  room,
  electricityReview,
  billingState,
  billingLabel,
} = {}) => {
  const dataQualityIssues = electricityReview?.dataQualityIssues || [];
  const anomalyReview = electricityReview?.anomalyReview || {};
  const forecast = electricityReview?.forecast || null;
  const tenantSummaries = period?.tenantSummaries || [];
  const currentKwhPerTenantDay = toNumberOrNull(
    anomalyReview.metrics?.kwhPerTenantDay,
  );

  return {
    utilityType: "electricity",
    room: {
      name: room?.roomLabel || room?.name || room?.roomNumber || "Room",
      branch: room?.branch || period?.branch || null,
      type: room?.type || null,
    },
    period: {
      id: String(period?._id || period?.id || ""),
      status: period?.status || null,
      startDate: period?.startDate || null,
      endDate: period?.endDate || null,
      startReading: toNumberOrNull(period?.startReading),
      endReading: toNumberOrNull(period?.endReading),
      ratePerUnit: toNumberOrNull(period?.ratePerUnit),
      computedTotalUsage: toNumberOrNull(period?.computedTotalUsage),
      computedTotalCost: toNumberOrNull(period?.computedTotalCost),
      verified: period?.verified ?? null,
      revised: Boolean(period?.revised),
      billingState: billingState || null,
      billingLabel: billingLabel || null,
    },
    lifecycle: {
      periodStatus: period?.status || null,
      billingState: billingState || null,
      billingLabel: billingLabel || null,
      canSendBill: Boolean(electricityReview?.canSendBill),
      reviewRequired: Boolean(electricityReview?.reviewRequired),
    },
    validation: {
      state: electricityReview?.validationState || "ok",
      canSendBill: Boolean(electricityReview?.canSendBill),
      reviewRequired: Boolean(electricityReview?.reviewRequired),
      issues: dataQualityIssues.slice(0, 8).map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      })),
    },
    anomaly: {
      riskLevel: anomalyReview.riskLevel || "none",
      score: toNumberOrNull(anomalyReview.score) || 0,
      confidence: anomalyReview.confidence || "low",
      reasons: (anomalyReview.reasons || []).slice(0, 8).map((reason) => ({
        code: reason.code,
        severity: reason.severity,
        message: reason.message,
        baseline: toNumberOrNull(reason.baseline),
        actual: toNumberOrNull(reason.actual),
      })),
      metrics: {
        totalKwh: toNumberOrNull(anomalyReview.metrics?.totalKwh),
        occupiedTenantDays: toNumberOrNull(anomalyReview.metrics?.occupiedTenantDays),
        kwhPerTenantDay: toNumberOrNull(anomalyReview.metrics?.kwhPerTenantDay),
      },
    },
    forecast: forecast
      ? {
          projectedKwh: toNumberOrNull(forecast.projectedKwh),
          projectedCharge: toNumberOrNull(forecast.projectedCharge),
          projectedEndReading: toNumberOrNull(forecast.projectedEndReading),
          confidence: forecast.confidence || "low",
          basedOn: forecast.basedOn || null,
          drivers: clampList(forecast.drivers, 5, 80),
        }
      : null,
    tenantSummary: {
      count: tenantSummaries.length,
      totalUsage: toNumberOrNull(
        tenantSummaries.reduce((sum, entry) => sum + Number(entry.totalUsage || 0), 0),
      ),
      totalBillAmount: toNumberOrNull(
        tenantSummaries.reduce((sum, entry) => sum + Number(entry.billAmount || 0), 0),
      ),
      usagePerTenantDay: currentKwhPerTenantDay,
      allocationRules: [
        ...new Set(
          tenantSummaries
            .map((entry) => entry.allocationRule || entry.billingBasis)
            .filter(Boolean),
        ),
      ].slice(0, 5),
    },
    previousPeriodComparison: buildPreviousPeriodComparison({
      period,
      periods,
      currentKwhPerTenantDay,
    }),
  };
};

const buildDefaultDisputePreventionNote = (normalized, snapshot) => {
  const roomName = snapshot?.room?.name || "This electricity period";
  if (["blocked", "high", "medium"].includes(normalized.riskLevel)) {
    return `${roomName} should be reviewed before publishing because unresolved validation, allocation, or usage signals can make the charge harder to explain during a tenant dispute.`;
  }

  return "Keep the reading source, allocation basis, and review notes available so tenant questions can be answered from the deterministic billing record.";
};

const buildDefaultTenantExplanationDraft = (snapshot, normalized) => {
  if (["blocked", "high"].includes(normalized.riskLevel)) {
    return "A tenant-facing explanation should be finalized only after the admin resolves the current billing review items.";
  }

  const roomName = snapshot?.room?.name || "your room";
  return `The electricity charge for ${roomName} is based on recorded meter readings and the dormitory's utility allocation rules. The admin office can provide the reading and allocation breakdown if you need to review the charge.`;
};

const normalizeBillingInsight = (insight, provider, usedFallback, snapshot = null) => {
  const normalized = {
    headline: clampText(insight?.headline, 140),
    summary: clampText(insight?.summary, 420),
    riskLevel: VALID_RISK_LEVELS.has(insight?.riskLevel)
      ? insight.riskLevel
      : "low",
    keyFindings: clampList(insight?.keyFindings, MAX_FINDINGS),
    recommendedActions: clampList(insight?.recommendedActions, MAX_ACTIONS),
    confidence: VALID_CONFIDENCE.has(insight?.confidence)
      ? insight.confidence
      : "low",
    provider,
    usedFallback,
    generatedAt: new Date().toISOString(),
  };

  if (!normalized.headline || !normalized.summary) {
    throw new Error("Billing AI response is missing headline or summary.");
  }
  if (!normalized.keyFindings.length || !normalized.recommendedActions.length) {
    throw new Error("Billing AI response is missing required lists.");
  }

  const riskDrivers = clampList(insight?.riskDrivers, MAX_RISK_DRIVERS);
  normalized.riskDrivers = riskDrivers.length
    ? riskDrivers
    : normalized.keyFindings.slice(0, MAX_RISK_DRIVERS);
  if (!normalized.riskDrivers.length) {
    normalized.riskDrivers = [
      "No specific risk driver was returned beyond the standard billing review.",
    ];
  }

  const reviewChecklist = clampList(insight?.reviewChecklist, MAX_CHECKLIST_ITEMS);
  normalized.reviewChecklist = reviewChecklist.length
    ? reviewChecklist
    : normalized.recommendedActions.slice(0, MAX_CHECKLIST_ITEMS);
  if (!normalized.reviewChecklist.length) {
    normalized.reviewChecklist = [
      "Confirm the meter readings, billing period, and allocation details before sending bills.",
    ];
  }

  normalized.disputePreventionNote =
    clampText(insight?.disputePreventionNote, 320) ||
    buildDefaultDisputePreventionNote(normalized, snapshot);
  normalized.tenantExplanationDraft =
    clampText(insight?.tenantExplanationDraft, 420) ||
    buildDefaultTenantExplanationDraft(snapshot, normalized);

  return normalized;
};

const buildHeuristicInsight = (snapshot) => {
  const validationState = snapshot.validation.state;
  const anomalyRisk = snapshot.anomaly.riskLevel;
  const issueCount = snapshot.validation.issues.length;
  const reasonCount = snapshot.anomaly.reasons.length;
  const comparison = snapshot.previousPeriodComparison;
  const hasUsageIncrease =
    Number.isFinite(comparison?.usageDeltaPercent) &&
    comparison.usageDeltaPercent >= 25;
  const riskLevel = maxRisk(
    validationState === "blocked" ? "blocked" : validationState === "warning" ? "medium" : "none",
    anomalyRisk,
    snapshot.forecast?.confidence === "low" ? "low" : "none",
    hasUsageIncrease ? "medium" : "none",
  );

  if (!snapshot.period.id) {
    return {
      headline: "There is not enough billing data for an AI review.",
      summary: "No electricity period was available in the billing snapshot.",
      riskLevel: "low",
      keyFindings: ["Select an electricity billing period before requesting AI review."],
      recommendedActions: ["Open a room with an active, closed, or revised electricity cycle."],
      riskDrivers: ["No electricity period was included in the billing snapshot."],
      reviewChecklist: ["Select a valid electricity billing period before requesting AI review."],
      disputePreventionNote:
        "A review cannot prevent disputes until an actual electricity period is selected.",
      tenantExplanationDraft:
        "A tenant-facing explanation is not available because no electricity billing period was selected.",
      confidence: "low",
    };
  }

  const findings = [
    validationState === "blocked"
      ? "Deterministic validation has blocked this electricity period from sending."
      : validationState === "warning"
        ? `${issueCount} validation warning(s) need review before sending.`
        : "No deterministic validation block is present in the snapshot.",
    anomalyRisk !== "none"
      ? `Anomaly review reports ${anomalyRisk} risk with ${reasonCount} reason(s).`
      : "No unusual electricity usage pattern stands out from the current rules.",
    snapshot.forecast
      ? `Open-period forecast is based on ${snapshot.forecast.basedOn || "available billing data"} with ${snapshot.forecast.confidence} confidence.`
      : null,
    comparison?.previousPeriodId
      ? comparison.usageDeltaPercent == null
        ? "A previous electricity period is available, but percentage usage change could not be computed."
        : `Current usage is ${Math.abs(comparison.usageDeltaPercent)}% ${comparison.usageDeltaPercent >= 0 ? "higher" : "lower"} than the previous comparable period.`
      : "No previous electricity period comparison is available in the snapshot.",
    snapshot.tenantSummary.count > 0
      ? `${snapshot.tenantSummary.count} tenant allocation summary item(s) are present.`
      : "No tenant allocation summaries are present yet.",
  ].filter(Boolean);

  const actions = [
    validationState !== "ok"
      ? "Review the listed validation issues and correct missing or inconsistent readings before sending bills."
      : null,
    anomalyRisk !== "none"
      ? "Compare the period usage against meter readings and tenant movement events before publishing."
      : null,
    snapshot.forecast
      ? "Use the forecast as an early warning only; close the period with actual readings before billing."
      : null,
    comparison?.previousPeriodId
      ? "Document the previous-period comparison if usage changed materially before publishing."
      : "Add a review note that no previous electricity period was available for comparison.",
    "Keep deterministic billing rules as the final source of truth for sending decisions.",
  ].filter(Boolean);

  const riskDrivers = [
    validationState === "blocked"
      ? "Deterministic validation is blocking this period."
      : validationState === "warning"
        ? "Deterministic validation has warning-level data quality issues."
        : null,
    anomalyRisk !== "none"
      ? `Anomaly rules classify usage as ${anomalyRisk} risk.`
      : null,
    hasUsageIncrease
      ? `Usage increased by ${comparison.usageDeltaPercent}% compared with the previous period.`
      : null,
    snapshot.forecast?.confidence === "low"
      ? "Open-period forecast has low confidence."
      : null,
  ].filter(Boolean);

  const reviewChecklist = [
    "Confirm the opening and closing meter readings against the source record.",
    validationState !== "ok"
      ? "Resolve or document each deterministic validation issue before sending bills."
      : "Confirm there are no unresolved deterministic validation warnings.",
    anomalyRisk !== "none"
      ? "Compare anomaly reasons with tenant move-in, move-out, and appliance events."
      : "Check that usage looks reasonable against room occupancy for the period.",
    comparison?.previousPeriodId
      ? "Compare current usage and charge against the previous electricity period."
      : "Record that no previous electricity period comparison was available.",
    snapshot.tenantSummary.count > 0
      ? "Verify tenant allocation totals match the generated bill breakdown."
      : "Generate tenant allocation summaries before publishing tenant bills.",
    "Keep review notes available for tenant billing questions.",
  ].filter(Boolean);

  return {
    headline:
      riskLevel === "blocked"
        ? "This electricity period needs deterministic fixes before bills can be sent."
        : riskLevel === "none"
          ? "This electricity period has no major review signal in the current rules."
          : "This electricity period should be reviewed before sending.",
    summary: [
      `${snapshot.room.name} is in ${snapshot.period.billingLabel || snapshot.period.status || "unknown"} state.`,
      `Validation is ${validationState}; anomaly risk is ${anomalyRisk}.`,
      snapshot.forecast?.projectedCharge != null
        ? `Projected charge is PHP ${Number(snapshot.forecast.projectedCharge).toLocaleString("en-PH")}.`
        : null,
    ].filter(Boolean).join(" "),
    riskLevel,
    keyFindings: findings.slice(0, MAX_FINDINGS),
    recommendedActions: actions.slice(0, MAX_ACTIONS),
    riskDrivers: riskDrivers.length
      ? riskDrivers.slice(0, MAX_RISK_DRIVERS)
      : ["No major risk driver stands out from validation, anomaly, or comparison rules."],
    reviewChecklist: reviewChecklist.slice(0, MAX_CHECKLIST_ITEMS),
    disputePreventionNote:
      riskLevel === "blocked" || riskLevel === "high"
        ? "Do not rely on this review to publish bills; resolve the deterministic billing issues first so tenants can be shown a clean reading and allocation trail."
        : "Reviewing these signals before publishing reduces disputes because admins can explain unusual usage, allocation changes, and reading evidence from the billing record.",
    tenantExplanationDraft:
      riskLevel === "blocked"
        ? "A tenant-facing explanation should be prepared after the admin resolves the blocked electricity billing review items."
        : `${snapshot.room.name} electricity charges are based on the recorded meter readings, the room's total usage, and the dormitory allocation rules for the billing period.`,
    confidence:
      validationState === "ok" && snapshot.anomaly.confidence === "high"
        ? "high"
        : snapshot.anomaly.confidence === "low"
          ? "low"
          : "medium",
  };
};

const billingInsightResponseSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    riskLevel: {
      type: "string",
      enum: ["none", "low", "medium", "high", "blocked"],
    },
    keyFindings: {
      type: "array",
      minItems: 1,
      maxItems: MAX_FINDINGS,
      items: { type: "string" },
    },
    recommendedActions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_ACTIONS,
      items: { type: "string" },
    },
    riskDrivers: {
      type: "array",
      minItems: 1,
      maxItems: MAX_RISK_DRIVERS,
      items: { type: "string" },
    },
    reviewChecklist: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CHECKLIST_ITEMS,
      items: { type: "string" },
    },
    disputePreventionNote: { type: "string" },
    tenantExplanationDraft: { type: "string" },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
  },
  required: [
    "headline",
    "summary",
    "riskLevel",
    "keyFindings",
    "recommendedActions",
    "riskDrivers",
    "reviewChecklist",
    "disputePreventionNote",
    "tenantExplanationDraft",
    "confidence",
  ],
};

const buildGeminiPrompt = (snapshot) =>
  [
    "You are an assistant for dormitory utility billing review.",
    "Explain the electricity billing period using only the provided snapshot.",
    "Write for a busy dormitory owner or admin. Be short, plain, and practical.",
    "Your output is advisory only. Do not approve, reject, edit, waive, send, or block a bill.",
    "Treat deterministic validation and billing rules as the source of truth.",
    "Do not invent readings, charges, tenants, dates, policy, payment status, or missing data.",
    "Recommend human review actions only.",
    "Explain why the risk could create a billing dispute before publishing.",
    "Use riskDrivers for concise reasons behind the risk level.",
    "Use reviewChecklist for concrete admin verification steps; keep each item short.",
    "Use disputePreventionNote as one short owner-friendly sentence.",
    "Use tenantExplanationDraft only as draft text for later human review; do not say it was sent.",
    "Avoid repeating the same fact across sections.",
    "",
    "Billing snapshot:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");

const parseGeminiText = (body) => {
  const text = body?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty billing insight response.");
  return JSON.parse(text);
};

const generateGeminiInsight = async (snapshot) => {
  const apiKey = String(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
  ).trim();
  const model = String(process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_AI_API_KEY is not configured.");
  }
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
            parts: [{ text: buildGeminiPrompt(snapshot) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1100,
          responseMimeType: "application/json",
          responseSchema: billingInsightResponseSchema,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Gemini request failed with ${response.status}: ${errorText.slice(0, 180)}`,
      );
    }

    return {
      model,
      insight: normalizeBillingInsight(
        parseGeminiText(await response.json()),
        "gemini",
        false,
        snapshot,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const generateBillingIntelligence = async (snapshot) => {
  const requestedProvider = String(process.env.AI_INSIGHTS_PROVIDER || "heuristic")
    .trim()
    .toLowerCase();

  if (requestedProvider === "gemini") {
    try {
      const result = await generateGeminiInsight(snapshot);
      return {
        ...result,
        fallbackReason: null,
      };
    } catch (error) {
      const insight = normalizeBillingInsight(
        buildHeuristicInsight(snapshot),
        "heuristic-fallback",
        true,
        snapshot,
      );
      return {
        model: null,
        insight,
        fallbackReason: error?.message || "AI provider unavailable.",
      };
    }
  }

  return {
    model: null,
    insight: normalizeBillingInsight(
      buildHeuristicInsight(snapshot),
      "heuristic-fallback",
      true,
      snapshot,
    ),
    fallbackReason: null,
  };
};
