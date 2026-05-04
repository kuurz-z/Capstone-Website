import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
 CalendarCheck,
 Clock,
 ExternalLink,
 MessageSquare,
} from "lucide-react";
import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useOccupancyForecast } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
 AnalyticsDonutChart,
 AnalyticsLineChart,
 AnalyticsTabLayout,
 AnalyticsToolbar,
 ReportChartPanel,
 StatusBadge,
} from "../components/shared";
import { buildRangeLabel, formatBranch, formatDate, formatDateTime } from "./reportCommon";
import {
 buildBranchControl,
 ExportButtons,
 handleCsvExport,
 handlePdfExport,
 MetricGrid,
 RANGE_OPTIONS_SHORT,
} from "./analyticsTabShared";

function ForecastCards({ forecast }) {
 const projectedMonths = forecast?.projected || [];
 const recommendations = forecast?.insights?.recommendations || [];

 if (!forecast?.sufficientHistory) {
 return (
 <p className="text-sm text-muted-foreground italic py-4">
 {forecast?.insights?.headline || "Insufficient history to forecast occupancy."}
 </p>
 );
 }

 return (
 <div className="flex flex-col gap-4 py-2">
 <p className="text-sm font-medium text-card-foreground">{forecast.insights?.headline}</p>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 {projectedMonths.map((item) => (
 <div key={item.month} className="bg-muted rounded-xl p-4 border border-border flex flex-col gap-1">
 <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
 <div className="text-2xl font-bold text-foreground">{item.projectedOccupancyRate}%</div>
 <p className="text-xs text-muted-foreground mt-1">
 Baseline <span className="font-medium text-card-foreground">{item.baselineRate}%</span> • Seasonal <span className="font-medium text-card-foreground">{item.seasonalMultiplier}x</span>
 </p>
 </div>
 ))}
 </div>
 <div className="mt-2 flex flex-col gap-2">
 {recommendations.slice(0, 2).map((item, i) => (
 <div key={item} className="flex items-start gap-2.5 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
 <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" />
 <p className="text-sm text-card-foreground leading-relaxed">{item}</p>
 </div>
 ))}
 </div>
 </div>
 );
}

export default function AnalyticsOverviewTab({
 branch,
 range,
 isOwner,
 onBranchChange,
 onRangeChange,
}) {
 const params = useMemo(
 () => ({
 range,
 ...(isOwner ? { branch } : {}),
 }),
 [branch, isOwner, range],
 );
 const { data, isLoading, isError } = useDashboardData(params);
 const { data: forecastData } = useOccupancyForecast({
 months: 3,
 ...(isOwner ? { branch } : {}),
 });

 const kpis = data?.kpis || {};
 const occupancy = data?.occupancy || {};
 const reservations = data?.recentReservations || [];
 const inquiries = data?.recentInquiries || [];
 const reservationStatus = data?.reservationStatus || {
 approved: 0,
 pending: 0,
 rejected: 0,
 };
 const forecast = forecastData?.forecast || {};
 const forecastSeries = (forecast.projected || []).map((item) => ({
 label: item.label,
 projected: item.projectedOccupancyRate,
 baseline: item.baselineRate,
 }));

 const metricCards = [
 { label: "Occupancy Rate", value: kpis.occupancyRateLabel || "0%", tone: "blue" },
 { label: "Collected", value: kpis.revenueLabel || "PHP 0", tone: "green" },
 { label: "Active Tickets", value: kpis.activeTickets || 0, tone: "amber" },
 { label: "Inquiries", value: kpis.inquiries || 0, tone: "rose" },
 ];

 const exportCsv = () => {
 handleCsvExport(
 reservations,
 [
 { key: "guestName", label: "Guest" },
 { key: "roomType", label: "Room Type" },
 { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
 { key: "status", label: "Status" },
 { key: "moveInDate", label: "Move In", formatter: (value) => formatDate(value) },
 ],
 `analytics-overview-${range}`,
 );
 };

 const exportPdf = () => {
 handlePdfExport({
 title: "Analytics Overview",
 subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
 filename: `analytics-overview-${range}.pdf`,
 kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
 sections: [
 {
 title: "Reservation Status",
 rows: Object.entries(reservationStatus).map(([status, count]) => `${status}: ${count}`),
 },
 {
 title: "Recent Reservations",
 rows: reservations.slice(0, 10).map(
 (item) => `${item.guestName || "Unknown"} • ${item.roomType || "-"} • ${item.status || "pending"}`,
 ),
 },
 ],
 });
 };

 return (
 <AnalyticsTabLayout
 header={
 <AnalyticsToolbar
 title="Analytics Overview"
 subtitle={`Scope: ${formatBranch(data?.scope?.branch || branch)} • ${buildRangeLabel(range)}`}
 range={{ value: range, onChange: onRangeChange, options: RANGE_OPTIONS_SHORT }}
 branch={buildBranchControl({ isOwner, branch, onChange: onBranchChange })}
 actions={<ExportButtons onCsv={exportCsv} onPdf={exportPdf} />}
 />
 }
 >
 <MetricGrid items={metricCards} />

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
 <ReportChartPanel
 title="Reservation status"
 subtitle={`${kpis.activeBookings || 0} active bookings currently tracked`}
 >
 <AnalyticsDonutChart
 data={[
 { label: "Approved", value: reservationStatus.approved || 0 },
 { label: "Pending", value: reservationStatus.pending || 0 },
 { label: "Rejected", value: reservationStatus.rejected || 0 },
 ]}
 centerLabel={{ value: kpis.activeBookings || 0, label: "Bookings" }}
 emptyTitle="No reservation data"
 emptyDescription="Reservation status will appear once the branch has activity."
 />
 </ReportChartPanel>

 <ReportChartPanel
 title="Forecast summary"
 subtitle="Deterministic 3-month occupancy projection"
 >
 <AnalyticsLineChart
 data={forecastSeries}
 lines={[
 { key: "projected", label: "Projected occupancy", color: "#2563eb" },
 { key: "baseline", label: "Baseline rate", color: "#0f766e" },
 ]}
 valueFormatter={(value) => `${value}%`}
 emptyTitle="No forecast available"
 emptyDescription="More occupancy history is needed before a projection can be shown."
 />
 </ReportChartPanel>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
 <ReportChartPanel
 title="Recent inquiries"
 subtitle={`${occupancy.totalRooms || 0} rooms included in the current branch snapshot`}
 actions={
 <Link to="/admin/reservations" className="text-sm font-semibold text-blue-600 hover:text-info-dark flex items-center gap-1.5 transition-colors">
 Open reservations
 <ExternalLink size={14} />
 </Link>
 }
 >
 <div className="flex flex-col gap-3 py-2">
 {inquiries.length > 0 ? (
 inquiries.slice(0, 5).map((item) => (
 <div key={item.id} className="relative bg-muted border border-border rounded-xl p-4 flex flex-col gap-1.5 hover:bg-muted transition-colors group cursor-pointer">
 <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
 <MessageSquare size={13} className="text-muted-foreground group-hover:text-blue-500 transition-colors" /> {item.name || "Unknown"}
 </span>
 <div className="text-sm font-semibold text-foreground">{item.email || "-"}</div>
 <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
 <span className="bg-border/50 px-2 py-0.5 rounded-md">{formatBranch(item.branch)}</span> 
 <span className="text-slate-300">•</span>
 <Clock size={12} className="text-muted-foreground" /> {item.createdAt ? formatDateTime(item.createdAt) : "-"}
 </p>
 </div>
 ))
 ) : (
 <p className="text-sm text-muted-foreground italic py-6 text-center">
 {isError ? "Dashboard data could not be loaded." : "No recent inquiries."}
 </p>
 )}
 </div>
 </ReportChartPanel>

 <ReportChartPanel
 title="Recent reservations"
 subtitle={`${kpis.registeredUsers || 0} registered users in branch scope`}
 >
 <div className="flex flex-col gap-3 py-2">
 {reservations.length > 0 ? (
 reservations.slice(0, 5).map((item) => (
 <div key={item.id} className="relative bg-muted border border-border rounded-xl p-4 flex justify-between items-start gap-4 hover:bg-muted transition-colors group cursor-pointer">
 <div className="flex flex-col gap-1.5">
 <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
 <CalendarCheck size={13} className="text-muted-foreground group-hover:text-blue-500 transition-colors" /> {item.guestName || "Unknown"}
 </span>
 <div className="text-sm font-semibold text-foreground">{item.roomType || "-"}</div>
 <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
 <span className="bg-border/50 px-2 py-0.5 rounded-md">{formatBranch(item.branch)}</span>
 <span className="text-slate-300 mx-1">•</span>
 Move in: <span className="font-medium text-card-foreground">{formatDate(item.moveInDate || item.createdAt)}</span>
 </p>
 </div>
 <StatusBadge status={item.status || "pending"} />
 </div>
 ))
 ) : (
 <p className="text-sm text-muted-foreground italic py-6 text-center">
 {isLoading ? "Loading reservations..." : "No recent reservations."}
 </p>
 )}
 </div>
 </ReportChartPanel>
 </div>

 <ReportChartPanel
 title="Forecasting insights"
 subtitle="Actionable branch planning signals from the current projection"
 >
 <ForecastCards forecast={forecast} />
 </ReportChartPanel>
 </AnalyticsTabLayout>
 );
}
