import mongoose from "mongoose";
import dayjs from "dayjs";
import { Contract, ContractCounter, Reservation, Room, Stay, User } from "../models/index.js";
import {
  normalizeContractRoomType,
  resolveContractBranch,
  validateBranchRoomType,
} from "../config/contractConfig.js";
import {
  resolveTenantFinancialSummary,
} from "./tenantProfileService.js";
import {
  buildContractGenerationData,
  resolveApplicantIdentity,
} from "./contractGenerationDataService.js";
import { resolveContractTemplate } from "./contractTemplateService.js";
import { roomRequiresIndividualBed } from "./reservationContractEligibilityService.js";
import {
  resolveTenantCanonicalContract,
  resolveCurrentStayForReservation,
} from "./tenantContractSelectionService.js";
import {
  resolveContractLeasePricing,
  resolveAuthoritativeLeasePricing,
} from "./contractPricingResolver.js";
import { getBusinessSettings } from "../utils/businessSettings.js";
import { resolveSecurityDeposit } from "../utils/depositUtils.js";
import { readMoveInDate } from "../utils/lifecycleNaming.js";
import {
  deriveAdvanceCoverageDates,
  deriveContractLeaseDates,
} from "./contractLeaseDateService.js";
import { roundMoney } from "./billing/billingPolicy.js";

export const CONTRACT_TRANSITIONS = Object.freeze({
  draft: ["incomplete", "ready_for_generation", "awaiting_signatures", "partially_signed", "signed", "cancelled"],
  incomplete: ["draft", "ready_for_generation", "awaiting_signatures", "partially_signed", "signed", "cancelled"],
  ready_for_generation: ["draft", "incomplete", "generated", "awaiting_signatures", "partially_signed", "signed", "cancelled"],
  // Terminal edges from "generated": Phase 8 — a Room Transfer Addendum
  // becomes the tenant's CURRENT Contract while still "generated"
  // (wet-signing pending). So a generated addendum must be closable the same
  // ways a published/active lease is:
  //   - "replaced"   : a subsequent room transfer supersedes it (Phase 8).
  //   - "expired"    : the tenant reaches full-term move-out (Phase 10 —
  //                    moveOutStayWorkflow closes the current Contract).
  //   - "terminated" : early / administrative move-out (Phase 10).
  // A fresh move-in Draft never reaches these edges — it is only ever
  // superseded/closed once it has progressed past "generated" (which the
  // published/active rows already allow).
  generated: ["awaiting_signatures", "partially_signed", "signed", "notarized", "cancelled", "replaced", "expired", "terminated"],
  awaiting_signatures: ["partially_signed", "signed", "notarized", "cancelled"],
  partially_signed: ["awaiting_signatures", "signed", "notarized", "cancelled"],
  signed: ["awaiting_notarization", "notarized", "cancelled"],
  awaiting_notarization: ["notarized", "cancelled"],
  notarized: ["ready_for_publication", "cancelled"],
  ready_for_publication: ["published", "cancelled"],
  published: ["active", "rolling", "expired", "replaced", "transfer_review_required", "terminated", "cancelled"],
  active: ["rolling", "expiring_soon", "expired", "renewal_pending", "transfer_review_required", "terminated", "replaced"],
  expiring_soon: ["rolling", "expired", "renewal_pending", "transfer_review_required", "terminated", "replaced"],
  rolling: ["expiring_soon", "expired", "renewal_pending", "transfer_review_required", "terminated", "replaced", "active"],
  expired: ["renewal_pending", "archived"],
  renewal_pending: ["renewed", "cancelled"],
  renewed: ["archived"],
  transfer_review_required: ["replaced", "terminated", "active"],
  terminated: ["archived"],
  cancelled: ["archived"],
  replaced: ["archived"],
  archived: [],
});

// A Contract at any of these statuses is done: transitionContract forces
// isCurrent:false on arrival, so no terminal Contract is ever the tenant's
// "current" lease. "expired" is here because a completed (full-term)
// move-out drives the Contract to "expired" via moveOutStayWorkflow — the
// same way an early exit drives it to "terminated".
const terminalStatuses = new Set(["expired", "renewed", "terminated", "cancelled", "replaced", "archived"]);

const serviceError = (message, code, statusCode = 400, details = undefined) =>
  Object.assign(new Error(message), { code, statusCode, details });

const duplicateContractError = (existingContract) => serviceError(
  "A contract already exists for this approved reservation or stay.",
  "DUPLICATE_CONTRACT",
  409,
  {
    existingContract: {
      id: String(existingContract._id),
      contractNumber: existingContract.contractNumber,
      status: existingContract.status,
      tenantName: existingContract.tenantLegalName,
      branch: existingContract.branch,
      roomNumber: existingContract.roomNumber,
      bedLabel: existingContract.bedLabel || existingContract.bedId || "",
      updatedAt: existingContract.updatedAt,
    },
  },
);

export const assertValidContractTransition = (from, to) => {
  if (from === to) return true;
  if (!CONTRACT_TRANSITIONS[from]?.includes(to)) {
    throw serviceError(
      `Contract status cannot change from ${from} to ${to}.`,
      "INVALID_CONTRACT_STATUS_TRANSITION",
      409,
      { from, to, allowed: CONTRACT_TRANSITIONS[from] || [] },
    );
  }
  return true;
};

export const formatContractNumber = (branch, year, sequence) => {
  const { code } = resolveContractBranch(branch);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw serviceError("Contract sequence must be a positive integer.", "INVALID_CONTRACT_SEQUENCE");
  }
  return `LIL-${code}-${year}-${String(sequence).padStart(5, "0")}`;
};

export const generateContractNumber = async (branch, date = new Date(), session = null) => {
  resolveContractBranch(branch);
  const year = date.getUTCFullYear();
  const counter = await ContractCounter.findOneAndUpdate(
    { _id: `${branch}:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { branch, year } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session },
  );
  return {
    contractNumber: formatContractNumber(branch, year, counter.sequence),
    contractYear: year,
    contractSequence: counter.sequence,
  };
};

const getBedLabel = (bed = {}) => bed.code || [bed.bunkBlock, bed.position].filter(Boolean).join("-");

export const createDraftContract = async ({
  reservationId,
  stayId = null,
  actorId,
  allowedBranch = null,
  session = null,
}) => {
  if (!mongoose.isValidObjectId(reservationId)) {
    throw serviceError("A valid reservationId is required.", "INVALID_RESERVATION_ID");
  }

  const reservation = await Reservation.findById(reservationId).session(session).lean();
  if (!reservation) throw serviceError("Reservation not found.", "RESERVATION_NOT_FOUND", 404);

  const [tenant, room, stay] = await Promise.all([
    User.findById(reservation.userId).session(session).lean(),
    Room.findById(reservation.roomId).session(session).lean(),
    stayId ? Stay.findById(stayId).session(session).lean() : reservation.currentStayId
      ? Stay.findById(reservation.currentStayId).session(session).lean()
      : resolveCurrentStayForReservation(reservation._id).session(session).lean(),
  ]);
  if (!tenant) throw serviceError("Reservation tenant not found.", "TENANT_NOT_FOUND", 404);
  if (!room) throw serviceError("Reservation room not found.", "ROOM_NOT_FOUND", 404);
  if (stay && String(stay.reservationId) !== String(reservation._id)) {
    throw serviceError("Stay does not belong to the reservation.", "STAY_RESERVATION_MISMATCH", 409);
  }

  const branch = stay?.branch || room.branch;
  if (stay?.branch && stay.branch !== room.branch) {
    throw serviceError("Stay and room branch assignments conflict.", "CONTRACT_BRANCH_CONFLICT", 409);
  }
  if (allowedBranch && allowedBranch !== branch) {
    throw serviceError(
      "You cannot create a Contract for another branch.",
      "CONTRACT_BRANCH_ACCESS_DENIED",
      403,
    );
  }
  const canonicalRoomType = validateBranchRoomType(branch, room.type);
  const property = resolveContractBranch(branch);
  const effectiveStayId = stay?._id || null;
  const duplicateConditions = [
    { reservationId: reservation._id },
    { applicationId: reservation._id },
    { initialContractKey: `reservation:${reservation._id}` },
  ];
  if (effectiveStayId) {
    duplicateConditions.push(
      { stayId: effectiveStayId },
      { initialStayKey: `stay:${effectiveStayId}` },
    );
  }
  // Only a still-current contract (isCurrent: true) counts as a real
  // duplicate-in-progress. A cancelled/superseded contract for this
  // reservation must not permanently block regeneration — see the matching
  // isCurrent-scoped unique indexes on initialContractKey/initialStayKey.
  const existingContract = await Contract.findOne({
    contractPurpose: { $in: ["initial", null] },
    isCurrent: true,
    $or: duplicateConditions,
  }).select(
    "_id contractNumber status tenantLegalName branch roomNumber bedLabel bedId updatedAt",
  ).session(session).lean();
  if (existingContract) {
    throw duplicateContractError(existingContract);
  }

  // A cancelled predecessor (isCurrent: false) is allowed to be superseded by
  // a new draft. Track lineage and bump the version instead of silently
  // starting back at v1, so this reads as a controlled regeneration rather
  // than an unrelated duplicate.
  const previousContract = await Contract.findOne({
    contractPurpose: { $in: ["initial", null] },
    isCurrent: false,
    $or: duplicateConditions,
  }).sort({ version: -1, createdAt: -1 }).select("_id version").session(session).lean();

  const leaseStartDate = stay?.leaseStartDate || readMoveInDate(reservation) || null;
  const leaseDurationMonths = Number(reservation.leaseDuration) || null;
  const derivedLeaseDates = leaseStartDate && leaseDurationMonths
    ? deriveContractLeaseDates({ leaseStartDate, leaseDurationMonths })
    : null;
  const leaseEndDate = stay?.leaseEndDate || derivedLeaseDates?.leaseEndDate || null;
  const derivedAdvanceCoverage = leaseStartDate
    ? deriveAdvanceCoverageDates(leaseStartDate)
    : null;
  const structuredSnapshot =
    reservation.financialWorkflowVersion === "structured-initial-payment-v1"
      ? reservation.pricingSnapshot
      : null;
  const approvedRate = Number.isFinite(
    Number(structuredSnapshot?.finalMonthlyRate ?? reservation.monthlyRent),
  )
    ? Number(structuredSnapshot?.finalMonthlyRate ?? reservation.monthlyRent)
    : null;
  const financial = resolveTenantFinancialSummary({ reservation });
  const settings = await getBusinessSettings();
  const pricing = structuredSnapshot
    ? {
        isLongTerm: structuredSnapshot.leaseType === "long",
        leaseType:
          structuredSnapshot.leaseType === "long" ? "long_term" : "short_term",
        regularMonthlyRate: structuredSnapshot.regularMonthlyRate,
        discountPercentage: structuredSnapshot.discountPercentage,
        discountAmount: structuredSnapshot.discountAmount,
        approvedMonthlyRate: structuredSnapshot.finalMonthlyRate,
      }
    : resolveContractLeasePricing({
        room,
        roomType: canonicalRoomType,
        leaseDurationMonths,
        approvedMonthlyRate: approvedRate,
        longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
      });
  let resolvedTemplate = null;
  try {
    resolvedTemplate = resolveContractTemplate({
      branch,
      roomType: canonicalRoomType,
      leaseType: pricing.isLongTerm ? "long-term" : "short-term",
      leaseStartDate,
      leaseEndDate,
      leaseDurationMonths,
      longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
    });
  } catch {
    // A draft may preserve incomplete lease data. Full validation reports the
    // exact template/date issue before generation.
  }
  const selectedBed = reservation.selectedBed || {};
  const person = resolveApplicantIdentity({ reservation });
  const number = await generateContractNumber(branch, new Date(), session);

  try {
    const [created] = await Contract.create([{
      ...number,
      contractPurpose: "initial",
      initialContractKey: `reservation:${reservation._id}`,
      initialStayKey: effectiveStayId ? `stay:${effectiveStayId}` : null,
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      stayId: effectiveStayId,
      roomId: room._id,
      branch,
      version: previousContract ? previousContract.version + 1 : 1,
      previousContractId: previousContract?._id || null,
      templateType: resolvedTemplate?.templateId ||
        `${canonicalRoomType.replaceAll("-", "_")}_${pricing.leaseType}`,
      roomType: canonicalRoomType,
      leaseType: pricing.leaseType,
      propertyName: property.propertyName,
      propertyAddress: property.propertyAddress,
      roomNumber: room.roomNumber,
      bedId: canonicalRoomType === "private" ? "" : (stay?.bedId || selectedBed.id || ""),
      bedLabel: canonicalRoomType === "private" ? "" : (stay?.bedCode || getBedLabel(selectedBed)),
      tenantLegalName: person.fullName || "",
      tenantAddress: person.currentAddress || "",
      tenantEmail: person.email || "",
      tenantPhone: person.phone || "",
      tenantNationality: person.nationality || "",
      tenantBirthDate: person.birthDate || null,
      leaseStartDate,
      leaseEndDate,
      leaseDurationMonths,
      regularMonthlyRate: pricing.regularMonthlyRate,
      discountPercentage: pricing.discountPercentage,
      discountType: pricing.discountPercentage === 0 ? "none" : "percentage",
      discountAmount: pricing.discountAmount,
      approvedMonthlyRate: pricing.approvedMonthlyRate,
      advanceRentAmount:
        structuredSnapshot?.advanceRentAmount ?? financial.advanceRent,
      securityDepositAmount:
        structuredSnapshot?.securityDepositAmount ?? financial.securityDeposit,
      reservationFeeAmount:
        structuredSnapshot?.reservationFeeAmount ?? reservation.reservationFeeAmount ?? null,
      reservationFeeCreditAmount:
        structuredSnapshot && reservation.reservationFeePaymentStatus === "verified"
          ? structuredSnapshot.reservationFeeAmount
          : reservation.reservationFeeAmount ?? null,
      pricingApprovalId: reservation._id,
      pricingApprovedBy:
        structuredSnapshot?.approvedBy || reservation.applicationReviewedBy || null,
      pricingApprovedAt:
        structuredSnapshot?.approvedAt || reservation.approvedForPaymentAt || reservation.approvedDate || null,
      advanceCoverageStart:
        reservation.advanceCoverageStart || derivedAdvanceCoverage?.advanceCoverageStart || null,
      advanceCoverageEnd:
        reservation.advanceCoverageEnd ||
        derivedAdvanceCoverage?.advanceCoverageEnd || null,
      status: "draft",
      statusHistory: [{ status: "draft", changedBy: actorId, reason: "Contract draft created" }],
      createdBy: actorId,
      updatedBy: actorId,
    }], session ? { session } : {});

    if (previousContract) {
      await Contract.updateOne(
        { _id: previousContract._id },
        { $set: { supersededByContractId: created._id, supersededBy: created._id } },
        session ? { session } : {},
      );
    }

    return created;
  } catch (error) {
    if (
      error?.code === 11000 &&
      (error?.keyPattern?.initialContractKey || error?.keyPattern?.initialStayKey)
    ) {
      const winner = await Contract.findOne({
        isCurrent: true,
        $or: [
          { initialContractKey: `reservation:${reservation._id}` },
          ...(effectiveStayId ? [{ initialStayKey: `stay:${effectiveStayId}` }] : []),
        ],
      }).select(
        "_id contractNumber status tenantLegalName branch roomNumber bedLabel bedId updatedAt",
      ).session(session).lean();
      if (winner) throw duplicateContractError(winner);
      throw serviceError(
        "A contract already exists for this approved reservation or stay.",
        "DUPLICATE_CONTRACT",
        409,
      );
    }
    throw error;
  }
};

export const getContractValidation = (contract) => {
  const required = [
    ["tenantLegalName", "Tenant legal name"],
    ["tenantAddress", "Tenant address"],
    ["branch", "Branch"],
    ["roomId", "Room"],
    ["roomNumber", "Room number"],
    ["leaseStartDate", "Lease start date"],
    ["leaseEndDate", "Lease end date"],
    ["leaseDurationMonths", "Lease duration"],
    ["regularMonthlyRate", "Approved regular monthly rate"],
    ["discountPercentage", "Approved discount percentage"],
    ["discountAmount", "Approved discount amount"],
    ["approvedMonthlyRate", "Approved monthly rate"],
    ["advanceRentAmount", "Advance rent"],
    ["securityDepositAmount", "Security deposit"],
    ["reservationFeeAmount", "Reservation fee"],
    ["reservationFeeCreditAmount", "Reservation-fee credit"],
    ["advanceCoverageStart", "Advance-rent coverage start"],
    ["advanceCoverageEnd", "Advance-rent coverage end"],
    ["pricingApprovalId", "Pricing approval record"],
    ["pricingApprovedAt", "Pricing approval date"],
  ];
  if (roomRequiresIndividualBed(contract.roomType)) {
    required.push(["bedId", "Bed or slot"]);
  }
  const missingFields = required
    .filter(([field]) => contract[field] === null || contract[field] === undefined || contract[field] === "")
    .map(([field, label]) => ({ field, label }));
  return { valid: missingFields.length === 0, missingFields, conflicts: [], warnings: [] };
};

export const validateContractForGeneration = async (
  contract,
  { requestedTemplateId = null } = {},
) => {
  const base = getContractValidation(contract);
  const result = {
    valid: false,
    status: "incomplete",
    template: null,
    generationData: null,
    missingFields: [...base.missingFields],
    conflicts: [...base.conflicts],
    warnings: [...base.warnings],
    errors: [],
    pricingValidation: null,
  };

  if (!contract.tenantNationality) {
    result.missingFields.push({ field: "tenantNationality", label: "Tenant nationality" });
  }
  if (!contract.tenantBirthDate) {
    result.missingFields.push({ field: "tenantBirthDate", label: "Tenant birth date" });
  }

  if (contract.stayId && contract.isCurrent === true) {
    const duplicate = await Contract.exists({
      stayId: contract.stayId,
      isCurrent: true,
      _id: { $ne: contract._id },
    });
    if (duplicate) {
      result.conflicts.push({
        code: "DUPLICATE_CURRENT_CONTRACT",
        message: "Another current Contract exists for this Stay.",
      });
    }
  }

  try {
    const generationData = await buildContractGenerationData(contract, {
      requestedTemplateId,
    });
    result.generationData = generationData;
    result.template = generationData.template;
    result.pricingValidation = generationData.pricingValidation;
    if ((generationData.tenant.tenantAgeAtGeneration ?? 0) < 18) {
      result.conflicts.push({
        code: "TENANT_LEGAL_AGE_REQUIRED",
        message: "Tenant must be of legal age at Contract generation.",
      });
    }
    result.errors.push(...generationData.pricingValidation.errors);
    result.warnings.push(...generationData.pricingValidation.warnings);
  } catch (error) {
    result.errors.push({
      code: error.code || "CONTRACT_GENERATION_DATA_INVALID",
      message: error.message,
      details: error.details,
    });
  }

  result.valid =
    result.missingFields.length === 0 &&
    result.conflicts.length === 0 &&
    result.errors.length === 0 &&
    result.warnings.length === 0;
  result.status = result.valid ? "ready_for_generation" : "incomplete";
  return result;
};

export const validateContractRoomAssignment = async (contract) => {
  const room = await Room.findById(contract.roomId).lean();
  if (!room) {
    throw serviceError("Contract room not found.", "ROOM_NOT_FOUND", 404);
  }
  if (room.branch !== contract.branch) {
    throw serviceError(
      "The assigned Room belongs to a different Contract branch.",
      "CONTRACT_BRANCH_CONFLICT",
      409,
      {
        contractBranch: contract.branch,
        roomBranch: room.branch,
        roomId: String(room._id),
      },
    );
  }

  const actualRoomType = validateBranchRoomType(room.branch, room.type);
  const snapshotRoomType = normalizeContractRoomType(contract.roomType);
  if (snapshotRoomType !== actualRoomType) {
    throw serviceError(
      "The Contract room type does not match the actual assigned Room.",
      "CONTRACT_ROOM_TYPE_CONFLICT",
      409,
      {
        contractRoomType: snapshotRoomType || contract.roomType,
        actualRoomType,
        roomId: String(room._id),
      },
    );
  }
  return { room, roomType: actualRoomType };
};

export const approveContractPricing = async ({ contract, actorId, pricing, notes = "" }) => {
  if (!["draft", "incomplete", "ready_for_generation"].includes(contract.status)) {
    throw serviceError(
      "Approved legal pricing cannot be changed after Contract generation.",
      "CONTRACT_PRICING_APPROVAL_NOT_ALLOWED",
      409,
    );
  }
  const values = Object.fromEntries([
    "regularMonthlyRate", "discountPercentage", "discountAmount",
    "approvedMonthlyRate", "advanceRentAmount", "securityDepositAmount",
    "reservationFeeAmount",
  ].map((field) => [field, Number(pricing?.[field])]));
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
    throw serviceError("Every approved pricing value is required.", "APPROVED_PRICING_MISSING", 422);
  }
  const expectedDiscount = Math.round(values.regularMonthlyRate * values.discountPercentage) / 100;
  if (
    Math.abs(expectedDiscount - values.discountAmount) > 0.01 ||
    Math.abs(values.regularMonthlyRate - values.discountAmount - values.approvedMonthlyRate) > 0.01
  ) {
    throw serviceError("Approved pricing values are inconsistent.", "APPROVED_PRICING_CONFLICT", 422);
  }
  Object.assign(contract, values, {
    discountType: values.discountPercentage === 0 ? "none" : "percentage",
    reservationFeeCreditAmount: values.reservationFeeAmount,
    pricingApprovalId: contract.reservationId,
    pricingApprovedBy: actorId,
    pricingApprovedAt: new Date(),
    pricingApprovalNotes: String(notes || "").trim(),
    updatedBy: actorId,
  });
  await contract.save();
  return contract;
};

export const transitionContract = async (contract, nextStatus, actorId, reason = "", session = null) => {
  assertValidContractTransition(contract.status, nextStatus);
  contract.status = nextStatus;
  contract.updatedBy = actorId;
  contract.statusHistory.push({ status: nextStatus, changedBy: actorId, reason });
  if (terminalStatuses.has(nextStatus)) contract.isCurrent = false;
  await contract.save(session ? { session } : undefined);
  return contract;
};

// Delegates to the canonical resident-contract selector (tenantContractSelectionService.js)
// instead of the naive `isCurrent: true` query this used to run — that query had no
// eligibility/ambiguity handling and could return an archived, superseded, or orphaned
// Contract. includeEarlyStages defaults true here (unlike the tenant-facing resolver)
// because admin must be able to manage a Contract while it's still draft/incomplete.
export const findCurrentContract = ({ tenantId, includeEarlyStages = true }) =>
  resolveTenantCanonicalContract(tenantId, { includeEarlyStages });

// Statuses on a room-transfer successor Contract that represent a legitimately
// abandoned attempt — a fresh replacement is allowed after any of these.
// Deliberately excludes every other status (including "active") so a retry
// after the successor has already been activated still returns the existing
// Contract instead of creating a duplicate (see the idempotency guard in
// createReplacementContractForTransfer below).
export const ABANDONED_TRANSFER_SUCCESSOR_STATUSES = new Set(["cancelled", "voided", "rejected", "archived"]);

// A room-transfer successor Contract is a Room Transfer Addendum
// (contractPurpose: "amendment") for transfers created from Phase 8 onward,
// and a full replacement Contract (contractPurpose: "replacement") for
// legacy transfers. Both are resolved/idempotency-checked the same way
// (replacesContractId + one of these purposes).
export const ROOM_TRANSFER_SUCCESSOR_PURPOSES = Object.freeze(["amendment", "replacement"]);

export const createReplacementContractForTransfer = async ({
  reservationId,
  stayId = null,
  oldContract,
  targetRoom,
  targetBed = {},
  effectiveTransferDate = new Date(),
  sourceApprovedMonthlyRate = null,
  actorId,
  session = null,
}) => {
  if (!oldContract) {
    throw serviceError("Previous active contract is required for replacement.", "PREVIOUS_CONTRACT_REQUIRED", 400);
  }

  // Idempotency guard — no stable transfer/event identifier exists anywhere
  // in the current architecture (transferStayWorkflow/autoGenerateTransferContract
  // never generate or thread one through to the Contract layer), so
  // replacesContractId + contractPurpose is the identifier basis for this
  // phase. Reusing an existing, non-abandoned successor here (rather than
  // creating a new one) is what makes a retried/duplicate call safe now that
  // the predecessor is no longer immediately flipped to isCurrent: false —
  // see the module-level comment below.
  const existingSuccessors = await Contract.find({
    replacesContractId: oldContract._id,
    contractPurpose: { $in: [...ROOM_TRANSFER_SUCCESSOR_PURPOSES] },
    status: { $nin: [...ABANDONED_TRANSFER_SUCCESSOR_STATUSES] },
  }).session(session);
  if (existingSuccessors.length > 1) {
    throw serviceError(
      "Multiple room-transfer successor Contracts already reference this Contract — admin repair required.",
      "MULTIPLE_TRANSFER_SUCCESSORS",
      409,
      { predecessorId: String(oldContract._id), successorIds: existingSuccessors.map((c) => String(c._id)) },
    );
  }
  if (existingSuccessors.length === 1) {
    return existingSuccessors[0];
  }

  const reservation = await Reservation.findById(reservationId).session(session).lean();
  if (!reservation) throw serviceError("Reservation not found.", "RESERVATION_NOT_FOUND", 404);

  const [tenant, stay] = await Promise.all([
    User.findById(reservation.userId).session(session).lean(),
    stayId ? Stay.findById(stayId).session(session).lean() : Stay.findById(oldContract.stayId).session(session).lean(),
  ]);

  if (!tenant) throw serviceError("Tenant not found.", "TENANT_NOT_FOUND", 404);
  const branch = targetRoom.branch || oldContract.branch;
  const canonicalRoomType = validateBranchRoomType(branch, targetRoom.type);
  const property = resolveContractBranch(branch);

  // The predecessor is a historical legal record and must NOT be mutated
  // here — it stays ACTIVE/current until the real room transfer executes
  // and explicitly calls contractRoomTransferActivationService. Its room,
  // rate, and lease dates are untouched; status/isCurrent/
  // supersededByContractId are set only by that cutover.
  //
  // PHASE 8 — a Room Transfer is an AMENDMENT to the continuing lease, not a
  // new lease. The lease term is CARRIED OVER VERBATIM from the tenant's
  // current Contract (which itself carried it from the original). The
  // transfer date is recorded separately as amendmentEffectiveDate. It must
  // NEVER become leaseStartDate.
  const leaseStartDate =
    oldContract.leaseStartDate ||
    stay?.leaseStartDate ||
    reservation?.moveInDate ||
    reservation?.actualMoveInDate ||
    reservation?.checkInDate ||
    reservation?.targetMoveInDate ||
    oldContract.createdAt ||
    null;
  const leaseEndDate = oldContract.leaseEndDate || stay?.leaseEndDate || null;
  const leaseDurationMonths = oldContract.leaseDurationMonths || (
    leaseStartDate && leaseEndDate ? Math.max(1, dayjs(leaseEndDate).diff(dayjs(leaseStartDate), "month")) : 1
  );
  const amendmentEffectiveDate = effectiveTransferDate;
  // The root lease Contract — the original signed/notarized lease that every
  // addendum in the chain amends. oldContract.parentContractId already points
  // there (set on the previous addendum, if any); else oldContract IS the
  // root (or its own initial predecessor).
  const rootLeaseContractId = oldContract.parentContractId || oldContract._id;

  const settings = await getBusinessSettings();
  // The destination Contract must snapshot the room-type + approved-term
  // -correct rate from the same authoritative regular/discount table used
  // everywhere else (resolveAuthoritativeLeasePricing) — never the
  // destination Room's raw monthlyPrice/price master field, which is an
  // admin-set input to pricing resolution, not a pre-validated approved rate
  // (see the identical renewal-pricing fix above).
  let authoritativePricing = null;
  try {
    authoritativePricing = resolveAuthoritativeLeasePricing({
      room: targetRoom,
      roomType: canonicalRoomType,
      branch,
      leaseDurationMonths,
      settings,
    });
  } catch {
    // Unsupported/legacy room type or invalid duration — fall back below
    // rather than blocking the room-transfer replacement Contract.
  }
  const targetRate = Number(
    authoritativePricing?.finalMonthlyRate ??
      targetRoom.monthlyPrice ??
      targetRoom.price ??
      0,
  );
  const pricing = authoritativePricing
    ? {
        isLongTerm: authoritativePricing.isLongTerm,
        leaseType: authoritativePricing.leaseType,
        regularMonthlyRate: authoritativePricing.regularMonthlyRate,
        discountPercentage: authoritativePricing.discountPercentage,
        discountAmount: authoritativePricing.discountAmount,
        approvedMonthlyRate: authoritativePricing.finalMonthlyRate,
      }
    : resolveContractLeasePricing({
        room: targetRoom,
        roomType: canonicalRoomType,
        leaseDurationMonths,
        approvedMonthlyRate: targetRate,
        longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
      });

  let resolvedTemplate = null;
  try {
    resolvedTemplate = resolveContractTemplate({
      branch,
      roomType: canonicalRoomType,
      leaseType: pricing.isLongTerm ? "long-term" : "short-term",
      leaseStartDate,
      leaseEndDate,
      leaseDurationMonths,
      longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
    });
  } catch {
    // Template resolved on validation
  }

  const person = resolveApplicantIdentity({ contract: oldContract, reservation });
  const number = await generateContractNumber(branch, new Date(), session);

  const bedIdentifier = targetBed.id || String(targetBed._id || "");
  const bedName = targetBed.label || targetBed.code || [targetBed.bunkBlock, targetBed.position].filter(Boolean).join("-") || bedIdentifier || "";
  // Labeling only — both a same-room bed swap and a full room change go
  // through this same replacement-Contract mechanism; this just lets
  // Admin/Tenant UI say "Bed Reassignment" instead of "Room Transfer" when
  // the room itself didn't change.
  const transferType = String(oldContract.roomId) === String(targetRoom._id) ? "bed_only" : "room_change";

  const provenSourceRate = Number(
    sourceApprovedMonthlyRate ?? stay?.monthlyRent ?? oldContract.approvedMonthlyRate,
  );
  if (!(Number.isFinite(provenSourceRate) && provenSourceRate > 0)) {
    throw serviceError(
      "The current approved tenancy rate must be verified before preparing a Room Transfer Addendum.",
      "ROOM_TRANSFER_CURRENT_RENT_UNVERIFIED",
      409,
    );
  }

  const amendmentNarrative =
    `Room transfer: ${oldContract.roomNumber} (${oldContract.bedLabel || oldContract.bedId || "—"}) ` +
    `-> ${targetRoom.roomNumber} (${bedName || "—"}), effective ${dayjs(amendmentEffectiveDate).format("YYYY-MM-DD")}. ` +
    `The room and rental terms listed in this addendum change on the effective date; ` +
      `all other terms of the original lease (${dayjs(leaseStartDate).format("YYYY-MM-DD")} - ${dayjs(leaseEndDate).format("YYYY-MM-DD")}) remain in effect.`;
  const amendmentReason =
    `${amendmentNarrative} Approved monthly rent changes from PHP ${roundMoney(provenSourceRate).toFixed(2)} ` +
    `to PHP ${roundMoney(pricing.approvedMonthlyRate).toFixed(2)}.`;
  const amendmentFields = [
    "roomId", "roomNumber", "roomType", "bedId", "bedLabel",
    "approvedMonthlyRate", "regularMonthlyRate", "securityDepositAmount",
    "previousApprovedMonthlyRate",
  ];

  const createdDocs = await Contract.create(
    [
      {
        ...number,
        // PHASE 8: a Room Transfer is an ADDENDUM to the continuing lease,
        // not a replacement lease. contractPurpose:"amendment" +
        // parentContractId -> the root lease Contract. replacesContractId
        // still points at the immediately-preceding current Contract so the
        // existing lineage / idempotency queries (replacesContractId +
        // contractPurpose) keep working, and the cutover supersedes exactly
        // that record.
        contractPurpose: "amendment",
        transferType,
        parentContractId: rootLeaseContractId,
        replacesContractId: oldContract._id,
        amendmentReason,
        amendmentFields,
        previousApprovedMonthlyRate: roundMoney(provenSourceRate),
        amendmentEffectiveDate,
        replacementReason: amendmentReason,
        initialContractKey: null,
        initialStayKey: null,
        tenantId: tenant._id,
        applicationId: reservation._id,
        reservationId: reservation._id,
        stayId: stay?._id || oldContract.stayId || null,
        roomId: targetRoom._id,
        branch,
        version: (oldContract.version || 1) + 1,
        templateType: resolvedTemplate?.templateId || `${canonicalRoomType.replaceAll("-", "_")}_${pricing.leaseType}`,
        roomType: canonicalRoomType,
        leaseType: pricing.leaseType,
        propertyName: property.propertyName,
        propertyAddress: property.propertyAddress,
        roomNumber: targetRoom.roomNumber,
        bedId: bedIdentifier,
        bedLabel: bedName,
        tenantLegalName: oldContract.tenantLegalName || person.fullName || "",
        tenantAddress: oldContract.tenantAddress || person.currentAddress || "",
        tenantEmail: oldContract.tenantEmail || person.email || "",
        tenantPhone: oldContract.tenantPhone || person.phone || "",
        tenantNationality: oldContract.tenantNationality || person.nationality || "",
        tenantBirthDate: oldContract.tenantBirthDate || person.birthDate || null,
        leaseStartDate,
        leaseEndDate,
        leaseDurationMonths,
        regularMonthlyRate: pricing.regularMonthlyRate,
        discountPercentage: pricing.discountPercentage || 0,
        discountType: pricing.discountPercentage > 0 ? "percentage" : "none",
        discountAmount: pricing.discountAmount || 0,
        approvedMonthlyRate: pricing.approvedMonthlyRate,
        advanceRentAmount: 0,
        // Successor Contract shows the DESTINATION room's REQUIRED deposit
        // (canonical 1x-approved-monthly-rate rule — same figure
        // structuredInitialPaymentPolicy / depositUtils use at move-in), NOT
        // the predecessor's deposit verbatim. How much of that is actually
        // held vs. still owed is tracked on reservation.securityDepositHeld
        // and the transfer_settlement Bill's charges.securityDeposit line.
        securityDepositAmount: Number(pricing.approvedMonthlyRate) || 0,
        reservationFeeAmount: 0,
        reservationFeeCreditAmount: 0,
        pricingApprovalId: reservation._id,
        pricingApprovedBy: actorId,
        pricingApprovedAt: new Date(),
        pricingApprovalNotes: `Auto-approved standard pricing on room transfer to ${targetRoom.roomNumber}`,
        advanceCoverageStart: oldContract.advanceCoverageStart || leaseStartDate,
        advanceCoverageEnd: oldContract.advanceCoverageEnd || (leaseStartDate ? dayjs(leaseStartDate).add(1, "month").subtract(1, "day").toDate() : null),
        status: "draft",
        statusHistory: [
          { status: "draft", changedBy: actorId, reason: `Room transfer addendum draft created (${oldContract.roomNumber} -> ${targetRoom.roomNumber})` },
        ],
        createdBy: actorId,
        updatedBy: actorId,
        isCurrent: false,
      },
    ],
    { session },
  );

  return createdDocs[0];
};

// Creates a successor Contract for a lease renewal. Like
// createReplacementContractForTransfer above, this deliberately does NOT
// touch oldContract.status/isCurrent at all — the predecessor stays the
// tenant's fully active, current, legally unmutated contract until
// contractRenewalActivationService.activateDueRenewalContracts flips both
// contracts at the successor's actual leaseStartDate. The successor itself
// is created with isCurrent: false for the same reason (so isCurrent:true
// lookups elsewhere, e.g. autoGenerateTransferContract's Contract.findOne,
// never see two "current" contracts for one reservation during the
// FINAL + SCHEDULED window) and flips to true only at activation.
// Mirrors ABANDONED_TRANSFER_SUCCESSOR_STATUSES above — a renewal successor
// in one of these statuses does not count as a legitimate existing successor
// (see the idempotency guard in createSuccessorContractForRenewal below).
export const ABANDONED_RENEWAL_SUCCESSOR_STATUSES = new Set(["cancelled", "voided", "rejected", "archived"]);

export const createSuccessorContractForRenewal = async ({
  reservationId,
  oldContract,
  newStay,
  actorId,
  session = null,
}) => {
  if (!oldContract) {
    throw serviceError("Previous active contract is required for renewal.", "PREVIOUS_CONTRACT_REQUIRED", 400);
  }
  if (!newStay) {
    throw serviceError("The renewed Stay record is required for renewal.", "RENEWAL_STAY_REQUIRED", 400);
  }

  // Idempotency guard — one predecessor Contract may produce at most one
  // legitimate renewal successor. Mirrors createReplacementContractForTransfer's
  // guard exactly (replacesContractId + contractPurpose): a retried/duplicate
  // call (network retry, retried background trigger, accidental re-invocation
  // after the successor is already published/active) must reuse the existing
  // successor rather than create Contract C, D, etc.
  const existingSuccessors = await Contract.find({
    replacesContractId: oldContract._id,
    contractPurpose: "renewal",
    status: { $nin: [...ABANDONED_RENEWAL_SUCCESSOR_STATUSES] },
  }).session(session);
  if (existingSuccessors.length > 1) {
    throw serviceError(
      "Multiple renewal successor Contracts already reference this Contract — admin repair required.",
      "MULTIPLE_RENEWAL_SUCCESSORS",
      409,
      { predecessorId: String(oldContract._id), successorIds: existingSuccessors.map((c) => String(c._id)) },
    );
  }
  if (existingSuccessors.length === 1) {
    return existingSuccessors[0];
  }

  const reservation = await Reservation.findById(reservationId).session(session).lean();
  if (!reservation) throw serviceError("Reservation not found.", "RESERVATION_NOT_FOUND", 404);

  const [tenant, room] = await Promise.all([
    User.findById(reservation.userId).session(session).lean(),
    Room.findById(oldContract.roomId).session(session).lean(),
  ]);
  if (!tenant) throw serviceError("Tenant not found.", "TENANT_NOT_FOUND", 404);

  const branch = oldContract.branch;
  const canonicalRoomType = oldContract.roomType;

  const leaseStartDate = newStay.leaseStartDate;
  const leaseEndDate = newStay.leaseEndDate;
  const leaseDurationMonths = Math.max(1, dayjs(leaseEndDate).diff(dayjs(leaseStartDate), "month"));

  // The renewal successor Contract must snapshot the SAME approved pricing
  // the tenant actually accepted — never a re-resolution against whatever
  // BusinessSettings/Room pricing happen to be live at Contract-generation
  // time (which could have changed between offer acceptance and this call).
  // Prefer the exact accepted Reservation.renewalOffers[] entry (linked via
  // newStay.renewalOfferId, set at acceptance in tenantActionService.js's
  // renewStayWorkflow) when it was itself resolved canonically.
  const acceptedOffer = newStay.renewalOfferId
    ? (reservation.renewalOffers || []).find((offer) => offer.offerId === newStay.renewalOfferId)
    : null;
  const hasFrozenCanonicalOffer =
    acceptedOffer?.pricingSource === "canonical_resolver" &&
    Number.isFinite(Number(acceptedOffer.proposedRent)) &&
    Number(acceptedOffer.proposedRent) > 0;

  const settings = await getBusinessSettings();
  // Legacy/compatibility path: no linked accepted offer (renewal created
  // outside the offer flow) or an offer predating canonical-pricing support
  // — reconstruct the correct room-type + NEW-duration rate from the same
  // authoritative regular/discount table the initial approval and room
  // listings already use, rather than trusting newStay.monthlyRent (which
  // could be duration-unaware) or the old Contract's now-stale rate. This is
  // what previously let e.g. a 3-month Quadruple renewing to 6 months keep
  // the short-term ₱6,300 instead of resolving to the long-term ₱5,400.
  let authoritativePricing = null;
  if (!hasFrozenCanonicalOffer) {
    try {
      authoritativePricing = resolveAuthoritativeLeasePricing({
        room: room || { type: canonicalRoomType, branch },
        roomType: canonicalRoomType,
        branch,
        leaseDurationMonths,
        settings,
      });
    } catch {
      // Unsupported/legacy room type or invalid duration — fall back below
      // rather than blocking renewal Contract creation.
    }
  }
  const newRate = Number(
    (hasFrozenCanonicalOffer ? acceptedOffer.proposedRent : null) ??
      authoritativePricing?.finalMonthlyRate ??
      newStay.monthlyRent ??
      oldContract.approvedMonthlyRate ??
      0,
  );
  const pricing = hasFrozenCanonicalOffer
    ? {
        isLongTerm: acceptedOffer.pricingTier === "long_term",
        leaseType: acceptedOffer.pricingTier || (leaseDurationMonths >= settings.longTermLeaseMinMonths ? "long_term" : "short_term"),
        regularMonthlyRate: Number(acceptedOffer.regularMonthlyRate ?? acceptedOffer.proposedRent),
        discountPercentage: Number(acceptedOffer.discountPercentage) || 0,
        discountAmount: Math.max(0, Number(acceptedOffer.regularMonthlyRate ?? acceptedOffer.proposedRent) - Number(acceptedOffer.proposedRent)),
        approvedMonthlyRate: Number(acceptedOffer.proposedRent),
      }
    : authoritativePricing
      ? {
          isLongTerm: authoritativePricing.isLongTerm,
          leaseType: authoritativePricing.leaseType,
          regularMonthlyRate: authoritativePricing.regularMonthlyRate,
          discountPercentage: authoritativePricing.discountPercentage,
          discountAmount: authoritativePricing.discountAmount,
          approvedMonthlyRate: authoritativePricing.finalMonthlyRate,
        }
      : resolveContractLeasePricing({
          room: room || { type: canonicalRoomType, branch, monthlyPrice: newRate },
          roomType: canonicalRoomType,
          leaseDurationMonths,
          approvedMonthlyRate: newRate,
          longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
        });

  let resolvedTemplate = null;
  try {
    resolvedTemplate = resolveContractTemplate({
      branch,
      roomType: canonicalRoomType,
      leaseType: pricing.isLongTerm ? "long-term" : "short-term",
      leaseStartDate,
      leaseEndDate,
      leaseDurationMonths,
      longTermLeaseMinMonths: settings.longTermLeaseMinMonths,
    });
  } catch {
    // Template resolved on validation
  }

  const person = resolveApplicantIdentity({ contract: oldContract, reservation });
  const number = await generateContractNumber(branch, new Date(), session);

  // Deposit is carried forward, not automatically recharged (spec §R/§AC) —
  // this is an informational/audit snapshot only, no Bill/charge is created.
  // The renewal Contract's REQUIRED deposit is the predecessor's required
  // deposit carried forward unchanged (no re-charge policy).
  const carriedForwardRequiredDeposit = Number(oldContract.securityDepositAmount || 0);
  // PHASE 10 — the depositAdjustment snapshot's "held" figure must be the
  // ACTUAL cash held for the tenancy (reservation.securityDepositHeld, kept
  // authoritative by the room-transfer + payment flows), NOT a Contract
  // field — those diverge for a transferred tenant (transferred to a
  // costlier room without paying the difference, or holding an excess after
  // a cheaper-room transfer). Fall back to the carried-forward required
  // amount only for a legacy tenancy predating securityDepositHeld.
  const actualHeld = Number(reservation.securityDepositHeld);
  const heldDepositActual = Number.isFinite(actualHeld) && actualHeld >= 0
    ? actualHeld
    : carriedForwardRequiredDeposit;
  const requiredDeposit = Number(resolveSecurityDeposit({ ...reservation, monthlyRent: newRate })) || newRate;

  const createdDocs = await Contract.create(
    [
      {
        ...number,
        contractPurpose: "renewal",
        parentContractId: oldContract.parentContractId || oldContract._id,
        replacesContractId: oldContract._id,
        replacementReason: `Lease renewal: Room ${oldContract.roomNumber} continuing from ${dayjs(leaseStartDate).format("YYYY-MM-DD")}`,
        initialContractKey: null,
        initialStayKey: null,
        tenantId: tenant._id,
        applicationId: reservation._id,
        reservationId: reservation._id,
        stayId: newStay._id,
        roomId: oldContract.roomId,
        branch,
        version: (oldContract.version || 1) + 1,
        templateType: resolvedTemplate?.templateId || `${canonicalRoomType.replaceAll("-", "_")}_${pricing.leaseType}`,
        roomType: canonicalRoomType,
        leaseType: pricing.leaseType,
        propertyName: oldContract.propertyName,
        propertyAddress: oldContract.propertyAddress,
        roomNumber: oldContract.roomNumber,
        bedId: oldContract.bedId,
        bedLabel: oldContract.bedLabel,
        tenantLegalName: oldContract.tenantLegalName || person.fullName || "",
        tenantAddress: oldContract.tenantAddress || person.currentAddress || "",
        tenantEmail: oldContract.tenantEmail || person.email || "",
        tenantPhone: oldContract.tenantPhone || person.phone || "",
        tenantNationality: oldContract.tenantNationality || person.nationality || "",
        tenantBirthDate: oldContract.tenantBirthDate || person.birthDate || null,
        leaseStartDate,
        leaseEndDate,
        leaseDurationMonths,
        regularMonthlyRate: pricing.regularMonthlyRate,
        discountPercentage: pricing.discountPercentage || 0,
        discountType: pricing.discountPercentage > 0 ? "percentage" : "none",
        discountAmount: pricing.discountAmount || 0,
        approvedMonthlyRate: pricing.approvedMonthlyRate,
        advanceRentAmount: 0,
        securityDepositAmount: carriedForwardRequiredDeposit,
        reservationFeeAmount: 0,
        reservationFeeCreditAmount: 0,
        pricingApprovalId: reservation._id,
        pricingApprovedBy: actorId,
        pricingApprovedAt: new Date(),
        pricingApprovalNotes: hasFrozenCanonicalOffer
          ? `Renewal pricing from accepted offer ${acceptedOffer.offerId} (canonical, Room ${oldContract.roomNumber})`
          : `Auto-approved renewal pricing continuing Room ${oldContract.roomNumber}`,
        advanceCoverageStart: leaseStartDate,
        advanceCoverageEnd: leaseStartDate ? dayjs(leaseStartDate).add(1, "month").subtract(1, "day").toDate() : null,
        depositAdjustment: {
          heldAmount: heldDepositActual,
          requiredAmount: requiredDeposit,
          adjustmentAmount: requiredDeposit - heldDepositActual,
          computedAt: new Date(),
        },
        status: "draft",
        statusHistory: [
          { status: "draft", changedBy: actorId, reason: `Renewal successor draft created for Room ${oldContract.roomNumber}` },
        ],
        createdBy: actorId,
        updatedBy: actorId,
        isCurrent: false,
      },
    ],
    { session },
  );

  return createdDocs[0];
};

