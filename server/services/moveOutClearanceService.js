import { createExclusiveTenancyRecord } from "./tenancyConflictTransaction.js";
/**
 * ============================================================================
 * MOVE-OUT CLEARANCE SERVICE
 * ============================================================================
 *
 * Wires the previously-vestigial MoveOutClearance model (see its own header
 * comment — a fully-modeled but completely unwired "tenant gives notice ->
 * inspection -> deposit calculated -> approved" workflow) into three simple
 * admin actions: Start Move-Out, Mark Inspected, Complete Move-Out.
 *
 * MoveOutClearance does NOT become a second financial calculator. The
 * authoritative deposit/settlement formula remains exactly what
 * moveOutStayWorkflow (server/utils/tenantActionService.js) already
 * computes — this service only records that decision as a durable,
 * auditable receipt once the real move-out executes. Its own itemized
 * deduction schema (unpaidRent/unpaidElectricity/damageItems/etc.) stays
 * unused by this wiring; using it would mean maintaining two independently
 * evolving formulas for the same real-world number, which is exactly the
 * kind of duplicated-logic risk the audit flagged elsewhere.
 *
 * ============================================================================
 */

import { MoveOutClearance, Reservation, Room } from "../models/index.js";
import { moveOutStayWorkflow } from "../utils/tenantActionService.js";
import { resolveCurrentStayForReservation } from "./tenantContractSelectionService.js";

const serviceError = (message, code, statusCode = 400) =>
  Object.assign(new Error(message), { code, statusCode });

/**
 * "Start Move-Out" — the tenant/admin records that a move-out is intended.
 * Does not touch Stay/Contract/Room — those only change at Complete Move-Out.
 */
export async function openMoveOutClearance({
  reservationId,
  tenantId,
  intendedMoveOutDate,
  actorId,
}) {
  if (!reservationId || !tenantId || !intendedMoveOutDate) {
    throw serviceError(
      "reservationId, tenantId, and intendedMoveOutDate are required.",
      "MISSING_REQUIRED_FIELDS",
      400,
    );
  }

  const existing = await MoveOutClearance.findOne({ reservationId, isArchived: { $ne: true } });
  if (existing) {
    // Idempotent — re-opening an already-open clearance just returns it
    // rather than erroring, matching the "duplicate click is a no-op" idiom
    // used elsewhere in this phase (acknowledgement, bed checkout locks).
    return existing;
  }

  const reservation = await Reservation.findById(reservationId).lean();
  if (!reservation) {
    throw serviceError("Reservation not found.", "RESERVATION_NOT_FOUND", 404);
  }

  const stay = await resolveCurrentStayForReservation(reservationId);
  if (!stay) {
    throw serviceError(
      "No active stay found — Move-Out can only be started for an active tenancy.",
      "NO_ACTIVE_STAY",
      409,
    );
  }

  let branch = stay.branch;
  if (!branch) {
    const room = await Room.findById(stay.roomId || reservation.roomId).select("branch").lean();
    branch = room?.branch;
  }
  if (!branch) {
    throw serviceError("Could not resolve branch for this tenancy.", "BRANCH_UNRESOLVED", 409);
  }

  // Deposit available for settlement = the ACTUAL cash held
  // (reservation.securityDepositHeld), which the room-transfer + payment
  // flows keep authoritative. Phase 10: `Number(null)` is 0, so a legacy
  // tenancy (field never populated) or one the transfer backfilled to 0
  // must NOT be read as "₱0 held" — that zeroes the whole refund basis via
  // the MoveOutClearance pre-save hook. Only a POSITIVE recorded value is
  // real held cash; otherwise fall back to the current Stay's monthly rent
  // (kept aligned to the destination rate on transfer), then the reservation
  // rate. This must never refund a destination's REQUIRED deposit that was
  // never actually collected.
  const heldDepositRaw = Number(reservation.securityDepositHeld);
  const securityDepositAmount = Number.isFinite(heldDepositRaw) && heldDepositRaw > 0
    ? heldDepositRaw
    : Number(stay.monthlyRent || reservation.monthlyRent || 0);

  return createExclusiveTenancyRecord(reservationId, async (session, liveReservation) => {
    if (String(liveReservation.roomId) !== String(reservation.roomId)) throw serviceError("The current room changed. Refresh the tenant details before starting move-out.", "CURRENT_ROOM_CHANGED", 409);
    const existing = await MoveOutClearance.findOne({ reservationId, isArchived: { $ne: true } }).session(session);
    if (existing) return existing;
    const [clearance] = await MoveOutClearance.create([{
    reservationId,
    stayId: stay._id,
    tenantId,
    branch,
    status: "initiated",
    intendedMoveOutDate: new Date(intendedMoveOutDate),
    initiatedBy: actorId,
    securityDepositAmount,
    }], { session });
    return clearance;
  });
}

/**
 * "Mark Inspected" — records that the room inspection step is complete.
 * Requires the explicit inspection_pending -> inspection_complete step
 * rather than skipping it, since the model has a dedicated status for it.
 */
export async function markInspectionComplete({ clearanceId, actorId, inspectionNotes = "" }) {
  const clearance = await MoveOutClearance.findById(clearanceId);
  if (!clearance) {
    throw serviceError("Move-out clearance not found.", "CLEARANCE_NOT_FOUND", 404);
  }
  if (!["initiated", "inspection_pending"].includes(clearance.status)) {
    throw serviceError(
      `Cannot mark inspection complete from status "${clearance.status}".`,
      "INVALID_CLEARANCE_STATUS",
      409,
    );
  }

  clearance.status = "inspection_complete";
  clearance.inspectionCompletedAt = new Date();
  clearance.inspectionCompletedBy = actorId;
  clearance.inspectionNotes = inspectionNotes;
  await clearance.save();
  return clearance;
}

const DEPOSIT_OUTCOME_FROM_SETTLEMENT = (depositSettlement) => {
  if (!depositSettlement) return "under_review";
  if (depositSettlement.isEarlyVacancy || depositSettlement.depositForfeited) return "forfeited";
  const amount = Number(depositSettlement.depositRefundAmount || 0);
  if (amount <= 0) return "fully_applied";
  return "partially_refundable";
};

/**
 * "Complete Move-Out" — the canonical action. Delegates entirely to
 * moveOutStayWorkflow (Stay/Contract/Room/Reservation/deposit-settlement
 * logic, unchanged), then records the already-computed outcome onto the
 * MoveOutClearance document as a durable receipt.
 */
export async function completeMoveOutClearance({ clearanceId, payload, actorId }) {
  const clearance = await MoveOutClearance.findById(clearanceId);
  if (!clearance) {
    throw serviceError("Move-out clearance not found.", "CLEARANCE_NOT_FOUND", 404);
  }
  if (["approved", "refunded", "forfeited"].includes(clearance.status)) {
    throw serviceError(
      "This move-out clearance has already been completed.",
      "CLEARANCE_ALREADY_COMPLETE",
      409,
    );
  }

  const result = await moveOutStayWorkflow({
    reservationId: clearance.reservationId,
    payload: {
      ...payload,
      moveOutDate: payload?.moveOutDate || clearance.confirmedMoveOutDate || clearance.intendedMoveOutDate,
      confirm: true,
    },
    actorId,
  });

  const depositSettlement = result.depositSettlement;
  clearance.confirmedMoveOutDate = depositSettlement?.actualMoveOutDate || clearance.confirmedMoveOutDate;
  clearance.calculatedAt = new Date();
  clearance.calculatedBy = actorId;
  const outstandingBalance = Number(result.billingSummary?.currentBalance ?? 0);
  clearance.deductions = {
    ...clearance.deductions,
    unpaidRent: outstandingBalance,
  };
  clearance.totalDeductions = outstandingBalance;
  clearance.refundableBalance = Number(depositSettlement?.depositRefundAmount ?? 0);
  clearance.depositOutcome = DEPOSIT_OUTCOME_FROM_SETTLEMENT(depositSettlement);
  clearance.approvedBy = actorId;
  clearance.approvedAt = new Date();
  clearance.approvalReason = depositSettlement?.isEarlyVacancy
    ? "Early move-out — deposit forfeited per move-out settlement calculation."
    : "Move-out settlement calculated and finalized via Complete Move-Out.";
  clearance.status = clearance.depositOutcome === "forfeited" ? "forfeited" : "approved";
  await clearance.save();

  return { clearance, reservation: result.reservation, depositSettlement };
}

export async function getMoveOutClearance(clearanceId) {
  const clearance = await MoveOutClearance.findById(clearanceId);
  if (!clearance) {
    throw serviceError("Move-out clearance not found.", "CLEARANCE_NOT_FOUND", 404);
  }
  return clearance;
}

export async function listMoveOutClearances({ branch, status } = {}) {
  const query = { isArchived: { $ne: true } };
  if (branch) query.branch = branch;
  if (status) query.status = status;
  return MoveOutClearance.find(query).sort({ createdAt: -1 });
}
