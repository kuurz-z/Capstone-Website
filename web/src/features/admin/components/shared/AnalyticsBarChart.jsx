import {
 Bar,
 BarChart,
 CartesianGrid,
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

export default function AnalyticsBarChart({
 data = [],
 bars = [],
 xKey = "label",
 height = 320,
 stacked = false,
 emptyTitle,
 emptyDescription,
 valueFormatter,
}) {
 if (!data.length || !bars.length) {
 return (
 <AnalyticsEmptyState
 title={emptyTitle}
 description={emptyDescription}
 compact
 />
 );
 }

 const legendItems = bars.map((bar, index) => ({
 key: bar.key,
 label: bar.label || bar.key,
 color: bar.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length],
 }));

 return (
 <div className="analytics-chart" style={{ "--analytics-chart-height": `${height}px` }}>
 <div className="analytics-chart__surface">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
 <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
 <Tooltip content={<AnalyticsTooltip formatter={valueFormatter} />} />
 {bars.map((bar, index) => (
 <Bar
 key={bar.key}
 dataKey={bar.key}
 name={bar.label || bar.key}
 fill={bar.color || ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length]}
 radius={[10, 10, 0, 0]}
 stackId={stacked ? "analytics-stack" : undefined}
 />
 ))}
 </BarChart>
 </ResponsiveContainer>
 </div>
 <AnalyticsLegend items={legendItems} />
 </div>
 );
}
