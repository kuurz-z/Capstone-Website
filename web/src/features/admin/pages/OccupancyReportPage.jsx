import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileDown } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useOccupancyForecast,
  useOccupancyReport,
} from "../../../shared/hooks/queries/useAnalyticsReports";
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
} from "./reportCommon";
import "../styles/design-tokens.css";
import "../styles/admin-reports.css";

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
];

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

function BarList({ items, labelKey = "label", valueKey = "value", valueFormatter = (value) => value }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div className="admin-reports__list">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max((value / maxValue) * 100, value > 0 ? 6 : 0);
        return (
          <div key={`${item[labelKey]}-${value}`} className="admin-reports__bar-row">
            <span className="admin-reports__bar-label">{item[labelKey]}</span>
            <div className="admin-reports__bar-track">
              <div className="admin-reports__bar-fill" style={{ width: `${width}%` }} />
            </div>
            <span className="admin-reports__bar-value">{valueFormatter(value, item)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function OccupancyReportPage() {
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

  const { data, isLoading, isError } = useOccupancyReport(params);
  const { data: forecastData } = useOccupancyForecast({
    months: 3,
    ...(isOwner ? { branch } : {}),
  });
  const inventory = data?.tables?.inventory || [];
  const roomTypes = data?.tables?.roomTypes || [];
  const trend = data?.series?.occupancyTrend || [];
  const forecast = forecastData?.forecast || {};
  const projectedMonths = forecast.projected || [];
  const latestTrend = trend.slice(-10).map((item) => ({
    label: item.label,
    value: item.totalRate,
  }));

  const metricCards = [
    { label: "Occupancy Rate", value: data?.kpis?.occupancyRateLabel || "0%", tone: "blue" },
    { label: "Total Capacity", value: data?.kpis?.totalCapacity || 0, tone: "green" },
    { label: "Occupied Beds", value: data?.kpis?.occupiedBeds || 0, tone: "amber" },
    { label: "Unavailable Beds", value: data?.kpis?.unavailableBeds || 0, tone: "rose" },
  ];

  const handleCsvExport = () => {
    exportToCSV(inventory, [
      { key: "roomNumber", label: "Room" },
      { key: "roomTypeLabel", label: "Type" },
      { key: "branch", label: "Branch", formatter: (value) => formatBranch(value) },
      { key: "capacity", label: "Capacity" },
      { key: "occupiedBeds", label: "Occupied Beds" },
      { key: "availableBeds", label: "Available Beds" },
      { key: "unavailableBeds", label: "Unavailable Beds" },
      { key: "occupancyRate", label: "Occupancy Rate", formatter: (value) => `${value}%` },
    ], `occupancy-report-${range}`);
  };

  const handlePdfExport = () => {
    exportReportPdf({
      title: "Occupancy Report",
      subtitle: `${buildRangeLabel(range)} • ${formatBranch(data?.scope?.branch || branch)}`,
      filename: `occupancy-report-${range}.pdf`,
      kpis: metricCards.map((item) => ({ label: item.label, value: item.value })),
      sections: [
        {
          title: "Room Type Summary",
          rows: roomTypes.map(
            (item) =>
              `${item.roomTypeLabel}: ${item.occupiedBeds}/${item.capacity} occupied (${item.occupancyRate}%)`,
          ),
        },
        {
          title: "Inventory Snapshot",
          rows: inventory.slice(0, 12).map(
            (item) =>
              `${item.roomNumber} • ${item.roomTypeLabel} • ${item.occupiedBeds}/${item.capacity} occupied`,
          ),
        },
      ],
    });
  };

  return (
    <PageShell
      tabs={REPORT_TABS}
      activeTab="occupancy"
      onTabChange={(key) => navigate(REPORT_ROUTES[key])}
    >
      <PageShell.Summary>
        <ReportFilterBar
          title="Occupancy report"
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
            title="Occupancy trend"
            subtitle="Daily occupancy rate over the selected period"
          >
            <BarList
              items={latestTrend}
              valueKey="value"
              valueFormatter={(value) => `${value}%`}
            />
          </ReportChartPanel>

          <ReportChartPanel
            title="Room type mix"
            subtitle="Current occupancy by room type"
          >
            <BarList
              items={roomTypes.map((item) => ({
                label: item.roomTypeLabel,
                value: item.occupancyRate,
              }))}
              valueKey="value"
              valueFormatter={(value) => `${value}%`}
            />
          </ReportChartPanel>
        </div>

        <ReportChartPanel
          title="Forecasting insights"
          subtitle="Deterministic 3-month occupancy projection"
        >
          {forecast.sufficientHistory ? (
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
              {(forecast.insights?.recommendations || []).slice(0, 2).map((item) => (
                <p key={item} className="admin-reports__hint">{item}</p>
              ))}
            </div>
          ) : (
            <p className="admin-reports__hint">
              {forecast.insights?.headline || "Insufficient history to forecast occupancy."}
            </p>
          )}
        </ReportChartPanel>

        <ReportChartPanel
          title="Inventory snapshot"
          subtitle="Current room capacity, occupancy, and unavailable inventory"
        >
          <DataTable
            columns={INVENTORY_COLUMNS}
            data={inventory}
            loading={isLoading}
            pagination={{
              page,
              pageSize: 10,
              total: inventory.length,
              onPageChange: setPage,
            }}
            emptyState={{
              title: isError ? "Occupancy report unavailable" : "No occupancy rows",
              description: isError
                ? "The occupancy report could not be loaded."
                : "No room inventory matched this branch scope yet.",
            }}
          />
        </ReportChartPanel>
      </PageShell.Content>
    </PageShell>
  );
}
