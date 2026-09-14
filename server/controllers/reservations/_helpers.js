/**
 * ============================================================================
 * RESERVATION CONTROLLER HELPERS
 * ============================================================================
 *
 * Private helpers, constants, and utilities shared across reservation sub-controllers.
 */

import dayjs from "dayjs";

import {
  Reservation,
  User,
  Room,
  Bill,
  UtilityReading,
  BedHistory,
  Stay,
  Contract,
  TenantViolation,
  Appliance,
  ROOM_BRANCHES,
} from "../../models/index.js";
import ScheduledRoomTransfer from "../../models/ScheduledRoomTransfer.js";
import TenantTransferRequest from "../../models/TenantTransferRequest.js";
import { serializeScheduledRoomTransfer } from "../../services/scheduledRoomTransferView.js";
import {
  resolveTenantTransferLifecycleRecords,
  serializeTenantTransferRequest,
} from "../../services/tenantTransferRequestService.js";
import { BUSINESS } from "../../config/constants.js";
import { isOwnerRole, isAdminRole, OWNER_ROLE_VALUES } from "../../config/roles.js";
import logger from "../../middleware/logger.js";
import auditLogger from "../../utils/auditLogger.js";
import { resolveRoomDiscountPricing } from "../../services/contractPricingResolver.js";
import { updateOccupancyOnReservationChange } from "../../utils/occupancyManager.js";
import { notify } from "../../utils/notificationService.js";
import {
  CURRENT_STAY_STATUSES,
  EARLY_STAGE_STATUSES,
  resolveTenantCanonicalContract,
} from "../../services/tenantContractSelectionService.js";

import {
  isValidObjectId,
  invalidIdResponse,
  handleReservationError,
  checkBranchAccess,
  validateMoveInDate,
  handleStatusTransition,
  syncReservationUserLifecycle,
  reconcileTenantUsersForScope,
  buildUserUpdatePayload,
  getForbiddenTenantUpdateFields,
  getMoveInBlockers,
} from "../../utils/reservationHelpers.js";
export { buildUserUpdatePayload, getForbiddenTenantUpdateFields };
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  ACTIVE_STAY_STATUS_QUERY,
  canTransitionReservationStatus,
  CURRENT_RESIDENT_STATUS_QUERY,
  hasReservationStatus,
  normalizeReservationPayload,
  normalizeReservationStatus,
  readMoveInDate,
  readMoveOutDate,
  reservationStatusesForQuery,
  serializeReservation as baseSerializeReservation,
  serializeReservations as baseSerializeReservations,
  utilityEventTypesForQuery,
} from "../../utils/lifecycleNaming.js";

export const serializeReservation = (reservation, options) => {
  const serialized = baseSerializeReservation(reservation, options);
  if (!serialized) return serialized;
  const visitStatus =
    serialized.visitStatus ||
    reservation?.visitStatus ||
    getEffectiveVisitStatusKey(serialized) ||
    getEffectiveVisitStatusKey(reservation);
  if (visitStatus) {
    serialized.visitStatus = visitStatus;
  }
  return serialized;
};

export const serializeReservations = (reservations, options) =>
  Array.isArray(reservations)
    ? reservations.map((r) => serializeReservation(r, options))
    : [];
import {
  sendReservationConfirmedEmail,
  sendVisitApprovedEmail,
  sendPhysicalVisitStatusEmail,
  sendDocumentsRejectedEmail,
} from "../../config/email.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../../middleware/errorHandler.js";
import {
  buildBillingSummary,
  buildTenantWorkspaceEntry,
  buildTenantWorkspaceStats,
  computeLeaseEndDate,
} from "../../utils/tenantWorkspace.js";
export { buildTenantWorkspaceEntry };
import {
  getTenantActionContext as loadTenantActionContext,
  moveOutStayWorkflow,
  renewStayWorkflow,
  transferStayWorkflow,
} from "../../utils/tenantActionService.js";
import { resolveArchivedRestoreStatus } from "../../utils/reservationArchive.js";
import { ensureCurrentCycleRentBill } from "../../utils/rentGenerator.js";
import { emitToUser } from "../../utils/socket.js";
import {
  buildVisitAvailability,
  getVisitAvailabilitySettings,
  normalizeVisitBranch,
  serializeVisitAvailabilitySettings,
  updateVisitAvailabilitySettings,
  validateVisitSelection,
} from "../../utils/visitAvailability.js";
import { ROOM_BRANCH_LABELS } from "../../config/branches.js";
import {
  getBranchSettings,
  getBusinessSettings,
  RESERVATION_APPLIANCES,
} from "../../utils/businessSettings.js";
import {
  isAllowedReservationDocumentUrl,
  runReservationDocumentPrecheck,
} from "../../services/reservationDocumentPrecheckService.js";
export { isAllowedReservationDocumentUrl };

/* ─── CONSTANTS & FIELD SELECTIONS ────────────────────────────────────────── */
export const HEAVY_FIELDS =
  "-selfiePhotoUrl -validIDFrontUrl -validIDBackUrl -nbiClearanceUrl -companyIDUrl -__v";
export const ADMIN_LIST_FIELDS = [
  "_id",
  "userId",
  "roomId",
  "reservationCode",
  "status",
  "paymentStatus",
  "createdAt",
  "moveInDate",
  "moveOutDate",
  "visitDate",
  "visitTime",
  "visitApproved",
  "visitScheduledAt",
  "scheduleApproved",
  "scheduleApprovedAt",
  "scheduleRejected",
  "scheduleRejectedAt",
  "scheduleRejectionReason",
  "visitStatus",
  "visitOutcomeNotes",
  "visitOutcomeUpdatedAt",
  "visitOutcomeUpdatedByName",
  "mobileNumber",
  "billingEmail",
  "viewingPreference",
  "viewingType",
  "remoteViewingAcknowledged",
  "remoteViewingQuestions",
  "isUrgentMoveIn",
  "isOutOfTown",
  "currentLocation",
  "visitHistory",
  "applicationSubmittedAt",
  "applicationResubmittedAt",
  "applicationReviewReason",
  "applicationReviewedAt",
  "approvedForPaymentAt",
  "cancelledAt",
  "cancelledBy",
  "cancellationSource",
  "cancellationReason",
  "cancellationRequested",
  "cancellationRequestedAt",
  "cancellationRequestedBy",
  "cancellationStatus",
  "cancellationReviewedAt",
  "cancellationReviewedBy",
  "cancellationAdminNote",
  "reservationFeeRefundable",
  "reservationFeeForfeited",
  "isArchived",
  "archivedAt",
  "archivedBy",
  "archivedPreviousStatus",
  "archiveReason",
  "idType",
  "validIDType",
  "isViewedByAdmin",
  "adminViewedAt",
  "lastAdminViewedAt",
].join(" ");
// profileImage is the applicant's CURRENT/live profile photo (User.profileImage),
// distinct from Reservation.selfiePhotoUrl (the photo submitted with THIS
// application). Both are safe, non-sensitive fields — no auth/session/token
// data is ever populated here.
export const POPULATE_USER = ["userId", "firstName lastName email phone profileImage"];
export const POPULATE_ROOM = [
  "roomId",
  "name roomNumber branch type price monthlyPrice capacity currentOccupancy beds floor description images amenities policies intendedTenant",
];
export const CURRENT_RESIDENT_FIELDS = [
  "_id",
  "reservationCode",
  "status",
  "paymentStatus",
  "moveInDate",
  "moveOutDate",
  "leaseDuration",
  "monthlyRent",
  "mobileNumber",
  "firstName",
  "lastName",
  "email",
  "gender",
  "nationality",
  "maritalStatus",
  "employment",
  "emergencyContact",
  "selectedBed",
  "userId",
  "roomId",
].join(" ");
export const CURRENT_RESIDENT_USER = ["userId", "firstName lastName email phone"];
export const CURRENT_RESIDENT_ROOM = ["roomId", "name roomNumber branch type price floor"];
export const TENANT_WORKSPACE_FIELDS = [
  "_id",
  "reservationCode",
  "status",
  "paymentStatus",
  "moveInDate",
  "moveOutDate",
  "leaseDuration",
  "leaseExtensions",
  "monthlyRent",
  "totalPrice",
  "reservationFeeAmount",
  "currentStayId",
  "latestStayStatus",
  "mobileNumber",
  "birthday",
  "firstName",
  "lastName",
  "email",
  "gender",
  "nationality",
  "maritalStatus",
  "address",
  "employment",
  "emergencyContact",
  "selectedBed",
  "notes",
  "selfiePhotoUrl",
  "validIDFrontUrl",
  "validIDBackUrl",
  "validIDType",
  "idType",
  "nbiClearanceUrl",
  "companyIDUrl",
  "userId",
  "roomId",
  "selectedAppliances",
  "applianceFees",
  "isViewedByAdmin",
  "lastAdminViewedAt",
  "createdAt",
  "updatedAt",
].join(" ");
export const TENANT_WORKSPACE_USER = [
  "userId",
  "firstName lastName email phone profileImage role tenantStatus branch gender civilStatus nationality occupation address city province dateOfBirth emergencyContact emergencyPhone emergencyRelationship",
];
export const TENANT_WORKSPACE_ROOM = ["roomId", "name roomNumber branch type price floor"];
export const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const BED_UNAVAILABLE_MESSAGE =
  "This bed is no longer available. Please select another bed.";
export const VIEWING_PREFERENCES = Object.freeze([
  "physical_visit",
  "remote_2d_viewing",
  "urgent_move_in_review",
]);
export const LEGACY_VISIT_STATUSES = Object.freeze(
  reservationStatusesForQuery("visit_pending", "visit_approved"),
);
export const PAYMENT_GATED_STATUSES = Object.freeze(
  reservationStatusesForQuery("approved_for_payment", "payment_pending"),
);
export const MAX_REMOTE_VIEWING_QUESTION_LENGTH = 1500;
export const MAX_APPLICATION_REVIEW_REASON_LENGTH = 1500;
export const MAX_VISIT_MANAGEMENT_NOTE_LENGTH = 1500;
export const VISIT_MANAGEMENT_ACTIONS = Object.freeze([
  "approve_schedule",
  "reject_schedule",
  "mark_visited",
  "mark_no_show",
  "reschedule",
  "cancel_visit",
  "allow_without_visit",
]);
export const VISIT_OUTCOME_STATUSES = Object.freeze([
  "physical_visit_scheduled",
  "schedule_approved",
  "visit_completed",
  "no_show",
  "rescheduled",
  "visit_cancelled",
  "allowed_without_visit",
]);
export const VISIT_STATUS_ALIASES = Object.freeze({
  application_unlocked: "allowed_without_visit",
  allowed: "allowed_without_visit",
  scheduled: "physical_visit_scheduled",
  completed: "visit_completed",
  approved: "visit_completed",
  cancelled: "visit_cancelled",
  canceled: "visit_cancelled",
  not_required: "allowed_without_visit",
});
export const VISIT_APPLICATION_UNLOCK_STATUSES = Object.freeze([
  "visit_completed",
  "allowed_without_visit",
]);
export const VISIT_APPLICATION_LOCK_STATUSES = Object.freeze([
  "no_show",
  "rescheduled",
  "visit_cancelled",
]);
export const VISIT_MANAGEMENT_ACTIONS_BY_STATUS = Object.freeze({
  physical_visit_scheduled: Object.freeze([
    "mark_visited",
    "mark_no_show",
    "reject_schedule",
    "reschedule",
    "cancel_visit",
    "allow_without_visit",
  ]),
  schedule_approved: Object.freeze([
    "mark_visited",
    "mark_no_show",
    "reject_schedule",
    "reschedule",
    "cancel_visit",
    "allow_without_visit",
  ]),
  rescheduled: Object.freeze([
    "mark_visited",
    "mark_no_show",
    "reject_schedule",
    "reschedule",
    "cancel_visit",
    "allow_without_visit",
  ]),
  no_show: Object.freeze([]), // Reservation is auto-cancelled on no-show; no further visit actions
  visit_cancelled: Object.freeze(["reschedule", "allow_without_visit"]),
  visit_completed: Object.freeze([]),
  allowed_without_visit: Object.freeze([]),
});
export const DOCUMENT_PRECHECK_TYPES = Object.freeze({
  selfie_photo: {
    reservationField: "selfiePhotoUrl",
    precheckField: "selfiePhoto",
  },
  valid_id_front: {
    reservationField: "validIDFrontUrl",
    precheckField: "validIDFront",
    requiresIdType: true,
  },
  valid_id_back: {
    reservationField: "validIDBackUrl",
    precheckField: "validIDBack",
    requiresIdType: true,
  },
  nbi_clearance: {
    reservationField: "nbiClearanceUrl",
    precheckField: "nbiClearance",
  },
  company_id: {
    reservationField: "companyIDUrl",
    precheckField: "companyID",
  },
});

export const APPLICANT_UPLOAD_URL_FIELDS = Object.freeze([
  { key: "selfiePhotoUrl", label: "profile photo" },
  { key: "validIDFrontUrl", label: "valid ID (front)" },
  { key: "validIDBackUrl", label: "valid ID (back)" },
  { key: "nbiClearanceUrl", label: "NBI clearance" },
  { key: "companyIDUrl", label: "company ID" },
]);

export const isValidApplicantUploadUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};
export const DOCUMENT_PRECHECK_LABELS = Object.freeze({
  selfie_photo: "Selfie Photo",
  valid_id_front: "Valid ID (Front)",
  valid_id_back: "Valid ID (Back)",
  nbi_clearance: "NBI Clearance",
  company_id: "Company ID",
});
export const ACTIVE_BED_HOLD_STATUSES = Object.freeze(
  reservationStatusesForQuery(
    "pending",
    "viewing_preference_selected",
    "visit_pending",
    "visit_approved",
    "pending_application_review",
    "needs_revision",
    "approved_for_payment",
    "payment_pending",
    "reserved",
    "moveIn",
  ),
);
export const ROOM_SELECTION_LOCKING_STATUSES = Object.freeze(
  reservationStatusesForQuery(
    "viewing_preference_selected",
    "visit_pending",
    "visit_approved",
    "pending_application_review",
    "needs_revision",
    "approved_for_payment",
    "payment_pending",
    "reserved",
    "moveIn",
    "moveOut",
  ),
);
export const ROOM_RESELECTION_ALLOWED_STATUSES = Object.freeze([
  ...reservationStatusesForQuery("cancelled", "rejected", "archived"),
  "expired",
]);
export const VIEWING_PREFERENCE_LOCKED_MESSAGE =
  "Your viewing preference is already submitted and locked while admin reviews your reservation.";
export const VIEWING_PREFERENCE_LOCKING_STATUSES = Object.freeze(
  reservationStatusesForQuery(
    "viewing_preference_selected",
    "visit_pending",
    "visit_approved",
    "pending_application_review",
    "needs_revision",
    "approved_for_payment",
    "payment_pending",
    "reserved",
    "moveIn",
    "moveOut",
  ),
);
export const VIEWING_PREFERENCE_CHANGE_ALLOWED_STATUSES = Object.freeze([
  ...reservationStatusesForQuery("cancelled", "rejected", "archived"),
  "expired",
]);
export const APPLICATION_OR_PAYMENT_STARTED_STATUSES = Object.freeze(
  reservationStatusesForQuery(
    "pending_application_review",
    "needs_revision",
    "approved_for_payment",
    "payment_pending",
    "reserved",
    "moveIn",
    "moveOut",
  ),
);
export const APPLICATION_DRAFT_LOCKING_STATUSES = Object.freeze(
  reservationStatusesForQuery(
    "pending_application_review",
    "approved_for_payment",
    "payment_pending",
    "reserved",
    "moveIn",
    "moveOut",
    "rejected",
    "cancelled",
    "archived",
  ),
);
export const VISIT_PROCESSING_STATUSES = Object.freeze(
  reservationStatusesForQuery("visit_pending", "visit_approved"),
);
export const ROOM_SELECTION_UPDATE_FIELDS = Object.freeze([
  "roomId",
  "selectedBed",
  "selectedAppliances",
  "roomConfirmed",
  "totalPrice",
  "applianceFees",
  "monthlyRent",
  "reservationFee",
  "reservationFeeAmount",
  "amount",
  "fees",
  "deposit",
  "financialWorkflowVersion",
  "pricingSnapshot",
  "reservationFeePaymentStatus",
  "reservationFeePaymentId",
  "initialPaymentBillId",
  "initialPaymentStatus",
  "advanceCoverageStart",
  "advanceCoverageEnd",
  "advanceCoverageEndExclusive",
  "nextRegularBillingDate",
  "pricingApprovedAt",
  "pricingApprovedBy",
  "pricingSnapshotVersion",
]);
export const APPLICANT_CREATE_ALLOWED_FIELDS = Object.freeze([
  "roomId",
  "roomName",
  "roomNumber",
  "selectedBed",
  "selectedAppliances",
  "intendedMoveInDate",
  "targetMoveInDate",
  "leaseDuration",
  "billingEmail",
  "roomConfirmed",
  "viewingPreference",
  "viewingType",
  "visitDate",
  "visitTime",
  "visitScheduledAt",
  "remoteViewingAcknowledged",
  "remoteViewingQuestions",
  "isUrgentMoveIn",
  "isOutOfTown",
  "currentLocation",
  "selfiePhotoUrl",
  "firstName",
  "lastName",
  "middleName",
  "nickname",
  "mobileNumber",
  "birthday",
  "gender",
  "maritalStatus",
  "nationality",
  "educationLevel",
  "addressRegion",
  "addressUnitHouseNo",
  "addressStreet",
  "addressBarangay",
  "addressCity",
  "addressProvince",
  "validIDFrontUrl",
  "validIDBackUrl",
  "validIDType",
  "idType",
  "nbiClearanceUrl",
  "nbiReason",
  "companyIDUrl",
  "companyIDReason",
  "personalNotes",
  "emergencyContactName",
  "emergencyRelationship",
  "emergencyContactNumber",
  "healthConcerns",
  "employerSchool",
  "employerAddress",
  "employerContact",
  "startDate",
  "occupation",
  "previousEmployment",
  "roomType",
  "preferredRoomNumber",
  "referralSource",
  "referrerName",
  "estimatedMoveInTime",
  "workSchedule",
  "workScheduleOther",
  "agreedToPrivacy",
  "agreedToCertification",
  "moveInDate",
  "notes",
]);
export const CLIENT_PRICING_FIELDS = Object.freeze([
  "totalPrice",
  "reservationFee",
  "reservationFeeAmount",
  "amount",
  "fees",
  "applianceFees",
  "monthlyRent",
  "deposit",
]);

/* ─── HELPER FUNCTIONS ────────────────────────────────────────────────────── */

export function combineLifecycleDateTime({
  dateInput,
  timeInput,
  fallbackDate = new Date(),
}) {
  if (!dateInput && !timeInput) return new Date(fallbackDate);
  const baseDate = dateInput ? dayjs(dateInput) : dayjs(fallbackDate);
  if (!baseDate.isValid()) return null;
  if (!timeInput) return baseDate.toDate();
  const [hours, minutes] = String(timeInput).split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return baseDate.toDate();
  return baseDate
    .hour(hours)
    .minute(minutes)
    .second(0)
    .millisecond(0)
    .toDate();
}

export function isActiveBedAssignmentDuplicateError(error) {
  if (!error) return false;
  if (error.code === 11000) {
    const keyPattern = error.keyPattern || {};
    if (keyPattern.roomId && keyPattern["selectedBed.id"]) {
      return true;
    }
    const message = String(error.message || "");
    if (
      message.includes("roomId") &&
      (message.includes("selectedBed.id") || message.includes("selectedBed_id"))
    ) {
      return true;
    }
  }
  return false;
}

export function isActiveUserReservationDuplicateError(error) {
  if (!error) return false;
  if (error.code === 11000) {
    const keyPattern = error.keyPattern || {};
    if (keyPattern.userId && !keyPattern.roomId) {
      return true;
    }
    const message = String(error.message || "");
    if (
      message.includes("unique_active_user_reservation") ||
      (message.includes("userId") && !message.includes("roomId"))
    ) {
      return true;
    }
  }
  return false;
}

export async function validateSelectedBedForReservation({
  room,
  submittedBed,
  excludeReservationId = null,
}) {
  if (!room) {
    throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
  }

  let beds = Array.isArray(room.beds) && room.beds.length > 0 ? room.beds : [];
  if (beds.length === 0 && room.capacity > 0) {
    const defaultPositions = ["upper", "lower", "upper", "lower"];
    beds = Array.from({ length: room.capacity }, (_, idx) => ({
      id: `bed-${idx + 1}`,
      bedNumber: idx + 1,
      position: defaultPositions[idx % defaultPositions.length],
      status: "available",
      label: `Bed ${idx + 1}`,
    }));
  }

  if (beds.length === 0) {
    throw new AppError("No beds defined for this room", 400, "BED_SELECTION_REQUIRED");
  }

  let targetBed = null;
  const bedId = submittedBed?.id || (typeof submittedBed === "string" ? submittedBed : null);
  const bedNumber = submittedBed?.bedNumber || (typeof submittedBed === "number" ? submittedBed : null);

  // 1. If explicit bedId or bedNumber provided, search for match in room beds
  if (bedId) {
    const targetIdStr = String(bedId).trim();
    targetBed = beds.find((b) => {
      const bIdStr = b.id ? String(b.id) : null;
      const bMongoIdStr = b._id ? String(b._id) : null;
      const bNumStr = b.bedNumber != null ? String(b.bedNumber) : null;
      return bIdStr === targetIdStr || bMongoIdStr === targetIdStr || bNumStr === targetIdStr;
    });
  }

  if (!targetBed && bedNumber != null) {
    targetBed = beds.find((b) => Number(b.bedNumber) === Number(bedNumber));
  }

  // 2. If single bed in room and no explicit bed specified, default to it
  if (!targetBed && beds.length === 1 && !submittedBed) {
    targetBed = beds[0];
  }

  // 3. Fallback: If no target bed selected yet (e.g. submittedBed is null/omitted or bedId didn't match),
  // auto-assign the first available, non-held bed in the room
  if (!targetBed) {
    for (const candidateBed of beds) {
      const candidateStatus = candidateBed.status || "available";
      if (
        candidateStatus !== "occupied" &&
        candidateStatus !== "maintenance" &&
        candidateStatus !== "locked"
      ) {
        const candidateIdentifiers = [
          candidateBed._id ? String(candidateBed._id) : null,
          candidateBed.id ? String(candidateBed.id) : null,
          candidateBed.bedNumber != null ? String(candidateBed.bedNumber) : null,
        ].filter(Boolean);

        const candidateIdFilter =
          candidateIdentifiers.length === 1
            ? candidateIdentifiers[0]
            : { $in: candidateIdentifiers };

        const holdQuery = {
          roomId: room._id,
          "selectedBed.id": candidateIdFilter,
          status: { $in: ACTIVE_BED_HOLD_STATUSES },
          isArchived: { $ne: true },
        };
        if (excludeReservationId) {
          holdQuery._id = { $ne: excludeReservationId };
        }

        const activeHold = await Reservation.findOne(holdQuery).select("_id").lean();
        if (!activeHold) {
          targetBed = candidateBed;
          break;
        }
      }
    }
  }

  // 4. If still no target bed found, throw conflict
  if (!targetBed) {
    throw new AppError(BED_UNAVAILABLE_MESSAGE, 409, "BED_UNAVAILABLE");
  }

  // 5. Verify the targetBed is not held by another active reservation
  const targetIdentifiers = [
    targetBed._id ? String(targetBed._id) : null,
    targetBed.id ? String(targetBed.id) : null,
    targetBed.bedNumber != null ? String(targetBed.bedNumber) : null,
  ].filter(Boolean);

  const selectedBedIdFilter =
    targetIdentifiers.length === 1
      ? targetIdentifiers[0]
      : { $in: targetIdentifiers };

  const query = {
    roomId: room._id,
    "selectedBed.id": selectedBedIdFilter,
    status: { $in: ACTIVE_BED_HOLD_STATUSES },
    isArchived: { $ne: true },
  };
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }

  const activeHold = await Reservation.findOne(query).select("_id").lean();
  if (activeHold) {
    throw new AppError(BED_UNAVAILABLE_MESSAGE, 409, "BED_UNAVAILABLE");
  }

  return {
    id: String(targetBed.id || targetBed._id || targetBed.bedNumber || 1),
    bedNumber: targetBed.bedNumber || 1,
    position: targetBed.position || "single",
    bunkBlock: targetBed.bunkBlock || (targetBed.position === "single" ? "none" : "A"),
    code: targetBed.code || `${room.roomNumber || ""}-${targetBed.bunkBlock || "A"}-${targetBed.position === "upper" ? "U" : targetBed.position === "lower" ? "L" : "S"}`,
    label: targetBed.label || `Bed ${targetBed.bedNumber || 1}`,
  };
}

export async function ensureRoomReservationCapacity({
  roomId,
  excludeReservationId = null,
}) {
  const query = {
    roomId,
    status: { $in: ACTIVE_BED_HOLD_STATUSES },
    isArchived: { $ne: true },
  };
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }
  return await Reservation.countDocuments(query);
}

// Explicit backend invariant: once a tenant has an active/ending Stay or a
// Contract that has progressed beyond an early-stage draft, the reservation
// can no longer go through the normal cancellation workflow — Move-Out or
// Termination must be used instead. This is deliberately independent of
// APPLICANT_CANCELLABLE_STATUSES (cancellationController.js) so a future
// whitelist edit, data-repair script, or admin-only bypass can never silently
// reopen the "cancel a reservation with an active tenancy" hole.
export async function assertNoActiveStayOrProgressedContract(reservationId, tenantId) {
  const hasActiveStay = await Stay.exists({
    reservationId,
    status: { $in: CURRENT_STAY_STATUSES },
  });
  if (hasActiveStay) {
    throw new AppError(
      "This reservation has an active stay and can no longer be cancelled. Use Move-Out or Termination instead.",
      409,
      "ACTIVE_STAY_OR_CONTRACT_BLOCKS_CANCELLATION",
    );
  }

  const canonicalContract = await resolveTenantCanonicalContract(tenantId, {
    includeEarlyStages: true,
  }).catch(() => null);
  if (canonicalContract && ["active", "expiring_soon"].includes(canonicalContract.status)) {
    throw new AppError(
      "This reservation has an active contract and can no longer be cancelled. Use Move-Out or Termination instead.",
      409,
      "ACTIVE_STAY_OR_CONTRACT_BLOCKS_CANCELLATION",
    );
  }
}

export async function notifyAdminsOfCancellationRequest(reservation, dbUser) {
  const room = await Room.findById(reservation.roomId).select("branch").lean();
  const adminRecipients = room?.branch
    ? [
        { role: "branch_admin", branch: room.branch },
        { role: "owner" },
      ]
    : [
        { role: "branch_admin" },
        { role: "owner" },
      ];

  const adminUsers = await User.find({
    $or: adminRecipients,
    accountStatus: "active",
    isArchived: { $ne: true },
  }).select("_id").lean();

  const tenantName = `${dbUser.firstName || ""} ${dbUser.lastName || ""}`.trim() || dbUser.email;
  await Promise.all(
    adminUsers.map(async (admin) => {
      const notification = await notify.cancellationRequestAlert(
        admin._id,
        tenantName,
        reservation.reservationCode,
        reservation._id,
      );
      if (notification) {
        emitToUser(admin._id, "notification:new", notification);
      }
    }),
  );
}

export async function notifyAdminsOfCancellationWithdrawal(reservation, dbUser) {
  const room = await Room.findById(reservation.roomId).select("branch").lean();
  const adminRecipients = room?.branch
    ? [
        { role: "branch_admin", branch: room.branch },
        { role: "owner" },
      ]
    : [
        { role: "branch_admin" },
        { role: "owner" },
      ];

  const adminUsers = await User.find({
    $or: adminRecipients,
    accountStatus: "active",
    isArchived: { $ne: true },
  }).select("_id").lean();

  const tenantName = `${dbUser.firstName || ""} ${dbUser.lastName || ""}`.trim() || dbUser.email;
  await Promise.all(
    adminUsers.map(async (admin) => {
      const notification = await notify.cancellationRequestWithdrawnAlert(
        admin._id,
        tenantName,
        reservation.reservationCode,
        reservation._id,
      );
      if (notification) {
        emitToUser(admin._id, "notification:new", notification);
      }
    }),
  );
}

export async function notifyAdminsOfVisitSchedule({
  reservation,
  applicantUser,
  viewingPreference,
  visitDate,
  visitTime,
  isReschedule = false,
}) {
  if (!reservation) return;
  try {
    const roomId = reservation.roomId?._id || reservation.roomId;
    const room = roomId
      ? await Room.findById(roomId).select("name roomNumber branch").lean()
      : null;
    const branch = reservation.branch || room?.branch || "";
    const roomName = room?.name || room?.roomNumber || reservation.preferredRoomNumber || "a room";
    const tenantName = applicantUser
      ? `${applicantUser.firstName || ""} ${applicantUser.lastName || ""}`.trim() || applicantUser.email || "An applicant"
      : "An applicant";

    const rawBranch = String(branch || "").trim();
    const branchSlug = rawBranch.toLowerCase().replace(/\s+/g, "-");
    const branchDisplay =
      branchSlug === "gil-puyat"
        ? "Gil Puyat"
        : branchSlug === "guadalupe"
          ? "Guadalupe"
          : rawBranch;

    const branchMatches = Array.from(
      new Set([rawBranch, branchSlug, branchDisplay].filter(Boolean)),
    );

    const adminRecipients = branchMatches.length > 0
      ? [
          { role: "branch_admin", branch: { $in: branchMatches } },
          { role: "owner" },
        ]
      : [
          { role: "branch_admin" },
          { role: "owner" },
        ];

    const adminUsers = await User.find({
      $or: adminRecipients,
      accountStatus: "active",
      isArchived: { $ne: true },
    }).select("_id branch role").lean();

    await Promise.all(
      adminUsers.map(async (admin) => {
        const notification = await notify.visitScheduledAlert(admin._id, {
          tenantName,
          roomName,
          branch,
          visitDate: visitDate || reservation.visitDate,
          visitTime: visitTime || reservation.visitTime,
          reservationId: reservation._id,
          viewingPreference: viewingPreference || reservation.viewingPreference,
          isReschedule,
        });
        if (notification) {
          emitToUser(admin._id, "notification:new", notification);
        }
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, reservationId: reservation._id },
      "Failed to notify admins of visit schedule (non-fatal)",
    );
  }
}

export const normalizeViewingPreferenceInput = (value, fallback = null) => {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();

  if (VIEWING_PREFERENCES.includes(normalized)) {
    return normalized;
  }
  if (normalized === "inperson" || normalized === "physical") {
    return "physical_visit";
  }
  if (
    normalized === "remote" ||
    normalized === "remote_2d" ||
    normalized === "virtual" ||
    normalized === "photo_based"
  ) {
    return "remote_2d_viewing";
  }
  if (normalized === "urgent" || normalized === "urgent_move_in") {
    return "urgent_move_in_review";
  }

  return null;
};

export const normalizeDocumentPrecheckType = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (DOCUMENT_PRECHECK_TYPES[normalized]) return normalized;
  if (normalized === "valididfront") return "valid_id_front";
  if (normalized === "valididback") return "valid_id_back";
  if (normalized === "nbiclearance") return "nbi_clearance";
  if (normalized === "companyid" || normalized === "school_id")
    return "company_id";
  if (normalized === "selfie" || normalized === "selfiephoto")
    return "selfie_photo";
  return null;
};

export const buildEmptyDocumentPrecheck = () => ({
  precheckProvider: "ocr",
  precheckStatus: "not_checked",
  readabilityStatus: "unknown",
  documentTypeStatus: "unknown",
  canSubmit: true,
  requiresManualReview: true,
  applicantMessage: "",
  adminNote: "",
  confidence: null,
  flags: [],
  aiCheckStatus: "not_checked",
  aiCheckWarnings: [],
  aiCheckedAt: null,
  requiresAdminAttention: false,
  summaryMessage: "",
  provider: "ocr",
});

export const mapAiStatusToLegacyValidationStatus = (precheckOrStatus) => {
  const precheckStatus = precheckOrStatus?.precheckStatus;
  if (precheckStatus === "ready_for_submission") return "passed";
  if (precheckStatus === "needs_reupload") return "failed";
  if (precheckStatus === "manual_review_fallback") return "manual_review";

  const aiCheckStatus =
    typeof precheckOrStatus === "string"
      ? precheckOrStatus
      : precheckOrStatus?.aiCheckStatus;
  if (aiCheckStatus === "passed") return "passed";
  if (aiCheckStatus === "failed") return "failed";
  return "manual_review";
};

export const getDocumentPrecheckStatus = (precheck = {}) => {
  const normalized = String(precheck?.precheckStatus || "").trim();
  if (normalized && normalized !== "not_checked") return normalized;
  if (precheck?.aiCheckStatus === "passed") return "ready_for_submission";
  if (precheck?.aiCheckStatus === "failed" || precheck?.aiCheckStatus === "warning")
    return "needs_reupload";
  if (precheck?.aiCheckStatus === "error") return "manual_review_fallback";
  return "not_checked";
};

export const shouldBlockDocumentSubmission = (precheck = {}) => {
  // Document precheck never blocks application submission or approval.
  // All document issues fall back to manual admin review on the admin dashboard.
  return false;
};

export const deriveViewingPreference = (reservation, updates = {}) => {
  const explicitPreference = normalizeViewingPreferenceInput(
    updates.viewingPreference ?? reservation?.viewingPreference,
  );
  if (explicitPreference) return explicitPreference;

  const updateViewingType = String(updates.viewingType || "").trim().toLowerCase();
  if (updateViewingType && updateViewingType !== "inperson") {
    const normalizedUpdateViewingType = normalizeViewingPreferenceInput(updateViewingType);
    if (normalizedUpdateViewingType) return normalizedUpdateViewingType;
  }

  const reservationViewingType = String(reservation?.viewingType || "")
    .trim()
    .toLowerCase();
  if (reservationViewingType && reservationViewingType !== "inperson") {
    const normalizedReservationViewingType =
      normalizeViewingPreferenceInput(reservationViewingType);
    if (normalizedReservationViewingType) return normalizedReservationViewingType;
  }

  if (updates.isUrgentMoveIn ?? reservation?.isUrgentMoveIn) {
    return "urgent_move_in_review";
  }

  if (
    updates.remoteViewingAcknowledged ??
    reservation?.remoteViewingAcknowledged ??
    false
  ) {
    return "remote_2d_viewing";
  }

  if (
    String(
      updates.remoteViewingQuestions ?? reservation?.remoteViewingQuestions ?? "",
    ).trim()
  ) {
    return "remote_2d_viewing";
  }

  if (
    updates.visitDate ||
    reservation?.visitDate ||
    updates.visitTime ||
    reservation?.visitTime ||
    updates.visitCode ||
    reservation?.visitCode ||
    updates.visitScheduledAt ||
    reservation?.visitScheduledAt ||
    updates.visitStatus ||
    reservation?.visitStatus
  ) {
    return "physical_visit";
  }

  return null;
};

export const deriveViewingType = (viewingPreference) => {
  if (viewingPreference === "physical_visit") return "inperson";
  if (viewingPreference === "remote_2d_viewing") return "remote_2d";
  if (viewingPreference === "urgent_move_in_review") return "urgent_move_in";
  return null;
};

export const shouldAllowPaymentAccess = (status) =>
  hasReservationStatus(status, PAYMENT_GATED_STATUSES);

export const hasSubmittedField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body || {}, field);

export const isTruthyApprovalValue = (value) => {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["true", "approved", "allowed", "reset"].includes(
    value.trim().toLowerCase(),
  );
};

export const hasAdminApprovedRoomReselection = (reservation = {}) => {
  const explicitValue =
    reservation.roomReselectionApproved ??
    reservation.reselectionApproved ??
    reservation.allowRoomReselection ??
    reservation.roomChangeApproved ??
    reservation.adminApprovedReselection;

  if (isTruthyApprovalValue(explicitValue)) return true;

  return isTruthyApprovalValue(
    reservation.roomReselectionStatus ||
      reservation.reselectionStatus ||
      reservation.roomChangeStatus,
  );
};

export const hasAdminAllowedViewingPreferenceChange = (reservation = {}) => {
  const explicitValue =
    reservation.viewingPreferenceChangeAllowed ??
    reservation.allowViewingPreferenceChange ??
    reservation.viewingPreferenceReset ??
    reservation.adminApprovedViewingPreferenceChange ??
    reservation.preferenceChangeApproved;

  if (isTruthyApprovalValue(explicitValue)) return true;

  return isTruthyApprovalValue(
    reservation.viewingPreferenceChangeStatus ||
      reservation.preferenceChangeStatus,
  );
};

export const getExplicitViewingTypePreference = (reservation = {}) => {
  const rawViewingType = String(reservation.viewingType || "").trim().toLowerCase();
  if (!rawViewingType || rawViewingType === "inperson") return null;
  return normalizeViewingPreferenceInput(rawViewingType);
};

export const getSubmittedViewingPreference = (reservation = {}) => {
  const explicitPreference = normalizeViewingPreferenceInput(reservation.viewingPreference);
  if (explicitPreference) return explicitPreference;

  const explicitViewingTypePreference = getExplicitViewingTypePreference(reservation);
  if (explicitViewingTypePreference) return explicitViewingTypePreference;

  if (reservation.isUrgentMoveIn) return "urgent_move_in_review";

  if (
    reservation.remoteViewingAcknowledged ||
    String(reservation.remoteViewingQuestions || "").trim()
  ) {
    return "remote_2d_viewing";
  }

  if (
    reservation.visitDate ||
    reservation.visitTime ||
    reservation.visitCode ||
    reservation.visitScheduledAt ||
    reservation.visitStatus ||
    reservation.scheduleApproved ||
    reservation.scheduleApprovedAt
  ) {
    return "physical_visit";
  }

  return null;
};

export const hasSavedApplicantViewingPreference = (reservation = {}) => {
  const explicitPreference = String(reservation.viewingPreference || "").trim();
  const viewingType = String(reservation.viewingType || "")
    .trim()
    .toLowerCase();

  return Boolean(
    explicitPreference ||
      reservation.visitDate ||
      reservation.visitTime ||
      reservation.visitStatus ||
      reservation.remoteViewingAcknowledged ||
      reservation.isUrgentMoveIn ||
      ["remote_2d", "remote_2d_viewing", "virtual", "urgent_move_in", "urgent_move_in_review"].includes(
        viewingType,
      ),
  );
};

export const isViewingPreferenceSubmitted = (reservation = {}) => {
  const submittedPreference = getSubmittedViewingPreference(reservation);
  const status = normalizeReservationStatus(
    reservation.reservationStatus || reservation.status,
  );
  return Boolean(
    submittedPreference ||
      hasReservationStatus(status, VIEWING_PREFERENCE_LOCKING_STATUSES) ||
      reservation.visitDate ||
      reservation.visitTime ||
      reservation.visitCode ||
      reservation.visitScheduledAt ||
      reservation.visitStatus ||
      reservation.scheduleApproved ||
      reservation.scheduleApprovedAt ||
      reservation.scheduleRejectedAt ||
      reservation.visitOutcomeUpdatedAt ||
      reservation.remoteViewingAcknowledged ||
      String(reservation.remoteViewingQuestions || "").trim() ||
      reservation.isUrgentMoveIn,
  );
};

export const isViewingPreferenceChangeAllowed = (reservation = {}) => {
  if (!isViewingPreferenceSubmitted(reservation)) return true;

  const status = normalizeReservationStatus(
    reservation.reservationStatus || reservation.status,
  );

  if (hasReservationStatus(status, VIEWING_PREFERENCE_CHANGE_ALLOWED_STATUSES)) {
    return true;
  }

  const hardBlocked = Boolean(
    hasReservationStatus(status, APPLICATION_OR_PAYMENT_STARTED_STATUSES) ||
      reservation.applicationSubmittedAt ||
      reservation.paymentDate ||
      reservation.proofOfPaymentUrl ||
      String(reservation.paymentStatus || "").trim().toLowerCase() === "paid" ||
      reservation.paymongoPaymentId ||
      reservation.paymongoSessionId ||
      reservation.visitCode ||
      reservation.visitScheduledAt ||
      hasReservationStatus(status, VISIT_PROCESSING_STATUSES) ||
      reservation.scheduleApproved ||
      reservation.scheduleApprovedAt ||
      reservation.visitApproved ||
      isVisitApplicationUnlocked(reservation.visitStatus) ||
      reservation.visitOutcomeUpdatedAt,
  );

  if (hardBlocked) return false;
  return hasAdminAllowedViewingPreferenceChange(reservation);
};

export const canResubmitSameViewingPreference = (
  reservation = {},
  requestedPreference = "",
) => {
  const submittedPreference = getSubmittedViewingPreference(reservation);
  const normalizedRequested =
    normalizeViewingPreferenceInput(requestedPreference, submittedPreference) ||
    submittedPreference;

  return Boolean(
    submittedPreference === "physical_visit" &&
      normalizedRequested === "physical_visit" &&
      (reservation.scheduleRejected === true || reservation.visitStatus === "no_show") &&
      !reservation.applicationSubmittedAt &&
      !hasReservationStatus(
        reservation.reservationStatus || reservation.status,
        "pending_application_review",
        "approved_for_payment",
        "payment_pending",
        "reserved",
        "moveIn",
        "moveOut",
      ),
  );
};

export const canApplicantSubmitViewingPreference = (
  reservation = {},
  requestedPreference = "",
) => {
  if (!isViewingPreferenceSubmitted(reservation)) return true;
  if (isViewingPreferenceChangeAllowed(reservation)) return true;
  return canResubmitSameViewingPreference(reservation, requestedPreference);
};

export const isViewingPreferenceLocked = (reservation = {}, requestedPreference = "") => {
  if (!isViewingPreferenceSubmitted(reservation)) return false;
  if (isViewingPreferenceChangeAllowed(reservation)) return false;
  return !canResubmitSameViewingPreference(reservation, requestedPreference);
};

export const isApplicantRoomSelectionLocked = (reservation = {}) => {
  if (!reservation) return false;
  if (hasAdminApprovedRoomReselection(reservation)) return false;

  const status = normalizeReservationStatus(reservation.status);

  if (hasReservationStatus(status, ROOM_RESELECTION_ALLOWED_STATUSES)) {
    return false;
  }

  return Boolean(
    hasReservationStatus(status, ROOM_SELECTION_LOCKING_STATUSES) ||
      reservation.roomConfirmed === true ||
      hasSavedApplicantViewingPreference(reservation) ||
      reservation.applicationSubmittedAt ||
      reservation.paymentDate ||
      reservation.proofOfPaymentUrl,
  );
};

export const pickAllowedFields = (source = {}, allowedFields = []) =>
  allowedFields.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const TRUSTED_RESERVATION_APPLIANCES = Object.freeze(
  RESERVATION_APPLIANCES.map((appliance) => ({
    id: String(appliance.id || "").trim().toLowerCase(),
    name: String(appliance.name || "").trim(),
  })).filter((appliance) => appliance.id && appliance.name),
);
export const TRUSTED_RESERVATION_APPLIANCE_MAP = new Map(
  TRUSTED_RESERVATION_APPLIANCES.map((appliance) => [appliance.id, appliance]),
);

export const normalizeSelectedApplianceEntries = (selectedAppliances) => {
  if (selectedAppliances == null) return [];

  if (Array.isArray(selectedAppliances)) {
    return selectedAppliances.map((entry) => ({
      id: entry?.id ?? entry?.applianceId,
      quantity: entry?.quantity,
    }));
  }

  if (
    typeof selectedAppliances === "object" &&
    selectedAppliances.constructor === Object
  ) {
    return Object.entries(selectedAppliances).map(([id, quantity]) => ({
      id,
      quantity,
    }));
  }

  throw new AppError(
    "Invalid selected appliances payload.",
    400,
    "INVALID_SELECTED_APPLIANCES",
  );
};

export const validateSelectedAppliancesForReservation = async ({
  selectedAppliances,
  branchId,
  branchSettings,
}) => {
  const normalizedBranchId = String(branchId || "").toLowerCase();
  const applianceFeesEnabled =
    normalizedBranchId === "guadalupe" && branchSettings?.isApplianceFeeEnabled;

  if (!applianceFeesEnabled) {
    return [];
  }

  const entries = normalizeSelectedApplianceEntries(selectedAppliances);
  if (entries.length === 0) {
    return [];
  }

  // Load active appliances from DB catalog and overlay onto TRUSTED_RESERVATION_APPLIANCE_MAP
  const catalogMap = new Map(TRUSTED_RESERVATION_APPLIANCE_MAP);
  try {
    if (Appliance && typeof Appliance.find === "function") {
      const dbAppliances = await Appliance.find({ isActive: true }).lean();
      if (Array.isArray(dbAppliances) && dbAppliances.length > 0) {
        for (const app of dbAppliances) {
          const code = String(app.code || "").trim().toLowerCase();
          if (code) {
            catalogMap.set(code, {
              id: code,
              name: app.name,
              monthlyFee: app.monthlyFee ?? 200,
              maxQuantity: app.maxQuantity ?? 5,
            });
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Could not load Appliance catalog from DB in reservation validation: ${err.message}`);
  }

  const validatedAppliances = [];
  const quantitiesById = new Map();

  for (const entry of entries) {
    const applianceId = String(entry?.id || "").trim().toLowerCase();
    const trustedAppliance = catalogMap.get(applianceId) || TRUSTED_RESERVATION_APPLIANCE_MAP.get(applianceId);

    if (!trustedAppliance) {
      throw new AppError(
        "Unknown appliance selection. Please review your appliance choices and try again.",
        400,
        "INVALID_APPLIANCE_ID",
      );
    }

    if (!Number.isInteger(entry?.quantity) || entry.quantity < 0) {
      throw new AppError(
        `Invalid quantity for ${trustedAppliance.name}. Quantity must be a non-negative whole number.`,
        400,
        "INVALID_APPLIANCE_QUANTITY",
      );
    }

    const maxLimit = trustedAppliance.maxQuantity || 5;
    if (entry.quantity > maxLimit) {
      throw new AppError(
        `Maximum quantity for ${trustedAppliance.name} is ${maxLimit}.`,
        400,
        "INVALID_APPLIANCE_QUANTITY",
      );
    }

    quantitiesById.set(
      applianceId,
      (quantitiesById.get(applianceId) || 0) + entry.quantity,
    );
  }

  for (const [id, quantity] of quantitiesById.entries()) {
    if (quantity > 0) {
      const trusted = catalogMap.get(id) || TRUSTED_RESERVATION_APPLIANCE_MAP.get(id);
      if (trusted) {
        validatedAppliances.push({
          id: trusted.id,
          name: trusted.name,
          quantity,
          price: trusted.monthlyFee ?? 200,
        });
      }
    }
  }

  return validatedAppliances;
};

export const resolveReservationRent = ({ room, leaseDuration, isDiscountEnabled, settings }) => {
  const parsedLeaseDuration = Number(leaseDuration);
  const minMonths = settings?.longTermLeaseMinMonths ?? room?.longTermLeaseMinMonths ?? 6;
  const isLongTerm = Number.isFinite(parsedLeaseDuration) && parsedLeaseDuration >= minMonths;
  const normType = String(room?.type || "").toLowerCase();

  const pricing = resolveRoomDiscountPricing(normType, settings, room);
  const discountActive =
    isDiscountEnabled !== false &&
    room?.isDiscountEnabled !== false &&
    pricing.isDiscountEnabled !== false;

  if (isLongTerm) {
    return roundMoney(discountActive ? pricing.monthlyPrice : pricing.regularLongRate);
  }
  return roundMoney(discountActive ? pricing.shortTermRate : pricing.regularShortRate);
};

export const buildReservationPricing = async ({
  room,
  leaseDuration,
  selectedAppliances,
}) => {
  const settings = await getBusinessSettings();
  const branchId = String(room?.branch || "").toLowerCase();
  const branchSettings = getBranchSettings(branchId, settings);
  const monthlyRent = resolveReservationRent({
    room,
    leaseDuration,
    isDiscountEnabled: settings?.isDiscountEnabled,
    settings,
  });
  const validatedSelectedAppliances = await validateSelectedAppliancesForReservation({
    selectedAppliances,
    branchId,
    branchSettings,
  });
  const applianceFeeAmountPerUnit = roundMoney(
    Number(branchSettings?.applianceFeeAmountPerUnit ?? 200),
  );
  const totalApplianceQuantity = validatedSelectedAppliances.reduce(
    (total, appliance) => total + (Number(appliance.quantity) || 0),
    0,
  );
  const applianceFees =
    branchId === "guadalupe" && branchSettings?.isApplianceFeeEnabled
      ? roundMoney(
          validatedSelectedAppliances.reduce(
            (total, appliance) =>
              total +
              (Number(appliance.price ?? applianceFeeAmountPerUnit) *
                appliance.quantity),
            0,
          ),
        )
      : 0;
  const reservationFeeAmount = roundMoney(
    Number(settings?.reservationFeeAmount ?? BUSINESS.DEPOSIT_AMOUNT),
  );
  const totalPrice = roundMoney(monthlyRent + applianceFees);
  const securityDeposit = monthlyRent;
  const grossMoveInCashOut = roundMoney(monthlyRent + securityDeposit);
  const netMoveInBalanceDue = roundMoney(Math.max(0, grossMoveInCashOut - reservationFeeAmount));

  const moveInCashOut = {
    monthlyAdvance: monthlyRent,
    securityDeposit,
    grossTotal: grossMoveInCashOut,
    reservationFeeDeductible: reservationFeeAmount,
    netAmountDue: netMoveInBalanceDue,
  };

  return {
    selectedAppliances: validatedSelectedAppliances,
    monthlyRent,
    applianceFees,
    totalPrice,
    reservationFeeAmount,
    moveInCashOut,
    breakdown: {
      monthlyRent,
      selectedAppliances: validatedSelectedAppliances,
      applianceFees,
      totalPrice,
      reservationFeeAmount,
      moveInCashOut,
      branchId,
      branchName: ROOM_BRANCH_LABELS[branchId] || room?.branch || "",
      pricingSource: {
        roomPrice: roundMoney(Number(room?.price ?? 0)),
        roomMonthlyPrice: roundMoney(
          Number(room?.monthlyPrice ?? room?.price ?? 0),
        ),
        leaseDuration: Number.isFinite(Number(leaseDuration))
          ? Number(leaseDuration)
          : null,
      },
      appliancePolicy: {
        branch: branchId,
        enabled: !!branchSettings?.isApplianceFeeEnabled,
        amountPerUnit: applianceFeeAmountPerUnit,
        selectedQuantity: totalApplianceQuantity,
        appliedAmount: applianceFees,
      },
      authoritative: true,
      ignoredClientFields: CLIENT_PRICING_FIELDS,
    },
  };
};

export const loadReservableRoom = async ({ roomId, roomNumber, roomName }) => {
  if (roomId) {
    return Room.findById(roomId);
  }

  const legacyRoomFilter = { isArchived: false };
  if (roomNumber) {
    legacyRoomFilter.roomNumber = roomNumber;
  } else {
    legacyRoomFilter.name = roomName;
  }

  const matchedRooms = await Room.find(legacyRoomFilter).limit(2);
  if (matchedRooms.length > 1) {
    throw new AppError(
      "Room reference is ambiguous. Please retry using the room ID or branch-scoped room number.",
      400,
      "AMBIGUOUS_ROOM_REFERENCE",
    );
  }

  return matchedRooms[0] || null;
};

export const parseRequestedVisitTime = (visitTime) => {
  if (!visitTime || typeof visitTime !== "string") return null;
  const normalized = visitTime.trim();
  if (!TIME_24H_REGEX.test(normalized)) {
    throw new AppError(
      "Invalid visit time format. Please use HH:mm in 24-hour format.",
      400,
      "INVALID_VISIT_TIME_FORMAT",
    );
  }
  const [hours, minutes] = normalized.split(":").map(Number);
  return { visitTime: normalized, hours, minutes };
};

export const combineDateAndTime = (dateInput, hours = 0, minutes = 0) => {
  if (!dateInput) return null;
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hours, minutes, 0, 0);
  return base;
};

export const getResidentStatus = (reservation, now = new Date()) => {
  let statusLabel = "Active";

  if (
    reservation.paymentStatus === "pending" ||
    reservation.paymentStatus === "partial"
  ) {
    statusLabel = "Overdue";
  }

  const moveOutDate = readMoveOutDate(reservation);
  if (moveOutDate) {
    const daysLeft = Math.ceil(
      (new Date(moveOutDate) - now) / 86_400_000,
    );
    if (daysLeft <= 30 && daysLeft > 0) statusLabel = "Moving Out";
    if (daysLeft <= 0) statusLabel = "Overdue";
  }

  return statusLabel;
};

export const mapCurrentResident = (reservation, now = new Date()) => {
  const serialized = serializeReservation(reservation);
  return {
    ...serialized,
    statusLabel: getResidentStatus(reservation, now),
  };
};

export const buildResidentStats = (residents) => ({
  total: residents.length,
  active: residents.filter((resident) => resident.statusLabel === "Active")
    .length,
  overdue: residents.filter((resident) => resident.statusLabel === "Overdue")
    .length,
  movingOut: residents.filter(
    (resident) => resident.statusLabel === "Moving Out",
  ).length,
});

export const buildWorkspaceRoomQuery = async ({ dbUser, requestedBranch }) => {
  if (
    requestedBranch &&
    requestedBranch !== "all" &&
    !ROOM_BRANCHES.includes(requestedBranch)
  ) {
    throw new AppError(
      `Invalid branch. Must be one of: ${ROOM_BRANCHES.join(", ")}`,
      400,
      "INVALID_BRANCH",
    );
  }

  if (dbUser.role === "branch_admin") {
    return { branch: dbUser.branch };
  }

  if (requestedBranch && requestedBranch !== "all") {
    return { branch: requestedBranch };
  }

  return {};
};

export const getTenantWorkspaceReservations = async ({ roomQuery }) => {
  const roomIds = await Room.find(roomQuery).distinct("_id");
  return Reservation.find({
    status: { $in: reservationStatusesForQuery("moveIn", "moveOut") },
    roomId: { $in: roomIds },
    isArchived: { $ne: true },
  })
    .select(TENANT_WORKSPACE_FIELDS)
    .populate(...TENANT_WORKSPACE_USER)
    .populate(...TENANT_WORKSPACE_ROOM)
    .sort({ updatedAt: -1, moveInDate: -1 })
    .lean();
};

export const buildWorkspaceEntries = async (reservations, now = new Date()) => {
  const visibleReservations = reservations.filter((reservation) => {
    const tenantUser = reservation?.userId;
    // Guard: skip orphaned reservations whose User document no longer exists.
    // `.populate()` returns null when the referenced document is missing.
    if (!tenantUser || !tenantUser._id) return false;
    return tenantUser.role === "tenant";
  });

  const reservationIds = visibleReservations.map((reservation) => reservation._id);
  const tenantIds = visibleReservations
    .map((reservation) => reservation.userId?._id || reservation.userId)
    .filter(Boolean);
  const branchSet = [
    ...new Set(
      visibleReservations
        .map((reservation) => reservation.roomId?.branch)
        .filter(Boolean),
    ),
  ];
  // Several controller unit suites intentionally exercise this helper with
  // model doubles and no database connection. Do not let newly-added optional
  // workspace enrichment turn those read-only tests into buffered Mongo calls.
  const canLoadTransferLifecycle =
    ScheduledRoomTransfer.db?.readyState === 1 &&
    TenantTransferRequest.db?.readyState === 1;

  const [
    bills,
    bedHistoryRecords,
    stays,
    branchRooms,
    contracts,
    violations,
    scheduledTransfers,
    transferRequests,
  ] = await Promise.all([
    Bill.find({
      reservationId: { $in: reservationIds },
      isArchived: { $ne: true },
    }).lean(),
    BedHistory.find({
      $or: [
        { reservationId: { $in: reservationIds } },
        { tenantId: { $in: tenantIds } },
      ],
    })
      .populate("roomId", "name branch")
      .sort({ moveInDate: -1 })
      .lean(),
    Stay.find({
      reservationId: { $in: reservationIds },
    })
      .sort({ leaseStartDate: -1, createdAt: -1 })
      .lean(),
    Room.find({
      branch: { $in: branchSet },
      isArchived: { $ne: true },
    })
      .select("branch _id beds")
      .lean(),
    Contract.find({
      $or: [
        { reservationId: { $in: reservationIds } },
        { tenantId: { $in: tenantIds } },
      ],
    })
      .sort({ version: -1, createdAt: -1 })
      .lean(),
    TenantViolation.find({
      $or: [
        { reservationId: { $in: reservationIds } },
        { tenantId: { $in: tenantIds } },
      ],
      status: { $nin: ["dismissed", "resolved"] },
    })
      .sort({ dateOfIncident: -1, createdAt: -1 })
      .lean(),
    canLoadTransferLifecycle
      ? ScheduledRoomTransfer.find({
          reservationId: { $in: reservationIds },
          isArchived: { $ne: true },
        }).sort({ scheduledAt: -1, createdAt: -1 })
      : Promise.resolve([]),
    canLoadTransferLifecycle
      ? TenantTransferRequest.find({ reservationId: { $in: reservationIds } })
          .populate("tenantId", "firstName lastName name fullName email")
          .populate("preferredRoomId", "name roomNumber type branch")
          .sort({ submittedAt: -1, createdAt: -1 })
      : Promise.resolve([]),
  ]);

  const billsByReservationId = new Map();
  for (const bill of bills) {
    const key = String(bill.reservationId || "");
    if (!key) continue;
    if (!billsByReservationId.has(key)) billsByReservationId.set(key, []);
    billsByReservationId.get(key).push(bill);
  }

  const historyByReservationId = new Map();
  const historyByTenantId = new Map();
  const staysByReservationId = new Map();
  const contractsByReservationId = new Map();
  const contractsByTenantId = new Map();
  const violationsByReservationId = new Map();
  const violationsByTenantId = new Map();
  const branchAvailability = new Map();
  const scheduledTransfersByReservationId = new Map();
  const transferRequestByReservationId = new Map();

  for (const transfer of scheduledTransfers) {
    const key = String(transfer.reservationId || "");
    if (!key) continue;
    if (!scheduledTransfersByReservationId.has(key)) scheduledTransfersByReservationId.set(key, []);
    scheduledTransfersByReservationId.get(key).push(transfer);
  }

  for (const request of transferRequests) {
    const key = String(request.reservationId || "");
    if (!key || transferRequestByReservationId.has(key)) continue;
    transferRequestByReservationId.set(key, request);
  }

  for (const violation of (violations || [])) {
    if (violation.reservationId) {
      const resKey = String(violation.reservationId);
      if (!violationsByReservationId.has(resKey)) violationsByReservationId.set(resKey, []);
      violationsByReservationId.get(resKey).push(violation);
    }
    if (violation.tenantId) {
      const tenantKey = String(violation.tenantId);
      if (!violationsByTenantId.has(tenantKey)) violationsByTenantId.set(tenantKey, []);
      violationsByTenantId.get(tenantKey).push(violation);
    }
  }

  for (const contract of contracts) {
    if (contract.reservationId) {
      const resKey = String(contract.reservationId);
      if (!contractsByReservationId.has(resKey)) contractsByReservationId.set(resKey, []);
      contractsByReservationId.get(resKey).push(contract);
    }
    if (contract.tenantId) {
      const tenantKey = String(contract.tenantId);
      if (!contractsByTenantId.has(tenantKey)) contractsByTenantId.set(tenantKey, []);
      contractsByTenantId.get(tenantKey).push(contract);
    }
  }

  for (const record of bedHistoryRecords) {
    if (record.reservationId) {
      const reservationKey = String(record.reservationId);
      if (!historyByReservationId.has(reservationKey)) {
        historyByReservationId.set(reservationKey, []);
      }
      historyByReservationId.get(reservationKey).push(record);
    }

    if (record.tenantId) {
      const tenantKey = String(record.tenantId);
      if (!historyByTenantId.has(tenantKey)) {
        historyByTenantId.set(tenantKey, []);
      }
      historyByTenantId.get(tenantKey).push(record);
    }
  }

  for (const stay of stays) {
    const key = String(stay.reservationId || "");
    if (!key) continue;
    if (!staysByReservationId.has(key)) staysByReservationId.set(key, []);
    staysByReservationId.get(key).push(stay);
  }

  for (const room of branchRooms) {
    const branchKey = String(room.branch || "").toLowerCase();
    if (!branchKey) continue;
    const bedIds = (room.beds || [])
      .filter((bed) => bed?.status === "available")
      .map((bed) => String(bed._id));
    if (!branchAvailability.has(branchKey)) {
      branchAvailability.set(branchKey, []);
    }
    branchAvailability.get(branchKey).push({
      roomId: String(room._id),
      bedIds,
    });
  }

  return Promise.all(visibleReservations.map(async (reservation) => {
    const reservationKey = String(reservation._id);
    const tenantKey = String(reservation.userId?._id || reservation.userId || "");
    const stayHistory = staysByReservationId.get(reservationKey) || [];
    const currentStay = stayHistory[0] || null;
    const branchKey = String(reservation.roomId?.branch || "").toLowerCase();
    const branchRoomsForReservation = branchAvailability.get(branchKey) || [];
    const hasAvailableBedsInBranch = branchRoomsForReservation.some(
      (room) =>
        room.bedIds.length > 0 &&
        (room.roomId !== String(currentStay?.roomId || reservation.roomId?._id || "") ||
          room.bedIds.some((bedId) => String(bedId) !== String(currentStay?.bedId || reservation.selectedBed?.id || ""))),
    );
    const rawTransferRequest = transferRequestByReservationId.get(reservationKey) || null;
    const canonicalTransfer = await resolveTenantTransferLifecycleRecords({
      reservationId: reservation._id,
      request: rawTransferRequest,
      scheduledTransfers: scheduledTransfersByReservationId.get(reservationKey) || [],
    });
    const scheduledRoomTransfer = canonicalTransfer.scheduledTransfer &&
      ["scheduled", "action_required"].includes(
        canonicalTransfer.scheduledTransfer.recordStatus || canonicalTransfer.scheduledTransfer.status,
      )
      ? await serializeScheduledRoomTransfer(canonicalTransfer.scheduledTransfer)
      : null;
    const tenantTransferRequest = canonicalTransfer.request
      ? await serializeTenantTransferRequest(canonicalTransfer.request, {
          scheduledTransfer: canonicalTransfer.scheduledTransfer,
          admin: true,
        })
      : null;
    return buildTenantWorkspaceEntry({
      reservation,
      currentStay,
      stayHistory,
      bills: billsByReservationId.get(reservationKey) || [],
      bedHistoryRecords:
        historyByReservationId.get(reservationKey) ||
        historyByTenantId.get(tenantKey) ||
        [],
      contracts:
        contractsByReservationId.get(reservationKey) ||
        contractsByTenantId.get(tenantKey) ||
        [],
      violations:
        violationsByReservationId.get(reservationKey) ||
        violationsByTenantId.get(tenantKey) ||
        [],
      tenantStatus: reservation.userId?.tenantStatus || "applicant",
      hasAvailableBedsInBranch,
      scheduledRoomTransfer,
      tenantTransferRequest,
      now,
    });
  }));
};

/* ── Cached user lookup ── */
const userCache = new Map();
const USER_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export const findDbUser = async (uid) => {
  const cached = userCache.get(uid);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) return cached.user;
  const user = await User.findOne({ firebaseUid: uid });
  if (user) userCache.set(uid, { user, ts: Date.now() });
  if (userCache.size > 200) {
    const oldest = userCache.keys().next().value;
    userCache.delete(oldest);
  }
  return user;
};

export const invalidateUserCache = (uid) => userCache.delete(uid);

export const buildActorDisplayName = (user, fallbackEmail = "") => {
  const fullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  return fullName || user?.email || fallbackEmail || "Admin";
};

export const normalizeVisitManagementNote = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > MAX_VISIT_MANAGEMENT_NOTE_LENGTH) {
    const error = new Error(
      `Visit remarks must be ${MAX_VISIT_MANAGEMENT_NOTE_LENGTH} characters or fewer.`,
    );
    error.statusCode = 400;
    error.code = "VISIT_NOTE_TOO_LONG";
    throw error;
  }
  return normalized;
};

export const hasPhysicalVisitPreference = (reservation) => {
  const obj = typeof reservation?.toObject === "function" ? reservation.toObject() : reservation;
  return (
    (reservation?.viewingPreference ?? obj?.viewingPreference) === "physical_visit" ||
    (reservation?.viewingType ?? obj?.viewingType) === "inperson" ||
    Boolean(reservation?.visitDate ?? obj?.visitDate)
  );
};

export const appendVisitHistoryEntry = ({
  reservation,
  status,
  actorId = null,
  actorName = "",
  note = "",
  updatedAt = new Date(),
  visitDate = null,
  visitTime = "",
  rescheduledToDate = null,
  rescheduledToTime = "",
}) => {
  if (!reservation.visitHistory) reservation.visitHistory = [];
  reservation.visitHistory.push({
    visitDate: visitDate || reservation.visitDate || null,
    visitTime: visitTime || reservation.visitTime || "",
    viewingType: reservation.viewingType || "inperson",
    status,
    notes: note || "",
    scheduledAt: reservation.visitScheduledAt || reservation.createdAt || updatedAt,
    updatedAt,
    updatedBy: actorId || null,
    updatedByName: actorName || "",
    rescheduledToDate: rescheduledToDate || null,
    rescheduledToTime: rescheduledToTime || "",
  });
};

export const applyVisitOutcome = ({
  reservation,
  status,
  actorId = null,
  actorName = "",
  note = "",
  updatedAt = new Date(),
}) => {
  reservation.visitStatus = status;
  reservation.visitOutcomeNotes = note;
  reservation.visitOutcomeUpdatedAt = updatedAt;
  reservation.visitOutcomeUpdatedBy = actorId || null;
  reservation.visitOutcomeUpdatedByName = actorName || "";
  if (reservation._doc) {
    reservation._doc.visitStatus = status;
    reservation._doc.visitOutcomeNotes = note;
    reservation._doc.visitOutcomeUpdatedAt = updatedAt;
    reservation._doc.visitOutcomeUpdatedBy = actorId || null;
    reservation._doc.visitOutcomeUpdatedByName = actorName || "";
  }
};

export const normalizeVisitStatusKey = (value) => {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  const canonical = VISIT_STATUS_ALIASES[normalized] || normalized;
  return VISIT_OUTCOME_STATUSES.includes(canonical) ? canonical : "";
};

export const isVisitApplicationUnlocked = (visitStatusOrReservation) => {
  if (typeof visitStatusOrReservation === "object" && visitStatusOrReservation !== null) {
    if (visitStatusOrReservation.isOutOfTown === true && visitStatusOrReservation.isOutOfTownApproved === true) {
      return true;
    }
    const visitStatus = getEffectiveVisitStatusKey(visitStatusOrReservation);
    return VISIT_APPLICATION_UNLOCK_STATUSES.includes(normalizeVisitStatusKey(visitStatus));
  }
  return VISIT_APPLICATION_UNLOCK_STATUSES.includes(normalizeVisitStatusKey(visitStatusOrReservation));
};

export const getEffectiveVisitStatusKey = (reservation = {}) => {
  const obj = typeof reservation?.toObject === "function" ? reservation.toObject() : reservation;
  const visitStatus = reservation.visitStatus ?? obj.visitStatus;
  const visitApproved = reservation.visitApproved ?? obj.visitApproved;
  const scheduleRejected = reservation.scheduleRejected ?? obj.scheduleRejected;
  const scheduleApproved = reservation.scheduleApproved ?? obj.scheduleApproved;

  const explicit = normalizeVisitStatusKey(visitStatus);
  if (VISIT_APPLICATION_LOCK_STATUSES.includes(explicit)) return explicit;
  if (isVisitApplicationUnlocked(explicit)) return explicit;
  if (visitApproved) return "visit_completed";
  if (explicit) return explicit;
  if (scheduleRejected) return "visit_cancelled";
  if (scheduleApproved) return "schedule_approved";
  if (hasPhysicalVisitPreference(reservation)) return "physical_visit_scheduled";
  return "";
};

export const visitTransitionError = (error, code = "INVALID_VISIT_STATUS_TRANSITION") => ({
  ok: false,
  status: 409,
  code,
  error,
});

export const validateVisitManagementAction = (reservation, action) => {
  if (!hasPhysicalVisitPreference(reservation)) {
    return visitTransitionError(
      "Physical visit management is not applicable for this reservation.",
      "VISIT_MANAGEMENT_NOT_APPLICABLE",
    );
  }

  const currentStatus = getEffectiveVisitStatusKey(reservation);
  const allowedActions =
    VISIT_MANAGEMENT_ACTIONS_BY_STATUS[currentStatus] ||
    VISIT_MANAGEMENT_ACTIONS_BY_STATUS.physical_visit_scheduled;

  if (allowedActions.includes(action)) {
    return { ok: true, currentStatus };
  }

  if (currentStatus === "visit_completed") {
    return visitTransitionError(
      "Visit is already completed and cannot be changed.",
      "VISIT_ALREADY_COMPLETED",
    );
  }

  if (currentStatus === "no_show" && action === "mark_visited") {
    return visitTransitionError(
      "Visit is already marked as no-show. Reschedule the visit or allow the applicant to proceed without a visit.",
    );
  }

  if (currentStatus === "visit_cancelled" && action !== "reschedule") {
    return visitTransitionError(
      "Visit schedule is already cancelled. Reschedule the visit before recording an outcome.",
    );
  }

  if (currentStatus === "allowed_without_visit") {
    return visitTransitionError(
      "Applicant has already been allowed to proceed without a visit.",
    );
  }

  return visitTransitionError("This visit action is not valid for the current visit status.");
};

export const validateDirectVisitUpdate = (reservation, body = {}) => {
  const visitFields = [
    "visitStatus",
    "visitApproved",
    "scheduleApproved",
    "scheduleRejected",
    "visitDate",
    "visitTime",
  ];
  if (!visitFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    return { ok: true };
  }

  const currentStatus = getEffectiveVisitStatusKey(reservation);
  const nextStatus =
    Object.prototype.hasOwnProperty.call(body, "visitStatus")
      ? normalizeVisitStatusKey(body.visitStatus)
      : currentStatus;

  if (
    body.visitStatus !== undefined &&
    body.visitStatus !== null &&
    body.visitStatus !== "" &&
    !nextStatus
  ) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_VISIT_STATUS",
      error: "Invalid visit status.",
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, "visitStatus")) {
    body.visitStatus = nextStatus || null;
  }

  const changesCompletedVisit =
    currentStatus === "visit_completed" &&
    ((Object.prototype.hasOwnProperty.call(body, "visitStatus") &&
      nextStatus !== "visit_completed") ||
      body.visitApproved === false ||
      body.scheduleRejected === true ||
      Object.prototype.hasOwnProperty.call(body, "visitDate") ||
      Object.prototype.hasOwnProperty.call(body, "visitTime"));

  if (changesCompletedVisit) {
    return visitTransitionError(
      "Visit is already completed and cannot be changed.",
      "VISIT_ALREADY_COMPLETED",
    );
  }

  if (
    currentStatus === "no_show" &&
    (nextStatus === "visit_completed" || body.visitApproved === true)
  ) {
    return visitTransitionError(
      "Visit is already marked as no-show. Reschedule the visit before recording a completed outcome.",
    );
  }

  if (
    currentStatus === "visit_cancelled" &&
    (nextStatus === "visit_completed" ||
      nextStatus === "no_show" ||
      body.visitApproved === true)
  ) {
    return visitTransitionError(
      "Visit schedule is already cancelled. Reschedule the visit before recording an outcome.",
    );
  }

  return { ok: true };
};

export const buildVisitEmailContext = ({
  reservation,
  status,
  previousVisitDate = null,
  previousVisitTime = "",
  note = "",
}) => {
  const usePreviousSchedule =
    status === "visit_cancelled" &&
    !reservation.visitDate &&
    (previousVisitDate || previousVisitTime);

  const isRescheduled = status === "rescheduled";

  return {
    to: reservation.userId?.email || "",
    tenantName:
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
      reservation.userId?.email ||
      "Applicant",
    roomName:
      reservation.roomId?.roomNumber ||
      reservation.roomId?.name ||
      reservation.roomName ||
      "your room",
    branchName: reservation.roomId?.branch || reservation.branch || "Lilycrest",
    visitCode: reservation.visitCode || "",
    visitDate: usePreviousSchedule ? previousVisitDate : reservation.visitDate || null,
    visitTime: usePreviousSchedule ? previousVisitTime : reservation.visitTime || "",
    previousVisitDate: isRescheduled ? previousVisitDate : null,
    previousVisitTime: isRescheduled ? previousVisitTime : "",
    remarks: note || "",
    status,
  };
};

export const buildVisitAvailabilityActor = (req, dbUser) => ({
  userId: dbUser?._id ? String(dbUser._id) : req?.user?.uid || null,
  email: dbUser?.email || req?.user?.email || "",
  role: dbUser?.role || req?.user?.role || "",
});

export const resolveVisitAvailabilityBranch = (req, dbUser, fallbackBranch = "") => {
  const requestedBranch = normalizeVisitBranch(
    req.query.branch || req.body.branch || fallbackBranch,
  );

  if (!requestedBranch) {
    return { error: "A valid branch is required.", code: "INVALID_BRANCH" };
  }

  if (dbUser?.role === "branch_admin" && requestedBranch !== dbUser.branch) {
    return {
      error: `Access denied. You can only manage ${dbUser.branch} branch availability.`,
      code: "BRANCH_ACCESS_DENIED",
    };
  }

  return { branch: requestedBranch };
};
