import {
  average,
  buildElectricityHistoryMetrics,
  buildElectricityPeriodMetrics,
  getTenantHistoryMetrics,
} from "./electricityReviewMetrics.js";
import { findMissingElectricityLifecycleReadings } from "./utilityFlowRules.js";
import { getUtilityTargetCloseDate } from "./billingPolicy.js";

const ROOM_SPIKE_RATIO = 1.5;
const TENANT_SPIKE_RATIO = 1.6;
const MIN_BASELINE = 0.5;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function daysBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((end - start) / msPerDay));
}

function getIssueSeverity(issues = []) {
  if (issues.some((issue) => issue.severity === "blocked")) return "blocked";
  if (issues.length > 0) return "warning";
  return "ok";
}

function buildDataQualityIssues({ period, readings = [], reservations = [] }) {
  const issues = [];

  if (!period) {
    return issues;
  }

  const missingReadings = findMissingElectricityLifecycleReadings({
    period,
    readings,
    reservations,
  });

  for (const entry of missingReadings.missingMoveInReadings) {
    issues.push({
      code: "missing_move_in_reading",
      severity: "warning",
      message: `Missing move-in electricity reading for ${entry.tenantName}.`,
      tenantId: entry.tenantId,
      reservationId: entry.reservationId,
    });
  }

  for (const entry of missingReadings.missingMoveOutReadings) {
    issues.push({
      code: "missing_move_out_reading",
      severity: "warning",
      message: `Missing move-out electricity reading for ${entry.tenantName}.`,
      tenantId: entry.tenantId,
      reservationId: entry.reservationId,
    });
  }

  if (
    period.endReading != null &&
    Number(period.endReading) < Number(period.startReading)
  ) {
    issues.push({
      code: "reading_decreased",
      severity: "blocked",
      message: "End reading is lower than the start reading.",
    });
  }

  if (
    period.status !== "open" &&
    toNumber(period.computedTotalUsage) > 0 &&
    !(period.tenantSummaries || []).length
  ) {
    issues.push({
      code: "missing_tenant_summaries",
      severity: "blocked",
      message: "Closed electricity period has usage but no tenant summaries.",
    });
  }

  if (period.status !== "open" && period.verified === false) {
    issues.push({
      code: "allocation_unverified",
      severity: "warning",
      message: "Tenant allocation did not fully match room consumption.",
    });
  }

  return issues;
}

function buildAnomalyReview({ currentMetrics, historyMetrics = [] }) {
  if (!currentMetrics || currentMetrics.status === "open") {
    return {
      riskLevel: "none",
      score: 0,
      confidence: "low",
      reasons: [],
      metrics: currentMetrics,
    };
  }

  const reasons = [];
  let score = 0;
  let confidence = historyMetrics.length >= 3 ? "high" : "medium";
  if (historyMetrics.length === 0) confidence = "low";

  const roomBaseline = average(
    historyMetrics
      .map((entry) => entry.kwhPerTenantDay)
      .filter((value) => value != null),
  );

  if (
    currentMetrics.kwhPerTenantDay != null &&
    roomBaseline != null &&
    roomBaseline >= MIN_BASELINE &&
    currentMetrics.kwhPerTenantDay > roomBaseline * ROOM_SPIKE_RATIO
  ) {
    score += 35;
    reasons.push({
      code: "room_spike",
      severity: "medium",
      message: "Room usage is unusually high after adjusting for occupied tenant-days.",
      baseline: Number(roomBaseline.toFixed(4)),
      actual: currentMetrics.kwhPerTenantDay,
    });
  }

  if (
    currentMetrics.occupiedTenantDays > 0 &&
    currentMetrics.totalKwh > 0 &&
    currentMetrics.totalKwh < 1
  ) {
    score += 20;
    reasons.push({
      code: "near_zero_occupied_usage",
      severity: "low",
      message: "Occupied room has near-zero electricity usage.",
      actual: currentMetrics.totalKwh,
    });
  }

  for (const tenant of currentMetrics.tenantMetrics || []) {
    const tenantHistory = getTenantHistoryMetrics({
      tenantId: tenant.tenantId,
      historyMetrics,
    });

    if (!tenantHistory.length) {
      confidence = "low";
      reasons.push({
        code: "new_tenant_low_confidence",
        severity: "low",
        message: `${tenant.tenantName} has no previous electricity history, so review confidence is lower.`,
        tenantId: tenant.tenantId,
      });
      continue;
    }

    const tenantBaseline = average(
      tenantHistory.map((entry) => entry.kwhPerCoveredDay),
    );
    if (
      tenant.kwhPerCoveredDay != null &&
      tenantBaseline != null &&
      tenantBaseline >= MIN_BASELINE &&
      tenant.kwhPerCoveredDay > tenantBaseline * TENANT_SPIKE_RATIO
    ) {
      score += 30;
      reasons.push({
        code: "tenant_spike",
        severity: "medium",
        message: `${tenant.tenantName}'s electricity share is unusually high compared with their past usage.`,
        tenantId: tenant.tenantId,
        baseline: Number(tenantBaseline.toFixed(4)),
        actual: tenant.kwhPerCoveredDay,
      });
    }
  }

  const riskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : score > 0 ? "low" : "none";

  return {
    riskLevel,
    score,
    confidence,
    reasons,
    metrics: currentMetrics,
  };
}

function buildForecast({ period, readings = [], historyMetrics = [] }) {
  if (!period || period.status !== "open") return null;

  const startReading = toNumber(period.startReading);
  const targetCloseDate = getUtilityTargetCloseDate(period.startDate);
  const cycleDays = daysBetween(period.startDate, targetCloseDate);
  const latestReading = [...readings]
    .filter((reading) => reading.reading != null)
    .sort((left, right) => new Date(right.date) - new Date(left.date))[0];

  if (latestReading && Number(latestReading.reading) > startReading) {
    const elapsedDays = daysBetween(period.startDate, latestReading.date);
    const currentKwh = Math.max(0, Number(latestReading.reading) - startReading);
    const projectedKwh = Number(((currentKwh / elapsedDays) * cycleDays).toFixed(2));
    return {
      projectedKwh,
      projectedCharge: Number((projectedKwh * toNumber(period.ratePerUnit)).toFixed(2)),
      projectedEndReading: Number((startReading + projectedKwh).toFixed(2)),
      confidence: elapsedDays >= 7 ? "medium" : "low",
      drivers: ["current usage rate", "target close date", "period rate"],
      basedOn: "current_run_rate",
    };
  }

  const historicalAverage = average(historyMetrics.map((entry) => entry.totalKwh));
  if (historicalAverage == null) {
    return {
      projectedKwh: null,
      projectedCharge: null,
      projectedEndReading: null,
      confidence: "low",
      drivers: ["insufficient electricity history"],
      basedOn: "insufficient_data",
    };
  }

  return {
    projectedKwh: Number(historicalAverage.toFixed(2)),
    projectedCharge: Number((historicalAverage * toNumber(period.ratePerUnit)).toFixed(2)),
    projectedEndReading: Number((startReading + historicalAverage).toFixed(2)),
    confidence: historyMetrics.length >= 3 ? "medium" : "low",
    drivers: ["room electricity history", "period rate"],
    basedOn: "room_history",
  };
}

export function buildElectricityReview({
  period = null,
  periods = [],
  readings = [],
  reservations = [],
} = {}) {
  if (!period || period.utilityType !== "electricity") return null;

  const currentMetrics = buildElectricityPeriodMetrics(period);
  const historyMetrics = buildElectricityHistoryMetrics({
    currentPeriod: period,
    periods,
  });
  const dataQualityIssues = buildDataQualityIssues({
    period,
    readings,
    reservations,
  });
  const validationState = getIssueSeverity(dataQualityIssues);
  const anomalyReview = buildAnomalyReview({ currentMetrics, historyMetrics });
  const forecast = buildForecast({ period, readings, historyMetrics });
  const reviewRequired =
    validationState !== "ok" || anomalyReview.riskLevel !== "none";

  return {
    validationState,
    reviewRequired,
    canSendBill: validationState !== "blocked",
    dataQualityIssues,
    anomalyReview,
    forecast,
  };
}

