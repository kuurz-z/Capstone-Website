import dayjs from "dayjs";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function daysBetween(startValue, endValue) {
  const start = dayjs(startValue).startOf("day");
  const end = dayjs(endValue).startOf("day");
  if (!start.isValid() || !end.isValid()) return 0;
  return Math.max(1, end.diff(start, "day"));
}

function getTenantKey(value) {
  if (!value) return null;
  return String(value._id || value);
}

function summarizeTenantUsage(summary) {
  const totalUsage = toNumber(summary?.totalUsage);
  const coveredDays = toNumber(summary?.coveredDays);
  return {
    tenantId: getTenantKey(summary?.tenantId),
    tenantName: summary?.tenantName || "Tenant",
    totalUsage,
    coveredDays,
    kwhPerCoveredDay:
      coveredDays > 0 ? Number((totalUsage / coveredDays).toFixed(4)) : null,
  };
}

export function buildElectricityPeriodMetrics(period) {
  if (!period || period.utilityType !== "electricity") return null;

  const startReading = toNumber(period.startReading);
  const endReading =
    period.endReading == null ? null : toNumber(period.endReading, null);
  const computedTotalUsage = toNumber(period.computedTotalUsage);
  const totalKwh =
    endReading != null
      ? Math.max(0, endReading - startReading)
      : computedTotalUsage;
  const cycleEnd = period.endDate || period.closedAt || new Date();
  const cycleDays = daysBetween(period.startDate, cycleEnd);
  const tenantMetrics = (period.tenantSummaries || []).map(summarizeTenantUsage);
  const occupiedTenantDays = tenantMetrics.reduce(
    (sum, entry) => sum + toNumber(entry.coveredDays),
    0,
  );

  return {
    periodId: getTenantKey(period._id),
    status: period.status,
    startDate: period.startDate,
    endDate: period.endDate || null,
    startReading,
    endReading,
    ratePerUnit: toNumber(period.ratePerUnit),
    totalKwh,
    cycleDays,
    occupiedTenantDays,
    tenantCount: tenantMetrics.length,
    kwhPerTenantDay:
      occupiedTenantDays > 0
        ? Number((totalKwh / occupiedTenantDays).toFixed(4))
        : null,
    tenantMetrics,
  };
}

export function buildElectricityHistoryMetrics({
  currentPeriod,
  periods = [],
} = {}) {
  const currentId = getTenantKey(currentPeriod?._id);
  return periods
    .filter((period) => period?.utilityType === "electricity")
    .filter((period) => period.status !== "open")
    .filter((period) => getTenantKey(period._id) !== currentId)
    .map(buildElectricityPeriodMetrics)
    .filter(Boolean);
}

export function average(values) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!cleanValues.length) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

export function getTenantHistoryMetrics({ tenantId, historyMetrics = [] } = {}) {
  const tenantKey = getTenantKey(tenantId);
  if (!tenantKey) return [];

  return historyMetrics
    .flatMap((period) => period.tenantMetrics || [])
    .filter((entry) => entry.tenantId === tenantKey)
    .filter((entry) => Number.isFinite(entry.kwhPerCoveredDay));
}

