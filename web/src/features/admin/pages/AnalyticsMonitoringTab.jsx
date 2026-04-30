import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useAuditAnalytics } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
 AnalyticsBarChart,
 AnalyticsComparisonChart,
 AnalyticsDonutChart,
 AnalyticsTabLayout,
 AnalyticsToolbar,
 DataTable,
 ReportChartPanel,
} from "../components/shared";
import { buildRangeLabel, formatBranch, formatDate, formatDateTime } from "./reportCommon";
import {
 AnalyticsInsightSection,
 buildInsightPdfSections,
 ExportButtons,
 handleCsvExport,
 handlePdfExport,
 MetricGrid,
 RANGE_OPTIONS_SHORT,
 useReportInsights,
} from "./analyticsTabShared";

const EVENT_COLUMNS = [
 { key: "action", label: "Event", sortable: true },
 { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch), sortable: true },
 { key: "severity", label: "Severity", sortable: true },
 { key: "user", label: "User", sortable: true },
 { key: "timestamp", label: "Time", render: (row) => formatDateTime(row.timestamp), sortable: true },
];

const SUSPICIOUS_IP_COLUMNS = [
 { key: "ipAddress", label: "IP Address", sortable: true },
 { key: "attempts", label: "Failed Logins", sortable: true },
 { key: "lastSeenAt", label: "Last Seen", render: (row) => formatDateTime(row.lastSeenAt), sortable: true },
];

export default function AnalyticsMonitoringTab({ branch, range, onBranchChange, onRangeChange }) {
 const [eventPage, setEventPage] = useState(1);
 const [ipPage, setIpPage] = useState(1);
 const params = useMemo(() => ({ branch, range }), [branch, range]);
 const { data, isLoading, isError } = useAuditAnalytics(params);
 const {
 data: insightData,
 isLoading: isInsightLoading,
 isError: isInsightError,
 } = useReportInsights({
 reportType: "audit",
 range,
 branch,
 });

 const kpis = data?.kpis || {};
 const branchSummary = data?.series?.branchSummary || [];
 const severityDistribution = data?.series?.severityDistribution || [];
 const recentSecurityEvents = data?.tables?.recentSecurityEvents || [];
 const suspiciousIps = data?.tables?.suspiciousIps || [];

 const metricCards = [
 { label: "Failed Logins", value: kpis.failedLogins || 0, tone: "rose" },
 { label: "Critical Events", value: kpis.criticalEvents || 0, tone: "amber" },
 { label: "Access Overrides", value: kpis.accessOverrides || 0, tone: "blue" },
 { label: "Unique IPs", value: kpis.uniqueFailedLoginIps || 0, tone: "green" },
 ];

 const exportCsv = () => {
 handleCsvExport(
 recentSecurityEvents,
 [
 { key: "action", label: "Event" },
 { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
 { key: "severity", label: "Severity" },
 { key: "user", label: "User" },
 { key: "timestamp", label: "Timestamp", formatter: (value) => formatDateTime(value) },
 ],
 `system-monitoring-${range}`,
 );
 };

 const exportPdf = () => {
 handlePdfExport({
 title: "System Monitoring",
 subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
 filename: `system-monitoring-${range}.pdf`,
 kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
 sections: [
 ...buildInsightPdfSections(insightData, "AI Security Summary"),
 {
 title: "Branch Security Summary",
 rows: branchSummary.map(
 (item) =>
 `${item.label}: ${item.totalEvents} events, ${item.criticalCount} critical, ${item.accessOverrideCount} overrides`,
 ),
 },
 {
 title: "Recent Security Events",
 rows: recentSecurityEvents.slice(0, 12).map(
 (item) => `${item.action} • ${formatBranch(item.branch)} • ${item.severity} • ${formatDate(item.timestamp)}`,
 ),
 },
 ],
 });
 };

 return (
 <AnalyticsTabLayout
 header={
 <AnalyticsToolbar
 title="System Monitoring"
 subtitle={`Scope: ${formatBranch(data?.scope?.branch || branch)} • ${buildRangeLabel(range)}`}
 range={{
 value: range,
 onChange: (value) => {
 setEventPage(1);
 setIpPage(1);
 onRangeChange(value);
 },
 options: RANGE_OPTIONS_SHORT,
 }}
 branch={{
 value: branch,
 onChange: (value) => {
 setEventPage(1);
 setIpPage(1);
 onBranchChange(value);
 },
 options: [
 { value: "all", label: "All Branches" },
 { value: "gil-puyat", label: "Gil Puyat" },
 { value: "guadalupe", label: "Guadalupe" },
 ],
 }}
 actions={<ExportButtons onCsv={exportCsv} onPdf={exportPdf} />}
 />
 }
 >
 <MetricGrid items={metricCards} />

 <AnalyticsInsightSection
 reportLabel="security"
 summaryTitle="Security Summary"
 data={insightData}
 isLoading={isInsightLoading}
 isError={isInsightError}
 />

 <div className="admin-reports__grid">
 <ReportChartPanel title="Severity distribution" subtitle="Security and audit events by severity">
 <AnalyticsDonutChart
 data={severityDistribution.map((item) => ({
 label: item.label,
 value: item.count,
 }))}
 centerLabel={{ value: kpis.criticalEvents || 0, label: "Critical" }}
 emptyTitle="No severity data"
 emptyDescription="Severity distribution will appear once audit events exist for this scope."
 />
 </ReportChartPanel>

 <ReportChartPanel title="Branch-level security summary" subtitle="High-severity actions and overrides by branch">
 <AnalyticsComparisonChart
 data={branchSummary.map((item) => ({
 label: item.label,
 highSeverity: item.highSeverityCount,
 overrides: item.accessOverrideCount,
 }))}
 bars={[
 { key: "highSeverity", label: "High severity", color: "#dc2626" },
 { key: "overrides", label: "Overrides", color: "#2563eb" },
 ]}
 emptyTitle="No branch security summary"
 emptyDescription="Branch monitoring data will appear once audit activity is available."
 />
 </ReportChartPanel>
 </div>

 <div className="admin-reports__grid">
 <ReportChartPanel title="Recent security events" subtitle="Latest owner-level security and audit activity">
 <DataTable
 columns={EVENT_COLUMNS}
 data={recentSecurityEvents}
 loading={isLoading}
 pagination={{
 page: eventPage,
 pageSize: 10,
 total: recentSecurityEvents.length,
 onPageChange: setEventPage,
 }}
 emptyState={{
 title: isError ? "System monitoring unavailable" : "No recent security events",
 description: isError
 ? "The audit summary could not be loaded."
 : "No recent security activity matched the selected scope.",
 }}
 />
 </ReportChartPanel>

 <ReportChartPanel
 title="Suspicious IPs"
 subtitle="Failed login sources with repeated attempts"
 actions={
 <Link to="/admin/audit-logs" className="admin-reports__link">
 Open full audit log
 <ExternalLink size={14} />
 </Link>
 }
 >
 <DataTable
 columns={SUSPICIOUS_IP_COLUMNS}
 data={suspiciousIps}
 loading={isLoading}
 pagination={{
 page: ipPage,
 pageSize: 10,
 total: suspiciousIps.length,
 onPageChange: setIpPage,
 }}
 emptyState={{
 title: isError ? "Suspicious IP summary unavailable" : "No suspicious IPs",
 description: isError
 ? "The suspicious IP summary could not be loaded."
 : "No repeated failed-login IPs were found for this scope.",
 }}
 />
 </ReportChartPanel>
 </div>
 </AnalyticsTabLayout>
 );
}
