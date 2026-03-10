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

/* ─── helpers ────────────────────────────────────── */
const HEAVY_FIELDS =
  "-selfiePhotoUrl -validIDFrontUrl -validIDBackUrl -nbiClearanceUrl -companyIDUrl -__v";
const POPULATE_USER = ["userId", "firstName lastName email"];
const POPULATE_ROOM = ["roomId", "name branch type price"];

const findDbUser = async (uid) => User.findOne({ firebaseUid: uid });

/* ─── GET all reservations ───────────────────────── */
export const getReservations = async (req, res) => {
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

    console.log(
      `✅ Retrieved ${reservations.length} reservations for ${dbUser.email} (${dbUser.role})`,
    );
    res.json(reservations);
  } catch (error) {
    console.error("❌ Fetch reservations error:", error);
    handleReservationError(res, error, "fetch");
  }
};

/* ─── GET single reservation ─────────────────────── */
export const getReservationById = async (req, res) => {
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
      return res
        .status(404)
        .json({
          error: "Reservation not found",
          code: "RESERVATION_NOT_FOUND",
        });

    if (
      dbUser.role !== "admin" &&
      dbUser.role !== "superAdmin" &&
      String(reservation.userId?._id) !== String(dbUser._id)
    ) {
      return res
        .status(403)
        .json({
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
export const createReservation = async (req, res) => {
  try {
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser)
      return res
        .status(404)
        .json({
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
      return res
        .status(400)
        .json({
          error:
            "You already have an active reservation. Please complete or cancel it before creating a new one.",
          code: "RESERVATION_ALREADY_EXISTS",
          existingReservationId: existingActive._id,
        });

    const { roomId, roomName, checkInDate, totalPrice } = req.body;
    if ((!roomId && !roomName) || !checkInDate || !totalPrice)
      return res
        .status(400)
        .json({
          error:
            "Missing required fields: roomId or roomName, checkInDate, and totalPrice are required",
          code: "MISSING_REQUIRED_FIELDS",
        });

    // Enforce 3-month window
    if (!validateMoveInDate(checkInDate))
      return res
        .status(400)
        .json({
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
      return res
        .status(400)
        .json({
          error: "Room is not available for reservation",
          code: "ROOM_NOT_AVAILABLE",
        });
    if (!room.available)
      console.warn(
        `⚠️ Room ${room.name} is at capacity but allowing draft reservation for ${dbUser.email}`,
      );

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
    console.log(
      `✅ Reservation created: ${reservation._id} (${reservation.reservationCode}) for ${dbUser.email}`,
    );
    res
      .status(201)
      .json({
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
export const updateReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const existingReservation = await Reservation.findById(
      reservationId,
    ).populate("roomId", "branch");
    if (!existingReservation)
      return res
        .status(404)
        .json({
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
      return res
        .status(400)
        .json({
          error: "Move-in date must be within 3 months from today.",
          code: "MOVEIN_DATE_OUT_OF_RANGE",
        });
    }

    // Status transition side-effects
    if (
      req.body.status === "confirmed" &&
      existingReservation.status !== "confirmed"
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
      return res
        .status(404)
        .json({
          error: "Reservation not found",
          code: "RESERVATION_NOT_FOUND",
        });
    Object.assign(reservation, req.body);
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
    console.log(
      `✅ Reservation updated: ${updatedReservation._id} - Status: ${updatedReservation.status}${updatedReservation.reservationCode ? ` - Code: ${updatedReservation.reservationCode}` : ""}`,
    );
    res.json({
      message: "Reservation updated successfully",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("❌ Update reservation error:", error);
    await auditLogger.logError(req, error, "Failed to update reservation");
    handleReservationError(res, error, "update");
  }
};

/* ─── UPDATE reservation (user self-update) ──────── */
export const updateReservationByUser = async (req, res) => {
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
      return res
        .status(404)
        .json({
          error: "Reservation not found",
          code: "RESERVATION_NOT_FOUND",
        });
    if (String(reservation.userId) !== String(dbUser._id))
      return res
        .status(403)
        .json({
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
export const deleteReservation = async (req, res) => {
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
      return res
        .status(404)
        .json({
          error: "Reservation not found",
          code: "RESERVATION_NOT_FOUND",
        });

    const isOwner = String(reservation.userId) === String(dbUser._id);
    const isAdmin = dbUser.role === "admin" || dbUser.role === "superAdmin";
    if (!isOwner && !isAdmin)
      return res
        .status(403)
        .json({
          error: "Access denied. You can only delete your own reservation.",
          code: "RESERVATION_ACCESS_DENIED",
        });
    if (dbUser.role === "admin" && reservation.roomId?.branch !== dbUser.branch)
      return res
        .status(403)
        .json({
          error: `Access denied. You can only manage reservations for ${dbUser.branch} branch.`,
          code: "BRANCH_ACCESS_DENIED",
        });

    const reservationData = reservation.toObject();

    // Release occupancy
    if (
      reservation.status === "confirmed" ||
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
    console.log(`✅ Reservation deleted: ${reservationId}`);
    res.json({ message: "Reservation deleted successfully", reservationId });
  } catch (error) {
    console.error("❌ Delete reservation error:", error);
    await auditLogger.logError(req, error, "Failed to delete reservation");
    handleReservationError(res, error, "delete");
  }
};

/* ─── EXTEND reservation ─────────────────────────── */
export const extendReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { extensionDays = 3 } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );
    if (!reservation)
      return res
        .status(404)
        .json({
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
    reservation.status =
      reservation.paymentStatus === "paid" ? "confirmed" : "pending";

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
    console.log(
      `✅ Reservation extended: ${reservationId} - New move-in: ${newMoveIn}`,
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
export const releaseSlot = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { reason = "No-show after move-in date" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation =
      await Reservation.findById(reservationId).populate("roomId");
    if (!reservation)
      return res
        .status(404)
        .json({
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

    // Free room slot
    if (reservation.roomId) {
      const room = await Room.findById(reservation.roomId._id);
      if (room) {
        if (room.beds?.length > 0 && reservation.selectedBed?.id) {
          const bed = room.beds.find(
            (b) => b.id === reservation.selectedBed.id,
          );
          if (bed) bed.occupied = false;
        }
        room.available = true;
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
    console.log(`✅ Reservation slot released: ${reservationId}`);
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
export const archiveReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { reason = "Archived by admin" } = req.body;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );
    if (!reservation)
      return res
        .status(404)
        .json({
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
      reservation.status === "confirmed" ||
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
    console.log(`✅ Reservation archived: ${reservationId}`);
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
