import "./StatusBadge.css";

/**
 * StatusBadge — Consistent status chip with dot + label.
 *
 * Predefined statuses:
 *   active, checked-in, confirmed, pending, overdue, cancelled,
 *   paid, partial, rejected, suspended, banned, maintenance, new
 */

const STATUS_MAP = {
  "active":         { label: "Active",       variant: "success" },
  "checked-in":     { label: "Checked In",   variant: "success" },
  "confirmed":      { label: "Confirmed",    variant: "success" },
  "paid":           { label: "Paid",         variant: "success" },
  "approved":       { label: "Approved",     variant: "success" },
  "verified":       { label: "Verified",     variant: "success" },
  "resolved":       { label: "Resolved",     variant: "success" },
  "available":      { label: "Available",    variant: "success" },
  "visit-approved": { label: "Visit Approved", variant: "success" },
  "pending":        { label: "Pending",      variant: "warning" },
  "partial":        { label: "Partial",      variant: "warning" },
  "moving-out":     { label: "Moving Out",   variant: "warning" },
  "payment-pending":{ label: "Payment Pending", variant: "warning" },
  "reserved":       { label: "Reserved",     variant: "info" },
  "new":            { label: "New",          variant: "info" },
  "responded":      { label: "Responded",    variant: "info" },
  "visit-pending":  { label: "Visit Pending", variant: "info" },
  "overdue":        { label: "Overdue",      variant: "error" },
  "cancelled":      { label: "Cancelled",    variant: "error" },
  "rejected":       { label: "Rejected",     variant: "error" },
  "suspended":      { label: "Suspended",    variant: "error" },
  "banned":         { label: "Banned",       variant: "error" },
  "occupied":       { label: "Occupied",     variant: "neutral" },
  "maintenance":    { label: "Maintenance",  variant: "neutral" },
};

export default function StatusBadge({ status, label: customLabel }) {
  const normalized = (status || "").toLowerCase().replace(/\s+/g, "-");
  const config = STATUS_MAP[normalized] || { label: status || "Unknown", variant: "neutral" };
  const displayLabel = customLabel || config.label;

  return (
    <span className={`status-badge status-badge--${config.variant}`}>
      <span className="status-badge__dot" />
      {displayLabel}
    </span>
  );
}
