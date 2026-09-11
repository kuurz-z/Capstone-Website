import React from "react";
import { createPortal } from "react-dom";
import { X, Save, AlertCircle, LoaderCircle } from "lucide-react";
import useEscapeClose from "../../../../../shared/hooks/useEscapeClose";
import {
  sanitizeNumericInput,
  MAX_METER_READING,
  MAX_ELECTRICITY_RATE,
  MAX_WATER_RATE,
} from "./utilityConstants";

export default function EditPeriodModal({
  isOpen,
  onClose,
  periodId,
  periodList = [],
  utilityType,
  editForm,
  setEditForm,
  onSave,
  isSaving,
}) {
  useEscapeClose(isOpen, onClose);

  if (!isOpen || !periodId) return null;

  const editedPeriod = periodList.find((p) => p.id === periodId);
  const nextPeriodInChain = periodList.find(
    (p) =>
      p.id !== periodId &&
      p.startDate &&
      editedPeriod?.endDate &&
      new Date(p.startDate) >= new Date(editedPeriod.endDate),
  );

  const hasDownstreamMismatch = Boolean(
    nextPeriodInChain &&
      utilityType === "electricity" &&
      editForm.endReading !== "" &&
      Number(editForm.endReading) !== Number(editedPeriod?.endReading),
  );

  const startNum = parseFloat(editForm.startReading);
  const endNum = parseFloat(editForm.endReading);
  const rateNum = parseFloat(editForm.ratePerUnit);
  const maxRate =
    utilityType === "electricity" ? MAX_ELECTRICITY_RATE : MAX_WATER_RATE;

  const isRateInvalid = !isNaN(rateNum) && (rateNum < 0 || rateNum > maxRate);
  const isStartReadingExceedsMax = !isNaN(startNum) && startNum > MAX_METER_READING;
  const isEndReadingExceedsMax = !isNaN(endNum) && endNum > MAX_METER_READING;
  const isReadingLower =
    utilityType === "electricity" &&
    !isNaN(startNum) &&
    !isNaN(endNum) &&
    endNum < startNum;

  const isSaveDisabled =
    isSaving ||
    isRateInvalid ||
    isStartReadingExceedsMax ||
    isEndReadingExceedsMax ||
    isReadingLower ||
    !editForm.startDate ||
    !editForm.endDate ||
    !editForm.ratePerUnit;

  const unit = utilityType === "electricity" ? "kWh" : "legacy basis";

  if (!isOpen || !periodId || typeof document === "undefined") return null;

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
            Edit Billing Period
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

        {/* Body */}
        <div className="space-y-3.5 px-5 py-4">
          {hasDownstreamMismatch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="leading-relaxed">
                <strong className="font-semibold text-amber-700 dark:text-amber-400">Chain Discrepancy:</strong> Changing the final reading from{" "}
                <strong>{editedPeriod?.endReading} {unit}</strong> to{" "}
                <strong>{editForm.endReading} {unit}</strong> creates a discrepancy with the next cycle (opening reading: {nextPeriodInChain?.startReading} {unit}).
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Cycle Start */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Cycle Start Date
              </label>
              <input
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400"
                value={editForm.startDate}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
            </div>

            {/* Cycle End */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Cycle End Date
              </label>
              <input
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400"
                value={editForm.endDate}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, endDate: e.target.value }))
                }
              />
            </div>

            {/* Readings for electricity */}
            {utilityType === "electricity" && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Opening Reading ({unit})
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={9}
                    className={`h-9 w-full rounded-lg border px-3 text-xs font-mono text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400 ${
                      isStartReadingExceedsMax ? "border-rose-500 text-rose-600" : "border-border"
                    }`}
                    value={editForm.startReading}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        startReading: sanitizeNumericInput(e.target.value, 2, 6),
                      }))
                    }
                  />
                  {isStartReadingExceedsMax && (
                    <p className="text-[10px] font-medium text-rose-600">
                      Reading cannot exceed 999,999.99
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Closing Reading ({unit})
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={9}
                    className={`h-9 w-full rounded-lg border px-3 text-xs font-mono text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400 ${
                      isEndReadingExceedsMax || isReadingLower ? "border-rose-500 text-rose-600" : "border-border"
                    }`}
                    value={editForm.endReading}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        endReading: sanitizeNumericInput(e.target.value, 2, 6),
                      }))
                    }
                  />
                  {isEndReadingExceedsMax ? (
                    <p className="text-[10px] font-medium text-rose-600">
                      Reading cannot exceed 999,999.99
                    </p>
                  ) : isReadingLower ? (
                    <p className="text-[10px] font-medium text-rose-600">
                      Cannot be lower than opening reading ({editForm.startReading})
                    </p>
                  ) : null}
                </div>
              </>
            )}

            {/* Rate Per Unit */}
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Rate (PHP / {unit})
                </label>
              </div>
              <input
                type="text"
                inputMode="decimal"
                maxLength={10}
                className={`h-9 w-full rounded-lg border px-3 text-xs font-mono text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10 focus:border-[#0A1628] dark:focus:ring-slate-400/20 dark:focus:border-slate-400 ${
                  isRateInvalid ? "border-rose-500 text-rose-600" : "border-border"
                }`}
                value={editForm.ratePerUnit}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    ratePerUnit: sanitizeNumericInput(
                      e.target.value,
                      2,
                      utilityType === "electricity" ? 3 : 6,
                    ),
                  }))
                }
              />
              {isRateInvalid && (
                <p className="text-[10px] font-medium text-rose-600">
                  Rate cannot exceed ₱{maxRate.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5 bg-muted/10">
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
              isSaveDisabled && !isSaving
                ? "Complete all required fields with valid values"
                : "Save billing period changes"
            }
          >
            {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{isSaving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
