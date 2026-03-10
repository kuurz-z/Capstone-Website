/**
 * ============================================================================
 * RESERVATION HELPERS
 * ============================================================================
 *
 * Shared utilities extracted from reservationsController to eliminate
 * ~200 lines of duplicated validation, error handling, and field mapping.
 */

import { User, Room } from "../models/index.js";

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
  const moveIn = new Date(dateStr);
  const now = new Date();
  const limit = new Date(now);
  limit.setMonth(now.getMonth() + 3);
  return moveIn >= now && moveIn <= limit;
};

/**
 * Handle status transitions (confirmed / checked-in / cancelled).
 * Centralises ~55 lines duplicated in updateReservation, releaseSlot, archiveReservation.
 */
export const handleStatusTransition = async (
  newStatus,
  oldStatus,
  userId,
  roomId,
) => {
  if (newStatus === oldStatus) return;
  const user = await User.findById(userId);
  if (!user) return;

  if (newStatus === "confirmed" && oldStatus !== "confirmed") {
    const room = await Room.findById(roomId);
    user.tenantStatus = "reserved";
    if (room) user.branch = room.branch;
    await user.save();
    console.log(
      `✅ User ${user.email} → tenantStatus: reserved, branch: ${user.branch}`,
    );
  }

  if (newStatus === "checked-in" && oldStatus !== "checked-in") {
    user.role = "tenant";
    user.tenantStatus = "active";
    await user.save();
    console.log(`✅ User ${user.email} → role: tenant, tenantStatus: active`);
  }

  if (
    newStatus === "cancelled" &&
    oldStatus !== "cancelled" &&
    user.role === "applicant"
  ) {
    user.tenantStatus = null;
    user.branch = null;
    await user.save();
    console.log(
      `✅ User ${user.email} → tenantStatus: null, branch: null (cancelled)`,
    );
  }
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
  "checkInDate",
  "checkOutDate",
  "totalPrice",
  "applianceFees",
  "notes",
];

/** Maps for body fields that target nested doc paths */
export const USER_UPDATE_NESTED_FIELDS = {
  // address.*
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
