import React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import {
  ANALYTICS_CHART_COLORS,
  AnalyticsLegend,
  AnalyticsTooltip,
} from "./analyticsChartUtils";
import "./AnalyticsCharts.css";

export default function AnalyticsDonutChart({
  data = [],
  dataKey = "value",
  nameKey = "label",
  height = 320,
  emptyTitle,
  emptyDescription,
  valueFormatter,
  centerLabel = null,
}) {
  if (!data.length) {
    return (
      <AnalyticsEmptyState
        title={emptyTitle}
        description={emptyDescription}
        compact
      />
    );
  }

  const legendItems = data.map((item, index) => ({
    key: item[nameKey] || String(index),
    label: item[nameKey] || `Series ${index + 1}`,
    color: item.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length],
  }));

  const CenterContent = () =>
    centerLabel ? (
      <foreignObject x="35%" y="38%" width="30%" height="24%">
        <div className="analytics-chart__center-label">
          <strong>{centerLabel.value}</strong>
          <span>{centerLabel.label}</span>
        </div>
      </foreignObject>
    ) : null;

  return (
    <div className="analytics-chart" style={{ "--analytics-chart-height": `${height}px` }}>
      <div className="analytics-chart__surface">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<AnalyticsTooltip formatter={valueFormatter} />} />
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey={nameKey}
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="rgba(255,255,255,0.9)"
              strokeWidth={2}
            >
              {data.map((item, index) => (
                <Cell
                  key={`${item[nameKey] || index}`}
                  fill={item.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <CenterContent />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <AnalyticsLegend items={legendItems} />
    </div>
  );
}
