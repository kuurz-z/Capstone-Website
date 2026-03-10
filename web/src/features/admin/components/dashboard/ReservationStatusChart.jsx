import { useMemo } from "react";

export default function ReservationStatusChart({ reservationStatus }) {
  const total = useMemo(
    () =>
      reservationStatus.approved +
      reservationStatus.pending +
      reservationStatus.rejected,
    [reservationStatus],
  );

  const seg = (count) => (total ? (count / total) * 439.8 : 0);

  return (
    <div className="admin-dashboard-reservation-status-section">
      <h2 className="admin-dashboard-section-title">Reservation Status</h2>
      <div className="admin-dashboard-donut-container">
        <svg className="admin-dashboard-donut-chart" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke="#10B981"
            strokeWidth="40"
            strokeDasharray={`${seg(reservationStatus.approved)} 439.8`}
            transform="rotate(-90 100 100)"
          />
          <circle
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="40"
            strokeDasharray={`${seg(reservationStatus.pending)} 439.8`}
            strokeDashoffset={`-${seg(reservationStatus.approved)}`}
            transform="rotate(-90 100 100)"
          />
          <circle
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke="#EF4444"
            strokeWidth="40"
            strokeDasharray={`${seg(reservationStatus.rejected)} 439.8`}
            strokeDashoffset={`-${seg(reservationStatus.approved + reservationStatus.pending)}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
      </div>
      <div className="admin-dashboard-reservation-legend">
        {[
          {
            cls: "green",
            label: "Approved",
            value: reservationStatus.approved,
          },
          { cls: "orange", label: "Pending", value: reservationStatus.pending },
          { cls: "red", label: "Rejected", value: reservationStatus.rejected },
        ].map((item) => (
          <div
            key={item.cls}
            className="admin-dashboard-reservation-legend-item"
          >
            <span
              className={`admin-dashboard-reservation-legend-dot ${item.cls}`}
            ></span>
            <span className="admin-dashboard-reservation-legend-label">
              {item.label}
            </span>
            <span className="admin-dashboard-reservation-legend-value">
              ({item.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
