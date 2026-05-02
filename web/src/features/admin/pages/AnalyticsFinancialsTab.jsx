import { useMemo, useState } from "react";
import { useFinancialsAnalytics } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
  AnalyticsComparisonChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  DataTable,
  ReportChartPanel,
} from "../components/shared";
import { buildRangeLabel, formatBranch, formatPeso } from "./reportCommon";
import {
  ExportButtons,
  buildServerTableParams,
  getTablePagination,
  getTableRows,
  handleCsvExport,
  handlePdfExport,
  MetricGrid,
  RANGE_OPTIONS_LONG,
} from "./analyticsTabShared";

const OVERDUE_ROOM_COLUMNS = [
  { key: "roomName", label: "Room", sortable: true },
  { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch), sortable: true },
  { key: "tenantCount", label: "Tenants", sortable: true },
  { key: "overdueCount", label: "Overdue Bills", sortable: true },
  {
    key: "outstandingBalance",
    label: "Outstanding",
    render: (row) => formatPeso(row.outstandingBalance),
    sortable: true,
  },
];
const TABLE_PAGE_SIZE = 10;

export default function AnalyticsFinancialsTab({ branch, range, onBranchChange, onRangeChange }) {
  const [page, setPage] = useState(1);
  const params = useMemo(
    () => ({
      branch,
      range,
      ...buildServerTableParams(page, TABLE_PAGE_SIZE),
    }),
    [branch, page, range],
  );
  const { data, isLoading, isError } = useFinancialsAnalytics(params);
  const branchComparison = data?.series?.branchComparison || [];
  const revenueByMonth = data?.series?.revenueByMonth || [];
  const overdueAging = data?.series?.overdueAging || [];
  const overdueRoomsTable = data?.tables?.overdueRooms;
  const overdueRooms = getTableRows(overdueRoomsTable);
  const overdueRoomsPagination = getTablePagination(overdueRoomsTable, overdueRooms);

  const metricCards = [
    { label: "Collected Revenue", value: data?.kpis?.collectedRevenueLabel || "PHP 0", tone: "green" },
    { label: "Outstanding", value: data?.kpis?.outstandingBalanceLabel || "PHP 0", tone: "rose" },
    { label: "Overdue", value: data?.kpis?.overdueAmountLabel || "PHP 0", tone: "amber" },
    { label: "Collection Rate", value: data?.kpis?.collectionRateLabel || "0%", tone: "blue" },
  ];

  const exportCsv = () => {
    handleCsvExport(
      overdueRooms,
      [
        { key: "roomName", label: "Room" },
        { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
        { key: "tenantCount", label: "Tenants" },
        { key: "overdueCount", label: "Overdue Bills" },
        { key: "outstandingBalance", label: "Outstanding", formatter: (value) => formatPeso(value) },
      ],
      `financials-overdue-rooms-${range}`,
    );
  };

  const exportPdf = () => {
    handlePdfExport({
      title: "Financial Overview",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `financial-overview-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        {
          title: "Branch Comparison",
          rows: branchComparison.map(
            (item) =>
              `${item.label}: collected ${formatPeso(item.collectedRevenue)}, overdue ${formatPeso(item.overdueAmount)}, collection rate ${item.collectionRate}%`,
          ),
        },
        {
          title: "Top Overdue Rooms",
          rows: overdueRooms.slice(0, 12).map(
            (item) => `${item.roomName} • ${formatBranch(item.branch)} • ${formatPeso(item.outstandingBalance)}`,
          ),
        },
      ],
    });
  };

  return (
    <AnalyticsTabLayout
      header={
        <AnalyticsToolbar
          title="Financial Analytics"
          subtitle={`Scope: ${formatBranch(data?.scope?.branch || branch)} • ${buildRangeLabel(range)}`}
          range={{ value: range, onChange: (value) => { setPage(1); onRangeChange(value); }, options: RANGE_OPTIONS_LONG }}
          branch={{
            value: branch,
            onChange: (value) => {
              setPage(1);
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

      <div className="admin-reports__grid">
        <ReportChartPanel title="Branch comparison" subtitle="Collections, overdue exposure, and collection rate by branch">
          <AnalyticsComparisonChart
            data={branchComparison.map((item) => ({
              label: item.label,
              collected: item.collectedRevenue,
              overdue: item.overdueAmount,
            }))}
            bars={[
              { key: "collected", label: "Collected", color: "#2563eb" },
              { key: "overdue", label: "Overdue", color: "#dc2626" },
            ]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No branch comparison data"
            emptyDescription="Branch financial comparison will appear once billing records are available."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Overdue aging" subtitle="Outstanding balances bucketed by days overdue">
          <AnalyticsBarChart
            data={overdueAging.map((item) => ({ label: item.label, amount: item.amount }))}
            bars={[{ key: "amount", label: "Outstanding", color: "#f97316" }]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No overdue aging data"
            emptyDescription="There are no overdue balances for the selected scope."
          />
        </ReportChartPanel>
      </div>

      <div className="admin-reports__grid">
        <ReportChartPanel title="Monthly collections" subtitle="Collected revenue over the selected period">
          <AnalyticsBarChart
            data={revenueByMonth.map((item) => ({
              label: item.label,
              collected: item.collectedRevenue,
              billed: item.billedAmount,
            }))}
            bars={[
              { key: "collected", label: "Collected", color: "#0f766e" },
              { key: "billed", label: "Billed", color: "#2563eb" },
            ]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No monthly collections data"
            emptyDescription="Collection history will appear once billing records are present."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Net position" subtitle="Collected revenue less currently overdue balances">
          <div className="admin-reports__meta-grid">
            <div className="admin-reports__meta-card">
              <span className="admin-reports__meta-label">Net position</span>
              <div className="admin-reports__meta-value">{data?.kpis?.netPositionLabel || "PHP 0"}</div>
            </div>
            <div className="admin-reports__meta-card">
              <span className="admin-reports__meta-label">Latest billing month</span>
              <div className="admin-reports__meta-value">{revenueByMonth.at(-1)?.label || "-"}</div>
              <p className="admin-reports__hint">
                Billed {formatPeso(revenueByMonth.at(-1)?.billedAmount || 0)}
              </p>
            </div>
          </div>
        </ReportChartPanel>
      </div>

      <ReportChartPanel title="Overdue exposure tables" subtitle="Rooms carrying the highest unpaid balance">
        <DataTable
          columns={OVERDUE_ROOM_COLUMNS}
          data={overdueRooms}
          loading={isLoading}
          pagination={{
            page,
            pageSize: TABLE_PAGE_SIZE,
            total: overdueRoomsPagination.total,
            onPageChange: setPage,
          }}
          serverPagination
          emptyState={{
            title: isError ? "Financial overview unavailable" : "No overdue rooms",
            description: isError
              ? "The financial overview could not be loaded."
              : "No overdue room exposure was found for the selected scope.",
          }}
        />
      </ReportChartPanel>
    </AnalyticsTabLayout>
  );
}
