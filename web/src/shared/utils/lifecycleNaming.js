const LEGACY_RESERVATION_STATUS_MAP = Object.freeze({});

const LEGACY_UTILITY_EVENT_TYPE_MAP = Object.freeze({});

export const normalizeReservationStatus = (status) => {
  if (status == null) return null;
  const value = String(status).trim();
  return LEGACY_RESERVATION_STATUS_MAP[value] || value;
};

export const normalizeUtilityEventType = (eventType) => {
  if (eventType == null) return null;
  const value = String(eventType).trim();
  return LEGACY_UTILITY_EVENT_TYPE_MAP[value] || value;
};

export const hasReservationStatus = (status, ...expectedStatuses) => {
  const normalizedStatus = normalizeReservationStatus(status);
  return expectedStatuses
    .flat()
    .map((entry) => normalizeReservationStatus(entry))
    .filter(Boolean)
    .includes(normalizedStatus);
};

export const isUtilityEventType = (eventType, expectedEventType) =>
  normalizeUtilityEventType(eventType) ===
  normalizeUtilityEventType(expectedEventType);

export const readMoveInDate = (value) => value?.moveInDate ?? null;

export const readMoveOutDate = (value) => value?.moveOutDate ?? null;

const normalizeLifecycleObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = normalizeLifecyclePayload(entry);
  }

  if ("status" in result || "reservationStatus" in result) {
    const status = normalizeReservationStatus(
      result.status ?? result.reservationStatus,
    );
    if (status) {
      result.status = status;
      result.reservationStatus = status;
    }
  }

  if ("moveInDate" in result || "checkInDate" in result) {
    const moveInDate = readMoveInDate(result);
    result.moveInDate = moveInDate;
    delete result.checkInDate;
  }

  if ("moveOutDate" in result || "checkOutDate" in result) {
    const moveOutDate = readMoveOutDate(result);
    result.moveOutDate = moveOutDate;
    delete result.checkOutDate;
  }

  if ("eventType" in result) {
    result.eventType = normalizeUtilityEventType(result.eventType);
  }
  if ("startEventType" in result) {
    result.startEventType = normalizeUtilityEventType(result.startEventType);
  }
  if ("endEventType" in result) {
    result.endEventType = normalizeUtilityEventType(result.endEventType);
  }

  return result;
};

export const normalizeLifecyclePayload = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLifecyclePayload(entry));
  }

  return normalizeLifecycleObject(value);
};
