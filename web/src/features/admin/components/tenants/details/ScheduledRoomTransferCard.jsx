import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, LoaderCircle } from "lucide-react";
import { formatDate, formatMoney } from "./tenantDetailConstants";
import { reservationApi } from "../../../../../shared/api/reservationApi";
import { showNotification } from "../../../../../shared/utils/notification";
import getFriendlyError from "../../../../../shared/utils/friendlyError";
import ConfirmModal from "../../../../../shared/components/ConfirmModal";
import {
  minScheduleDateStr,
  timeStrToMinutes,
} from "../../../utils/transferScheduleDate";

// Derived UI status → badge tone. These are the values produced by
// server/services/scheduledRoomTransferView.js `deriveScheduledTransferUserStatus`.
const STATUS_TONE = {
  scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  ready_for_transfer:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  awaiting_settlement:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  action_required:
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const REVIEW_GUIDANCE = {
  TRANSFER_BALANCE_UNPAID: "Settle the transfer balance, then complete the transfer.",
  TRANSFER_SETTLEMENT_UNPAID: "Settle the transfer balance, then complete the transfer.",
  ADDITIONAL_BALANCE_DUE:
    "An additional balance is required. Settle the updated Bill, then complete the transfer.",
  FINANCIAL_ADJUSTMENT_REQUIRED:
    "Payment adjustment or refund requires manual processing. Please coordinate with the Administration Office on the 2nd Floor.",
  PAID_TRANSFER_CANNOT_COMPLETE:
    "This paid transfer requires manual financial resolution. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing.",
  DESTINATION_UNAVAILABLE:
    "The destination room/bed is no longer available for this tenant's stay. Reschedule or pick another room.",
  ADDENDUM_EFFECTIVE_DATE_LOCKED:
    "The Addendum was already acknowledged for the originally scheduled date. Reschedule the transfer to re-issue it for the actual date, then complete.",
  METER_READING_REQUIRED: "Enter the source room's closing electricity reading to continue.",
  DEST_METER_READING_REQUIRED:
    "Enter the destination room's current electricity reading to continue.",
  TRANSFER_NOT_YET_DUE: "The scheduled transfer date has not been reached yet. Reschedule it to complete earlier.",
};

const Row = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-xs font-medium text-foreground text-right">{value}</span>
  </div>
);

const fieldCls =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-foreground";

/**
 * Admin — one concise card for a scheduled room transfer.
 *
 * Scheduling only places a destination hold. The tenant's CURRENT room/rent
 * elsewhere in this modal stay the SOURCE values until the admin completes the
 * transfer on the scheduled date. This card:
 *   - describes what is scheduled and its schedule-change history,
 *   - offers Reschedule (date + time, same destination) while still open,
 *   - offers Complete Transfer once the date/time is reached — a compact modal
 *     that collects the boundary meter readings and calls the completion API
 *     (200 executed / 202 awaiting settlement / 409 settlement unpaid),
 *   - offers Cancel in safe states.
 */
export default function ScheduledRoomTransferCard({ transfer, onOpenDigitalContract }) {
  const queryClient = useQueryClient();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!transfer) return null;
  const {
    reservationId, currentRoom, scheduledRoom, effectiveTransferDate,
    effectiveTransferTimeLabel, currentMonthlyRent, newMonthlyRent, statusLabel,
    status, transferBalance, addendum, actionRequiredReason, actionRequiredMessage,
    destinationBed, scheduledAt, createdAt, initiatedBy, addendumContractId,
    scheduleHistory = [], completable,
  } = transfer;

  const openAddendum = () => {
    if (!onOpenDigitalContract || !addendumContractId) return;
    onOpenDigitalContract({
      _id: addendumContractId,
      id: addendumContractId,
      contractNumber: addendum?.contractNumber,
      contractPurpose: "amendment",
    });
  };

  const bal = transferBalance || {};
  const hasBalance = bal.hasBill && Number(bal.amountDue) > 0;
  const hasPayment = Number(bal.amountPaid || 0) > 0;
  const reasonCode = String(actionRequiredReason || "");
  const isOpenRecord = !["completed", "cancelled"].includes(status);
  const canCancel = isOpenRecord && !hasPayment;
  const canReschedule = isOpenRecord;
  const canComplete = !!completable;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tenant-workspace-detail"] });
    queryClient.invalidateQueries({ queryKey: ["billing"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
    queryClient.invalidateQueries({ queryKey: ["utilities"] });
  };

  const runCancel = async () => {
    setConfirmCancelOpen(false);
    setBusy(true);
    try {
      const res = await reservationApi.cancelScheduledRoomTransfer(reservationId);
      if (res?.outcome === "cancelled") {
        showNotification(
          "Scheduled room transfer cancelled. The tenant remains in the current room.",
          "success",
        );
      } else {
        showNotification(
          "Payment adjustment or refund requires manual processing. Please coordinate with the Administration Office on the 2nd Floor.",
          "warning",
        );
      }
      refresh();
    } catch (err) {
      showNotification(getFriendlyError(err) || "Failed to cancel the scheduled transfer.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-sky-200/70 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
          <ArrowRightLeft className="w-3.5 h-3.5 text-sky-500" />
          Scheduled Room Transfer
        </h4>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[status] || STATUS_TONE.completed}`}>
          {statusLabel || status}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <div>
          <Row label="Current Room" value={currentRoom?.name || "—"} />
          <Row label="Scheduled Room" value={scheduledRoom?.name || "—"} />
          {scheduledRoom?.needsBed && (
            <Row label="Destination Bed" value={destinationBed || "—"} />
          )}
          <Row
            label="Effective Date & Time"
            value={`${formatDate(effectiveTransferDate)}${effectiveTransferTimeLabel ? ` · ${effectiveTransferTimeLabel}` : ""}`}
          />
        </div>
        <div>
          <Row label="Current Monthly Rent" value={formatMoney(currentMonthlyRent ?? 0)} />
          <Row label="New Monthly Rent" value={formatMoney(newMonthlyRent ?? 0)} />
          <Row label="Scheduled" value={formatDate(scheduledAt || createdAt)} />
          <Row label="Initiated By" value={initiatedBy?.name || "System"} />
        </div>
      </div>

      <div className="border-t border-sky-200/60 dark:border-sky-900/40 pt-2">
        {hasBalance ? (
          <>
            <Row label="Transfer Balance" value={formatMoney(bal.amountDue)} />
            <Row label="Paid" value={formatMoney(bal.amountPaid || 0)} />
            <Row label="Remaining" value={formatMoney(bal.remaining ?? bal.amountDue)} />
            <Row label="Due" value={formatDate(bal.dueDate || effectiveTransferDate)} />
          </>
        ) : (
          <Row label="Transfer Balance" value="Calculated at Complete Transfer" />
        )}
      </div>

      {status === "ready_for_transfer" ? (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
          The scheduled date/time has been reached. Use <strong>Complete Transfer</strong> to enter
          meter readings, settle, and cut over.
        </p>
      ) : status === "awaiting_settlement" ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          The transfer settlement must be paid in full before the transfer can complete.
        </p>
      ) : status === "action_required" ? (
        <p className="text-[11px] text-rose-700 dark:text-rose-400">
          {REVIEW_GUIDANCE[reasonCode] || actionRequiredMessage || "This scheduled transfer needs review."}
        </p>
      ) : null}

      {scheduleHistory.length > 1 && (
        <div className="text-[11px] text-muted-foreground border-t border-sky-200/60 dark:border-sky-900/40 pt-2">
          <p className="font-semibold text-foreground mb-1">Schedule history</p>
          <ul className="space-y-0.5">
            {scheduleHistory.map((h, i) => (
              <li key={i}>
                {h.kind === "scheduled" ? "Scheduled" : "Rescheduled"} for{" "}
                {formatDate(h.newDate)}
                {typeof h.newTimeMinutes === "number"
                  ? ` · ${String(Math.floor(h.newTimeMinutes / 60)).padStart(2, "0")}:${String(h.newTimeMinutes % 60).padStart(2, "0")}`
                  : ""}
                {h.previousDate
                  ? ` (was ${formatDate(h.previousDate)}${typeof h.previousTimeMinutes === "number" ? ` · ${String(Math.floor(h.previousTimeMinutes / 60)).padStart(2, "0")}:${String(h.previousTimeMinutes % 60).padStart(2, "0")}` : ""})`
                  : ""}
                {h.at ? ` — ${formatDate(h.at)}` : ""}
                {h.reason ? ` — ${h.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <p>Utilities: boundary meter readings are entered at Complete Transfer; the final charges follow the normal period close.</p>
        <p className="flex items-center gap-1.5">
          <span>Document: {addendum?.label || "Room Transfer Addendum — Scheduled"}</span>
          {addendumContractId && onOpenDigitalContract && (
            <button
              type="button"
              onClick={openAddendum}
              className="font-semibold text-sky-700 dark:text-sky-300 hover:underline"
            >
              View Addendum
            </button>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {canComplete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCompleteOpen(true)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : null}
            Complete Transfer
          </button>
        ) : null}
        {canReschedule ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setRescheduleOpen(true)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50"
          >
            Reschedule
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmCancelOpen(true)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel Scheduled Transfer
          </button>
        ) : null}
      </div>

      <ConfirmModal
        isOpen={confirmCancelOpen}
        title="Cancel this scheduled room transfer?"
        message={
          hasPayment
            ? "A payment has already been received for this transfer. It cannot be cancelled automatically. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing."
            : "The tenant will remain in the current room and the reserved destination will be released."
        }
        confirmText="Cancel Transfer"
        cancelText="Keep Scheduled"
        variant={hasPayment ? "warning" : "info"}
        loading={busy}
        onConfirm={runCancel}
        onClose={() => setConfirmCancelOpen(false)}
      />

      {rescheduleOpen ? (
        <RescheduleDialog
          transfer={transfer}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => {
            setRescheduleOpen(false);
            refresh();
          }}
        />
      ) : null}

      {completeOpen ? (
        <CompleteTransferDialog
          transfer={transfer}
          onClose={() => setCompleteOpen(false)}
          onDone={() => {
            setCompleteOpen(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Reschedule — date + time only, on the SAME destination. Same-day or any
   future date is allowed (only a past date is rejected). The backend
   revalidates the destination hold and appends to the schedule history.
   ───────────────────────────────────────────────────────────────────────────── */
function RescheduleDialog({ transfer, onClose, onDone }) {
  const [date, setDate] = useState(transfer.effectiveTransferDate?.slice(0, 10) || minScheduleDateStr());
  const [time, setTime] = useState(transfer.effectiveTransferTimeLabel || "09:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date || date < minScheduleDateStr()) {
      showNotification("Pick a new effective date of today or later.", "warning");
      return;
    }
    const mins = timeStrToMinutes(time);
    if (mins == null) {
      showNotification("Enter a valid transfer time (HH:mm).", "warning");
      return;
    }
    setBusy(true);
    try {
      await reservationApi.rescheduleRoomTransfer(transfer.reservationId, {
        effectiveTransferDate: date,
        effectiveTransferTimeMinutes: mins,
        reason: reason.trim() || undefined,
      });
      showNotification("Scheduled room transfer updated.", "success");
      onDone();
    } catch (err) {
      showNotification(getFriendlyError(err) || "Failed to reschedule the transfer.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-sm w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-foreground">Reschedule Room Transfer</h3>
        <p className="text-[11px] text-muted-foreground">
          Same destination room ({transfer.scheduledRoom?.name || "—"}). Same-day or any future date
          is allowed. Availability is re-checked on save.
        </p>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">New Effective Date</span>
          <input
            type="date"
            className={fieldCls}
            value={date}
            min={minScheduleDateStr()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">New Transfer Time</span>
          <input type="time" className={fieldCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Reason (optional)</span>
          <input
            type="text"
            className={fieldCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. tenant requested a later date"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-1"
            onClick={submit}
            disabled={busy}
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Complete Transfer — enter the boundary meter readings, then submit. Meter
   inputs are shown ONLY when the server-authoritative preview says electricity
   is sub-metered for that room (never a confusing optional empty field on a
   fixed-rate branch). The backend computes the settlement, blocks on an unpaid
   transfer settlement (202 awaiting_settlement / 409), and otherwise runs the
   atomic cutover. Internal reconciliation machinery is never surfaced here.
   ───────────────────────────────────────────────────────────────────────────── */
function CompleteTransferDialog({ transfer, onClose, onDone }) {
  const [sourceWater,setSourceWater] = useState("");
  const [targetWater,setTargetWater] = useState("");
  const [sourceReading, setSourceReading] = useState("");
  const [targetReading, setTargetReading] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [verifiedDepositHeld, setVerifiedDepositHeld] = useState("");
  const [depositVerificationSource, setDepositVerificationSource] = useState("");
  const [depositVerificationReason, setDepositVerificationReason] = useState("");
  const [depositVerificationConfirmed, setDepositVerificationConfirmed] = useState(false);

  // Server-authoritative electricity applicability (audit item 4). Branch rules
  // are NOT duplicated here — we render from these flags.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const res = await reservationApi.getRoomTransferPreview(transfer.reservationId, {
          targetRoomId: transfer.scheduledRoom?.id || undefined,
          effectiveTransferDate: transfer.effectiveTransferDate || undefined,
        });
        const p = res?.data?.transferPreview ?? res?.transferPreview ?? null;
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transfer.reservationId, transfer.scheduledRoom?.id, transfer.effectiveTransferDate]);

  // Default: if the preview can't be resolved, fall back to showing both inputs
  // (backend still enforces METER_READING_REQUIRED / DEST_METER_READING_REQUIRED).
  const sourceSubMetered = preview ? !!preview.electricity?.subMetered : true;
  const destSubMetered = preview ? !!preview.destinationElectricity?.subMetered : true;
  const anyMeterInput = sourceSubMetered || destSubMetered;
  const sourcePreviousReading = preview?.electricity?.previousReading ?? null;
  const destCurrentReading = preview?.destinationElectricity?.currentReading ?? null;
  const needsDepositVerification = preview?.deposit?.heldKnown === false;

  const submit = async () => {
    const body = { notes: notes.trim() || undefined };
    for (const [required,value,field,label,baseline] of [[preview?.water?.required,sourceWater,'sourceWaterReading','source',preview?.water?.previousReading],[preview?.destinationWater?.required,targetWater,'targetWaterReading','destination',preview?.destinationWater?.previousReading]]) {
      if (!required) continue;
      if (value === '' || !Number.isFinite(Number(value)) || Number(value)<0) {
        showNotification(`Enter a valid ${label} water reading (m³).`,'warning'); return;
      }
      if (baseline != null && Number(value) < Number(baseline)) {
        showNotification(`The ${label} water reading cannot be lower than the latest recorded reading (${baseline} m³).`,'warning'); return;
      }
      body[field]=Number(value);
    }
    if (sourceSubMetered && sourceReading !== "") {
      if (!Number.isFinite(Number(sourceReading)) || Number(sourceReading) < 0) {
        showNotification("The source room reading must be a finite, non-negative number.", "warning");
        return;
      }
      body.sourceRoomMeterReading = Number(sourceReading);
    }
    if (destSubMetered && targetReading !== "") {
      if (!Number.isFinite(Number(targetReading)) || Number(targetReading) < 0) {
        showNotification("The destination room reading must be a finite, non-negative number.", "warning");
        return;
      }
      body.targetRoomMeterReading = Number(targetReading);
    }
    if (sourceSubMetered && sourceReading === "") {
      showNotification("Enter the source room's closing electricity reading.", "warning");
      return;
    }
    if (destSubMetered && targetReading === "") {
      showNotification("Enter the destination room's current electricity reading.", "warning");
      return;
    }
    if (needsDepositVerification) {
      if (verifiedDepositHeld === "" || Number.isNaN(Number(verifiedDepositHeld)) || Number(verifiedDepositHeld) < 0) {
        showNotification("Enter the verified security deposit currently held.", "warning");
        return;
      }
      if (!depositVerificationConfirmed || depositVerificationSource.trim().length < 3 || depositVerificationReason.trim().length < 3) {
        showNotification("Confirm the records review and enter its source and reason.", "warning");
        return;
      }
      body.depositHeldOverride = Number(verifiedDepositHeld);
      body.depositHeldVerificationConfirmed = true;
      body.depositVerificationSource = depositVerificationSource.trim();
      body.depositVerificationReason = depositVerificationReason.trim();
    }
    setBusy(true);
    try {
      const res = await reservationApi.completeRoomTransfer(transfer.reservationId, body);
      const outcome = res?.outcome || res?.data?.outcome;
      if (outcome === "executed") {
        showNotification("Room transfer completed.", "success");
        onDone();
        return;
      }
      // 202 awaiting_settlement (or any non-executed outcome) — keep the dialog
      // open with guidance to settle in Billing.
      setResult({
        outcome: outcome || "awaiting_settlement",
        reason: res?.reason || res?.code || res?.data?.reason,
        bill: res?.bill || res?.data?.bill || null,
      });
      showNotification(
        "The transfer settlement is not yet paid in full. Settle it in Billing, then complete the transfer.",
        "warning",
      );
    } catch (err) {
      const code = err?.body?.code || err?.code;
      if (code === "TRANSFER_SETTLEMENT_UNPAID") {
        setResult({ outcome: "awaiting_settlement", reason: code, bill: err?.body?.bill || null });
        showNotification(
          "The transfer settlement must be paid in full first. Settle it in Billing, then complete the transfer.",
          "warning",
        );
      } else {
        showNotification(getFriendlyError(err) || "Failed to complete the transfer.", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-foreground">Complete Room Transfer</h3>
        <div className="space-y-1">
          <Row label="From" value={transfer.currentRoom?.name || "—"} />
          <Row label="To" value={transfer.scheduledRoom?.name || "—"} />
          <Row
            label="Scheduled"
            value={`${formatDate(transfer.effectiveTransferDate)}${transfer.effectiveTransferTimeLabel ? ` · ${transfer.effectiveTransferTimeLabel}` : ""}`}
          />
        </div>

        {previewLoading ? (
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <LoaderCircle size={12} className="animate-spin" /> Checking meter requirements…
          </p>
        ) : anyMeterInput ? (
          <p className="text-[11px] text-muted-foreground">
            Enter the required meter readings taken now, at the real cutover. Water charges
            are calculated when the water billing period closes.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            This branch bills electricity at a fixed rate — no meter reading is needed. The rent and
            deposit settlement is calculated on submit; water follows the normal end-of-cycle
            billing.
          </p>
        )}

        {[[preview?.water,sourceWater,setSourceWater,'Source'],[preview?.destinationWater,targetWater,setTargetWater,'Destination']].map(([baseline,value,setValue,label])=>baseline?.required ? (
          <div key={label} className="space-y-1">
            <label htmlFor={`transfer-${label}-water`} className="text-[11px] text-muted-foreground">
              {label} Water Reading *
            </label>
            <div className="flex items-center gap-2">
              <input id={`transfer-${label}-water`} type="number" min={baseline.previousReading ?? 0} step="0.01" inputMode="decimal"
                value={value} onChange={e=>setValue(e.target.value)} disabled={busy} className={fieldCls} required />
              <span className="text-[11px] text-muted-foreground">m³</span>
              {baseline.previousReading != null ? <button type="button" disabled={busy}
                aria-label={`Use ${label.toLowerCase()} water baseline`} title="Click to auto-fill previous reading baseline"
                onClick={()=>setValue(String(baseline.previousReading))}
                className="text-muted-foreground hover:text-foreground text-sm px-1">ⓘ</button> : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {baseline.previousReading != null ? <>Latest recorded: {Number(baseline.previousReading).toFixed(2)} m³
                {baseline.lastRecordedReadingDate ? ` · ${formatDate(baseline.lastRecordedReadingDate)}` : ''}</> : 'No previous water observation recorded.'}
            </p>
          </div>
        ) : null)}
        {sourceSubMetered ? (
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">
              Source room (OLD) closing electricity reading
              {sourcePreviousReading != null ? ` — previous: ${sourcePreviousReading}` : ""}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={fieldCls}
              value={sourceReading}
              onChange={(e) => setSourceReading(e.target.value)}
              placeholder="Meter reading now, in the OLD room"
            />
          </div>
        ) : null}
        {destSubMetered ? (
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">
              Destination room (NEW) current electricity reading
              {destCurrentReading != null ? ` — recorded: ${destCurrentReading}` : ""}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={fieldCls}
              value={targetReading}
              onChange={(e) => setTargetReading(e.target.value)}
              placeholder="Meter reading now, in the NEW room"
            />
          </div>
        ) : null}

        {needsDepositVerification ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 space-y-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Security deposit held has not been verified. Completion remains blocked until you verify the cash held against payment/deposit records.
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium">Verified Security Deposit Currently Held (₱)</span>
              <input type="number" min="0" inputMode="decimal" className={fieldCls} value={verifiedDepositHeld} onChange={(e) => setVerifiedDepositHeld(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium">Payment/deposit record source</span>
              <input type="text" className={fieldCls} value={depositVerificationSource} onChange={(e) => setDepositVerificationSource(e.target.value)} placeholder="e.g. paid initial Bill and receipt IDs" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium">Verification reason / notes</span>
              <input type="text" className={fieldCls} value={depositVerificationReason} onChange={(e) => setDepositVerificationReason(e.target.value)} />
            </label>
            <label className="flex items-start gap-2 text-[11px] font-medium">
              <input type="checkbox" checked={depositVerificationConfirmed} onChange={(e) => setDepositVerificationConfirmed(e.target.checked)} />
              <span>I verified this amount against the tenant&apos;s payment/deposit records.</span>
            </label>
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Notes (optional)</span>
          <input
            type="text"
            className={fieldCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {result?.outcome === "awaiting_settlement" ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
            The transfer settlement
            {result.bill?.totalAmount != null
              ? ` of ${formatMoney(result.bill.totalAmount)}`
              : ""}{" "}
            must be paid in full before the transfer can complete. Settle it from the
            Billing tab, then re-open this dialog.
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
            onClick={submit}
            disabled={busy || previewLoading}
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : null}
            Complete Transfer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
