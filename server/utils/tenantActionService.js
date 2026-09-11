import { recordWaterObservation, requiresWaterObservation } from '../services/billing/waterObservations.js';
import mongoose from "mongoose";
import dayjs from "dayjs";
import logger from "../middleware/logger.js";
import {
  AuditLog,
  BedHistory,
  Bill,
  Contract,
  ContractAcknowledgement,
  Reservation,
  Room,
  ScheduledRoomTransfer,
  Stay,
  User,
  UtilityPeriod,
  UtilityReading,
  UtilityFinalization,
} from "../models/index.js";
import {
  buildBillingSummary,
  computeLeaseEndDate,
} from "./tenantWorkspace.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  hasReservationStatus,
  readMoveInDate,
  readMoveOutDate,
  utilityEventTypesForQuery,
} from "./lifecycleNaming.js";
import { resolveSecurityDeposit } from "./depositUtils.js";
import {
  activateRoomTransferSuccessor,
  activateRoomTransferSuccessorDraft,
  resolveRoomTransferSuccessor,
} from "../services/contractRoomTransferActivationService.js";
import {
  resolveCurrentBillingCycle,
  sumBillCharges,
  syncBillAmounts,
  roundMoney,
} from "../services/billing/billingPolicy.js";
import {
  CURRENT_STAY_STATUSES,
  resolveCurrentStayForReservation,
  resolveCurrentStayForTenant,
  resolveAuthoritativeCurrentContract,
} from "../services/tenantContractSelectionService.js";
import {
  transitionContract,
  createReplacementContractForTransfer,
  validateContractForGeneration,
  ROOM_TRANSFER_SUCCESSOR_PURPOSES,
  ABANDONED_TRANSFER_SUCCESSOR_STATUSES,
} from "../services/contractService.js";
import { generatePreparedContractPdf } from "../services/contractPdfService.js";
import { calculateRoomTransferRentSettlement } from "../services/billing/roomTransferSettlement.js";
import { calculateRoomTransferDepositSettlement } from "../services/billing/roomTransferDepositSettlement.js";
import {
  resolveApplicablePrepaidRentForTransfer,
  resolveSourceEffectiveRentForTransfer,
} from "../services/billing/prepaidRentResolver.js";
import { createNotification } from "../services/notifications/notificationService.js";
import { branchSupportsSeparateUtilityBilling } from "../config/branches.js";
import { resolveVerifiedSecurityDepositHeld } from "../services/billing/securityDepositEvidenceService.js";
import {
  assertPhysicalMeterContinuity,
  parsePhysicalMeterReading,
} from "./physicalMeterReading.js";
import { resolveRoomUtilityBoundaryContext } from "../services/billing/roomUtilityBoundaryService.js";

// Tolerant wrapper — an unknown branch resolves to `false` (no separate
// billing) rather than throwing, so a preview never fails on a bad branch.
const branchSupportsSeparateUtilityBillingSafe = (branch, utilityType) => {
  try {
    return !!branchSupportsSeparateUtilityBilling(branch, utilityType);
  } catch {
    return false;
  }
};

const normalizeDate = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
};

const parseDateTime = (dateInput, timeInput = "") => {
  const base = new Date(dateInput || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  if (!timeInput) return base;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeInput).trim());
  if (!match) return null;
  base.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return base;
};

export const getMonthlyRent = (reservation) =>
  Number(reservation?.monthlyRent ?? reservation?.roomId?.monthlyPrice ?? reservation?.roomId?.price ?? 0);

async function ensureActiveStay(reservation, actorId = null, session = null, predecessorContract = null) {
  let existingStay = await resolveCurrentStayForReservation(reservation._id, { session });
  if (!existingStay && (reservation.userId?._id || reservation.userId)) {
    const tenantId = reservation.userId?._id || reservation.userId;
    existingStay = await resolveCurrentStayForTenant(tenantId, { session });
  }
  if (existingStay) return existingStay;

  const moveInDate = readMoveInDate(reservation);
  const leaseDuration = Number(reservation?.leaseDuration ?? reservation?.leaseDurationMonths ?? 0);
  if (!moveInDate || leaseDuration <= 0) return null;

  const leaseEndDate = predecessorContract?.leaseEndDate || computeLeaseEndDate(reservation);
  if (!leaseEndDate) return null;

  const stayRoomId = reservation.roomId?._id || reservation.roomId;
  let branch = reservation.roomId?.branch || predecessorContract?.branch || "";
  if (!branch && stayRoomId) {
    const roomDoc = await Room.findById(stayRoomId).session(session).lean();
    if (roomDoc?.branch) branch = roomDoc.branch;
  }
  const stayBedId = reservation.selectedBed?.id || (stayRoomId ? `room-${stayRoomId}` : "bed-1");

  const stay = await Stay.create(
    [
      {
        tenantId: reservation.userId?._id || reservation.userId,
        reservationId: reservation._id,
        branch,
        roomId: stayRoomId,
        bedId: stayBedId,
        leaseStartDate: moveInDate,
        leaseEndDate,
        monthlyRent: getMonthlyRent(reservation) || predecessorContract?.monthlyRent || 0,
        status: hasReservationStatus(reservation.status, "moveOut") ? "completed" : "active",
        endedAt: hasReservationStatus(reservation.status, "moveOut") ? reservation.moveOutDate || null : null,
        endReason: hasReservationStatus(reservation.status, "moveOut") ? "legacy_move_out" : "",
        createdBy: actorId,
        updatedBy: actorId,
      },
    ],
    { session },
  );

  if (typeof reservation.save === "function") {
    reservation.currentStayId = stay[0]._id;
    reservation.latestStayStatus = stay[0].status;
    await reservation.save({ session });
  } else {
    await Reservation.updateOne(
      { _id: reservation._id },
      { $set: { currentStayId: stay[0]._id, latestStayStatus: stay[0].status } },
      { session },
    );
  }

  return stay[0];
}

async function getAvailableRoomsForStay(stay, excludeCurrent = false) {
  if (!stay?.branch) return [];
  const rooms = await Room.find({
    branch: stay.branch,
    isArchived: { $ne: true },
    available: true,
  })
    .select("name roomNumber branch type beds")
    .lean();

  return rooms
    .map((room) => ({
      id: String(room._id),
      name: room.name || room.roomNumber,
      branch: room.branch,
      type: room.type || "",
      beds: (room.beds || [])
        .filter((bed) => bed.status === "available")
        .map((bed) => ({
          id: bed.id || String(bed._id),
          position: bed.position || bed.id || "",
        })),
    }))
    .filter((room) => room.beds.length > 0)
    .filter((room) => !excludeCurrent || String(room.id) !== String(stay.roomId));
}

async function buildActionAvailability({ reservation, stay, billingSummary }) {
  const tenant = await User.findById(reservation.userId).select("tenantStatus").lean();
  const transferRooms = stay ? await getAvailableRoomsForStay(stay, false) : [];
  const hasAvailableBedsInBranch = transferRooms.some((room) =>
    room.beds.some(
      (bed) => String(room.id) !== String(stay?.roomId) || String(bed.id) !== String(stay?.bedId),
    ),
  );
  const activeStay = Boolean(stay && CURRENT_STAY_STATUSES.includes(stay.status));
  const tenantIsInactive = ["inactive", "moved_out"].includes(String(tenant?.tenantStatus || ""));
  const renewalExists = stay
    ? await Stay.exists({
        reservationId: reservation._id,
        previousStayId: stay._id,
        status: { $in: ["active", "ending_soon"] },
      })
    : false;

  const disabled = (reason, blockingCode) => ({
    enabled: false,
    reason,
    blockingCodes: [blockingCode],
  });

  return {
    renew: !activeStay
      ? disabled("Only active stays can be renewed.", "NO_ACTIVE_STAY")
      : tenantIsInactive
        ? disabled("Inactive or moved-out tenants cannot be renewed.", "TENANT_INACTIVE")
        : renewalExists
          ? disabled("A future renewal already exists for this tenant.", "FUTURE_RENEWAL_EXISTS")
          : { enabled: true, reason: "", blockingCodes: [] },
    transfer: !activeStay
      ? { ...disabled("Only active stays can be transferred.", "NO_ACTIVE_STAY"), hasAvailableBedsInBranch }
      : tenantIsInactive
        ? { ...disabled("Inactive or moved-out tenants cannot be transferred.", "TENANT_INACTIVE"), hasAvailableBedsInBranch }
        : renewalExists
          ? { ...disabled("A future renewal already exists for this tenant. Resolve or cancel it before transferring.", "FUTURE_RENEWAL_EXISTS"), hasAvailableBedsInBranch }
          : hasAvailableBedsInBranch
            ? { enabled: true, reason: "", blockingCodes: [], hasAvailableBedsInBranch }
            : { ...disabled("No available same-branch bed is available for transfer.", "NO_AVAILABLE_BED"), hasAvailableBedsInBranch },
    moveOut: !activeStay
      ? disabled("Only active stays can be moved out.", "NO_ACTIVE_STAY")
      : tenantIsInactive
        ? disabled("Tenant is already inactive or moved out.", "TENANT_INACTIVE")
        : {
            enabled: true,
            reason: billingSummary.hasOutstanding || billingSummary.hasPendingVerification
              ? "Outstanding billing will remain for final settlement after move-out."
              : "",
            blockingCodes: [],
          },
  };
}

/**
 * Read-only Room Transfer financial preview — the numbers the Admin sees on
 * the "Review & Settlement" step BEFORE confirming. Runs the SAME canonical
 * pure math the real transfer runs (roomTransferSettlement +
 * roomTransferDepositSettlement + prepaidRentResolver), so the preview and
 * the executed settlement always agree. Mutates nothing.
 *
 * Returns null when it cannot be computed (no target room, unsupported room
 * type, missing lease term) rather than guessing.
 */
export async function computeRoomTransferPreview({
  reservationId,
  targetRoomId,
  effectiveTransferDate,
  // When the caller is about to perform (or is simulating) the ACTUAL cutover
  // — e.g. completeRoomTransfer on the transfer day, possibly delayed past the
  // scheduled date — pass `asOfCutoverDate`. Rent/deposit proration, the
  // billing cycle and the settlement total are then computed as of that day,
  // matching what transferStayWorkflow will do with its transaction-local
  // cutoverAt. Omitted => the scheduled `effectiveTransferDate` is used (the
  // scheduling-time preview).
  asOfCutoverDate = null,
  depositHeldOverride = null,
  destinationApprovedRateOverride = null,
  requireVerifiedDeposit = false,
}) {
  if (!targetRoomId) return null;
  const [reservation, targetRoom] = await Promise.all([
    Reservation.findById(reservationId).populate("roomId", "name roomNumber branch type price monthlyPrice").lean(),
    Room.findById(targetRoomId).lean(),
  ]);
  if (!reservation || !targetRoom) return null;

  const activeStay = await resolveCurrentStayForReservation(reservationId).lean();
  const predecessorContract = await resolveAuthoritativeCurrentContract({
    reservationId, tenantId: reservation.userId,
  });
  const transferDate =
    normalizeDate(asOfCutoverDate) || normalizeDate(effectiveTransferDate) || new Date();
  const moveInDate = readMoveInDate(reservation) || predecessorContract?.leaseStartDate || activeStay?.leaseStartDate || null;
  const leaseEndDate = activeStay?.leaseEndDate || predecessorContract?.leaseEndDate || computeLeaseEndDate(reservation);
  const leaseDurationMonths =
    predecessorContract?.leaseDurationMonths ||
    (moveInDate && leaseEndDate ? Math.max(1, dayjs(leaseEndDate).diff(dayjs(moveInDate), "month")) : 12);

  // Destination approved rate — the same authoritative table
  // createReplacementContractForTransfer uses (never the mutable Room price).
  let destinationApprovedRate = Number.isFinite(Number(destinationApprovedRateOverride))
    ? roundMoney(Number(destinationApprovedRateOverride))
    : 0;
  if (!(destinationApprovedRate > 0)) {
    try {
      const { resolveAuthoritativeLeasePricing } = await import("../services/contractPricingResolver.js");
      const { getBusinessSettings } = await import("./businessSettings.js");
      const settings = await getBusinessSettings().catch(() => ({}));
      const pricing = resolveAuthoritativeLeasePricing({
        room: targetRoom, roomType: targetRoom.type, branch: targetRoom.branch, leaseDurationMonths, settings,
      });
      destinationApprovedRate = roundMoney(Number(pricing.finalMonthlyRate) || 0);
    } catch {
      destinationApprovedRate = roundMoney(Number(targetRoom.monthlyPrice ?? targetRoom.price) || 0);
    }
  }
  if (!(destinationApprovedRate > 0)) return null;

  const currentBillingCycle = moveInDate
    ? resolveCurrentBillingCycle(moveInDate, transferDate)
    : null;
  const { sourceEffectiveRate, sourceRateSource } = resolveSourceEffectiveRentForTransfer({
    reservation, predecessorContract, activeStay,
  });
  if (!(sourceEffectiveRate > 0)) {
    throw Object.assign(
      new Error("The tenant's current approved rent cannot be verified. Review the active Stay, current Contract, and Reservation pricing before transferring."),
      {
        statusCode: 409,
        code: "ROOM_TRANSFER_CURRENT_RENT_UNVERIFIED",
        manualReviewRequired: true,
      },
    );
  }
  const prepaidResolution = await resolveApplicablePrepaidRentForTransfer({
    reservation, sourceEffectiveRate, currentBillingCycle,
  });
  if (prepaidResolution.requiresManualReview) {
    throw Object.assign(
      new Error("The first-period advance payment cannot be verified. Review the initial payment before transferring this tenant."),
      {
        statusCode: 409,
        code: prepaidResolution.manualReviewReason || "ROOM_TRANSFER_ADVANCE_PAYMENT_UNVERIFIED",
        manualReviewRequired: true,
      },
    );
  }
  const {
    applicablePrepaidRent,
    prepaidRentSource,
    sourceBillId: rentCoverageBillId,
    sourceBillType: rentCoverageBillType,
  } = prepaidResolution;
  const settlement = calculateRoomTransferRentSettlement({
    periodStart: currentBillingCycle?.billingCycleStart || transferDate,
    periodEnd: currentBillingCycle?.billingCycleEnd || transferDate,
    transferDate,
    sourceApprovedRate: sourceEffectiveRate,
    destinationApprovedRate,
    applicablePrepaidRent,
  });

  // Deposit — REQUIRED (1x destination rate) vs HELD (actual cash).
  // `depositHeldOverride` lets the scheduled-transfer executor recompute the
  // ADDITIONAL-deposit-due against the held amount as it stood BEFORE the
  // pre-paid Scheduled Transfer Balance Bill funded it — so a paid deposit
  // component is not mistaken for "requirement dropped" (see Phase 2G #13).
  const destinationRequiredDeposit = roundMoney(destinationApprovedRate);
  const explicitOverride =
    depositHeldOverride != null && Number.isFinite(Number(depositHeldOverride))
      ? roundMoney(Number(depositHeldOverride))
      : null;
  const depositEvidence = explicitOverride !== null
    ? {
        classification: "VERIFIED",
        heldKnown: true,
        amount: explicitOverride,
        source: "verified_completion_override",
      }
    : await resolveVerifiedSecurityDepositHeld({ reservation });
  const depositHeld = depositEvidence.heldKnown ? depositEvidence.amount : null;
  const depositHeldKnown = depositEvidence.heldKnown === true && Number.isFinite(depositHeld);
  if (!depositHeldKnown && requireVerifiedDeposit) {
    throw Object.assign(
      new Error("Verify the tenant's recorded security deposit through payment/deposit records before completing the transfer."),
      {
        statusCode: 409,
        code: "ROOM_TRANSFER_DEPOSIT_HELD_UNVERIFIED",
        manualReviewRequired: true,
      },
    );
  }
  const depositSettlement = depositHeldKnown
    ? calculateRoomTransferDepositSettlement({
        depositCurrentlyHeld: depositHeld,
        destinationRequiredDeposit,
      })
    : null;

  // Source + destination electricity meter state, for the Complete Transfer
  // modal's "Enter Meter Reading" step. `_baselineReading` = the current open
  // period's opening reading (the "previous reading" the admin confirms
  // consumption against); `ratePerUnit` = the configured rate.
  const sourceRoomId = activeStay?.roomId || reservation.roomId?._id || reservation.roomId;
  const sourceHistory = await BedHistory.findOne({
    reservationId: reservation._id,
    roomId: sourceRoomId,
    status: "active",
  }).sort({ moveInDate: -1 }).lean();
  const sourceScopedEntry = sourceHistory?.effectiveStartDate || sourceHistory?.moveInDate || null;
  const [srcOpenPeriod, dstOpenPeriod, srcLastReading, dstLastReading, sourceMoveInReading] = await Promise.all([
    UtilityPeriod.findOne({ roomId: sourceRoomId, utilityType: "electricity", status: "open" })
      .sort({ startDate: -1 }).select("ratePerUnit startReading startDate").lean(),
    UtilityPeriod.findOne({ roomId: targetRoom._id, utilityType: "electricity", status: "open" })
      .sort({ startDate: -1 }).select("ratePerUnit startReading startDate").lean(),
    UtilityReading.findOne({
      roomId: sourceRoomId, utilityType: "electricity", isArchived: false, date: { $lte: transferDate },
    }).sort({ date: -1, createdAt: -1 }).select("reading date").lean(),
    UtilityReading.findOne({
      roomId: targetRoom._id, utilityType: "electricity", isArchived: false, date: { $lte: transferDate },
    }).sort({ date: -1, createdAt: -1 }).select("reading date").lean(),
    UtilityReading.findOne({
      roomId: sourceRoomId,
      utilityType: "electricity",
      tenantId: reservation.userId?._id || reservation.userId,
      eventType: "moveIn",
      isArchived: false,
      date: { $lte: transferDate },
    }).sort({ date: -1, createdAt: -1 }).select("reading date").lean(),
  ]);

  const sourceBranch = reservation.roomId?.branch || "";
  const sourceSubMetered = branchSupportsSeparateUtilityBillingSafe(sourceBranch, "electricity");
  const destSubMetered = branchSupportsSeparateUtilityBillingSafe(targetRoom.branch, "electricity");
  const enteredDuringOpenPeriod = Boolean(
    sourceScopedEntry &&
    srcOpenPeriod?.startDate &&
    new Date(sourceScopedEntry) > new Date(srcOpenPeriod.startDate),
  );
  const hasMatchingScopedOpening = Boolean(
    sourceMoveInReading?.date &&
    sourceScopedEntry &&
    dayjs(sourceMoveInReading.date).isSame(dayjs(sourceScopedEntry), "day"),
  );
  const tenantOpeningReading = enteredDuringOpenPeriod
    ? (hasMatchingScopedOpening ? Number(sourceMoveInReading.reading) : null)
    : (srcOpenPeriod?.startReading != null ? Number(srcOpenPeriod.startReading) : null);

  const rentAdjustmentDue = roundMoney(settlement.additionalAmountDue);
  const excessRentCredit = roundMoney(settlement.excessCredit);
  const additionalDepositDue = depositSettlement
    ? roundMoney(depositSettlement.additionalDepositDue)
    : null;
  // The immediate figure the admin acts on at scheduling time: rent adjustment
  // + additional deposit. The FINALIZED source-room electricity is added to the
  // required-to-settle amount on the transfer day (Complete Transfer), not
  // here — the fresh closing reading is not known at preview/scheduling time.
  const totalImmediateDue = depositHeldKnown
    ? roundMoney(rentAdjustmentDue + additionalDepositDue)
    : null;

  return {
    fromRoom: { id: String(sourceRoomId), name: reservation.roomId?.name || reservation.roomId?.roomNumber || "", type: reservation.roomId?.type || "" },
    toRoom: { id: String(targetRoom._id), name: targetRoom.name || targetRoom.roomNumber || "", type: targetRoom.type || "" },
    effectiveTransferDate: transferDate,
    leaseStartDate: moveInDate || null,
    leaseEndDate: leaseEndDate || null,
    // The move-in-anchored rent cycle the transfer date falls in — used to
    // stamp billingCycleStart/End on a Scheduled Room Transfer Balance Bill so
    // it lines up with the settlement the executor later recomputes.
    billingCycle: currentBillingCycle
      ? {
          billingCycleStart: currentBillingCycle.billingCycleStart,
          billingCycleEnd: currentBillingCycle.billingCycleEnd,
          cycleIndex: currentBillingCycle.cycleIndex ?? null,
        }
      : null,
    rent: {
      sourceEffectiveRate: roundMoney(sourceEffectiveRate),
      sourceRateSource,
      destinationApprovedRate,
      applicablePrepaidRent: roundMoney(applicablePrepaidRent),
      prepaidRentSource,
      coverageBillId: rentCoverageBillId ? String(rentCoverageBillId) : null,
      coverageBillType: rentCoverageBillType || null,
      rentLiabilityForPeriod: roundMoney(settlement.rentLiabilityForPeriod),
      destinationProratedValue: roundMoney(settlement.destinationProratedValue),
      unusedPrepaidCredit: roundMoney(settlement.unusedPrepaidCredit),
      adjustmentDue: rentAdjustmentDue,            // charges.rent on the settlement Bill
      // Backward-compatible amount field; this is now disclosure-only and is
      // never converted into TenantCredit automatically.
      excessCredit: excessRentCredit,
      potentialAdjustment: excessRentCredit,
      adjustmentHandling:
        excessRentCredit > 0 ? "administration_office_2nd_floor" : null,
      sourceDays: settlement.sourceDays,
      destinationDays: settlement.destinationDays,
      totalCoverageDays: settlement.totalCoverageDays,
    },
    deposit: {
      required: destinationRequiredDeposit,
      held: depositHeldKnown ? roundMoney(depositHeld) : null,  // null = legacy, unknown — UI shows "Unavailable"
      heldKnown: depositHeldKnown,
      heldSource: depositEvidence.source || null,
      evidenceClassification: depositEvidence.classification || "UNKNOWN",
      balanceDue: additionalDepositDue,            // charges.securityDeposit on the settlement Bill
      excessHeld: depositSettlement ? roundMoney(depositSettlement.excessDepositHeld) : null,
      excessHandling:
        depositSettlement?.excessDepositHeld > 0
          ? "administration_office_2nd_floor"
          : null,
    },
    electricity: {
      // SOURCE room — the transferee's accrued liability is FINALIZED on the
      // transfer_settlement Bill on transfer day (sub-metered branch), from the
      // fresh closing reading the admin enters during Complete Transfer. It is
      // NOT in totalImmediateDue here (that reading is not known yet).
      subMetered: sourceSubMetered,
      finalizedAtTransfer: sourceSubMetered,
      ratePerUnit: Number(srcOpenPeriod?.ratePerUnit ?? 0) || null,
      openPeriodId: srcOpenPeriod?._id ? String(srcOpenPeriod._id) : null,
      // The "previous reading" the admin confirms consumption against.
      previousReading:
        tenantOpeningReading ?? (srcLastReading?.reading ?? null),
      tenantOpeningReading,
      tenantOpeningReadingMissing: sourceSubMetered && enteredDuringOpenPeriod && !hasMatchingScopedOpening,
      roomScopedEntryDate: sourceScopedEntry,
      lastRecordedReading: srcLastReading?.reading ?? null,
      lastRecordedReadingDate: srcLastReading?.date ?? null,
      note: sourceSubMetered
        ? "Enter the CURRENT (closing) source-room electricity reading during Complete Transfer. The tenant's accrued electricity is finalized on the transfer settlement — it is NOT re-billed at the normal period close."
        : "This branch bills electricity at a fixed rate — no separate source-room electricity settlement applies to this transfer.",
      _baselineReading: srcOpenPeriod?.startReading ?? srcLastReading?.reading ?? null,
    },
    destinationElectricity: {
      // DESTINATION room — the admin enters/confirms the CURRENT reading during
      // Complete Transfer; it becomes the transferee's OPENING baseline there.
      subMetered: destSubMetered,
      required: destSubMetered,
      ratePerUnit: Number(dstOpenPeriod?.ratePerUnit ?? 0) || null,
      openPeriodId: dstOpenPeriod?._id ? String(dstOpenPeriod._id) : null,
      currentReading:
        dstLastReading?.reading != null
          ? Number(dstLastReading.reading)
          : (dstOpenPeriod?.startReading ?? null),
      lastRecordedReadingDate: dstLastReading?.date ?? null,
      note: destSubMetered
        ? "Enter/confirm the CURRENT destination-room electricity reading during Complete Transfer — it becomes the tenant's opening baseline there."
        : "This branch bills electricity at a fixed rate — no destination opening reading is required.",
    },
    destinationWater: {required:requiresWaterObservation(targetRoom)},
    water: {
      required:requiresWaterObservation(reservation.roomId),
      // Water CANNOT be finalized on transfer day — its period total and
      // covered-day denominator are unknowable until the water period closes.
      // The transferee is billed for their room-scoped occupancy days at the
      // normal water period close; nothing is added to the amount due now.
      billedAtPeriodClose: true,
      finalizedAtTransfer: false,
      separatelyBilled: branchSupportsSeparateUtilityBillingSafe(sourceBranch, "water"),
      note: "Old-room water (where separately billed) is settled at its normal water period close, using the saved calculation version and measured occupancy boundaries. It is NOT included in the amount due now and is not double-charged. Where water is included in rent, no water settlement applies.",
    },
    totalImmediateDue,
  };
}

/**
 * Server-authoritative transfer-candidate list for the Transfer modal's room
 * selector. Room Management remains the availability AUTHORITY — this reads the
 * SAME persisted Room state (capacity / currentOccupancy / per-bed status /
 * maintenance / blocked) plus open scheduled-transfer holds and reservation
 * conflicts for the chosen date. React only maps availabilityStatus -> colour.
 *
 * availabilityStatus:
 *   "available"             GREEN  — selectable
 *   "current_room"          (excluded — shown disabled "current room")
 *   "fully_occupied"        RED    — currentOccupancy >= capacity
 *   "fully_reserved"        RED    — every bed reserved / held
 *   "reservation_conflict"  RED    — a reservation / pending move-in OVERLAPS the
 *                                    transferee's expected destination-occupancy
 *                                    interval (not merely "exists")
 *   "no_available_bed"      RED    — shared room, no available bed
 *   "maintenance"           GRAY   — room or all beds under maintenance
 *   "blocked"               GRAY   — room flagged unavailable / archived-adjacent
 *
 * RESERVATION-CONFLICT WINDOW (audit item 2): a destination is only RED for a
 * reservation conflict when that other reservation's occupancy window actually
 * OVERLAPS the transferee's expected destination-occupancy interval
 * `[transferDate, transfereeEnd)`. `transfereeEnd` is the canonical lease
 * boundary the transfer carries forward — `activeStay.leaseEndDate` ->
 * `predecessorContract.leaseEndDate` -> `computeLeaseEndDate(reservation)` — or
 * open-ended (+infinity) when none is known. Another reservation ending on or
 * before `transferDate`, or beginning on/after `transfereeEnd`, does not block.
 * An unknown other-reservation end is treated conservatively as +infinity.
 *
 * @param {Object} args
 * @param {Object} args.reservation      lean reservation (roomId populated)
 * @param {Object} [args.stayLike]       resolved active stay / stay-shaped fallback
 * @param {Date}   [args.effectiveTransferDate]
 */
export async function buildTransferCandidates({ reservation, stayLike = null, effectiveTransferDate }) {
  const branch = reservation.roomId?.branch;
  if (!branch) return [];
  const currentRoomId = String(reservation.roomId?._id || reservation.roomId || "");
  const transferDate = normalizeDate(effectiveTransferDate) || normalizeDate(new Date());

  // Transferee's expected destination-occupancy interval end. The transfer
  // carries the existing lease term forward unchanged, so this is the current
  // stay / predecessor-contract lease end. null => open-ended (+infinity).
  const transfereeEndRaw =
    stayLike?.leaseEndDate ||
    computeLeaseEndDate(reservation) ||
    null;
  const transfereeEnd = transfereeEndRaw ? normalizeDate(transfereeEndRaw) : null;

  const overlapsTransfereeInterval = (otherReservation) => {
    const otherStartRaw =
      otherReservation.leaseStartDate ||
      otherReservation.expectedMoveInDate ||
      otherReservation.moveInDate ||
      null;
    const otherEndRaw =
      readMoveOutDate(otherReservation) ||
      computeLeaseEndDate(otherReservation) ||
      null;
    const start = otherStartRaw ? normalizeDate(otherStartRaw) : transferDate;
    const end = otherEndRaw ? normalizeDate(otherEndRaw) : null;
    // Half-open intervals: [otherStart, otherEnd) vs [transferDate, transfereeEnd).
    if (end && end.getTime() <= transferDate.getTime()) return false;
    if (transfereeEnd && start && start.getTime() >= transfereeEnd.getTime()) return false;
    return true;
  };

  const [rooms, holdsByRoom, conflictingReservations] = await Promise.all([
    Room.find({ branch, isArchived: { $ne: true } })
      .select("name roomNumber branch type capacity currentOccupancy available status beds maintenanceStatus isBlocked")
      .lean(),
    (await import("../services/scheduledRoomTransferService.js")).openHoldsByRoom(null),
    // Reservations / pending move-ins in this branch (excluding the transferring
    // tenant). Interval overlap is applied below, not a blanket "exists".
    Reservation.find({
      _id: { $ne: reservation._id },
      status: { $in: ["reserved", "approved_for_payment", "moveIn"] },
      isArchived: { $ne: true },
    })
      .populate("roomId", "branch")
      .select("roomId selectedBed status moveInDate expectedMoveInDate leaseStartDate moveOutDate leaseDuration")
      .lean(),
  ]);

  const conflictBedKeys = new Set();
  const conflictRoomCounts = new Map();
  for (const r of conflictingReservations) {
    if ((r.roomId?.branch || null) && r.roomId.branch !== branch) continue;
    const rid = String(r.roomId?._id || r.roomId || "");
    if (!rid) continue;

    if (!overlapsTransfereeInterval(r)) continue;

    conflictRoomCounts.set(rid, (conflictRoomCounts.get(rid) || 0) + 1);
    const bedId = r.selectedBed?.id;
    if (bedId) conflictBedKeys.add(`${rid}::${String(bedId)}`);
  }

  const candidates = [];
  for (const room of rooms) {
    const roomId = String(room._id);
    const requiresBedSelection = roomTypeRequiresBed(room.type);
    const capacity = Number(room.capacity || 0);
    const occ = Number(room.currentOccupancy || 0);
    const openHolds = (holdsByRoom.get(roomId) || []).length;
    const effectiveOcc = occ; // holds are already in currentOccupancy

    let availabilityStatus = "available";
    let unavailableReason = null;
    let selectable = true;

    const roomUnderMaintenance =
      room.status === "maintenance" ||
      room.maintenanceStatus === "under_maintenance" ||
      (room.beds || []).length > 0 && (room.beds || []).every((b) => b.status === "maintenance");
    const roomBlocked = room.isBlocked === true || room.status === "blocked" || room.available === false && effectiveOcc < capacity && !roomUnderMaintenance;

    if (roomId === currentRoomId) {
      availabilityStatus = "current_room";
      unavailableReason = "This is the tenant's current room. Please select a different destination room.";
      selectable = false;
    } else if (roomUnderMaintenance) {
      availabilityStatus = "maintenance";
      unavailableReason = "This room is currently under maintenance. Please select another room.";
      selectable = false;
    } else if (roomBlocked) {
      availabilityStatus = "blocked";
      unavailableReason = "This room is currently blocked from new assignments. Please select another room.";
      selectable = false;
    } else if (capacity > 0 && effectiveOcc >= capacity) {
      availabilityStatus = "fully_occupied";
      unavailableReason = `This room is fully occupied (${effectiveOcc}/${capacity} occupants). Please choose another room.`;
      selectable = false;
    } else if ((conflictRoomCounts.get(roomId) || 0) + effectiveOcc >= capacity && capacity > 0) {
      availabilityStatus = "reservation_conflict";
      unavailableReason = "This room is already reserved for the selected date. Please select another room or adjust the transfer date.";
      selectable = false;
    } else if (requiresBedSelection) {
      const beds = (room.beds || []).map((b, i) => {
        const bedId = String(b.id || b._id || `bed-${i + 1}`);
        const key = `${roomId}::${bedId}`;
        let bedStatus = b.status || "available";
        let bedSelectable = bedStatus === "available";
        let bedReason = null;
        if (bedStatus === "maintenance") bedReason = "This bed is currently under maintenance. Please choose another bed.";
        else if (bedStatus === "reserved") bedReason = "This bed is currently reserved or on hold. Please choose another bed.";
        else if (conflictBedKeys.has(key)) {
          bedStatus = "reserved";
          bedSelectable = false;
          bedReason = "A reservation covers this bed for the selected date. Please choose another bed or adjust the transfer date.";
        }
        return {
          bedId,
          label: b.position || b.label || bedId,
          status: bedStatus,
          selectable: bedSelectable,
          unavailableReason: bedSelectable ? null : bedReason,
        };
      });
      const anyBed = beds.some((b) => b.selectable);
      if (!anyBed) {
        availabilityStatus = beds.every((b) => b.status === "reserved") ? "fully_reserved" : "no_available_bed";
        unavailableReason = availabilityStatus === "fully_reserved"
          ? "All beds in this room are currently reserved. Please choose another room or adjust the transfer date."
          : "No available beds in this room. Please choose another room.";
        selectable = false;
      }
      candidates.push({
        roomId,
        roomNumber: room.roomNumber || "",
        name: room.name || room.roomNumber || "",
        type: room.type || "",
        branch: room.branch,
        capacity,
        currentOccupancy: effectiveOcc,
        openHolds,
        requiresBedSelection: true,
        availabilityStatus,
        selectable,
        unavailableReason,
        beds,
      });
      continue;
    }

    candidates.push({
      roomId,
      roomNumber: room.roomNumber || "",
      name: room.name || room.roomNumber || "",
      type: room.type || "",
      branch: room.branch,
      capacity,
      currentOccupancy: effectiveOcc,
      openHolds,
      requiresBedSelection: false,
      availabilityStatus,
      selectable,
      unavailableReason,
      beds: [],
    });
  }

  // Stable order: selectable first, then by room number.
  candidates.sort((a, b) => {
    if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
    return String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
  });
  return candidates;
}

export async function getTenantActionContext(reservationId, previewParams = null) {
  const reservation = await Reservation.findById(reservationId)
    .populate("roomId", "name roomNumber branch beds monthlyPrice price type")
    .populate("userId", "firstName lastName email phone tenantStatus")
    .lean();
  if (!reservation) return null;

  const activeStay =
    (await resolveCurrentStayForReservation(reservationId).lean()) || reservation;

  const stayLike = activeStay._id && activeStay.leaseStartDate
    ? activeStay
    : {
        _id: reservation.currentStayId || null,
        roomId: reservation.roomId?._id || reservation.roomId,
        bedId: reservation.selectedBed?.id || "",
        branch: reservation.roomId?.branch || "",
        leaseStartDate: readMoveInDate(reservation),
        leaseEndDate: computeLeaseEndDate(reservation),
        status: hasReservationStatus(reservation.status, "moveOut") ? "completed" : "active",
      };

  const sourceRoomId = reservation.roomId?._id || reservation.roomId;

  const [bills, renewalHistory, availableRooms, sourceRoomLatestReading, activeUtilityPeriod] = await Promise.all([
    Bill.find({
      reservationId,
      isArchived: { $ne: true },
    }).lean(),
    Stay.find({ reservationId }).sort({ leaseStartDate: -1 }).lean(),
    getAvailableRoomsForStay(stayLike, false),
    // Fetch the latest meter reading for the source room (any tenant) — this is
    // the true billing baseline the engine uses, not restricted to current tenant.
    UtilityReading.findOne({
      roomId: sourceRoomId,
      utilityType: "electricity",
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    // Fetch the active electricity UtilityPeriod for this room to expose ratePerUnit
    // to the frontend for live settlement cost estimation.
    UtilityPeriod.findOne({
      roomId: sourceRoomId,
      utilityType: "electricity",
      status: "open",
    })
      .sort({ startDate: -1 })
      .select("ratePerUnit")
      .lean(),
  ]);

  const billingSummary = buildBillingSummary(bills);
  const allowedActions = await buildActionAvailability({
    reservation,
    stay: stayLike,
    billingSummary,
  });

  // Additive: when the Transfer modal passes a candidate targetRoomId (+
  // optional effectiveTransferDate), include the canonical financial preview
  // so the admin sees the real rent-adjustment / additional-deposit /
  // required-vs-held numbers rather than a hand-rolled front-end estimate.
  let transferPreview = null;
  if (previewParams?.targetRoomId) {
    try {
      transferPreview = await computeRoomTransferPreview({
        reservationId,
        targetRoomId: previewParams.targetRoomId,
        effectiveTransferDate: previewParams.effectiveTransferDate,
      });
    } catch (err) {
      logger.warn({ err, reservationId }, "[getTenantActionContext] transfer preview failed (non-fatal)");
      transferPreview = null;
    }
  }

  // Server-authoritative room selector data (GREEN / RED / GRAY) for the
  // Transfer modal. Opt-in — base callers don't pay for it.
  let transferCandidates = null;
  if (previewParams?.includeCandidates) {
    try {
      transferCandidates = await buildTransferCandidates({
        reservation,
        stayLike,
        effectiveTransferDate: previewParams.effectiveTransferDate,
      });
    } catch (err) {
      logger.warn({ err, reservationId }, "[getTenantActionContext] transfer candidates failed (non-fatal)");
      transferCandidates = null;
    }
  }

  return {
    reservationId: String(reservation._id),
    transferPreview,
    transferCandidates,
    tenantId: String(reservation.userId?._id || reservation.userId || ""),
    tenantName:
      `${reservation.userId?.firstName || reservation.firstName || ""} ${reservation.userId?.lastName || reservation.lastName || ""}`.trim(),
    tenantStatus: reservation.userId?.tenantStatus || "applicant",
    currentStay: {
      id: String(stayLike._id || ""),
      status: stayLike.status || "active",
      leaseStartDate: stayLike.leaseStartDate || readMoveInDate(reservation),
      leaseEndDate: stayLike.leaseEndDate || computeLeaseEndDate(reservation),
      monthlyRent: Number(stayLike.monthlyRent ?? getMonthlyRent(reservation)),
      branch: stayLike.branch || reservation.roomId?.branch || "",
      roomId: String(stayLike.roomId || reservation.roomId?._id || ""),
      room: reservation.roomId?.name || reservation.roomId?.roomNumber || "",
      bedId: stayLike.bedId || reservation.selectedBed?.id || "",
      bed: reservation.selectedBed?.position || reservation.selectedBed?.id || "",
    },
    billingSummary,
    // Renamed from latestUtilityReading — now returns the room-level baseline
    // (not tenant-filtered) so the Transfer modal can pre-fill the source meter.
    sourceRoomLatestReading: sourceRoomLatestReading
      ? {
          reading: sourceRoomLatestReading.reading,
          date: sourceRoomLatestReading.date,
          eventType: sourceRoomLatestReading.eventType,
          roomId: String(sourceRoomId),
        }
      : null,
    // Keep legacy alias so any existing consumers don't break.
    latestUtilityReading: sourceRoomLatestReading
      ? {
          reading: sourceRoomLatestReading.reading,
          date: sourceRoomLatestReading.date,
          eventType: sourceRoomLatestReading.eventType,
        }
      : null,
    // The active ₱/kWh electricity rate for this room — used by the frontend
    // wizard to compute live settlement estimates without a full billing pass.
    electricityRatePerUnit: Number(activeUtilityPeriod?.ratePerUnit ?? 0) || null,
    availableRooms,
    allowedActions,
    renewalHistory: renewalHistory.map((stay) => ({
      id: String(stay._id),
      status: stay.status,
      leaseStartDate: stay.leaseStartDate,
      leaseEndDate: stay.leaseEndDate,
      monthlyRent: stay.monthlyRent,
      previousStayId: stay.previousStayId ? String(stay.previousStayId) : null,
      endedAt: stay.endedAt || null,
    })),
  };
}

export async function renewStayWorkflow({ reservationId, payload, actorId }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findById(reservationId)
        .populate("roomId", "name roomNumber branch monthlyPrice price")
        .populate("userId", "firstName lastName email tenantStatus")
        .session(session);
      if (!reservation) {
        throw Object.assign(new Error("Reservation not found"), { statusCode: 404, code: "RESERVATION_NOT_FOUND" });
      }
      if (!hasReservationStatus(reservation.status, "moveIn")) {
        throw Object.assign(new Error("Only active moved-in tenants can be renewed."), { statusCode: 400, code: "INVALID_STATUS_FOR_RENEWAL" });
      }

      const predecessorContract = await resolveAuthoritativeCurrentContract({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
      }).catch(() => null);
      const activeStay = await ensureActiveStay(reservation, actorId, session, predecessorContract);
      if (!activeStay || !CURRENT_STAY_STATUSES.includes(activeStay.status)) {
        throw Object.assign(new Error("No active stay found for renewal."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
      }
      if (["inactive", "moved_out"].includes(String(reservation.userId?.tenantStatus || ""))) {
        throw Object.assign(new Error("Inactive or moved-out tenants cannot be renewed."), { statusCode: 400, code: "TENANT_INACTIVE" });
      }
      if (!payload?.confirm) {
        throw Object.assign(new Error("Renewal confirmation is required."), { statusCode: 400, code: "CONFIRM_REQUIRED" });
      }

      const newLeaseStartDate = normalizeDate(payload.newLeaseStartDate);
      const newLeaseEndDate = normalizeDate(payload.newLeaseEndDate, true);
      if (!newLeaseStartDate || !newLeaseEndDate || newLeaseEndDate <= newLeaseStartDate) {
        throw Object.assign(new Error("Valid renewal start and end dates are required."), { statusCode: 400, code: "INVALID_RENEWAL_DATES" });
      }
      if (!dayjs(newLeaseStartDate).isAfter(dayjs(activeStay.leaseEndDate), "day")) {
        throw Object.assign(new Error("Renewal start date must be after the current lease end date."), { statusCode: 400, code: "RENEWAL_START_OVERLAP" });
      }

      const overlap = await Stay.findOne({
        tenantId: reservation.userId?._id || reservation.userId,
        _id: { $ne: activeStay._id },
        leaseStartDate: { $lte: newLeaseEndDate },
        leaseEndDate: { $gte: newLeaseStartDate },
      }).session(session);
      if (overlap) {
        throw Object.assign(new Error("The renewal dates overlap an existing stay record."), { statusCode: 409, code: "STAY_DATE_OVERLAP" });
      }

      const existingFutureRenewal = await Stay.findOne({
        reservationId: reservation._id,
        previousStayId: activeStay._id,
      }).session(session);
      if (existingFutureRenewal) {
        throw Object.assign(new Error("A future renewal already exists for this tenant."), { statusCode: 409, code: "FUTURE_RENEWAL_EXISTS" });
      }

      activeStay.status = "renewed";
      activeStay.endedAt = newLeaseStartDate;
      activeStay.endReason = "renewed";
      activeStay.renewalNotes = payload.notes || "";
      activeStay.updatedBy = actorId;
      await activeStay.save({ session });

      const renewalRoomId = reservation.roomId?._id || reservation.roomId;
      // Stay.bedId is a required String — `""` is rejected. The renewed Stay
      // must carry the SAME bed representation the current Stay uses: a real
      // bed id for a shared room, or the canonical private-room sentinel
      // `room-<roomId>` (the room-transfer flow already writes this to
      // activeStay.bedId for a private destination). Prefer the current
      // Stay's bedId; else the reservation's selected bed; else the sentinel.
      const renewalBedId =
        activeStay.bedId ||
        reservation.selectedBed?.id ||
        `room-${renewalRoomId}`;
      const [newStay] = await Stay.create(
        [
          {
            tenantId: reservation.userId?._id || reservation.userId,
            reservationId: reservation._id,
            branch: reservation.roomId?.branch || "",
            roomId: renewalRoomId,
            bedId: renewalBedId,
            leaseStartDate: newLeaseStartDate,
            leaseEndDate: newLeaseEndDate,
            monthlyRent: Number(payload.monthlyRent ?? getMonthlyRent(reservation)),
            status: "active",
            previousStayId: activeStay._id,
            renewalOfferId: payload.renewalOfferId || null,
            renewalNotes: payload.notes || "",
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );

      const activeHistory = await BedHistory.findOne({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
        status: "active",
      })
        .sort({ moveInDate: -1 })
        .session(session);
      if (activeHistory && !activeHistory.stayId) {
        activeHistory.stayId = newStay._id;
        await activeHistory.save({ session });
      }

      reservation.currentStayId = newStay._id;
      reservation.latestStayStatus = "active";

      // Ensure declared appliance add-ons cleanly carry over during lease renewals within Guadalupe
      const renewalBranch = String(reservation.roomId?.branch || reservation.branch || "").toLowerCase();
      if (renewalBranch === "guadalupe") {
        reservation.selectedAppliances = reservation.selectedAppliances || [];
        reservation.applianceFees = Number(reservation.applianceFees || 0);
        if (payload?.successorReservationId) {
          const succRes = await Reservation.findById(payload.successorReservationId).session(session);
          if (succRes) {
            succRes.selectedAppliances = Array.isArray(reservation.selectedAppliances)
              ? JSON.parse(JSON.stringify(reservation.selectedAppliances))
              : [];
            succRes.applianceFees = Number(reservation.applianceFees || 0);
            if (succRes.monthlyRent != null) {
              succRes.totalPrice = Number(succRes.monthlyRent) + Number(succRes.applianceFees);
            }
            await succRes.save({ session });
          }
        }
      }

      // Deliberately NOT updating reservation.monthlyRent here — it remains
      // the billing source of truth for the CURRENT (pre-renewal) period.
      // rentGenerator.resolveReservationRentAmount reads it live at bill
      // generation time, which can happen up to RENT_GENERATION_LEAD_DAYS
      // before a cycle even starts, so writing the new rate immediately at
      // acceptance (often weeks before newLeaseStartDate) would let it leak
      // into current-period bills. The approved new rate is already
      // durably captured on the renewal successor Contract's
      // approvedMonthlyRate (createSuccessorContractForRenewal /
      // autoGenerateRenewalContract, triggered below) and is applied to
      // reservation.monthlyRent exactly once, atomically, by
      // contractRenewalActivationService.activateDueRenewalContracts at the
      // successor's actual leaseStartDate.
      await reservation.save({ session });

      result = {
        reservation,
        previousStay: activeStay.toObject(),
        stay: newStay.toObject(),
      };
    });
  } finally {
    await session.endSession();
  }

  // ── Automated Renewal Successor Contract Generation ──────────────────────
  // Fire-and-forget, mirrors transferStayWorkflow's post-transaction contract
  // trigger below. Never touches the old Contract's status/isCurrent — see
  // createSuccessorContractForRenewal's comment (contractService.js).
  if (result) {
    try {
      const oldContract = await resolveAuthoritativeCurrentContract({
        reservationId: result.reservation._id,
        tenantId: result.reservation.userId?._id || result.reservation.userId,
      });
      if (oldContract) {
        const { autoGenerateRenewalContract } = await import("../services/autoContractOrchestratorService.js");
        autoGenerateRenewalContract({
          reservationId: result.reservation._id,
          oldContract,
          newStay: result.stay,
          actorId,
        }).catch((err) => {
          logger.warn({ err, reservationId }, "[RenewalWorkflow] Background successor contract auto-generation failed (non-fatal)");
        });
      } else {
        logger.warn({ reservationId }, "[RenewalWorkflow] Renewal successor contract skipped: no current Contract found");
      }
    } catch (contractImportErr) {
      logger.warn({ err: contractImportErr }, "[RenewalWorkflow] Auto contract orchestrator invocation error");
    }
  }

  return result;
}

// Canonical bed-required room types (same set the reservation/move-in flow
// uses): a private room has no bed to pick, a double/quadruple-sharing room
// does. Applied INDEPENDENTLY to the source room (does a bed get released?)
// and the destination room (is a bed required/occupied?) — a room transfer
// may cross room types, so the two sides can differ. Always read from the
// live Room.type of the actual source/destination room, never a stale
// reservation preferredRoomType.
const BED_REQUIRED_ROOM_TYPES = new Set(["double-sharing", "quadruple-sharing"]);
const roomTypeRequiresBed = (roomType) => BED_REQUIRED_ROOM_TYPES.has(String(roomType || ""));

// A room transfer amends the tenant's CONTINUING lease. Its predecessor is
// whatever `resolveAuthoritativeCurrentContract` returns as the tenant's
// current Contract — which is a legal lease in effect today. That is:
//   - a fully wet-signed lease (status active/published/expiring_soon), OR
//   - a Room Transfer Addendum from a PRIOR transfer that is the tenant's
//     current Contract (isCurrent:true) but whose own wet-signing is still
//     pending (status still "generated"). Phase 8: a legitimate Transfer #2
//     must NOT be blocked just because Addendum #1's document-signing step
//     has not finished — the continuing lease is valid regardless.
const FINAL_PREDECESSOR_STATUSES = new Set(["active", "published", "expiring_soon"]);
export const isValidTransferPredecessor = (contract) => {
  if (!contract) return false;
  if (FINAL_PREDECESSOR_STATUSES.has(contract.status)) return true;
  return (
    contract.status === "generated" &&
    contract.isCurrent === true &&
    (contract.contractPurpose === "amendment" || contract.contractPurpose === "replacement")
  );
};

/**
 * Prepare the room-transfer replacement Contract as a tenant-visible Draft,
 * OUTSIDE the physical-transfer transaction (Contract PDF generation does
 * storage I/O and is not transaction-safe — same reason autoGenerateMoveInContract
 * runs after the moveIn status write, not inside it).
 *
 * Idempotent: createReplacementContractForTransfer reuses an existing
 * non-abandoned successor, and an already-`generated` successor is not
 * regenerated. A crash between this and the transaction below leaves a
 * prepared-but-not-current successor Draft — exactly the retry-reuse case,
 * and the same failure shape as an interrupted move-in.
 *
 * Returns the successor Contract doc (status "generated", isCurrent:false).
 */
/**
 * Shared pre-transaction validation for a room-transfer intent. Resolves the
 * reservation, destination room + (conditional) bed, the current-lease
 * predecessor Contract and the active Stay, and runs every cheap guard that
 * does NOT need a transaction session. Used by BOTH the one-step
 * `transferStayWorkflow` (Stage A) and the read-only
 * `prepareRoomTransferAddendum` / `discardRoomTransferAddendum` endpoints so
 * the "is this transfer legal?" rules live in exactly one place.
 *
 * Mutates nothing by default. Throws `{statusCode, code}` on any failed guard.
 *
 * `materializeStay` (opt-in — set ONLY by the paths that ultimately commit:
 * `transferStayWorkflow` Stage A and `scheduleRoomTransfer`): if the tenant
 * has no current Stay row yet, lazily create it from the reservation's
 * move-in data via the SAME `ensureActiveStay` path the transfer transaction
 * (Stage B) and `renewStayWorkflow` already use. Historically the Stay was
 * only ever materialized inside a write transaction, so a legitimately
 * moved-in tenant whose first lifecycle action was a room transfer failed
 * Stage A's read-only stay check with a generic `NO_ACTIVE_STAY` before the
 * transaction (which would have created it) ever ran. This does NOT bypass
 * the active-stay requirement — it runs the identical create-if-eligible
 * logic and STILL enforces `CURRENT_STAY_STATUSES` afterward; when the Stay
 * genuinely cannot be derived (reservation missing moveInDate / leaseDuration)
 * it raises an explicit lifecycle error instead of the generic one.
 * Read-only preview / prepare-addendum callers never pass this and stay
 * side-effect-free.
 *
 * @param {Object}  p
 * @param {string}  p.reservationId
 * @param {Object}  p.payload            - { targetRoomId, targetBedId?, effectiveTransferDate?, confirm? }
 * @param {boolean} [p.requireConfirm=false] - enforce payload.confirm (the cutover does; preview/discard do not)
 * @param {boolean} [p.materializeStay=false] - lazily create the Stay if missing (committing paths only)
 * @param {string}  [p.actorId=null]     - attributed as createdBy/updatedBy on a lazily-created Stay
 * @returns {{ reservation, targetRoom, targetBed, predecessorContract, activeStay, effectiveTransferDate, destinationNeedsBed }}
 */
export async function resolveValidatedRoomTransferIntent({
  reservationId,
  payload = {},
  requireConfirm = false,
  materializeStay = true,
  actorId = null,
}) {
  const reservation = await Reservation.findById(reservationId)
    .populate("roomId", "name roomNumber branch beds currentOccupancy capacity type")
    .populate("userId", "firstName lastName email tenantStatus");
  if (!reservation) {
    throw Object.assign(new Error("Reservation not found"), { statusCode: 404, code: "RESERVATION_NOT_FOUND" });
  }
  if (!hasReservationStatus(reservation.status, "moveIn")) {
    throw Object.assign(new Error("Only active moved-in tenants can be transferred."), { statusCode: 400, code: "INVALID_STATUS_FOR_TRANSFER" });
  }
  if (requireConfirm && !payload?.confirm) {
    throw Object.assign(new Error("Transfer confirmation is required."), { statusCode: 400, code: "CONFIRM_REQUIRED" });
  }
  if (!payload.targetRoomId) {
    throw Object.assign(new Error("Target room is required."), { statusCode: 400, code: "MISSING_TRANSFER_FIELDS" });
  }

  const effectiveTransferDate = normalizeDate(payload.effectiveTransferDate) || new Date();
  const targetRoom = await Room.findById(payload.targetRoomId);
  if (!targetRoom) {
    throw Object.assign(new Error("Target room not found."), { statusCode: 404, code: "TARGET_ROOM_NOT_FOUND" });
  }
  if (String(targetRoom.branch) !== String(reservation.roomId?.branch || "")) {
    throw Object.assign(new Error("Transfers are limited to rooms within the same branch."), { statusCode: 400, code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });
  }
  // A room transfer MAY change room type (Private <-> Double <-> Quadruple).
  // Bed requirement is driven by the DESTINATION Room.type; a bed id supplied
  // for a private destination is IGNORED, never rejected.
  const destinationNeedsBed = roomTypeRequiresBed(targetRoom.type);
  if (destinationNeedsBed && !payload.targetBedId) {
    throw Object.assign(
      new Error("A specific bed must be selected for a shared room."),
      { statusCode: 400, code: "MISSING_TRANSFER_FIELDS" },
    );
  }
  const targetBed = destinationNeedsBed
    ? targetRoom.beds.find(
        (bed) => String(bed.id) === String(payload.targetBedId) || String(bed._id) === String(payload.targetBedId),
      )
    : null;
  if (destinationNeedsBed && !targetBed) {
    throw Object.assign(new Error("Target bed not found in the destination room."), { statusCode: 404, code: "TARGET_BED_NOT_FOUND" });
  }

  const predecessorContract = await resolveAuthoritativeCurrentContract({
    reservationId: reservation._id,
    tenantId: reservation.userId?._id || reservation.userId,
  });

  let activeStay = await resolveCurrentStayForReservation(reservation._id);
  if (!activeStay) {
    if (materializeStay) {
      activeStay = await ensureActiveStay(reservation, actorId, null, predecessorContract);
      if (!activeStay) {
        throw Object.assign(
          new Error(
            "This tenant's stay could not be activated — the reservation is missing a confirmed move-in date or lease duration. Complete the move-in record before transferring.",
          ),
          { statusCode: 409, code: "STAY_NOT_ACTIVATABLE" },
        );
      }
    } else {
      // A virtual preflight Stay is derived from the moved-in Reservation only.
      // Do not let a historical Contract date mask an incomplete Reservation:
      // the transactional ensureActiveStay path uses the same canonical anchor.
      const moveInDate = readMoveInDate(reservation) || null;
      const leaseEndDate = predecessorContract?.leaseEndDate || computeLeaseEndDate(reservation);
      if (!moveInDate || !leaseEndDate) {
        throw Object.assign(
          new Error(
            "This tenant's stay could not be activated — the reservation is missing a confirmed move-in date or lease duration. Complete the move-in record before transferring.",
          ),
          { statusCode: 409, code: "STAY_NOT_ACTIVATABLE" },
        );
      }
      activeStay = {
        tenantId: reservation.userId?._id || reservation.userId,
        reservationId: reservation._id,
        branch: reservation.roomId?.branch || predecessorContract?.branch || "",
        roomId: reservation.roomId?._id || reservation.roomId,
        bedId: reservation.selectedBed?.id || "bed-1",
        leaseStartDate: moveInDate,
        leaseEndDate,
        monthlyRent: getMonthlyRent(reservation) || predecessorContract?.monthlyRent || 0,
        status: "active",
      };
    }
  }
  if (!activeStay || !CURRENT_STAY_STATUSES.includes(activeStay.status)) {
    throw Object.assign(new Error("No active stay found for transfer."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
  }

  if (!predecessorContract || !isValidTransferPredecessor(predecessorContract)) {
    throw Object.assign(
      new Error("The tenant's current lease Contract is not active — room transfer cannot proceed."),
      { statusCode: 409, code: "ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE" },
    );
  }
  if (
    String(activeStay.roomId) === String(payload.targetRoomId) &&
    (!payload.targetBedId || String(activeStay.bedId) === String(payload.targetBedId))
  ) {
    throw Object.assign(new Error("Transfer target must differ from the current room and bed."), { statusCode: 400, code: "SAME_TRANSFER_TARGET" });
  }

  return { reservation, targetRoom, targetBed, predecessorContract, activeStay, effectiveTransferDate, destinationNeedsBed };
}

/**
 * R2 — Prepare (or reuse) the Room Transfer Addendum Draft + its PDF for a
 * planned transfer, WITHOUT performing the physical cutover. This is the
 * "preview / download the Addendum before you Confirm" endpoint.
 *
 * Reuses the exact same Stage-A validation + `prepareRoomTransferDraft` as
 * the one-step cutover, so a subsequent `PUT /transfer` finds and reuses this
 * very Draft (idempotent — `createReplacementContractForTransfer` returns the
 * existing non-abandoned successor, and an already-`generated` Draft is not
 * regenerated).
 *
 * Mutates NOTHING physical: no Stay, no Reservation.roomId, no occupancy, no
 * Bill, no TenantCredit, no UtilityReading, no recurringRentRate, no
 * securityDepositHeld, no pendingTransfer* fields. The Addendum is created
 * `isCurrent:false` and is NOT activated as the tenant's current Contract.
 *
 * @returns {{ addendum: {...identity}, reused: boolean }}
 */
export async function prepareRoomTransferAddendum({ reservationId, payload = {}, actorId = null }) {
  const {
    reservation, targetRoom, targetBed, predecessorContract, activeStay, effectiveTransferDate,
  } = await resolveValidatedRoomTransferIntent({ reservationId, payload, requireConfirm: false, materializeStay: false, actorId });

  // Was a compatible Draft already prepared for this exact transfer?
  const existing = await resolveRoomTransferSuccessor({ predecessorContractId: predecessorContract._id }).catch(() => null);
  const addendum = await prepareRoomTransferDraft({
    reservation,
    predecessorContract,
    activeStay,
    targetRoom,
    targetBed,
    effectiveTransferDate,
    actorId,
  });

  return {
    reused: Boolean(existing && String(existing._id) === String(addendum._id)),
    addendum: {
      contractId: String(addendum._id),
      contractNumber: addendum.contractNumber || null,
      contractPurpose: addendum.contractPurpose,          // "amendment"
      status: addendum.status,                            // "generated"
      version: addendum.version ?? null,
      amendmentEffectiveDate: addendum.amendmentEffectiveDate || effectiveTransferDate,
      leaseStartDate: addendum.leaseStartDate || predecessorContract?.leaseStartDate || readMoveInDate(reservation) || activeStay?.leaseStartDate || null,    // ORIGINAL lease start (unchanged)
      leaseEndDate: addendum.leaseEndDate || predecessorContract?.leaseEndDate || activeStay?.leaseEndDate || null,        // ORIGINAL lease end (unchanged)
      roomId: String(addendum.roomId),
      roomNumber: addendum.roomNumber || targetRoom.roomNumber || null,
      roomType: addendum.roomType || targetRoom.type || null,
      bedId: addendum.bedId || null,
      previousApprovedMonthlyRate: addendum.previousApprovedMonthlyRate ?? null,
      approvedMonthlyRate: addendum.approvedMonthlyRate ?? null,
      securityDepositAmount: addendum.securityDepositAmount ?? null,
      preparedDocument: addendum.preparedDocument
        ? {
            url: addendum.preparedDocument.url || null,
            version: addendum.preparedDocument.version ?? null,
            fileHash: addendum.preparedDocument.fileHash || null,
          }
        : null,
    },
  };
}

/**
 * R4 — Discard a PRE-CUTOVER Room Transfer Addendum Draft. This is NOT a
 * reversal of a completed transfer: it only applies while the Addendum is a
 * `generated` (or earlier) Draft that has NOT been activated as the tenant's
 * current Contract and NO physical transfer has occurred.
 *
 * Transitions that Draft `-> cancelled` (which makes it an "abandoned"
 * successor — `createReplacementContractForTransfer` will then create a fresh
 * one for the next attempt). Leaves the original/current Contract active, the
 * Stay unchanged, the Reservation room unchanged, occupancy unchanged,
 * utilities unchanged. Creates no Bill / TenantCredit, changes no held
 * deposit, touches no `pendingTransfer*` fields, releases no bed lock.
 *
 * @returns {{ discarded: boolean, contractId: string|null, previousStatus: string|null }}
 */
export async function discardRoomTransferAddendum({ reservationId, actorId = null }) {
  const reservation = await Reservation.findById(reservationId)
    .populate("userId", "_id");
  if (!reservation) {
    throw Object.assign(new Error("Reservation not found"), { statusCode: 404, code: "RESERVATION_NOT_FOUND" });
  }

  const predecessorContract = await resolveAuthoritativeCurrentContract({
    reservationId: reservation._id,
    tenantId: reservation.userId?._id || reservation.userId,
  });
  if (!predecessorContract) {
    throw Object.assign(new Error("No current Contract for this tenant."), { statusCode: 409, code: "NO_CURRENT_CONTRACT" });
  }

  // If the tenant's CURRENT Contract is itself a room-transfer successor that
  // has been made current, the transfer already executed (Stage-B cutover
  // activated it) — this is a post-cutover state, NOT a pre-cutover discard.
  if (
    ROOM_TRANSFER_SUCCESSOR_PURPOSES.includes(predecessorContract.contractPurpose) &&
    predecessorContract.isCurrent === true &&
    predecessorContract.replacesContractId
  ) {
    // Only "already completed" when the physical room actually moved onto this
    // successor's room (a bare current amendment from a PRIOR completed
    // transfer is fine to build the NEXT transfer on).
    const succRoomId = String(predecessorContract.roomId);
    const reservationRoomId = String(reservation.roomId?._id || reservation.roomId);
    if (succRoomId === reservationRoomId) {
      // Is there a not-yet-current NEXT-transfer Draft chained off it? If so we
      // fall through and discard that. Otherwise the only thing "in flight" is
      // the completed transfer itself.
      const chainedNext = await Contract.findOne({
        replacesContractId: predecessorContract._id,
        contractPurpose: { $in: [...ROOM_TRANSFER_SUCCESSOR_PURPOSES] },
        status: { $nin: [...ABANDONED_TRANSFER_SUCCESSOR_STATUSES] },
        isCurrent: { $ne: true },
      });
      if (!chainedNext) {
        throw Object.assign(
          new Error("This Room Transfer has already been completed and cannot be discarded here. Post-cutover reversal is a separate workflow."),
          { statusCode: 409, code: "TRANSFER_ALREADY_COMPLETED" },
        );
      }
    }
  }

  // The prepared successor, if any — a NON-abandoned amendment/replacement
  // that replaces the current Contract and has NOT itself been made current.
  const successor = await Contract.findOne({
    replacesContractId: predecessorContract._id,
    contractPurpose: { $in: [...ROOM_TRANSFER_SUCCESSOR_PURPOSES] },
    status: { $nin: [...ABANDONED_TRANSFER_SUCCESSOR_STATUSES] },
  }).sort({ createdAt: -1 });

  if (!successor) {
    throw Object.assign(
      new Error("No prepared Room Transfer Addendum to discard."),
      { statusCode: 404, code: "NO_PREPARED_ADDENDUM" },
    );
  }
  // If it has already become the tenant's current Contract, the transfer has
  // been executed — this is a post-cutover state, not a discard.
  if (successor.isCurrent === true) {
    throw Object.assign(
      new Error("This Room Transfer has already been completed and cannot be discarded here. Post-cutover reversal is a separate workflow."),
      { statusCode: 409, code: "TRANSFER_ALREADY_COMPLETED" },
    );
  }
  if (!DISCARDABLE_ADDENDUM_STATUSES.has(successor.status)) {
    throw Object.assign(
      new Error(`A Room Transfer Addendum in status "${successor.status}" cannot be discarded.`),
      { statusCode: 409, code: "ADDENDUM_NOT_DISCARDABLE" },
    );
  }

  const previousStatus = successor.status;
  await transitionContract(successor, "cancelled", actorId, "Room Transfer Addendum discarded before cutover by admin");

  return { discarded: true, contractId: String(successor._id), previousStatus };
}

// Statuses from which a prepared-but-not-current transfer Addendum may be
// discarded. Deliberately excludes final/legal statuses (active/expired/etc.)
// and anything already terminal.
const DISCARDABLE_ADDENDUM_STATUSES = new Set([
  "draft", "incomplete", "ready_for_generation", "generated",
  "awaiting_signatures", "partially_signed",
]);

async function prepareRoomTransferDraft({
  reservation,
  predecessorContract,
  activeStay,
  targetRoom,
  targetBed,
  effectiveTransferDate,
  actorId,
  scheduledTransferId = null,
  scheduledExecutionToken = null,
}) {
  const { sourceEffectiveRate } = resolveSourceEffectiveRentForTransfer({
    reservation,
    predecessorContract,
    activeStay,
  });
  if (!(sourceEffectiveRate > 0)) {
    throw Object.assign(
      new Error("The tenant's current approved rent cannot be verified. Review the active Stay, current Contract, and Reservation pricing before preparing the Addendum."),
      {
        statusCode: 409,
        code: "ROOM_TRANSFER_CURRENT_RENT_UNVERIFIED",
        manualReviewRequired: true,
      },
    );
  }
  const buildDraft = () => createReplacementContractForTransfer({
    reservationId: reservation._id,
    stayId: activeStay?._id || predecessorContract.stayId,
    oldContract: predecessorContract,
    targetRoom,
    targetBed: targetBed
      ? { id: targetBed.id || String(targetBed._id), label: targetBed.position || "" }
      : {},
    effectiveTransferDate,
    sourceApprovedMonthlyRate: sourceEffectiveRate,
    actorId,
  });

  let successor = await buildDraft();

  const { resolveAuthoritativeLeasePricing } = await import("../services/contractPricingResolver.js");
  const { getBusinessSettings } = await import("./businessSettings.js");
  const transferPricing = resolveAuthoritativeLeasePricing({
    room: targetRoom,
    roomType: targetRoom.type,
    branch: targetRoom.branch,
    leaseDurationMonths:
      predecessorContract.leaseDurationMonths ||
      activeStay?.leaseDurationMonths ||
      reservation.leaseDuration ||
      reservation.leaseDurationMonths,
    settings: await getBusinessSettings().catch(() => ({})),
  });
  const expectedTerms = {
    roomId: String(targetRoom._id),
    bedId: targetBed ? String(targetBed.id || targetBed._id || "") : "",
    effectiveDate: dayjs(effectiveTransferDate).startOf("day"),
    approvedRate: roundMoney(transferPricing.finalMonthlyRate),
    previousApprovedRate: roundMoney(sourceEffectiveRate),
  };
  const mismatchedTermsFor = (contract) => {
    const mismatches = [];
    if (String(contract.roomId) !== expectedTerms.roomId) mismatches.push("room");
    if (String(contract.bedId || "") !== expectedTerms.bedId) mismatches.push("bed");
    if (!dayjs(contract.amendmentEffectiveDate).startOf("day").isSame(expectedTerms.effectiveDate, "day")) {
      mismatches.push("effectiveDate");
    }
    if (Math.abs(roundMoney(contract.approvedMonthlyRate) - expectedTerms.approvedRate) > 0.01) {
      mismatches.push("approvedRate");
    }
    if (Math.abs(roundMoney(contract.previousApprovedMonthlyRate) - expectedTerms.previousApprovedRate) > 0.01) {
      mismatches.push("previousApprovedRate");
    }
    return mismatches;
  };
  let mismatchedTerms = mismatchedTermsFor(successor);

  // The idempotency guard in createReplacementContractForTransfer reuses ANY
  // non-abandoned successor of the predecessor Contract. If that reused
  // successor targets a DIFFERENT room than the one the admin is now
  // transferring to, it is stale — left behind by an earlier attempt (a
  // pre-future-only immediate transfer, or a scheduling attempt whose Addendum
  // outlived its cancellation). Self-heal when it is safe to do so:
  //   - the stale successor is a not-yet-current, not-yet-wet-signed Draft
  //     (exactly what discardRoomTransferAddendum abandons), AND
  //   - the tenant has NO open ScheduledRoomTransfer (so nothing live depends
  //     on the stale Draft).
  // Otherwise keep hard-blocking — a wet-signed successor, an already-current
  // one, or a live scheduled transfer genuinely needs explicit admin action
  // (Cancel Scheduled Transfer / discard-addendum).
  if (mismatchedTerms.length > 0) {
    const { ScheduledRoomTransfer } = await import("../models/index.js");
    const { OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES } = await import("../models/ScheduledRoomTransfer.js");
    const openScheduled = await ScheduledRoomTransfer.findOne({
      reservationId: reservation._id,
      status: { $in: [...OPEN_SCHEDULED_ROOM_TRANSFER_STATUSES] },
      isArchived: { $ne: true },
    }).select("addendumContractId +executionToken").lean();
    const isOwnedExecutionDateAlignment = Boolean(
      openScheduled &&
      scheduledTransferId &&
      scheduledExecutionToken &&
      String(openScheduled._id) === String(scheduledTransferId) &&
      String(openScheduled.addendumContractId || "") === String(successor._id) &&
      openScheduled.executionToken === scheduledExecutionToken &&
      mismatchedTerms.length === 1 &&
      mismatchedTerms[0] === "effectiveDate",
    );
    const isDiscardableDraft =
      successor.isCurrent !== true && DISCARDABLE_ADDENDUM_STATUSES.has(successor.status);
    const hasAcknowledgement = Boolean(await ContractAcknowledgement.exists({ contractId: successor._id }));

    if ((!isOwnedExecutionDateAlignment && openScheduled) || !isDiscardableDraft || hasAcknowledgement) {
      throw Object.assign(
        new Error(
          openScheduled
            ? "This tenant already has a scheduled room transfer with different Addendum terms. Cancel it before scheduling a replacement."
            : hasAcknowledgement
              ? "The existing Room Transfer Addendum was already acknowledged and cannot be changed. Cancel it through an approved reversal process before preparing different terms."
              : "An existing Room Transfer Addendum has different room, bed, date, or rate terms and cannot be auto-resolved.",
        ),
        {
          statusCode: 409,
          code: hasAcknowledgement
            ? "ROOM_TRANSFER_ADDENDUM_ACKNOWLEDGED"
            : "ROOM_TRANSFER_ADDENDUM_TERMS_MISMATCH",
          details: { mismatchedTerms },
        },
      );
    }

    // Abandon the stale Draft (generated -> cancelled, same as
    // discardRoomTransferAddendum — never deleted, stays as history) and build
    // the correct successor for THIS destination.
    await transitionContract(
      successor,
      "cancelled",
      actorId,
      `Stale Room Transfer Addendum superseded — re-targeted from room ${successor.roomNumber || successor.roomId} to ${targetRoom.roomNumber || targetRoom.name || targetRoom._id}`,
    );
    successor = await buildDraft();
    mismatchedTerms = mismatchedTermsFor(successor);

    if (mismatchedTerms.length > 0) {
      // The rebuilt Draft still points elsewhere — a second stale successor, or
      // a data-integrity problem. Do not loop; surface it for admin repair.
      throw Object.assign(
        new Error("The rebuilt Room Transfer Addendum still does not match the approved room, bed, effective date, or rate."),
        { statusCode: 409, code: "ROOM_TRANSFER_ADDENDUM_TERMS_MISMATCH", details: { mismatchedTerms } },
      );
    }
  }

  // Already prepared (retry, or prepared earlier) — nothing to regenerate.
  const PREPARED_OR_BEYOND = new Set([
    "generated", "awaiting_signatures", "partially_signed", "signed",
    "awaiting_notarization", "notarized", "ready_for_publication", "published",
  ]);
  if (PREPARED_OR_BEYOND.has(successor.status)) return successor;

  if (successor.status !== "ready_for_generation") {
    const validation = await validateContractForGeneration(successor);
    if (!validation.valid) {
      const missingDetails = [
        ...(validation.missingFields || []).map((f) => f.label || f.field || String(f)),
        ...(validation.errors || []).map((e) => e.message || e.code || String(e)),
        ...(validation.conflicts || []).map((c) => c.message || c.code || String(c)),
      ].filter(Boolean);
      throw Object.assign(
        new Error(
          "The room-transfer replacement Contract could not be auto-completed for generation: " +
          (missingDetails.join(", ") || "missing required data") +
          ". Complete it in the Contracts workspace, then retry the transfer.",
        ),
        { statusCode: 422, code: "ROOM_TRANSFER_CONTRACT_INCOMPLETE", validation },
      );
    }
    await transitionContract(successor, "ready_for_generation", actorId, "Room-transfer replacement Contract auto-validated");
    Object.assign(successor, validation.generationData.pricing);
    successor.templateType = validation.template.templateId;
    successor.templateVersion = validation.template.templateVersion;
    successor.legalContentVersion = validation.template.legalContentVersion;
    successor.validatedGenerationData = validation.generationData;
    successor.lastValidatedAt = new Date();
    successor.updatedBy = actorId;
    await successor.save();
  }

  const { contract: generated } = await generatePreparedContractPdf({
    contractId: successor._id,
    actorId,
    regenerationReason: `Auto-generated replacement for Room Transfer to Room ${targetRoom.roomNumber || targetRoom.name}`,
  });
  return generated;
}

/**
 * CANONICAL INTERNAL ROOM-TRANSFER CUTOVER ENGINE.
 *
 * As of the future-only Admin Room Transfer rule, this is NOT called directly
 * by the Admin/API `transferTenant` controller anymore. Every new Admin
 * transfer is scheduled (`scheduleRoomTransfer`); this workflow is executed by
 * `scheduledRoomTransferExecutor` on the effective transfer date (Job 20 /
 * retry). At that point the scheduled effective date legitimately IS "today",
 * so there is deliberately NO "future-only" date guard in here — the guard
 * lives in the controller, before scheduling.
 *
 * Also still used to replay/derive historical immediate transfers and by the
 * transfer* integration suites, which exercise it as the effective-date
 * executor (not as an "Admin immediate transfer" path).
 */
export async function transferStayWorkflow({ reservationId, payload, actorId }) {
  if (payload?.sourceRoomMeterReading !== null && payload?.sourceRoomMeterReading !== undefined) {
    payload = {
      ...payload,
      sourceRoomMeterReading: parsePhysicalMeterReading(payload.sourceRoomMeterReading, {
        fieldLabel: "Source room closing electricity reading",
        maximum: 999999.99,
      }),
    };
  }
  if (payload?.targetRoomMeterReading !== null && payload?.targetRoomMeterReading !== undefined) {
    payload = {
      ...payload,
      targetRoomMeterReading: parsePhysicalMeterReading(payload.targetRoomMeterReading, {
        fieldLabel: "Destination room current electricity reading",
        maximum: 999999.99,
      }),
    };
  }
  // ── Stage A — pre-transaction preparation ────────────────────────────────
  // Cheap validation (no transaction session) + prepare the Room Transfer
  // Addendum Draft BEFORE opening the physical-transfer transaction (Contract
  // PDF generation is not transaction-safe). Identical validation to the
  // read-only `prepareRoomTransferAddendum` / `discardRoomTransferAddendum`
  // endpoints — the "is this transfer legal?" rules live in
  // `resolveValidatedRoomTransferIntent`.
  const {
    reservation: prepReservation,
    targetRoom: prepTargetRoom,
    targetBed: prepTargetBed,
    predecessorContract: prepPredecessor,
    activeStay: prepActiveStay,
    effectiveTransferDate: prepEffectiveDate,
  } = await resolveValidatedRoomTransferIntent({
    reservationId,
    payload,
    requireConfirm: true,
    // Committing path: materialize the tenant's Stay now if a legitimately
    // moved-in resident never had one created (the transaction's
    // ensureActiveStay would do it a moment later anyway). Keeps Stage A and
    // Stage B seeing the same Stay.
    materializeStay: false,
    actorId,
  });

  const preparedSuccessor = await prepareRoomTransferDraft({
    reservation: prepReservation,
    predecessorContract: prepPredecessor,
    activeStay: prepActiveStay,
    targetRoom: prepTargetRoom,
    targetBed: prepTargetBed,
    effectiveTransferDate: prepEffectiveDate,
    actorId,
    scheduledTransferId: payload.__scheduledTransferId || null,
    scheduledExecutionToken: payload.__scheduledExecutionToken || null,
  });

  // ── Stage B — physical transfer + Contract cutover (atomic) ──────────────
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findById(reservationId)
        .populate("roomId", "name roomNumber branch beds currentOccupancy capacity type")
        .populate("userId", "firstName lastName email tenantStatus")
        .session(session);
      if (!reservation) {
        throw Object.assign(new Error("Reservation not found"), { statusCode: 404, code: "RESERVATION_NOT_FOUND" });
      }
      if (!hasReservationStatus(reservation.status, "moveIn")) {
        throw Object.assign(new Error("Only active moved-in tenants can be transferred."), { statusCode: 400, code: "INVALID_STATUS_FOR_TRANSFER" });
      }
      if (!payload?.confirm) {
        throw Object.assign(new Error("Transfer confirmation is required."), { statusCode: 400, code: "CONFIRM_REQUIRED" });
      }

      const consumesScheduledHold = Boolean(
        payload.__scheduledTransferId &&
        payload.__scheduledExecutionToken &&
        payload.__consumeScheduledHold,
      );
      const scheduledExecution = consumesScheduledHold
        ? await ScheduledRoomTransfer.findOne({
            _id: payload.__scheduledTransferId,
            reservationId: reservation._id,
            destinationRoomId: payload.targetRoomId,
            status: { $in: ["scheduled", "action_required"] },
            holdApplied: true,
            executionToken: payload.__scheduledExecutionToken,
          })
            .select("+executionToken")
            .session(session)
        : null;
      if (consumesScheduledHold && !scheduledExecution) {
        throw Object.assign(new Error("This Complete Transfer request no longer owns the scheduled hold."), {
          statusCode: 409,
          code: "SCHEDULED_TRANSFER_EXECUTION_CLAIM_LOST",
        });
      }

      // ── AUTHORITATIVE physical cutover timestamp ─────────────────────────
      // The ACTUAL moment the transfer commits — captured HERE, inside the
      // transaction, immediately before any physical mutation. This is NOT
      // the scheduled date/time (a readiness target only) and is NEVER
      // caller-supplied. Used consistently below for the source moveOut
      // UtilityReading, the destination moveIn UtilityReading, the
      // UtilityFinalization throughDate, and returned so the caller can stamp
      // ScheduledRoomTransfer.executedAt + the completion audit.
      const cutoverAt = new Date();
      // The calendar day of the actual cutover — used for the DAY-granular
      // BedHistory transfer boundaries (day-based water proration +
      // filterBillableReservationsForPeriod operate by covered day, and
      // findMissingElectricityLifecycleReadings matches the moveOut READING's
      // day to the BedHistory boundary day). `UtilityReading.date` keeps the
      // full `cutoverAt` timestamp so sequential same-day boundaries stay
      // distinguishable.
      const cutoverDay = normalizeDate(cutoverAt);

      // ── Transfer-Settlement Payment Gate ─────────────────────────────────
      // The physical cutover proceeds ONLY when the TRANSFER-SPECIFIC
      // settlement (rent adjustment + additional security deposit) is fully
      // paid. Unrelated historical balances (regular rent, utilities) are NOT
      // merged and do NOT block the transfer — they stay owed and are settled
      // through their own bills (Admin Room Transfer spec §9). There is no
      // force-proceed: the old `forceOverride` acknowledgement path is gone.
      //
      // `billingSummary` is still computed here — it feeds the BedHistory
      // transfer snapshot (billingSnapshotAtTransfer / outstandingBalanceAtTransfer)
      // for the audit trail; it is no longer a gate.
      const bills = await Bill.find({
        reservationId: reservation._id,
        isArchived: { $ne: true },
      }).session(session).lean();
      const billingSummary = buildBillingSummary(bills);

      const transferSettlementBills = bills.filter(
        (b) => b.billType === "transfer_settlement" && b.status !== "voided",
      );
      const unpaidTransferSettlement = transferSettlementBills.find(
        (b) => roundMoney(Number(b.totalAmount || 0) - Number(b.paidAmount || 0)) > 0.01,
      );
      if (unpaidTransferSettlement) {
        const remaining = roundMoney(
          Number(unpaidTransferSettlement.totalAmount || 0) - Number(unpaidTransferSettlement.paidAmount || 0),
        );
        throw Object.assign(
          new Error(
            `The room transfer settlement of ₱${remaining.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} must be fully paid before the transfer can be completed.`,
          ),
          {
            statusCode: 409,
            code: "TRANSFER_SETTLEMENT_UNPAID",
            outstandingBalance: remaining,
          },
        );
      }

      const activeStay = await ensureActiveStay(reservation, actorId, session, prepPredecessor);
      // ── BILLING BOUNDARY = ACTUAL CUTOVER DAY ────────────────────────────
      // The scheduled `payload.effectiveTransferDate` is the PLANNING date
      // (admin guidance / readiness target / schedule history). Once a
      // scheduled transfer is delayed (payment settlement, office hours), the
      // tenant occupies the OLD room through the ACTUAL physical cutover — so
      // rent/deposit proration, the billing cycle, the transfer_settlement
      // Bill's billingMonth, and the BedHistory day-boundary all follow
      // `cutoverDay` (= normalizeDate(cutoverAt)), NOT the scheduled date.
      // Electricity uses the exact `cutoverAt` timestamp. The scheduled date is
      // preserved untouched on ScheduledRoomTransfer + scheduleHistory.
      const scheduledTransferDate = normalizeDate(payload.effectiveTransferDate) || new Date();
      const effectiveTransferDate = cutoverDay || scheduledTransferDate;
      if (!activeStay || !CURRENT_STAY_STATUSES.includes(activeStay.status)) {
        throw Object.assign(new Error("No active stay found for transfer."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
      }

      // Hard guard, not just the advisory buildActionAvailability check above
      // (a stale UI state could otherwise bypass it) — a pending future
      // renewal must be resolved or cancelled before a room transfer can
      // proceed, since transferring the predecessor Contract out from under
      // it would leave the renewal's frozen currentTerms describing a room
      // the tenant no longer occupies.
      const pendingRenewalStay = await Stay.exists({
        reservationId: reservation._id,
        previousStayId: activeStay._id,
      }).session(session);
      if (pendingRenewalStay) {
        throw Object.assign(new Error("A future renewal already exists for this tenant. Resolve or cancel it before transferring."), { statusCode: 409, code: "FUTURE_RENEWAL_EXISTS" });
      }

      if (!payload.targetRoomId) {
        throw Object.assign(new Error("Target room is required."), { statusCode: 400, code: "MISSING_TRANSFER_FIELDS" });
      }

      const targetRoom = await Room.findById(payload.targetRoomId).session(session);
      if (!targetRoom) {
        throw Object.assign(new Error("Target room not found."), { statusCode: 404, code: "TARGET_ROOM_NOT_FOUND" });
      }
      if (String(targetRoom.branch) !== String(reservation.roomId?.branch || "")) {
        throw Object.assign(new Error("Transfers are limited to rooms within the same branch."), { statusCode: 400, code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });
      }
      // A room transfer MAY cross room types — nothing here blocks a
      // Private<->Double<->Quadruple change. Bed handling is decided
      // independently for the source and the destination from their own
      // live Room.type.
      const currentRoom = await Room.findById(activeStay.roomId).session(session);
      if (!currentRoom) {
        throw Object.assign(new Error("Current room not found."), { statusCode: 404, code: "CURRENT_ROOM_NOT_FOUND" });
      }
      const sourceNeedsBed = roomTypeRequiresBed(currentRoom.type);
      const destinationNeedsBed = roomTypeRequiresBed(targetRoom.type);

      if (destinationNeedsBed && !payload.targetBedId) {
        throw Object.assign(new Error("A specific bed must be selected for a shared room."), { statusCode: 400, code: "MISSING_TRANSFER_FIELDS" });
      }
      if (
        String(activeStay.roomId) === String(payload.targetRoomId) &&
        (!payload.targetBedId || String(activeStay.bedId) === String(payload.targetBedId))
      ) {
        throw Object.assign(new Error("Transfer target must differ from the current room and bed."), { statusCode: 400, code: "SAME_TRANSFER_TARGET" });
      }

      // Resolve the destination bed only when the destination room needs one.
      // A bed id supplied for a private destination is ignored, never
      // occupied. A bed must belong to the destination room and be available.
      const targetBed = destinationNeedsBed
        ? targetRoom.beds.find(
            (bed) => String(bed.id) === String(payload.targetBedId) || String(bed._id) === String(payload.targetBedId),
          )
        : null;
      if (destinationNeedsBed && !targetBed) {
        throw Object.assign(new Error("Target bed not found in the destination room."), { statusCode: 404, code: "TARGET_BED_NOT_FOUND" });
      }
      const targetBedIsOwnedHold = Boolean(
        scheduledExecution &&
        targetBed &&
        targetBed.status === "reserved" &&
        String(targetBed.occupiedBy?.reservationId || "") === String(reservation._id) &&
        !targetBed.occupiedBy?.occupiedSince,
      );
      if (destinationNeedsBed && targetBed.status !== "available" && !targetBedIsOwnedHold) {
        throw Object.assign(new Error("Selected target bed is not available."), { statusCode: 409, code: "BED_NOT_AVAILABLE" });
      }
      // Destination room capacity guard — only when actually changing rooms
      // (a same-room bed reshuffle does not add an occupant). Independent of
      // bed-level status, so it also covers a private destination.
      const changingRooms = String(activeStay.roomId) !== String(targetRoom._id);
      if (
        changingRooms &&
        (scheduledExecution
          ? Number(targetRoom.currentOccupancy || 0) > Number(targetRoom.capacity || 0)
          : Number(targetRoom.currentOccupancy || 0) >= Number(targetRoom.capacity || 0))
      ) {
        throw Object.assign(new Error("The destination room is full."), { statusCode: 409, code: "DESTINATION_ROOM_FULL" });
      }

      // ── Contract cutover readiness — the replacement Contract Draft was
      // prepared in Stage A (before this transaction). Re-resolve it here
      // with the transaction session so the cutover below acts on the same
      // authoritative record. It is a tenant-visible generated Draft, NOT a
      // wet-signed final — the tenant occupies the new room while the
      // Contract is still a Draft, exactly like a fresh move-in. Wet-signing
      // remains a later admin step (generated → … → published → active).
      const predecessorContract = await resolveAuthoritativeCurrentContract({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
        session,
      });
      if (!predecessorContract || !isValidTransferPredecessor(predecessorContract)) {
        throw Object.assign(
          new Error("The tenant's current lease Contract is not active — room transfer cannot proceed."),
          { statusCode: 409, code: "ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE" },
        );
      }
      const successorContract = await resolveRoomTransferSuccessor({
        predecessorContractId: predecessorContract._id,
        session,
      });
      if (String(successorContract.roomId) !== String(targetRoom._id)) {
        throw Object.assign(
          new Error("The prepared replacement Contract does not match the selected destination room."),
          { statusCode: 409, code: "ROOM_TRANSFER_CONTRACT_ROOM_MISMATCH" },
        );
      }
      if (String(successorContract._id) !== String(preparedSuccessor._id)) {
        throw Object.assign(
          new Error("The room-transfer replacement Contract changed between preparation and execution. Retry the transfer."),
          { statusCode: 409, code: "ROOM_TRANSFER_CONTRACT_CHANGED" },
        );
      }

      const targetBedIdentifier = destinationNeedsBed && targetBed
        ? (targetBed.id || String(targetBed._id))
        : null;
      const sameRoomReshuffle = String(currentRoom._id) === String(targetRoom._id);

      if (sameRoomReshuffle) {
        // Same room, different bed (a shared-room bed reshuffle). currentRoom
        // and targetRoom are two stale instances of ONE document — mutate and
        // save exactly ONE of them, and do NOT touch the occupancy counter
        // (no occupant enters or leaves the room).
        if (sourceNeedsBed && activeStay.bedId) currentRoom.vacateBed(activeStay.bedId);
        if (targetBedIdentifier) {
          currentRoom.occupyBed(targetBedIdentifier, reservation.userId?._id || reservation.userId, reservation._id);
        }
        currentRoom.updateAvailability();
        await currentRoom.save({ session });
      } else {
        // ── Source room: release the bed (shared source only) and decrement
        // occupancy ATOMICALLY (conditional $inc — the same primitive the
        // canonical move-in/reserve path uses; see occupancyManager.js). The
        // in-memory instance is refreshed from the atomic result so the
        // subsequent bed-array save does not clobber the counter.
        const decremented = await Room.atomicDecreaseOccupancy(currentRoom._id, session);
        if (decremented) {
          currentRoom.currentOccupancy = decremented.currentOccupancy;
          currentRoom.available = decremented.available;
        } else {
          currentRoom.currentOccupancy = Math.max(0, Number(currentRoom.currentOccupancy || 0) - 1);
          currentRoom.updateAvailability();
        }
        if (sourceNeedsBed && activeStay.bedId) currentRoom.vacateBed(activeStay.bedId);
        await currentRoom.save({ session });

        // ── Destination room: increment occupancy ATOMICALLY. A null result
        // means the room filled between the guard above and here (concurrent
        // transfer / move-in claiming the last slot) — fail the whole
        // transfer safely; the transaction rolls back the source decrement.
        if (!scheduledExecution) {
          const incremented = await Room.atomicIncreaseOccupancy(targetRoom._id, session);
          if (!incremented) {
            throw Object.assign(
              new Error("The destination room filled up before the transfer could complete."),
              { statusCode: 409, code: "DESTINATION_ROOM_FULL" },
            );
          }
          targetRoom.currentOccupancy = incremented.currentOccupancy;
          targetRoom.available = incremented.available;
        }
        // Occupy the bed only if the DESTINATION room type has per-bed
        // assignment. A private destination has no bed to occupy. targetBed
        // is null unless destinationNeedsBed, so a stale bed id sent for a
        // private destination is ignored here.
        if (targetBedIdentifier) {
          targetRoom.occupyBed(targetBedIdentifier, reservation.userId?._id || reservation.userId, reservation._id);
        }
        await targetRoom.save({ session });
      }

      for (const [waterRoom, waterReading, waterEvent] of [
        [currentRoom, payload.sourceWaterReading, 'moveOut'],
        [targetRoom, payload.targetWaterReading, 'moveIn'],
      ]) {
        await recordWaterObservation({room:waterRoom,reading:waterReading,eventAt:cutoverAt,
          eventType:waterEvent,reservationId:reservation._id,stayId:activeStay._id,
          transferId:payload.__scheduledTransferId,tenantId:reservation.userId?._id || reservation.userId,
          actorId,session,source:'transfer-completion'});
      }
      const sourceMeterReading = payload.sourceRoomMeterReading ?? payload.meterReading;
      const targetMeterReading = payload.targetRoomMeterReading ?? payload.newRoomMeterReading;
      const sourceMetered = branchSupportsSeparateUtilityBillingSafe(currentRoom.branch, "electricity");
      const targetMetered = branchSupportsSeparateUtilityBillingSafe(targetRoom.branch, "electricity");
      if (sourceMetered && (sourceMeterReading == null || Number.isNaN(Number(sourceMeterReading)))) {
        throw Object.assign(new Error("A fresh source-room closing electricity reading is required."), {
          statusCode: 409,
          code: "ROOM_TRANSFER_SOURCE_READING_REQUIRED",
        });
      }
      if (targetMetered) {
        parsePhysicalMeterReading(targetMeterReading, {
          fieldLabel: "Destination room current electricity reading",
          maximum: 999999.99,
        });
      }

      // -----------------------------------------------------------------------
      // Billing Continuity Safety Net
      // Anchor a UtilityReading at the ACTUAL cutover timestamp (`cutoverAt`,
      // captured at the top of this transaction — NOT the scheduled date/time)
      // for BOTH rooms. If the admin supplied an explicit reading during
      // Complete Transfer, use it. Otherwise fall back to the latest recorded
      // reading dated on or before `cutoverAt`, so the billing engine never
      // has a gap at the transfer boundary and can distinguish sequential
      // same-date boundaries by their real timestamps.
      // -----------------------------------------------------------------------

      // -- Source room: departing moveOut snapshot --
      if (sourceMetered && sourceMeterReading != null && !Number.isNaN(Number(sourceMeterReading))) {
        await resolveRoomUtilityBoundaryContext({
          room: currentRoom,
          utilityType: "electricity",
          eventAt: cutoverAt,
          reading: Number(sourceMeterReading),
          eventType: "moveOut",
          reservationId: reservation._id,
          tenantId: reservation.userId?._id || reservation.userId,
          actorId,
          allowInitialize: false,
          session,
        });
      } else if (sourceMetered) {
        const latestSourceReading = await UtilityReading.findOne({
          roomId: currentRoom._id,
          utilityType: "electricity",
          isArchived: false,
          date: { $lte: cutoverAt },
        })
          .sort({ date: -1, createdAt: -1 })
          .session(session)
          .lean();
        if (latestSourceReading) {
          await resolveRoomUtilityBoundaryContext({
            room: currentRoom,
            utilityType: "electricity",
            eventAt: cutoverAt,
            reading: latestSourceReading.reading,
            eventType: "moveOut",
            reservationId: reservation._id,
            tenantId: reservation.userId?._id || reservation.userId,
            actorId,
            allowInitialize: false,
            session,
          });
        }
      }

      // -- Target room: arriving moveIn snapshot --
      if (targetMetered && targetMeterReading != null && !Number.isNaN(Number(targetMeterReading))) {
        await resolveRoomUtilityBoundaryContext({
          room: targetRoom,
          utilityType: "electricity",
          eventAt: cutoverAt,
          reading: Number(targetMeterReading),
          eventType: "moveIn",
          reservationId: reservation._id,
          tenantId: reservation.userId?._id || reservation.userId,
          actorId,
          allowInitialize: true,
          session,
        });
      } else if (targetMetered) {
        const latestTargetReading = await UtilityReading.findOne({
          roomId: targetRoom._id,
          utilityType: "electricity",
          isArchived: false,
          date: { $lte: cutoverAt },
        })
          .sort({ date: -1, createdAt: -1 })
          .session(session)
          .lean();
        if (latestTargetReading) {
          await resolveRoomUtilityBoundaryContext({
            room: targetRoom,
            utilityType: "electricity",
            eventAt: cutoverAt,
            reading: latestTargetReading.reading,
            eventType: "moveIn",
            reservationId: reservation._id,
            tenantId: reservation.userId?._id || reservation.userId,
            actorId,
            allowInitialize: false,
            session,
          });
        }
      }

      // ── Room-Transfer Rent Settlement ───────────────────────────────────────
      // Lilycrest's confirmed rule: charge only for actual days spent in
      // each accommodation; the unused prepaid value of the old room is
      // credited against the destination room's prorated remaining-period
      // charge. Period boundaries come from the tenant's actual movein-
      // anchored rent cycle (resolveCurrentBillingCycle — correctly handles
      // 28/29/30/31-day months, never a fixed 30-day divisor). Destination
      // rate is always the successor Contract's approved amount — never the
      // mutable Room master price, and never re-resolved here even if it has
      // since changed. Source rate/prepaid basis are resolved below (see
      // prepaidRentResolver.js) rather than assumed to be the predecessor
      // Contract's approvedMonthlyRate verbatim: a structured reservation's
      // approved rent (and what it actually prepaid) lives on its immutable
      // pricingSnapshot, which can diverge from the Contract field over time.
      const moveInDate = readMoveInDate(reservation);
      const currentBillingCycle = moveInDate
        ? resolveCurrentBillingCycle(moveInDate, effectiveTransferDate)
        : null;
      const { sourceEffectiveRate, sourceRateSource } = resolveSourceEffectiveRentForTransfer({
        reservation,
        predecessorContract,
        activeStay,
      });
      if (!(sourceEffectiveRate > 0)) {
        throw Object.assign(
          new Error("The tenant's current approved rent cannot be verified. Review the active Stay, current Contract, and Reservation pricing before transferring."),
          {
            statusCode: 409,
            code: "ROOM_TRANSFER_CURRENT_RENT_UNVERIFIED",
            manualReviewRequired: true,
          },
        );
      }
      const prepaidResolution = await resolveApplicablePrepaidRentForTransfer({
          reservation,
          sourceEffectiveRate,
          currentBillingCycle,
          session,
        });
      if (prepaidResolution.requiresManualReview) {
        throw Object.assign(
          new Error("The first-period advance payment cannot be verified. Review the initial payment before transferring this tenant."),
          {
            statusCode: 409,
            code: prepaidResolution.manualReviewReason || "ROOM_TRANSFER_ADVANCE_PAYMENT_UNVERIFIED",
            manualReviewRequired: true,
          },
        );
      }
      const expectedContractBedId = destinationNeedsBed
        ? String(targetBed?.id || targetBed?._id || "")
        : "";
      if (String(successorContract.bedId || "") !== expectedContractBedId) {
        throw Object.assign(
          new Error("The prepared Room Transfer Addendum does not match the selected destination bed."),
          {
            statusCode: 409,
            code: "ROOM_TRANSFER_CONTRACT_BED_MISMATCH",
            details: {
              addendumBedId: successorContract.bedId || null,
              destinationBedId: expectedContractBedId || null,
            },
          },
        );
      }
      if (!(Number(successorContract.approvedMonthlyRate) > 0)) {
        throw Object.assign(
          new Error("The prepared Room Transfer Addendum has no valid approved destination rate."),
          { statusCode: 409, code: "ROOM_TRANSFER_CONTRACT_RATE_INVALID" },
        );
      }
      const {
        applicablePrepaidRent,
        prepaidRentSource,
        sourceBillId: rentCoverageBillId,
        sourceBillType: rentCoverageBillType,
      } = prepaidResolution;
      const settlement = calculateRoomTransferRentSettlement({
        periodStart: currentBillingCycle?.billingCycleStart || effectiveTransferDate,
        periodEnd: currentBillingCycle?.billingCycleEnd || effectiveTransferDate,
        transferDate: effectiveTransferDate,
        sourceApprovedRate: sourceEffectiveRate,
        destinationApprovedRate: successorContract.approvedMonthlyRate,
        applicablePrepaidRent,
      });
      const proRataDays = settlement.sourceDays;
      const proRataRent = settlement.sourceConsumedValue;

      // ── Security-Deposit Settlement (SEPARATE from rent — never netted) ──────
      // Canonical required deposit = 1x the destination room's approved monthly
      // rate (successorContract.approvedMonthlyRate — the same rule move-in
      // uses via structuredInitialPaymentPolicy / depositUtils). "Held" is the
      // ACTUAL deposit cash: reservation.securityDepositHeld or independently
      // verified payment/deposit evidence. Evidence may drive settlement, but
      // Completion never writes it back as an implicit legacy-data backfill.
      const destinationRequiredDeposit = roundMoney(Number(successorContract.approvedMonthlyRate) || 0);
      // Scheduled transfer: if the pre-paid Scheduled Transfer Balance Bill
      // already funded securityDepositHeld (Phase 2F), the ADDITIONAL deposit
      // due for this transfer must be computed against the held amount as it
      // stood BEFORE that funding — otherwise the Bill-reuse assertion below
      // (recomputed component vs the Bill's charges.securityDeposit) would
      // mismatch and the settlement Bill would be wrong. The executor passes
      // that pre-funding value; the paid deposit component remains real cash
      // (its ledger entry is untouched).
      const scheduledDepositHeldOverride =
        payload.scheduledTransferBillId != null &&
        payload.depositHeldOverride != null &&
        Number.isFinite(Number(payload.depositHeldOverride))
          ? roundMoney(Number(payload.depositHeldOverride))
          : null;
      const rawHeld = reservation.securityDepositHeld;
      const isExplicitHeld =
        rawHeld !== null && rawHeld !== undefined && Number.isFinite(Number(rawHeld));
      const verifiedDepositEvidence =
        scheduledDepositHeldOverride == null && !isExplicitHeld
          ? await resolveVerifiedSecurityDepositHeld({ reservation, session })
          : null;

      let depositCurrentlyHeld =
        scheduledDepositHeldOverride != null
          ? scheduledDepositHeldOverride
          : isExplicitHeld
            ? Number(rawHeld)
            : verifiedDepositEvidence?.heldKnown
              ? Number(verifiedDepositEvidence.amount)
              : null;
      if (!Number.isFinite(depositCurrentlyHeld)) {
        throw Object.assign(
          new Error("The tenant's actual security deposit held cannot be verified. Review payment/deposit records before transferring."),
          {
            statusCode: 409,
            code: "ROOM_TRANSFER_DEPOSIT_HELD_UNVERIFIED",
            manualReviewRequired: true,
          },
        );
      }
      const depositSettlement = calculateRoomTransferDepositSettlement({
        depositCurrentlyHeld,
        destinationRequiredDeposit,
      });
      const additionalDepositDue = depositSettlement.additionalDepositDue;
      const excessDepositHeld = depositSettlement.excessDepositHeld;

      // ── SOURCE-ROOM ELECTRICITY FINALIZATION (before cutover) ─────────────
      // The transferring tenant's accrued source-room electricity liability is
      // FINALIZED and billed on this Bill — computed by the SAME canonical
      // `computeBilling` engine the normal period close uses, over
      //   [openPeriod.startReading -> freshSourceClosingReading]
      // with the full historical participant set (the transferee bounded by a
      // synthetic moveOut at `cutoverAt`). Only the transferee's slice is
      // taken; co-occupants are billed normally at the real period close.
      //
      // A `UtilityFinalization` record (written below, in this same txn) then
      // makes `upsertDraftBillsForUtility` SKIP creating a second electricity
      // Bill for this tenant at that period's close — WITHOUT removing them
      // from the canonical allocation (their `moveOut` UtilityReading keeps
      // them a full participant in the pre-cutover segments; the denominator
      // is unchanged).
      //
      // Sub-metered branches only. Guadalupe (fixed-rate) => no finalization,
      // `charges.electricity` stays 0. WATER is NEVER finalized here — its
      // period total and covered-day denominator are unknowable at transfer
      // time; `charges.water` stays 0 and the source-room water is settled at
      // the normal water period close.
      let finalizedSourceElectricity = null;
      let estimatedElectricityKwh = null;
      let estimatedElectricityCharge = 0;
      const hasSourceElectricityPeriod = sourceMeterReading != null
        ? await UtilityPeriod.exists({
            roomId: currentRoom._id,
            utilityType: "electricity",
            status: "open",
            isArchived: false,
          }).session(session)
        : null;
      if (
        sourceMeterReading != null &&
        !Number.isNaN(Number(sourceMeterReading)) &&
        (payload.__scheduledTransferId || hasSourceElectricityPeriod)
      ) {
        const { computeTransfereeSourceElectricityLiability } = await import(
          "../services/billing/transferUtilityFinalization.js"
        );
        finalizedSourceElectricity = await computeTransfereeSourceElectricityLiability({
          reservation,
          sourceRoom: currentRoom,
          cutoverDate: cutoverAt,
          freshSourceClosingReading: Number(sourceMeterReading),
          session,
        });
        if (finalizedSourceElectricity?.applicable) {
          estimatedElectricityKwh = finalizedSourceElectricity.kwh;
          estimatedElectricityCharge = finalizedSourceElectricity.amount;
        }
      }
      const finalizedElectricityCharge =
        finalizedSourceElectricity?.applicable ? roundMoney(finalizedSourceElectricity.amount) : 0;

      // ── Transfer Settlement Bill ───────────────────────────────────────────
      // ONE Bill, categorized charge lines that are never flattened:
      //   charges.rent            = additional same-cycle RENT liability after
      //                             applying the rent already represented by
      //                             monthly/advance coverage
      //   charges.securityDeposit = additional DEPOSIT due (destination
      //                             required − currently held, floored 0)
      //   charges.electricity     = the transferee's FINALIZED source-room
      //                             electricity through `cutoverAt` (0 for a
      //                             non-sub-metered branch)
      //   charges.water           = 0 ALWAYS — water is settled at the normal
      //                             water period close (cannot be finalized
      //                             early; see transferUtilityFinalization.js)
      // The Bill total is the canonical sumBillCharges(charges).
      const transferCharges = {
        rent: settlement.additionalAmountDue,
        electricity: finalizedElectricityCharge,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        securityDeposit: additionalDepositDue,
        discount: 0,
      };
      const transferSettlementTotal = sumBillCharges(transferCharges);
      const rentComponentDue = roundMoney(settlement.additionalAmountDue);
      const depositComponentDue = roundMoney(additionalDepositDue);
      const excessRentCredit = roundMoney(settlement.excessCredit);

      const noteParts = [
        `Transfer settlement: ${currentRoom.name || currentRoom.roomNumber} → ${targetRoom.name || targetRoom.roomNumber} on ${effectiveTransferDate.toISOString().slice(0, 10)}`,
        `rent due ₱${rentComponentDue.toFixed(2)}`,
        `deposit due ₱${depositComponentDue.toFixed(2)}`,
      ];
      if (excessRentCredit > 0) {
        noteParts.push(
          `potential excess prepaid rent ₱${excessRentCredit.toFixed(2)} requires Administration Office review on the 2nd Floor`,
        );
      }
      if (excessDepositHeld > 0) {
        noteParts.push(
          `potential excess deposit ₱${excessDepositHeld.toFixed(2)} remains held and requires Administration Office review on the 2nd Floor`,
        );
      }

      // ── Scheduled Room Transfer: RE-USE the pre-created (and possibly
      //    already-paid) Scheduled Transfer Balance Bill instead of creating a
      //    SECOND transfer_settlement Bill. completeRoomTransfer has already
      //    gated: it only calls
      //    this workflow when the linked Bill's rent + securityDeposit
      //    components equal the freshly-recomputed canonical settlement, and
      //    only when that Bill is fully settled (or zero). So here we just
      //    assert that invariant still holds in-session (a mismatch is a race
      //    -> abort the whole txn) and refresh the Bill's execution-time
      //    metadata while preserving paidAmount / status / payment history.
      const scheduledBillId = payload.scheduledTransferBillId || null;
      let transferBill;
      if (scheduledBillId) {
        transferBill = await Bill.findById(scheduledBillId).session(session);
        if (
          !transferBill ||
          String(transferBill.reservationId) !== String(reservation._id) ||
          transferBill.billType !== "transfer_settlement" ||
          transferBill.isArchived === true ||
          transferBill.status === "voided"
        ) {
          throw Object.assign(
            new Error("The linked Scheduled Room Transfer Balance Bill is missing or invalid."),
            { statusCode: 409, code: "ROOM_TRANSFER_SCHEDULED_BILL_INVALID" },
          );
        }
        const billRent = roundMoney(Number(transferBill.charges?.rent || 0));
        const billDeposit = roundMoney(Number(transferBill.charges?.securityDeposit || 0));
        const billElectricity = roundMoney(Number(transferBill.charges?.electricity || 0));
        if (
          Math.abs(billRent - roundMoney(transferCharges.rent)) > 0.01 ||
          Math.abs(billDeposit - roundMoney(transferCharges.securityDeposit)) > 0.01 ||
          Math.abs(billElectricity - roundMoney(transferCharges.electricity)) > 0.01
        ) {
          throw Object.assign(
            new Error(
              "The Scheduled Room Transfer Balance Bill no longer matches the canonical settlement recomputed at execution.",
            ),
            { statusCode: 409, code: "ROOM_TRANSFER_SCHEDULED_BILL_MISMATCH" },
          );
        }
        // Refresh execution-time metadata; never touch paidAmount / payment history.
        transferBill.roomId = currentRoom._id;
        transferBill.billingMonth = effectiveTransferDate;
        transferBill.billingCycleStart = rentCoverageBillType === "monthly"
          ? null
          : (currentBillingCycle?.billingCycleStart || effectiveTransferDate);
        transferBill.billingCycleEnd = rentCoverageBillType === "monthly"
          ? null
          : (currentBillingCycle?.billingCycleEnd || effectiveTransferDate);
        transferBill.proRataDays = proRataDays || null;
        transferBill.notes = noteParts.join("; ");
        transferBill.transferSnapshot = {
          ...(transferBill.transferSnapshot || {}),
          fromRoomId: currentRoom._id,
          fromRoomName: currentRoom.name || currentRoom.roomNumber || "",
          fromRoomType: currentRoom.type || "",
          toRoomId: targetRoom._id,
          toRoomName: targetRoom.name || targetRoom.roomNumber || "",
          toRoomType: targetRoom.type || "",
          effectiveTransferDate,
          cycleStart: currentBillingCycle?.billingCycleStart || null,
          cycleEnd: currentBillingCycle?.billingCycleEnd || null,
          sourceApprovedRate: sourceEffectiveRate,
          destinationApprovedRate: successorContract.approvedMonthlyRate,
          sourceRateSource,
          applicablePrepaidRent,
          prepaidRentSource,
          rentCoverageBillId,
          rentCoverageBillType,
          rentLiabilityForPeriod: settlement.rentLiabilityForPeriod,
          totalCoverageDays: settlement.totalCoverageDays,
          destinationDays: settlement.destinationDays,
          destinationProratedValue: settlement.destinationProratedValue,
          unusedPrepaidCredit: settlement.unusedPrepaidCredit,
          additionalAmountDue: settlement.additionalAmountDue,
          excessCredit: settlement.excessCredit,
          estimatedElectricityKwh,
          estimatedElectricityCharge: estimatedElectricityCharge > 0 ? estimatedElectricityCharge : null,
          // Source-room electricity is FINALIZED on this Bill (sub-metered
          // branch) — the period close will NOT re-bill this tenant for it
          // (a UtilityFinalization row is written in this same txn). For a
          // non-sub-metered branch, finalizedSourceElectricity is inapplicable
          // and charges.electricity stays 0.
          finalizedSourceElectricity:
            finalizedSourceElectricity?.applicable
              ? {
                  utilityPeriodId: finalizedSourceElectricity.utilityPeriodId,
                  kwh: finalizedSourceElectricity.kwh,
                  amount: finalizedSourceElectricity.amount,
                  ratePerUnit: finalizedSourceElectricity.ratePerUnit,
                  baselineReading: finalizedSourceElectricity.baselineReading,
                  closingReading: finalizedSourceElectricity.closingReading,
                }
              : null,
          sourceElectricitySettledAtPeriodClose: !finalizedSourceElectricity?.applicable,
          sourceWaterSettledAtPeriodClose: true,
          depositPreviouslyHeld: depositSettlement.depositPreviouslyHeld,
          destinationRequiredDeposit: depositSettlement.destinationRequiredDeposit,
          additionalDepositDue: depositSettlement.additionalDepositDue,
          excessDepositHeld: depositSettlement.excessDepositHeld,
          depositHeldAfterTransferBeforePayment: depositSettlement.depositHeldAfterTransferBeforePayment,
          depositHeldWasBackfilled: false,
          rentComponentDue,
          depositComponentDue,
          totalImmediateDue: transferSettlementTotal,
          transferReference: predecessorContract._id,
          isScheduledTransferBalance: true,
          reconciledAtExecution: true,
        };
        syncBillAmounts(transferBill, { preserveStatus: true });
        await transferBill.save({ session });
      } else {
      [transferBill] = await Bill.create(
        [
          {
            billType: "transfer_settlement",
            reservationId: reservation._id,
            userId: reservation.userId?._id || reservation.userId,
            branch: currentRoom.branch,
            roomId: currentRoom._id,
            billingMonth: effectiveTransferDate,
            billingCycleStart: rentCoverageBillType === "monthly"
              ? null
              : (currentBillingCycle?.billingCycleStart || effectiveTransferDate),
            billingCycleEnd: rentCoverageBillType === "monthly"
              ? null
              : (currentBillingCycle?.billingCycleEnd || effectiveTransferDate),
            proRataDays: proRataDays || null,
            charges: transferCharges,
            totalAmount: transferSettlementTotal,
            grossAmount: transferSettlementTotal,
            remainingAmount: transferSettlementTotal,
            status: transferSettlementTotal > 0 ? "pending" : "paid",
            notes: noteParts.join("; "),
            transferSnapshot: {
              fromRoomId: currentRoom._id,
              fromRoomName: currentRoom.name || currentRoom.roomNumber || "",
              fromRoomType: currentRoom.type || "",
              fromRoomPrice: currentRoom.monthlyPrice || currentRoom.price || 0,
              toRoomId: targetRoom._id,
              toRoomName: targetRoom.name || targetRoom.roomNumber || "",
              toRoomType: targetRoom.type || "",
              toRoomPrice: targetRoom.monthlyPrice || targetRoom.price || 0,
              effectiveTransferDate,
              outstandingBalanceAtTransfer: billingSummary.currentBalance,
              // Source-room days used / consumed value (kept under the
              // existing field names for backward-compatible admin UI reads).
              proRataDays,
              proRataRent,
              // ── RENT breakdown (actual-days) ─────────────────────────────
              // sourceApprovedRate is the RESOLVED source-effective rent used
              // to value consumed days (see sourceRateSource) — for a
              // structured reservation with an approved discount this is
              // pricingSnapshot.finalMonthlyRate, not the raw predecessor
              // Contract field.
              cycleStart: currentBillingCycle?.billingCycleStart || null,
              cycleEnd: currentBillingCycle?.billingCycleEnd || null,
              sourceApprovedRate: sourceEffectiveRate,
              destinationApprovedRate: successorContract.approvedMonthlyRate,
              sourceRateSource,
              applicablePrepaidRent,
              prepaidRentSource,
              rentCoverageBillId,
              rentCoverageBillType,
              rentLiabilityForPeriod: settlement.rentLiabilityForPeriod,
              totalCoverageDays: settlement.totalCoverageDays,
              destinationDays: settlement.destinationDays,
              destinationProratedValue: settlement.destinationProratedValue,
              unusedPrepaidCredit: settlement.unusedPrepaidCredit,
              additionalAmountDue: settlement.additionalAmountDue,
              excessCredit: settlement.excessCredit,
              estimatedElectricityKwh,
              estimatedElectricityCharge: estimatedElectricityCharge > 0 ? estimatedElectricityCharge : null,
              // Round-3: source-room electricity is FINALIZED on THIS Bill
              // (sub-metered branch) — the period close will NOT re-bill this
              // tenant (a UtilityFinalization row is written in this same txn).
              // For a non-sub-metered branch, finalizedSourceElectricity is
              // inapplicable and charges.electricity stays 0.
              finalizedSourceElectricity:
                finalizedSourceElectricity?.applicable
                  ? {
                      utilityPeriodId: finalizedSourceElectricity.utilityPeriodId,
                      kwh: finalizedSourceElectricity.kwh,
                      amount: finalizedSourceElectricity.amount,
                      ratePerUnit: finalizedSourceElectricity.ratePerUnit,
                      baselineReading: finalizedSourceElectricity.baselineReading,
                      closingReading: finalizedSourceElectricity.closingReading,
                    }
                  : null,
              sourceElectricitySettledAtPeriodClose: !finalizedSourceElectricity?.applicable,
              sourceWaterSettledAtPeriodClose: true,
              // ── DEPOSIT breakdown (independent of rent) ──────────────────
              depositPreviouslyHeld: depositSettlement.depositPreviouslyHeld,
              destinationRequiredDeposit: depositSettlement.destinationRequiredDeposit,
              additionalDepositDue: depositSettlement.additionalDepositDue,
              excessDepositHeld: depositSettlement.excessDepositHeld,
              depositHeldAfterTransferBeforePayment: depositSettlement.depositHeldAfterTransferBeforePayment,
              depositHeldWasBackfilled: false,
              // ── FINAL settlement components ─────────────────────────────
              rentComponentDue,
              depositComponentDue,
              totalImmediateDue: transferSettlementTotal,
              transferReference: predecessorContract._id,
            },
          },
        ],
        { session },
      );
      }

      // ── UtilityFinalization — mark the transferee's source-room electricity
      //    as settled for the CURRENT open period. Read at period close ONLY by
      //    upsertDraftBillsForUtility, to SKIP a duplicate electricity draft
      //    Bill for this tenant — it does NOT remove them from the canonical
      //    allocation (their moveOut UtilityReading keeps them a participant in
      //    the pre-cutover segments). Idempotent: unique on (reservationId,
      //    utilityPeriodId, utilityType); a retried cutover upserts.
      if (finalizedSourceElectricity?.applicable && finalizedElectricityCharge >= 0) {
        await UtilityFinalization.findOneAndUpdate(
          {
            reservationId: reservation._id,
            utilityPeriodId: finalizedSourceElectricity.utilityPeriodId,
            utilityType: "electricity",
          },
          {
            $set: {
              tenantId: reservation.userId?._id || reservation.userId,
              roomId: currentRoom._id,
              branch: currentRoom.branch,
              utilityType: "electricity",
              utilityPeriodId: finalizedSourceElectricity.utilityPeriodId,
              throughReading: finalizedSourceElectricity.closingReading,
              throughDate: cutoverAt,
              settledAmount: finalizedElectricityCharge,
              settledKwh: finalizedSourceElectricity.kwh,
              settlementBillId: transferBill._id,
              scheduledRoomTransferId: payload.__scheduledTransferId || null,
              createdBy: actorId,
            },
          },
          { upsert: true, new: true, session },
        );
      }

      // Excess prepaid rent is recorded in the transfer snapshot only. It is
      // never converted into TenantCredit or refunded automatically; the
      // Administration Office on the 2nd Floor coordinates any adjustment.

      // ── Security deposit HELD ledger ───────────────────────────────────────
      // Held CASH does NOT change at transfer time:
      //   - a higher-deposit destination bills the difference (charges.
      //     securityDeposit) and only funds securityDepositHeld when that
      //     component is CONFIRMED PAID (paymentLedger.js);
      //   - a lower-deposit destination leaves the excess held (refundable).
      // We only (a) initialise securityDepositHeld from move-in financials if
      // it was never populated, and (b) append an audit entry recording the
      // new REQUIRED amount and any additional-due / excess-held.
      const rawResHeld = reservation.securityDepositHeld;
      const hasResHeld = rawResHeld !== null && rawResHeld !== undefined && Number.isFinite(Number(rawResHeld));
      const heldBefore = hasResHeld
        ? roundMoney(Number(rawResHeld))
        : roundMoney(depositCurrentlyHeld);
      // Completion may use verified financial evidence, but it must not turn
      // that read into an implicit legacy-data backfill. An explicit Admin
      // verification has already populated the canonical field before this
      // workflow, so only an existing canonical value is preserved here.
      if (hasResHeld) reservation.securityDepositHeld = heldBefore;
      reservation.securityDepositLedger = reservation.securityDepositLedger || [];
      const depositLedgerKey = `room_transfer_adjustment_due:${String(predecessorContract._id)}`;
      if (!reservation.securityDepositLedger.some((e) => e.idempotencyKey === depositLedgerKey)) {
        reservation.securityDepositLedger.push({
          kind: "transfer_adjustment_due",
          previousHeld: heldBefore,
          adjustmentAmount: 0, // held cash unchanged at this point
          resultingHeld: heldBefore,
          sourceRef: { kind: "bill", id: transferBill._id },
          transferReference: predecessorContract._id,
          billId: transferBill._id,
          idempotencyKey: depositLedgerKey,
          reason:
            `Room transfer ${currentRoom.roomNumber} -> ${targetRoom.roomNumber}: ` +
            `required deposit ₱${destinationRequiredDeposit.toFixed(2)}, held ₱${heldBefore.toFixed(2)}` +
            (additionalDepositDue > 0 ? `, additional ₱${additionalDepositDue.toFixed(2)} due on Bill` : "") +
            (excessDepositHeld > 0
              ? `, potential excess ₱${excessDepositHeld.toFixed(2)} remains held for Administration Office review on the 2nd Floor`
              : ""),
          createdBy: actorId,
        });
      }

      const activeHistory = await BedHistory.findOne({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
        status: "active",
      })
        .sort({ moveInDate: -1 })
        .session(session);
      if (activeHistory) {
        activeHistory.observedEndAt = cutoverAt;
        activeHistory.moveOutDate = cutoverDay;
        activeHistory.effectiveEndDate = cutoverDay;
        activeHistory.status = "transferred";
        activeHistory.closedByAction = "transfer";
        activeHistory.reason = payload.reason || "Room transfer";
        activeHistory.notes = payload.notes || "";
        if (sourceMeterReading != null) activeHistory.transferSourceReading = Number(sourceMeterReading);
        if (targetMeterReading != null) activeHistory.transferTargetReading = Number(targetMeterReading);
        // ── Store permanent room snapshot and billing state on BedHistory ──
        activeHistory.proratedRentAdjustment = proRataRent;
        activeHistory.fromRoomSnapshot = {
          roomId: currentRoom._id,
          name: currentRoom.name || "",
          roomNumber: currentRoom.roomNumber || "",
          type: currentRoom.type || "",
          floor: currentRoom.floor || null,
          branch: currentRoom.branch || "",
          monthlyPrice: currentRoom.monthlyPrice || currentRoom.price || 0,
        };
        activeHistory.billingSnapshotAtTransfer = {
          totalOutstanding: billingSummary.currentBalance,
          totalBilled: billingSummary.visibleBills.reduce(
            (sum, e) => sum + Number(e.bill?.totalAmount || 0), 0,
          ),
          totalPaid: billingSummary.visibleBills.reduce(
            (sum, e) => sum + Number(e.bill?.paidAmount || 0), 0,
          ),
          proRataDays,
          proRataRent,
        };
        await activeHistory.save({ session });
      } else {
        // No active BedHistory row for the SOURCE room — today move-in only
        // creates one for shared rooms, so a tenant transferring OUT of a
        // PRIVATE room would otherwise leave no room-scoped occupancy record.
        // Utility (electricity/water) billing resolves a room's occupants for
        // a period spanning the transfer from BedHistory, so create the
        // closed audit row now. Room-scoped, written in this same
        // transaction, rolled back with everything else on failure.
        const sourceBedSentinel = (sourceNeedsBed && activeStay.bedId) || `room-${currentRoom._id}`;
        await BedHistory.create(
          [
            {
              bedId: sourceBedSentinel,
              roomId: currentRoom._id,
              branch: currentRoom.branch,
              tenantId: reservation.userId?._id || reservation.userId,
              reservationId: reservation._id,
              stayId: activeStay._id,
              moveInDate: readMoveInDate(reservation) || activeStay.leaseStartDate,
              effectiveStartDate: readMoveInDate(reservation) || activeStay.leaseStartDate,
              moveOutDate: cutoverDay,
              effectiveEndDate: cutoverDay,
              status: "transferred",
              closedByAction: "transfer",
              reason: payload.reason || "Room transfer",
              notes: payload.notes || "",
              transferSourceReading: sourceMeterReading != null ? Number(sourceMeterReading) : null,
              transferTargetReading: targetMeterReading != null ? Number(targetMeterReading) : null,
              proratedRentAdjustment: proRataRent,
              fromRoomSnapshot: {
                roomId: currentRoom._id,
                name: currentRoom.name || "",
                roomNumber: currentRoom.roomNumber || "",
                type: currentRoom.type || "",
                floor: currentRoom.floor || null,
                branch: currentRoom.branch || "",
                monthlyPrice: currentRoom.monthlyPrice || currentRoom.price || 0,
              },
              billingSnapshotAtTransfer: {
                totalOutstanding: billingSummary.currentBalance,
                totalBilled: billingSummary.visibleBills.reduce(
                  (sum, e) => sum + Number(e.bill?.totalAmount || 0), 0,
                ),
                totalPaid: billingSummary.visibleBills.reduce(
                  (sum, e) => sum + Number(e.bill?.paidAmount || 0), 0,
                ),
                proRataDays,
                proRataRent,
              },
            },
          ],
          { session },
        );
      }

      // A private destination has no per-bed record. BedHistory.bedId and
      // Stay.bedId are both required String fields (Mongoose rejects ""), so
      // use one stable room-scoped sentinel for both — the canonical
      // private-room bed representation for this flow. All close-out /
      // resolution lookups here are by reservation/tenant/room/status, never
      // bed-scoped, so the sentinel is inert.
      const privateBedSentinel = `room-${targetRoom._id}`;
      const stayBedId = targetBedIdentifier || privateBedSentinel;
      await BedHistory.create(
        [
          {
            bedId: stayBedId,
            roomId: targetRoom._id,
            branch: targetRoom.branch,
            tenantId: reservation.userId?._id || reservation.userId,
            reservationId: reservation._id,
            stayId: activeStay._id,
            observedStartAt: cutoverAt,
            moveInDate: cutoverDay,
            effectiveStartDate: cutoverDay,
            status: "active",
            reason: payload.reason || "Room transfer",
            notes: payload.notes || "",
            transferSourceReading: sourceMeterReading != null ? Number(sourceMeterReading) : null,
            transferTargetReading: targetMeterReading != null ? Number(targetMeterReading) : null,
          },
        ],
        { session },
      );

      const destinationApprovedRate = Number(successorContract.approvedMonthlyRate) || 0;

      activeStay.roomId = targetRoom._id;
      // Shared destination -> the real bed id; private destination -> the
      // room-scoped sentinel (Stay.bedId is a required String).
      activeStay.bedId = stayBedId;
      // Move-out deposit clearance reads Stay.monthlyRent for the 1x-rate
      // deposit fallback — keep it aligned with the destination rate so a
      // legacy tenant (no securityDepositHeld yet) still gets the right
      // destination-based figure.
      if (destinationApprovedRate > 0) activeStay.monthlyRent = destinationApprovedRate;
      activeStay.transferNotes = payload.notes || payload.reason || "";
      activeStay.updatedBy = actorId;
      await activeStay.save({ session });

      reservation.roomId = targetRoom._id;
      // Reservation.selectedBed.id follows the existing convention of "" for
      // a private room (it is not a required field).
      reservation.selectedBed = {
        id: targetBedIdentifier || "",
        position: targetBed?.position || null,
      };
      reservation.currentStayId = activeStay._id;
      reservation.latestStayStatus = activeStay.status;
      // Future rent bills (generated after this transfer) must bill the
      // destination room's approved rate, not the old room's — the
      // recurring due-date/billing-cycle anchor itself (movein-based) is
      // deliberately left untouched, this only updates which rate applies.
      reservation.monthlyRent = destinationApprovedRate || reservation.monthlyRent;
      // A STRUCTURED reservation's recurring rent bill normally resolves from
      // the IMMUTABLE pricingSnapshot.finalMonthlyRate (which a room transfer
      // may not touch — see the Reservation pre-save guard). Record the
      // post-transfer destination rate on a dedicated recurringRentRate
      // field; resolveReservationRentAmount (rentGenerator.js) prefers it
      // over the snapshot when set, so the next monthly Bill uses the
      // destination rate without violating snapshot immutability.
      if (destinationApprovedRate > 0) {
        reservation.recurringRentRate = destinationApprovedRate;
      }

      // Ensure declared appliance add-ons cleanly carry over during room transfers within Guadalupe
      const targetBranch = String(targetRoom.branch || "").toLowerCase();
      if (targetBranch === "guadalupe") {
        reservation.selectedAppliances = reservation.selectedAppliances || [];
        reservation.applianceFees = Number(reservation.applianceFees || 0);
        reservation.totalPrice = Number(reservation.monthlyRent || 0) + Number(reservation.applianceFees || 0);

        if (payload?.successorReservationId) {
          const succRes = await Reservation.findById(payload.successorReservationId).session(session);
          if (succRes) {
            succRes.selectedAppliances = Array.isArray(reservation.selectedAppliances)
              ? JSON.parse(JSON.stringify(reservation.selectedAppliances))
              : [];
            succRes.applianceFees = Number(reservation.applianceFees || 0);
            if (succRes.monthlyRent != null) {
              succRes.totalPrice = Number(succRes.monthlyRent) + Number(succRes.applianceFees);
            }
            await succRes.save({ session });
          }
        }
      }

      await reservation.save({ session });

      // ── Addendum effective-date alignment (audit item 3) ──────────────────
      // The successor's `amendmentEffectiveDate` was stamped in Stage A from the
      // SCHEDULED date. When the transfer completes LATER than scheduled, the
      // real occupancy/billing boundary is `cutoverDay` — the contract must not
      // silently disagree.
      //   A. Still an UNACKNOWLEDGED draft (the normal case — the tenant
      //      acknowledges the Addendum AFTER the transfer) → re-stamp
      //      `amendmentEffectiveDate` to `cutoverDay` in this same transaction.
      //   B. Already acknowledged / wet-signed → NEVER silently modify it.
      //      Abort with a clear code so the admin reschedules (which re-points
      //      the date) or re-issues the Addendum for re-acknowledgement.
      {
        const stampedDay = successorContract.amendmentEffectiveDate
          ? normalizeDate(successorContract.amendmentEffectiveDate)
          : null;
        const mismatch =
          !stampedDay || !cutoverDay || stampedDay.getTime() !== cutoverDay.getTime();
        if (mismatch) {
          const ackCount = await ContractAcknowledgement.countDocuments({
            contractId: successorContract._id,
          }).session(session);
          const alreadySigned =
            ackCount > 0 ||
            successorContract.tenantSignatureStatus === "completed" ||
            ["signed", "awaiting_notarization", "notarized", "ready_for_publication", "published", "active"].includes(
              successorContract.status,
            );
          if (alreadySigned) {
            throw Object.assign(
              new Error(
                "The Room Transfer Addendum has already been acknowledged/signed for the originally scheduled date. " +
                  "Reschedule the transfer (which re-issues the Addendum for the new date) before completing it.",
              ),
              { statusCode: 409, code: "ADDENDUM_EFFECTIVE_DATE_LOCKED" },
            );
          }
          successorContract.amendmentEffectiveDate = cutoverDay;
          successorContract.updatedBy = actorId;
          successorContract.statusHistory.push({
            status: successorContract.status,
            changedBy: actorId,
            reason: `Amendment effective date aligned to the actual transfer cutover (${cutoverDay
              .toISOString()
              .slice(0, 10)}); the scheduled date was earlier.`,
          });
          await successorContract.save({ session });
        }
      }

      // ── Contract cutover — last step before commit. Participates in this
      // same transaction (session passed through): a failure here rolls
      // back every physical mutation above via session.withTransaction's
      // automatic abort; success here can never be reached if any physical
      // mutation above already failed. This is the single Contract
      // transition authority — no manual status/isCurrent mutation here.
      // Draft variant: the successor is a tenant-visible generated Draft
      // (prepared in Stage A), not a wet-signed final — predecessor →
      // replaced, successor → isCurrent + tenantVisible, status left at
      // "generated". Wet-signing stays a later admin step.
      const cutover = await activateRoomTransferSuccessorDraft({
        successorContractId: successorContract._id,
        actorId,
        session,
      });

      if (scheduledExecution) {
        const consumed = await ScheduledRoomTransfer.updateOne(
          {
            _id: scheduledExecution._id,
            executionToken: payload.__scheduledExecutionToken,
            holdApplied: true,
            status: { $in: ["scheduled", "action_required"] },
          },
          {
            $set: {
              status: "executed",
              executedAt: cutoverAt,
              settlementBillId: transferBill?._id || null,
              sourceRoomMeterReading: sourceMeterReading != null ? Number(sourceMeterReading) : null,
              targetRoomMeterReading: targetMeterReading != null ? Number(targetMeterReading) : null,
              holdApplied: false,
              executionToken: null,
              executionStartedAt: null,
              lastError: null,
              lastAttemptAt: new Date(),
            },
          },
          { session },
        );
        if (consumed.modifiedCount !== 1) {
          throw Object.assign(new Error("The scheduled destination hold could not be consumed atomically."), {
            statusCode: 409,
            code: "SCHEDULED_TRANSFER_HOLD_CONSUME_FAILED",
          });
        }
      }

      result = {
        contractCutover: {
          predecessorContractId: String(predecessorContract._id),
          successorContractId: String(successorContract._id),
          predecessorStatus: cutover.predecessor?.status || predecessorContract.status,
          successorStatus: cutover.successor?.status || successorContract.status,
        },
        reservation,
        stay: activeStay.toObject(),
        // The AUTHORITATIVE physical cutover timestamp — captured inside this
        // transaction, used for both UtilityReading writes + UtilityFinalization.
        // The caller (completeRoomTransfer) stamps ScheduledRoomTransfer.executedAt
        // + the completion audit from this value.
        cutoverAt,
        fromRoomName: currentRoom.name || currentRoom.roomNumber || "Unknown room",
        toRoomName: targetRoom.name || targetRoom.roomNumber || "Unknown room",
        // Full room snapshots at transfer time
        fromRoomDetails: {
          roomId: currentRoom._id,
          name: currentRoom.name || "",
          roomNumber: currentRoom.roomNumber || "",
          type: currentRoom.type || "",
          floor: currentRoom.floor || null,
          branch: currentRoom.branch || "",
          monthlyPrice: currentRoom.monthlyPrice || currentRoom.price || 0,
          capacity: currentRoom.capacity || 0,
          occupancyAfterTransfer: currentRoom.currentOccupancy,
          vacatedBedId: activeStay.bedId,
        },
        toRoomDetails: {
          roomId: targetRoom._id,
          name: targetRoom.name || "",
          roomNumber: targetRoom.roomNumber || "",
          type: targetRoom.type || "",
          floor: targetRoom.floor || null,
          branch: targetRoom.branch || "",
          monthlyPrice: targetRoom.monthlyPrice || targetRoom.price || 0,
          capacity: targetRoom.capacity || 0,
          occupancyAfterTransfer: targetRoom.currentOccupancy,
          assignedBedId: targetBedIdentifier || null,
          assignedBedPosition: targetBed?.position || null,
        },
        billingSnapshot: {
          outstandingBalanceAtTransfer: billingSummary.currentBalance,
          proRataDays,
          proRataRent,
          transferBillId: transferBill?._id || null,
          // Rent and deposit components kept separate.
          rentComponentDue,
          depositComponentDue,
          // Finalized source-room electricity settled ON the transfer_settlement
          // Bill (sub-metered branch); 0 otherwise.
          electricityComponentDue: roundMoney(transferCharges.electricity),
          finalizedSourceElectricity: finalizedSourceElectricity?.applicable
            ? {
                utilityPeriodId: finalizedSourceElectricity.utilityPeriodId,
                kwh: finalizedSourceElectricity.kwh,
                amount: finalizedSourceElectricity.amount,
              }
            : null,
          excessRentCredit,
          excessDepositHeld,
          depositPreviouslyHeld: depositSettlement.depositPreviouslyHeld,
          destinationRequiredDeposit: depositSettlement.destinationRequiredDeposit,
          totalImmediateDue: transferSettlementTotal,
        },
      };
    });
  } finally {
    await session.endSession();
  }

  // ── Post-transaction: AuditLog + Tenant Notification ──────────────────────
  // Both are best-effort and awaited so each committed transfer attempts them
  // exactly once before returning. Errors here must never fail the transfer.
  if (result) {
    const postCommitTasks = [AuditLog.log({
      type: "data_modification",
      action: `Room transfer: ${result.fromRoomName} → ${result.toRoomName}`,
      severity: "high",
      user: actorId ? String(actorId) : "system",
      userId: actorId || null,
      entityType: "reservation",
      entityId: String(reservationId),
      details: `Room transfer completed for reservation ${reservationId}.`,
      metadata: {
        reservationId,
        fromRoomId: result.fromRoomDetails?.roomId,
        fromRoomName: result.fromRoomDetails?.name,
        toRoomId: result.toRoomDetails?.roomId,
        toRoomName: result.toRoomDetails?.name,
        transferBillId: result.billingSnapshot?.transferBillId,
        proRataRent: result.billingSnapshot?.proRataRent,
        sourceMeterReading: payload.sourceRoomMeterReading ?? null,
        targetMeterReading: payload.targetRoomMeterReading ?? null,
      },
    })];

    const tenantId = result.reservation?.userId?._id || result.reservation?.userId;
    if (tenantId) {
      const fromName = result.fromRoomName || "previous room";
      const toName = result.toRoomName || "new room";
      postCommitTasks.push(createNotification(
        tenantId,
        "general",
        "Room Transfer Confirmed",
        `Your room has been transferred from ${fromName} to ${toName}. A settlement statement has been generated for your previous room.`,
        {
          entityType: "reservation",
          entityId: reservationId,
          emitRealtime: true,
        },
      ));
    }

    await Promise.allSettled(postCommitTasks);

    // Contract lineage: the replacement Contract Draft was generated in
    // Stage A and made the tenant's current Contract by the cutover inside
    // the transaction. Nudge the web/admin/mobile surfaces to refetch so the
    // new Draft (and its Pending acknowledgement) shows without a manual
    // reload. Fire-and-forget — the transfer already succeeded.
    try {
      const { emitToUser, emitToAdmins } = await import("./socket.js");
      const succId = result.contractCutover?.successorContractId;
      if (tenantId && succId && typeof emitToUser === "function") {
        emitToUser(tenantId, "contract:updated", {
          contractId: String(succId),
          reason: "room_transfer",
          reservationId: String(reservationId),
        });
      }
      if (succId && typeof emitToAdmins === "function") {
        emitToAdmins("contract:updated", { contractId: String(succId), reason: "room_transfer" });
      }
    } catch {
      // realtime layer optional — a plain refresh still shows the new Draft
    }

    return result;
  }
  return result;
}

export async function moveOutStayWorkflow({ reservationId, payload, actorId }) {
  const validatedFinalUtilityReading = parsePhysicalMeterReading(payload?.finalUtilityReading, {
    fieldLabel: "Final utility meter reading",
    maximum: 999999.99,
  });
  payload = { ...payload, finalUtilityReading: validatedFinalUtilityReading };
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findById(reservationId)
        .populate("roomId", "name roomNumber branch type currentOccupancy capacity")
        .populate("userId", "firstName lastName email tenantStatus firebaseUid role branch")
        .session(session);
      if (!reservation) {
        throw Object.assign(new Error("Reservation not found"), { statusCode: 404, code: "RESERVATION_NOT_FOUND" });
      }
      if (!hasReservationStatus(reservation.status, "moveIn")) {
        throw Object.assign(new Error("Only active moved-in tenants can be moved out."), { statusCode: 400, code: "INVALID_STATUS_FOR_MOVEOUT" });
      }
      if (!payload?.confirm) {
        throw Object.assign(new Error("Move-out confirmation is required."), { statusCode: 400, code: "CONFIRM_REQUIRED" });
      }

      const predecessorContract = await resolveAuthoritativeCurrentContract({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
      }).catch(() => null);
      const activeStay = await ensureActiveStay(reservation, actorId, session, predecessorContract);
      if (!activeStay || !CURRENT_STAY_STATUSES.includes(activeStay.status)) {
        throw Object.assign(new Error("No active stay found for move-out."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
      }

      const moveOutAt = parseDateTime(payload.moveOutDate, payload.actualVacateTime || "");
      if (!moveOutAt) {
        throw Object.assign(new Error("A valid move-out date is required."), { statusCode: 400, code: "INVALID_MOVEOUT_DATE" });
      }
      if (readMoveInDate(reservation) && moveOutAt < new Date(readMoveInDate(reservation))) {
        throw Object.assign(new Error("Move-out date cannot be earlier than move-in date."), { statusCode: 400, code: "MOVEOUT_BEFORE_MOVEIN" });
      }
      await recordWaterObservation({room:reservation.roomId,reading:payload.finalWaterReading,
        eventAt:moveOutAt,eventType:'moveOut',reservationId:reservation._id,stayId:activeStay._id,
        tenantId:reservation.userId?._id || reservation.userId,actorId,session,source:'move-out'});
      const moveOutBoundary = branchSupportsSeparateUtilityBillingSafe(
        reservation.roomId?.branch || activeStay.roomId?.branch,
        "electricity",
      )
        ? await resolveRoomUtilityBoundaryContext({
            roomId: activeStay.roomId?._id || activeStay.roomId,
            utilityType: "electricity",
            eventAt: moveOutAt,
            reading: validatedFinalUtilityReading,
            eventType: "moveOut",
            reservationId: reservation._id,
            tenantId: reservation.userId?._id || reservation.userId,
            actorId,
            allowInitialize: false,
            session,
          })
        : null;

      const bills = await Bill.find({
        reservationId: reservation._id,
        isArchived: { $ne: true },
      }).session(session).lean();
      const billingSummary = buildBillingSummary(bills);

      // ── Move-out billing blocker ──────────────────────────────────────────
      // Block move-out when the tenant has an outstanding balance unless the
      // admin explicitly sets forceOverride: true after reviewing the balance.
      // This prevents accidental move-outs that leave uncollectable debt.
      if (billingSummary.hasOutstanding && !payload.forceOverride) {
        const formattedBalance = Number(billingSummary.currentBalance).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        throw Object.assign(
          new Error(
            `Tenant has ₱${formattedBalance} in outstanding balance. Settle all bills before processing move-out, or acknowledge and force-proceed.`,
          ),
          {
            statusCode: 409,
            code: "OUTSTANDING_BILLS_BLOCKING_MOVEOUT",
            outstandingBalance: billingSummary.currentBalance,
            paymentStatus: billingSummary.paymentStatus,
          },
        );
      }

      const room = await Room.findById(activeStay.roomId).session(session);
      if (room) {
        // Vacate bed immediately — available for the next reservation
        room.vacateBed(activeStay.bedId);
        room.currentOccupancy = Math.max(0, Number(room.currentOccupancy || 0) - 1);
        room.updateAvailability();
        await room.save({ session });
      }

      const activeHistory = await BedHistory.findOne({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
        status: "active",
      })
        .sort({ moveInDate: -1 })
        .session(session);
      if (activeHistory) {
        activeHistory.observedEndAt = moveOutAt;
        activeHistory.moveOutDate = moveOutAt;
        activeHistory.effectiveEndDate = moveOutAt;
        activeHistory.status = "completed";
        activeHistory.closedByAction = "move_out";
        activeHistory.reason = payload.reason || "Move out";
        activeHistory.notes = payload.finalNotes || "";
        await activeHistory.save({ session });
      }

      activeStay.status = payload.reason === "terminated" ? "terminated" : "completed";
      activeStay.endedAt = moveOutAt;
      activeStay.endReason = payload.reason || "move_out";
      activeStay.moveOutNotes = payload.finalNotes || "";
      activeStay.updatedBy = actorId;
      await activeStay.save({ session });

      // ── Contract lifecycle synchronization ──────────────────────────────
      // Move-out must also formally close the tenant's Contract — otherwise
      // it is silently left at "active"/"expiring_soon" forever, which lets
      // stale renewals activate and lets the tenant/admin keep seeing an
      // "Active Contract" for a tenancy that has already ended. A normal,
      // full-term move-out drives the Contract to "expired" (move-out is the
      // sole writer of that status); reason:"terminated" (early exit or
      // administrative termination) drives it to "terminated" instead. Both
      // are legal terminal edges from published/active/expiring_soon in
      // CONTRACT_TRANSITIONS, and transitionContract forces isCurrent:false
      // for either (see terminalStatuses in contractService.js).
      const currentContract = await resolveAuthoritativeCurrentContract({
        reservationId: reservation._id,
        session,
      });
      if (
        currentContract &&
        !["terminated", "archived", "expired", "replaced", "cancelled"].includes(
          currentContract.status,
        )
      ) {
        const targetStatus = payload.reason === "terminated" ? "terminated" : "expired";
        await transitionContract(
          currentContract,
          targetStatus,
          actorId,
          payload.reason === "terminated" ? "early_termination_move_out" : "normal_completion_move_out",
          session,
        );

        // A dangling lease renewal chained off the Contract we just closed
        // out is now meaningless — left alone, the daily renewal-activation
        // cron could otherwise activate it for a tenant who has already
        // left. Cancel it here, synchronously, in the same transaction.
        const danglingRenewal = await Contract.findOne({
          contractPurpose: "renewal",
          replacesContractId: currentContract._id,
          status: { $in: ["published", "renewal_pending"] },
        }).session(session);
        if (danglingRenewal) {
          await transitionContract(
            danglingRenewal,
            "cancelled",
            actorId,
            "predecessor_moved_out",
            session,
          );
        }
      } else if (!currentContract) {
        logger.warn(
          { reservationId: reservation._id },
          "Move-out completed with no resolvable current Contract — nothing to transition (known gap, tracked separately).",
        );
      }

      reservation.status = "moveOut";
      reservation.moveOutDate = moveOutAt;
      reservation.currentStayId = activeStay._id;
      reservation.latestStayStatus = activeStay.status;

      // ── Deposit Forfeiture & Settlement Calculation ──────────────────────────
      const leaseEndDate = activeStay.leaseEndDate
        ? new Date(activeStay.leaseEndDate)
        : null;
      const isEarlyVacancy = leaseEndDate && moveOutAt < leaseEndDate;

      // Settle against the ACTUAL cash held (kept authoritative by the
      // room-transfer + payment flows). Phase 10:
      //   - `Number(null)` is 0, so a legacy record (securityDepositHeld
      //     never populated) or one the transfer flow BACKFILLED to 0
      //     (move-in financials not settled) must NOT be read as "₱0 held".
      //   - A genuine 0-held record is indistinguishable from those and, in
      //     practice, means nothing to refund anyway — so both fall back to
      //     the canonical basis: the current Stay's monthly rent (which the
      //     transfer keeps aligned to the destination rate), then the 1x
      //     resolver. This mirrors moveOutClearanceService.openMoveOutClearance.
      const heldRaw = Number(reservation.securityDepositHeld);
      const heldIsRealCash = Number.isFinite(heldRaw) && heldRaw > 0;
      const securityDepositAmount = heldIsRealCash
        ? heldRaw
        : Number(activeStay?.monthlyRent) > 0
          ? Number(activeStay.monthlyRent)
          : resolveSecurityDeposit(reservation);
      const outstandingBal = Number(billingSummary.currentBalance || 0);
      const damageDeductions = Number(payload.damageDeductions || 0);
      const keyDeduction = payload.keyReturned === false ? 500 : 0;
      const netSettlement = isEarlyVacancy
        ? 0
        : Math.max(0, securityDepositAmount - outstandingBal - damageDeductions - keyDeduction);

      if (isEarlyVacancy) {
        reservation.depositForfeited = true;
        reservation.depositForfeitureReason = "early_vacancy";
        reservation.depositForfeitedAt = new Date();
        reservation.depositRefundAmount = 0;
        reservation.depositRefundDeadline = null;
        reservation.depositRefundStatus = "forfeited";
      } else {
        reservation.depositForfeited = false;
        reservation.depositForfeitureReason = null;
        reservation.depositForfeitedAt = null;
        reservation.depositRefundDeadline = dayjs(moveOutAt).add(30, "day").toDate();
        reservation.depositRefundAmount = netSettlement;
        reservation.depositRefundStatus = "pending";
      }

      if (payload.keyReturned !== undefined) {
        reservation.keyReturned = Boolean(payload.keyReturned);
        reservation.keyReturnAssessedAt = new Date();
      }

      // Additive fields for the early-termination call path
      // (executeEarlyTerminationWorkflow) — do not alter the deposit
      // forfeiture/settlement formula above, only record the penalty
      // context alongside it when supplied.
      if (payload.earlyTerminationPenalty !== undefined) {
        reservation.earlyTerminationPenalty = Number(payload.earlyTerminationPenalty);
      }
      if (payload.forfeitureReason && payload.reason === "terminated") {
        // Only accept schema-valid depositForfeitureReason values
        // (['early_vacancy','admin_decision',null]); an early termination maps
        // to "early_vacancy". Anything else is ignored so a bad caller value
        // can't fail the move-out save.
        const VALID_FORFEITURE_REASONS = new Set(["early_vacancy", "admin_decision"]);
        if (VALID_FORFEITURE_REASONS.has(payload.forfeitureReason)) {
          reservation.depositForfeitureReason = payload.forfeitureReason;
        }
      }

      reservation.finalSettlementSummary = {
        securityDeposit: securityDepositAmount,
        outstandingBalance: outstandingBal,
        finalElectricityReading: validatedFinalUtilityReading,
        finalWaterReading: payload.finalWaterReading ?? null,
        waterLiabilityStatus: requiresWaterObservation(reservation.roomId) ? "pending-period-close" : "included-in-rent",
        finalUtilityCharge: 0,
        damageDeductions,
        keyDeduction,
        netAmount: netSettlement,
        settlementType: isEarlyVacancy
          ? "forfeited"
          : (netSettlement > 0 ? "refund" : (outstandingBal > 0 ? "payment_due" : "zero_balance")),
        settledAt: new Date(),
      };

      await reservation.save({ session });

      const tenant = await User.findById(reservation.userId?._id || reservation.userId).session(session);
      if (tenant) {
        tenant.tenantStatus = "moved_out";
        tenant.branch = reservation.roomId?.branch || tenant.branch;
        await tenant.save({ session });
      }

      result = {
        reservation,
        stay: activeStay.toObject(),
        utilityPeriodId: moveOutBoundary?.period?._id || null,
        utilityReadingId: moveOutBoundary?.boundary?._id || null,
        billingSummary,
        depositSettlement: {
          depositForfeited: reservation.depositForfeited,
          depositForfeitureReason: reservation.depositForfeitureReason,
          depositForfeitedAt: reservation.depositForfeitedAt,
          depositRefundDeadline: reservation.depositRefundDeadline,
          depositRefundAmount: reservation.depositRefundAmount,
          keyReturned: reservation.keyReturned,
          isEarlyVacancy: Boolean(isEarlyVacancy),
          leaseEndDate: leaseEndDate,
          actualMoveOutDate: moveOutAt,
        },
      };
    });

    // ── Tenant is leaving the dorm: resolve any OPEN scheduled room transfer
    //    so a future destination hold is never left blocking a room after the
    //    tenant is gone. No payment -> safe auto-cancel; payment exists ->
    //    hold released but Bill/Payment/deposit-ledger/Addendum history
    //    preserved + action_required PAYMENT_ALREADY_RECEIVED. Never executes
    //    the transfer. Best-effort — runs AFTER the move-out txn commits and
    //    never fails the move-out itself. (Termination routes through this
    //    same workflow.)
    try {
      const { resolveScheduledTransferBeforeTenantDeparture } = await import(
        "../services/scheduledRoomTransferExecutor.js"
      );
      await resolveScheduledTransferBeforeTenantDeparture(reservationId, { actorId });
    } catch (e) {
      logger.warn({ err: e, reservationId }, "moveOutStayWorkflow: scheduled-transfer resolution failed (non-fatal)");
    }

    return result;
  } finally {
    await session.endSession();
  }
}

// NOTE (R1 hybrid reconciliation): main's `cancelTransferStayWorkflow` is
// intentionally NOT carried forward. It operated on the phantom
// `reservation.pendingTransfer*` / `transferStatus` fields and a bed "lock"
// that the prepare step never actually set, and it filtered on
// `contractPurpose:"replacement"`. The canonical one-step Addendum model has
// no pre-cutover phantom state to unwind. A clean "discard prepared Room
// Transfer Addendum" workflow (transition the generated Addendum Draft ->
// cancelled, nothing else) is introduced in R4.

/**
 * SCENARIO 1 - Case 2: Post-Approval Move-Out Cancellation with Re-booking Conflict Check
 */
export async function cancelMoveOutStayWorkflow(reservationId, actorId = null) {
  const reservation = await Reservation.findById(reservationId).populate("roomId");
  if (!reservation) {
    throw new Error("Reservation not found");
  }

  // Check if room/bed was already pre-booked by an incoming applicant
  const conflictQuery = {
    roomId: reservation.roomId._id || reservation.roomId,
    status: { $in: ["reserved", "pending", "approved_for_payment"] },
    isArchived: { $ne: true },
    _id: { $ne: reservation._id }
  };

  const incomingConflict = await Reservation.findOne(conflictQuery).populate("userId", "firstName lastName email");
  if (incomingConflict) {
    return {
      success: false,
      conflict: true,
      code: "REBOOKING_CONFLICT",
      message: `Cannot cancel move-out: Room ${reservation.roomId.roomNumber || reservation.roomId.name} is pre-booked by incoming applicant ${incomingConflict.userId?.firstName} ${incomingConflict.userId?.lastName}. Administrative resolution required.`,
      conflictingApplicant: incomingConflict
    };
  }

  reservation.moveOutRequested = false;
  reservation.moveOutDate = null;
  reservation.moveOutReason = null;
  reservation.status = "moveIn";
  reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Move-out request cancelled at ${new Date().toISOString()}`;
  await reservation.save();

  return {
    success: true,
    message: "Move-out request cancelled successfully. Active stay restored.",
    reservation
  };
}

/**
 * SCENARIO 1 - Case 3: Early Contract Termination
 *
 * Delegates to moveOutStayWorkflow (the canonical, transactional, billing-
 * aware move-out path) with reason:"terminated" rather than maintaining a
 * second, thinner move-out implementation. Previously this function never
 * touched Stay or Contract at all and skipped the outstanding-balance check
 * entirely — a divergence that made "early termination" and "move-out with
 * reason=terminated" produce two different, inconsistent end-states for what
 * is conceptually the same real-world event. Callers must now supply the
 * same required fields moveOutStayWorkflow needs (moveOutDate,
 * finalUtilityReading, confirm is implied) in addition to the
 * penalty/forfeiture fields specific to early termination.
 */
export async function executeEarlyTerminationWorkflow(reservationId, payload = {}, actorId = null) {
  // depositForfeitureReason enum is ['early_vacancy','admin_decision',null].
  // Early termination = actualMoveOutDate < leaseEndDate, which IS the schema's
  // definition of "early_vacancy" (see models/Reservation.js). moveOutStayWorkflow
  // already sets this for an early vacancy; we keep the value schema-valid so the
  // "terminated"-reason override at line ~2331 does not write an invalid enum.
  const { penaltyFee = 0, forfeitureReason = "early_vacancy", ...rest } = payload;
  const result = await moveOutStayWorkflow({
    reservationId,
    payload: {
      ...rest,
      reason: "terminated",
      confirm: true,
      earlyTerminationPenalty: Number(penaltyFee),
      forfeitureReason,
    },
    actorId,
  });

  return {
    success: true,
    message: "Early termination executed successfully.",
    reservation: result.reservation,
    stay: result.stay,
    billingSummary: result.billingSummary,
    depositSettlement: result.depositSettlement,
  };
}

/**
 * SCENARIO 1 - Case 4: Direct Tenant Room Swap
 */
export async function executeDirectRoomSwapWorkflow(
  reservationAId,
  reservationBId,
  actorId = null,
  branchFilter = null,
) {
  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      const resA = await Reservation.findById(reservationAId).populate("roomId").session(session);
      const resB = await Reservation.findById(reservationBId).populate("roomId").session(session);

      if (!resA || !resB) {
        throw Object.assign(new Error("One or both reservations not found for room swap"), {
          statusCode: 404,
          code: "RESERVATION_NOT_FOUND",
        });
      }

      const branchA = resA.roomId?.branch || resA.branch;
      const branchB = resB.roomId?.branch || resB.branch;

      if (branchFilter) {
        if (branchA !== branchFilter || branchB !== branchFilter) {
          throw Object.assign(
            new Error(`Access denied. You can only execute room swaps within ${branchFilter} branch.`),
            {
              statusCode: 403,
              code: "BRANCH_ACCESS_DENIED",
            },
          );
        }
      }

      if (branchA && branchB && branchA !== branchB) {
        throw Object.assign(
          new Error("Direct room swap cannot be executed across different branches. Use standard tenant transfer."),
          {
            statusCode: 400,
            code: "CROSS_BRANCH_SWAP_PROHIBITED",
          },
        );
      }

      // Swap room and bed assignments
      const roomATemp = resA.roomId?._id || resA.roomId;
      const bedATemp = resA.selectedBed;

      resA.roomId = resB.roomId?._id || resB.roomId;
      resA.selectedBed = resB.selectedBed;
      resA.notes = `${resA.notes ? resA.notes + " | " : ""}Swapped room with tenant ${resB.userId} at ${new Date().toISOString()}`;

      resB.roomId = roomATemp;
      resB.selectedBed = bedATemp;
      resB.notes = `${resB.notes ? resB.notes + " | " : ""}Swapped room with tenant ${resA.userId} at ${new Date().toISOString()}`;

      await resA.save({ session });
      await resB.save({ session });

      result = {
        success: true,
        message: "Direct room swap executed successfully between tenants.",
        tenantA: resA,
        tenantB: resB,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * SCENARIO 1 - Case 5: Unannounced Abandonment ("Ghost Tenant") Protocol
 */
export async function executeAbandonmentProtocolWorkflow(reservationId, payload = {}, actorId = null) {
  const reservation = await Reservation.findById(reservationId).populate("roomId");
  if (!reservation) {
    throw new Error("Reservation not found");
  }

  // Abandonment is a permanent departure. The canonical Reservation status set
  // (CANONICAL_RESERVATION_STATUSES in utils/lifecycleNaming.js — the enum the
  // `status` field actually validates against) has NO "abandoned" value; the
  // terminal "tenant has left" state is "moveOut", same as a normal move-out.
  // The abandonment-specific meaning is carried by the deposit-forfeiture
  // fields + the human-readable note below, exactly as before.
  reservation.status = "moveOut";
  reservation.depositForfeited = true;
  // depositForfeitureReason enum is ['early_vacancy','admin_decision',null].
  // An admin-triggered ghost-tenant forfeiture is an "admin_decision"; the
  // specific "unannounced abandonment" wording is preserved in notes.
  reservation.depositForfeitureReason = "admin_decision";
  reservation.depositForfeitedAt = new Date();
  reservation.depositRefundStatus = "forfeited";
  reservation.depositRefundAmount = 0;
  reservation.moveOutDate = reservation.moveOutDate || new Date();
  reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Unannounced abandonment protocol triggered by admin ${actorId || ""}`;
  await reservation.save();

  // Free bed inventory immediately
  const room = await Room.findById(reservation.roomId._id || reservation.roomId);
  if (room && reservation.selectedBed?.id) {
    const bed = room.beds.find(b => String(b.id) === String(reservation.selectedBed.id));
    if (bed) {
      bed.status = "available";
      await room.save();
    }
  }

  // Update user status
  const user = await User.findById(reservation.userId);
  if (user) {
    // User.tenantStatus enum: ['applicant','active','inactive','moved_out',
    // 'evicted','blacklisted']. "moved_out" is the canonical departed-tenant
    // value the rest of the codebase recognises (inactivity guards check
    // ['inactive','moved_out']); the punitive/forfeiture context lives on the
    // Reservation, not here.
    user.tenantStatus = "moved_out";
    await user.save();
  }

  // Resolve any OPEN scheduled room transfer — same rule as move-out: no
  // payment -> safe auto-cancel; payment exists -> hold released, financial
  // history preserved, action_required. Never executes the transfer.
  try {
    const { resolveScheduledTransferBeforeTenantDeparture } = await import(
      "../services/scheduledRoomTransferExecutor.js"
    );
    await resolveScheduledTransferBeforeTenantDeparture(reservationId, { actorId });
  } catch (e) {
    logger.warn({ err: e, reservationId }, "executeAbandonmentProtocolWorkflow: scheduled-transfer resolution failed (non-fatal)");
  }

  return {
    success: true,
    message: "Abandonment protocol completed. Bed inventory released and deposit forfeited.",
    reservation
  };
}

/**
 * SCENARIO 1 - Case 6: Contract Extension vs Pre-Booking Lock Check
 */
export async function validateContractExtensionWorkflow(reservationId, requestedNewEndDate) {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) {
    throw new Error("Reservation not found");
  }

  const room = await Room.findById(reservation.roomId);
  if (!room) {
    throw new Error("Room not found");
  }

  // Check for pre-bookings starting before requested new end date
  const conflict = await Reservation.findOne({
    roomId: reservation.roomId,
    _id: { $ne: reservation._id },
    status: { $in: ["reserved", "pending", "approved_for_payment"] },
    isArchived: { $ne: true },
    moveInDate: { $lte: new Date(requestedNewEndDate) }
  }).populate("userId", "firstName lastName email");

  if (conflict) {
    return {
      canExtend: false,
      reason: `Cannot extend contract: Room ${room.roomNumber || room.name} is pre-booked starting ${dayjs(conflict.moveInDate).format("YYYY-MM-DD")} by ${conflict.userId?.firstName} ${conflict.userId?.lastName}.`
    };
  }

  return {
    canExtend: true,
    message: "No pre-booking conflict found. Lease extension can proceed."
  };
}

/**
 * Utility helper to copy declared appliance add-ons and recalculate fees
 * from a source reservation to a successor reservation within Guadalupe.
 *
 * @param {Object} sourceReservation
 * @param {Object} targetReservation
 */
export function copyApplianceAddOns(sourceReservation, targetReservation) {
  if (!sourceReservation || !targetReservation) return;
  const branch = String(
    targetReservation.roomId?.branch ||
      targetReservation.branch ||
      sourceReservation.roomId?.branch ||
      sourceReservation.branch ||
      "",
  ).toLowerCase();

  if (branch === "guadalupe") {
    targetReservation.selectedAppliances = Array.isArray(
      sourceReservation.selectedAppliances,
    )
      ? JSON.parse(JSON.stringify(sourceReservation.selectedAppliances))
      : [];
    targetReservation.applianceFees = Number(
      sourceReservation.applianceFees || 0,
    );
    if (targetReservation.monthlyRent != null) {
      targetReservation.totalPrice =
        Number(targetReservation.monthlyRent) +
        Number(targetReservation.applianceFees);
    }
  }
}



