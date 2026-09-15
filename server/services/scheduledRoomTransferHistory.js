/**
 * ============================================================================
 * ROOM TRANSFER HISTORY — READ-ONLY AGGREGATOR (F3)
 * ============================================================================
 *
 * The complete Room Transfer lifecycle for a reservation, for Admin -> Tenant
 * Details -> History. Built ENTIRELY from existing canonical records — there
 * is NO RoomTransferTransaction model and none is created.
 *
 *   - Every NEW transfer is a `ScheduledRoomTransfer` (the canonical
 *     transaction record). Serialized via `serializeScheduledRoomTransfer`,
 *     tagged `source: "scheduled"`. ALL statuses are returned
 *     (scheduled / action_required / executed / cancelled).
 *
 *   - Historical IMMEDIATE transfers (pre-future-only) may have NO
 *     `ScheduledRoomTransfer`. They are DERIVED read-only from the canonical
 *     evidence they DID leave:
 *       * a closed `BedHistory` row (closedByAction "transfer" /
 *         status "transferred") + the tenant's NEXT room's BedHistory row
 *       * the matching Room Transfer Addendum / legacy replacement Contract
 *       * the `billType: "transfer_settlement"` Bill (transferSnapshot)
 *     Tagged `source: "legacy_immediate"`, `userFacingStatus: "Transfer Completed"`,
 *     no actions. NO fake DB rows are written.
 *
 *   - DEDUPE: a modern scheduled transfer ALSO writes BedHistory + Addendum +
 *     Bill. A closed BedHistory transfer row that a `ScheduledRoomTransfer`
 *     already represents (same-ish effective date + destination room, or its
 *     `transfer_settlement` Bill is the schedule's `settlementBillId`) is NOT
 *     re-derived. The ScheduledRoomTransfer wins.
 *
 * Newest first (by effective date, then created date).
 * ============================================================================
 */

import mongoose from "mongoose";
import {
  Bill,
  BedHistory,
  Contract,
  ScheduledRoomTransfer,
} from "../models/index.js";
import { serializeScheduledRoomTransfer } from "./scheduledRoomTransferView.js";

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const asId = (v) => (v == null ? null : String(v._id || v.id || v));
const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const LEGACY_UTILITY_NOTE =
  "Electricity and applicable water charges follow the normal utility billing cycle, using the effective transfer date as the room-responsibility boundary.";

/**
 * Build the derived read-only entries for legacy immediate transfers.
 *
 * @param {Object[]} bedHistory - ALL BedHistory rows for the reservation
 *   (any status), lean, ideally sorted moveInDate ASC.
 * @param {Object[]} contracts - ALL Contract rows for the reservation, lean.
 * @param {Object[]} settlementBills - transfer_settlement Bills for the
 *   reservation, lean.
 * @param {Set<string>} scheduledBillIds - settlementBillIds already owned by a
 *   ScheduledRoomTransfer (for dedupe).
 * @param {Array<{effectiveDay:string|null, destRoomId:string|null}>} scheduledKeys
 *   - {effective date, destination room} of every ScheduledRoomTransfer (dedupe).
 * @returns {Promise<Object[]>}
 */
export async function buildLegacyImmediateTransferEntries({
  bedHistory = [],
  contracts = [],
  settlementBills = [],
  scheduledBillIds = new Set(),
  scheduledKeys = [],
}) {
  const rows = [...bedHistory].sort(
    (a, b) => new Date(a.moveInDate || 0) - new Date(b.moveInDate || 0),
  );

  const closedTransfers = rows.filter(
    (r) => r.status === "transferred" || r.closedByAction === "transfer",
  );
  if (closedTransfers.length === 0) return [];

  const transferAddenda = contracts
    .filter((c) => ["amendment", "replacement"].includes(c.contractPurpose))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  const entries = [];

  for (const closed of closedTransfers) {
    // The tenant's NEXT room after leaving this one — the earliest BedHistory
    // row that starts on/after this one's effective end.
    const effectiveEnd =
      closed.effectiveEndDate || closed.moveOutDate || closed.checkOutDate || null;
    const next =
      rows.find(
        (r) =>
          r !== closed &&
          new Date(r.moveInDate || 0) >= new Date(effectiveEnd || closed.moveInDate || 0) &&
          String(r.roomId?._id || r.roomId) !== String(closed.roomId?._id || closed.roomId),
      ) || null;

    const effDay = dayKey(effectiveEnd);
    const destRoomId = asId(next?.roomId);

    // DEDUPE — a ScheduledRoomTransfer already represents this.
    const dupBySchedule = scheduledKeys.some(
      (k) =>
        (k.destRoomId && destRoomId && k.destRoomId === destRoomId) &&
        (!k.effectiveDay || !effDay || k.effectiveDay === effDay),
    );
    if (dupBySchedule) continue;

    // Matching transfer_settlement Bill — by transferSnapshot effective date /
    // destination, else the nearest by billingMonth.
    const bill =
      settlementBills.find((b) => {
        const snap = b.transferSnapshot || {};
        const snapDay = dayKey(snap.effectiveTransferDate || b.billingMonth);
        const snapTo = asId(snap.toRoomId);
        return (
          (snapTo && destRoomId && snapTo === destRoomId) ||
          (snapDay && effDay && snapDay === effDay)
        );
      }) || null;

    // If that Bill is owned by a ScheduledRoomTransfer, this is not legacy.
    if (bill && scheduledBillIds.has(String(bill._id))) continue;

    // Matching Addendum / replacement — closest by effective/created date.
    const addendum =
      transferAddenda.find((c) => {
        const aDay = dayKey(c.amendmentEffectiveDate || c.leaseStartDate);
        return aDay && effDay && aDay === effDay;
      }) ||
      transferAddenda.find(
        (c) => destRoomId && String(c.roomId) === destRoomId,
      ) ||
      null;

    const fromSnap = closed.fromRoomSnapshot || {};
    const billSnap = closed.billingSnapshotAtTransfer || {};

    const fromRoomName =
      fromSnap.name ||
      closed.roomId?.name ||
      closed.roomId?.roomNumber ||
      "Previous room";
    const toRoomName =
      next?.roomId?.name ||
      next?.roomId?.roomNumber ||
      (bill?.transferSnapshot?.toRoomName) ||
      addendum?.roomNumber ||
      "New room";

    const settlementTotal =
      bill != null
        ? round(bill.totalAmount ?? bill.grossAmount ?? 0)
        : round(closed.proratedRentAdjustment ?? billSnap.proRataRent ?? 0);

    const initiatedBy = null; // legacy rows carry no scheduledBy

    entries.push({
      id: `legacy:${String(closed._id)}`,
      source: "legacy_immediate",
      status: "completed",
      userFacingStatus: "Transfer Completed",
      statusLabel: "Transfer Completed",

      fromRoom: { id: asId(closed.roomId), name: fromRoomName, type: fromSnap.type || closed.roomId?.type || null },
      fromBed: closed.bedId && !String(closed.bedId).startsWith("room-") ? String(closed.bedId) : null,
      toRoom: { id: destRoomId, name: toRoomName, type: next?.roomId?.type || bill?.transferSnapshot?.toRoomType || null },
      toBed:
        next && next.bedId && !String(next.bedId).startsWith("room-")
          ? String(next.bedId)
          : null,

      effectiveDate: effectiveEnd || next?.moveInDate || null,
      createdAt: closed.createdAt || null,
      scheduledAt: null,
      completedAt: closed.updatedAt || closed.effectiveEndDate || next?.moveInDate || null,
      cancelledAt: null,

      initiatedBy,
      reason: closed.reason || "Room transfer",

      // Financial — DERIVED, read-only. No client math.
      rentAdjustment:
        closed.proratedRentAdjustment != null
          ? round(closed.proratedRentAdjustment)
          : billSnap.proRataRent != null
            ? round(billSnap.proRataRent)
            : null,
      securityDepositAdjustment: null, // not separately recorded on legacy rows
      transferBalance:
        bill != null
          ? {
              hasBill: bill.status !== "voided",
              billId: String(bill._id),
              amountDue: round(bill.totalAmount ?? bill.grossAmount ?? 0),
              amountPaid: round(bill.paidAmount ?? bill.amountPaid ?? 0),
              remaining: round(bill.remainingAmount ?? Math.max(0, (bill.totalAmount || 0) - (bill.paidAmount || 0))),
              paymentState:
                (bill.remainingAmount ?? ((bill.totalAmount || 0) - (bill.paidAmount || 0))) <= 0
                  ? "paid"
                  : (bill.paidAmount || bill.amountPaid || 0) > 0
                    ? "partial"
                    : "unpaid",
              dueDate: bill.dueDate || null,
            }
          : { hasBill: false, billId: null, amountDue: 0, amountPaid: 0, remaining: 0, paymentState: "none", dueDate: null },
      finalSettlementAmount: settlementTotal || null,
      settlementBillId: bill ? String(bill._id) : null,

      addendumContractId: addendum ? String(addendum._id) : null,
      addendum: addendum
        ? {
            contractId: String(addendum._id),
            contractNumber: addendum.contractNumber || null,
            status: addendum.status,
            isCurrent: !!addendum.isCurrent,
            label:
              addendum.contractPurpose === "amendment"
                ? "Room Transfer Addendum"
                : "Transfer Replacement (legacy)",
          }
        : null,

      actionRequiredReason: null,
      actionRequiredMessage: null,
      utilityNote: LEGACY_UTILITY_NOTE,

      // Legacy rows are audit-only — never offer Cancel / Retry.
      actionsAllowed: { cancel: false, retry: false },
    });
  }

  return entries;
}

/**
 * Normalize a serialized ScheduledRoomTransfer into the shared history-entry
 * shape used by the UI, so scheduled + legacy rows render identically.
 */
function scheduledToHistoryEntry(s) {
  return {
    id: s.id,
    source: "scheduled",
    status: s.status, // scheduled | ready_for_transfer | awaiting_settlement | completed | action_required | cancelled
    userFacingStatus: s.statusLabel,
    statusLabel: s.statusLabel,

    fromRoom: { id: s.currentRoom?.id || null, name: s.currentRoom?.name || null, type: s.currentRoom?.type || null },
    fromBed:
      s.currentRoom?.bedId && !String(s.currentRoom.bedId).startsWith("room-")
        ? String(s.currentRoom.bedId)
        : null,
    toRoom: { id: s.scheduledRoom?.id || null, name: s.scheduledRoom?.name || null, type: s.scheduledRoom?.type || null },
    toBed: s.scheduledRoom?.needsBed ? (s.destinationBed || s.scheduledRoom?.bedId || null) : null,

    effectiveDate: s.effectiveTransferDate || null,
    createdAt: s.createdAt || s.scheduledAt || null,
    scheduledAt: s.scheduledAt || null,
    completedAt: s.executedAt || null,
    cancelledAt: s.cancelledAt || null,

    initiatedBy: s.initiatedBy || null,
    reason: s.reason || null,

    rentAdjustment: s.rentAdjustment ?? null,
    securityDepositAdjustment: s.additionalSecurityDeposit ?? null,
    transferBalance: s.transferBalance || null,
    finalSettlementAmount: s.finalSettlementAmount ?? null,
    settlementBillId: s.settlementBillId || s.transferBalance?.billId || null,

    addendumContractId: s.addendumContractId || null,
    addendum: s.addendum || null,

    actionRequiredReason: s.actionRequiredReason || null,
    actionRequiredMessage: s.actionRequiredMessage || null,
    utilityNote: LEGACY_UTILITY_NOTE,

    // Actions are still driven by the live card on Overview; history exposes
    // the same allowances for a compact inline control if the UI wants one.
    actionsAllowed: {
      // Open (not executed/cancelled) and no payment yet → cancellable.
      cancel:
        !["completed", "cancelled"].includes(s.status) &&
        Number(s.transferBalance?.amountPaid || 0) === 0,
      // The admin-driven Complete Transfer flow replaces the old auto-executor
      // "retry"; it is available once the scheduled calendar date is reached
      // (server `completable`; the stored time is guidance only).
      retry: !!s.completable,
    },
  };
}

/**
 * The complete Room Transfer history for a reservation — scheduled records
 * (all statuses) + derived legacy immediate transfers, newest first.
 *
 * @param {string|ObjectId} reservationId
 * @param {Object} [opts]
 * @param {Object[]} [opts.bedHistory]  - preloaded BedHistory rows (lean) to
 *   avoid a re-query when the caller already has them.
 * @param {Object[]} [opts.contracts]   - preloaded Contract rows (lean).
 * @param {Object[]} [opts.bills]        - preloaded Bill rows (lean).
 * @returns {Promise<Object[]>}
 */
export async function getRoomTransferHistoryForReservation(reservationId, opts = {}) {
  if (!reservationId || !mongoose.isValidObjectId(reservationId)) return [];

  const [schedules, bedHistory, contracts, bills] = await Promise.all([
    ScheduledRoomTransfer.find({ reservationId, isArchived: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean(),
    opts.bedHistory
      ? Promise.resolve(opts.bedHistory)
      : BedHistory.find({ reservationId })
          .populate("roomId", "name roomNumber branch type")
          .sort({ moveInDate: 1 })
          .lean(),
    opts.contracts
      ? Promise.resolve(opts.contracts)
      : Contract.find({ reservationId }).sort({ createdAt: 1 }).lean(),
    opts.bills
      ? Promise.resolve(opts.bills.filter((b) => b.billType === "transfer_settlement"))
      : Bill.find({ reservationId, billType: "transfer_settlement" }).lean(),
  ]);

  // Serialize every ScheduledRoomTransfer (any status).
  const scheduledEntries = [];
  for (const s of schedules) {
    // eslint-disable-next-line no-await-in-loop
    const serialized = await serializeScheduledRoomTransfer(s);
    if (serialized) scheduledEntries.push(scheduledToHistoryEntry(serialized));
  }

  // Dedupe keys for legacy derivation.
  const scheduledBillIds = new Set(
    schedules
      .map((s) => s.settlementBillId)
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const scheduledKeys = schedules.map((s) => ({
    effectiveDay: dayKey(s.effectiveTransferDate),
    destRoomId: s.destinationRoomId ? String(s.destinationRoomId) : null,
  }));

  const legacyEntries = await buildLegacyImmediateTransferEntries({
    bedHistory,
    contracts,
    settlementBills: bills,
    scheduledBillIds,
    scheduledKeys,
  });

  const all = [...scheduledEntries, ...legacyEntries];
  all.sort((a, b) => {
    const ad = new Date(a.effectiveDate || a.createdAt || 0).getTime();
    const bd = new Date(b.effectiveDate || b.createdAt || 0).getTime();
    return bd - ad; // newest first
  });
  return all;
}
