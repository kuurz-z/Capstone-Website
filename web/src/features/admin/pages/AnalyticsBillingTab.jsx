import { useMemo, useState } from "react";
import { useBillingReport } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
  AnalyticsDonutChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  DataTable,
  ReportChartPanel,
} from "../components/shared";
import { buildRangeLabel, formatBranch, formatDate, formatPeso } from "./reportCommon";
import {
  AnalyticsInsightSection,
  buildInsightPdfSections,
  buildBranchControl,
  ExportButtons,
  handleCsvExport,
  handlePdfExport,
  MetricGrid,
  RANGE_OPTIONS_LONG,
  useReportInsights,
} from "./analyticsTabShared";

const OVERDUE_COLUMNS = [
  { key: "tenantName", label: "Tenant", sortable: true },
  { key: "roomName", label: "Room", sortable: true },
  { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch) },
  { key: "status", label: "Status", sortable: true },
  { key: "dueDate", label: "Due Date", render: (row) => formatDate(row.dueDate) },
  { key: "daysOverdue", label: "Days Overdue", sortable: true },
  { key: "balance", label: "Balance", render: (row) => formatPeso(row.balance), sortable: true },
];

export default function AnalyticsBillingTab({
  branch,
  range,
  isOwner,
  onBranchChange,
  onRangeChange,
}) {
  const [page, setPage] = useState(1);
  const params = useMemo(
    () => ({
      range,
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );
  const { data, isLoading, isError } = useBillingReport(params);
  const {
    data: insightData,
    isLoading: isInsightLoading,
    isError: isInsightError,
  } = useReportInsights({
    reportType: "billing",
    range,
    branch: isOwner ? branch : undefined,
  });
  const overdueAccounts = data?.tables?.overdueAccounts || [];
  const unpaidBalances = data?.tables?.unpaidBalances || [];
  const revenueByMonth = data?.series?.revenueByMonth || [];
  const statusDistribution = data?.series?.statusDistribution || [];
  const overdueAging = data?.series?.overdueAging || [];

  const metricCards = [
    { label: "Collected Revenue", value: data?.kpis?.collectedRevenueLabel || "PHP 0", tone: "green" },
    { label: "Billed Amount", value: data?.kpis?.billedAmountLabel || "PHP 0", tone: "blue" },
    { label: "Outstanding", value: data?.kpis?.outstandingBalanceLabel || "PHP 0", tone: "rose" },
    { label: "Collection Rate", value: data?.kpis?.collectionRateLabel || "0%", tone: "amber" },
  ];

  const exportCsv = () => {
    handleCsvExport(
      unpaidBalances,
      [
        { key: "tenantName", label: "Tenant" },
        { key: "roomName", label: "Room" },
        { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
        { key: "status", label: "Status" },
        { key: "billingMonth", label: "Billing Month", formatter: (value) => formatDate(value) },
        { key: "dueDate", label: "Due Date", formatter: (value) => formatDate(value) },
        { key: "paidAmount", label: "Paid", formatter: (value) => formatPeso(value) },
        { key: "balance", label: "Balance", formatter: (value) => formatPeso(value) },
      ],
      `billing-report-${range}`,
    );
  };

  const exportPdf = () => {
    handlePdfExport({
      title: "Billing & Collections Report",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `billing-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        ...buildInsightPdfSections(insightData, "AI Billing Summary"),
        {
          title: "Monthly Revenue",
          rows: revenueByMonth.map(
            (item) => `${item.label}: collected ${formatPeso(item.collectedRevenue)}, billed ${formatPeso(item.billedAmount)}`,
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
    <AnalyticsTabLayout
      header={
        <AnalyticsToolbar
          title="Billing Analytics"
          subtitle={`Scope: ${formatBranch(data?.scope?.branch || branch)} • ${buildRangeLabel(range)}`}
          range={{ value: range, onChange: (value) => { setPage(1); onRangeChange(value); }, options: RANGE_OPTIONS_LONG }}
          branch={buildBranchControl({
            isOwner,
            branch,
            onChange: (value) => {
              setPage(1);
              onBranchChange(value);
            },
          })}
          actions={<ExportButtons onCsv={exportCsv} onPdf={exportPdf} />}
        />
      }
    >
      <MetricGrid items={metricCards} />

      <AnalyticsInsightSection
        reportLabel="billing"
        summaryTitle="Billing Summary"
        data={insightData}
        isLoading={isInsightLoading}
        isError={isInsightError}
      />

      <div className="admin-reports__grid">
        <ReportChartPanel title="Monthly revenue" subtitle="Collected and billed revenue in the selected window">
          <AnalyticsBarChart
            data={revenueByMonth.map((item) => ({
              label: item.label,
              collected: item.collectedRevenue,
              billed: item.billedAmount,
            }))}
            bars={[
              { key: "collected", label: "Collected", color: "#2563eb" },
              { key: "billed", label: "Billed", color: "#0f766e" },
            ]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No billing revenue data"
            emptyDescription="Revenue history will appear once billing records exist for this branch and range."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Overdue aging" subtitle="Open balances bucketed by days overdue">
          <AnalyticsBarChart
            data={overdueAging.map((item) => ({ label: item.label, amount: item.amount }))}
            bars={[{ key: "amount", label: "Outstanding balance", color: "#f97316" }]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No overdue aging data"
            emptyDescription="There are no overdue buckets for the selected scope."
          />
        </ReportChartPanel>
      </div>

      <div className="admin-reports__grid">
        <ReportChartPanel title="Billing status mix" subtitle="Current billing status distribution">
          <AnalyticsDonutChart
            data={statusDistribution.map((item) => ({
              label: item.status,
              value: item.count,
            }))}
            centerLabel={{ value: overdueAccounts.length, label: "Overdue" }}
            emptyTitle="No billing statuses"
            emptyDescription="Status distribution will appear once bills are generated."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Largest unpaid balances" subtitle="Highest remaining balances in this branch scope">
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
            {!unpaidBalances.length ? (
              <p className="admin-reports__hint">No unpaid balances for this scope.</p>
            ) : null}
          </div>
        </ReportChartPanel>
      </div>

      <ReportChartPanel title="Overdue and unpaid tables" subtitle="Bills past due date and still carrying an outstanding balance">
        <DataTable
          columns={OVERDUE_COLUMNS}
          data={overdueAccounts}
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
    </AnalyticsTabLayout>
  );
}
