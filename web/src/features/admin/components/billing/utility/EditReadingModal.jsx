import React from "react";
import { createPortal } from "react-dom";
import { X, Check, Trash2, AlertTriangle, LoaderCircle } from "lucide-react";
import useEscapeClose from "../../../../../shared/hooks/useEscapeClose";
import {
  fmtNumber,
  sanitizeNumericInput,
  MAX_METER_READING,
} from "./utilityConstants";

export default function EditReadingModal({
  isOpen,
  onClose,
  reading,
  currentPeriod,
  utilityType,
  editForm,
  setEditForm,
  onSave,
  onDelete,
  isSaving,
}) {
  useEscapeClose(isOpen, onClose);

  if (!isOpen || !reading) return null;

  const baselineReading =
    reading?.previousReading ?? currentPeriod?.startReading ?? null;
  const inputVal = Number(editForm.reading);
  const hasInput = editForm.reading !== "" && !isNaN(inputVal);
  const delta = baselineReading !== null && hasInput ? inputVal - baselineReading : null;
  const isBelowBaseline = delta !== null && delta < 0;
  const isExceedsMax = parseFloat(editForm.reading) > MAX_METER_READING;
  const isSaveDisabled =
    isSaving || isBelowBaseline || isExceedsMax || !editForm.reading;

  const unit = utilityType === "electricity" ? "kWh" : "m³";

  if (!isOpen || !reading || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{
        background: "color-mix(in srgb, var(--background) 70%, transparent)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="text-sm font-bold text-card-foreground">
            Manage Meter Reading
          </span>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Baseline Comparison Alert */}
          {baselineReading !== null && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                isBelowBaseline
                  ? "border-slate-200 bg-slate-50/70 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                  : "border-border bg-muted/20 text-card-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>
                  Baseline Reading:{" "}
                  <strong>
                    {fmtNumber(baselineReading, 2)} {unit}
                  </strong>
                </span>
                {delta !== null && (
                  <span
                    className={`font-bold ${
                      isBelowBaseline
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {isBelowBaseline
                      ? `Invalid Rollback: ${delta.toFixed(2)}`
                      : `Usage Delta: +${delta.toFixed(2)} ${unit}`}
                  </span>
                )}
              </div>
              {isBelowBaseline && (
                <p className="mt-1.5 font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <span>⚠</span>
                  <span>New reading cannot be lower than the opening baseline ({fmtNumber(baselineReading, 2)} {unit}).</span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Reading Input */}
            <div className="space-y-1 sm:col-span-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Reading ({unit})
                </label>
              </div>
              <input
                type="text"
                inputMode="decimal"
                maxLength={9}
                className={`h-9 w-full rounded-lg border px-3 text-xs font-mono text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400 ${
                  isBelowBaseline || isExceedsMax ? "border-rose-500 text-rose-600" : "border-border"
                }`}
                value={editForm.reading}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    reading: sanitizeNumericInput(e.target.value, 2, 6),
                  })
                }
                autoFocus
              />
              {isExceedsMax && (
                <p className="text-[10px] font-medium text-rose-600">
                  Reading exceeds maximum allowable limit
                </p>
              )}
            </div>

            {/* Date Input */}
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400"
                value={editForm.date}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    date: e.target.value,
                  })
                }
              />
            </div>

            {/* Event Type Dropdown */}
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Event Type
              </label>
              <select
                className="h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400"
                value={editForm.eventType}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    eventType: e.target.value,
                  })
                }
              >
                <option value="regularBilling">Mid-Cycle Reading</option>
                <option value="moveIn">Tenant Move-In</option>
                <option value="moveOut">Tenant Move-Out</option>
                <option value="manualAdjustment">Manual Correction</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5 bg-muted/10">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 active:scale-[0.98] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:border-rose-800"
            onClick={() => {
              if (reading.id) {
                onClose();
                onDelete(reading.id);
              }
            }}
            disabled={isSaving}
            title={isSaving ? "Saving in progress..." : "Archive this meter reading"}
          >
            <Trash2 size={13} className="shrink-0" />
            <span>Archive</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98] transition-colors duration-150 disabled:opacity-50"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A1628] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#13243D] active:scale-[0.98] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#D4AF37] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              onClick={onSave}
              disabled={isSaveDisabled}
              title={
                isBelowBaseline
                  ? "Reading cannot be lower than the opening baseline"
                  : isExceedsMax
                    ? "Reading exceeds the maximum limit of 999,999.99"
                    : !editForm.reading
                      ? "Enter a valid meter reading value"
                      : "Save changes to this meter reading"
              }
            >
              {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
              <span>{isSaving ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
