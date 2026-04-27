/**
 * StatusBadge — Consistent status chip with dot + label.
 *
 * Predefined statuses:
 *   active, moveIn, confirmed, pending, overdue, cancelled,
 *   paid, partial, rejected, suspended, banned, maintenance, new
 */

export default function StatusBadge({ status, label: customLabel }) {
  const statusStyles = {
    month: "bg-green-50 text-green-700",
    moveIn: "bg-green-50 text-green-700",
    reserved: "bg-blue-50 text-blue-700",
    "aced-pending": "bg-amber-50 text-amber-700",
    cancelled: "bg-red-50 text-red-700",
    approved: "bg-green-50 text-green-700",
    completed: "bg-green-50 text-green-700",
    "no-show": "bg-red-50 text-red-700",
    missed: "bg-amber-50 text-amber-700",
    resolved: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    visit_pending: "bg-amber-50 text-amber-700",
    rejected: "bg-red-50 text-red-700",
    responded: "bg-blue-50 text-blue-700",
    overdue: "bg-red-50 text-red-700",
  };

  const getLabel = (s) => {
    if (customLabel) return customLabel;
    if (s === "aced-pending") return "Aced-Pending";
    if (s === "no-show") return "No-Show";
    if (s === "month" || s === "moveIn") return "Move In";
    if (s === "visit_pending") return "Visit Pending";
    if (!s) return "Pending";
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  };

  const cssClass = statusStyles[status] || statusStyles.pending;
  const displayLabel = getLabel(status);

  return (
    <span className={`px-3 py-1 text-xs rounded-full font-medium ${cssClass}`}>
      {displayLabel}
    </span>
  );
}
