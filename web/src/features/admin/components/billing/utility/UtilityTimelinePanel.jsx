import React from "react";
import {
  Clock3,
  Eye,
  EyeOff,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import {
  fmtNumber,
  fmtDate,
  getEventTypeLabel,
  getTimelineRecordLabel,
  getTimelineStatusLabel,
  getTimelineDotClasses,
  isMoveLifecycleEvent,
  isSystemBoundaryEvent,
  EMPTY_VALUE,
} from "./utilityConstants";
import { ExportButtons } from "../../../pages/analyticsTabShared";

const maskEmail = (email) => {
  if (!email || typeof email !== "string") return EMPTY_VALUE;
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  const maskedName =
    name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${maskedName}@${domain}`;
};

export default function UtilityTimelinePanel({
  timelineRows = [],
  pagedTimelineRows = [],
  timelinePage,
  totalTimelinePages,
  onPageChange,
  unmaskedRows = {},
  onToggleUnmaskRow,
  onEditReading,
  isCurrentCycleLocked,
  utilityType,
  onExportCsv,
  onExportPdf,
  isExporting,
}) {
  const unit = utilityType === "electricity" ? "kWh" : "m³";

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-card-foreground">
            <Clock3 size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
            Audit & Meter Timeline
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chronological audit trail of submeter readings, tenant move-ins, move-outs, and room transfer events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {timelineRows.length} event{timelineRows.length !== 1 ? "s" : ""} logged
          </span>
          <ExportButtons
            onCsv={onExportCsv}
            onPdf={onExportPdf}
            loading={isExporting}
            disabled={timelineRows.length === 0}
          />
        </div>
      </div>

      {/* Timeline List */}
      <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
        {pagedTimelineRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 min-h-[280px] text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
            <ClipboardList size={28} className="text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-card-foreground">No Timeline Events</p>
            <p className="mt-0.5 text-xs">No meter logs or tenant occupancy events found for this billing period.</p>
          </div>
        ) : (
          pagedTimelineRows.map((row) => {
            const isMove = isMoveLifecycleEvent(row.eventType);
            const isBoundary = isSystemBoundaryEvent(row.eventType);
            const emailRevealed = Boolean(unmaskedRows[row.id]);
            const displayEmail = emailRevealed
              ? row.tenantEmail || row.tenantName || EMPTY_VALUE
              : maskEmail(row.tenantEmail || row.tenantName);

            return (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/20"
              >
                {/* Left side info */}
                <div className="flex min-w-[240px] flex-1 items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${getTimelineDotClasses(row.eventType)}`}
                  />
                  <div>
                    <p className="text-xs font-bold text-card-foreground">
                      {getEventTypeLabel(row.eventType)}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {row.source !== "meter" && (
                        <span className="rounded border border-slate-200 dark:border-slate-700 bg-muted/40 px-1.5 py-0.2 text-[10px] font-medium">
                          {getTimelineRecordLabel(row)}
                        </span>
                      )}
                      <span className="rounded border border-slate-200 dark:border-slate-700 bg-muted/40 px-1.5 py-0.2 text-[10px] font-medium">
                        {getTimelineStatusLabel(row)}
                      </span>

                      {!isMove ? (
                        <span className="font-medium text-slate-700 dark:text-slate-300">Entire Room</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                          <button
                            type="button"
                            onClick={() => onToggleUnmaskRow(row.id)}
                            className="text-muted-foreground hover:text-foreground"
                            title={emailRevealed ? "Hide email (mask)" : "Unhide email (reveal)"}
                          >
                            {emailRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <span>{displayEmail}</span>
                        </span>
                      )}

                      {row.bedName && (
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          Bed {row.bedName}
                        </span>
                      )}
                    </div>

                    {row.reading != null && (
                      <p className="mt-1 text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                        {fmtNumber(row.reading, 2)} {unit}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right side date and action */}
                <div className="flex items-center gap-2.5 text-right">
                  <span className="text-xs text-muted-foreground font-medium">
                    {fmtDate(row.date)}
                  </span>

                  {row.hasMeterRecord && row.rawReading ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs font-semibold text-card-foreground hover:bg-muted active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => onEditReading(row.rawReading)}
                      disabled={(utilityType !== "water" && isBoundary) || isCurrentCycleLocked || ["corrected","voided"].includes(row.rawReading?.readingStatus)}
                      title={
                        isCurrentCycleLocked
                          ? "This billing cycle is locked."
                          : isBoundary && utilityType !== "water"
                            ? "Opening/closing boundary readings are locked to preserve audit integrity."
                            : "Manage reading"
                      }
                    >
                      <Pencil size={11} />
                      <span>Manage</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalTimelinePages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-muted-foreground">
          <span>
            Page {timelinePage} of {totalTimelinePages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={timelinePage <= 1}
              onClick={() => onPageChange(timelinePage - 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous timeline page"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              disabled={timelinePage >= totalTimelinePages}
              onClick={() => onPageChange(timelinePage + 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next timeline page"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
