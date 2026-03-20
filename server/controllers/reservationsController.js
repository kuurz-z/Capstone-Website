/**
 * ============================================================================
 * RESERVATION CONTROLLERS
 * ============================================================================
 *
 * Refactored to use shared helpers from reservationHelpers.js.
 * Eliminates ~200 lines of duplicated validation, error handling, and field mapping.
 */

import { Reservation, User, Room } from "../models/index.js";
import logger from "../middleware/logger.js";
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
  getCheckinBlockers,
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
    logger.error({ err: error, requestId: req.id }, "Fetch reservations error");
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
    logger.error({ err: error, requestId: req.id }, "Fetch reservation error");
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
        existingStatus: existingActive.status,
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

    // Live occupancy check — count actual active reservations instead of
    // trusting the cached `room.available` boolean which can drift out of sync
    // (e.g. when reservations are cancelled/deleted without proper decrements).
    const activeReservationCount = await Reservation.countDocuments({
      roomId: room._id,
      status: { $in: ["pending", "reserved", "checked-in"] },
      isArchived: { $ne: true },
    });
    if (activeReservationCount >= room.capacity) {
      return res.status(400).json({
        error: "Room is fully booked. Please choose a different room.",
        code: "ROOM_UNAVAILABLE",
      });
    }
    // Auto-heal: fix stale availability flag so future reads are correct
    if (!room.available && activeReservationCount < room.capacity) {
      await Room.findByIdAndUpdate(room._id, {
        currentOccupancy: activeReservationCount,
        available: true,
      });
      logger.info(
        { roomId: room._id, activeReservationCount },
        "Auto-healed stale room.available flag during reservation creation",
      );
    }

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
      leaseDuration: b.leaseDuration || null,
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
    logger.error({ err: error, requestId: req.id }, "Create reservation error");
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

    // ── Check-in gate: enforce full prerequisite checklist ─────────────
    // Prevents admins from bypassing the proper flow (visit → payment →
    // reservation confirmed) and jumping straight to checked-in.
    if (
      req.body.status === "checked-in" &&
      existingReservation.status !== "checked-in"
    ) {
      const blockers = getCheckinBlockers(existingReservation);
      if (blockers.length > 0) {
        return res.status(400).json({
          error: "Check-in prerequisites not met. Please resolve the following before checking in the tenant.",
          code: "CHECKIN_PREREQUISITES_NOT_MET",
          missing: blockers,
        });
      }
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
      "approvedDate", "visitApproved", "scheduleApproved", "documentsApproved",
      "documentRejectionReason", "nbiApproved", "nbiRejectionReason",
      "companyIDApproved", "companyIDRejectionReason",
      "scheduleRejected", "scheduleRejectionReason",
    ];

    // Remove a single visitHistory entry by index
    if (req.body.removeVisitHistoryIndex !== undefined) {
      const idx = Number(req.body.removeVisitHistoryIndex);
      const history = reservation.visitHistory || [];
      if (idx >= 0 && idx < history.length) {
        history.splice(idx, 1);
        reservation.visitHistory = history;
        reservation.markModified("visitHistory");
      }
    }

    // Auto-set rejection metadata when admin rejects a visit schedule
    if (req.body.scheduleRejected === true && !existingReservation.scheduleRejected) {
      reservation.scheduleRejectedAt = new Date();
      reservation.scheduleRejectedBy = req.adminId || null;
      // Clear visit approval so tenant can reschedule
      reservation.visitApproved = false;
      // Status-driven: keep at visit_pending so tenant can reschedule
      reservation.status = "visit_pending";

      // Archive the rejected visit attempt to history
      if (existingReservation.visitDate) {
        if (!reservation.visitHistory) reservation.visitHistory = [];
        const attemptNumber = reservation.visitHistory.length + 1;
        reservation.visitHistory.push({
          visitDate: existingReservation.visitDate,
          visitTime: existingReservation.visitTime,
          viewingType: existingReservation.viewingType || "inperson",
          status: "rejected",
          rejectionReason: req.body.scheduleRejectionReason || "",
          scheduledAt: existingReservation.createdAt,
          rejectedAt: new Date(),
          rejectedBy: req.adminId || null,
          attemptNumber,
        });
      }
    }

    // Auto-transition: visit_pending → visit_approved when admin approves visit
    if (req.body.visitApproved === true && !existingReservation.visitApproved) {
      if (["pending", "visit_pending"].includes(existingReservation.status)) {
        reservation.status = "visit_approved";
      }

      // Archive the approved visit attempt to history
      if (existingReservation.visitDate) {
        if (!reservation.visitHistory) reservation.visitHistory = [];
        const attemptNumber = reservation.visitHistory.length + 1;
        reservation.visitHistory.push({
          visitDate: existingReservation.visitDate,
          visitTime: existingReservation.visitTime,
          viewingType: existingReservation.viewingType || "inperson",
          status: "approved",
          scheduledAt: existingReservation.createdAt,
          approvedAt: new Date(),
          attemptNumber,
        });
      }
    }

    for (const key of ADMIN_ALLOWED) {
      if (req.body[key] !== undefined) reservation[key] = req.body[key];
    }
    const updatedReservation = await reservation.save();

    // Occupancy tracking
    if (oldData.status !== updatedReservation.status) {
      try {
        await updateOccupancyOnReservationChange(updatedReservation, oldData);
      } catch (e) {
        logger.warn({ err: e, requestId: req.id }, "Occupancy update failed (non-fatal)");
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
        logger.warn({ err: emailErr, requestId: req.id }, "Confirmation email failed (non-fatal)");
      }
      // In-app notification — reservation confirmed
      try {
        const { notify } = await import("../utils/notificationService.js");
        await notify.reservationConfirmed(
          updatedReservation.userId._id,
          updatedReservation.reservationCode || "N/A",
          updatedReservation.roomId?.name || "your room",
        );
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, requestId: req.id }, "Reservation confirmed notification failed (non-fatal)");
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
        logger.warn({ err: emailErr, requestId: req.id }, "Visit approved email failed (non-fatal)");
      }
      // In-app notification — visit approved
      try {
        const { notify } = await import("../utils/notificationService.js");
        await notify.visitApproved(
          updatedReservation.userId._id,
          updatedReservation.roomId?.branch || "the dormitory",
        );
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, requestId: req.id }, "Visit approved notification failed (non-fatal)");
      }
    }

    // Send visit-rejected notification when admin rejects a visit
    if (
      req.body.scheduleRejected === true &&
      !oldData.scheduleRejected &&
      updatedReservation.userId?._id
    ) {
      try {
        const { notify } = await import("../utils/notificationService.js");
        await notify.visitRejected(
          updatedReservation.userId._id,
          updatedReservation.scheduleRejectionReason || "Please reschedule your visit.",
        );
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, requestId: req.id }, "Visit rejected notification failed (non-fatal)");
      }
    }
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Update reservation error");
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

    // ── Soft-cancel: preserve history, mark as cancelled ─────
    if (req.body.cancelReservation === true) {
      // Log current visit to history as "cancelled" if there's an active visit
      if (reservation.visitDate) {
        const existingHistory = reservation.visitHistory || [];
        updates.visitHistory = [
          ...existingHistory,
          {
            visitDate: reservation.visitDate,
            visitTime: reservation.visitTime,
            viewingType: reservation.viewingType || "inperson",
            status: "cancelled",
            scheduledAt: reservation.createdAt,
            cancelledAt: new Date(),
            attemptNumber: existingHistory.length + 1,
          },
        ];
      }
      updates.status = "cancelled";

      const updated = await Reservation.findByIdAndUpdate(
        reservationId,
        { $set: updates },
        { new: true, runValidators: true },
      ).populate("userId", "firstName lastName email phone")
       .populate("roomId", "roomNumber roomType floor branch priceMonthly");

      return res.json({
        message: "Reservation cancelled",
        reservation: updated,
      });

      // In-app notification — reservation cancelled (fire-and-forget after response)
      if (updated?.userId) {
        const { notify } = await import("../utils/notificationService.js").catch(() => ({ notify: null }));
        if (notify) {
          notify.reservationCancelled(
            updated.userId,
            updated.reservationCode || "N/A",
            updates.cancellationReason || "",
          ).catch((e) => logger.warn({ err: e, requestId: req.id }, "Cancel notification failed (non-fatal)"));
        }
      }
    }

    // Generate visitCode when visitDate is first set (bypassed by findByIdAndUpdate)
    if (updates.visitDate) {
      const existingForCode = await Reservation.findById(reservationId).select("visitCode visitScheduledAt").lean();
      if (!existingForCode?.visitCode) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let visitCode = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          let code = "VIS-";
          for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
          const taken = await Reservation.findOne({ visitCode: code }).select("_id").lean();
          if (!taken) { visitCode = code; break; }
        }
        updates.visitCode = visitCode || ("VIS-" + Date.now().toString(36).toUpperCase().slice(-6));
      }
      // Stamp the submission time — this is "when the tenant scheduled the visit",
      // NOT the visit appointment date. Always refresh on rescheduling too.
      updates.visitScheduledAt = new Date();
    }

    // ── Status-driven auto-transitions ──────────────────────
    // Reset rejection state when tenant reschedules after a rejection
    if (updates.visitDate && updates.agreedToPrivacy && reservation.scheduleRejected) {
      updates.scheduleRejected = false;
      updates.scheduleRejectionReason = null;
      updates.scheduleRejectedAt = null;
      updates.status = "visit_pending";
      // Don't push "pending" to visitHistory — the active visit row shows the current attempt.
      // Only terminal outcomes (rejected, approved, cancelled) belong in visitHistory.
    }
    // pending → visit_pending: when tenant first schedules a visit
    if (updates.visitDate && updates.agreedToPrivacy) {
      if (reservation.status === "pending") {
        updates.status = "visit_pending";
        // Don't push "pending" to visitHistory here — the active visit row shows current state.
        // History only records terminal outcomes (rejected, approved, cancelled).
      }
    }
    // visit_approved → payment_pending: when tenant submits full application
    if (updates.firstName && updates.lastName && updates.mobileNumber) {
      if (reservation.status === "visit_approved") {
        updates.status = "payment_pending";
      }
    }

    // Payment proof handling
    if (req.body.proofOfPaymentUrl) {
      updates.paymentStatus = "pending";
      updates.paymentDate = new Date();
      // Ensure status reflects payment stage
      if (["visit_approved", "payment_pending"].includes(reservation.status)) {
        updates.status = "payment_pending";
      }
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
    logger.error({ err: error, requestId: req.id }, "User reservation update error");
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

    // Release occupancy — use toObject() to avoid Mongoose getter issues with spread
    const hadOccupancy =
      reservation.status === "reserved" ||
      reservation.status === "checked-in";
    if (hadOccupancy) {
      try {
        await updateOccupancyOnReservationChange(
          { ...reservationData, status: "cancelled" },
          reservationData,
        );
        logger.info({ requestId: req.id, reservationId }, `Occupancy released (was ${reservation.status})`);
      } catch (e) {
        logger.warn({ err: e, requestId: req.id }, "Occupancy release during deletion failed");
      }
    }

    // Delete the reservation FIRST, then recalculate occupancy
    await Reservation.findByIdAndDelete(reservationId);

    // Safety net: recalculate room occupancy from remaining reservations
    // MUST run AFTER deletion — otherwise it recounts the deleted reservation
    if (reservation.roomId?._id) {
      try {
        const { recalculateRoomOccupancy } = await import("../utils/occupancyManager.js");
        await recalculateRoomOccupancy(reservation.roomId._id);
        logger.info({ requestId: req.id, roomId: reservation.roomId._id }, "Recalculated room occupancy after deletion");
      } catch (e) {
        logger.warn({ err: e, requestId: req.id }, "Occupancy recalculation failed");
      }
    }

    await auditLogger.logDeletion(
      req,
      "reservation",
      reservationId,
      reservationData,
    );
    res.json({ message: "Reservation deleted successfully", reservationId });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Delete reservation error");
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
    logger.error({ err: error, requestId: req.id }, "Extend reservation error");
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
    logger.error({ err: error, requestId: req.id }, "Release slot error");
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
        logger.warn({ err: e, requestId: req.id }, "Occupancy update during archive failed");
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
    logger.error({ err: error, requestId: req.id }, "Archive reservation error");
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
    reservation.leaseExtensions.push({
      addedMonths: additionalMonths,
      previousDuration: oldDuration,
      newDuration: reservation.leaseDuration,
      extendedBy: (await findDbUser(req.user.uid))?._id || null,
      notes: renewNotes,
    });
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
    logger.error({ err: error, requestId: req.id }, "Renew contract error");
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
    logger.error({ err: error, requestId: req.id }, "Checkout error");
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
    logger.error({ err: error, requestId: req.id }, "Transfer error");
    await auditLogger.logError(req, error, "Failed to transfer tenant");
    handleReservationError(res, error, "transfer");
  }
};

/* ─── GET MY CONTRACT (tenant) ─────────────────────── */
export const getMyContract = async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const user = await getOrSetUser(firebaseUid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find the tenant's active checked-in reservation
    const reservation = await Reservation.findOne({
      userId: user._id,
      status: "checked-in",
      isArchived: false,
    }).populate("roomId", "name branch type price floor");

    if (!reservation) {
      return res.status(404).json({ error: "No active contract found" });
    }

    const dayjs = (await import("dayjs")).default;
    const now = dayjs();
    const leaseStart = dayjs(reservation.checkInDate);
    const leaseDuration = reservation.leaseDuration || 12;
    const leaseEnd = leaseStart.add(leaseDuration, "month");
    const monthsCompleted = Math.min(now.diff(leaseStart, "month"), leaseDuration);
    const daysRemaining = Math.max(leaseEnd.diff(now, "day"), 0);
    const totalDays = leaseEnd.diff(leaseStart, "day");
    const daysElapsed = now.diff(leaseStart, "day");
    const progressPercent = Math.min(Math.round((daysElapsed / totalDays) * 100), 100);

    // Determine contract status
    let contractStatus = "active";
    if (daysRemaining <= 0) contractStatus = "expired";
    else if (daysRemaining <= 30) contractStatus = "expiring";

    const monthlyRent = reservation.monthlyRent || reservation.totalPrice || reservation.roomId?.price || 0;

    res.json({
      contractStatus,
      room: reservation.roomId?.name || "N/A",
      bed: reservation.selectedBed?.position || "N/A",
      branch: reservation.roomId?.branch || "N/A",
      roomType: reservation.roomId?.type || "N/A",
      floor: reservation.roomId?.floor || 1,
      monthlyRent,
      leaseStart: leaseStart.format("MMMM D, YYYY"),
      leaseEnd: leaseEnd.format("MMMM D, YYYY"),
      leaseDuration,
      monthsCompleted,
      daysRemaining,
      progressPercent,
      reservationId: reservation._id,
    });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Get contract error");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
};
