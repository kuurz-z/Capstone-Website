/**
 * ============================================================================
 * UNIFIED BILLING ENGINE SERVICE
 * ============================================================================
 *
 * Computes billing costs for UtilityPeriods (Electricity and Water).
 * Uses a Hybrid Strategy:
 * 1. Segment-Based Math: If intermediate readings (move-in/out) exist,
 *    calculates precise costs per reading gap.
 * 2. Graceful Proration Fallback: If no intermediate readings exist,
 *    splits the total cost by calendar days stayed (overlap days).
 */

import dayjs from "dayjs";
import { computeWaterMeterBilling } from './waterMeterEngine.js';
import {
  isUtilityEventType,
  readMoveInDate,
  readMoveOutDate,
} from "../../utils/lifecycleNaming.js";
import {
  readRoomScopedMoveInDate,
  readRoomScopedMoveOutDate,
} from "../../utils/utilityFlowRules.js";
import {
  toCents,
  toPesos,
  hamiltonAllocate,
  verifyReconciliation,
} from "./financialMath.js";

export const truncate4 = (n) => Math.floor(n * 10000) / 10000;
/** @deprecated Use toPesos/toCents from financialMath.js */
export const roundMoney = (n) => Math.round(n * 100) / 100;

const WATER_SHARED_ROOM_TYPES = new Set([
  "double-sharing",
  "quadruple-sharing",
]);

function normalizeRoomType(roomType) {
  return String(roomType || "")
    .trim()
    .toLowerCase();
}

function formatDurationRange(checkInDate, checkOutDate) {
  if (!checkInDate) return "Ongoing";

  const startLabel = dayjs(checkInDate).format("MMM D, YYYY");
  const endLabel = checkOutDate
    ? dayjs(checkOutDate).format("MMM D, YYYY")
    : "Ongoing";
  return `${startLabel} - ${endLabel}`;
}

function getReservationOverlapDays(reservation, cycleStart, cycleEnd) {
  // Room-scoped: for a tenant who transferred into/out of THIS room, the
  // occupancy window that counts for the room's water proration is their
  // BedHistory boundary for the room, not the whole-dorm tenancy dates. The
  // reader falls back to the global reservation dates for a normal tenant
  // (no _roomScopedMove* stamp), so non-transfer water billing is unchanged.
  // The allocation formula (coveredDays / totalCoveredDays) is untouched —
  // only the per-tenant occupancy window is corrected.
  const moveInDate = readRoomScopedMoveInDate(reservation);
  if (!moveInDate) return 0;

  const cycleStartDay = dayjs(cycleStart).startOf("day");
  const cycleEndDay = dayjs(cycleEnd).startOf("day");
  const moveInDay = dayjs(moveInDate).startOf("day");
  const moveOutDay = dayjs(readRoomScopedMoveOutDate(reservation) || cycleEnd).startOf("day");

  const effectiveStart = moveInDay.isAfter(cycleStartDay)
    ? moveInDay
    : cycleStartDay;
  const effectiveEnd = moveOutDay.isBefore(cycleEndDay)
    ? moveOutDay
    : cycleEndDay;

  if (!effectiveStart.isValid() || !effectiveEnd.isValid()) return 0;

  const overlapDays = effectiveStart.isBefore(effectiveEnd)
    ? effectiveEnd.diff(effectiveStart, "day")
    : 0;

  // Plan 2 (Lifecycle Edge Case): If a tenant checked in within this billing cycle
  // but checked out the same day (0 overlap days), enforce a minimum of 1 billed day.
  // This prevents a zero-charge same-day stay and matches the non-refundable minimum
  // stay policy. Only applies when the move-in itself falls within the cycle window.
  const moveInWithinCycle =
    (moveInDay.isSame(cycleStartDay) || moveInDay.isAfter(cycleStartDay)) &&
    moveInDay.isBefore(cycleEndDay);
  if (overlapDays === 0 && moveInWithinCycle) return 1;

  return overlapDays;
}

function buildWaterOccupancyBilling({
  utilityPeriod,
  reservations = [],
  roomType = null,
}) {
  const cycleStart = utilityPeriod?.startDate;
  const cycleEnd = utilityPeriod?.endDate || utilityPeriod?.startDate;
  const totalWaterCharge = truncate4(Number(utilityPeriod?.ratePerUnit || 0));
  const normalizedRoomType = normalizeRoomType(roomType);
  const sharedRoom = WATER_SHARED_ROOM_TYPES.has(normalizedRoomType);

  const buckets = new Map();
  for (const reservation of reservations) {
    const coveredDays = getReservationOverlapDays(
      reservation,
      cycleStart,
      cycleEnd,
    );
    if (coveredDays <= 0) continue;

    const tenantKey = String(
      reservation.userId?._id || reservation.userId || "",
    );
    if (!tenantKey) continue;

    // Room-scoped occupancy dates for the display/metadata window too, so the
    // per-tenant range shown for a transferred tenant reflects their time in
    // THIS room. Falls back to the global dates for a normal tenant.
    const scopedIn = readRoomScopedMoveInDate(reservation);
    const scopedOut = readRoomScopedMoveOutDate(reservation);

    const bucket = buckets.get(tenantKey) || {
      tenantId: tenantKey,
      reservationId: reservation._id || null,
      tenantName: reservation.userId?.firstName
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Tenant",
      tenantEmail:
        reservation.userId?.email || reservation.billingEmail || null,
      coveredDays: 0,
      firstCheckInDate: scopedIn,
      lastCheckOutDate: scopedOut,
      overlapStart: scopedIn,
      overlapEnd: scopedOut,
    };

    bucket.coveredDays += coveredDays;
    if (
      bucket.overlapStart === null ||
      (scopedIn && new Date(scopedIn) < new Date(bucket.overlapStart))
    ) {
      bucket.overlapStart = scopedIn || bucket.overlapStart;
      bucket.firstCheckInDate = scopedIn || bucket.firstCheckInDate;
    }
    if (
      !bucket.overlapEnd ||
      (scopedOut && new Date(scopedOut) > new Date(bucket.overlapEnd))
    ) {
      bucket.overlapEnd = scopedOut || bucket.overlapEnd;
      bucket.lastCheckOutDate = scopedOut || bucket.lastCheckOutDate;
    }

    buckets.set(tenantKey, bucket);
  }

  const tenantRows = [...buckets.values()].sort((left, right) => {
    const leftDate = new Date(
      left.overlapStart || left.firstCheckInDate || 0,
    ).getTime();
    const rightDate = new Date(
      right.overlapStart || right.firstCheckInDate || 0,
    ).getTime();
    return leftDate - rightDate;
  });

  const totalCoveredDays = tenantRows.reduce(
    (sum, row) => sum + row.coveredDays,
    0,
  );
  const useFixedPrivateRule = !sharedRoom && tenantRows.length === 1;

  const tenantSummaries = tenantRows.map((row) => {
    const shareFactor = useFixedPrivateRule
      ? 1
      : totalCoveredDays > 0
        ? row.coveredDays / totalCoveredDays
        : 0;

    return {
      tenantId: row.tenantId,
      reservationId: row.reservationId,
      tenantName: row.tenantName,
      tenantEmail: row.tenantEmail,
      totalUsage: truncate4(row.coveredDays),
      coveredDays: truncate4(row.coveredDays),
      shareFactor: truncate4(shareFactor),
      allocationRule: useFixedPrivateRule
        ? "private-fixed"
        : "shared-prorated-days",
      billingBasis: "occupancy-overlap",
      overlapStart: row.overlapStart,
      overlapEnd: row.overlapEnd,
      durationRange: formatDurationRange(
        row.firstCheckInDate,
        row.lastCheckOutDate,
      ),
      billAmount: useFixedPrivateRule
        ? totalWaterCharge
        : truncate4(totalWaterCharge * shareFactor),
    };
  });

  if (!useFixedPrivateRule && tenantSummaries.length > 0) {
    const totalCents = Math.max(0, Math.round(totalWaterCharge * 100));
    const rawShares = tenantRows.map((row) => {
      const shareFactor =
        totalCoveredDays > 0 ? row.coveredDays / totalCoveredDays : 0;
      return shareFactor * totalCents;
    });
    const baseShares = rawShares.map(Math.floor);
    let remainder =
      totalCents - baseShares.reduce((sum, cents) => sum + cents, 0);
    const fractionals = rawShares.map((raw, index) => ({
      index,
      frac: raw - baseShares[index],
      days: tenantSummaries[index].coveredDays || 0,
    }));
    fractionals.sort((left, right) => {
      if (right.frac !== left.frac) return right.frac - left.frac;
      if (right.days !== left.days) return right.days - left.days;
      return left.index - right.index;
    });
    for (let i = 0; i < remainder; i += 1) {
      baseShares[fractionals[i].index] += 1;
    }
    tenantSummaries.forEach((summary, index) => {
      summary.billAmount = baseShares[index] / 100;
    });
  }

  const sumTenantCharges = tenantSummaries.reduce(
    (sum, entry) => sum + Number(entry.billAmount || 0),
    0,
  );

  return {
    strategy: "occupancy-day-proration",
    segments: [],
    tenantSummaries,
    computedTotalUsage: truncate4(totalCoveredDays),
    computedTotalCost: totalWaterCharge,
    verified:
      Math.abs(sumTenantCharges - totalWaterCharge) <= 0.01 ||
      totalWaterCharge === 0,
  };
}

export function sortReadings(readings) {
  const eventPriority = {
    // Boundary/close events sort first within the same timestamp
    moveOut: 0,
    // Plan 1: Meter boundary events sort like moveOut (they close the old segment)
    meterReplacement: 0,
    meterRollover: 0,
    // Regular events in the middle
    regularBilling: 1,
    periodStart: 1,
    periodEnd: 1,
    manualAdjustment: 1,
    // Move-in events sort last (they open a new segment after boundary is closed)
    moveIn: 2,
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

/**
 * Detect duplicate timestamps in the reading sequence.
 * Returns an array of { date, eventType } objects for duplicates.
 * @param {Array} sortedReadings
 * @returns {{ date: Date, eventType: string }[]}
 */
export function detectDuplicateTimestamps(sortedReadings) {
  const seen = new Map();
  const duplicates = [];
  for (const reading of sortedReadings) {
    const key = `${new Date(reading.date).getTime()}:${reading.eventType || ""}`;
    if (seen.has(key)) {
      duplicates.push({ date: new Date(reading.date), eventType: reading.eventType });
    } else {
      seen.set(key, true);
    }
  }
  return duplicates;
}

export function buildSegments(sortedReadings, tenantEvents) {
  if (!sortedReadings || sortedReadings.length < 2) return [];

  // Phase 2: Detect duplicate timestamps before building segments
  const duplicates = detectDuplicateTimestamps(sortedReadings);
  if (duplicates.length > 0) {
    const detail = duplicates.map((d) => `${d.eventType}@${dayjs(d.date).format("YYYY-MM-DD")}`).join(", ");
    throw new Error(
      `DUPLICATE_TIMESTAMP: Duplicate meter reading timestamps detected: ${detail}. Remove duplicates before computing billing.`,
    );
  }

  const segments = [];
  for (let i = 0; i < sortedReadings.length - 1; i++) {
    const startReading = sortedReadings[i];
    const endReading = sortedReadings[i + 1];

    const readingFrom = startReading.reading;
    const readingTo = ["meterReplacement", "meterRollover"].includes(
      endReading.eventType,
    )
      ? endReading?.meterReset?.oldMeterFinalReading
      : endReading.reading;
    if (
      !Number.isFinite(Number(readingFrom)) ||
      !Number.isFinite(Number(readingTo))
    ) {
      throw new Error(
        "METER_RESET_BOUNDARY_INCOMPLETE: Meter replacement/rollover requires both the old final reading and new opening reading.",
      );
    }
    const unitsConsumed = readingTo - readingFrom;

    // Reset events contain both physical sides: the previous segment closes
    // on the old meter and the following segment starts on the new meter.
    if (unitsConsumed < 0) {
      throw new Error(
        `NEGATIVE_DELTA: Invalid reading sequence: reading ${readingTo} is lower than ${readingFrom} (segment ${i + 1}). Possible meter reset — flag for admin review.`,
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
      startEventType: startReading.eventType || "regularBilling",
      endEventType: endReading.eventType || "regularBilling",
    });
  }
  return segments;
}

export function computeSegmentShares(segment, ratePerUnit) {
  const { unitsConsumed, activeTenantCount } = segment;

  if (unitsConsumed === 0) {
    return { sharePerTenantUnits: 0, sharePerTenantCost: 0, totalCost: 0 };
  }

  // Phase 2: Zero-occupancy with consumption is an explicit anomaly, not a silent zero.
  if (activeTenantCount === 0) {
    return {
      sharePerTenantUnits: 0,
      sharePerTenantCost: 0,
      totalCost: 0,
      exception: "ZERO_OCCUPANCY_WITH_CONSUMPTION",
      exceptionDetail: `Segment consumed ${unitsConsumed} kWh but has no active tenants. Flag for admin review.`,
    };
  }

  const totalCost = truncate4(unitsConsumed * ratePerUnit);

  if (activeTenantCount === 1) {
    return {
      sharePerTenantUnits: unitsConsumed,
      sharePerTenantCost: totalCost,
      totalCost,
    };
  }

  // Phase 1: Use Hamilton cent allocation for multi-tenant splits
  // (equal weights per tenant — units are split evenly)
  const equalWeights = Array(activeTenantCount).fill(1);
  const totalCostCents = toCents(totalCost);
  const tieKeys = segment.activeTenantIds.map(String);
  const centShares = hamiltonAllocate(totalCostCents, equalWeights, tieKeys);

  const unitShare = truncate4(unitsConsumed / activeTenantCount);
  // Cost per tenant derived from Hamilton cents (ensures sum === totalCost exactly)
  const sharePerTenantCost = toPesos(centShares[0]); // representative; per-tenant costs in segments array

  return {
    sharePerTenantUnits: unitShare,
    sharePerTenantCost,
    totalCost,
    // Expose the per-tenant cent shares for aggregation
    _centSharesByTenantIndex: centShares,
  };
}

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
      // Room-scoped when a transfer stamped it; global dates otherwise.
      readRoomScopedMoveInDate(res),
      readRoomScopedMoveOutDate(res),
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

export function computeBilling({
  utilityPeriod,
  readings = [],
  reservations = [],
  tenantEvents = [],
  forceSegmented = false,
  utilityType = "electricity",
  roomType = null,
}) {
  const { startDate, endDate, startReading, endReading, ratePerUnit } =
    utilityPeriod;
  if (utilityType === "water") {
    if (utilityPeriod.calculationVersion === 'water-meter-v1') return computeWaterMeterBilling({utilityPeriod,readings,reservations,roomType});
    return buildWaterOccupancyBilling({
      utilityPeriod,
      reservations,
      roomType,
    });
  }

  let totalUnits = endReading - startReading;
  let totalCost = truncate4(totalUnits * ratePerUnit);

  const intermediateReadings = readings.filter(
    (r) =>
      isUtilityEventType(r.eventType, "moveIn") ||
      isUtilityEventType(r.eventType, "moveOut"),
  );

  if (forceSegmented || intermediateReadings.length > 0) {
    const sorted = sortReadings(readings);
    const rawSegments = buildSegments(sorted, tenantEvents);

    if (forceSegmented && rawSegments.length === 0) {
      throw new Error(
        "Cannot compute segmented billing without at least two ordered meter events (period start and period end).",
      );
    }

    // A reset-aware cycle is the sum of the physically meaningful segments,
    // not the simple difference between readings from two different meters.
    totalUnits = truncate4(
      rawSegments.reduce((sum, segment) => sum + segment.unitsConsumed, 0),
    );
    totalCost = truncate4(totalUnits * ratePerUnit);
    const segmentExceptions = [];
    // Plan 1 (D1): Segments with consumption but zero occupants across the entire
    // billing period are routed to branch overhead — no tenant is billed for them.
    const overheadSegments = [];

    const computedSegments = rawSegments.map((seg) => {
      const activeTenantIds = seg.activeTenantIds;
      const activeTenantCount = seg.activeTenantCount;
      const coveredTenantNames = seg.coveredTenantNames;

      // Segment-local occupancy is authoritative. A consuming segment with no
      // active occupant is vacancy overhead; previous/future tenants are never
      // pulled into it through a period-wide fallback.
      if (seg.unitsConsumed > 0 && activeTenantCount === 0) {
        const overheadCost = truncate4(seg.unitsConsumed * ratePerUnit);
        overheadSegments.push({
          segmentIndex: seg.segmentIndex,
          periodLabel: seg.periodLabel,
          startDate: seg.startDate,
          endDate: seg.endDate,
          readingFrom: seg.readingFrom,
          readingTo: seg.readingTo,
          kwhConsumed: seg.unitsConsumed,
          cost: overheadCost,
          reason: "ZERO_OCCUPANCY_WITH_CONSUMPTION",
        });
        // Return a zeroed segment — excluded from tenant cost aggregation
        return {
          ...seg,
          activeTenantIds: [],
          activeTenantCount: 0,
          sharePerTenantUnits: 0,
          sharePerTenantCost: 0,
          totalCost: 0,
          ratePerUnit,
          _routedToOverhead: true,
        };
      }

      const segmentWithTenants = {
        ...seg,
        activeTenantIds,
        activeTenantCount,
        coveredTenantNames,
      };

      const shares = computeSegmentShares(segmentWithTenants, ratePerUnit);
      // Propagate exception from computeSegmentShares
      if (shares.exception) {
        segmentExceptions.push({ code: shares.exception, detail: shares.exceptionDetail });
      }
      return { ...segmentWithTenants, ...shares, ratePerUnit };
    });

    const segments = computedSegments
      .filter((segment) => segment.unitsConsumed > 0)
      .map((segment, segmentIndex) => ({
        ...segment,
        segmentIndex,
      }));

    // Phase 1: Aggregate per-tenant kWh, then apply Hamilton cent allocation for bill amounts.
    const tenantKwhMap = new Map();
    const tenantCentMap = new Map(); // Accumulate per-tenant cents from _centSharesByTenantIndex
    for (const segment of segments) {
      for (let ti = 0; ti < segment.activeTenantIds.length; ti++) {
        const tenantId = segment.activeTenantIds[ti];
        const key = String(tenantId);
        tenantKwhMap.set(
          key,
          (tenantKwhMap.get(key) || 0) + segment.sharePerTenantUnits,
        );
        // Accumulate Hamilton cents from the segment's per-tenant allocation
        const centShare = segment._centSharesByTenantIndex?.[ti] ?? toCents(segment.sharePerTenantCost);
        tenantCentMap.set(key, (tenantCentMap.get(key) || 0) + centShare);
      }
    }

    const tenantSummaries = [];
    for (const [tenantIdStr, rawKwh] of tenantKwhMap) {
      const totalUsage = truncate4(rawKwh);
      // Use accumulated Hamilton cents; convert to pesos for the API surface
      const billAmount = toPesos(tenantCentMap.get(tenantIdStr) || 0);
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
          readMoveInDate(reservation) || event?.moveInDate || null,
          readMoveOutDate(reservation) || event?.moveOutDate || null,
        ),
        totalUsage,
        billAmount,
      });
    }

    const sumTenantKwh = tenantSummaries.reduce(
      (sum, t) => sum + t.totalUsage,
      0,
    );
    const overheadKwh = overheadSegments.reduce(
      (sum, segment) => sum + Number(segment.kwhConsumed || 0),
      0,
    );
    // Phase 1: Strict cent-level reconciliation (not ±0.01 float tolerance)
    const totalCostCents = toCents(totalCost);
    const sumTenantCents = tenantSummaries.reduce((sum, t) => sum + toCents(t.billAmount), 0);
    const overheadCents = overheadSegments.reduce(
      (sum, segment) => sum + toCents(segment.cost),
      0,
    );
    const reconciliation = verifyReconciliation(
      [...tenantSummaries.map((t) => toCents(t.billAmount)), overheadCents],
      totalCostCents,
    );

    return {
      strategy: forceSegmented ? "segment-based-strict" : "segment-based",
      segments,
      tenantSummaries,
      computedTotalUsage: totalUnits,
      computedTotalCost: totalCost,
      verified:
        reconciliation.valid &&
        Math.abs(sumTenantKwh + overheadKwh - totalUnits) <= 0.01,
      reconciliationDeltaCents: reconciliation.delta,
      exceptions: segmentExceptions,
      // Plan 1 (D1): Segments routed to branch overhead due to zero occupancy
      overheadSegments,
    };
  } else {
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
        durationRange: formatDurationRange(
          readMoveInDate(res),
          readMoveOutDate(res),
        ),
        totalUsage,
        billAmount: shareAmount,
      };
    });

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
