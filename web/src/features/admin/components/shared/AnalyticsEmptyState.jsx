import { BarChart3 } from "lucide-react";
import "./AnalyticsEmptyState.css";

export default function AnalyticsEmptyState({
  title = "No data available",
  description = "Adjust the filters or wait for more activity to appear in analytics.",
  icon: Icon = BarChart3,
  compact = false,
}) {
  return (
    <div
      className={`analytics-empty-state ${
        compact ? "analytics-empty-state--compact" : ""
      }`}
    >
      <div className="analytics-empty-state__icon">
        <Icon size={compact ? 18 : 22} />
      </div>
      <div className="analytics-empty-state__copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
