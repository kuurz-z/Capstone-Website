/**
 * ============================================================================
 * RESERVATION HELPERS
 * ============================================================================
 *
 * Shared utilities extracted from reservationsController to eliminate
 * ~200 lines of duplicated validation, error handling, and field mapping.
 */

import dayjs from "dayjs";
import { User, Room, Reservation } from "../models/index.js";
import {
  hasReservationStatus,
  normalizeReservationStatus,
  reservationStatusesForQuery,
} from "./lifecycleNaming.js";

/** Validate MongoDB ObjectId format */
export const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

/** Standardised 400 response for bad ObjectId */
export const invalidIdResponse = (res) =>
  res
    .status(400)
    .json({
      error: "Invalid reservation ID format",
      code: "INVALID_RESERVATION_ID",
    });

/** Standardised error response handler */
export const handleReservationError = (res, error, action = "process") => {
  if (error.name === "ValidationError") {
    const validationErrors = {};
    Object.keys(error.errors).forEach((f) => {
      validationErrors[f] = error.errors[f].message;
    });
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details: error.message,
        validationErrors,
        code: "VALIDATION_ERROR",
      });
  }
  if (error.name === "CastError") {
    return res
      .status(400)
      .json({
        error: "Invalid ID format",
        details: error.message,
        code: "INVALID_ID_FORMAT",
      });
  }
  return res
    .status(500)
    .json({
      error: `Failed to ${action} reservation`,
      details: error.message,
      code: `${action.toUpperCase().replace(/ /g, "_")}_RESERVATION_ERROR`,
    });
};

/** Check branch access — returns error response if denied, null if OK */
export const checkBranchAccess = (res, branchFilter, roomBranch) => {
  if (branchFilter && roomBranch !== branchFilter) {
    return res.status(403).json({
      error: `Access denied. You can only manage reservations for ${branchFilter} branch.`,
      code: "BRANCH_ACCESS_DENIED",
    });
  }
  return null;
};

/** Enforce 3-month move-in date window */
export const validateMoveInDate = (dateStr) => {
  const moveIn = dayjs(dateStr);
  const now = dayjs();
  const limit = now.add(3, "month");
  return moveIn.isAfter(now) || moveIn.isSame(now, "day") ? moveIn.isBefore(limit) || moveIn.isSame(limit, "day") : false;
};

/**
 * Validate check-in prerequisites against the existing reservation document.
 * Returns an array of human-readable failure reasons (empty = all clear).
 *
 * Rules:
 *  1. Current status must be exactly "reserved" — no skipping the queue.
 *  2. Payment must be confirmed (paymentStatus === "paid").
 *  3. A site visit must have been approved — UNLESS the tenant is flagged
 *     as out-of-town and has previously received visitApproved via admin.
 */
export const getCheckinBlockers = (reservation) => {
  const blockers = [];

  if (!hasReservationStatus(reservation.status, "reserved")) {
    blockers.push(
      `Reservation must be in "Reserved" state before move-in (currently "${normalizeReservationStatus(reservation.status)}").`
    );
  }

  if (reservation.paymentStatus !== "paid") {
    blockers.push(
      "Payment must be confirmed (status: Paid) before move-in."
    );
  }

  const visitWaived = reservation.isOutOfTown === true;
  if (!reservation.visitApproved && !visitWaived) {
    blockers.push(
      "Site visit must be completed and approved by admin before move-in."
    );
  }

  return blockers;
};

/**
 * Handle status transitions (reserved / moveIn / cancelled).
 * Centralises ~55 lines duplicated in updateReservation, releaseSlot, archiveReservation.
 *
 * Also syncs Firebase Custom Claims so the user's token reflects
 * the new role immediately (no re-login required).
 */
export const handleStatusTransition = async (
  newStatus,
  oldStatus,
  userId,
  roomId,
) => {
  const normalizedNewStatus = normalizeReservationStatus(newStatus);
  const normalizedOldStatus = normalizeReservationStatus(oldStatus);

  if (normalizedNewStatus === normalizedOldStatus) return;
  const user = await User.findById(userId);
  if (!user) return;

  // Helper: sync Firebase custom claims (non-fatal if it fails)
  const syncFirebaseClaims = async (claims) => {
    try {
      const { getAuth } = await import("../config/firebase.js");
      const auth = getAuth();
      if (auth && user.firebaseUid) {
        await auth.setCustomUserClaims(user.firebaseUid, claims);
      }
    } catch (e) {
      console.error("⚠️ Firebase claims sync failed (non-fatal):", e.message);
    }
  };

  if (
    normalizedNewStatus === "reserved" &&
    normalizedOldStatus !== "reserved"
  ) {
    // Reservation state is tracked in Reservation model, not on User.
    // Only set branch from room so user is associated with correct branch.
    const room = await Room.findById(roomId);
    if (room) user.branch = room.branch;
    await user.save();
    await syncFirebaseClaims({ role: "applicant", tenantStatus: "none" });
  }

  if (normalizedNewStatus === "moveIn" && normalizedOldStatus !== "moveIn") {
    user.role = "tenant";
    user.tenantStatus = "active";
    await user.save();
    await syncFirebaseClaims({ role: "tenant", tenantStatus: "active" });
  }

  if (
    normalizedNewStatus === "cancelled" &&
    normalizedOldStatus !== "cancelled" &&
    user.role === "applicant"
  ) {
    user.tenantStatus = "none";
    user.branch = null;
    await user.save();
    await syncFirebaseClaims({ role: "applicant", tenantStatus: "none" });
  }
};

const syncFirebaseLifecycleClaims = async (user, claims) => {
  try {
    const { getAuth } = await import("../config/firebase.js");
    const auth = getAuth();
    if (auth && user.firebaseUid) {
      await auth.setCustomUserClaims(user.firebaseUid, claims);
    }
  } catch (e) {
    console.error("Firebase claims sync failed (non-fatal):", e.message);
  }
};

const getRoomBranch = async (roomId) => {
  if (!roomId) return null;
  const room = await Room.findById(roomId).select("branch");
  return room?.branch || null;
};

const getFallbackLifecycleState = async (userId, excludedReservationId) => {
  const findLatestReservation = async (status) =>
    Reservation.findOne({
      userId,
      _id: { $ne: excludedReservationId },
      status: { $in: reservationStatusesForQuery(status) },
      isArchived: { $ne: true },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate("roomId", "branch");

  const checkedInReservation = await findLatestReservation("moveIn");
  if (checkedInReservation) {
    return {
      role: "tenant",
      tenantStatus: "active",
      branch: checkedInReservation.roomId?.branch || null,
    };
  }

  const reservedReservation = await findLatestReservation("reserved");
  if (reservedReservation) {
    return {
      role: "applicant",
      tenantStatus: "none",
      branch: reservedReservation.roomId?.branch || null,
    };
  }

  const checkedOutReservation = await findLatestReservation("moveOut");
  if (checkedOutReservation) {
    return {
      role: "applicant",
      tenantStatus: "inactive",
      branch: checkedOutReservation.roomId?.branch || null,
    };
  }

  return {
    role: "applicant",
    tenantStatus: "none",
    branch: null,
  };
};

export const resolveReservationLifecycleState = async ({
  status,
  roomId,
  userId,
  reservationId,
}) => {
  switch (normalizeReservationStatus(status)) {
    case "reserved":
      return {
        role: "applicant",
        tenantStatus: "none",
        branch: await getRoomBranch(roomId),
      };
    case "moveIn":
      return {
        role: "tenant",
        tenantStatus: "active",
        branch: await getRoomBranch(roomId),
      };
    case "moveOut":
      return {
        role: "applicant",
        tenantStatus: "inactive",
        branch: await getRoomBranch(roomId),
      };
    case "cancelled":
    case "archived":
      return getFallbackLifecycleState(userId, reservationId);
    default:
      return null;
  }
};

export const syncReservationUserLifecycle = async ({
  status,
  previousStatus,
  userId,
  roomId,
  reservationId,
  force = false,
}) => {
  const normalizedStatus = normalizeReservationStatus(status);
  const normalizedPreviousStatus = normalizeReservationStatus(previousStatus);

  if (normalizedStatus === normalizedPreviousStatus && !force) return;

  const user = await User.findById(userId);
  if (!user) return;

  const nextState = await resolveReservationLifecycleState({
    status: normalizedStatus,
    roomId,
    userId,
    reservationId,
  });
  if (!nextState) return;

  user.role = nextState.role;
  user.tenantStatus = nextState.tenantStatus;
  user.branch = nextState.branch;
  await user.save();
  await syncFirebaseLifecycleClaims(user, {
    role: nextState.role,
    tenantStatus: nextState.tenantStatus,
  });
};

/**
 * Flat field mapping for user self-updates (updateReservationByUser).
 * These are direct body→reservation field copies. Nested fields handled separately.
 */
export const USER_UPDATE_FLAT_FIELDS = [
  "selectedBed",
  "roomId",
  "targetMoveInDate",
  "leaseDuration",
  "billingEmail",
  "roomConfirmed",
  "viewingType",
  "visitDate",
  "visitTime",
  "visitScheduledAt",
  "isOutOfTown",
  "currentLocation",
  "visitApproved",
  "selfiePhotoUrl",
  "firstName",
  "lastName",
  "middleName",
  "nickname",
  "mobileNumber",
  "birthday",
  "maritalStatus",
  "nationality",
  "educationLevel",
  "validIDFrontUrl",
  "validIDBackUrl",
  "validIDType",
  "nbiClearanceUrl",
  "nbiReason",
  "companyIDUrl",
  "companyIDReason",
  "personalNotes",
  "healthConcerns",
  "preferredRoomNumber",
  "referralSource",
  "referrerName",
  "estimatedMoveInTime",
  "workSchedule",
  "workScheduleOther",
  "agreedToPrivacy",
  "agreedToCertification",
  "finalMoveInDate",
  "paymentMethod",
  "proofOfPaymentUrl",
  "moveInDate",
  "moveOutDate",
  "totalPrice",
  "applianceFees",
  "notes",
];

/** Maps for body fields that target nested doc paths */
export const USER_UPDATE_NESTED_FIELDS = {
  // address.*
  addressRegion: "address.region",
  addressUnitHouseNo: "address.unitHouseNo",
  addressStreet: "address.street",
  addressBarangay: "address.barangay",
  addressCity: "address.city",
  addressProvince: "address.province",
  // emergencyContact.*
  emergencyContactName: "emergencyContact.name",
  emergencyRelationship: "emergencyContact.relationship",
  emergencyContactNumber: "emergencyContact.contactNumber",
  // employment.*
  employerSchool: "employment.employerSchool",
  employerAddress: "employment.employerAddress",
  employerContact: "employment.employerContact",
  startDate: "employment.startDate",
  occupation: "employment.occupation",
  previousEmployment: "employment.previousEmployment",
};

/** Additional body→field rename mapping (body key differs from schema key) */
export const USER_UPDATE_RENAMES = {
  roomType: "preferredRoomType",
};

/**
 * Build the $set update object from req.body using the config arrays above.
 * Replaces ~50 manual setField() calls.
 */
export const buildUserUpdatePayload = (body) => {
  const updates = {};

  // Flat fields
  for (const key of USER_UPDATE_FLAT_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Renamed fields
  for (const [bodyKey, schemaKey] of Object.entries(USER_UPDATE_RENAMES)) {
    if (body[bodyKey] !== undefined) updates[schemaKey] = body[bodyKey];
  }

  // Nested fields
  for (const [bodyKey, path] of Object.entries(USER_UPDATE_NESTED_FIELDS)) {
    if (body[bodyKey] !== undefined) updates[path] = body[bodyKey];
  }

  return updates;
};
