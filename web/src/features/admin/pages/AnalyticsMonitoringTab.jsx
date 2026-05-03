import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  useAuditAnalytics,
  useSystemPerformance,
} from "../../../shared/hooks/queries/useAnalyticsReports";
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
  buildServerTableParams,
  ExportButtons,
  getTablePagination,
  getTableRows,
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
const TABLE_PAGE_SIZE = 10;

export default function AnalyticsMonitoringTab({ branch, range, onBranchChange, onRangeChange }) {
  const [eventPage, setEventPage] = useState(1);
  const [ipPage, setIpPage] = useState(1);
  const params = useMemo(
    () => ({
      branch,
      range,
      ...buildServerTableParams(eventPage, TABLE_PAGE_SIZE),
    }),
    [branch, eventPage, range],
  );
  const { data, isLoading, isError } = useAuditAnalytics(params);
  const {
    data: performanceData,
    isLoading: isPerformanceLoading,
    isError: isPerformanceError,
  } = useSystemPerformance({ branch, range: "24h" });
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
  const recentSecurityEventsTable = data?.tables?.recentSecurityEvents;
  const recentSecurityEvents = getTableRows(recentSecurityEventsTable);
  const recentSecurityEventsPagination = getTablePagination(
    recentSecurityEventsTable,
    recentSecurityEvents,
  );
  const suspiciousIps = data?.tables?.suspiciousIps || [];
  const performanceKpis = performanceData?.kpis || {};
  const performanceChecks = performanceData?.checks || {};
  const resourceUsage = performanceData?.series?.resourceUsage || [];

  const metricCards = [
    { label: "Failed Logins", value: kpis.failedLogins || 0, tone: "rose" },
    { label: "Critical Events", value: kpis.criticalEvents || 0, tone: "amber" },
    { label: "Access Overrides", value: kpis.accessOverrides || 0, tone: "blue" },
    { label: "Unique IPs", value: kpis.uniqueFailedLoginIps || 0, tone: "green" },
  ];
  const performanceCards = [
    {
      label: "Service Status",
      value: isPerformanceLoading
        ? "..."
        : performanceKpis.serviceStatus || "unknown",
      tone: performanceKpis.serviceStatus === "healthy" ? "green" : "amber",
    },
    {
      label: "Database",
      value: isPerformanceLoading
        ? "..."
        : performanceKpis.databaseStatus || "unknown",
      tone: performanceKpis.databaseStatus === "connected" ? "green" : "rose",
    },
    {
      label: "Active Sessions",
      value: performanceKpis.activeSessions || 0,
      tone: "blue",
    },
    {
      label: "Memory Usage",
      value: `${performanceKpis.memoryUsageRate || 0}%`,
      tone: "amber",
    },
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

      <ReportChartPanel
        title="System performance"
        subtitle="Owner-only runtime, database, and active-session health from the last 24 hours"
      >
        {isPerformanceError ? (
          <p className="admin-reports__hint">System performance metrics could not be loaded.</p>
        ) : (
          <div className="admin-reports__panel-stack">
            <MetricGrid items={performanceCards} />
            <div className="admin-reports__grid">
              <AnalyticsBarChart
                data={resourceUsage}
                bars={[{ key: "value", label: "MB", color: "#2563eb" }]}
                valueFormatter={(value) => `${value} MB`}
                emptyTitle="No resource usage data"
                emptyDescription="Runtime memory data will appear once the endpoint responds."
              />
              <div className="admin-reports__meta-grid">
                <div className="admin-reports__meta-card">
                  <span className="admin-reports__meta-label">API uptime</span>
                  <div className="admin-reports__meta-value">
                    {performanceKpis.uptimeHours || 0} hrs
                  </div>
                </div>
                <div className="admin-reports__meta-card">
                  <span className="admin-reports__meta-label">Security check</span>
                  <div className="admin-reports__meta-value">
                    {performanceChecks.securitySignals?.status || "unknown"}
                  </div>
                  <p className="admin-reports__hint">
                    {performanceKpis.failedLogins24h || 0} failed login(s), {performanceKpis.highSeverityAudit24h || 0} high-severity event(s)
                  </p>
                </div>
                <div className="admin-reports__meta-card">
                  <span className="admin-reports__meta-label">Database ready state</span>
                  <div className="admin-reports__meta-value">
                    {performanceChecks.database?.readyState ?? "-"}
                  </div>
                  <p className="admin-reports__hint">
                    {performanceChecks.database?.label || "unknown"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </ReportChartPanel>

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
              pageSize: TABLE_PAGE_SIZE,
              total: recentSecurityEventsPagination.total,
              onPageChange: setEventPage,
            }}
            serverPagination
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
