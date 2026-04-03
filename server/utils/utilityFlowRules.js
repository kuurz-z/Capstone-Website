const WATER_BILLABLE_ROOM_TYPES = new Set(["private", "double-sharing"]);

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

export function isWaterBillableRoom(roomOrType) {
  const roomType = typeof roomOrType === "string" ? roomOrType : roomOrType?.type;
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

  const missingMoveInReadings = [];
  const missingMoveOutReadings = [];

  for (const reservation of cycleReservations) {
    const tenantKey = getTenantKey(reservation.userId);
    if (!tenantKey) continue;

    const tenantName = reservation.userId?.firstName
      ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
      : "Tenant";

    if (
      fallsWithinCycle(reservation.checkInDate, period?.startDate, period?.endDate) &&
      !moveInReadingsByTenant.has(tenantKey)
    ) {
      missingMoveInReadings.push({
        reservationId: reservation._id,
        tenantId: tenantKey,
        tenantName,
        checkInDate: reservation.checkInDate,
      });
    }

    if (
      reservation.status === "checked-out" &&
      fallsWithinCycle(reservation.checkOutDate, period?.startDate, period?.endDate) &&
      !moveOutReadingsByTenant.has(tenantKey)
    ) {
      missingMoveOutReadings.push({
        reservationId: reservation._id,
        tenantId: tenantKey,
        tenantName,
        checkOutDate: reservation.checkOutDate,
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
      const checkedInBeforeCycle =
        reservation.checkInDate &&
        startOfDay(reservation.checkInDate) < startOfDay(period?.startDate);

      return {
        tenantId: tenantKey,
        reservationId: reservation._id,
        tenantName,
        moveInReading: moveInReading ?? (checkedInBeforeCycle ? Number(period?.startReading || 0) : null),
        moveOutReading: moveOutReading ?? null,
      };
    })
    .filter((entry) => entry && entry.moveInReading !== null && entry.moveInReading !== undefined);
}

export { WATER_BILLABLE_ROOM_TYPES };
