import {
 CartesianGrid,
 Line,
 LineChart,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from "recharts";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import {
 ANALYTICS_CHART_COLORS,
 AnalyticsLegend,
 AnalyticsTooltip,
} from "./analyticsChartUtils";
import "./AnalyticsCharts.css";

export default function AnalyticsLineChart({
 data = [],
 lines = [],
 xKey = "label",
 height = 320,
 emptyTitle,
 emptyDescription,
 valueFormatter,
}) {
 if (!data.length || !lines.length) {
 return (
 <AnalyticsEmptyState
 title={emptyTitle}
 description={emptyDescription}
 compact
 />
 );
 }

 const legendItems = lines.map((line, index) => ({
 key: line.key,
 label: line.label || line.key,
 color: line.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length],
 }));

 return (
 <div className="analytics-chart" style={{ "--analytics-chart-height": `${height}px` }}>
 <div className="analytics-chart__surface">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
 <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
 <Tooltip content={<AnalyticsTooltip formatter={valueFormatter} />} />
 {lines.map((line, index) => (
 <Line
 key={line.key}
 type={line.type || "monotone"}
 dataKey={line.key}
 name={line.label || line.key}
 stroke={line.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length]}
 strokeWidth={line.strokeWidth || 3}
 dot={line.dot ?? false}
 activeDot={{ r: 5 }}
 />
 ))}
 </LineChart>
 </ResponsiveContainer>
 </div>
 <AnalyticsLegend items={legendItems} />
 </div>
 );
}
