export const USER_ROLE_NAMES = Object.freeze([
  "applicant",
  "tenant",
  "branch_admin",
  "owner",
]);

export const CANONICAL_RESERVATION_STATUSES = Object.freeze([
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
  "reserved",
  "moveIn",
  "moveOut",
  "cancelled",
  "archived",
]);

export const LEGACY_RESERVATION_STATUS_MAP = Object.freeze({});

export const ALLOWED_RESERVATION_STATUS_TRANSITIONS = Object.freeze({
  pending: ["visit_pending", "cancelled", "archived"],
  visit_pending: ["visit_approved", "cancelled", "archived"],
  visit_approved: ["payment_pending", "cancelled", "archived"],
  payment_pending: ["reserved", "cancelled", "archived"],
  reserved: ["moveIn", "cancelled", "archived"],
  moveIn: ["moveOut", "archived"],
  moveOut: ["archived"],
  cancelled: ["archived"],
  archived: [],
});

const RESERVATION_STATUS_QUERY_MAP = Object.freeze({
  pending: ["pending"],
  visit_pending: ["visit_pending"],
  visit_approved: ["visit_approved"],
  payment_pending: ["payment_pending"],
  reserved: ["reserved"],
  moveIn: ["moveIn"],
  moveOut: ["moveOut"],
  cancelled: ["cancelled"],
  archived: ["archived"],
});

export const CANONICAL_UTILITY_EVENT_TYPES = Object.freeze([
  "moveIn",
  "moveOut",
  "regularBilling",
  "periodStart",
  "periodEnd",
  "manualAdjustment",
]);

export const LEGACY_UTILITY_EVENT_TYPE_MAP = Object.freeze({});

const UTILITY_EVENT_QUERY_MAP = Object.freeze({
  moveIn: ["moveIn"],
  moveOut: ["moveOut"],
  regularBilling: ["regularBilling"],
  periodStart: ["periodStart"],
  periodEnd: ["periodEnd"],
  manualAdjustment: ["manualAdjustment"],
});

export const normalizeReservationStatus = (status) => {
  if (status == null) return null;
  const value = String(status).trim();
  return LEGACY_RESERVATION_STATUS_MAP[value] || value;
};

export const reservationStatusesForQuery = (...statuses) => {
  const values = new Set();

  statuses
    .flat()
    .map((status) => normalizeReservationStatus(status))
    .filter(Boolean)
    .forEach((status) => {
      const aliases = RESERVATION_STATUS_QUERY_MAP[status] || [status];
      aliases.forEach((alias) => values.add(alias));
    });

  return [...values];
};

export const ACTIVE_OCCUPANCY_STATUS_QUERY = Object.freeze(
  reservationStatusesForQuery("reserved", "moveIn"),
);

export const CURRENT_RESIDENT_STATUS_QUERY = Object.freeze(
  reservationStatusesForQuery("moveIn"),
);

export const BILLABLE_RESERVATION_STATUS_QUERY = Object.freeze(
  reservationStatusesForQuery("moveIn", "moveOut"),
);

export const ACTIVE_STAY_STATUS_QUERY = Object.freeze(
  reservationStatusesForQuery("reserved", "moveIn"),
);

export const PAST_STAY_STATUS_QUERY = Object.freeze(
  reservationStatusesForQuery("moveOut", "cancelled"),
);

export const isReservationStatus = (status, expectedStatus) =>
  normalizeReservationStatus(status) ===
  normalizeReservationStatus(expectedStatus);

export const hasReservationStatus = (status, ...expectedStatuses) => {
  const normalized = normalizeReservationStatus(status);
  return expectedStatuses
    .flat()
    .map((entry) => normalizeReservationStatus(entry))
    .filter(Boolean)
    .includes(normalized);
};

export const canTransitionReservationStatus = (
  currentStatus,
  nextStatus,
) => {
  const current = normalizeReservationStatus(currentStatus);
  const next = normalizeReservationStatus(nextStatus);

  if (!current || !next) return false;
  if (current === next) return true;

  return (ALLOWED_RESERVATION_STATUS_TRANSITIONS[current] || []).includes(next);
};

export const normalizeUtilityEventType = (eventType) => {
  if (eventType == null) return null;
  const value = String(eventType).trim();
  return LEGACY_UTILITY_EVENT_TYPE_MAP[value] || value;
};

export const utilityEventTypesForQuery = (...eventTypes) => {
  const values = new Set();

  eventTypes
    .flat()
    .map((eventType) => normalizeUtilityEventType(eventType))
    .filter(Boolean)
    .forEach((eventType) => {
      const aliases = UTILITY_EVENT_QUERY_MAP[eventType] || [eventType];
      aliases.forEach((alias) => values.add(alias));
    });

  return [...values];
};

export const LIFECYCLE_UTILITY_EVENT_QUERY = Object.freeze(
  utilityEventTypesForQuery("moveIn", "moveOut"),
);

export const isUtilityEventType = (eventType, expectedEventType) =>
  normalizeUtilityEventType(eventType) ===
  normalizeUtilityEventType(expectedEventType);

export const hasUtilityEventType = (eventType, ...expectedEventTypes) => {
  const normalized = normalizeUtilityEventType(eventType);
  return expectedEventTypes
    .flat()
    .map((entry) => normalizeUtilityEventType(entry))
    .filter(Boolean)
    .includes(normalized);
};

export const readMoveInDate = (value) => value?.moveInDate ?? null;

export const readMoveOutDate = (value) => value?.moveOutDate ?? null;

export const buildMoveInBeforeQuery = (date) => ({
  moveInDate: { $lt: date },
});

export const buildMoveOutAfterOrMissingQuery = (date) => ({
  $or: [
    { moveOutDate: null },
    { moveOutDate: { $gt: date } },
  ],
});

export const ensureReservationDateAliases = (value) => {
  if (!value || typeof value !== "object") return value;

  if (value.moveInDate === undefined && value.checkInDate !== undefined) {
    value.moveInDate = value.checkInDate;
  }
  if (value.moveOutDate === undefined && value.checkOutDate !== undefined) {
    value.moveOutDate = value.checkOutDate;
  }

  return value;
};

export const normalizeReservationPayload = (payload = {}) => {
  const next = { ...payload };

  if (next.status !== undefined) {
    next.status = normalizeReservationStatus(next.status);
  }

  if (next.moveInDate === undefined && next.checkInDate !== undefined) {
    next.moveInDate = next.checkInDate;
  }

  if (next.moveOutDate === undefined && next.checkOutDate !== undefined) {
    next.moveOutDate = next.checkOutDate;
  }

  if (next.moveInTime === undefined && next.checkInTime !== undefined) {
    next.moveInTime = next.checkInTime;
  }

  if (next.moveOutTime === undefined && next.checkOutTime !== undefined) {
    next.moveOutTime = next.checkOutTime;
  }

  if (next.eventType !== undefined) {
    next.eventType = normalizeUtilityEventType(next.eventType);
  }

  return next;
};

export const serializeReservation = (
  reservation,
  { includeLegacyDates = false } = {},
) => {
  if (!reservation) return reservation;

  const plain =
    typeof reservation.toObject === "function"
      ? reservation.toObject()
      : { ...reservation };

  const moveInDate = readMoveInDate(plain);
  const moveOutDate = readMoveOutDate(plain);
  const status =
    normalizeReservationStatus(plain.status || plain.reservationStatus) ||
    plain.status ||
    plain.reservationStatus ||
    null;
  const userRef = plain.userId;
  const hasResolvedUser =
    Boolean(userRef) &&
    typeof userRef === "object" &&
    (userRef.firstName || userRef.lastName || userRef.email);
  const hasUserReference = Boolean(
    (hasResolvedUser && userRef._id) ||
      (!hasResolvedUser && userRef),
  );
  const customerName = hasResolvedUser
    ? `${userRef.firstName || ""} ${userRef.lastName || ""}`.trim() ||
      userRef.email ||
      "Unknown"
    : hasUserReference
      ? "Deleted account"
      : "Unknown";

  const serialized = {
    ...plain,
    status,
    reservationStatus: status,
    moveInDate,
    moveOutDate,
    customer: plain.customer || customerName,
    guestName: plain.guestName || customerName,
    email:
      plain.email ||
      (hasResolvedUser ? userRef.email || plain.billingEmail || null : plain.billingEmail || null),
  };

  if (includeLegacyDates) {
    serialized.checkInDate = moveInDate;
    serialized.checkOutDate = moveOutDate;
  } else {
    delete serialized.checkInDate;
    delete serialized.checkOutDate;
  }

  return serialized;
};

export const serializeReservations = (reservations, options) =>
  Array.isArray(reservations)
    ? reservations.map((reservation) => serializeReservation(reservation, options))
    : [];

const normalizeSegmentEventTypes = (segment = {}) => ({
  ...segment,
  startEventType: normalizeUtilityEventType(segment.startEventType),
  endEventType: normalizeUtilityEventType(segment.endEventType),
});

export const serializeUtilityReading = (reading) => {
  if (!reading) return reading;

  const plain =
    typeof reading.toObject === "function" ? reading.toObject() : { ...reading };

  return {
    ...plain,
    eventType: normalizeUtilityEventType(plain.eventType),
  };
};

export const serializeUtilityReadings = (readings) =>
  Array.isArray(readings)
    ? readings.map((reading) => serializeUtilityReading(reading))
    : [];

export const serializeUtilityPeriod = (period) => {
  if (!period) return period;

  const plain =
    typeof period.toObject === "function" ? period.toObject() : { ...period };

  return {
    ...plain,
    segments: Array.isArray(plain.segments)
      ? plain.segments.map((segment) => normalizeSegmentEventTypes(segment))
      : [],
  };
};
