import { formatDate } from "../../utils/formatters";

export function statusBadgeClass(status) {
  switch (status?.toLowerCase()) {
    case "pending":
      return "ar-badge-pending";
    case "visit_pending":
      return "ar-badge-default";
    case "visit_approved":
      return "ar-badge-confirmed";
    case "payment_pending":
      return "ar-badge-pending";
    case "confirmed":
      return "ar-badge-confirmed";
    case "checked-in":
      return "ar-badge-checkedin";
    case "checked-out":
      return "ar-badge-checkedout";
    case "cancelled":
      return "ar-badge-cancelled";
    case "rejected":
      return "ar-badge-rejected";
    default:
      return "ar-badge-default";
  }
}

export function statusLabel(status) {
  switch (status?.toLowerCase()) {
    case "pending":
      return "Pending";
    case "visit_pending":
      return "Visit Pending";
    case "visit_approved":
      return "Visit Approved";
    case "payment_pending":
      return "Payment Pending";
    case "confirmed":
      return "Confirmed";
    case "checked-in":
      return "Checked In";
    case "checked-out":
      return "Checked Out";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
    default:
      return status || "Unknown";
  }
}

export function checkOverdue(r) {
  if (!["pending", "reserved", "payment_pending"].includes(r.status)) return false;
  const moveIn = new Date(r.moveInDate);
  return !isNaN(moveIn.getTime()) && moveIn < new Date();
}

export default function ReservationTable({
  reservations,
  loading,
  error,
  LoadingComponent,
  onView,
  onDelete,
}) {
  if (loading) return <LoadingComponent />;
  if (error) return <div className="ar-error">Error: {error}</div>;
  if (reservations.length === 0) {
    return (
      <div className="ar-empty">
        <p className="ar-empty-title">No reservations found</p>
        <p className="ar-empty-sub">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        className="ar-table"
        style={{ tableLayout: "fixed", width: "100%" }}
      >
        <thead>
          <tr>
            <th style={{ width: "12%" }}>Code</th>
            <th style={{ width: "24%" }}>Customer</th>
            <th style={{ width: "18%" }}>Room / Branch</th>
            <th style={{ width: "14%" }}>Move-in</th>
            <th style={{ width: "12%" }}>Status</th>
            <th style={{ width: "20%" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => {
            const overdue = checkOverdue(r);
            return (
              <tr
                key={r.id}
                className={overdue ? "ar-row-overdue" : ""}
                onClick={() => onView(r.id)}
              >
                <td>
                  <span className="ar-cell-code">{r.reservationCode}</span>
                </td>
                <td>
                  <p className="ar-cell-name">{r.customer}</p>
                  <p className="ar-cell-sub">{r.email}</p>
                </td>
                <td>
                  <p className="ar-cell-name">{r.room}</p>
                  <p className="ar-cell-sub">{r.branch}</p>
                </td>
                <td>
                  <span className={`ar-cell-date ${overdue ? "overdue" : ""}`}>
                    {formatDate(r.moveInDate)}
                  </span>
                  {overdue && (
                    <span className="ar-badge ar-badge-overdue">Overdue</span>
                  )}
                </td>
                <td>
                  <span className={`ar-badge ${statusBadgeClass(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="ar-actions">
                    <button
                      className="ar-btn ar-btn-view"
                      onClick={() => onView(r.id)}
                    >
                      View
                    </button>
                    {onDelete && (
                    <button
                      className="ar-btn ar-btn-delete"
                      onClick={() => onDelete(r.id)}
                    >
                      Delete
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
