const WATER_BILLABLE_ROOM_TYPES = new Set([
  "private",
  "double-sharing",
  "quadruple-sharing",
]);

const BILLABLE_RESERVATION_STATUSES = new Set(["checked-in", "checked-out"]);

function startOfDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function getTenantKey(value) {
  if (!value) return null;
  return String(value._id || value);
}

function fallsWithinCycle(dateValue, cycleStart, cycleEnd) {
  const date = startOfDay(dateValue);
  const start = startOfDay(cycleStart);
  const end = startOfDay(cycleEnd);

  if (!date || !start || !end) return false;
  return date >= start && date <= end;
}

/**
 * Strictly within cycle — date is AFTER start and ON or BEFORE end.
 * Used for move-in checks: tenants who moved in ON the cycle start date
 * are treated as "already present" and don't need a separate move-in reading.
 */
function fallsStrictlyAfterCycleStart(dateValue, cycleStart, cycleEnd) {
  const date = startOfDay(dateValue);
  const start = startOfDay(cycleStart);
  const end = startOfDay(cycleEnd);

  if (!date || !start || !end) return false;
  return date > start && date <= end;
}

function isSameDay(left, right) {
  const l = startOfDay(left);
  const r = startOfDay(right);
  if (!l || !r) return false;
  return l.getTime() === r.getTime();
}

function getBedKey(reservation) {
  const selectedBed = reservation?.selectedBed;
  if (!selectedBed) return null;
  return String(selectedBed.id || selectedBed.position || "").trim() || null;
}

function overlapRange(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function isWaterBillableRoom(roomOrType) {
  const roomType =
    typeof roomOrType === "string" ? roomOrType : roomOrType?.type;
  return WATER_BILLABLE_ROOM_TYPES.has(roomType);
}

export function filterBillableReservationsForPeriod({
  reservations = [],
  cycleStart,
  cycleEnd,
} = {}) {
  const start = startOfDay(cycleStart);
  const end = startOfDay(cycleEnd);
  if (!start || !end) return [];

  return reservations.filter((reservation) => {
    if (!reservation?.userId) return false;
    if (!BILLABLE_RESERVATION_STATUSES.has(reservation.status)) return false;

    const checkInDate = startOfDay(reservation.checkInDate);
    const checkOutDate = startOfDay(reservation.checkOutDate);
    if (!checkInDate || checkInDate >= end) return false;
    if (checkOutDate && checkOutDate <= start) return false;
    return true;
  });
}

export function findMissingElectricityLifecycleReadings({
  period,
  reservations = [],
  readings = [],
} = {}) {
  const cycleReservations = filterBillableReservationsForPeriod({
    reservations,
    cycleStart: period?.startDate,
    cycleEnd: period?.endDate,
  });

  const moveInReadingsByTenant = new Map();
  const moveOutReadingsByTenant = new Map();

  for (const reading of readings) {
    const tenantKey = getTenantKey(reading?.tenantId);
    if (!tenantKey) continue;

    if (reading.eventType === "move-in") {
      const arr = moveInReadingsByTenant.get(tenantKey) || [];
      arr.push(reading);
      moveInReadingsByTenant.set(tenantKey, arr);
    }

    if (reading.eventType === "move-out") {
      const arr = moveOutReadingsByTenant.get(tenantKey) || [];
      arr.push(reading);
      moveOutReadingsByTenant.set(tenantKey, arr);
    }
  }

  const missingMoveInReadings = [];
  const missingMoveOutReadings = [];

  for (const reservation of cycleReservations) {
    const tenantKey = getTenantKey(reservation.userId);
    if (!tenantKey) continue;

    const tenantName = reservation.userId?.firstName
      ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
      : "Tenant";

    const tenantMoveInReadings = moveInReadingsByTenant.get(tenantKey) || [];
    if (
      fallsStrictlyAfterCycleStart(
        reservation.checkInDate,
        period?.startDate,
        period?.endDate,
      ) &&
      !tenantMoveInReadings.some((entry) =>
        isSameDay(entry.date, reservation.checkInDate),
      )
    ) {
      missingMoveInReadings.push({
        reservationId: reservation._id,
        tenantId: tenantKey,
        tenantName,
        checkInDate: reservation.checkInDate,
        reason: "missing exact-date move-in reading",
      });
    }

    const tenantMoveOutReadings = moveOutReadingsByTenant.get(tenantKey) || [];
    if (
      reservation.status === "checked-out" &&
      fallsWithinCycle(
        reservation.checkOutDate,
        period?.startDate,
        period?.endDate,
      ) &&
      !tenantMoveOutReadings.some((entry) =>
        isSameDay(entry.date, reservation.checkOutDate),
      )
    ) {
      missingMoveOutReadings.push({
        reservationId: reservation._id,
        tenantId: tenantKey,
        tenantName,
        checkOutDate: reservation.checkOutDate,
        reason: "missing exact-date move-out reading",
      });
    }
  }

  return {
    missingMoveInReadings,
    missingMoveOutReadings,
    hasMissingReadings:
      missingMoveInReadings.length > 0 || missingMoveOutReadings.length > 0,
  };
}

export function buildTenantEventsForPeriod({
  period,
  reservations = [],
  readings = [],
} = {}) {
  const cycleReservations = filterBillableReservationsForPeriod({
    reservations,
    cycleStart: period?.startDate,
    cycleEnd: period?.endDate,
  });

  const moveInReadingsByTenant = new Map();
  const moveOutReadingsByTenant = new Map();

  for (const reading of readings) {
    const tenantKey = getTenantKey(reading?.tenantId);
    if (!tenantKey) continue;

    if (reading.eventType === "move-in") {
      const existing = moveInReadingsByTenant.get(tenantKey);
      if (!existing || new Date(reading.date) < new Date(existing.date)) {
        moveInReadingsByTenant.set(tenantKey, reading);
      }
    }

    if (reading.eventType === "move-out") {
      const existing = moveOutReadingsByTenant.get(tenantKey);
      if (!existing || new Date(reading.date) > new Date(existing.date)) {
        moveOutReadingsByTenant.set(tenantKey, reading);
      }
    }
  }

  return cycleReservations
    .map((reservation) => {
      const tenantKey = getTenantKey(reservation.userId);
      if (!tenantKey) return null;

      const tenantName = reservation.userId?.firstName
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Tenant";
      const moveInReading = moveInReadingsByTenant.get(tenantKey)?.reading;
      const moveOutReading = moveOutReadingsByTenant.get(tenantKey)?.reading;
      const checkInDay = startOfDay(reservation.checkInDate);
      const cycleStartDay = startOfDay(period?.startDate);
      const checkedInBeforeCycle =
        checkInDay && cycleStartDay && checkInDay <= cycleStartDay;

      return {
        tenantId: tenantKey,
        reservationId: reservation._id,
        tenantName,
        moveInReading:
          moveInReading ??
          (checkedInBeforeCycle ? Number(period?.startReading || 0) : null),
        moveOutReading: moveOutReading ?? null,
      };
    })
    .filter(
      (entry) =>
        entry &&
        entry.moveInReading !== null &&
        entry.moveInReading !== undefined,
    );
}

export function findBedOccupancyOverlaps({
  reservations = [],
  cycleStart,
  cycleEnd,
} = {}) {
  const cycleReservations = filterBillableReservationsForPeriod({
    reservations,
    cycleStart,
    cycleEnd,
  });

  const start = startOfDay(cycleStart);
  const end = startOfDay(cycleEnd);
  if (!start || !end) {
    return { hasOverlaps: false, overlaps: [] };
  }

  const byBed = new Map();
  for (const reservation of cycleReservations) {
    const bedKey = getBedKey(reservation);
    if (!bedKey) continue;

    const effectiveStart = startOfDay(reservation.checkInDate);
    const rawEnd = startOfDay(reservation.checkOutDate) || end;
    if (!effectiveStart) continue;

    const overlapStart = effectiveStart > start ? effectiveStart : start;
    const overlapEnd = rawEnd < end ? rawEnd : end;
    if (overlapStart >= overlapEnd) continue;

    const bucket = byBed.get(bedKey) || [];
    bucket.push({
      reservationId: reservation._id,
      tenantId: getTenantKey(reservation.userId),
      tenantName: reservation.userId?.firstName
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Tenant",
      bedKey,
      start: overlapStart,
      end: overlapEnd,
    });
    byBed.set(bedKey, bucket);
  }

  const overlaps = [];
  for (const [bedKey, entries] of byBed.entries()) {
    entries.sort((a, b) => a.start - b.start);
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i];
      const next = entries[i + 1];
      if (overlapRange(current.start, current.end, next.start, next.end)) {
        overlaps.push({
          bedKey,
          firstReservationId: current.reservationId,
          firstTenantId: current.tenantId,
          firstTenantName: current.tenantName,
          firstStart: current.start,
          firstEnd: current.end,
          secondReservationId: next.reservationId,
          secondTenantId: next.tenantId,
          secondTenantName: next.tenantName,
          secondStart: next.start,
          secondEnd: next.end,
        });
      }
    }
  }

  return {
    hasOverlaps: overlaps.length > 0,
    overlaps,
  };
}

export { WATER_BILLABLE_ROOM_TYPES };
