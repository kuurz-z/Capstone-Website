import { useMemo, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { useFinancialsAnalytics } from "../../../shared/hooks/queries/useAnalyticsReports";
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
} from "../../admin/components/shared";
import {
 buildRangeLabel,
 formatBranch,
 formatDate,
 formatPeso,
} from "../../admin/pages/reportCommon";
import "../../admin/styles/design-tokens.css";
import "../../admin/styles/admin-reports.css";

const RANGE_OPTIONS = [
 { value: "3m", label: "Last 3 months" },
 { value: "6m", label: "Last 6 months" },
 { value: "12m", label: "Last 12 months" },
];

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

export default function FinancialOverviewPage() {
 const [range, setRange] = useState("3m");
 const [branch, setBranch] = useState("all");
 const [page, setPage] = useState(1);

 const params = useMemo(() => ({ range, branch }), [branch, range]);
 const { data, isLoading, isError } = useFinancialsAnalytics(params);
 const branchComparison = data?.series?.branchComparison || [];
 const revenueByMonth = data?.series?.revenueByMonth || [];
 const overdueAging = data?.series?.overdueAging || [];
 const overdueRooms = data?.tables?.overdueRooms || [];
 const pagedRooms = overdueRooms.slice((page - 1) * 10, page * 10);

 const metricCards = [
 { label: "Collected Revenue", value: data?.kpis?.collectedRevenueLabel || "PHP 0", tone: "green" },
 { label: "Outstanding", value: data?.kpis?.outstandingBalanceLabel || "PHP 0", tone: "rose" },
 { label: "Overdue", value: data?.kpis?.overdueAmountLabel || "PHP 0", tone: "amber" },
 { label: "Collection Rate", value: data?.kpis?.collectionRateLabel || "0%", tone: "blue" },
 ];

 const handleCsvExport = () => {
 exportToCSV(overdueRooms, [
 { key: "roomName", label: "Room" },
 { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
 { key: "tenantCount", label: "Tenants" },
 { key: "overdueCount", label: "Overdue Bills" },
 { key: "outstandingBalance", label: "Outstanding", formatter: (value) => formatPeso(value) },
 ], `financials-overdue-rooms-${range}`);
 };

 const handlePdfExport = () => {
 exportReportPdf({
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
 <PageShell>
 <PageShell.Summary>
 <ReportFilterBar
 title="Financial overview"
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
 <ReportMetricCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
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
 {
 key: "branch",
 value: branch,
 onChange: (value) => {
 setBranch(value);
 setPage(1);
 },
 options: OWNER_BRANCH_FILTER_OPTIONS,
 },
 ]}
 />
 </PageShell.Actions>

 <PageShell.Content>
 <div className="admin-reports__grid">
 <ReportChartPanel
 title="Branch comparison"
 subtitle="Revenue, overdue balances, and collection rate by branch"
 >
 <div className="admin-reports__panel-stack">
 {branchComparison.map((item) => (
 <div key={item.branch} className="admin-reports__meta-card">
 <span className="admin-reports__meta-label">{item.label}</span>
 <div className="admin-reports__meta-value">{formatPeso(item.collectedRevenue)}</div>
 <p className="admin-reports__hint">
 Overdue {formatPeso(item.overdueAmount)} • Collection rate {item.collectionRate}%
 </p>
 </div>
 ))}
 </div>
 </ReportChartPanel>

 <ReportChartPanel
 title="Overdue aging"
 subtitle="Outstanding balances bucketed by days overdue"
 >
 <BarList
 items={overdueAging.map((item) => ({ label: item.label, value: item.amount }))}
 valueKey="value"
 formatter={(value) => formatPeso(value)}
 />
 </ReportChartPanel>
 </div>

 <div className="admin-reports__grid">
 <ReportChartPanel
 title="Monthly collections"
 subtitle="Collected revenue over the selected period"
 >
 <BarList
 items={revenueByMonth.map((item) => ({ label: item.label, value: item.collectedRevenue }))}
 valueKey="value"
 formatter={(value) => formatPeso(value)}
 />
 </ReportChartPanel>

 <ReportChartPanel
 title="Net position"
 subtitle="Collected revenue less currently overdue balances"
 >
 <div className="admin-reports__meta-grid">
 <div className="admin-reports__meta-card">
 <span className="admin-reports__meta-label">Net position</span>
 <div className="admin-reports__meta-value">{data?.kpis?.netPositionLabel || "PHP 0"}</div>
 </div>
 <div className="admin-reports__meta-card">
 <span className="admin-reports__meta-label">Latest billing month</span>
 <div className="admin-reports__meta-value">
 {revenueByMonth.at(-1)?.label || "-"}
 </div>
 <p className="admin-reports__hint">
 Billed {formatPeso(revenueByMonth.at(-1)?.billedAmount || 0)}
 </p>
 </div>
 </div>
 </ReportChartPanel>
 </div>

 <ReportChartPanel
 title="Rooms with the highest overdue exposure"
 subtitle="Owner-level view of rooms carrying the most unpaid balance"
 >
 <DataTable
 columns={OVERDUE_ROOM_COLUMNS}
 data={pagedRooms}
 loading={isLoading}
 pagination={{
 page,
 pageSize: 10,
 total: overdueRooms.length,
 onPageChange: setPage,
 }}
 emptyState={{
 title: isError ? "Financial overview unavailable" : "No overdue rooms",
 description: isError
 ? "The financial overview could not be loaded."
 : "No overdue room exposure was found for the selected scope.",
 }}
 />
 </ReportChartPanel>
 </PageShell.Content>
 </PageShell>
 );
}
