import { hasActiveTransferClaim, availableTransferClaimFilter } from "./roomTransferClaim.js";
/**
 * ============================================================================
 * SCHEDULED ROOM TRANSFER — EFFECTIVE-DATE STATE NUDGER + CANCELLATION
 * ============================================================================
 *
 * The effective-date cron job (scheduler Job 20) NO LONGER performs the
 * physical cutover. The cutover is admin-driven — `completeRoomTransfer` in
 * scheduledRoomTransferService.js (meter reading → settlement → settle →
 * `transferStayWorkflow`). An admin runs it from the Tenants workspace once
 * the scheduled calendar date is reached; the stored time remains guidance.
 *
 * What Job 20 does now (`nudgeDueScheduledRoomTransfers`):
 *   - for each OPEN `scheduled` record whose Manila effective calendar date has
 *     been reached, send a ONE-TIME "ready to complete" reminder to branch
 *     admins (deduped). It changes NO state and NEVER calls
 *     `transferStayWorkflow`. Whether a transfer shows as "Complete transfer
 *     →" in the admin Action Needed column is derived from the date, not
 *     from a status flip.
 *
 * This module also still owns:
 *   - `cancelScheduledRoomTransfer` — safe pre-cutover cancellation (no
 *     payment) / action_required PAYMENT_ALREADY_RECEIVED (payment present).
 *   - `resolveScheduledTransferBeforeTenantDeparture` — the move-out /
 *     termination hook so a future room hold is never left blocking a room.
 *   - `retryScheduledRoomTransfer` — a thin admin re-attempt that delegates to
 *     `completeRoomTransfer`.
 * ============================================================================
 */

import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import {
  ScheduledRoomTransfer,
  Contract,
  ContractAcknowledgement,
  Bill,
} from "../models/index.js";
import { toManilaStartOfDay, getManilaToday } from "../utils/dateUtils.js";
import { notify, notifyBranchAdmins } from "./notifications/notificationService.js";

// The scheduled-transfer service is imported lazily inside the functions below
// to avoid an ESM circular-init hazard: scheduler.js -> this module ->
// scheduledRoomTransferService -> tenantActionService -> billingPolicy, while
// scheduler.js's own test harness is still linking billingPolicy.
const lazy = {
  async schedSvc() {
    return import("./scheduledRoomTransferService.js");
  },
};

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

// A stable pseudo-actor id for scheduler-driven mutations (Contract
// updatedBy/createdBy, ledger createdBy). Not a real User — audit trails
// record "System (Scheduled Transfer)".
const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId("000000000000000000000020");

// Machine reasons stored on lastError (also the user-facing distinction).
export const SCHEDULED_TRANSFER_ACTION_REASONS = Object.freeze({
  TRANSFER_BALANCE_UNPAID: "TRANSFER_BALANCE_UNPAID",
  ADDITIONAL_BALANCE_DUE: "ADDITIONAL_BALANCE_DUE",
  FINANCIAL_ADJUSTMENT_REQUIRED: "FINANCIAL_ADJUSTMENT_REQUIRED",
  OPERATIONAL_VALIDATION_FAILED: "OPERATIONAL_VALIDATION_FAILED",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  // Set by cancellation / tenant-departure when the balance Bill already
  // carries a real payment — nothing financial is reversed automatically.
  PAYMENT_ALREADY_RECEIVED: "PAYMENT_ALREADY_RECEIVED",
});

/**
 * Is `effectiveTransferDate` due as of `now` (Manila business date)?
 * Due when the Manila calendar date of `effectiveTransferDate` is today or
 * earlier — i.e. `< toManilaStartOfDay(now).add(1, "day")`, the same cutoff
 * convention `activateDueRenewalContracts` uses.
 */
export function isScheduledTransferDue(effectiveTransferDate, now = new Date()) {
  const eff = toManilaStartOfDay(effectiveTransferDate);
  if (!eff) return false;
  return eff.isBefore(getManilaToday(now).add(1, "day"), "day") || eff.isSame(getManilaToday(now), "day");
}

/**
 * Job 20 (scheduler.js) — one-time "ready to complete" reminder for OPEN
 * scheduled transfers whose Manila effective calendar date has been reached.
 * Changes NO state. Never performs the cutover. The admin completes the
 * transfer from the Tenants workspace via `completeRoomTransfer`.
 */
export async function nudgeDueScheduledRoomTransfers({ now = new Date() } = {}) {
  const report = { scanned: 0, nudged: 0, skipped: 0, errors: 0, records: [] };
  const cutoff = getManilaToday(now).add(1, "day").toDate();

  const due = await ScheduledRoomTransfer.find({
    status: "scheduled",
    isArchived: { $ne: true },
    effectiveTransferDate: { $lt: cutoff },
  })
    .select("_id branch reservationId effectiveTransferDate effectiveTransferTimeMinutes readyReminderSentAt")
    .lean();

  report.scanned = due.length;

  for (const doc of due) {
    try {
      // Only remind once the DATE+TIME has actually been reached.
      const { composeManilaDateTime, isManilaDateTimeReached } = await import("../utils/dateUtils.js");
      const cutoverAt = composeManilaDateTime(doc.effectiveTransferDate, doc.effectiveTransferTimeMinutes ?? 9 * 60);
      if (!isManilaDateTimeReached(cutoverAt, now)) {
        report.skipped += 1;
        continue;
      }
      try {
        await notifyBranchAdmins(
          doc.branch,
          "general",
          "Room Transfer Ready to Complete",
          `A scheduled room transfer reached its effective date and is ready to complete. ` +
            `Open the tenant in the Tenants workspace and run "Complete transfer".`,
          {
            entityType: "reservation",
            entityId: String(doc.reservationId),
            actionUrl: "/admin/tenants",
            // One reminder per due transfer.
            dedupeKey: `scheduled_transfer_ready:${String(doc._id)}`,
          },
        );
      } catch (e) {
        logger.warn({ err: e, scheduledTransferId: String(doc._id) }, "[nudgeDueScheduledRoomTransfers] admin notify failed (non-fatal)");
      }
      report.nudged += 1;
      report.records.push({ scheduledTransferId: String(doc._id), outcome: "nudged" });
    } catch (e) {
      report.errors += 1;
      report.records.push({ scheduledTransferId: String(doc._id), outcome: "error", error: e.message });
      logger.error({ err: e, scheduledTransferId: String(doc._id) }, "[nudgeDueScheduledRoomTransfers] record failed");
    }
  }

  if (report.nudged || report.errors) {
    logger.info(report, "[nudgeDueScheduledRoomTransfers] pass complete");
  }
  return report;
}

/**
 * Back-compat alias — scheduler.js Job 20 historically imported
 * `executeDueScheduledRoomTransfers`. It now only nudges; it never cuts over.
 */
export const executeDueScheduledRoomTransfers = nudgeDueScheduledRoomTransfers;

/**
 * Admin retry for an `action_required` (or still-`scheduled`) record. Thin
 * wrapper over the admin-driven `completeRoomTransfer` — re-runs every gate
 * (operational validation, destination availability, settlement payment).
 * Never bypasses a gate; never duplicates artifacts.
 *
 * `payload` may carry `sourceRoomMeterReading` / `targetRoomMeterReading`
 * (the admin re-supplies them on retry). Without them, a sub-metered source
 * still requires the closing reading and the call returns METER_READING_REQUIRED.
 */
export async function retryScheduledRoomTransfer(scheduledTransferId, { actorId = null, payload = {} } = {}) {
  const sched = await ScheduledRoomTransfer.findById(scheduledTransferId).select("reservationId status").lean();
  if (!sched) return { outcome: "skipped", reason: "not_found" };
  if (sched.status === "executed") return { outcome: "executed", reason: "already_executed" };
  if (sched.status === "cancelled") return { outcome: "skipped", reason: "cancelled" };

  const { completeRoomTransfer } = await lazy.schedSvc();
  try {
    const res = await completeRoomTransfer({
      reservationId: String(sched.reservationId),
      payload,
      actorId,
    });
    return res;
  } catch (e) {
    return { outcome: "action_required", reason: e.code || "EXECUTION_FAILED", message: e.message };
  }
}

// ── CANCELLATION ─────────────────────────────────────────────────────────────

export const SCHEDULED_TRANSFER_CANCEL_REASONS = Object.freeze({
  PAYMENT_ALREADY_RECEIVED: "PAYMENT_ALREADY_RECEIVED",
  TRANSFER_ALREADY_COMPLETED: "TRANSFER_ALREADY_COMPLETED",
  ADDENDUM_ACKNOWLEDGED: "ROOM_TRANSFER_ADDENDUM_ACKNOWLEDGED",
  NOT_CANCELLABLE: "NOT_CANCELLABLE",
});

/**
 * Release the destination-capacity hold in its own tiny transaction.
 * Idempotent — no-ops when `holdApplied` is already false, and
 * `releaseScheduledTransferHold` only frees a bed still "reserved" for THIS
 * reservation.
 */
async function releaseHoldInOwnTxn(sched, executionToken = null) {
  if (!sched.holdApplied) return;
  const { releaseScheduledTransferHold } = await lazy.schedSvc();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await releaseScheduledTransferHold({
        session,
        scheduledTransferId: sched._id,
        executionToken,
        sourceRoomId: sched.sourceRoomId,
        destinationRoomId: sched.destinationRoomId,
        destinationBedId: sched.destinationBedId,
        destinationNeedsBed: sched.destinationNeedsBed,
        reservationId: sched.reservationId,
      });
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Resolve how much real money has been received against a scheduled
 * transfer's balance Bill (0 when there is no Bill).
 */
async function paidAmountOnBalanceBill(sched) {
  if (!sched.settlementBillId) return 0;
  const bill = await Bill.findById(sched.settlementBillId).select("paidAmount status").lean();
  if (!bill || bill.status === "voided") return 0;
  return round(Number(bill.paidAmount || 0));
}

/**
 * Void the UNPAID balance Bill using the canonical Bill lifecycle status
 * (`voided`, remainingAmount 0). NEVER deletes the Bill. No-op when there is
 * no Bill or it already carries a payment (caller must have gated on that).
 */
async function voidUnpaidBalanceBill(sched, { session } = {}) {
  if (!sched.settlementBillId) return { voided: false };
  const q = Bill.findById(sched.settlementBillId);
  const bill = await (session ? q.session(session) : q);
  if (!bill) return { voided: false };
  if (bill.status === "voided") return { voided: true, already: true };
  if (Number(bill.paidAmount || 0) > 0) return { voided: false, hasPayment: true };
  bill.status = "voided";
  bill.remainingAmount = 0;
  bill.notes = `${bill.notes || ""} | Voided — scheduled room transfer cancelled before cutover.`;
  if (session) await bill.save({ session });
  else await bill.save();
  return { voided: true };
}

/**
 * Cancel the prepared Room Transfer Addendum (generated / not-yet-current
 * Draft -> "cancelled" via transitionContract — the same abandoned state
 * `discardRoomTransferAddendum` uses). Never deletes the document/history;
 * it just can never become current. Idempotent.
 */
async function cancelPreparedAddendum(sched, actorId, session = null) {
  if (!sched.addendumContractId) return { cancelled: false };
  const c = await Contract.findById(sched.addendumContractId).session(session);
  if (!c) return { cancelled: false };
  if (c.isCurrent === true) return { cancelled: false, isCurrent: true };
  const ABANDONED = new Set(["cancelled", "voided", "rejected", "archived"]);
  if (ABANDONED.has(c.status)) return { cancelled: true, already: true };
  const { transitionContract } = await import("./contractService.js");
  try {
    await transitionContract(c, "cancelled", actorId, "Room Transfer Addendum cancelled — scheduled transfer cancelled before cutover", session);
  } catch (e) {
    logger.warn({ err: e, contractId: String(c._id) }, "[scheduledTransferExecutor] addendum cancel transition failed (non-fatal)");
    throw e;
  }
  return { cancelled: true };
}

/**
 * Safe automatic cancellation of a NOT-yet-executed scheduled transfer.
 *
 * CANONICAL RULE: automatic cancellation is allowed ONLY when
 * `paidAmount === 0` on the balance Bill (or there is no Bill). If ANY real
 * money was received, nothing financial is reversed — the record goes to
 * `action_required` PAYMENT_ALREADY_RECEIVED and an admin coordinates the
 * settlement with the Administration Office.
 *
 * Safe path (no money): release the destination hold (idempotent, once),
 * cancel the prepared Addendum, void the unpaid Bill (canonical `voided`
 * status, never deleted), status -> `cancelled` + cancelledBy/At.
 * Everything about the source tenancy is untouched.
 *
 * @param {string|ObjectId} scheduledTransferId
 * @param {Object} [opts]
 * @param {ObjectId|null} [opts.actorId]
 * @param {boolean} [opts.system] — a lifecycle-driven call (tenant departure)
 *   rather than an explicit admin click; only affects notification wording.
 * @returns {{ outcome: "cancelled"|"action_required"|"skipped", reason?: string }}
 */
export async function cancelScheduledRoomTransfer(scheduledTransferId, { actorId = null, system = false } = {}) {
  let sched = await ScheduledRoomTransfer.findById(scheduledTransferId).select("+executionToken");
  if (!sched) return { outcome: "skipped", reason: "not_found" };

  if (sched.status === "executed") {
    return { outcome: "skipped", reason: SCHEDULED_TRANSFER_CANCEL_REASONS.TRANSFER_ALREADY_COMPLETED };
  }
  if (sched.status === "cancelled") {
    return { outcome: "skipped", reason: "already_cancelled" };
  }
  if (hasActiveTransferClaim(sched)) {
    return { outcome: "skipped", reason: SCHEDULED_TRANSFER_CANCEL_REASONS.NOT_CANCELLABLE };
  }
  // Defence-in-depth: if the Addendum has somehow already become current, the
  // transfer effectively occurred — do not "cancel" it here.
  if (sched.addendumContractId) {
    const addendum = await Contract.findById(sched.addendumContractId)
      .select("isCurrent status tenantSignatureStatus")
      .lean();
    if (addendum?.isCurrent) {
      return { outcome: "skipped", reason: SCHEDULED_TRANSFER_CANCEL_REASONS.TRANSFER_ALREADY_COMPLETED };
    }
    const acknowledged = Boolean(await ContractAcknowledgement.exists({
      contractId: sched.addendumContractId,
    }));
    if (
      acknowledged ||
      addendum?.tenantSignatureStatus === "completed" ||
      ["signed", "awaiting_notarization", "notarized", "ready_for_publication", "published", "active"].includes(addendum?.status)
    ) {
      return { outcome: "skipped", reason: SCHEDULED_TRANSFER_CANCEL_REASONS.ADDENDUM_ACKNOWLEDGED };
    }
  }

  const cancellationToken = new mongoose.Types.ObjectId().toString();
  const claimed = await ScheduledRoomTransfer.findOneAndUpdate(
    {
      _id: sched._id,
      status: { $in: ["scheduled", "action_required"] },
      ...availableTransferClaimFilter(),
    },
    { $set: { executionToken: cancellationToken, executionKind: "cancellation", executionStartedAt: new Date() } },
    { new: true },
  ).select("+executionToken");
  if (!claimed) {
    return { outcome: "skipped", reason: SCHEDULED_TRANSFER_CANCEL_REASONS.NOT_CANCELLABLE };
  }
  sched = claimed;

  const paid = await paidAmountOnBalanceBill(sched);

  // ── ANY money received -> manual settlement, NO financial reversal ──────────
  if (paid > 0) {
    const paidBill = sched.settlementBillId
      ? await Bill.findById(sched.settlementBillId).select("totalAmount paidAmount userId reservationId").lean()
      : null;
    const now = new Date();
    const doc = await ScheduledRoomTransfer.findOneAndUpdate(
      { _id: sched._id, status: { $ne: "cancelled" }, executionToken: cancellationToken },
      {
        $set: {
          status: "action_required",
          lastError: SCHEDULED_TRANSFER_ACTION_REASONS.PAYMENT_ALREADY_RECEIVED,
          lastAttemptAt: now,
          executionToken: system ? cancellationToken : null,
          executionStartedAt: system ? sched.executionStartedAt : null,
        },
        $push: {
          financialAdjustmentHistory: {
            settlementBillId: paidBill?._id || sched.settlementBillId || null,
            tenantId: sched.tenantId || paidBill?.userId || null,
            reservationId: sched.reservationId || paidBill?.reservationId || null,
            scheduledRoomTransferId: sched._id,
            amountPaid: paid,
            previousRequiredAmount: paidBill?.totalAmount ?? null,
            recomputedRequiredAmount: null,
            difference: null,
            reason: SCHEDULED_TRANSFER_ACTION_REASONS.PAYMENT_ALREADY_RECEIVED,
            recordedAt: now,
          },
        },
      },
      { new: true },
    );
    try {
      await notifyBranchAdmins(
        (doc || sched).branch,
        "general",
        "Scheduled Room Transfer Requires Review",
        system
          ? "The tenant departed before a paid scheduled room transfer could occur. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing. The destination hold has been released."
          : "This scheduled room transfer has an existing payment and cannot be cancelled automatically. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing.",
        {
          entityType: "reservation",
          entityId: String(sched.reservationId),
          actionUrl: "/admin/tenants",
          dedupeKey: `scheduled_transfer_payment_review:${String(sched._id)}`,
        },
      );
    } catch { /* non-fatal */ }

    // Physical resource release and financial refund are SEPARATE concerns:
    // for a lifecycle-driven departure the future room must NOT stay blocked
    // forever, so release the hold even though the money stays put. For an
    // explicit admin cancel click we KEEP the hold (the admin may still push
    // the transfer through after settling).
    if (system && sched.holdApplied) {
      await releaseHoldInOwnTxn(sched, cancellationToken).catch((e) =>
        logger.error({ err: e, scheduledTransferId: String(sched._id) }, "[cancelScheduledRoomTransfer] departure hold release failed"),
      );
      await ScheduledRoomTransfer.updateOne(
        { _id: sched._id, executionToken: cancellationToken },
        { $set: { executionToken: null, executionStartedAt: null } },
      );
    }
    return {
      outcome: "action_required",
      reason: SCHEDULED_TRANSFER_ACTION_REASONS.PAYMENT_ALREADY_RECEIVED,
      message:
        "Payment adjustment or refund requires manual processing. Please coordinate with the Administration Office on the 2nd Floor.",
    };
  }

  // ── No money -> safe automatic cancellation ───────────────────────────────
  // Cancellation commits every required mutation together. A racing payment
  // writes the same Bill, forcing transaction retry and a fresh paid guard.
  const session = await mongoose.startSession();
  let doc, addendumResult, billResult;
  try {
    await session.withTransaction(async () => {
      const live = await ScheduledRoomTransfer.findOne({ _id: sched._id, executionToken: cancellationToken, status: { $in: ["scheduled", "action_required"] } }).session(session);
      if (!live) throw Object.assign(new Error("The transfer changed. Refresh its details."), { statusCode: 409 });
      const bill = live.settlementBillId ? await Bill.findById(live.settlementBillId).session(session) : null;
      if (bill && (Number(bill.paidAmount || 0) > 0 || ["paid", "settled"].includes(bill.status))) throw Object.assign(new Error("A payment was received. Ask administration to review Billing before cancelling."), { statusCode: 409, code: "ROOM_TRANSFER_PAYMENT_ALREADY_RECEIVED" });
      if (live.addendumContractId) {
        const contract = await Contract.findById(live.addendumContractId).session(session);
        const acknowledged = await ContractAcknowledgement.exists({ contractId: live.addendumContractId }).session(session);
        if (acknowledged || contract?.isCurrent || contract?.tenantSignatureStatus === "completed" || ["signed", "awaiting_notarization", "notarized", "ready_for_publication", "published", "active"].includes(contract?.status)) throw Object.assign(new Error("The addendum has already been accepted. Ask administration to review this transfer before cancelling."), { statusCode: 409, code: "ROOM_TRANSFER_ADDENDUM_ACKNOWLEDGED" });
      }
      const { releaseScheduledTransferHold } = await lazy.schedSvc();
      if (live.holdApplied) await releaseScheduledTransferHold({ session, scheduledTransferId: live._id, executionToken: cancellationToken, sourceRoomId: live.sourceRoomId, destinationRoomId: live.destinationRoomId, destinationBedId: live.destinationBedId, destinationNeedsBed: live.destinationNeedsBed, reservationId: live.reservationId });
      addendumResult = await cancelPreparedAddendum(live, actorId, session);
      billResult = await voidUnpaidBalanceBill(live, { session });
      doc = await ScheduledRoomTransfer.findOneAndUpdate({ _id: live._id, executionToken: cancellationToken }, { $set: {
        status: "cancelled", cancelledBy: actorId || SYSTEM_ACTOR_ID, cancelledAt: new Date(), holdApplied: false,
        lastError: null, lastAttemptAt: new Date(), executionToken: null, executionStartedAt: null,
      } }, { new: true, session });
    });
  } finally {
    await session.endSession();
    await ScheduledRoomTransfer.updateOne({ _id: sched._id, executionToken: cancellationToken }, { $set: { executionToken: null, executionStartedAt: null } });
  }

  try {
    await notify.roomTransferLifecycleOnce(
      sched.tenantId,
      "Scheduled Room Transfer Cancelled",
      "Your scheduled room transfer has been cancelled. You remain in your current room.",
      `room_transfer_cancelled:${String(sched._id)}`,
      { entityId: String(sched.reservationId), event: "cancelled" },
    );
  } catch { /* non-fatal */ }

  try {
    const { syncRequestFromScheduledTransfer } = await import("./tenantTransferRequestService.js");
    await syncRequestFromScheduledTransfer(doc);
  } catch (error) {
    logger.warn(
      { err: error, scheduledTransferId: String(sched._id) },
      "[cancelScheduledRoomTransfer] tenant request sync failed (non-fatal)",
    );
  }

  logger.info(
    {
      scheduledTransferId: String(sched._id),
      reservationId: String(sched.reservationId),
      addendumCancelled: addendumResult.cancelled,
      billVoided: billResult.voided,
      system,
    },
    "[cancelScheduledRoomTransfer] cancelled (safe, no payment)",
  );
  void doc;
  return { outcome: "cancelled" };
}

/**
 * Called by the departure workflows (move-out / early termination /
 * abandonment) BEFORE the tenant permanently leaves the dorm. Resolves any
 * OPEN scheduled transfer so a future room hold is never left blocking a room
 * after the tenant is gone.
 *
 *   no payment  -> safe automatic cancellation (hold released, Addendum
 *                  cancelled, unpaid Bill voided, status cancelled)
 *   payment     -> hold RELEASED (physical resource freed) but Bill / Payment
 *                  / deposit ledger / Addendum history PRESERVED; status
 *                  action_required PAYMENT_ALREADY_RECEIVED; admin notified
 *
 * Never executes the transfer. Idempotent. Best-effort — a failure here is
 * logged and swallowed so it can never block the departure workflow itself.
 *
 * @returns {{ handled: boolean, outcome?: string, reason?: string }}
 */
export async function resolveScheduledTransferBeforeTenantDeparture(reservationId, { actorId = null } = {}) {
  try {
    const { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } = await import("../models/ScheduledRoomTransfer.js");
    const open = await ScheduledRoomTransfer.findOne({
      reservationId,
      status: { $in: [...OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES] },
      isArchived: { $ne: true },
    }).sort({ createdAt: -1 });
    if (!open) return { handled: false };

    const res = await cancelScheduledRoomTransfer(open._id, { actorId, system: true });
    return { handled: true, outcome: res.outcome, reason: res.reason };
  } catch (e) {
    logger.error({ err: e, reservationId: String(reservationId) }, "[resolveScheduledTransferBeforeTenantDeparture] failed (non-fatal)");
    return { handled: false, error: e.message };
  }
}
