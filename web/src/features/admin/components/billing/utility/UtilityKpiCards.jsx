import React from "react";
import { Zap, Droplets, DollarSign, TrendingUp, Send, CheckCircle2 } from "lucide-react";
import { fmtCurrency, fmtNumber } from "./utilityConstants";

export default function UtilityKpiCards({
  utilityType,
  kpiMetrics = {
    totalUsage: 0,
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionPercent: 0,
    readyToSendCount: 0,
    coveredRoomsCount: 0,
  },
}) {
  const unit = utilityType === "electricity" ? "kWh" : "m³ (verified periods)";
  const UtilityIcon = utilityType === "electricity" ? Zap : Droplets;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Consumption */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Total Consumption
          </p>
          <div className={`flex shrink-0 items-center justify-center ${
            utilityType === "electricity"
              ? "text-amber-600 dark:text-amber-400"
              : "text-sky-600 dark:text-sky-400"
          }`}>
            <UtilityIcon size={18} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">
          {fmtNumber(kpiMetrics.totalUsage, 2)}{" "}
          <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-card-foreground">
            {kpiMetrics.coveredRoomsCount}
          </span>{" "}
          monitored room{kpiMetrics.coveredRoomsCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Total Billed Charges */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Total Billed
          </p>
          <div className="flex shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
            <DollarSign size={18} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">
          {fmtCurrency(kpiMetrics.totalBilled)}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-card-foreground">
            {fmtCurrency(kpiMetrics.totalOutstanding)}
          </span>{" "}
          outstanding balance
        </div>
      </div>

      {/* Collection Rate */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Collected
          </p>
          <span className="font-bold text-xs text-emerald-700 dark:text-emerald-400">
            {kpiMetrics.collectionPercent}%
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
          {fmtCurrency(kpiMetrics.totalCollected)}
        </p>
        <div className="mt-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 h-1.5 w-full">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, kpiMetrics.collectionPercent))}%` }}
          />
        </div>
      </div>

      {/* Ready to Send / Release State */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Ready to Send
          </p>
          <div className="flex shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Send size={18} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">
          {kpiMetrics.readyToSendCount}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {kpiMetrics.readyToSendCount > 0 ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              Finalized & awaiting release to tenants
            </span>
          ) : (
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-600" /> All statements up to date
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
