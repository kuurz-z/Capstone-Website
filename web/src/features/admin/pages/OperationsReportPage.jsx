import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, FileDown, ExternalLink } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useOperationsReport } from "../../../shared/hooks/queries/useAnalyticsReports";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import { exportReportPdf } from "../../../shared/utils/reportPdf";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import {
  ActionBar,
  DataTable,
  PageShell,
  ReportChartPanel,
  ReportFilterBar,
  ReportMetricCard,
} from "../components/shared";
import {
  REPORT_ROUTES,
  REPORT_TABS,
  buildRangeLabel,
  formatBranch,
  formatDate,
  formatDateTime,
} from "./reportCommon";
import "../styles/design-tokens.css";
import "../styles/admin-reports.css";

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
];

const MAINTENANCE_COLUMNS = [
  { key: "requestId", label: "Request ID", sortable: true },
  { key: "typeLabel", label: "Type", sortable: true },
  { key: "urgency", label: "Urgency", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch) },
  { key: "createdAt", label: "Created", render: (row) => formatDateTime(row.createdAt) },
  {
    key: "resolutionHours",
    label: "Resolution",
    render: (row) => (row.resolutionHours == null ? "-" : `${row.resolutionHours} hrs`),
  },
  { key: "slaState", label: "SLA", sortable: true },
];

function BarList({ items, valueKey, formatter = (value) => value }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div className="admin-reports__list">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max((value / maxValue) * 100, value > 0 ? 6 : 0);
        return (
          <div key={`${item.label}-${value}`} className="admin-reports__bar-row">
            <span className="admin-reports__bar-label">{item.label}</span>
            <div className="admin-reports__bar-track">
              <div className="admin-reports__bar-fill" style={{ width: `${width}%` }} />
            </div>
            <span className="admin-reports__bar-value">{formatter(value, item)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function OperationsReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [range, setRange] = useState("30d");
  const [branch, setBranch] = useState(isOwner ? "all" : user?.branch || "gil-puyat");
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      range,
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );

  const { data, isLoading, isError } = useOperationsReport(params);
  const maintenanceIssues = data?.tables?.maintenanceIssues || [];
  const reservations = data?.tables?.reservations || [];
  const inquiryWindows = data?.tables?.peakInquiryWindows || [];
  const reservationsByPeriod = data?.series?.reservationsByPeriod || [];
  const maintenanceByType = data?.series?.maintenanceByType || [];
  const maintenanceResolution = data?.series?.maintenanceResolution || [];
  const pagedMaintenance = maintenanceIssues.slice((page - 1) * 10, page * 10);

  const metricCards = [
    { label: "Reservations", value: data?.kpis?.reservations || 0, tone: "blue" },
    { label: "Inquiries", value: data?.kpis?.inquiries || 0, tone: "green" },
    { label: "Maintenance", value: data?.kpis?.maintenanceRequests || 0, tone: "amber" },
    { label: "SLA Compliance", value: data?.kpis?.slaComplianceRateLabel || "0%", tone: "rose" },
  ];

  const handleCsvExport = () => {
    exportToCSV(maintenanceIssues, [
      { key: "requestId", label: "Request ID" },
      { key: "typeLabel", label: "Type" },
      { key: "urgency", label: "Urgency" },
      { key: "status", label: "Status" },
      { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
      { key: "createdAt", label: "Created", formatter: (value) => formatDateTime(value) },
      { key: "resolvedAt", label: "Resolved", formatter: (value) => formatDateTime(value) },
      { key: "resolutionHours", label: "Resolution Hours" },
      { key: "slaState", label: "SLA State" },
    ], `operations-report-${range}`);
  };

  const handlePdfExport = () => {
    exportReportPdf({
      title: "Operations Report",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `operations-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        {
          title: "Peak Inquiry Windows",
          rows: inquiryWindows.map((item) => `${item.label}: ${item.count} inquiries`),
        },
        {
          title: "Recent Reservations",
          rows: reservations.slice(0, 12).map(
            (item) => `${item.guestName} • ${item.roomName} • ${item.status} • ${formatDate(item.createdAt)}`,
          ),
        },
      ],
    });
  };

  return (
    <PageShell
      tabs={REPORT_TABS}
      activeTab="operations"
      onTabChange={(key) => navigate(REPORT_ROUTES[key])}
    >
      <PageShell.Summary>
        <ReportFilterBar
          title="Operations report"
          subtitle={`${buildRangeLabel(range)} • Scope: ${formatBranch(data?.scope?.branch || branch)}`}
          controls={
            <div className="admin-reports__actions">
              <button className="action-bar__btn action-bar__btn--ghost" onClick={handleCsvExport}>
                <FileDown size={15} />
                Export CSV
              </button>
              <button className="action-bar__btn action-bar__btn--primary" onClick={handlePdfExport}>
                <Download size={15} />
                Export PDF
              </button>
            </div>
          }
        />
        <div className="admin-reports__metrics">
          {metricCards.map((item) => (
            <ReportMetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              tone={item.tone}
            />
          ))}
        </div>
      </PageShell.Summary>

      <PageShell.Actions>
        <ActionBar
          filters={[
            {
              key: "range",
              value: range,
              onChange: (value) => {
                setRange(value);
                setPage(1);
              },
              options: RANGE_OPTIONS,
            },
            ...(isOwner
              ? [
                  {
                    key: "branch",
                    value: branch,
                    onChange: (value) => {
                      setBranch(value);
                      setPage(1);
                    },
                    options: OWNER_BRANCH_FILTER_OPTIONS,
                  },
                ]
              : []),
          ]}
          actions={[
            {
              label: "Open Activity Log",
              icon: ExternalLink,
              variant: "ghost",
              onClick: () => navigate("/admin/audit-logs"),
            },
          ]}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <div className="admin-reports__grid">
          <ReportChartPanel
            title="Reservation flow"
            subtitle="Reservation volume over the selected period"
          >
            <BarList
              items={reservationsByPeriod.slice(-10).map((item) => ({
                label: item.label,
                value: item.count,
              }))}
              valueKey="value"
            />
          </ReportChartPanel>

          <ReportChartPanel
            title="Maintenance categories"
            subtitle="Most common maintenance request types"
          >
            <BarList
              items={maintenanceByType.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
              valueKey="value"
            />
          </ReportChartPanel>
        </div>

        <div className="admin-reports__grid">
          <ReportChartPanel
            title="Inquiry timing"
            subtitle="Peak inquiry windows in two-hour blocks"
          >
            <BarList items={inquiryWindows} valueKey="count" />
          </ReportChartPanel>

          <ReportChartPanel
            title="Resolution performance"
            subtitle="Average maintenance resolution time by category"
          >
            <BarList
              items={maintenanceResolution.map((item) => ({
                label: item.label,
                value: item.avgHours,
              }))}
              valueKey="value"
              formatter={(value) => `${value} hrs`}
            />
          </ReportChartPanel>
        </div>

        <ReportChartPanel
          title="Maintenance issue log"
          subtitle="Most recent branch-scoped maintenance tickets"
        >
          <DataTable
            columns={MAINTENANCE_COLUMNS}
            data={pagedMaintenance}
            loading={isLoading}
            pagination={{
              page,
              pageSize: 10,
              total: maintenanceIssues.length,
              onPageChange: setPage,
            }}
            emptyState={{
              title: isError ? "Operations report unavailable" : "No maintenance issues",
              description: isError
                ? "The operations report could not be loaded."
                : "No maintenance issues were found for the selected scope.",
            }}
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Recent reservations"
          subtitle="Latest reservation activity in the selected reporting window"
          actions={
            <Link to="/admin/reservations" className="admin-reports__link">
              Open reservations
              <ExternalLink size={14} />
            </Link>
          }
        >
          <div className="admin-reports__panel-stack">
            {reservations.slice(0, 6).map((reservation) => (
              <div key={reservation.id} className="admin-reports__meta-card">
                <span className="admin-reports__meta-label">{reservation.guestName}</span>
                <div className="admin-reports__meta-value">{reservation.roomName}</div>
                <p className="admin-reports__hint">
                  {reservation.status} • {formatDate(reservation.createdAt)} • {formatBranch(reservation.branch)}
                </p>
              </div>
            ))}
          </div>
        </ReportChartPanel>
      </PageShell.Content>
    </PageShell>
  );
}
