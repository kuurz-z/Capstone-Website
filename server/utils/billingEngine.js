/**
 * ============================================================================
 * UNIFIED BILLING ENGINE
 * ============================================================================
 *
 * Computes billing costs for UtilityPeriods (Electricity and Water).
 * Uses a Hybrid Strategy:
 * 1. Segment-Based Math: If intermediate readings (move-in/out) exist,
 *    calculates precise costs per reading gap.
 * 2. Graceful Proration Fallback: If no intermediate readings exist,
 *    splits the total cost by calendar days stayed (overlap days).
 *
 * ============================================================================
 */

import dayjs from "dayjs";

export const truncate4 = (n) => Math.floor(n * 10000) / 10000;
export const roundMoney = (n) => Math.round(n * 100) / 100;

function formatDurationRange(checkInDate, checkOutDate) {
  if (!checkInDate) return "Ongoing";

  const startLabel = dayjs(checkInDate).format("MMM D, YYYY");
  const endLabel = checkOutDate
    ? dayjs(checkOutDate).format("MMM D, YYYY")
    : "Ongoing";
  return `${startLabel} - ${endLabel}`;
}

// ============================================================================
// 1. SEGMENT-BASED MATH (Exact Readings)
// ============================================================================

export function sortReadings(readings) {
  const eventPriority = {
    "move-out": 0,
    "regular-billing": 1,
    "period-start": 1,
    "period-end": 1,
    "manual-adjustment": 1,
    "move-in": 2,
  };
  return [...readings].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;

    const typePriorityDelta =
      (eventPriority[a.eventType] || 1) - (eventPriority[b.eventType] || 1);
    if (typePriorityDelta !== 0) return typePriorityDelta;

    const createdAtA = new Date(a.createdAt || 0).getTime();
    const createdAtB = new Date(b.createdAt || 0).getTime();
    if (createdAtA !== createdAtB) return createdAtA - createdAtB;

    const readingA = Number(a.reading || 0);
    const readingB = Number(b.reading || 0);
    if (readingA !== readingB) return readingA - readingB;

    return String(a._id || "").localeCompare(String(b._id || ""));
  });
}

function getActiveTenantsForSegment(segmentStartReading, tenantEvents) {
  return tenantEvents.filter((t) => {
    const movedIn = t.moveInReading <= segmentStartReading;
    const notMovedOut =
      t.moveOutReading === null ||
      t.moveOutReading === undefined ||
      t.moveOutReading > segmentStartReading;
    return movedIn && notMovedOut;
  });
}

function formatPeriodLabel(start, end) {
  const opts = { month: "short", day: "numeric" };
  const s = start.toLocaleDateString("en-US", opts);
  const e = end.toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
}

export function buildSegments(sortedReadings, tenantEvents) {
  if (!sortedReadings || sortedReadings.length < 2) return [];

  const segments = [];
  for (let i = 0; i < sortedReadings.length - 1; i++) {
    const startReading = sortedReadings[i];
    const endReading = sortedReadings[i + 1];

    const readingFrom = startReading.reading;
    const readingTo = endReading.reading;
    const unitsConsumed = readingTo - readingFrom;

    if (unitsConsumed < 0) {
      throw new Error(
        `Invalid reading sequence: reading ${readingTo} is lower than ${readingFrom}.`,
      );
    }

    const activeTenants = getActiveTenantsForSegment(readingFrom, tenantEvents);
    segments.push({
      segmentIndex: i,
      periodLabel: formatPeriodLabel(
        new Date(startReading.date),
        new Date(endReading.date),
      ),
      readingFrom,
      readingTo,
      unitsConsumed,
      activeTenantIds: activeTenants.map((t) => t.tenantId),
      coveredTenantNames: activeTenants.map((t) => t.tenantName),
      activeTenantCount: activeTenants.length,
      startDate: new Date(startReading.date),
      endDate: new Date(endReading.date),
      startEventType: startReading.eventType || "regular-billing",
      endEventType: endReading.eventType || "regular-billing",
    });
  }
  return segments;
}

export function computeSegmentShares(segment, ratePerUnit) {
  const { unitsConsumed, activeTenantCount } = segment;

  if (unitsConsumed === 0 || activeTenantCount === 0) {
    return { sharePerTenantUnits: 0, sharePerTenantCost: 0, totalCost: 0 };
  }

  if (activeTenantCount === 1) {
    const totalCost = truncate4(unitsConsumed * ratePerUnit);
    return {
      sharePerTenantUnits: unitsConsumed,
      sharePerTenantCost: totalCost,
      totalCost,
    };
  }

  const sharePerTenantUnits = truncate4(unitsConsumed / activeTenantCount);
  const totalCost = truncate4(unitsConsumed * ratePerUnit);
  const sharePerTenantCost = truncate4(totalCost / activeTenantCount);

  return { sharePerTenantUnits, sharePerTenantCost, totalCost };
}

// ============================================================================
// 2. PRORATION FALLBACK (Calendar Days)
// ============================================================================

export function calculateOverlapDays(
  checkInDate,
  checkOutDate,
  cycleStart,
  cycleEnd,
) {
  const start = Math.max(
    dayjs(checkInDate).startOf("day").valueOf(),
    dayjs(cycleStart).startOf("day").valueOf(),
  );
  const end = Math.min(
    dayjs(checkOutDate || cycleEnd)
      .startOf("day")
      .valueOf(),
    dayjs(cycleEnd).startOf("day").valueOf(),
  );

  if (start >= end) return 0;
  return dayjs(end).diff(dayjs(start), "day");
}

function distributeCents(totalAmount, recipientCount) {
  if (recipientCount <= 0) return [];

  const totalCents = Math.max(0, Math.round(Number(totalAmount || 0) * 100));
  const baseShare = Math.floor(totalCents / recipientCount);
  let remainder = totalCents - baseShare * recipientCount;

  return Array.from({ length: recipientCount }, () => {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return share;
  });
}

export function buildProratedShareAmounts(
  totalAmount,
  reservations,
  cycleStart,
  cycleEnd,
) {
  if (reservations.length === 0) return [];

  const tenantDaysArray = reservations.map((res) =>
    calculateOverlapDays(
      res.checkInDate,
      res.checkOutDate,
      cycleStart,
      cycleEnd,
    ),
  );

  const totalDays = tenantDaysArray.reduce((sum, days) => sum + days, 0);

  if (totalDays <= 0) {
    return distributeCents(totalAmount, reservations.length).map(
      (cents) => cents / 100,
    );
  }

  const totalCents = Math.max(0, Math.round(Number(totalAmount || 0) * 100));
  const rawShares = tenantDaysArray.map(
    (days) => (days / totalDays) * totalCents,
  );
  const baseShares = rawShares.map(Math.floor);

  let remainder = totalCents - baseShares.reduce((a, b) => a + b, 0);
  const fractionals = rawShares.map((raw, index) => ({
    index,
    frac: raw - baseShares[index],
  }));
  fractionals.sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i++) {
    baseShares[fractionals[i].index] += 1;
  }

  return baseShares.map((cents) => cents / 100);
}

// ============================================================================
// ENGINE ORCHESTRATOR
// ============================================================================

export function computeBilling({
  utilityPeriod,
  readings = [],
  reservations = [],
  tenantEvents = [], // extracted from readings if segment-based
  forceSegmented = false,
}) {
  const { startDate, endDate, startReading, endReading, ratePerUnit } =
    utilityPeriod;
  const totalUnits = endReading - startReading;
  const totalCost = truncate4(totalUnits * ratePerUnit);

  // Exclude baseline readings to determine if there are intermediate lifecycle events.
  const intermediateReadings = readings.filter(
    (r) => r.eventType === "move-in" || r.eventType === "move-out",
  );

  // Strategy 1: Segment-Based Math
  if (forceSegmented || intermediateReadings.length > 0) {
    const sorted = sortReadings(readings);
    const rawSegments = buildSegments(sorted, tenantEvents);

    if (forceSegmented && rawSegments.length === 0) {
      throw new Error(
        "Cannot compute segmented billing without at least two ordered meter events (period start and period end).",
      );
    }

    const segments = rawSegments.map((seg) => {
      if (
        forceSegmented &&
        seg.unitsConsumed > 0 &&
        seg.activeTenantCount === 0
      ) {
        throw new Error(
          `Segment ${seg.segmentIndex + 1} has consumption but no active tenants. Check occupancy and lifecycle meter events.`,
        );
      }
      const shares = computeSegmentShares(seg, ratePerUnit);
      return { ...seg, ...shares, ratePerUnit };
    });

    const tenantKwhMap = new Map();
    for (const segment of segments) {
      for (const tenantId of segment.activeTenantIds) {
        const key = String(tenantId);
        tenantKwhMap.set(
          key,
          (tenantKwhMap.get(key) || 0) + segment.sharePerTenantUnits,
        );
      }
    }

    const tenantSummaries = [];
    for (const [tenantIdStr, rawKwh] of tenantKwhMap) {
      const totalUsage = truncate4(rawKwh);
      const billAmount = truncate4(totalUsage * ratePerUnit);
      const event = tenantEvents.find(
        (t) => String(t.tenantId) === tenantIdStr,
      );

      const reservation = reservations.find(
        (r) => String(r.userId?._id || r.userId) === tenantIdStr,
      );

      tenantSummaries.push({
        tenantId: tenantIdStr,
        reservationId: reservation?._id || null,
        tenantName: event?.tenantName || "Unknown Tenant",
        tenantEmail:
          reservation?.userId?.email ||
          reservation?.billingEmail ||
          event?.tenantEmail ||
          null,
        durationRange: formatDurationRange(
          reservation?.checkInDate || event?.checkInDate || null,
          reservation?.checkOutDate || event?.checkOutDate || null,
        ),
        totalUsage,
        billAmount,
      });
    }

    const sumTenantKwh = tenantSummaries.reduce(
      (sum, t) => sum + t.totalUsage,
      0,
    );
    const valid = Math.abs(sumTenantKwh - totalUnits) <= 0.01;

    return {
      strategy: forceSegmented ? "segment-based-strict" : "segment-based",
      segments,
      tenantSummaries,
      computedTotalUsage: totalUnits,
      computedTotalCost: totalCost,
      verified: valid,
    };
  }

  // Strategy 2: Graceful Proration Fallback
  else {
    const shareAmounts = buildProratedShareAmounts(
      totalCost,
      reservations,
      startDate,
      endDate,
    );
    const tenantCount = reservations.length;

    const tenantSummaries = reservations.map((res, i) => {
      const user = res.userId;
      const tenantName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : "Tenant";
      const shareAmount = shareAmounts[i] || 0;

      const shareProportion =
        totalCost > 0 ? shareAmount / totalCost : 1 / (tenantCount || 1);
      const totalUsage = truncate4(totalUnits * shareProportion);

      return {
        tenantId: user?._id || null,
        reservationId: res._id,
        tenantName,
        tenantEmail: user?.email || res?.billingEmail || null,
        durationRange: formatDurationRange(res.checkInDate, res.checkOutDate),
        totalUsage,
        billAmount: shareAmount,
      };
    });

    // We build one giant segment so the frontend still has visual data
    const fallbackSegment = {
      segmentIndex: 0,
      periodLabel: formatPeriodLabel(new Date(startDate), new Date(endDate)),
      readingFrom: startReading,
      readingTo: endReading,
      unitsConsumed: totalUnits,
      totalCost,
      ratePerUnit,
      activeTenantCount: tenantCount,
      sharePerTenantUnits: truncate4(totalUnits / (tenantCount || 1)),
      sharePerTenantCost: truncate4(totalCost / (tenantCount || 1)),
      startDate,
      endDate,
      activeTenantIds: tenantSummaries.map((t) => t.tenantId).filter(Boolean),
      coveredTenantNames: tenantSummaries.map((t) => t.tenantName),
    };

    return {
      strategy: "proration",
      segments: [fallbackSegment],
      tenantSummaries,
      computedTotalUsage: totalUnits,
      computedTotalCost: totalCost,
      verified: true,
    };
  }
}
