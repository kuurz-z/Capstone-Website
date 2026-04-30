const toLabel = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const MAINTENANCE_REQUEST_TYPES = Object.freeze([
  "maintenance",
  "plumbing",
  "electrical",
  "aircon",
  "cleaning",
  "pest",
  "furniture",
  "other",
]);

export const MAINTENANCE_URGENCY_LEVELS = Object.freeze([
  "low",
  "normal",
  "high",
]);

export const MIN_MAINTENANCE_DESCRIPTION_LENGTH = 10;

export const MAINTENANCE_STATUSES = Object.freeze([
  "pending",
  "viewed",
  "in_progress",
  "waiting_tenant",
  "resolved",
  "completed",
  "rejected",
  "cancelled",
  "closed",
]);

export const ADMIN_MAINTENANCE_STATUSES = Object.freeze([
  "viewed",
  "in_progress",
  "waiting_tenant",
  "resolved",
  "completed",
  "rejected",
  "closed",
]);

export const OPEN_MAINTENANCE_STATUSES = Object.freeze([
  "pending",
  "viewed",
  "in_progress",
  "waiting_tenant",
]);

export const REOPENABLE_MAINTENANCE_STATUSES = Object.freeze([
  "resolved",
  "completed",
]);

export const MAINTENANCE_REQUEST_TYPE_LABELS = Object.freeze({
  maintenance: "Maintenance",
  plumbing: "Plumbing",
  electrical: "Electrical",
  aircon: "Air Conditioning",
  cleaning: "Cleaning",
  pest: "Pest Control",
  furniture: "Furniture",
  other: "Other",
});

export const MAINTENANCE_STATUS_LABELS = Object.freeze({
  pending: "Pending",
  viewed: "Viewed",
  in_progress: "In Progress",
  waiting_tenant: "Waiting for Tenant",
  resolved: "Resolved",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  closed: "Closed",
});

export const MAINTENANCE_RESOLUTION_ESTIMATES = Object.freeze({
  low: "3-5 business days",
  normal: "1-2 business days",
  high: "Within 24 hours",
});

export const LEGACY_MAINTENANCE_TYPE_MAP = Object.freeze({
  hardware: "maintenance",
  appliance: "maintenance",
});

export const LEGACY_MAINTENANCE_URGENCY_MAP = Object.freeze({
  medium: "normal",
});

export const LEGACY_MAINTENANCE_STATUS_MAP = Object.freeze({
  "in-progress": "in_progress",
  "on-hold": "in_progress",
});

const ADMIN_STATUS_TRANSITIONS = Object.freeze({
  pending: ["viewed", "in_progress", "rejected", "waiting_tenant"],
  viewed: ["in_progress", "rejected", "waiting_tenant"],
  in_progress: ["waiting_tenant", "resolved", "completed", "rejected"],
  waiting_tenant: ["in_progress", "resolved", "completed", "rejected"],
  resolved: ["closed"],
  completed: ["closed"],
  rejected: ["closed"],
  cancelled: [],
  closed: [],
});

export const normalizeMaintenanceType = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return LEGACY_MAINTENANCE_TYPE_MAP[normalized] || normalized;
};

export const normalizeMaintenanceUrgency = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return LEGACY_MAINTENANCE_URGENCY_MAP[normalized] || normalized;
};

export const normalizeMaintenanceStatus = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return LEGACY_MAINTENANCE_STATUS_MAP[normalized] || normalized;
};

export const isValidMaintenanceType = (value) =>
  MAINTENANCE_REQUEST_TYPES.includes(normalizeMaintenanceType(value));

export const isValidMaintenanceUrgency = (value) =>
  MAINTENANCE_URGENCY_LEVELS.includes(normalizeMaintenanceUrgency(value));

export const isValidMaintenanceStatus = (value) =>
  MAINTENANCE_STATUSES.includes(normalizeMaintenanceStatus(value));

export const isAdminMutableMaintenanceStatus = (value) =>
  ADMIN_MAINTENANCE_STATUSES.includes(normalizeMaintenanceStatus(value));

export const isOpenMaintenanceStatus = (value) =>
  OPEN_MAINTENANCE_STATUSES.includes(normalizeMaintenanceStatus(value));

export const canAdminTransitionMaintenanceStatus = (currentStatus, nextStatus) => {
  const current = normalizeMaintenanceStatus(currentStatus);
  const next = normalizeMaintenanceStatus(nextStatus);

  if (!current || !next) return false;
  if (current === next) {
    return ADMIN_MAINTENANCE_STATUSES.includes(current);
  }

  return (ADMIN_STATUS_TRANSITIONS[current] || []).includes(next);
};

export const formatMaintenanceTypeLabel = (value) =>
  MAINTENANCE_REQUEST_TYPE_LABELS[normalizeMaintenanceType(value)] ||
  toLabel(value);

export const formatMaintenanceStatusLabel = (value) =>
  MAINTENANCE_STATUS_LABELS[normalizeMaintenanceStatus(value)] ||
  toLabel(value);

export const getResolutionEstimate = (urgency) =>
  MAINTENANCE_RESOLUTION_ESTIMATES[normalizeMaintenanceUrgency(urgency)] ||
  MAINTENANCE_RESOLUTION_ESTIMATES.normal;

export const buildMaintenanceNotificationTitle = (requestType) =>
  `${formatMaintenanceTypeLabel(requestType)} Request Update`;

export const buildMaintenanceNotificationBody = (requestType, status) =>
  `Your ${formatMaintenanceTypeLabel(requestType).toLowerCase()} request is now ${formatMaintenanceStatusLabel(status)}.`;
