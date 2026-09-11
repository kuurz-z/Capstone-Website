import React from "react";
import {
  Calendar,
  Plus,
  Send,
  Zap,
  Droplets,
  DollarSign,
  Gauge,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { getRoomLabel } from "../../../../../shared/utils/roomLabel";
import { fmtCurrency, fmtNumber, fmtDate, getCycleLabel, EMPTY_VALUE } from "./utilityConstants";
import { ExportButtons } from "../../../pages/analyticsTabShared";

export default function UtilityCycleOverviewCard({
  selectedRoom,
  currentPeriod,
  manualReviewPeriod,
  latestHistoricalPeriod,
  currentPeriodUsage,
  currentPeriodCost,
  readyRoomsCount = 0,
  onOpenNewPeriodModal,
  onOpenCurrentPeriod,
  onCloseCurrentPeriod,
  onBatchSendReady,
  onExportCsv,
  onExportPdf,
  isExporting,
  utilityType,
  isSendingBatch,
}) {
  const unit = utilityType === "electricity" ? "kWh" : (currentPeriod?.calculationVersion === "water-meter-v1" ? "m³" : "legacy basis");
  const UtilityIcon = utilityType === "electricity" ? Zap : Droplets;
  const roomName = selectedRoom ? getRoomLabel(selectedRoom) : "Select a Room";
  const branchLabel = selectedRoom?.branch ? String(selectedRoom.branch).toUpperCase() : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs">
      {/* Header bar with Room title, Branch, Tenant count, and Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className={`flex shrink-0 items-center justify-center ${
            utilityType === "electricity"
              ? "text-amber-600 dark:text-amber-400"
              : "text-sky-600 dark:text-sky-400"
          }`}>
            <UtilityIcon size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-card-foreground">
                {roomName}
              </h2>
              {branchLabel && (
                <span className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  {branchLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedRoom
                ? `${selectedRoom.activeTenantCount || 0} active tenant${selectedRoom.activeTenantCount !== 1 ? "s" : ""} in room`
                : "Select a room from the list to view billing cycles"}
            </p>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBatchSendReady}
            disabled={readyRoomsCount === 0 || isSendingBatch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            title={
              readyRoomsCount === 0
                ? "No finalized utility bills are awaiting release to tenants"
                : "Review and select finalized rooms to release statements"
            }
          >
            <Send size={13} />
            <span>Send Ready ({readyRoomsCount})</span>
          </button>

          {!currentPeriod && !manualReviewPeriod ? (
            <>
              <button
                type="button"
                onClick={onOpenCurrentPeriod}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A1628] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#13243D] active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#D4AF37] dark:bg-slate-100 dark:text-slate-900"
              >
                <Plus size={13} />
                <span>Recovery / Manual Initialization</span>
              </button>
              <button
                type="button"
                onClick={onOpenNewPeriodModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Calendar size={13} />
                <span>Generate Historical Cycle</span>
              </button>
            </>
          ) : null}

          {currentPeriod ? (
            <button
              type="button"
              onClick={onCloseCurrentPeriod}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A1628] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#13243D]"
            >
              <Calendar size={13} />
              <span>Close Current Period</span>
            </button>
          ) : null}

          <ExportButtons
            onCsv={onExportCsv}
            onPdf={onExportPdf}
            loading={isExporting}
            disabled={!selectedRoom}
          />
        </div>
      </div>

      {/* Cycle Highlights Section */}
      {currentPeriod ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Cycle Range */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Calendar size={12} className="text-sky-600 dark:text-sky-400" />
              Active Cycle Range
            </div>
            <p className="mt-1.5 text-sm font-bold text-card-foreground">
              {getCycleLabel(currentPeriod)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {fmtDate(currentPeriod.startDate)} → {fmtDate(currentPeriod.endDate || currentPeriod.targetCloseDate) || "Ongoing"}
            </p>
          </div>

          {/* Consumption & Readings */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Gauge size={12} className={utilityType === "electricity" ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"} />
              Usage & Rate
            </div>
            <p className="mt-1.5 text-sm font-bold text-card-foreground">
              {currentPeriodUsage != null ? `${fmtNumber(currentPeriodUsage, 2)} ${unit}` : EMPTY_VALUE}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Rate: {fmtCurrency(currentPeriod.ratePerUnit)} / {unit}
            </p>
          </div>

          {/* Estimated Total Charge */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <DollarSign size={12} className="text-emerald-600 dark:text-emerald-400" />
              Total Room Charge
            </div>
            <p className="mt-1.5 text-sm font-bold text-card-foreground">
              {currentPeriodCost != null ? fmtCurrency(currentPeriodCost) : EMPTY_VALUE}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Status: <span className="font-semibold uppercase">{currentPeriod.status || "Active"}</span>
            </p>
          </div>
        </div>
      ) : manualReviewPeriod ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-amber-300 bg-amber-50/60 py-6 text-center text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertCircle size={24} />
          <p className="mt-2 font-semibold">Billing Period Requires Review</p>
          <p className="mt-0.5 text-[11px]">{manualReviewPeriod.manualReviewReason || "Resolve the billing warning before continuing."}</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          {Number(selectedRoom?.activeTenantCount || 0) === 0
            ? <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
            : <AlertCircle size={24} className="text-amber-500 dark:text-amber-400" />}
          <p className="mt-2 font-semibold text-card-foreground">
            {Number(selectedRoom?.activeTenantCount || 0) === 0
              ? "No Active Period — Room Currently Vacant"
              : "No Active Billing Period"}
          </p>
          <p className="mt-0.5 text-[11px]">
            {Number(selectedRoom?.activeTenantCount || 0) === 0
              ? "The next move-in or transfer will initialize the period from the actual meter reading."
              : "Billing continuity needs review. Use manual initialization only for an approved recovery."}
          </p>
          {latestHistoricalPeriod ? <p className="mt-1 text-[11px]">Latest historical cycle: {getCycleLabel(latestHistoricalPeriod)} · {latestHistoricalPeriod.billingLabel || latestHistoricalPeriod.status}</p> : null}
        </div>
      )}
    </div>
  );
}
