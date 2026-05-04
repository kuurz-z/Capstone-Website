import React from "react";

export const ANALYTICS_CHART_COLORS = [
  "#2563eb",
  "#0f766e",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
];

export function formatChartValue(value, formatter) {
  if (typeof formatter === "function") {
    return formatter(value);
  }

  if (typeof value === "number") {
    return value.toLocaleString("en-PH");
  }

  return value ?? "-";
}

export function AnalyticsTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="analytics-chart__tooltip">
      {label != null ? <p className="analytics-chart__tooltip-title">{label}</p> : null}
      <div className="analytics-chart__tooltip-list">
        {payload.map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="analytics-chart__tooltip-row">
            <span>{entry.name}</span>
            <strong>{formatChartValue(entry.value, formatter)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsLegend({ items }) {
  if (!items?.length) return null;

  return (
    <div className="analytics-chart__legend">
      {items.map((item) => (
        <div key={item.key} className="analytics-chart__legend-item">
          <span
            className="analytics-chart__legend-swatch"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
