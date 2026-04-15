import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileDown } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useBillingReport } from "../../../shared/hooks/queries/useAnalyticsReports";
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
  formatPeso,
} from "./reportCommon";
import "../styles/design-tokens.css";
import "../styles/admin-reports.css";

const RANGE_OPTIONS = [
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
];

const OVERDUE_COLUMNS = [
  { key: "tenantName", label: "Tenant", sortable: true },
  { key: "roomName", label: "Room", sortable: true },
  { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch) },
  { key: "status", label: "Status", sortable: true },
  { key: "dueDate", label: "Due Date", render: (row) => formatDate(row.dueDate) },
  { key: "daysOverdue", label: "Days Overdue", sortable: true },
  { key: "balance", label: "Balance", render: (row) => formatPeso(row.balance), sortable: true },
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

export default function BillingReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [range, setRange] = useState("3m");
  const [branch, setBranch] = useState(isOwner ? "all" : user?.branch || "gil-puyat");
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      range,
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );

  const { data, isLoading, isError } = useBillingReport(params);
  const overdueAccounts = data?.tables?.overdueAccounts || [];
  const unpaidBalances = data?.tables?.unpaidBalances || [];
  const revenueByMonth = data?.series?.revenueByMonth || [];
  const statusDistribution = data?.series?.statusDistribution || [];
  const overdueAging = data?.series?.overdueAging || [];
  const pagedRows = overdueAccounts.slice((page - 1) * 10, page * 10);

  const metricCards = [
    { label: "Collected Revenue", value: data?.kpis?.collectedRevenueLabel || "PHP 0", tone: "green" },
    { label: "Billed Amount", value: data?.kpis?.billedAmountLabel || "PHP 0", tone: "blue" },
    { label: "Outstanding", value: data?.kpis?.outstandingBalanceLabel || "PHP 0", tone: "rose" },
    { label: "Collection Rate", value: data?.kpis?.collectionRateLabel || "0%", tone: "amber" },
  ];

  const handleCsvExport = () => {
    exportToCSV(unpaidBalances, [
      { key: "tenantName", label: "Tenant" },
      { key: "roomName", label: "Room" },
      { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
      { key: "status", label: "Status" },
      { key: "billingMonth", label: "Billing Month", formatter: (value) => formatDate(value) },
      { key: "dueDate", label: "Due Date", formatter: (value) => formatDate(value) },
      { key: "paidAmount", label: "Paid", formatter: (value) => formatPeso(value) },
      { key: "balance", label: "Balance", formatter: (value) => formatPeso(value) },
    ], `billing-report-${range}`);
  };

  const handlePdfExport = () => {
    exportReportPdf({
      title: "Billing & Collections Report",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `billing-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        {
          title: "Monthly Revenue",
          rows: revenueByMonth.map(
            (item) =>
              `${item.label}: collected ${formatPeso(item.collectedRevenue)}, billed ${formatPeso(item.billedAmount)}`,
          ),
        },
        {
          title: "Top Outstanding Bills",
          rows: unpaidBalances.slice(0, 12).map(
            (item) => `${item.tenantName} • ${item.roomName} • ${formatPeso(item.balance)}`,
          ),
        },
      ],
    });
  };

  return (
    <PageShell
      tabs={REPORT_TABS}
      activeTab="billing"
      onTabChange={(key) => navigate(REPORT_ROUTES[key])}
    >
      <PageShell.Summary>
        <ReportFilterBar
          title="Billing and collections"
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
        />
      </PageShell.Actions>

      <PageShell.Content>
        <div className="admin-reports__grid">
          <ReportChartPanel
            title="Month-over-month revenue"
            subtitle="Collected revenue in the selected billing window"
          >
            <BarList
              items={revenueByMonth.map((item) => ({
                label: item.label,
                value: item.collectedRevenue,
              }))}
              valueKey="value"
              formatter={(value) => formatPeso(value)}
            />
          </ReportChartPanel>

          <ReportChartPanel
            title="Overdue aging"
            subtitle="Open balances bucketed by days overdue"
          >
            <BarList
              items={overdueAging.map((item) => ({
                label: item.label,
                value: item.amount,
              }))}
              valueKey="value"
              formatter={(value) => formatPeso(value)}
            />
          </ReportChartPanel>
        </div>

        <div className="admin-reports__grid">
          <ReportChartPanel
            title="Payment status mix"
            subtitle="Current billing status distribution"
          >
            <BarList
              items={statusDistribution.map((item) => ({
                label: item.status,
                value: item.count,
              }))}
              valueKey="value"
            />
          </ReportChartPanel>

          <ReportChartPanel
            title="Largest unpaid balances"
            subtitle="Highest remaining balances in this branch scope"
          >
            <div className="admin-reports__panel-stack">
              {unpaidBalances.slice(0, 6).map((item) => (
                <div key={item.id} className="admin-reports__meta-card">
                  <span className="admin-reports__meta-label">{item.tenantName}</span>
                  <div className="admin-reports__meta-value">{formatPeso(item.balance)}</div>
                  <p className="admin-reports__hint">
                    {item.roomName} • due {formatDate(item.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          </ReportChartPanel>
        </div>

        <ReportChartPanel
          title="Overdue accounts"
          subtitle="Bills past due date and still carrying an outstanding balance"
        >
          <DataTable
            columns={OVERDUE_COLUMNS}
            data={pagedRows}
            loading={isLoading}
            pagination={{
              page,
              pageSize: 10,
              total: overdueAccounts.length,
              onPageChange: setPage,
            }}
            emptyState={{
              title: isError ? "Billing report unavailable" : "No overdue accounts",
              description: isError
                ? "The billing report could not be loaded."
                : "No overdue balances were found for the selected scope.",
            }}
          />
        </ReportChartPanel>
      </PageShell.Content>
    </PageShell>
  );
}
