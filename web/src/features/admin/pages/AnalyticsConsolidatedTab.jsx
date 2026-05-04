import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import {
  useAnalyticsInsightsHub,
  useBillingReport,
  useFinancialsAnalytics,
  useOccupancyReport,
  useOperationsReport,
} from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
  AnalyticsComparisonChart,
  AnalyticsInsightsHub,
  AnalyticsLineChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  ReportChartPanel,
} from "../components/shared";
import {
  buildAnalyticsDetailsHref,
  getSummaryDetailRange,
} from "./analyticsNavigation.mjs";
import { buildRangeLabel, formatBranch, formatPeso } from "./reportCommon";
import {
  ExportButtons,
  MetricGrid,
  RANGE_OPTIONS_SHORT,
  buildBranchControl,
  handleCsvExport,
  handlePdfExport,
} from "./analyticsTabShared";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mergeBranchRows(dashboardRows = [], financialRows = []) {
  const rows = new Map();

  dashboardRows.forEach((item) => {
    rows.set(item.branch, {
      branch: item.branch,
      label: item.label || formatBranch(item.branch),
      occupancyRate: toNumber(item.occupancyRate),
      totalCapacity: toNumber(item.totalCapacity),
      availableBeds: toNumber(item.availableBeds),
      activeTickets: toNumber(item.activeTickets),
      inquiries: toNumber(item.inquiries),
      collectedRevenue: toNumber(item.revenueCollected),
      overdueAmount: toNumber(item.overdueAmount),
      collectionRate: toNumber(item.collectionRate),
    });
  });

  financialRows.forEach((item) => {
    const existing = rows.get(item.branch) || {
      branch: item.branch,
      label: item.label || formatBranch(item.branch),
    };

    rows.set(item.branch, {
      ...existing,
      collectedRevenue: toNumber(item.collectedRevenue ?? existing.collectedRevenue),
      overdueAmount: toNumber(item.overdueAmount ?? existing.overdueAmount),
      collectionRate: toNumber(item.collectionRate ?? existing.collectionRate),
      outstandingBalance: toNumber(item.outstandingBalance ?? existing.outstandingBalance),
    });
  });

  return [...rows.values()];
}

function DrilldownLink({ tab, range, branch, label }) {
  return (
    <Link
      to={buildAnalyticsDetailsHref({ tab, range, branch, isOwner: true })}
      className="admin-reports__link"
    >
      {label}
      <ExternalLink size={14} />
    </Link>
  );
}

export default function AnalyticsConsolidatedTab({
  branch,
  range,
  isOwner,
  onBranchChange,
  onRangeChange,
}) {
  const effectiveBranch = isOwner ? branch : undefined;
  const monthRange = getSummaryDetailRange("billing", range);

  const dayParams = useMemo(
    () => ({
      range,
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
    }),
    [effectiveBranch, range],
  );
  const monthParams = useMemo(
    () => ({
      range: monthRange,
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
    }),
    [effectiveBranch, monthRange],
  );

  const dashboardQuery = useDashboardData(dayParams);
  const occupancyQuery = useOccupancyReport(dayParams);
  const billingQuery = useBillingReport(monthParams);
  const operationsQuery = useOperationsReport(dayParams);
  const financialsQuery = useFinancialsAnalytics(monthParams);
  const insightsQuery = useAnalyticsInsightsHub({
    range,
    billingRange: monthRange,
    ...(effectiveBranch ? { branch: effectiveBranch } : {}),
  });

  const dashboardData = dashboardQuery.data;
  const occupancyData = occupancyQuery.data;
  const billingData = billingQuery.data;
  const operationsData = operationsQuery.data;
  const financialsData = financialsQuery.data;

  const branchRows = mergeBranchRows(
    dashboardData?.branchComparison,
    financialsData?.series?.branchComparison,
  );
  const occupancyTrend = occupancyData?.series?.occupancyTrend || [];
  const revenueByMonth = billingData?.series?.revenueByMonth || [];
  const reservationsByPeriod = operationsData?.series?.reservationsByPeriod || [];
  const maintenanceByType = operationsData?.series?.maintenanceByType || [];
  const scopeBranch =
    dashboardData?.scope?.branch ||
    occupancyData?.scope?.branch ||
    billingData?.scope?.branch ||
    branch;
  const isError = [
    dashboardQuery.isError,
    occupancyQuery.isError,
    billingQuery.isError,
    operationsQuery.isError,
    financialsQuery.isError,
  ].some(Boolean);

  const metricCards = [
    {
      label: "Occupancy Rate",
      value: occupancyData?.kpis?.occupancyRateLabel || dashboardData?.kpis?.occupancyRateLabel || "0%",
      tone: "blue",
    },
    {
      label: "Collected",
      value: billingData?.kpis?.collectedRevenueLabel || dashboardData?.kpis?.revenueLabel || "PHP 0",
      tone: "green",
    },
    {
      label: "Outstanding",
      value: financialsData?.kpis?.outstandingBalanceLabel || billingData?.kpis?.outstandingBalanceLabel || "PHP 0",
      tone: "rose",
    },
    {
      label: "Open Maintenance",
      value: dashboardData?.kpis?.activeTickets ?? operationsData?.kpis?.maintenanceRequests ?? 0,
      tone: "amber",
    },
  ];

  const exportCsv = () => {
    handleCsvExport(
      branchRows,
      [
        { key: "label", label: "Branch" },
        { key: "occupancyRate", label: "Occupancy Rate", formatter: (value) => `${value}%` },
        { key: "totalCapacity", label: "Total Capacity" },
        { key: "availableBeds", label: "Available Beds" },
        { key: "collectedRevenue", label: "Collected", formatter: (value) => formatPeso(value) },
        { key: "overdueAmount", label: "Overdue Amount", formatter: (value) => formatPeso(value) },
        { key: "collectionRate", label: "Collection Rate", formatter: (value) => `${value}%` },
        { key: "activeTickets", label: "Open Maintenance" },
        { key: "inquiries", label: "Inquiries" },
      ],
      `consolidated-report-${range}`,
    );
  };

  const exportPdf = () => {
    handlePdfExport({
      title: "Consolidated Owner Report",
      subtitle: `${buildRangeLabel(range)} operations / ${buildRangeLabel(monthRange)} billing - ${formatBranch(scopeBranch)}`,
      filename: `consolidated-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        {
          title: "Branch Comparison",
          rows: branchRows.map(
            (item) =>
              `${item.label}: ${item.occupancyRate || 0}% occupancy, ${formatPeso(item.collectedRevenue || 0)} collected, ${formatPeso(item.overdueAmount || 0)} overdue`,
          ),
        },
        {
          title: "Operations Snapshot",
          rows: [
            `Reservations: ${operationsData?.kpis?.reservations || 0}`,
            `Inquiries: ${operationsData?.kpis?.inquiries || 0}`,
            `Maintenance requests: ${operationsData?.kpis?.maintenanceRequests || 0}`,
            `On-time fix rate: ${operationsData?.kpis?.slaComplianceRateLabel || "0%"}`,
          ],
        },
      ],
    });
  };

  return (
    <AnalyticsTabLayout
      header={
        <AnalyticsToolbar
          title="Consolidated Reports"
          subtitle={`Owner view: ${formatBranch(scopeBranch)} - ${buildRangeLabel(range)}`}
          range={{ value: range, onChange: onRangeChange, options: RANGE_OPTIONS_SHORT }}
          branch={buildBranchControl({
            isOwner,
            branch,
            onChange: onBranchChange,
          })}
          actions={<ExportButtons onCsv={exportCsv} onPdf={exportPdf} />}
        />
      }
    >
      {isError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Some consolidated report sections could not be loaded. Available sections still show live data.
        </div>
      ) : null}

      <MetricGrid items={metricCards} />

      <AnalyticsInsightsHub
        title="AI Consolidated Report"
        heading="Cross-report risks, forecasts, and actions"
        loadingText="Preparing consolidated report insights..."
        emptyText="No consolidated AI report is available for this scope yet."
        data={insightsQuery.data}
        isLoading={insightsQuery.isLoading}
        isError={insightsQuery.isError}
      />

      <div className="admin-reports__grid">
        <ReportChartPanel
          title="Branch performance"
          subtitle="Occupancy, collections, and maintenance pressure by branch"
          actions={<DrilldownLink tab="financials" range={range} branch={branch} label="Open financials" />}
        >
          <AnalyticsComparisonChart
            data={branchRows.map((item) => ({
              label: item.label,
              occupancy: item.occupancyRate || 0,
              collection: item.collectionRate || 0,
              maintenance: item.activeTickets || 0,
            }))}
            bars={[
              { key: "occupancy", label: "Occupancy %", color: "#2563eb" },
              { key: "collection", label: "Collection %", color: "#0f766e" },
              { key: "maintenance", label: "Open maintenance", color: "#f97316" },
            ]}
            emptyTitle="No branch comparison data"
            emptyDescription="Branch comparisons will appear once branch-scoped activity exists."
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Collection trend"
          subtitle="Collected and billed amounts across the selected owner scope"
          actions={<DrilldownLink tab="billing" range={range} branch={branch} label="Open billing" />}
        >
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
            emptyTitle="No collection trend"
            emptyDescription="Collection history will appear once billing records exist for this scope."
          />
        </ReportChartPanel>
      </div>

      <div className="admin-reports__grid">
        <ReportChartPanel
          title="Occupancy trend"
          subtitle="Daily occupancy rate for the selected branch scope"
          actions={<DrilldownLink tab="occupancy" range={range} branch={branch} label="Open occupancy" />}
        >
          <AnalyticsLineChart
            data={occupancyTrend.map((item) => ({ label: item.label, occupancy: item.totalRate }))}
            lines={[{ key: "occupancy", label: "Occupancy rate", color: "#2563eb" }]}
            valueFormatter={(value) => `${value}%`}
            emptyTitle="No occupancy trend"
            emptyDescription="Occupancy trend data will appear after room history is available."
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Operations trend"
          subtitle="Reservation activity and maintenance categories"
          actions={<DrilldownLink tab="operations" range={range} branch={branch} label="Open operations" />}
        >
          <div className="admin-reports__panel-stack">
            <AnalyticsBarChart
              data={reservationsByPeriod.map((item) => ({ label: item.label, reservations: item.count }))}
              bars={[{ key: "reservations", label: "Reservations", color: "#2563eb" }]}
              height={220}
              emptyTitle="No reservation trend"
              emptyDescription="Reservation activity will appear once records exist in this range."
            />
            <div className="admin-reports__meta-grid">
              {maintenanceByType.slice(0, 3).map((item) => (
                <div key={item.label} className="admin-reports__meta-card">
                  <span className="admin-reports__meta-label">{item.label}</span>
                  <div className="admin-reports__meta-value">{item.count}</div>
                  <p className="admin-reports__hint">maintenance requests</p>
                </div>
              ))}
              {!maintenanceByType.length ? (
                <p className="admin-reports__hint">No maintenance categories for this scope.</p>
              ) : null}
            </div>
          </div>
        </ReportChartPanel>
      </div>

      <ReportChartPanel title="Executive branch snapshot" subtitle="A compact owner table for cross-branch review">
        <div className="admin-reports__panel-stack">
          {branchRows.map((item) => (
            <div key={item.branch} className="admin-reports__meta-card">
              <span className="admin-reports__meta-label">{item.label}</span>
              <div className="admin-reports__meta-value">
                {item.occupancyRate || 0}% occupancy - {formatPeso(item.collectedRevenue || 0)}
              </div>
              <p className="admin-reports__hint">
                {item.availableBeds || 0} beds available - {formatPeso(item.overdueAmount || 0)} overdue - {item.activeTickets || 0} open maintenance
              </p>
            </div>
          ))}
          {!branchRows.length ? (
            <p className="admin-reports__hint">No branch rows are available for this scope yet.</p>
          ) : null}
        </div>
      </ReportChartPanel>
    </AnalyticsTabLayout>
  );
}
