/**
 * ============================================================================
 * SCHEDULED ROOM TRANSFER — SERIALIZATION
 * ============================================================================
 *
 * The single canonical shape returned to Admin + Tenant (web & mobile) for a
 * scheduled room transfer. Callers never build their own — so the
 * user-facing status vocabulary is defined in exactly one place.
 *
 * USER-FACING STATUS (derived — never a raw enum leak):
 *   "awaiting_payment" — scheduled, a transfer balance exists and is not fully
 *                        settled.
 *   "ready"            — scheduled, transfer balance fully settled OR zero
 *                        balance; waiting for the effective date.
 *   "completed"        — executed.
 *   "action_required"  — the system cannot safely execute automatically;
 *                        `actionRequiredReason` carries the sub-reason.
 *   "cancelled"        — cancelled pre-cutover.
 *
 * Phase 2C ships this with the balance always treated as settled (no Bill yet
 * — 2D adds Bill creation and wires the real payment lookup here).
 * ============================================================================
 */

import { Bill, Contract } from "../models/index.js";
import { getManilaToday, toManilaStartOfDay } from "../utils/dateUtils.js";

export const SCHEDULED_TRANSFER_USER_STATUSES = Object.freeze([
  "scheduled",
  "ready_for_transfer",
  "awaiting_settlement",
  "completed",
  "action_required",
  "cancelled",
]);

export const SCHEDULED_TRANSFER_STATUS_LABELS = Object.freeze({
  scheduled: "Scheduled",
  ready_for_transfer: "Ready for Transfer",
  awaiting_settlement: "Awaiting Settlement",
  completed: "Completed",
  action_required: "Action Required",
  cancelled: "Cancelled",
});

// Short, friendly Admin-facing explanation for an `action_required` sub-reason
// (`lastError`). The raw code is never the primary UI — this is. Mirrors the
// vocabulary in scheduledRoomTransferExecutor's buildAdminMessage without
// importing the executor (avoids a service<->service cycle).
const ACTION_REQUIRED_MESSAGES = Object.freeze({
  TRANSFER_BALANCE_UNPAID:
    "The Scheduled Room Transfer Balance is not fully settled. The tenant remains in the current room. Settle the balance, then retry.",
  ADDITIONAL_BALANCE_DUE:
    "The settlement recomputed higher than the amount already paid. Settle the remaining transfer balance, then retry.",
  FINANCIAL_ADJUSTMENT_REQUIRED:
    "Payment adjustment or refund requires manual processing. Please coordinate with the Administration Office on the 2nd Floor.",
  PAYMENT_ALREADY_RECEIVED:
    "A payment was already received for this transfer. It cannot be cancelled automatically. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing.",
  PAID_TRANSFER_CANNOT_COMPLETE:
    "This paid Room Transfer cannot complete until its financial adjustment is resolved. Please coordinate with the Administration Office on the 2nd Floor for payment adjustment or refund processing.",
  OPERATIONAL_VALIDATION_FAILED:
    "The destination room or bed is no longer valid. Review the destination and retry after correcting it.",
  EXECUTION_FAILED:
    "The transfer could not be completed on the effective date. Review the destination room/bed and retry.",
  DESTINATION_UNAVAILABLE:
    "The destination room or bed is no longer available for this tenant's stay. Reschedule the transfer or pick another room.",
  ADDENDUM_EFFECTIVE_DATE_LOCKED:
    "The Room Transfer Addendum was already acknowledged for the originally scheduled date. Reschedule the transfer to re-issue the Addendum for the actual date, then complete it.",
});

export function describeScheduledTransferActionRequired(reason) {
  if (!reason) return null;
  const key = String(reason).split(":")[0].trim();
  return ACTION_REQUIRED_MESSAGES[key] || "This scheduled transfer needs review before it can complete.";
}

/**
 * Resolve a scheduledBy / cancelledBy ObjectId (or populated doc) into a safe
 * Admin-facing identity. Never returns email / phone / account internals.
 */
async function resolveActorIdentity(actor, { session = null } = {}) {
  if (!actor) return null;
  if (typeof actor === "object" && (actor.firstName || actor.lastName || actor.name)) {
    const name = actor.name || `${actor.firstName || ""} ${actor.lastName || ""}`.trim();
    return { id: actor._id ? String(actor._id) : null, name: name || "Staff", role: actor.role || null };
  }
  // Lazy import so route-mount unit tests that mock ../models/index.js without
  // User (mobile mount-order suites) still load this module.
  const { User } = await import("../models/index.js");
  const q = User.findById(actor).select("firstName lastName role");
  const u = await (session ? q.session(session) : q).lean();
  if (!u) return null;
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return { id: String(u._id), name: name || "Staff", role: u.role || null };
}

/**
 * Resolve the payment state of a scheduled transfer's balance Bill.
 * @returns {{ hasBill:boolean, billId:string|null, amountDue:number,
 *   amountPaid:number, remaining:number, paymentState:"none"|"unpaid"|"partial"|"paid" }}
 */
export async function resolveScheduledTransferBalance(scheduledTransfer, { session = null } = {}) {
  // The balance Bill is the transfer_settlement Bill linked from
  // settlementBillId (2D). Absent => nothing to pay.
  const billId = scheduledTransfer.settlementBillId || null;
  if (!billId) {
    return {
      hasBill: false,
      billId: null,
      amountDue: 0,
      amountPaid: 0,
      remaining: 0,
      paymentState: "none",
    };
  }
  const q = Bill.findById(billId);
  const bill = await (session ? q.session(session) : q).lean();
  if (!bill || bill.status === "voided") {
    return {
      hasBill: false,
      billId: String(billId),
      amountDue: 0,
      amountPaid: 0,
      remaining: 0,
      paymentState: "none",
    };
  }
  const amountDue = Number(bill.totalAmount || 0);
  const amountPaid = Number(bill.amountPaid ?? bill.paidAmount ?? 0);
  const remaining = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
  let paymentState = "unpaid";
  if (amountDue <= 0 || remaining <= 0) paymentState = "paid";
  else if (amountPaid > 0) paymentState = "partial";
  return {
    hasBill: true,
    billId: String(billId),
    amountDue,
    amountPaid,
    remaining,
    paymentState,
  };
}

/**
 * Derive the UI-facing status from the stored status + the effective
 * calendar date + the settlement Bill. The stored time remains guidance. There is no extra DB status —
 * "Ready for Transfer" / "Awaiting Settlement" are computed:
 *
 *   executed              -> completed
 *   cancelled             -> cancelled
 *   action_required       -> action_required  (unless a Bill is now unpaid,
 *                            in which case awaiting_settlement is clearer)
 *   scheduled + calendar date NOT reached       -> scheduled
 *   scheduled + date reached + unpaid balance   -> awaiting_settlement
 *   scheduled + date reached + no/settled bill  -> ready_for_transfer
 */
export function deriveScheduledTransferUserStatus(scheduledTransfer, balance, now = new Date()) {
  if (scheduledTransfer.status === "executed") return "completed";
  if (scheduledTransfer.status === "cancelled") return "cancelled";

  const effectiveDay = toManilaStartOfDay(scheduledTransfer.effectiveTransferDate);
  const dueReached = !!effectiveDay && !effectiveDay.isAfter(getManilaToday(now));
  const balanceUnpaid =
    balance && balance.hasBill && balance.paymentState !== "paid" && balance.paymentState !== "none";

  if (scheduledTransfer.status === "action_required") {
    // A payment blocker that has since been settled -> the transfer is ready to
    // complete again (the admin re-runs Complete Transfer).
    const paymentBlocker =
      scheduledTransfer.lastError === "TRANSFER_BALANCE_UNPAID" ||
      scheduledTransfer.lastError === "ADDITIONAL_BALANCE_DUE";
    if (balanceUnpaid) return "awaiting_settlement";
    if (paymentBlocker) return "ready_for_transfer";
    return "action_required";
  }

  // status === "scheduled"
  if (!dueReached) return "scheduled";
  return balanceUnpaid ? "awaiting_settlement" : "ready_for_transfer";
}

/**
 * The canonical serialized shape. Safe for Admin, Tenant web and Tenant
 * mobile — no internal-only fields.
 */
export async function serializeScheduledRoomTransfer(scheduledTransfer, { session = null } = {}) {
  if (!scheduledTransfer) return null;
  const doc = typeof scheduledTransfer.toObject === "function"
    ? scheduledTransfer.toObject()
    : scheduledTransfer;

  const balance = await resolveScheduledTransferBalance(doc, { session });
  const userStatus = deriveScheduledTransferUserStatus(doc, balance);

  const preview = doc.previewSnapshot || null;
  const executed = doc.executedSettlement || null;
  const figures = executed || preview || null;

  // Executed settlement is a FLAT shape (rentAdjustmentDue, additionalDepositDue,
  // excessRentCredit, excessDepositHeld, totalImmediateDue); the preview is a
  // NESTED shape (rent.*, deposit.*). Read both without conflating them.
  const rentAdjustment = executed
    ? executed.rentAdjustmentDue ?? null
    : preview?.rent?.adjustmentDue ?? null;
  const additionalDeposit = executed
    ? executed.additionalDepositDue ?? null
    : preview?.deposit?.balanceDue ?? null;
  const rentCredit = executed
    ? executed.excessRentCredit ?? null
    : preview?.rent?.excessCredit ?? null;
  const excessDepositHeld = executed
    ? executed.excessDepositHeld ?? null
    : preview?.deposit?.excessHeld ?? null;
  const finalSettlementAmount = executed ? executed.totalImmediateDue ?? null : null;

  const initiatedBy = await resolveActorIdentity(doc.scheduledBy, { session });
  const cancelledByIdentity = await resolveActorIdentity(doc.cancelledBy, { session });

  // Addendum status — before execution it is a prepared, not-yet-current
  // Draft that becomes effective on `effectiveTransferDate`.
  let addendum = null;
  if (doc.addendumContractId) {
    const q = Contract.findById(doc.addendumContractId).select("status isCurrent contractNumber amendmentEffectiveDate");
    const c = await (session ? q.session(session) : q).lean();
    if (c) {
      addendum = {
        contractId: String(c._id),
        contractNumber: c.contractNumber || null,
        status: c.status,
        isCurrent: !!c.isCurrent,
        effectiveDate: c.amendmentEffectiveDate || doc.effectiveTransferDate,
        // User-facing: "Scheduled" until it actually becomes the current lease.
        label: c.isCurrent ? "Room Transfer Addendum" : "Room Transfer Addendum — Scheduled",
      };
    }
  }

  return {
    id: String(doc._id),
    reservationId: String(doc.reservationId),
    tenantId: doc.tenantId ? String(doc.tenantId) : null,
    branch: doc.branch,

    currentRoom: {
      id: doc.sourceRoomId ? String(doc.sourceRoomId) : null,
      name: preview?.fromRoom?.name || null,
      type: preview?.fromRoom?.type || null,
      bedId: doc.sourceBedId || null,
    },
    scheduledRoom: {
      id: doc.destinationRoomId ? String(doc.destinationRoomId) : null,
      name: preview?.toRoom?.name || null,
      type: preview?.toRoom?.type || null,
      bedId: doc.destinationBedId || null,
      needsBed: doc.destinationNeedsBed,
    },

    // Destination bed — only meaningful for a shared destination.
    destinationBed: doc.destinationNeedsBed ? (doc.destinationBedId || null) : null,

    effectiveTransferDate: doc.effectiveTransferDate,
    effectiveTransferTimeMinutes: doc.effectiveTransferTimeMinutes ?? 9 * 60,
    // "HH:mm" convenience for display.
    effectiveTransferTimeLabel: (() => {
      const m = doc.effectiveTransferTimeMinutes ?? 9 * 60;
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    })(),
    reason: doc.reason || null,
    status: userStatus,
    statusLabel: SCHEDULED_TRANSFER_STATUS_LABELS[userStatus] || userStatus,
    // The stored orchestration status (scheduled | executed | cancelled |
    // action_required) — distinct from the derived UI `status` above.
    recordStatus: doc.status,
    // Whether the admin Complete Transfer flow is available (calendar date
    // reached and not already executed/cancelled). The stored time is guidance.
    completable: ["ready_for_transfer", "awaiting_settlement", "action_required"].includes(userStatus),
    actionRequiredReason: doc.status === "action_required" ? (doc.lastError || null) : null,
    actionRequiredMessage:
      doc.status === "action_required" ? describeScheduledTransferActionRequired(doc.lastError) : null,

    // Append-only reschedule audit trail (Admin Room Transfer §1).
    scheduleHistory: Array.isArray(doc.scheduleHistory)
      ? doc.scheduleHistory.map((h) => ({
          previousDate: h.previousDate || null,
          previousTimeMinutes: h.previousTimeMinutes ?? null,
          newDate: h.newDate || null,
          newTimeMinutes: h.newTimeMinutes ?? null,
          at: h.at || null,
          reason: h.reason || "",
          kind: h.kind || "rescheduled",
        }))
      : [],

    // Rent / deposit figures — the executed settlement once it exists,
    // otherwise the scheduling-time preview. (rent.* rates only exist on the
    // preview; the executed settlement is a flat shape.)
    currentMonthlyRent: preview?.rent?.sourceEffectiveRate ?? null,
    newMonthlyRent: preview?.rent?.destinationApprovedRate ?? null,
    rentAdjustment,
    additionalSecurityDeposit: additionalDeposit,
    // The canonical settled total, present only once the transfer has executed.
    finalSettlementAmount,
    // Informational-until-execution figures for a cheaper destination.
    estimatedRentCreditAfterTransfer: rentCredit,
    estimatedExcessDepositHeld: excessDepositHeld,

    // Safe Admin-facing identities.
    initiatedBy,
    cancelledBy: cancelledByIdentity,

    transferBalance: {
      hasBill: balance.hasBill,
      billId: balance.billId,
      amountDue: balance.amountDue,
      amountPaid: balance.amountPaid,
      remaining: balance.remaining,
      paymentState: balance.paymentState, // none | unpaid | partial | paid
      dueDate: doc.effectiveTransferDate,
    },

    utilitiesNote:
      "Electricity and water follow the normal utility billing after the room-transfer cutoff.",

    settlementBillId: balance.billId || (doc.settlementBillId ? String(doc.settlementBillId) : null),
    addendumContractId: doc.addendumContractId ? String(doc.addendumContractId) : null,
    addendum,

    createdAt: doc.createdAt || doc.scheduledAt || null,
    scheduledAt: doc.scheduledAt || doc.createdAt || null,
    executedAt: doc.executedAt || null,
    cancelledAt: doc.cancelledAt || null,
  };
}

/**
 * Resolve the OPEN scheduled transfer for a reservation (or null), serialized.
 * Convenience for the tenant/admin detail serializers.
 */
export async function getOpenScheduledRoomTransferForReservation(reservationId, { session = null } = {}) {
  const { ScheduledRoomTransfer } = await import("../models/index.js");
  const { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } = await import("../models/ScheduledRoomTransfer.js");
  const q = ScheduledRoomTransfer.findOne({
    reservationId,
    status: { $in: [...OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES] },
    isArchived: { $ne: true },
  }).sort({ createdAt: -1 });
  const doc = await (session ? q.session(session) : q);
  if (!doc) return null;
  return serializeScheduledRoomTransfer(doc, { session });
}
