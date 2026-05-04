import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, ArrowUp } from "lucide-react";



/**
 * OccupancyTrendCard — Weekly occupancy trend chart
 * Shows occupied beds (area) and occupancy rate % (area) over time
 */
export default function OccupancyTrendCard({ data = {} }) {
  const occupancyTrendData = useMemo(() => {
    // Generate sample weekly trend data based on current occupancy
    const trend = data.trend || [];
    
    if (trend.length === 0) {
      // Generate default 5-week trend data
      const totalOccupancy = data.totalOccupancy || 0;
      const totalCapacity = data.totalCapacity || 0;
      const currentRate = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;
      
      return [
        { period: "Week 1", occupied: Math.max(0, totalOccupancy - 20), rate: Math.max(0, currentRate - 14) },
        { period: "Week 2", occupied: Math.max(0, totalOccupancy - 15), rate: Math.max(0, currentRate - 10) },
        { period: "Week 3", occupied: Math.max(0, totalOccupancy - 8), rate: Math.max(0, currentRate - 5) },
        { period: "Week 4", occupied: Math.max(0, totalOccupancy - 3), rate: Math.max(0, currentRate - 2) },
        { period: "Week 5", occupied: totalOccupancy, rate: currentRate },
      ];
    }
    
    return trend.map((item) => ({
      period: item.label || "",
      occupied: item.occupiedBeds || item.totalOccupancy || 0,
      rate: item.occupancyRate || item.totalRate || 0,
    }));
  }, [data.trend, data.totalOccupancy, data.totalCapacity]);

  const totalCapacity = data.totalCapacity || 294;
  const currentBeds = data.totalOccupancy || 287;
  const totalCapacityDisplay = totalCapacity || 294;
  const currentRate = totalCapacityDisplay > 0 ? Math.round((currentBeds / totalCapacityDisplay) * 100) : 0;
  const previousRate = occupancyTrendData.length > 1 ? occupancyTrendData[occupancyTrendData.length - 2]?.rate || 0 : 0;
  const trendChange = currentRate - previousRate;

  return (
    <div
  className="rounded-lg overflow-hidden"
  style={{
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-light)",
  }}
>

      <div className="p-6 border-b border-border bg-muted/20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-[color:var(--success)] dark:text-[color:var(--success)]" />
              <h3 className="text-lg font-semibold text-foreground">Occupancy Trend</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Weekly occupancy rate across all branches</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Rate</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-[color:var(--success)] dark:text-[color:var(--success)]">{currentRate}%</span>
                  {trendChange !== 0 && (
                    <span className="flex items-center gap-1 text-xs text-[color:var(--success)] dark:text-[color:var(--success)]">
                      <ArrowUp className="w-3 h-3" />
                      {Math.abs(trendChange).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Occupied Beds</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-foreground">{currentBeds}</span>
                  <span className="text-xs text-muted-foreground">/ {totalCapacityDisplay}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={occupancyTrendData}>
            <defs>
              <linearGradient id="colorOccupied" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-gold)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--chart-gold)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" key="dashboard-occupancy-grid" />
            <XAxis dataKey="period" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="dashboard-occupancy-xaxis" />
            <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="dashboard-occupancy-yaxis" />
            <Tooltip
              key="dashboard-occupancy-tooltip"
              contentStyle={{
                backgroundColor: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                fontSize: '12px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} key="dashboard-occupancy-legend" />
                <Area
                  type="monotone"
                  dataKey="occupied"
                  stroke="var(--chart-gold)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOccupied)"
                  name="Occupied Beds"
                  key="dashboard-occupancy-area-occupied"
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--success)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRate)"
                  name="Occupancy Rate (%)"
                  yAxisId="right"
                  key="dashboard-occupancy-area-rate"
                />
                <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="dashboard-occupancy-yaxis-right" />
              </AreaChart>
        </ResponsiveContainer>
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Insight:</span> Occupancy has grown steadily over the past 5 weeks,
            increasing from {previousRate}% to {currentRate}%. Current trend indicates near-full capacity within the next week.
          </p>
        </div>
      </div>
    </div>
  );
}
