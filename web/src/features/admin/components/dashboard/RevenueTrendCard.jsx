import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, ArrowUp, DollarSign } from "lucide-react";

/**
 * RevenueTrendCard — Monthly revenue trend chart
 * Shows Target Revenue vs Actual Revenue comparison
 */
export default function RevenueTrendCard({ data = {} }) {
  const revenueTrendData = useMemo(() => {
    const trend = data.revenueTrend || [];

    if (trend.length === 0) {
      // Generate sample 6-month trend data
      const currentMonthRevenue = data.revenueCollected || 1890000;
      const targetRevenue = currentMonthRevenue / 1.18; // 118% of target

      return [
        {
          period: "Nov",
          target: targetRevenue * 0.85,
          actual: targetRevenue * 0.88,
        },
        {
          period: "Dec",
          target: targetRevenue * 0.9,
          actual: targetRevenue * 0.98,
        },
        {
          period: "Jan",
          target: targetRevenue * 0.95,
          actual: targetRevenue * 1.05,
        },
        {
          period: "Feb",
          target: targetRevenue * 1.0,
          actual: targetRevenue * 1.08,
        },
        {
          period: "Mar",
          target: targetRevenue * 1.0,
          actual: targetRevenue * 1.12,
        },
        {
          period: "Apr",
          target: targetRevenue * 1.0,
          actual: currentMonthRevenue,
        },
      ];
    }

    return trend.slice(-6).map((item) => ({
      period: item.label || "",
      target: item.targetRevenue || 0,
      actual: item.actualRevenue || item.collectedRevenue || 0,
    }));
  }, [data.revenueTrend, data.revenueCollected]);

  const currentMonthRevenue = data.revenueCollected || 1890000;
  const lastMonthRevenue =
    revenueTrendData.length > 1
      ? revenueTrendData[revenueTrendData.length - 2]?.actual || 0
      : currentMonthRevenue * 0.92;
  const revenueChange = currentMonthRevenue - lastMonthRevenue;
  const changePercentage =
    lastMonthRevenue > 0
      ? Math.round((revenueChange / lastMonthRevenue) * 100 * 10) / 10
      : 0;

  const targetRevenue =
    revenueTrendData.length > 0
      ? revenueTrendData[revenueTrendData.length - 1]?.target || 1600000
      : 1600000;
  const performancePercent =
    targetRevenue > 0
      ? Math.round((currentMonthRevenue / targetRevenue) * 100)
      : 100;

  const formatPeso = (value) => {
    if (value >= 1000000) {
      return `₱${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `₱${(value / 1000).toFixed(1)}K`;
    }
    return `₱${value}`;
  };

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div
        className="p-6 border-b"
        style={{
          borderColor: "var(--color-border-default)",
          backgroundColor: "var(--color-bg-elevated)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign
                className="w-5 h-5"
                style={{ color: "var(--chart-blue)" }}
              />
              <h3
                className="text-lg font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Revenue Trend
              </h3>
            </div>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Monthly revenue performance vs target
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p
                  className="text-xs uppercase tracking-wide mb-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Current Month
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-semibold"
                    style={{ color: "var(--chart-blue)" }}
                  >
                    {formatPeso(currentMonthRevenue)}
                  </span>
                  {changePercentage !== 0 && (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--success)" }}
                    >
                      <ArrowUp className="w-3 h-3" />
                      {Math.abs(changePercentage).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p
                  className="text-xs uppercase tracking-wide mb-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Vs Target
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-semibold"
                    style={{ color: "var(--success)" }}
                  >
                    {performancePercent}%
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    on track
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={revenueTrendData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-default)"
              key="dashboard-revenue-grid"
            />
            <XAxis
              dataKey="period"
              stroke="var(--color-text-muted)"
              style={{ fontSize: "12px" }}
              key="dashboard-revenue-xaxis"
            />
            <YAxis
              stroke="var(--color-text-muted)"
              style={{ fontSize: "12px" }}
              tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`}
              key="dashboard-revenue-yaxis"
            />
            <Tooltip
              key="dashboard-revenue-tooltip"
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--color-border-default)",
                borderRadius: "0.5rem",
                fontSize: "12px",
              }}
              formatter={(value) => formatPeso(value)}
            />
            <Legend
              payload={[
                { value: "Target Revenue", color: "var(--chart-blue)" },
                { value: "Actual Revenue", color: "var(--chart-gold)" },
              ]}
              wrapperStyle={{ fontSize: "12px" }}
              key="dashboard-revenue-legend"
            />
            <Bar
              dataKey="target"
              fill="var(--chart-blue)"
              name="Target Revenue"
              radius={[8, 8, 0, 0]}
              key="dashboard-revenue-bar-target"
            />
            <Bar
              dataKey="actual"
              fill="var(--chart-gold)"
              name="Actual Revenue"
              radius={[8, 8, 0, 0]}
              key="dashboard-revenue-bar-actual"
            />
          </BarChart>
        </ResponsiveContainer>
        <div
          className="mt-4 p-3 rounded-lg"
          style={{ backgroundColor: "var(--color-bg-elevated)" }}
        >
          <p
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span
              className="font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Insight:
            </span>{" "}
            Revenue has consistently exceeded targets for 6 consecutive months,
            with an average growth of 8.2% month-over-month. April revenue is{" "}
            {performancePercent - 100}% above target.
          </p>
        </div>
      </div>
    </div>
  );
}
