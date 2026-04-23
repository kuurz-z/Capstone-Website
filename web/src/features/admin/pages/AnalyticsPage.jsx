import React, { useEffect, useMemo } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useBillingReport,
  useOccupancyReport,
  useOperationsReport,
} from "../../../shared/hooks/queries/useAnalyticsReports";
import {
  AnalyticsBarChart,
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

function SummaryDetailAction({ to, label = "View details" }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
    >
      {label}
      <ExternalLink size={14} />
    </Link>
  );
}

function SummaryOverviewBlock({
  sectionKey,
  title,
  subtitle,
  to,
  children,
}) {
  return (
    <section
      className="analytics-summary-overview-card"
      data-summary-overview-block={sectionKey}
    >
      <ReportChartPanel
        title={title}
        subtitle={subtitle}
        actions={<SummaryDetailAction to={to} />}
      >
        <div className="analytics-summary-overview-card__content">
          <div className="analytics-summary-overview-card__chart">{children}</div>
        </div>
      </ReportChartPanel>
    </section>
  );
}

function SummarySectionHeader({
  eyebrow,
  title,
  subtitle,
  className = "",
}) {
  const headerClassName = [
    "analytics-summary-section-header",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={headerClassName}>
      {eyebrow ? (
        <span className="analytics-summary-section-header__eyebrow">
          {eyebrow}
        </span>
      ) : null}
      <div className="analytics-summary-section-header__copy">
        <h2 className="analytics-summary-section-header__title">{title}</h2>
        {subtitle ? (
          <p className="analytics-summary-section-header__subtitle">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
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
  const occupancyKpis = occupancyData?.kpis || {};
  const billingKpis = billingData?.kpis || {};
  const operationsKpis = operationsData?.kpis || {};
  const occupancyTrend = occupancyData?.series?.occupancyTrend || [];
  const revenueByMonth = billingData?.series?.revenueByMonth || [];
  const reservationsByPeriod = operationsData?.series?.reservationsByPeriod || [];

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
        : occupancyKpis.occupancyRateLabel || "0%",
      tone: "blue",
    },
    {
      label: "Collected Revenue",
      value: billingQuery.isLoading
        ? "..."
        : billingKpis.collectedRevenueLabel || "PHP 0",
      tone: "green",
    },
    {
      label: "Reservations",
      value: operationsQuery.isLoading
        ? "..."
        : operationsKpis.reservations || 0,
      tone: "amber",
    },
    {
      label: "Maintenance",
      value: operationsQuery.isLoading
        ? "..."
        : operationsKpis.maintenanceRequests || 0,
      tone: "rose",
    },
  ];

  const occupancyDetailHref = buildAnalyticsDetailsHref({
    tab: "occupancy",
    range,
    branch,
    isOwner,
  });
  const billingDetailHref = buildAnalyticsDetailsHref({
    tab: "billing",
    range,
    branch,
    isOwner,
  });
  const operationsDetailHref = buildAnalyticsDetailsHref({
    tab: "operations",
    range,
    branch,
    isOwner,
  });

  return (
    <AnalyticsTabLayout
      className="analytics-summary-layout"
      headerClassName="analytics-summary-layout__header"
      bodyClassName="analytics-summary-layout__body"
      mainClassName="analytics-summary-layout__main"
      header={
        <AnalyticsToolbar
          title="Analytics Summary"
          subtitle={`Summary view for ${branchLabel} (${buildRangeLabel(
            range,
          )})`}
          compact
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
              to={occupancyDetailHref}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              View detailed analytics
              <ArrowRight size={16} />
            </Link>
          }
        />
      }
    >
      <div className="analytics-summary-focus flex flex-col gap-6">
        {hasPartialError ? (
          <div className="analytics-summary-focus__error rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Some summary sections could not be loaded. Available data is shown where possible.
          </div>
        ) : null}

        <section
          className="analytics-summary-overview"
          data-summary-overview="true"
        >
          <SummarySectionHeader
            className="analytics-summary-overview__header"
            eyebrow="Overview"
            title="Key metrics and trend summaries"
            subtitle="Review occupancy, billing, and operational performance for the selected scope."
          />

          <div className="analytics-summary-focus__metrics">
            <MetricGrid items={metricCards} />
          </div>

          <div className="analytics-summary-overview__grid">
            <SummaryOverviewBlock
              sectionKey="occupancy"
              title="Occupancy overview"
              subtitle={`Occupancy trend across ${buildRangeLabel(
                range,
              ).toLowerCase()}.`}
              to={occupancyDetailHref}
            >
              <AnalyticsLineChart
                data={occupancyTrend.map((item) => ({
                  label: item.label,
                  occupancy: item.totalRate,
                }))}
                lines={[{ key: "occupancy", label: "Occupancy rate" }]}
                height={96}
                valueFormatter={(value) => `${value}%`}
                emptyTitle="No occupancy trend"
                emptyDescription="Occupancy history will appear once reporting data is available."
              />
            </SummaryOverviewBlock>

            <SummaryOverviewBlock
              sectionKey="billing"
              title="Billing overview"
              subtitle={`Collections trend across the ${buildRangeLabel(
                billingParams.range,
              ).toLowerCase()} reporting period.`}
              to={billingDetailHref}
            >
              <AnalyticsBarChart
                data={revenueByMonth.map((item) => ({
                  label: item.label,
                  collected: item.collectedRevenue,
                }))}
                bars={[
                  { key: "collected", label: "Collected", color: "#2563eb" },
                ]}
                height={92}
                valueFormatter={(value) => formatPeso(value)}
                emptyTitle="No billing revenue data"
                emptyDescription="Revenue history will appear once billing data is available."
              />
            </SummaryOverviewBlock>

            <SummaryOverviewBlock
              sectionKey="operations"
              title="Operations overview"
              subtitle={`Reservation trend across ${buildRangeLabel(
                range,
              ).toLowerCase()}.`}
              to={operationsDetailHref}
            >
              <AnalyticsBarChart
                data={reservationsByPeriod.map((item) => ({
                  label: item.label,
                  count: item.count,
                }))}
                bars={[{ key: "count", label: "Reservations", color: "#f59e0b" }]}
                height={92}
                emptyTitle="No reservation trend"
                emptyDescription="Reservation activity will appear once reporting data is available."
              />
            </SummaryOverviewBlock>
          </div>
        </section>

        <section
          className="analytics-summary-sections"
          data-summary-focus-sections="true"
        >
          <SummarySectionHeader
            className="analytics-summary-sections__header"
            eyebrow="Detailed analysis"
            title="Detailed trend analysis"
            subtitle="Review detailed occupancy, billing, and operations charts below."
          />

          <div className="analytics-summary-sections__stack">
            <section
              className="analytics-summary-focus-section"
              data-summary-card="occupancy"
              data-summary-focus-section="occupancy"
            >
              <ReportChartPanel
                title="Occupancy analysis"
                subtitle={`Detailed occupancy trend across ${buildRangeLabel(
                  range,
                ).toLowerCase()}.`}
                actions={<SummaryDetailAction to={occupancyDetailHref} />}
              >
                <div className="flex h-full flex-col">
                  <AnalyticsLineChart
                    data={occupancyTrend.map((item) => ({
                      label: item.label,
                      occupancy: item.totalRate,
                    }))}
                    lines={[{ key: "occupancy", label: "Occupancy rate" }]}
                    height={220}
                    valueFormatter={(value) => `${value}%`}
                    emptyTitle="No occupancy trend"
                    emptyDescription="The selected scope does not yet have sufficient occupancy history."
                  />
                </div>
              </ReportChartPanel>
            </section>

            <section
              className="analytics-summary-focus-section"
              data-summary-card="billing"
              data-summary-focus-section="billing"
            >
              <ReportChartPanel
                title="Billing analysis"
                subtitle={`Detailed collections view for the ${buildRangeLabel(
                  billingParams.range,
                ).toLowerCase()} reporting period.`}
                actions={<SummaryDetailAction to={billingDetailHref} />}
              >
                <div className="flex h-full flex-col">
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
                    height={180}
                    valueFormatter={(value) => formatPeso(value)}
                    emptyTitle="No billing revenue data"
                    emptyDescription="Revenue history will appear once billing data is available for this scope."
                  />
                </div>
              </ReportChartPanel>
            </section>

            <section
              className="analytics-summary-focus-section"
              data-summary-card="operations"
              data-summary-focus-section="operations"
            >
              <ReportChartPanel
                title="Operations analysis"
                subtitle={`Detailed reservation trend across ${buildRangeLabel(
                  range,
                ).toLowerCase()}.`}
                actions={<SummaryDetailAction to={operationsDetailHref} />}
              >
                <div className="flex h-full flex-col">
                  <AnalyticsBarChart
                    data={reservationsByPeriod.map((item) => ({
                      label: item.label,
                      count: item.count,
                    }))}
                    bars={[{ key: "count", label: "Reservations" }]}
                    height={180}
                    emptyTitle="No reservation trend"
                    emptyDescription="Reservation activity will appear once data is available for the selected period."
                  />
                </div>
              </ReportChartPanel>
            </section>
          </div>
        </section>
      </div>
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

  return (
    <AnalyticsSummaryDashboard clearLegacyOverview={legacyTab === "overview"} />
  );
}
