/**
 * ============================================================================
 * SCHEDULED ROOM TRANSFER MODEL
 * ============================================================================
 *
 * Orchestration record for a room transfer that an admin has scheduled to
 * take effect on a FUTURE business date rather than immediately.
 *
 * WHAT IT IS NOT
 *   - It is not a second transfer engine. When the effective date arrives, a
 *     scheduled job calls the SAME canonical `transferStayWorkflow` that an
 *     immediate transfer uses.
 *   - It is not the Addendum. The Room Transfer Addendum Contract Draft is
 *     prepared at scheduling time (status "generated", isCurrent:false) and
 *     referenced here by `addendumContractId`; it only becomes the tenant's
 *     current Contract when the transfer actually executes.
 *   - It does not mutate the tenant's current Stay / Reservation.roomId /
 *     recurringRentRate / source occupancy / utilities. The ONLY physical
 *     effect of creating one is the destination-capacity HOLD (see below).
 *
 * DESTINATION HOLD
 *   `currentOccupancy` in this codebase already means "committed capacity
 *   slots used" (Reservation.status ∈ {reserved, moveIn}) — a payment-
 *   confirmed but not-yet-moved-in tenant already counts. A scheduled inbound
 *   transfer therefore legitimately consumes one destination slot ahead of
 *   the effective date, exactly like a `reserved` reservation:
 *     - shared destination: the specific `destinationBedId` is set to
 *       status "reserved" + occupiedBy {the tenant's EXISTING reservation},
 *       and `Room.atomicIncreaseOccupancy(destinationRoomId)` is applied.
 *     - private destination: `Room.atomicIncreaseOccupancy` only; no fake bed.
 *   `holdApplied` records whether that hold is currently in place. The nightly
 *   occupancy reconciler (scheduler.js Job 15) and the realtime room-status
 *   sync (roomsController.js) both add open ScheduledRoomTransfer holds
 *   ({scheduled, action_required}) back into a room's derived live occupancy
 *   so the hold is not reconciled away.
 *
 * LIFECYCLE (4 stored states — the UI-facing "Scheduled → Ready for Transfer →
 * Awaiting Settlement → Completed" is DERIVED in scheduledRoomTransferView.js
 * from these + the effective calendar date + the settlement Bill; no extra DB
 * status.)
 *   scheduled       — hold in place, Addendum prepared, waiting for the
 *                     effective date. Becomes "Ready for Transfer" (a
 *                     derived state) once the calendar date is reached; an admin
 *                     then runs the Complete Transfer flow.
 *   executed        — the canonical transferStayWorkflow ran and committed
 *                     (via the admin Complete Transfer flow — NOT the cron).
 *   cancelled       — admin (or the tenant departing) abandoned it pre-cutover;
 *                     hold released, Addendum discarded.
 *   action_required — a Complete Transfer attempt could not safely proceed
 *                     (operational/financial); hold + Addendum retained, admin
 *                     notified. Resolved by fixing the blocker and re-running
 *                     Complete Transfer. NOT auto-executed by the cron.
 *
 * The effective-date cron job (scheduler Job 20) NO LONGER performs the
 * cutover. It only nudges state/reminders so a due transfer surfaces as
 * "Complete transfer →" in the admin Action Needed column.
 *
 * "OPEN" = status ∈ {scheduled, action_required}. Terminal = {executed,
 * cancelled}. A partial-unique index enforces at most one OPEN schedule per
 * reservation.
 * ============================================================================
 */

import mongoose from "mongoose";
import { ROOM_BRANCHES } from "../config/branches.js";
import { isValidOptionalPhysicalMeterReading } from "../utils/physicalMeterReading.js";

export const SCHEDULED_ROOM_TRANSFER_STATUSES = Object.freeze([
  "scheduled",
  "executed",
  "cancelled",
  "action_required",
]);

// The statuses that still consume a destination hold / count as "in flight".
export const OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES = Object.freeze([
  "scheduled",
  "action_required",
]);

const scheduledRoomTransferSchema = new mongoose.Schema(
  {
    // ── Who / where ────────────────────────────────────────────────────────
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: { type: String, enum: ROOM_BRANCHES, required: true },

    // Snapshot of the source at scheduling time (for audit / display — the
    // executor re-reads live state).
    sourceRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    sourceBedId: { type: String, default: null },

    // ── Destination ───────────────────────────────────────────────────────
    destinationRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    // null for a private / capacity-only destination (no bed).
    destinationBedId: { type: String, default: null },
    destinationNeedsBed: { type: Boolean, required: true },

    // ── Timing ────────────────────────────────────────────────────────────
    // The Lilycrest business date the transfer takes effect. Stored as a
    // server-local (Asia/Manila) start-of-day Date, matching the convention
    // used by billingPolicy / rentGenerator / contractRenewalActivation.
    effectiveTransferDate: { type: Date, required: true, index: true },
    // The Asia/Manila guidance time (minutes from midnight) for display,
    // reminders, history, and audit. Completion eligibility is date-only.
    // Default 09:00 for legacy rows that predate this field.
    effectiveTransferTimeMinutes: { type: Number, default: 9 * 60, min: 0, max: 24 * 60 - 1 },

    reason: { type: String, default: "Room transfer", trim: true },

    // ── Schedule history (audit — Admin Room Transfer §1) ─────────────────
    // Append-only. Entry [0] is the original schedule; each reschedule appends
    // one. Never mutated or trimmed. `reason` is present only when the current
    // system captures one (it does — the transfer reason field).
    scheduleHistory: {
      type: [
        new mongoose.Schema(
          {
            previousDate: { type: Date, default: null },
            previousTimeMinutes: { type: Number, default: null },
            newDate: { type: Date, required: true },
            newTimeMinutes: { type: Number, required: true },
            actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            at: { type: Date, default: Date.now },
            reason: { type: String, default: "", trim: true },
            kind: { type: String, enum: ["scheduled", "rescheduled"], default: "rescheduled" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // The prepared Room Transfer Addendum Contract Draft (contractPurpose
    // "amendment", status "generated", isCurrent:false until execution).
    addendumContractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
    },

    // ── Financials ────────────────────────────────────────────────────────
    // computeRoomTransferPreview() output at scheduling time. AUDIT ONLY —
    // never used as charging truth; the executor recomputes from live state.
    previewSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    // The canonical settlement figures computed AT execution. Written by the
    // executor (Phase 2G), null until then.
    executedSettlement: { type: mongoose.Schema.Types.Mixed, default: null },
    settlementRevision: { type: Number, default: 0 },
    sourceStayId: { type: mongoose.Schema.Types.ObjectId, ref: "Stay", default: null },
    settlementBillId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    // Append-only transfer-specific financial review trail. It preserves the
    // paid Bill and records why an admin must coordinate a manual adjustment.
    financialAdjustmentHistory: {
      type: [
        new mongoose.Schema(
          {
            settlementBillId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
            tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", default: null },
            scheduledRoomTransferId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduledRoomTransfer", default: null },
            amountPaid: { type: Number, default: null },
            previousRequiredAmount: { type: Number, default: null },
            recomputedRequiredAmount: { type: Number, default: null },
            difference: { type: Number, default: null },
            reason: { type: String, required: true },
            recordedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // Optional effective-date meter readings an admin may pre-enter so the
    // executor passes them through instead of the latest-DB-reading fallback.
    sourceRoomMeterReading: {
      type: Number,
      default: null,
      validate: { validator: isValidOptionalPhysicalMeterReading, message: "Source meter reading must be finite and non-negative." },
    },
    targetRoomMeterReading: {
      type: Number,
      default: null,
      validate: { validator: isValidOptionalPhysicalMeterReading, message: "Destination meter reading must be finite and non-negative." },
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: SCHEDULED_ROOM_TRANSFER_STATUSES,
      default: "scheduled",
      required: true,
      index: true,
    },
    // Whether the destination-capacity hold is currently in place.
    holdApplied: { type: Boolean, default: false },

    // Short-lived compare-and-set lease used while one admin request owns the
    // cutover. This stays separate from status so the established lifecycle
    // and partial-unique index do not change.
    executionToken: { type: String, default: null, select: false },
    executionStartedAt: { type: Date, default: null },
    executionKind: { type: String, enum: ["completion", "cancellation", "reschedule", null], default: null },

    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    scheduledAt: { type: Date, default: Date.now },
    executedAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },

    // Populated when status flips to action_required.
    lastError: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },

    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Cron due-scan: open schedules whose effective date has arrived.
scheduledRoomTransferSchema.index({ status: 1, effectiveTransferDate: 1 });
// Reservation + status lookups (admin panel, departure auto-cancel, guards).
scheduledRoomTransferSchema.index({ reservationId: 1, status: 1 });
// Destination-room reconciliation lookups (Job 15 / realtime sync).
scheduledRoomTransferSchema.index({ destinationRoomId: 1, status: 1 });
// At most ONE open (scheduled | action_required) transfer per reservation.
scheduledRoomTransferSchema.index(
  { reservationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES] } },
    name: "unique_open_scheduled_transfer_per_reservation",
  },
);

scheduledRoomTransferSchema.methods.isOpen = function isOpen() {
  return OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES.includes(this.status);
};

export default mongoose.model("ScheduledRoomTransfer", scheduledRoomTransferSchema);
