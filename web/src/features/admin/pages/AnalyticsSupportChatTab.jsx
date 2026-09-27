import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
  Star,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useSupportChatReport } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
  AnalyticsDonutChart,
  AnalyticsLineChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  DataTable,
  PeriodComparisonCard,
  ReportChartPanel,
} from "../components/shared";
import { AdminAnalyticsDetailSkeleton } from "../components/AdminContentSkeletons";
import { buildRangeLabel, formatBranch, formatDate, formatDateTime } from "./reportCommon";
import {
  AnalyticsInsightSection,
  AnalyticsTableToolbar,
  buildBranchControl,
  CardFilterSelect,
  ExportButtons,
  handleCsvExport,
  handlePdfExport,
  MetricGrid,
  RANGE_OPTIONS_SHORT,
  unwrapTableRows,
  useReportInsights,
} from "./analyticsTabShared";
import "../styles/design-tokens.css";
import "../styles/admin-reports.css";

const SUPPORT_CHAT_COLUMNS = [
  {
    key: "tenantName",
    label: "Tenant",
    sortable: true,
    render: (row) => (
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{row.tenantName}</span>
        {row.tenantEmail && (
          <span className="text-[11px] text-muted-foreground">{row.tenantEmail}</span>
        )}
      </div>
    ),
  },
  {
    key: "roomBed",
    label: "Room / Bed",
    sortable: true,
    render: (row) => <span className="font-medium text-muted-foreground">{row.roomBed}</span>,
  },
  {
    key: "category",
    label: "Category",
    sortable: true,
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.category}</span>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    sortable: true,
    render: (row) => {
      const p = String(row.priority || "normal").toLowerCase();
      const isUrgent = p === "urgent";
      const isHigh = p === "high";
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            background: "transparent",
            color: isUrgent
              ? "var(--danger-dark, #b91c1c)"
              : isHigh
              ? "var(--warning-dark, #b45309)"
              : "var(--muted-foreground, #64748b)",
            border: "1px solid var(--border)",
            textTransform: "capitalize",
          }}
        >
          {row.priority || "Normal"}
        </span>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => {
      const s = String(row.status || "").toLowerCase();
      const isResolved = s === "resolved";
      const isClosed = s === "closed";
      const isWaiting = s === "waiting_tenant";
      const isInReview = s === "in_review";

      const labelMap = {
        open: "Open",
        in_review: "In Review",
        waiting_tenant: "Waiting Tenant",
        resolved: "Resolved",
        closed: "Closed",
      };

      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            background: "transparent",
            color: isResolved
              ? "var(--success-dark, #166534)"
              : isWaiting
              ? "var(--warning-dark, #b45309)"
              : isInReview
              ? "var(--info-dark, #1d4ed8)"
              : isClosed
              ? "var(--muted-foreground, #64748b)"
              : "var(--foreground)",
            border: "1px solid var(--border)",
          }}
        >
          {labelMap[s] || s}
        </span>
      );
    },
  },
  {
    key: "firstReplyLabel",
    label: "First Response",
    sortable: true,
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.firstReplyLabel}</span>
    ),
  },
  {
    key: "resolutionLabel",
    label: "Turnaround Time",
    sortable: true,
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.resolutionLabel}</span>
    ),
  },
  {
    key: "satisfactionRating",
    label: "CSAT",
    sortable: true,
    render: (row) =>
      row.satisfactionRating ? (
        <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
          <Star size={13} fill="currentColor" />
          <span>{row.satisfactionRating}.0 {row.legacy ? "(historical)" : ""}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "branch",
    label: "Branch",
    render: (row) => formatBranch(row.branch),
  },
  {
    key: "createdAt",
    label: "Created",
    render: (row) => formatDateTime(row.createdAt),
  },
];

export default function AnalyticsSupportChatTab({
  branch,
  range = "30d",
  isOwner = false,
  onBranchChange,
  onRangeChange,
  registerExport,
}) {
  const queryParams = useMemo(
    () => ({
      range,
      ...(isOwner && branch ? { branch } : {}),
    }),
    [range, isOwner, branch],
  );

  const { data, isLoading, error, refetch } = useSupportChatReport(queryParams);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const kpis = data?.kpis || {};
  const series = data?.series || {};
  const tables = data?.tables || {};

  const volumeTrend = series.volumeByPeriod || [];
  const categoryDist = series.categoryDistribution || [];
  const priorityDist = series.priorityDistribution || [];
  const branchComp = series.branchComparison || [];
  const allRows = unwrapTableRows(tables.recentConversations) || [];

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (selectedCategory !== "all" && row.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== "all" && row.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [allRows, selectedCategory, selectedStatus]);

  const metricCards = useMemo(
    () => [
      {
        icon: MessageSquare,
        tone: "blue",
        label: "Total Inquiries",
        value: kpis.totalConversations || 0,
        trend: kpis.comparison?.totalConversations?.text || "vs prev period",
        changeType: kpis.comparison?.totalConversations?.changeType || "neutral",
        note: `${kpis.urgentCount || 0} urgent priority tickets`,
      },
      {
        icon: Timer,
        tone: "amber",
        label: "Target Response Time",
        value: kpis.avgFirstResponseLabel || "0m",
        trend: "Avg first admin reply",
        changeType: "neutral",
        note: "Standard turnaround benchmark",
      },
      {
        icon: Clock,
        tone: "amber",
        label: "Avg Resolution Turnaround",
        value: kpis.avgResolutionLabel || "0m",
        trend: "From creation to resolution",
        changeType: "neutral",
        note: `${kpis.resolvedCount || 0} resolved, ${kpis.closedCount || 0} closed`,
      },
      {
        icon: CheckCircle2,
        tone: "green",
        label: "Resolution Rate",
        value: kpis.resolutionRateLabel || "0%",
        trend: "Resolved support concerns",
        changeType: "neutral",
        note: kpis.avgSatisfactionRating
          ? `★ ${kpis.avgSatisfactionRating} request CSAT (${kpis.ratedConversationsCount || 0} reviews)`
          : kpis.legacyAvgSatisfactionRating ? `Historical conversation CSAT: ${kpis.legacyAvgSatisfactionRating} (${kpis.legacyRatedConversationsCount} reviews)` : "Awaiting tenant reviews",
      },
    ],
    [kpis],
  );

  // Export handlers
  useEffect(() => {
    if (typeof registerExport === "function") {
      registerExport({
        exportCsv: () =>
          handleCsvExport(
            filteredRows,
            [
              { key: "tenantName", label: "Tenant" },
              { key: "tenantEmail", label: "Email" },
              { key: "branchLabel", label: "Branch" },
              { key: "roomBed", label: "Room/Bed" },
              { key: "category", label: "Category" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
              { key: "firstReplyLabel", label: "First Response" },
              { key: "resolutionLabel", label: "Turnaround Time" },
              { key: "satisfactionRating", label: "CSAT" },
              { key: "createdAt", label: "Created", formatter: (val) => formatDateTime(val) },
            ],
            `lilycrest-support-chat-${branch || "all"}-${range}`,
          ),
        exportPdf: () =>
          handlePdfExport({
            title: "Support Chat Analytics Report",
            subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
            filename: `lilycrest-support-chat-${branch || "all"}-${range}.pdf`,
            reportType: "Support",
            kpis: metricCards.map((item, i) => ({
              label: item.label,
              value: item.value,
              sub: item.trend,
              highlight: i === 0,
            })),
            table: {
              headers: ["Tenant", "Branch", "Category", "Priority", "Status", "Turnaround"],
              rows: filteredRows.slice(0, 40).map((r) => [
                r.tenantName,
                r.branchLabel,
                r.category,
                r.priority,
                r.status,
                r.resolutionLabel,
              ]),
            },
          }),
      });
    }
  }, [registerExport, filteredRows, metricCards, data, branch, range]);

  if (isLoading) {
    return <AdminAnalyticsDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-card rounded-xl border border-border">
        <AlertTriangle className="mx-auto text-amber-500 mb-3" size={32} />
        <h3 className="text-base font-semibold text-foreground">Failed to load support analytics</h3>
        <p className="text-xs text-muted-foreground mt-1">{error.message || "Please try again."}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 px-3.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <MetricGrid items={metricCards} />

      {/* Chart Panels Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Inquiries Over Time */}
        <div className="lg:col-span-8">
          <ReportChartPanel
            title="Support Inquiry Volume Over Time"
            subtitle={`Inquiry trends and resolutions — ${buildRangeLabel(range).toLowerCase()}`}
          >
            {volumeTrend.length > 0 ? (
              <AnalyticsLineChart
                data={volumeTrend}
                lines={[
                  { key: "total", label: "Total Inquiries", color: "#2563eb", strokeWidth: 2.5 },
                  { key: "resolved", label: "Resolved", color: "#16a34a", strokeWidth: 2 },
                  { key: "open", label: "Active", color: "#f59e0b", strokeWidth: 1.5, strokeDasharray: "3 3" },
                ]}
                valueFormatter={(val) => `${val} ticket${val === 1 ? "" : "s"}`}
              />
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No conversation history recorded in this period.
              </div>
            )}
          </ReportChartPanel>
        </div>

        {/* Concern Categories Donut */}
        <div className="lg:col-span-4">
          <ReportChartPanel
            title="Inquiries by Category"
            subtitle="Distribution of tenant concerns"
          >
            {categoryDist.length > 0 ? (
              <AnalyticsDonutChart
                data={categoryDist}
                valueFormatter={(val) => `${val} tickets`}
              />
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No category records available.
              </div>
            )}
          </ReportChartPanel>
        </div>
      </div>

      {/* Cross-Branch Comparison & Priority Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Branch Head-to-Head */}
        <div className="lg:col-span-8">
          <ReportChartPanel
            title="Cross-Branch Support Performance"
            subtitle="Comparing Pasay vs Makati ticket volume & resolution rate"
          >
            {branchComp.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {branchComp.map((b) => (
                    <div
                      key={b.branchCode}
                      className="p-4 rounded-xl border border-border bg-card/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">{b.branchName}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-border text-muted-foreground">
                          {b.volume} total
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-center">
                        <div>
                          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Active</div>
                          <div className="text-sm font-bold text-foreground mt-0.5">{b.active}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Response</div>
                          <div className="text-sm font-bold text-foreground mt-0.5">{b.avgFirstReplyLabel}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Resolution</div>
                          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{b.resolutionRate}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No branch data available.
              </div>
            )}
          </ReportChartPanel>
        </div>

        {/* Priority Breakdown */}
        <div className="lg:col-span-4">
          <ReportChartPanel
            title="Priority Levels"
            subtitle="Urgent vs High vs Normal triage"
          >
            {priorityDist.some((d) => d.value > 0) ? (
              <AnalyticsDonutChart
                data={priorityDist}
                valueFormatter={(val) => `${val} tickets`}
              />
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No priority records available.
              </div>
            )}
          </ReportChartPanel>
        </div>
      </div>

      {/* Recent Support Conversations Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Support Conversation Logs</h3>
            <p className="text-xs text-muted-foreground">
              Detailed history of tenant support tickets and response turnaround times.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-8 px-2.5 py-1 text-xs font-semibold bg-background text-foreground border border-border rounded-lg shadow-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              <option value="Billing Concern">Billing Concern</option>
              <option value="Maintenance Concern">Maintenance Concern</option>
              <option value="Reservation Concern">Reservation Concern</option>
              <option value="Payment Concern">Payment Concern</option>
              <option value="General Inquiry">General Inquiry</option>
              <option value="Urgent Issue">Urgent Issue</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 px-2.5 py-1 text-xs font-semibold bg-background text-foreground border border-border rounded-lg shadow-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_review">In Review</option>
              <option value="waiting_tenant">Waiting Tenant</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <DataTable
          columns={SUPPORT_CHAT_COLUMNS}
          data={filteredRows}
          emptyMessage="No support conversations found matching the selected filters."
        />
      </div>
    </div>
  );
}
