import "./StatusBadge.css";
import { normalizeReservationStatus } from "../../../../shared/utils/lifecycleNaming";

/**
 * StatusBadge — Consistent status chip with dot + label.
 *
 * Predefined statuses:
 *   active, moveIn, confirmed, pending, overdue, cancelled,
 *   paid, partial, rejected, suspended, banned, maintenance, new
 */

const STATUS_MAP = {
  "active":         { label: "Active",       variant: "success" },
  "moveIn":         { label: "Moved In",     variant: "success" },
  "moveOut":        { label: "Moved Out",    variant: "neutral" },
  "confirmed":      { label: "Confirmed",    variant: "success" },
  "paid":           { label: "Paid",         variant: "success" },
  "approved":       { label: "Approved",     variant: "success" },
  "verified":       { label: "Verified",     variant: "success" },
  "resolved":       { label: "Resolved",     variant: "success" },
  "completed":      { label: "Completed",    variant: "success" },
  "available":      { label: "Available",    variant: "success" },
  "visit_approved": { label: "Visit Approved", variant: "success" },
  "pending":        { label: "Pending",      variant: "warning" },
  "viewed":         { label: "Viewed",       variant: "warning" },
  "partial":        { label: "Partial",      variant: "warning" },
  "expiring_soon":  { label: "Expiring Soon", variant: "warning" },
  "expired":        { label: "Expired",      variant: "error" },
  "moving_out":     { label: "Moving Out",   variant: "warning" },
  "moved_out":      { label: "Moved Out",    variant: "neutral" },
  "payment_pending":{ label: "Payment Pending", variant: "warning" },
  "reserved":       { label: "Reserved",     variant: "info" },
  "new":            { label: "New",          variant: "info" },
  "responded":      { label: "Responded",    variant: "info" },
  "visit_pending":  { label: "Visit Pending", variant: "info" },
  "in_progress":    { label: "In Progress",  variant: "info" },
  "overdue":        { label: "Overdue",      variant: "error" },
  "cancelled":      { label: "Cancelled",    variant: "neutral" },
  "rejected":       { label: "Rejected",     variant: "error" },
  "suspended":      { label: "Suspended",    variant: "error" },
  "banned":         { label: "Banned",       variant: "error" },
  "archived":       { label: "Archived",     variant: "neutral" },
  "occupied":       { label: "Occupied",     variant: "neutral" },
  "maintenance":    { label: "Maintenance",  variant: "neutral" },
};

const toStatusKey = (status) =>
  String(normalizeReservationStatus(status) || status || "")
    .trim()
    .replace(/\s+/g, "_");

export default function StatusBadge({ status, label: customLabel }) {
  const normalized = toStatusKey(status);
  const config = STATUS_MAP[normalized] || { label: status || "Unknown", variant: "neutral" };
  const displayLabel = customLabel || config.label;

  return (
    <span className={`status-badge status-badge--${config.variant}`}>
      <span className="status-badge__dot" />
      {displayLabel}
    </span>
  );
}
