import { useMemo } from "react";
import { MessageSquare, CalendarDays, Home, Users } from "lucide-react";

function renderStatIcon(iconType) {
  const iconProps = { size: 24, strokeWidth: 2 };
  switch (iconType) {
    case "inquiries":
      return <MessageSquare {...iconProps} />;
    case "reservations":
      return <CalendarDays {...iconProps} />;
    case "rooms":
      return <Home {...iconProps} />;
    case "tenants":
      return <Users {...iconProps} />;
    default:
      return null;
  }
}

export default function DashboardStatsBar({ stats }) {
  return (
    <div className="admin-dashboard-stats">
      {stats.map((stat) => (
        <div key={stat.id} className="admin-dashboard-stat-card">
          <div className="admin-dashboard-stat-header">
            <div
              className="admin-dashboard-stat-icon"
              style={{ color: stat.color }}
            >
              {renderStatIcon(stat.icon)}
            </div>
            <p
              className={
                stat.percentage === "-"
                  ? "admin-dashboard-stat-percentage muted"
                  : "admin-dashboard-stat-percentage"
              }
            >
              {stat.percentage}
            </p>
          </div>
          <div className="admin-dashboard-stat-body">
            <p className="admin-dashboard-stat-value">{stat.value}</p>
            <p className="admin-dashboard-stat-label">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
