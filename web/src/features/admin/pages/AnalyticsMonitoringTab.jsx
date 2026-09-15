import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Globe, KeyRound, RotateCcw, ShieldAlert } from "lucide-react";
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
import { AdminAnalyticsDetailSkeleton } from "../components/AdminContentSkeletons";
import { buildRangeLabel, formatBranch, formatDate, formatDateTime } from "./reportCommon";
import {
 AnalyticsInsightSection,
 AnalyticsTableToolbar,
 buildInsightPdfSections,
 ExportButtons,
 handleCsvExport,
 handlePdfExport,
 MetricGrid,
 RANGE_OPTIONS_SHORT,
 unwrapTableRows,
 useReportInsights,
 getDynamicMonitoringPrompts,
} from "./analyticsTabShared";

const AUDIT_SEVERITY_COLORS = {
  info: "#0284c7",
  warning: "#d97706",
  high: "#ea580c",
  critical: "#e11d48",
};

const getSeverityDot = (severity) => {
  const s = String(severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "bg-rose-500";
  if (s === "warning" || s === "medium") return "bg-amber-500";
  return "bg-slate-400 dark:bg-slate-500";
};

const getSeverityTextColor = (severity) => {
  const s = String(severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "text-rose-600 dark:text-rose-400";
  if (s === "warning" || s === "medium") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
};

const EVENT_COLUMNS = [
  {
    key: "action",
    label: "Event",
    width: "28%",
    sortable: true,
    render: (row) => (
      <span className="font-medium text-foreground text-xs leading-relaxed line-clamp-2">
        {row.action || "—"}
      </span>
    ),
  },
  {
    key: "branch",
    label: "Branch",
    width: "16%",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatBranch(row.branch)}
      </span>
    ),
  },
  {
    key: "severity",
    label: "Severity",
    width: "16%",
    sortable: true,
    render: (row) => {
      const s = String(row.severity || "info").toLowerCase();
      const label = s.charAt(0).toUpperCase() + s.slice(1);
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${getSeverityTextColor(s)}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSeverityDot(s)}`} />
          {label}
        </span>
      );
    },
  },
  {
    key: "user",
    label: "User",
    width: "20%",
    sortable: true,
    render: (row) => {
      const userStr = String(row.user || "—");
      const isHash = userStr.startsWith("sha256:") || userStr.length > 20;
      const displayVal = isHash ? `${userStr.slice(0, 16)}…` : userStr;
      return (
        <span
          className="font-mono text-xs text-muted-foreground truncate block max-w-full"
          title={userStr}
        >
          {displayVal}
        </span>
      );
    },
  },
  {
    key: "timestamp",
    label: "Time",
    width: "20%",
    align: "right",
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.timestamp)}
      </span>
    ),
  },
];

const SUSPICIOUS_IP_COLUMNS = [
  {
    key: "ipAddress",
    label: "IP Address",
    width: "36%",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-foreground font-medium">
        {row.ipAddress || "—"}
      </span>
    ),
  },
  {
    key: "attempts",
    label: "Failed Logins",
    width: "30%",
    sortable: true,
    render: (row) => (
      <span className="font-semibold text-rose-600 dark:text-rose-400 text-xs tabular-nums">
        {row.attempts || 0} attempts
      </span>
    ),
  },
  {
    key: "lastSeenAt",
    label: "Last Seen",
    width: "34%",
    align: "right",
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.lastSeenAt)}
      </span>
    ),
  },
];

export default function AnalyticsMonitoringTab({
  branch,
  range,
  isOwner,
  onBranchChange,
  onRangeChange,
  registerExport,
}) {
  const [eventPage, setEventPage] = useState(1);
  const [ipPage, setIpPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [eventPageSize, setEventPageSize] = useState(10);
  const [ipPageSize, setIpPageSize] = useState(10);

  const params = useMemo(() => ({ branch, range }), [branch, range]);
  const { data, isLoading, isError, error, refetch } = useAuditAnalytics(params);

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
  const branchSummary = Array.isArray(data?.series?.branchSummary) ? data?.series?.branchSummary : [];
  const severityDistribution = Array.isArray(data?.series?.severityDistribution) ? data?.series?.severityDistribution : [];
  const recentSecurityEvents = unwrapTableRows(data?.tables?.recentSecurityEvents);
  const suspiciousIps = Array.isArray(data?.tables?.suspiciousIps) ? data?.tables?.suspiciousIps : [];

  const filteredSecurityEvents = useMemo(() => {
    return recentSecurityEvents.filter((item) => {
      const matchSearch =
        !searchQuery ||
        (item.action && String(item.action).toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.user && String(item.user).toLowerCase().includes(searchQuery.toLowerCase()));

      const matchSeverity =
        severityFilter === "all" ||
        (item.severity && String(item.severity).toLowerCase() === severityFilter.toLowerCase());

      return matchSearch && matchSeverity;
    });
  }, [recentSecurityEvents, searchQuery, severityFilter]);

  const monitoringPrompts = useMemo(
    () => getDynamicMonitoringPrompts(data),
    [data],
  );

  const metricCards = useMemo(
    () => [
      { icon: ShieldAlert, label: "Failed Logins", value: kpis.failedLogins || 0, tone: "rose", trend: "Authentication failures" },
      { icon: AlertTriangle, label: "Critical Events", value: kpis.criticalEvents || 0, tone: "amber", trend: "High priority alerts" },
      { icon: KeyRound, label: "Access Overrides", value: kpis.accessOverrides || 0, tone: "blue", trend: "Permission changes" },
      { icon: Globe, label: "Unique IPs", value: kpis.uniqueFailedLoginIps || 0, tone: "green", trend: "Origin addresses" },
    ],
    [kpis],
  );

  const exportCsv = useCallback(() => {
    handleCsvExport(
      filteredSecurityEvents,
      [
        { key: "action", label: "Event" },
        { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
        { key: "severity", label: "Severity" },
        { key: "user", label: "User" },
        { key: "timestamp", label: "Timestamp", formatter: (value) => formatDateTime(value) },
      ],
      `lilycrest-monitoring-${branch || "all"}-${range}`,
    );
  }, [filteredSecurityEvents, branch, range]);

  const exportPdf = useCallback(() => {
    handlePdfExport({
      title: "System Monitoring & Security Analytics",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `lilycrest-monitoring-${branch || "all"}-${range}.pdf`,
      reportType: "Monitoring",
      kpis: metricCards.map((item, i) => ({
        label: item.label,
        value: item.value,
        sub: "",
        highlight: i === 0,
      })),
      aiInsight: {
        headline: insightData?.insight?.headline || "Security summary",
        summary: insightData?.insight?.summary || "",
        confidence: insightData?.insight?.confidence === "high" ? 85
          : insightData?.insight?.confidence === "medium" ? 60
          : insightData?.insight?.confidence === "low" ? 35
          : 0,
        confidenceLabel: insightData?.insight?.confidence
          ? `${insightData.insight.confidence.charAt(0).toUpperCase() + insightData.insight.confidence.slice(1)}`
          : "",
        standout: insightData?.insight?.keyFindings || [],
        watch: insightData?.insight?.riskAlerts || [],
        nextSteps: insightData?.insight?.recommendedActions || [],
      },
      sections: [
        {
          title: "Branch Security Summary",
          type: "table",
          headers: ["Branch", "Events", "Critical", "Overrides"],
          rows: branchSummary.map((item) => ({
            Branch: item.label,
            Events: item.totalEvents || 0,
            Critical: item.criticalCount || 0,
            Overrides: item.accessOverrideCount || 0,
          })),
        },
        {
          title: "Recent Security Events",
          type: "table",
          headers: ["Event", "Branch", "Severity", "Date"],
          rows: filteredSecurityEvents.slice(0, 12).map((item) => ({
            Event: item.action || "-",
            Branch: formatBranch(item.branch),
            Severity: item.severity || "-",
            Date: formatDate(item.timestamp),
          })),
        },
        {
          title: "Suspicious IP Activity",
          type: "table",
          headers: ["IP Address", "Failed Logins", "Last Seen"],
          rows: suspiciousIps.slice(0, 12).map((item) => ({
            "IP Address": item.ipAddress || "-",
            "Failed Logins": item.attempts || 0,
            "Last Seen": formatDateTime(item.lastSeenAt),
          })),
        },
      ],
    });
  }, [range, data, branch, metricCards, insightData, branchSummary, filteredSecurityEvents, suspiciousIps]);

  useEffect(() => {
    if (typeof registerExport === "function") {
      registerExport({ exportCsv, exportPdf });
    }
  }, [registerExport, exportCsv, exportPdf]);

  if (isLoading && !data) {
    return <AdminAnalyticsDetailSkeleton tab="monitoring" />;
  }

  if (isError && !data) {
    return (
      <div className="analytics-tab-content flex flex-col items-center justify-center p-8 bg-card border border-border rounded-xl text-center space-y-4 my-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
          <ShieldAlert size={24} />
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-base font-semibold text-foreground">
            System Monitoring Unavailable
          </h3>
          <p className="text-xs text-muted-foreground">
            {error?.message || "Could not load security audit metrics. Please check your network connection or try again."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw size={14} />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  const handleExecuteAction = (action) => {
    if (!action) return;
    if (action.actionType === "SEARCH" && action.filterValue) {
      setSearchQuery(action.filterValue);
      setEventPage(1);
    }
  };

  return (
    <div className="analytics-tab-content flex flex-col gap-6 w-full pt-1">
      <MetricGrid items={metricCards} />

      <AnalyticsInsightSection
        reportLabel="security"
        summaryTitle="Security & System Audit Intelligence"
        reportType="audit"
        range={range}
        branch={branch}
        data={insightData}
        isLoading={isInsightLoading}
        isError={isInsightError}
        suggestedPrompts={monitoringPrompts}
        onExecuteAction={handleExecuteAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChartPanel title="Severity distribution" subtitle="Security and audit events by severity">
          <AnalyticsDonutChart
            data={severityDistribution.map((item) => {
              const key = String(item.severity || item.label || "").toLowerCase();
              return {
                label: item.label,
                value: item.count,
                color: AUDIT_SEVERITY_COLORS[key] || item.color,
              };
            })}
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

      <div className="flex flex-col gap-6">
        <ReportChartPanel title="Recent security events" subtitle="Latest owner-level security and audit activity">
          <AnalyticsTableToolbar
            searchQuery={searchQuery}
            onSearchChange={(val) => {
              setSearchQuery(val);
              setEventPage(1);
            }}
            searchPlaceholder="Search event or user..."
            filters={[
              {
                key: "severityFilter",
                label: "Severity",
                value: severityFilter,
                onChange: (val) => {
                  setSeverityFilter(val);
                  setEventPage(1);
                },
                options: [
                  { value: "all", label: "All Severities" },
                  { value: "critical", label: "Critical" },
                  { value: "warning", label: "Warning" },
                  { value: "info", label: "Info" },
                ],
              },
            ]}
            hasActiveFilters={Boolean(searchQuery || severityFilter !== "all")}
            onResetFilters={() => {
              setSearchQuery("");
              setSeverityFilter("all");
              setEventPage(1);
            }}
            extraActions={
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                  Showing {filteredSecurityEvents.length} of {recentSecurityEvents.length} events
                </span>
                <ExportButtons onCsv={exportCsv} onPdf={exportPdf} />
              </div>
            }
          />

          <DataTable
            columns={EVENT_COLUMNS}
            data={filteredSecurityEvents}
            loading={isLoading}
            pagination={{
              page: eventPage,
              pageSize: eventPageSize,
              total: filteredSecurityEvents.length,
              onPageChange: setEventPage,
              onPageSizeChange: setEventPageSize,
            }}
            emptyState={{
              title: isError ? "System monitoring unavailable" : "No recent security events",
              description: isError
                ? "The audit summary could not be loaded."
                : "No recent security activity matched the selected filter.",
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
              pageSize: ipPageSize,
              total: suspiciousIps.length,
              onPageChange: setIpPage,
              onPageSizeChange: setIpPageSize,
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
    </div>
 );
}
