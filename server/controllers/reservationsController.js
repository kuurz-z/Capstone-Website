/**
 * ============================================================================
 * RESERVATION CONTROLLERS
 * ============================================================================
 *
 * Refactored to use shared helpers from reservationHelpers.js.
 * Eliminates ~200 lines of duplicated validation, error handling, and field mapping.
 */

import { Reservation, User, Room } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";
import {
  isValidObjectId,
  invalidIdResponse,
  handleReservationError,
  checkBranchAccess,
  validateMoveInDate,
  handleStatusTransition,
  buildUserUpdatePayload,
} from "../utils/reservationHelpers.js";
import { sendReservationConfirmedEmail, sendVisitApprovedEmail } from "../config/email.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";

/* ─── helpers ────────────────────────────────────── */
const HEAVY_FIELDS =
  "-selfiePhotoUrl -validIDFrontUrl -validIDBackUrl -nbiClearanceUrl -companyIDUrl -__v";
const POPULATE_USER = ["userId", "firstName lastName email"];
const POPULATE_ROOM = ["roomId", "name branch type price"];

/* ── Cached user lookup (saves ~50-100ms per API call) ──── */
const userCache = new Map();
const USER_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const findDbUser = async (uid) => {
  const cached = userCache.get(uid);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) return cached.user;
  const user = await User.findOne({ firebaseUid: uid });
  if (user) userCache.set(uid, { user, ts: Date.now() });
  // Evict if too large
  if (userCache.size > 200) {
    const oldest = userCache.keys().next().value;
    userCache.delete(oldest);
  }
  return user;
};

/** Invalidate a cached user entry (call when user data changes) */
export const invalidateUserCache = (uid) => userCache.delete(uid);

/* ─── GET all reservations ───────────────────────── */
export const getReservations = async (req, res, next) => {
  try {
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });

    let query;
    if (dbUser.role === "superAdmin") {
      query = { isArchived: { $ne: true } };
    } else if (dbUser.role === "admin") {
      const roomIds = (
        await Room.find({ branch: dbUser.branch }).select("_id")
      ).map((r) => r._id);
      query = { roomId: { $in: roomIds }, isArchived: { $ne: true } };
    } else {
      query = { userId: dbUser._id, isArchived: { $ne: true } };
    }

    const reservations = await Reservation.find(query)
      .populate(...POPULATE_USER)
      .populate(...POPULATE_ROOM)
      .select(HEAVY_FIELDS)
      .sort({ createdAt: -1 });

    res.json(reservations);
  } catch (error) {
    console.error("❌ Fetch reservations error:", error);
    handleReservationError(res, error, "fetch");
  }
};

/* ─── GET single reservation ─────────────────────── */
export const getReservationById = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId)
      .populate(...POPULATE_USER)
      .populate("roomId", "name branch type price floor");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    if (
      dbUser.role !== "admin" &&
      dbUser.role !== "superAdmin" &&
      String(reservation.userId?._id) !== String(dbUser._id)
    ) {
      return res.status(403).json({
        error: "Access denied. You can only view your own reservations.",
        code: "RESERVATION_ACCESS_DENIED",
      });
    }

    res.json(reservation);
  } catch (error) {
    console.error("❌ Fetch reservation error:", error);
    handleReservationError(res, error, "fetch");
  }
};

/* ─── CREATE reservation ─────────────────────────── */
export const createReservation = async (req, res, next) => {
  try {
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res.status(404).json({
        error:
          "User not found in database. Please complete registration first.",
        code: "USER_NOT_FOUND",
      });

    // Single reservation enforcement
    const existingActive = await Reservation.findOne({
      userId: dbUser._id,
      status: { $nin: ["cancelled", "archived"] },
      isArchived: { $ne: true },
    });
    if (existingActive)
      return res.status(400).json({
        error:
          "You already have an active reservation. Please complete or cancel it before creating a new one.",
        code: "RESERVATION_ALREADY_EXISTS",
        existingReservationId: existingActive._id,
      });

    const { roomId, roomName, checkInDate, totalPrice } = req.body;
    if ((!roomId && !roomName) || !checkInDate || !totalPrice)
      return res.status(400).json({
        error:
          "Missing required fields: roomId or roomName, checkInDate, and totalPrice are required",
        code: "MISSING_REQUIRED_FIELDS",
      });

    // Enforce 3-month window
    if (!validateMoveInDate(checkInDate))
      return res.status(400).json({
        error: "Move-in date must be within 3 months from today.",
        code: "MOVEIN_DATE_OUT_OF_RANGE",
      });

    // Verify room
    const room = roomId
      ? await Room.findById(roomId)
      : await Room.findOne({ name: roomName });
    if (!room)
      return res
        .status(404)
        .json({ error: "Room not found", code: "ROOM_NOT_FOUND" });
    if (room.isArchived)
      return res.status(400).json({
        error: "Room is not available for reservation",
        code: "ROOM_NOT_AVAILABLE",
      });
    if (!room.available)
      return res.status(400).json({
        error: "Room is not available for reservation",
        code: "ROOM_UNAVAILABLE",
      });

    // Create reservation with all form fields
    const b = req.body;
    const reservation = new Reservation({
      userId: dbUser._id,
      roomId: room._id,
      selectedBed: b.selectedBed
        ? {
            id: b.selectedBed.id || null,
            position: b.selectedBed.position || null,
          }
        : null,
      targetMoveInDate: b.targetMoveInDate
        ? new Date(b.targetMoveInDate)
        : null,
      leaseDuration: b.leaseDuration || 12,
      billingEmail: b.billingEmail || dbUser.email,
      viewingType: b.viewingType || null,
      isOutOfTown: b.isOutOfTown || false,
      currentLocation: b.currentLocation || null,
      visitApproved: b.visitApproved === true,
      selfiePhotoUrl: b.selfiePhotoUrl || null,
      firstName: b.firstName || null,
      lastName: b.lastName || null,
      middleName: b.middleName || null,
      nickname: b.nickname || null,
      mobileNumber: b.mobileNumber || null,
      birthday: b.birthday ? new Date(b.birthday) : null,
      maritalStatus: b.maritalStatus || null,
      nationality: b.nationality || null,
      educationLevel: b.educationLevel || null,
      address: {
        unitHouseNo: b.addressUnitHouseNo || null,
        street: b.addressStreet || null,
        barangay: b.addressBarangay || null,
        city: b.addressCity || null,
        province: b.addressProvince || null,
      },
      validIDFrontUrl: b.validIDFrontUrl || null,
      validIDBackUrl: b.validIDBackUrl || null,
      validIDType: b.validIDType || null,
      nbiClearanceUrl: b.nbiClearanceUrl || null,
      nbiReason: b.nbiReason || null,
      companyIDUrl: b.companyIDUrl || null,
      companyIDReason: b.companyIDReason || null,
      emergencyContact: {
        name: b.emergencyContactName || null,
        relationship: b.emergencyRelationship || null,
        contactNumber: b.emergencyContactNumber || null,
      },
      healthConcerns: b.healthConcerns || null,
      employment: {
        employerSchool: b.employerSchool || null,
        employerAddress: b.employerAddress || null,
        employerContact: b.employerContact || null,
        startDate: b.startDate ? new Date(b.startDate) : null,
        occupation: b.occupation || null,
        previousEmployment: b.previousEmployment || null,
      },
      preferredRoomType: b.roomType || null,
      preferredRoomNumber: b.preferredRoomNumber || null,
      referralSource: b.referralSource || null,
      referrerName: b.referrerName || null,
      estimatedMoveInTime: b.estimatedMoveInTime || null,
      workSchedule: b.workSchedule || null,
      workScheduleOther: b.workScheduleOther || null,
      agreedToPrivacy: b.agreedToPrivacy || false,
      agreedToCertification: b.agreedToCertification || false,
      proofOfPaymentUrl: b.proofOfPaymentUrl || null,
      applianceFees: b.applianceFees || 0,
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate || null,
      totalPrice: b.totalPrice,
      notes: b.notes || "",
      status: "pending",
      paymentStatus: "pending",
    });

    await reservation.save();
    await reservation.populate(...POPULATE_USER);
    await reservation.populate(...POPULATE_ROOM);

    await auditLogger.logModification(
      req,
      "reservation",
      reservation._id,
      null,
      reservation.toObject(),
      `Created reservation for room: ${room.name}`,
    );
    res.status(201).json({
      message: "Reservation created successfully",
      reservationId: reservation._id,
      reservationCode: reservation.reservationCode,
      reservation,
    });
  } catch (error) {
    console.error("❌ Create reservation error:", error);
    await auditLogger.logError(req, error, "Failed to create reservation");
    handleReservationError(res, error, "create");
  }
};

/* ─── UPDATE reservation (admin) ─────────────────── */
export const updateReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const existingReservation = await Reservation.findById(
      reservationId,
    ).populate("roomId", "branch");
    if (!existingReservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    const oldData = existingReservation.toObject();
    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      existingReservation.roomId?.branch,
    );
    if (denied) return;

    // Enforce 3-month window on checkInDate update
    if (req.body.checkInDate && !validateMoveInDate(req.body.checkInDate)) {
      return res.status(400).json({
        error: "Move-in date must be within 3 months from today.",
        code: "MOVEIN_DATE_OUT_OF_RANGE",
      });
    }

    // Status transition side-effects
    if (
      req.body.status === "reserved" &&
      existingReservation.status !== "reserved"
    ) {
      req.body.paymentStatus = "paid";
      req.body.approvedDate = new Date();
    }
    await handleStatusTransition(
      req.body.status,
      existingReservation.status,
      existingReservation.userId,
      existingReservation.roomId,
    );

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    // Whitelist admin-allowed fields to prevent mass-assignment
    const ADMIN_ALLOWED = [
      "status", "paymentStatus", "notes", "checkInDate", "checkOutDate",
      "approvedDate", "visitApproved", "documentsApproved",
      "documentRejectionReason", "nbiApproved", "nbiRejectionReason",
      "companyIDApproved", "companyIDRejectionReason",
    ];
    for (const key of ADMIN_ALLOWED) {
      if (req.body[key] !== undefined) reservation[key] = req.body[key];
    }
    const updatedReservation = await reservation.save();

    // Occupancy tracking
    if (oldData.status !== updatedReservation.status) {
      try {
        await updateOccupancyOnReservationChange(updatedReservation, oldData);
      } catch (e) {
        console.error("⚠️ Occupancy update failed (non-fatal):", e);
      }
    }

    await updatedReservation.populate(...POPULATE_USER);
    await updatedReservation.populate(...POPULATE_ROOM);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      updatedReservation.toObject(),
    );
    res.json({
      message: "Reservation updated successfully",
      reservation: updatedReservation,
    });

    // Send confirmation email if status just changed to "reserved"
    if (
      req.body.status === "reserved" &&
      oldData.status !== "reserved" &&
      updatedReservation.userId?.email
    ) {
      try {
        await sendReservationConfirmedEmail({
          to: updatedReservation.userId.email,
          tenantName:
            `${updatedReservation.userId.firstName || ""} ${updatedReservation.userId.lastName || ""}`.trim() ||
            "Tenant",
          reservationCode: updatedReservation.reservationCode || "N/A",
          roomName: updatedReservation.roomId?.name || "N/A",
          branchName: updatedReservation.roomId?.branch || "Lilycrest",
          checkInDate: updatedReservation.checkInDate
            ? new Date(updatedReservation.checkInDate).toLocaleDateString(
                "en-PH",
                { year: "numeric", month: "long", day: "numeric" },
              )
            : "TBD",
        });
      } catch (emailErr) {
        console.error(
          "⚠️ Confirmation email failed (non-fatal):",
          emailErr.message,
        );
      }
    }

    // Send visit-approved email when admin approves a visit
    if (
      req.body.visitApproved === true &&
      !oldData.visitApproved &&
      updatedReservation.userId?.email
    ) {
      try {
        await sendVisitApprovedEmail({
          to: updatedReservation.userId.email,
          tenantName:
            `${updatedReservation.userId.firstName || ""} ${updatedReservation.userId.lastName || ""}`.trim() ||
            "Tenant",
          branchName: updatedReservation.roomId?.branch || "Lilycrest",
        });
      } catch (emailErr) {
        console.error(
          "⚠️ Visit approved email failed (non-fatal):",
          emailErr.message,
        );
      }
    }
  } catch (error) {
    console.error("❌ Update reservation error:", error);
    await auditLogger.logError(req, error, "Failed to update reservation");
    handleReservationError(res, error, "update");
  }
};

/* ─── UPDATE reservation (user self-update) ──────── */
export const updateReservationByUser = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });

    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    if (String(reservation.userId) !== String(dbUser._id))
      return res.status(403).json({
        error: "Access denied. You can only update your own reservation.",
        code: "RESERVATION_ACCESS_DENIED",
      });

    // Build update payload from config-driven field mapping
    const updates = buildUserUpdatePayload(req.body);

    // Payment proof handling
    if (req.body.proofOfPaymentUrl) {
      updates.paymentStatus = "pending";
      updates.paymentDate = new Date();
      const existing = await Reservation.findById(reservationId);
      if (!existing.paymentReference) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let ref = "PAY-";
        for (let i = 0; i < 6; i++)
          ref += chars.charAt(Math.floor(Math.random() * chars.length));
        updates.paymentReference = ref;
      }
    }

    const updatedReservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .populate(...POPULATE_USER)
      .populate(...POPULATE_ROOM);

    res.json({
      message: "Reservation updated successfully",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("❌ User reservation update error:", error);
    handleReservationError(res, error, "update");
  }
};

/* ─── DELETE reservation ─────────────────────────── */
export const deleteReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });

    const reservation =
      await Reservation.findById(reservationId).populate("roomId");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    const isOwner = String(reservation.userId) === String(dbUser._id);
    const isAdmin = dbUser.role === "admin" || dbUser.role === "superAdmin";
    if (!isOwner && !isAdmin)
      return res.status(403).json({
        error: "Access denied. You can only delete your own reservation.",
        code: "RESERVATION_ACCESS_DENIED",
      });
    if (dbUser.role === "admin" && reservation.roomId?.branch !== dbUser.branch)
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${dbUser.branch} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });

    const reservationData = reservation.toObject();

    // Release occupancy
    if (
      reservation.status === "reserved" ||
      reservation.status === "checked-in"
    ) {
      try {
        await updateOccupancyOnReservationChange(
          { ...reservation, status: "cancelled" },
          reservationData,
        );
      } catch (e) {
        console.error("⚠️ Occupancy release during deletion failed:", e);
      }
    }

    await Reservation.findByIdAndDelete(reservationId);
    await auditLogger.logDeletion(
      req,
      "reservation",
      reservationId,
      reservationData,
    );
    res.json({ message: "Reservation deleted successfully", reservationId });
  } catch (error) {
    console.error("❌ Delete reservation error:", error);
    await auditLogger.logError(req, error, "Failed to delete reservation");
    handleReservationError(res, error, "delete");
  }
};

/* ─── EXTEND reservation ─────────────────────────── */
export const extendReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { extensionDays = 3 } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    const oldData = reservation.toObject();
    const newMoveIn = new Date(
      reservation.checkInDate || reservation.finalMoveInDate,
    );
    newMoveIn.setDate(newMoveIn.getDate() + extensionDays);

    reservation.checkInDate = newMoveIn;
    reservation.finalMoveInDate = newMoveIn;
    reservation.moveInExtendedTo = newMoveIn;
    // Keep status as reserved — admin extended the deadline
    if (reservation.status !== "reserved") {
      reservation.status =
        reservation.paymentStatus === "paid" ? "reserved" : "pending";
    }

    await reservation.save();
    await reservation.populate(...POPULATE_USER);
    await reservation.populate(...POPULATE_ROOM);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Extended move-in date by ${extensionDays} days`,
    );
    res.json({
      message: `Reservation extended by ${extensionDays} days`,
      newMoveInDate: newMoveIn,
      reservation,
    });
  } catch (error) {
    console.error("❌ Extend reservation error:", error);
    await auditLogger.logError(req, error, "Failed to extend reservation");
    handleReservationError(res, error, "extend");
  }
};

/* ─── RELEASE SLOT ───────────────────────────────── */
export const releaseSlot = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { reason = "No-show after move-in date" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation =
      await Reservation.findById(reservationId).populate("roomId");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    const oldData = reservation.toObject();
    reservation.status = "cancelled";
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Released: ${reason}`;
    await reservation.save();

    // Reset user
    await handleStatusTransition(
      "cancelled",
      oldData.status,
      reservation.userId,
      reservation.roomId,
    );

    // Free room slot using proper model methods
    if (reservation.roomId) {
      const room = await Room.findById(reservation.roomId._id);
      if (room) {
        if (reservation.selectedBed?.id) {
          room.vacateBed(reservation.selectedBed.id);
        }
        room.decreaseOccupancy();
        room.updateAvailability();
        await room.save();
      }
    }

    await reservation.populate(...POPULATE_USER);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Slot released: ${reason}`,
    );
    res.json({
      message: "Reservation slot released successfully",
      reason,
      reservation,
    });
  } catch (error) {
    console.error("❌ Release slot error:", error);
    await auditLogger.logError(
      req,
      error,
      "Failed to release reservation slot",
    );
    handleReservationError(res, error, "release slot");
  }
};

/* ─── ARCHIVE reservation ────────────────────────── */
export const archiveReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { reason = "Archived by admin" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    const oldData = reservation.toObject();
    const dbUser = await findDbUser(req.user.uid);

    // Release occupancy if was active
    if (
      reservation.status === "reserved" ||
      reservation.status === "checked-in"
    ) {
      const prevStatus = reservation.status;
      reservation.status = "cancelled";
      await reservation.save();
      try {
        await updateOccupancyOnReservationChange(reservation, {
          ...oldData,
          status: prevStatus,
        });
      } catch (e) {
        console.error("⚠️ Occupancy update during archive failed:", e);
      }
    }

    reservation.isArchived = true;
    reservation.archivedAt = new Date();
    reservation.archivedBy = dbUser?._id || null;
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Archived: ${reason}`;
    await reservation.save();

    await reservation.populate(...POPULATE_USER);
    await reservation.populate(...POPULATE_ROOM);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Reservation archived: ${reason}`,
    );
    res.json({
      message: "Reservation archived successfully",
      reason,
      reservation,
    });
  } catch (error) {
    console.error("❌ Archive reservation error:", error);
    await auditLogger.logError(req, error, "Failed to archive reservation");
    handleReservationError(res, error, "archive");
  }
};

/* ─── RENEW CONTRACT ─────────────────────────────── */
export const renewContract = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { additionalMonths = 12, notes: renewNotes = "" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    if (additionalMonths < 1 || additionalMonths > 24) {
      return res.status(400).json({
        error: "Renewal must be between 1 and 24 months.",
        code: "INVALID_RENEWAL_DURATION",
      });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate("roomId", "name branch")
      .populate("userId", "firstName lastName email");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    if (reservation.status !== "checked-in") {
      return res.status(400).json({
        error: "Only checked-in reservations can be renewed.",
        code: "INVALID_STATUS_FOR_RENEWAL",
      });
    }

    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    const oldData = reservation.toObject();
    const oldDuration = reservation.leaseDuration || 12;

    reservation.leaseDuration = oldDuration + additionalMonths;
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Contract renewed: +${additionalMonths} months (${oldDuration} → ${reservation.leaseDuration}). ${renewNotes}`;
    await reservation.save();

    // Notify tenant
    const { notify } = await import("../utils/notificationService.js");
    const roomName = reservation.roomId?.name || "your room";
    notify.general(
      reservation.userId?._id || reservation.userId,
      "Contract Renewed",
      `Your lease for ${roomName} has been renewed for an additional ${additionalMonths} month${additionalMonths === 1 ? "" : "s"} (total: ${reservation.leaseDuration} months).`,
      { entityType: "reservation" },
    );

    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Contract renewed: +${additionalMonths} months`,
    );

    res.json({
      message: `Contract renewed for ${additionalMonths} additional months`,
      oldDuration,
      newDuration: reservation.leaseDuration,
      reservation,
    });
  } catch (error) {
    console.error("❌ Renew contract error:", error);
    await auditLogger.logError(req, error, "Failed to renew contract");
    handleReservationError(res, error, "renew");
  }
};

/* ─── CHECKOUT ───────────────────────────────────── */
export const checkoutReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { notes: checkoutNotes = "", inspectionPassed = true } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation = await Reservation.findById(reservationId)
      .populate("roomId")
      .populate("userId", "firstName lastName email");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    if (reservation.status !== "checked-in") {
      return res.status(400).json({
        error: "Only checked-in reservations can be checked out.",
        code: "INVALID_STATUS_FOR_CHECKOUT",
      });
    }

    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    const oldData = reservation.toObject();

    // 1. Update reservation status
    reservation.status = "checked-out";
    reservation.checkOutDate = new Date();
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Checked out${inspectionPassed ? " (inspection passed)" : " (inspection issues noted)"}. ${checkoutNotes}`;
    await reservation.save();

    // 2. Release bed and decrease occupancy
    if (reservation.roomId && reservation.selectedBed?.id) {
      const room = await Room.findById(reservation.roomId._id);
      if (room) {
        room.vacateBed(reservation.selectedBed.id);
        room.decreaseOccupancy();
        room.updateAvailability();
        await room.save();
      }
    }

    // 3. Update user status
    const userId = reservation.userId?._id || reservation.userId;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        tenantStatus: "inactive",
        role: "applicant", // Revert to applicant so they can re-reserve
      });
    }

    // 4. Notify tenant
    const { notify } = await import("../utils/notificationService.js");
    const roomName = reservation.roomId?.name || "your room";
    notify.general(
      userId,
      "Check-Out Complete",
      `You have been checked out from ${roomName}. Thank you for staying at Lilycrest!`,
      { entityType: "reservation" },
    );

    await reservation.populate(...POPULATE_USER);
    await reservation.populate(...POPULATE_ROOM);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Tenant checked out from ${roomName}`,
    );

    res.json({
      message: "Tenant checked out successfully",
      reservation,
    });
  } catch (error) {
    console.error("❌ Checkout error:", error);
    await auditLogger.logError(req, error, "Failed to checkout reservation");
    handleReservationError(res, error, "checkout");
  }
};

/* ─── TRANSFER TENANT ────────────────────────────── */
export const transferTenant = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { newRoomId, newBedId, reason = "Room transfer" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    if (!newRoomId || !newBedId) {
      return res.status(400).json({
        error: "New room ID and bed ID are required.",
        code: "MISSING_TRANSFER_FIELDS",
      });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate("roomId")
      .populate("userId", "firstName lastName email");
    if (!reservation)
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });

    if (reservation.status !== "checked-in") {
      return res.status(400).json({
        error: "Only checked-in tenants can be transferred.",
        code: "INVALID_STATUS_FOR_TRANSFER",
      });
    }

    const denied = checkBranchAccess(
      res,
      req.branchFilter,
      reservation.roomId?.branch,
    );
    if (denied) return;

    // Validate new room
    const newRoom = await Room.findById(newRoomId);
    if (!newRoom)
      return res.status(404).json({ error: "New room not found", code: "NEW_ROOM_NOT_FOUND" });

    // Check bed availability
    const newBed = newRoom.beds?.find((b) => String(b._id) === String(newBedId));
    if (!newBed)
      return res.status(404).json({ error: "Bed not found in new room", code: "BED_NOT_FOUND" });
    if (newBed.status !== "available")
      return res.status(400).json({ error: "Selected bed is not available", code: "BED_NOT_AVAILABLE" });

    const oldData = reservation.toObject();
    const oldRoomName = reservation.roomId?.name || "unknown";
    const oldBedId = reservation.selectedBed?.id;

    // 1. Vacate old bed & decrease old room occupancy
    if (reservation.roomId && oldBedId) {
      const oldRoom = await Room.findById(reservation.roomId._id);
      if (oldRoom) {
        oldRoom.vacateBed(oldBedId);
        oldRoom.decreaseOccupancy();
        oldRoom.updateAvailability();
        await oldRoom.save();
      }
    }

    // 2. Occupy new bed & increase new room occupancy
    newRoom.occupyBed(newBedId);
    newRoom.increaseOccupancy();
    newRoom.updateAvailability();
    await newRoom.save();

    // 3. Update reservation
    reservation.roomId = newRoom._id;
    reservation.selectedBed = { id: newBedId, position: newBed.position || null };
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Transferred from ${oldRoomName} to ${newRoom.name}. ${reason}`;
    await reservation.save();

    // 4. Notify tenant
    const { notify } = await import("../utils/notificationService.js");
    notify.general(
      reservation.userId?._id || reservation.userId,
      "Room Transfer",
      `You have been transferred from ${oldRoomName} to ${newRoom.name}. Reason: ${reason}`,
      { entityType: "reservation" },
    );

    await reservation.populate(...POPULATE_USER);
    await reservation.populate(...POPULATE_ROOM);
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Tenant transferred: ${oldRoomName} → ${newRoom.name}`,
    );

    res.json({
      message: `Tenant transferred from ${oldRoomName} to ${newRoom.name}`,
      reservation,
    });
  } catch (error) {
    console.error("❌ Transfer error:", error);
    await auditLogger.logError(req, error, "Failed to transfer tenant");
    handleReservationError(res, error, "transfer");
  }
};
