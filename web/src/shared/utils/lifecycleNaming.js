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

export const RESERVATION_STATUS_LABELS = Object.freeze({
  pending: "Pending Review",
  visit_pending: "Visit Pending",
  visit_approved: "Visit Approved",
  payment_pending: "Payment Pending",
  reserved: "Reserved",
  moveIn: "Moved In",
  moveOut: "Moved Out",
  cancelled: "Cancelled",
  archived: "Archived",
});

export const RESERVATION_STATUS_APPEARANCE = Object.freeze({
  pending: {
    label: RESERVATION_STATUS_LABELS.pending,
    color: "#b45309",
    bg: "#fffbeb",
    dot: "#f59e0b",
  },
  visit_pending: {
    label: RESERVATION_STATUS_LABELS.visit_pending,
    color: "#1d4ed8",
    bg: "#eff6ff",
    dot: "#3b82f6",
  },
  visit_approved: {
    label: RESERVATION_STATUS_LABELS.visit_approved,
    color: "#7c3aed",
    bg: "#f5f3ff",
    dot: "#8b5cf6",
  },
  payment_pending: {
    label: RESERVATION_STATUS_LABELS.payment_pending,
    color: "#b45309",
    bg: "#fffbeb",
    dot: "#f59e0b",
  },
  reserved: {
    label: RESERVATION_STATUS_LABELS.reserved,
    color: "#047857",
    bg: "#ecfdf5",
    dot: "#10b981",
  },
  moveIn: {
    label: RESERVATION_STATUS_LABELS.moveIn,
    color: "#1d4ed8",
    bg: "#eff6ff",
    dot: "#3b82f6",
  },
  moveOut: {
    label: RESERVATION_STATUS_LABELS.moveOut,
    color: "#64748b",
    bg: "#f8fafc",
    dot: "#94a3b8",
  },
  cancelled: {
    label: RESERVATION_STATUS_LABELS.cancelled,
    color: "#dc2626",
    bg: "#fef2f2",
    dot: "#ef4444",
  },
  archived: {
    label: RESERVATION_STATUS_LABELS.archived,
    color: "#475569",
    bg: "#f8fafc",
    dot: "#94a3b8",
  },
});

export const RESERVATION_STAGE_MAP = Object.freeze({
  pending: { step: 1, label: "Room Selected" },
  visit_pending: { step: 2, label: "Visit Scheduled" },
  visit_approved: { step: 3, label: "Application Ready" },
  payment_pending: { step: 4, label: "Payment Submitted" },
  reserved: { step: 5, label: "Confirmed" },
  moveIn: { step: 5, label: "Moved In" },
  moveOut: { step: 5, label: "Completed" },
  cancelled: { step: 0, label: "Cancelled" },
  archived: { step: 0, label: "Archived" },
});

export const RESERVATION_STAGE_GUIDANCE = Object.freeze({
  pending: "Waiting for the tenant to schedule a site visit.",
  visit_pending:
    "Tenant has scheduled a visit. Approve or reject it in the Visit Schedules tab.",
  visit_approved:
    "Visit approved. Waiting for the tenant to complete the application and deposit.",
  payment_pending:
    "Payment submitted and waiting for settlement confirmation from the payment gateway.",
});

export const ADMIN_RESERVATION_ACTIONS_BY_STATUS = Object.freeze({
  pending: ["cancelled"],
  visit_pending: ["cancelled"],
  visit_approved: ["cancelled"],
  payment_pending: ["cancelled"],
  reserved: ["moveIn", "cancelled", "extend"],
  moveIn: ["moveOut"],
  moveOut: [],
  cancelled: [],
  archived: [],
});

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

export const isReservationTransitionAllowed = (currentStatus, nextStatus) => {
  const current = normalizeReservationStatus(currentStatus);
  const next = normalizeReservationStatus(nextStatus);

  if (!current || !next) return false;
  if (current === next) return true;

  return (ALLOWED_RESERVATION_STATUS_TRANSITIONS[current] || []).includes(next);
};

export const isUtilityEventType = (eventType, expectedEventType) =>
  normalizeUtilityEventType(eventType) ===
  normalizeUtilityEventType(expectedEventType);

export const readMoveInDate = (value) => value?.moveInDate ?? null;

export const readMoveOutDate = (value) => value?.moveOutDate ?? null;

export const getReservationStatusLabel = (status) =>
  RESERVATION_STATUS_LABELS[normalizeReservationStatus(status)] ||
  normalizeReservationStatus(status) ||
  "Unknown";

export const getReservationStatusAppearance = (status) =>
  RESERVATION_STATUS_APPEARANCE[normalizeReservationStatus(status)] ||
  RESERVATION_STATUS_APPEARANCE.pending;

export const getAllowedReservationActions = (status) =>
  ADMIN_RESERVATION_ACTIONS_BY_STATUS[normalizeReservationStatus(status)] || [];

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
