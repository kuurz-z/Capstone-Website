import { useMemo, useState } from "react";
import { useOccupancyForecast, useOccupancyReport } from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsDonutChart,
  AnalyticsLineChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  DataTable,
  ReportChartPanel,
} from "../components/shared";
import { buildRangeLabel, formatBranch } from "./reportCommon";
import {
  AnalyticsInsightSection,
  buildInsightPdfSections,
  buildBranchControl,
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

const INVENTORY_COLUMNS = [
  { key: "roomNumber", label: "Room", sortable: true },
  { key: "roomTypeLabel", label: "Type", sortable: true },
  { key: "branch", label: "Branch", render: (row) => formatBranch(row.branch) },
  { key: "capacity", label: "Capacity", sortable: true },
  { key: "occupiedBeds", label: "Occupied", sortable: true },
  { key: "availableBeds", label: "Available", sortable: true },
  { key: "unavailableBeds", label: "Unavailable", sortable: true },
  { key: "occupancyRate", label: "Rate", render: (row) => `${row.occupancyRate}%` },
];
const TABLE_PAGE_SIZE = 10;

function ForecastCards({ forecast }) {
  const projectedMonths = forecast?.projected || [];
  const recommendations = forecast?.insights?.recommendations || [];

  if (!forecast?.sufficientHistory) {
    return (
      <p className="admin-reports__hint">
        {forecast?.insights?.headline || "Insufficient history to forecast occupancy."}
      </p>
    );
  }

  return (
    <div className="admin-reports__panel-stack">
      <p className="admin-reports__hint">{forecast.insights?.headline}</p>
      {projectedMonths.map((item) => (
        <div key={item.month} className="admin-reports__meta-card">
          <span className="admin-reports__meta-label">{item.label}</span>
          <div className="admin-reports__meta-value">{item.projectedOccupancyRate}%</div>
          <p className="admin-reports__hint">
            Baseline {item.baselineRate}% • Seasonal {item.seasonalMultiplier}x
          </p>
        </div>
      ))}
      {recommendations.slice(0, 2).map((item) => (
        <p key={item} className="admin-reports__hint">{item}</p>
      ))}
    </div>
  );
}

export default function AnalyticsOccupancyTab({
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
      ...buildServerTableParams(page, TABLE_PAGE_SIZE),
    }),
    [branch, isOwner, page, range],
  );

  const { data, isLoading, isError } = useOccupancyReport(params);
  const { data: forecastData } = useOccupancyForecast({
    months: 3,
    ...(isOwner ? { branch } : {}),
  });
  const {
    data: insightData,
    isLoading: isInsightLoading,
    isError: isInsightError,
  } = useReportInsights({
    reportType: "occupancy",
    range,
    branch: isOwner ? branch : undefined,
  });

  const inventoryTable = data?.tables?.inventory;
  const inventory = getTableRows(inventoryTable);
  const inventoryPagination = getTablePagination(inventoryTable, inventory);
  const roomTypes = data?.tables?.roomTypes || [];
  const trend = data?.series?.occupancyTrend || [];
  const forecast = forecastData?.forecast || {};
  const forecastSeries = (forecast.projected || []).map((item) => ({
    label: item.label,
    projected: item.projectedOccupancyRate,
    baseline: item.baselineRate,
  }));

  const metricCards = [
    { label: "Occupancy Rate", value: data?.kpis?.occupancyRateLabel || "0%", tone: "blue" },
    { label: "Total Capacity", value: data?.kpis?.totalCapacity || 0, tone: "green" },
    { label: "Occupied Beds", value: data?.kpis?.occupiedBeds || 0, tone: "amber" },
    { label: "Unavailable Beds", value: data?.kpis?.unavailableBeds || 0, tone: "rose" },
  ];

  const exportCsv = () => {
    handleCsvExport(
      inventory,
      [
        { key: "roomNumber", label: "Room" },
        { key: "roomTypeLabel", label: "Type" },
        { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
        { key: "capacity", label: "Capacity" },
        { key: "occupiedBeds", label: "Occupied Beds" },
        { key: "availableBeds", label: "Available Beds" },
        { key: "unavailableBeds", label: "Unavailable Beds" },
        { key: "occupancyRate", label: "Occupancy Rate", formatter: (value) => `${value}%` },
      ],
      `occupancy-report-${range}`,
    );
  };

  const exportPdf = () => {
    handlePdfExport({
      title: "Occupancy Report",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `occupancy-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        ...buildInsightPdfSections(insightData, "AI Occupancy Summary"),
        {
          title: "Room Type Summary",
          rows: roomTypes.map(
            (item) => `${item.roomTypeLabel}: ${item.occupiedBeds}/${item.capacity} occupied (${item.occupancyRate}%)`,
          ),
        },
        {
          title: "Inventory Snapshot",
          rows: inventory.slice(0, 12).map(
            (item) => `${item.roomNumber} • ${item.roomTypeLabel} • ${item.occupiedBeds}/${item.capacity} occupied`,
          ),
        },
      ],
    });
  };

  return (
    <AnalyticsTabLayout
      header={
        <AnalyticsToolbar
          title="Occupancy Analytics"
          subtitle={`Scope: ${formatBranch(data?.scope?.branch || branch)} • ${buildRangeLabel(range)}`}
          range={{ value: range, onChange: (value) => { setPage(1); onRangeChange(value); }, options: RANGE_OPTIONS_SHORT }}
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
        reportLabel="occupancy"
        summaryTitle="Occupancy Summary"
        data={insightData}
        isLoading={isInsightLoading}
        isError={isInsightError}
      />

      <div className="admin-reports__grid">
        <ReportChartPanel title="Occupancy trend" subtitle="Daily occupancy rate over the selected period">
          <AnalyticsLineChart
            data={trend.map((item) => ({ label: item.label, occupancy: item.totalRate }))}
            lines={[{ key: "occupancy", label: "Occupancy rate" }]}
            valueFormatter={(value) => `${value}%`}
            emptyTitle="No occupancy trend"
            emptyDescription="The branch does not have enough occupancy history for this range yet."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Room type mix" subtitle="Current occupancy by room type">
          <AnalyticsDonutChart
            data={roomTypes.map((item) => ({
              label: item.roomTypeLabel,
              value: item.occupiedBeds,
            }))}
            centerLabel={{ value: data?.kpis?.occupiedBeds || 0, label: "Occupied" }}
            emptyTitle="No room type data"
            emptyDescription="Room type distribution will appear once inventory is available."
          />
        </ReportChartPanel>
      </div>

      <div className="admin-reports__grid">
        <ReportChartPanel title="Forecast panel" subtitle="Projected occupancy compared with recent baseline">
          <AnalyticsLineChart
            data={forecastSeries}
            lines={[
              { key: "projected", label: "Projected occupancy" },
              { key: "baseline", label: "Baseline rate", color: "#0f766e" },
            ]}
            valueFormatter={(value) => `${value}%`}
            emptyTitle="Forecast unavailable"
            emptyDescription="More occupancy history is needed before a forecast can be shown."
          />
        </ReportChartPanel>

        <ReportChartPanel title="Forecast insights" subtitle="Deterministic 3-month occupancy projection">
          <ForecastCards forecast={forecast} />
        </ReportChartPanel>
      </div>

      <ReportChartPanel title="Inventory table" subtitle="Current room capacity, occupancy, and unavailable inventory">
        <DataTable
          columns={INVENTORY_COLUMNS}
          data={inventory}
          loading={isLoading}
          pagination={{
            page,
            pageSize: TABLE_PAGE_SIZE,
            total: inventoryPagination.total,
            onPageChange: setPage,
          }}
          serverPagination
          emptyState={{
            title: isError ? "Occupancy report unavailable" : "No occupancy rows",
            description: isError
              ? "The occupancy report could not be loaded."
              : "No room inventory matched this branch scope yet.",
          }}
        />
      </ReportChartPanel>
    </AnalyticsTabLayout>
  );
}
