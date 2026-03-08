/**
 * Reservation Controllers
 */

import { Reservation, User, Room } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";

export const getReservations = async (req, res) => {
  try {
    const user = req.user;

    // Find user in database to get role and branch
    const dbUser = await User.findOne({ firebaseUid: user.uid });

    if (!dbUser) {
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    let reservations;

    // Exclude heavy base64 image fields from listing — they're only needed
    // when viewing a single reservation's detail (getById).
    // Keep proofOfPaymentUrl since it's used for stage detection.
    const HEAVY_FIELDS =
      "-selfiePhotoUrl -validIDFrontUrl -validIDBackUrl -nbiClearanceUrl -companyIDUrl -__v";

    // Super admin sees all reservations (excluding archived)
    if (dbUser.role === "superAdmin") {
      reservations = await Reservation.find({ isArchived: { $ne: true } })
        .populate("userId", "firstName lastName email")
        .populate("roomId", "name branch type price")
        .select(HEAVY_FIELDS)
        .sort({ createdAt: -1 });
    }
    // Admin sees reservations for rooms in their branch
    else if (dbUser.role === "admin") {
      // First get all rooms for the admin's branch
      const branchRooms = await Room.find({ branch: dbUser.branch }).select(
        "_id",
      );
      const roomIds = branchRooms.map((room) => room._id);

      reservations = await Reservation.find({
        roomId: { $in: roomIds },
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName email")
        .populate("roomId", "name branch type price")
        .select(HEAVY_FIELDS)
        .sort({ createdAt: -1 });
    }
    // Regular users/tenants see only their own reservations
    else {
      reservations = await Reservation.find({
        userId: dbUser._id,
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName email")
        .populate("roomId", "name branch type price")
        .select(HEAVY_FIELDS)
        .sort({ createdAt: -1 });
    }

    console.log(
      `✅ Retrieved ${reservations.length} reservations for ${dbUser.email} (${dbUser.role})`,
    );
    res.json(reservations);
  } catch (error) {
    console.error("❌ Fetch reservations error:", error);
    res.status(500).json({
      error: "Failed to fetch reservations",
      details: error.message,
      code: "FETCH_RESERVATIONS_ERROR",
    });
  }
};

export const getReservationById = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const user = req.user;

    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const dbUser = await User.findOne({ firebaseUid: user.uid });
    if (!dbUser) {
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch type price floor");

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

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
    res.status(500).json({
      error: "Failed to fetch reservation",
      details: error.message,
      code: "FETCH_RESERVATION_ERROR",
    });
  }
};

export const createReservation = async (req, res) => {
  try {
    // Find user in database
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });

    if (!dbUser) {
      return res.status(404).json({
        error:
          "User not found in database. Please complete registration first.",
        code: "USER_NOT_FOUND",
      });
    }

    // ── Single reservation enforcement ──
    // A user can only have ONE active reservation at a time
    const existingActive = await Reservation.findOne({
      userId: dbUser._id,
      status: { $nin: ["cancelled", "archived"] },
      isArchived: { $ne: true },
    });
    if (existingActive) {
      return res.status(400).json({
        error:
          "You already have an active reservation. Please complete or cancel it before creating a new one.",
        code: "RESERVATION_ALREADY_EXISTS",
        existingReservationId: existingActive._id,
      });
    }

    // Validate required fields
    const { roomId, roomName, checkInDate, totalPrice } = req.body;
    if ((!roomId && !roomName) || !checkInDate || !totalPrice) {
      return res.status(400).json({
        error:
          "Missing required fields: roomId or roomName, checkInDate, and totalPrice are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Enforce 3-month reservation window
    const moveInDate = new Date(checkInDate);
    const now = new Date();
    const threeMonthsLater = new Date(now);
    threeMonthsLater.setMonth(now.getMonth() + 3);
    if (moveInDate < now || moveInDate > threeMonthsLater) {
      return res.status(400).json({
        error: "Move-in date must be within 3 months from today.",
        code: "MOVEIN_DATE_OUT_OF_RANGE",
      });
    }

    // Verify room exists - look up by ID or name
    let room;
    if (roomId) {
      room = await Room.findById(roomId);
    } else if (roomName) {
      room = await Room.findOne({ name: roomName });
    }

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
        code: "ROOM_NOT_FOUND",
      });
    }

    // Check if room is available
    if (!room.available) {
      return res.status(400).json({
        error: "Room is not available for reservation",
        code: "ROOM_NOT_AVAILABLE",
      });
    }

    // Create new reservation with ALL fields from the form
    const reservation = new Reservation({
      userId: dbUser._id,
      roomId: room._id,

      // Bed Assignment
      selectedBed: req.body.selectedBed
        ? {
            id: req.body.selectedBed.id || null,
            position: req.body.selectedBed.position || null,
          }
        : null,

      // Stage 1: Summary
      targetMoveInDate: req.body.targetMoveInDate
        ? new Date(req.body.targetMoveInDate)
        : null,
      leaseDuration: req.body.leaseDuration || 12,
      billingEmail: req.body.billingEmail || dbUser.email,

      // Stage 2: Visit
      viewingType: req.body.viewingType || null,
      isOutOfTown: req.body.isOutOfTown || false,
      currentLocation: req.body.currentLocation || null,
      visitApproved: req.body.visitApproved === true ? true : false,

      // Stage 3: Details - Photos
      selfiePhotoUrl: req.body.selfiePhotoUrl || null,

      // Stage 3: Personal Information
      firstName: req.body.firstName || null,
      lastName: req.body.lastName || null,
      middleName: req.body.middleName || null,
      nickname: req.body.nickname || null,
      mobileNumber: req.body.mobileNumber || null,
      birthday: req.body.birthday ? new Date(req.body.birthday) : null,
      maritalStatus: req.body.maritalStatus || null,
      nationality: req.body.nationality || null,
      educationLevel: req.body.educationLevel || null,

      // Stage 3: Address
      address: {
        unitHouseNo: req.body.addressUnitHouseNo || null,
        street: req.body.addressStreet || null,
        barangay: req.body.addressBarangay || null,
        city: req.body.addressCity || null,
        province: req.body.addressProvince || null,
      },

      // Stage 3: Identity Documents
      validIDFrontUrl: req.body.validIDFrontUrl || null,
      validIDBackUrl: req.body.validIDBackUrl || null,
      validIDType: req.body.validIDType || null,
      nbiClearanceUrl: req.body.nbiClearanceUrl || null,
      nbiReason: req.body.nbiReason || null,
      companyIDUrl: req.body.companyIDUrl || null,
      companyIDReason: req.body.companyIDReason || null,

      // Stage 3: Emergency Contact
      emergencyContact: {
        name: req.body.emergencyContactName || null,
        relationship: req.body.emergencyRelationship || null,
        contactNumber: req.body.emergencyContactNumber || null,
      },
      healthConcerns: req.body.healthConcerns || null,

      // Stage 3: Employment
      employment: {
        employerSchool: req.body.employerSchool || null,
        employerAddress: req.body.employerAddress || null,
        employerContact: req.body.employerContact || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        occupation: req.body.occupation || null,
        previousEmployment: req.body.previousEmployment || null,
      },

      // Stage 3: Dorm-Related
      preferredRoomType: req.body.roomType || null,
      preferredRoomNumber: req.body.preferredRoomNumber || null,
      referralSource: req.body.referralSource || null,
      referrerName: req.body.referrerName || null,
      estimatedMoveInTime: req.body.estimatedMoveInTime || null,
      workSchedule: req.body.workSchedule || null,
      workScheduleOther: req.body.workScheduleOther || null,

      // Stage 3: Agreements
      agreedToPrivacy: req.body.agreedToPrivacy || false,
      agreedToCertification: req.body.agreedToCertification || false,

      // Stage 4: Payment
      proofOfPaymentUrl: req.body.proofOfPaymentUrl || null,
      applianceFees: req.body.applianceFees || 0,

      // Reservation Dates & Status
      checkInDate: req.body.checkInDate,
      checkOutDate: req.body.checkOutDate || null,
      totalPrice: req.body.totalPrice,
      notes: req.body.notes || "",
      status: "pending",
      paymentStatus: "pending",
    });

    // Save reservation to database
    await reservation.save();

    // Populate user and room details for response
    await reservation.populate("userId", "firstName lastName email");
    await reservation.populate("roomId", "name branch type price");

    // Log reservation creation
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
    res.status(201).json({
      message: "Reservation created successfully",
      reservationId: reservation._id,
      reservationCode: reservation.reservationCode,
      reservation,
    });
  } catch (error) {
    console.error("❌ Create reservation error:", error);
    console.error("Error stack:", error.stack);
    await auditLogger.logError(req, error, "Failed to create reservation");

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = {};
      Object.keys(error.errors).forEach((field) => {
        validationErrors[field] = error.errors[field].message;
      });
      console.error("Validation errors details:", validationErrors);

      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        validationErrors,
        code: "VALIDATION_ERROR",
      });
    }

    // Handle cast errors (invalid IDs)
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid ID format",
        details: error.message,
        code: "INVALID_ID_FORMAT",
      });
    }

    res.status(500).json({
      error: "Failed to create reservation",
      details: error.message,
      code: "CREATE_RESERVATION_ERROR",
    });
  }
};

export const updateReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;

    // Validate reservationId format
    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    // Find reservation first to check branch access
    const existingReservation = await Reservation.findById(
      reservationId,
    ).populate("roomId", "branch");

    if (!existingReservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Store old data for audit log
    const oldReservationData = existingReservation.toObject();

    // Check branch access (admin can only update reservations for rooms in their branch)
    if (
      req.branchFilter &&
      existingReservation.roomId?.branch !== req.branchFilter
    ) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${req.branchFilter} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    // If checkInDate is being updated, enforce 3-month window
    if (req.body.checkInDate) {
      const moveInDate = new Date(req.body.checkInDate);
      const now = new Date();
      const threeMonthsLater = new Date(now);
      threeMonthsLater.setMonth(now.getMonth() + 3);
      if (moveInDate < now || moveInDate > threeMonthsLater) {
        return res.status(400).json({
          error: "Move-in date must be within 3 months from today.",
          code: "MOVEIN_DATE_OUT_OF_RANGE",
        });
      }
    }

    // ── Status transition: CONFIRMED ──
    // Set payment to paid, assign user branch from room
    if (
      req.body.status === "confirmed" &&
      existingReservation.status !== "confirmed"
    ) {
      req.body.paymentStatus = "paid";
      req.body.approvedDate = new Date();

      // Auto-assign branch and set tenantStatus to reserved
      const reservationUser = await User.findById(existingReservation.userId);
      const room = await Room.findById(existingReservation.roomId);
      if (reservationUser && room) {
        reservationUser.tenantStatus = "reserved";
        reservationUser.branch =
          room.branch || existingReservation.roomId?.branch;
        await reservationUser.save();
        console.log(
          `✅ User ${reservationUser.email} → tenantStatus: reserved, branch: ${reservationUser.branch}`,
        );
      }
    }

    // ── Status transition: CHECKED-IN ──
    // Promote user to tenant
    if (
      req.body.status === "checked-in" &&
      existingReservation.status !== "checked-in"
    ) {
      const reservationUser = await User.findById(existingReservation.userId);
      if (reservationUser) {
        reservationUser.role = "tenant";
        reservationUser.tenantStatus = "active";
        await reservationUser.save();
        console.log(
          `✅ User ${reservationUser.email} → role: tenant, tenantStatus: active`,
        );
      }
    }

    // ── Status transition: CANCELLED ──
    // Reset user to applicant state
    if (
      req.body.status === "cancelled" &&
      existingReservation.status !== "cancelled"
    ) {
      const reservationUser = await User.findById(existingReservation.userId);
      if (reservationUser && reservationUser.role === "applicant") {
        reservationUser.tenantStatus = null;
        reservationUser.branch = null;
        await reservationUser.save();
        console.log(
          `✅ User ${reservationUser.email} → tenantStatus: null, branch: null (cancelled)`,
        );
      }
    }

    // Update reservation and return the updated document
    // Use save() instead of findByIdAndUpdate() to trigger pre-save hooks (reservation code generation)
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Apply updates to the reservation object
    Object.assign(reservation, req.body);

    // Save the reservation (this triggers pre-save hooks for code generation)
    const updatedReservation = await reservation.save();

    // === OCCUPANCY TRACKING ===
    // Update room occupancy if status changed
    if (oldReservationData.status !== updatedReservation.status) {
      try {
        await updateOccupancyOnReservationChange(
          updatedReservation,
          oldReservationData,
        );
      } catch (occupancyError) {
        console.error(
          "⚠️ Occupancy update failed (non-fatal):",
          occupancyError,
        );
        // Don't fail the request if occupancy update fails
      }
    }

    // Populate fields
    await updatedReservation.populate("userId", "firstName lastName email");
    await updatedReservation.populate("roomId", "name branch type price");

    // Log reservation modification
    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldReservationData,
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

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    // Handle cast errors (invalid ID)
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    res.status(500).json({
      error: "Failed to update reservation",
      details: error.message,
      code: "UPDATE_RESERVATION_ERROR",
    });
  }
};

export const updateReservationByUser = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const user = req.user;

    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const dbUser = await User.findOne({ firebaseUid: user.uid });
    if (!dbUser) {
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    if (String(reservation.userId) !== String(dbUser._id)) {
      return res.status(403).json({
        error: "Access denied. You can only update your own reservation.",
        code: "RESERVATION_ACCESS_DENIED",
      });
    }

    const updates = {};
    const setField = (key, value) => {
      if (value !== undefined) {
        updates[key] = value;
      }
    };

    setField("selectedBed", req.body.selectedBed);
    setField("roomId", req.body.roomId);
    setField("targetMoveInDate", req.body.targetMoveInDate);
    setField("leaseDuration", req.body.leaseDuration);
    setField("billingEmail", req.body.billingEmail);
    setField("viewingType", req.body.viewingType);
    setField("visitDate", req.body.visitDate);
    setField("visitTime", req.body.visitTime);
    setField("isOutOfTown", req.body.isOutOfTown);
    setField("currentLocation", req.body.currentLocation);
    setField("visitApproved", req.body.visitApproved);
    setField("selfiePhotoUrl", req.body.selfiePhotoUrl);
    setField("firstName", req.body.firstName);
    setField("lastName", req.body.lastName);
    setField("middleName", req.body.middleName);
    setField("nickname", req.body.nickname);
    setField("mobileNumber", req.body.mobileNumber);
    setField("birthday", req.body.birthday);
    setField("maritalStatus", req.body.maritalStatus);
    setField("nationality", req.body.nationality);
    setField("educationLevel", req.body.educationLevel);
    setField("validIDFrontUrl", req.body.validIDFrontUrl);
    setField("validIDBackUrl", req.body.validIDBackUrl);
    setField("validIDType", req.body.validIDType);
    setField("nbiClearanceUrl", req.body.nbiClearanceUrl);
    setField("nbiReason", req.body.nbiReason);
    setField("companyIDUrl", req.body.companyIDUrl);
    setField("companyIDReason", req.body.companyIDReason);
    setField("healthConcerns", req.body.healthConcerns);
    setField("preferredRoomType", req.body.roomType);
    setField("preferredRoomNumber", req.body.preferredRoomNumber);
    setField("referralSource", req.body.referralSource);
    setField("referrerName", req.body.referrerName);
    setField("estimatedMoveInTime", req.body.estimatedMoveInTime);
    setField("workSchedule", req.body.workSchedule);
    setField("workScheduleOther", req.body.workScheduleOther);
    setField("agreedToPrivacy", req.body.agreedToPrivacy);
    setField("agreedToCertification", req.body.agreedToCertification);
    setField("finalMoveInDate", req.body.finalMoveInDate);
    setField("paymentMethod", req.body.paymentMethod);
    setField("proofOfPaymentUrl", req.body.proofOfPaymentUrl);
    setField("checkInDate", req.body.checkInDate);
    setField("checkOutDate", req.body.checkOutDate);
    setField("totalPrice", req.body.totalPrice);
    setField("applianceFees", req.body.applianceFees);
    setField("notes", req.body.notes);

    if (req.body.addressUnitHouseNo !== undefined) {
      updates["address.unitHouseNo"] = req.body.addressUnitHouseNo;
    }
    if (req.body.addressStreet !== undefined) {
      updates["address.street"] = req.body.addressStreet;
    }
    if (req.body.addressBarangay !== undefined) {
      updates["address.barangay"] = req.body.addressBarangay;
    }
    if (req.body.addressCity !== undefined) {
      updates["address.city"] = req.body.addressCity;
    }
    if (req.body.addressProvince !== undefined) {
      updates["address.province"] = req.body.addressProvince;
    }

    if (req.body.emergencyContactName !== undefined) {
      updates["emergencyContact.name"] = req.body.emergencyContactName;
    }
    if (req.body.emergencyRelationship !== undefined) {
      updates["emergencyContact.relationship"] = req.body.emergencyRelationship;
    }
    if (req.body.emergencyContactNumber !== undefined) {
      updates["emergencyContact.contactNumber"] =
        req.body.emergencyContactNumber;
    }

    if (req.body.employerSchool !== undefined) {
      updates["employment.employerSchool"] = req.body.employerSchool;
    }
    if (req.body.employerAddress !== undefined) {
      updates["employment.employerAddress"] = req.body.employerAddress;
    }
    if (req.body.employerContact !== undefined) {
      updates["employment.employerContact"] = req.body.employerContact;
    }
    if (req.body.startDate !== undefined) {
      updates["employment.startDate"] = req.body.startDate;
    }
    if (req.body.occupation !== undefined) {
      updates["employment.occupation"] = req.body.occupation;
    }
    if (req.body.previousEmployment !== undefined) {
      updates["employment.previousEmployment"] = req.body.previousEmployment;
    }

    // When payment proof is uploaded, set status to pending payment verification and generate payment reference
    if (req.body.proofOfPaymentUrl) {
      updates.paymentStatus = "pending";
      updates.paymentDate = new Date();

      // Generate payment reference if not already generated
      const existingReservation = await Reservation.findById(reservationId);
      if (!existingReservation.paymentReference) {
        // Generate unique payment reference: PAY-XXXXXX (6 characters)
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let paymentRef = "PAY-";
        for (let i = 0; i < 6; i++) {
          paymentRef += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        updates.paymentReference = paymentRef;
      }
    }

    const updatedReservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      },
    )
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch type price");

    res.json({
      message: "Reservation updated successfully",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("❌ User reservation update error:", error);
    res.status(500).json({
      error: "Failed to update reservation",
      details: error.message,
      code: "UPDATE_RESERVATION_ERROR",
    });
  }
};

/**
 * Delete a reservation
 */
export const deleteReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const user = req.user;

    // Find user in database to get role and branch
    const dbUser = await User.findOne({ firebaseUid: user.uid });

    if (!dbUser) {
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    // Find the reservation with populated room data for branch checking
    const reservation =
      await Reservation.findById(reservationId).populate("roomId");

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Check authorization
    const isOwner = String(reservation.userId) === String(dbUser._id);
    const isAdmin = dbUser.role === "admin" || dbUser.role === "superAdmin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: "Access denied. You can only delete your own reservation.",
        code: "RESERVATION_ACCESS_DENIED",
      });
    }

    // Check branch access (admin can only delete reservations for rooms in their branch)
    if (
      dbUser.role === "admin" &&
      reservation.roomId?.branch !== dbUser.branch
    ) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${dbUser.branch} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    // Store data for audit log before deletion
    const reservationData = reservation.toObject();

    // === OCCUPANCY TRACKING ===
    // Release occupancy if reservation was confirmed or checked-in
    if (
      reservation.status === "confirmed" ||
      reservation.status === "checked-in"
    ) {
      try {
        // Create a cancelled version to trigger occupancy release
        const cancelledReservation = reservation.toObject();
        cancelledReservation.status = "cancelled";
        await updateOccupancyOnReservationChange(
          { ...reservation, status: "cancelled" },
          reservationData,
        );
      } catch (occupancyError) {
        console.error(
          "⚠️ Occupancy release during deletion failed:",
          occupancyError,
        );
      }
    }

    // Delete the reservation
    await Reservation.findByIdAndDelete(reservationId);

    // Log reservation deletion
    await auditLogger.logDeletion(
      req,
      "reservation",
      reservationId,
      reservationData,
    );

    console.log(`✅ Reservation deleted: ${reservationId}`);
    res.json({
      message: "Reservation deleted successfully",
      reservationId,
    });
  } catch (error) {
    console.error("❌ Delete reservation error:", error);
    await auditLogger.logError(req, error, "Failed to delete reservation");

    // Handle cast errors (invalid ID)
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    res.status(500).json({
      error: "Failed to delete reservation",
      details: error.message,
      code: "DELETE_RESERVATION_ERROR",
    });
  }
};

/**
 * Extend a reservation's move-in date (admin action for overdue reservations)
 */
export const extendReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { extensionDays = 3 } = req.body; // Default 3-day extension

    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Check branch access
    if (req.branchFilter && reservation.roomId?.branch !== req.branchFilter) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${req.branchFilter} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    const oldData = reservation.toObject();

    // Calculate new move-in date
    const currentMoveIn =
      reservation.checkInDate || reservation.finalMoveInDate;
    const newMoveInDate = new Date(currentMoveIn);
    newMoveInDate.setDate(newMoveInDate.getDate() + extensionDays);

    // Update reservation dates
    reservation.checkInDate = newMoveInDate;
    reservation.finalMoveInDate = newMoveInDate;
    reservation.status =
      reservation.paymentStatus === "paid" ? "confirmed" : "pending";

    await reservation.save();
    await reservation.populate("userId", "firstName lastName email");
    await reservation.populate("roomId", "name branch type price");

    await auditLogger.logModification(
      req,
      "reservation",
      reservationId,
      oldData,
      reservation.toObject(),
      `Extended move-in date by ${extensionDays} days`,
    );

    console.log(
      `✅ Reservation extended: ${reservationId} - New move-in: ${newMoveInDate}`,
    );
    res.json({
      message: `Reservation extended by ${extensionDays} days`,
      newMoveInDate,
      reservation,
    });
  } catch (error) {
    console.error("❌ Extend reservation error:", error);
    await auditLogger.logError(req, error, "Failed to extend reservation");
    res.status(500).json({
      error: "Failed to extend reservation",
      details: error.message,
      code: "EXTEND_RESERVATION_ERROR",
    });
  }
};

/**
 * Release a reservation slot (admin action to cancel and free up room)
 */
export const releaseSlot = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { reason = "No-show after move-in date" } = req.body;

    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const reservation =
      await Reservation.findById(reservationId).populate("roomId");

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Check branch access
    if (req.branchFilter && reservation.roomId?.branch !== req.branchFilter) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${req.branchFilter} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    const oldData = reservation.toObject();

    // Cancel the reservation
    reservation.status = "cancelled";
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Released: ${reason}`;
    await reservation.save();

    // Reset user to applicant state
    const reservationUser = await User.findById(reservation.userId);
    if (reservationUser && reservationUser.role === "applicant") {
      reservationUser.tenantStatus = null;
      reservationUser.branch = null;
      await reservationUser.save();
      console.log(`✅ User ${reservationUser.email} → reset (slot released)`);
    }

    // Free up the room slot (increment available beds or set available)
    if (reservation.roomId) {
      const room = await Room.findById(reservation.roomId._id);
      if (room) {
        // If shared room, increment available beds
        if (room.beds && room.beds.length > 0 && reservation.selectedBed?.id) {
          const bed = room.beds.find(
            (b) => b.id === reservation.selectedBed.id,
          );
          if (bed) bed.occupied = false;
        }
        // Ensure room is marked available
        room.available = true;
        await room.save();
      }
    }

    await reservation.populate("userId", "firstName lastName email");

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
    res.status(500).json({
      error: "Failed to release slot",
      details: error.message,
      code: "RELEASE_SLOT_ERROR",
    });
  }
};

/**
 * Soft delete (archive) a reservation
 */
export const archiveReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { reason = "Archived by admin" } = req.body;

    if (!reservationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid reservation ID format",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const reservation = await Reservation.findById(reservationId).populate(
      "roomId",
      "branch",
    );

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // Check branch access
    if (req.branchFilter && reservation.roomId?.branch !== req.branchFilter) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${req.branchFilter} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    const oldData = reservation.toObject();

    // Find the admin user
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });

    // If reservation was confirmed or checked-in, mark as cancelled first to trigger occupancy release
    if (
      reservation.status === "confirmed" ||
      reservation.status === "checked-in"
    ) {
      const previousStatus = reservation.status;
      reservation.status = "cancelled";

      // Save with cancelled status to trigger occupancy update
      await reservation.save();

      // Update occupancy
      try {
        await updateOccupancyOnReservationChange(reservation, {
          ...oldData,
          status: previousStatus,
        });
      } catch (occupancyError) {
        console.error(
          "⚠️ Occupancy update during archive failed:",
          occupancyError,
        );
      }
    }

    // Now soft delete the reservation
    reservation.isArchived = true;
    reservation.archivedAt = new Date();
    reservation.archivedBy = dbUser?._id || null;
    reservation.notes = `${reservation.notes ? reservation.notes + " | " : ""}Archived: ${reason}`;
    await reservation.save();

    await reservation.populate("userId", "firstName lastName email");
    await reservation.populate("roomId", "name branch type price");

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
    res.status(500).json({
      error: "Failed to archive reservation",
      details: error.message,
      code: "ARCHIVE_RESERVATION_ERROR",
    });
  }
};
