import {
    BedDouble,
    Bug,
    Droplets,
    MoreHorizontal,
    Snowflake,
    Sparkles,
    Wrench,
    Zap,
} from "lucide-react";

export const MAINTENANCE_REQUEST_TYPE_META = Object.freeze({
  maintenance: { label: "Maintenance", icon: Wrench, color: "#F59E0B" },
  plumbing: { label: "Plumbing", icon: Droplets, color: "#3B82F6" },
  electrical: { label: "Electrical", icon: Zap, color: "#EF4444" },
  aircon: { label: "Air Conditioning", icon: Snowflake, color: "#06B6D4" },
  cleaning: { label: "Cleaning", icon: Sparkles, color: "#22C55E" },
  pest: { label: "Pest Control", icon: Bug, color: "#8B5CF6" },
  furniture: { label: "Furniture", icon: BedDouble, color: "#EC4899" },
  other: { label: "Other", icon: MoreHorizontal, color: "#6B7280" },
});

export const MAINTENANCE_REQUEST_TYPES = Object.freeze(
  Object.keys(MAINTENANCE_REQUEST_TYPE_META),
);

export const MAINTENANCE_URGENCY_META = Object.freeze({
  low: {
    label: "Low",
    description: "Can wait a few days",
    color: "#22C55E",
    estimate: "3-5 business days",
  },
  normal: {
    label: "Normal",
    description: "Within 1-2 days",
    color: "#F59E0B",
    estimate: "1-2 business days",
  },
  high: {
    label: "Urgent",
    description: "Needs immediate attention",
    color: "#EF4444",
    estimate: "Within 24 hours",
  },
});

export const MAINTENANCE_URGENCY_LEVELS = Object.freeze(
  Object.keys(MAINTENANCE_URGENCY_META),
);

export const MIN_MAINTENANCE_DESCRIPTION_LENGTH = 10;

export const ACTIVE_MAINTENANCE_STATUSES = Object.freeze([
  "pending",
  "viewed",
  "in_progress",
  "waiting_tenant",
]);

export const RESOLVED_MAINTENANCE_STATUSES = Object.freeze([
  "resolved",
  "completed",
  "rejected",
  "closed",
]);

export const REOPENABLE_MAINTENANCE_STATUSES = Object.freeze([
  "resolved",
  "completed",
]);

export const TERMINAL_ADMIN_MAINTENANCE_STATUSES = Object.freeze([
  "resolved",
  "completed",
  "rejected",
  "cancelled",
  "closed",
]);

export const MAINTENANCE_STATUS_META = Object.freeze({
  pending: {
    label: "Pending",
    bg: "#FEF3C7",
    color: "#F59E0B",
    variant: "warning",
  },
  viewed: {
    label: "Viewed",
    bg: "#FEF3C7",
    color: "#D97706",
    variant: "warning",
  },
  in_progress: {
    label: "In Progress",
    bg: "#DBEAFE",
    color: "#3B82F6",
    variant: "info",
  },
  waiting_tenant: {
    label: "Waiting for Tenant",
    bg: "#E0F2FE",
    color: "#0284C7",
    variant: "info",
  },
  resolved: {
    label: "Resolved",
    bg: "#D1FAE5",
    color: "#059669",
    variant: "success",
  },
  completed: {
    label: "Completed",
    bg: "#DCFCE7",
    color: "#22C55E",
    variant: "success",
  },
  rejected: {
    label: "Rejected",
    bg: "#FEE2E2",
    color: "#DC2626",
    variant: "error",
  },
  cancelled: {
    label: "Cancelled",
    bg: "#F3F4F6",
    color: "#9CA3AF",
    variant: "neutral",
  },
  closed: {
    label: "Closed",
    bg: "#E2E8F0",
    color: "#475569",
    variant: "neutral",
  },
});

export const ADMIN_MAINTENANCE_STATUS_OPTIONS = Object.freeze([
  "viewed",
  "in_progress",
  "waiting_tenant",
  "resolved",
  "completed",
  "rejected",
  "closed",
]);

export const ADMIN_MAINTENANCE_STATUS_TRANSITIONS = Object.freeze({
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

export const getMaintenanceTypeMeta = (requestType) =>
  MAINTENANCE_REQUEST_TYPE_META[requestType] ||
  MAINTENANCE_REQUEST_TYPE_META.other;

export const getMaintenanceUrgencyMeta = (urgency) =>
  MAINTENANCE_URGENCY_META[urgency] || MAINTENANCE_URGENCY_META.normal;

export const getMaintenanceStatusMeta = (status) =>
  MAINTENANCE_STATUS_META[status] || {
    label: status || "Unknown",
    bg: "#F3F4F6",
    color: "#9CA3AF",
    variant: "neutral",
  };

export const getAllowedAdminMaintenanceStatuses = (currentStatus) => {
  const current = String(currentStatus || "").toLowerCase();
  const nextStatuses = ADMIN_MAINTENANCE_STATUS_TRANSITIONS[current] || [];

  return [
    ...(ADMIN_MAINTENANCE_STATUS_OPTIONS.includes(current) ? [current] : []),
    ...nextStatuses,
  ];
};

export const isAdminTerminalMaintenanceStatus = (status) =>
  TERMINAL_ADMIN_MAINTENANCE_STATUSES.includes(
    String(status || "").toLowerCase(),
  );

export const formatMaintenanceType = (requestType) =>
  getMaintenanceTypeMeta(requestType).label;

export const formatMaintenanceUrgency = (urgency) =>
  getMaintenanceUrgencyMeta(urgency).label;

export const formatMaintenanceStatus = (status) =>
  getMaintenanceStatusMeta(status).label;
