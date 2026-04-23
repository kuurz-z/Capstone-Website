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
});

export const ADMIN_MAINTENANCE_STATUS_OPTIONS = Object.freeze([
  "viewed",
  "in_progress",
  "resolved",
  "completed",
  "rejected",
]);

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

export const formatMaintenanceType = (requestType) =>
  getMaintenanceTypeMeta(requestType).label;

export const formatMaintenanceUrgency = (urgency) =>
  getMaintenanceUrgencyMeta(urgency).label;

export const formatMaintenanceStatus = (status) =>
  getMaintenanceStatusMeta(status).label;
