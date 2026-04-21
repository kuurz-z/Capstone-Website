import React, { useEffect, useMemo } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useAuditAnalytics,
  useBillingReport,
  useFinancialsAnalytics,
  useOccupancyReport,
  useOperationsReport,
} from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
  AnalyticsComparisonChart,
  AnalyticsDonutChart,
  AnalyticsLineChart,
  AnalyticsTabLayout,
  AnalyticsToolbar,
  ReportChartPanel,
} from "../components/shared";
import {
  ANALYTICS_DETAILS_PATH,
  buildAnalyticsDetailsHref,
  getSummaryDetailRange,
  normalizeAnalyticsSummaryState,
} from "./analyticsNavigation.mjs";
import {
  buildBranchControl,
  MetricGrid,
  RANGE_OPTIONS_SHORT,
} from "./analyticsTabShared";
import {
  buildRangeLabel,
  formatBranch,
  formatPeso,
} from "./reportCommon";
import "../styles/admin-reports.css";

function SummarySection({ title, subtitle, detailHref, children }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-sm font-medium text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <Link
          to={detailHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
        >
          View details
          <ExternalLink size={14} />
        </Link>
      </div>
      <div className="admin-reports__grid">{children}</div>
    </section>
  );
}

function OwnerFinancialSummary({ branch, range }) {
  const financialParams = useMemo(
    () => ({
      branch,
      range: getSummaryDetailRange("financials", range),
    }),
    [branch, range],
  );
  const { data } = useFinancialsAnalytics(financialParams);
  const branchComparison = data?.series?.branchComparison || [];
  const overdueAging = data?.series?.overdueAging || [];

  return (
    <SummarySection
      title="Financials"
      subtitle={`Cross-branch collections and overdue exposure for the ${buildRangeLabel(
        financialParams.range,
      ).toLowerCase()} window.`}
      detailHref={buildAnalyticsDetailsHref({
        tab: "financials",
        range,
        branch,
        isOwner: true,
      })}
    >
      <ReportChartPanel
        title="Branch comparison"
        subtitle="Collected revenue versus overdue balances"
      >
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
          emptyDescription="Financial comparison will appear once billing records are available."
        />
      </ReportChartPanel>

      <ReportChartPanel
        title="Overdue aging"
        subtitle="Outstanding balances bucketed by lateness"
      >
        <AnalyticsBarChart
          data={overdueAging.map((item) => ({
            label: item.label,
            amount: item.amount,
          }))}
          bars={[{ key: "amount", label: "Outstanding", color: "#f97316" }]}
          valueFormatter={(value) => formatPeso(value)}
          emptyTitle="No overdue aging data"
          emptyDescription="There are no overdue balances for the selected scope."
        />
      </ReportChartPanel>
    </SummarySection>
  );
}

function OwnerMonitoringSummary({ branch, range }) {
  const monitoringParams = useMemo(() => ({ branch, range }), [branch, range]);
  const { data } = useAuditAnalytics(monitoringParams);
  const severityDistribution = data?.series?.severityDistribution || [];
  const branchSummary = data?.series?.branchSummary || [];
  const criticalEvents = data?.kpis?.criticalEvents || 0;

  return (
    <SummarySection
      title="System Monitoring"
      subtitle="Owner-only audit and security signals across the selected scope."
      detailHref={buildAnalyticsDetailsHref({
        tab: "monitoring",
        range,
        branch,
        isOwner: true,
      })}
    >
      <ReportChartPanel
        title="Severity distribution"
        subtitle="Security and audit events by severity"
      >
        <AnalyticsDonutChart
          data={severityDistribution.map((item) => ({
            label: item.label,
            value: item.count,
          }))}
          centerLabel={{ value: criticalEvents, label: "Critical" }}
          emptyTitle="No severity data"
          emptyDescription="Severity distribution will appear once audit events exist for this scope."
        />
      </ReportChartPanel>

      <ReportChartPanel
        title="Branch-level summary"
        subtitle="High-severity actions and access overrides"
      >
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
          emptyTitle="No branch monitoring data"
          emptyDescription="Security summary data will appear once audit activity is available."
        />
      </ReportChartPanel>
    </SummarySection>
  );
}

function AnalyticsSummaryDashboard({ clearLegacyOverview = false }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = user?.role === "owner";
  const requestedRange = searchParams.get("range");
  const requestedBranch = searchParams.get("branch");
  const { range, branch } = normalizeAnalyticsSummaryState({
    requestedRange,
    requestedBranch,
    isOwner,
    userBranch: user?.branch || "gil-puyat",
  });

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let changed = false;

    if (clearLegacyOverview && nextParams.has("tab")) {
      nextParams.delete("tab");
      changed = true;
    }

    if (requestedRange !== range) {
      nextParams.set("range", range);
      changed = true;
    }

    if (isOwner) {
      if (requestedBranch !== branch) {
        nextParams.set("branch", branch);
        changed = true;
      }
    } else if (searchParams.has("branch")) {
      nextParams.delete("branch");
      changed = true;
    }

    if (!changed) return;
    setSearchParams(nextParams, { replace: true });
  }, [
    branch,
    clearLegacyOverview,
    isOwner,
    range,
    requestedBranch,
    requestedRange,
    searchParams,
    setSearchParams,
  ]);

  const sharedDayParams = useMemo(
    () => ({
      range,
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );
  const billingParams = useMemo(
    () => ({
      range: getSummaryDetailRange("billing", range),
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );

  const occupancyQuery = useOccupancyReport(sharedDayParams);
  const billingQuery = useBillingReport(billingParams);
  const operationsQuery = useOperationsReport(sharedDayParams);

  const occupancyData = occupancyQuery.data;
  const billingData = billingQuery.data;
  const operationsData = operationsQuery.data;
  const occupancyTrend = occupancyData?.series?.occupancyTrend || [];
  const roomTypes = occupancyData?.tables?.roomTypes || [];
  const revenueByMonth = billingData?.series?.revenueByMonth || [];
  const overdueAging = billingData?.series?.overdueAging || [];
  const reservationsByPeriod = operationsData?.series?.reservationsByPeriod || [];
  const maintenanceByType = operationsData?.series?.maintenanceByType || [];
  const branchLabel = formatBranch(
    occupancyData?.scope?.branch ||
      billingData?.scope?.branch ||
      operationsData?.scope?.branch ||
      branch,
  );
  const hasPartialError = [
    occupancyQuery.isError,
    billingQuery.isError,
    operationsQuery.isError,
  ].some(Boolean);

  const metricCards = [
    {
      label: "Occupancy Rate",
      value: occupancyQuery.isLoading
        ? "..."
        : occupancyData?.kpis?.occupancyRateLabel || "0%",
      tone: "blue",
    },
    {
      label: "Collected Revenue",
      value: billingQuery.isLoading
        ? "..."
        : billingData?.kpis?.collectedRevenueLabel || "PHP 0",
      tone: "green",
    },
    {
      label: "Reservations",
      value: operationsQuery.isLoading
        ? "..."
        : operationsData?.kpis?.reservations || 0,
      tone: "amber",
    },
    {
      label: "Maintenance",
      value: operationsQuery.isLoading
        ? "..."
        : operationsData?.kpis?.maintenanceRequests || 0,
      tone: "rose",
    },
  ];

  const openDetailsHref = buildAnalyticsDetailsHref({
    tab: "occupancy",
    range,
    branch,
    isOwner,
  });

  return (
    <AnalyticsTabLayout
      header={
        <AnalyticsToolbar
          title="Analytics Summary"
          subtitle={`Chart-first view for ${branchLabel} - ${buildRangeLabel(
            range,
          )}`}
          range={{
            value: range,
            onChange: (value) => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set("range", value);
              setSearchParams(nextParams, { replace: true });
            },
            options: RANGE_OPTIONS_SHORT,
          }}
          branch={buildBranchControl({
            isOwner,
            branch,
            onChange: (value) => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set("branch", value);
              setSearchParams(nextParams, { replace: true });
            },
          })}
          actions={
            <Link
              to={openDetailsHref}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Open detailed analytics
              <ArrowRight size={16} />
            </Link>
          }
        />
      }
    >
      {hasPartialError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Some analytics blocks could not be loaded. Available charts are still shown.
        </div>
      ) : null}

      <MetricGrid items={metricCards} />

      <SummarySection
        title="Occupancy"
        subtitle={`Capacity movement and room type mix for ${buildRangeLabel(
          range,
        ).toLowerCase()}.`}
        detailHref={buildAnalyticsDetailsHref({
          tab: "occupancy",
          range,
          branch,
          isOwner,
        })}
      >
        <ReportChartPanel
          title="Occupancy trend"
          subtitle="Daily occupancy rate across the selected range"
        >
          <AnalyticsLineChart
            data={occupancyTrend.map((item) => ({
              label: item.label,
              occupancy: item.totalRate,
            }))}
            lines={[{ key: "occupancy", label: "Occupancy rate" }]}
            valueFormatter={(value) => `${value}%`}
            emptyTitle="No occupancy trend"
            emptyDescription="The selected scope does not have enough occupancy history yet."
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Room type mix"
          subtitle="Current occupied beds by room type"
        >
          <AnalyticsDonutChart
            data={roomTypes.map((item) => ({
              label: item.roomTypeLabel,
              value: item.occupiedBeds,
            }))}
            centerLabel={{
              value: occupancyData?.kpis?.occupiedBeds || 0,
              label: "Occupied",
            }}
            emptyTitle="No room type data"
            emptyDescription="Room type distribution will appear once occupancy data is available."
          />
        </ReportChartPanel>
      </SummarySection>

      <SummarySection
        title="Billing"
        subtitle={`Monthly billing view for the ${buildRangeLabel(
          billingParams.range,
        ).toLowerCase()} reporting window.`}
        detailHref={buildAnalyticsDetailsHref({
          tab: "billing",
          range,
          branch,
          isOwner,
        })}
      >
        <ReportChartPanel
          title="Monthly revenue"
          subtitle="Collected versus billed revenue"
        >
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
            emptyDescription="Revenue history will appear once billing records exist for this scope."
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Overdue aging"
          subtitle="Outstanding balances bucketed by lateness"
        >
          <AnalyticsBarChart
            data={overdueAging.map((item) => ({
              label: item.label,
              amount: item.amount,
            }))}
            bars={[{ key: "amount", label: "Outstanding", color: "#f97316" }]}
            valueFormatter={(value) => formatPeso(value)}
            emptyTitle="No overdue aging data"
            emptyDescription="There are no overdue balances for the selected scope."
          />
        </ReportChartPanel>
      </SummarySection>

      <SummarySection
        title="Operations"
        subtitle={`Reservations and maintenance demand for ${buildRangeLabel(
          range,
        ).toLowerCase()}.`}
        detailHref={buildAnalyticsDetailsHref({
          tab: "operations",
          range,
          branch,
          isOwner,
        })}
      >
        <ReportChartPanel
          title="Reservation trend"
          subtitle="Reservation volume over the selected period"
        >
          <AnalyticsBarChart
            data={reservationsByPeriod.map((item) => ({
              label: item.label,
              count: item.count,
            }))}
            bars={[{ key: "count", label: "Reservations" }]}
            emptyTitle="No reservation trend"
            emptyDescription="Reservation activity will appear once records exist in this range."
          />
        </ReportChartPanel>

        <ReportChartPanel
          title="Maintenance category mix"
          subtitle="Most common maintenance request types"
        >
          <AnalyticsDonutChart
            data={maintenanceByType.map((item) => ({
              label: item.label,
              value: item.count,
            }))}
            centerLabel={{
              value: operationsData?.kpis?.maintenanceRequests || 0,
              label: "Requests",
            }}
            emptyTitle="No maintenance categories"
            emptyDescription="Maintenance categories will appear once tickets exist for this scope."
          />
        </ReportChartPanel>
      </SummarySection>

      {isOwner ? <OwnerFinancialSummary branch={branch} range={range} /> : null}
      {isOwner ? <OwnerMonitoringSummary branch={branch} range={range} /> : null}
    </AnalyticsTabLayout>
  );
}

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const legacyTab = searchParams.get("tab");

  if (legacyTab && legacyTab !== "overview") {
    return (
      <Navigate
        to={`${ANALYTICS_DETAILS_PATH}?${searchParams.toString()}`}
        replace
      />
    );
  }

  return <AnalyticsSummaryDashboard clearLegacyOverview={legacyTab === "overview"} />;
}
