import mongoose from "mongoose";
import dayjs from "dayjs";
import {
  BedHistory,
  Bill,
  Reservation,
  Room,
  Stay,
  User,
  UtilityReading,
} from "../models/index.js";
import {
  buildBillingSummary,
  computeLeaseEndDate,
} from "./tenantWorkspace.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  hasReservationStatus,
  readMoveInDate,
  utilityEventTypesForQuery,
} from "./lifecycleNaming.js";

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

const getMonthlyRent = (reservation) =>
  Number(reservation?.monthlyRent ?? reservation?.roomId?.monthlyPrice ?? reservation?.roomId?.price ?? 0);

async function ensureActiveStay(reservation, actorId = null, session = null) {
  const existingStay = await Stay.findOne({
    reservationId: reservation._id,
    status: "active",
  }).session(session);
  if (existingStay) return existingStay;

  const moveInDate = readMoveInDate(reservation);
  const leaseEndDate = computeLeaseEndDate(reservation);
  if (!moveInDate || !leaseEndDate) return null;

  const stay = await Stay.create(
    [
      {
        tenantId: reservation.userId?._id || reservation.userId,
        reservationId: reservation._id,
        branch: reservation.roomId?.branch || "",
        roomId: reservation.roomId?._id || reservation.roomId,
        bedId: reservation.selectedBed?.id || "",
        leaseStartDate: moveInDate,
        leaseEndDate,
        monthlyRent: getMonthlyRent(reservation),
        status: hasReservationStatus(reservation.status, "moveOut") ? "completed" : "active",
        endedAt: hasReservationStatus(reservation.status, "moveOut") ? reservation.moveOutDate || null : null,
        endReason: hasReservationStatus(reservation.status, "moveOut") ? "legacy_move_out" : "",
        createdBy: actorId,
        updatedBy: actorId,
      },
    ],
    { session },
  );

  reservation.currentStayId = stay[0]._id;
  reservation.latestStayStatus = stay[0].status;
  await reservation.save({ session });

  return stay[0];
}

async function getAvailableRoomsForStay(stay, excludeCurrent = false) {
  if (!stay?.branch) return [];
  const rooms = await Room.find({
    branch: stay.branch,
    isArchived: { $ne: true },
    available: true,
  })
    .select("name roomNumber branch beds")
    .lean();

  return rooms
    .map((room) => ({
      id: String(room._id),
      name: room.name || room.roomNumber,
      branch: room.branch,
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
  const activeStay = Boolean(stay && stay.status === "active");
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

export async function getTenantActionContext(reservationId) {
  const reservation = await Reservation.findById(reservationId)
    .populate("roomId", "name roomNumber branch beds monthlyPrice price")
    .populate("userId", "firstName lastName email phone tenantStatus")
    .lean();
  if (!reservation) return null;

  const activeStay =
    (await Stay.findOne({
      reservationId,
      status: "active",
    }).lean()) || reservation;

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

  const [bills, renewalHistory, availableRooms, latestUtilityReading] = await Promise.all([
    Bill.find({
      reservationId,
      isArchived: { $ne: true },
    }).lean(),
    Stay.find({ reservationId }).sort({ leaseStartDate: -1 }).lean(),
    getAvailableRoomsForStay(stayLike, false),
    UtilityReading.findOne({
      roomId: reservation.roomId?._id || reservation.roomId,
      tenantId: reservation.userId?._id || reservation.userId,
      eventType: { $in: utilityEventTypesForQuery("moveIn", "moveOut") },
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
  ]);

  const billingSummary = buildBillingSummary(bills);
  const allowedActions = await buildActionAvailability({
    reservation,
    stay: stayLike,
    billingSummary,
  });

  return {
    reservationId: String(reservation._id),
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
    latestUtilityReading: latestUtilityReading
      ? {
          reading: latestUtilityReading.reading,
          date: latestUtilityReading.date,
          eventType: latestUtilityReading.eventType,
        }
      : null,
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

      const activeStay = await ensureActiveStay(reservation, actorId, session);
      if (!activeStay || activeStay.status !== "active") {
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

      const [newStay] = await Stay.create(
        [
          {
            tenantId: reservation.userId?._id || reservation.userId,
            reservationId: reservation._id,
            branch: reservation.roomId?.branch || "",
            roomId: reservation.roomId?._id || reservation.roomId,
            bedId: reservation.selectedBed?.id || "",
            leaseStartDate: newLeaseStartDate,
            leaseEndDate: newLeaseEndDate,
            monthlyRent: Number(payload.monthlyRent ?? getMonthlyRent(reservation)),
            status: "active",
            previousStayId: activeStay._id,
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
      reservation.monthlyRent = Number(payload.monthlyRent ?? getMonthlyRent(reservation));
      await reservation.save({ session });

      result = {
        reservation,
        previousStay: activeStay.toObject(),
        stay: newStay.toObject(),
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function transferStayWorkflow({ reservationId, payload, actorId }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findById(reservationId)
        .populate("roomId", "name roomNumber branch beds currentOccupancy capacity")
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

      const activeStay = await ensureActiveStay(reservation, actorId, session);
      const effectiveTransferDate = normalizeDate(payload.effectiveTransferDate) || new Date();
      if (!activeStay || activeStay.status !== "active") {
        throw Object.assign(new Error("No active stay found for transfer."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
      }

      if (!payload.targetRoomId || !payload.targetBedId) {
        throw Object.assign(new Error("Target room and bed are required."), { statusCode: 400, code: "MISSING_TRANSFER_FIELDS" });
      }
      if (
        String(activeStay.roomId) === String(payload.targetRoomId) &&
        String(activeStay.bedId) === String(payload.targetBedId)
      ) {
        throw Object.assign(new Error("Transfer target must differ from the current room and bed."), { statusCode: 400, code: "SAME_TRANSFER_TARGET" });
      }

      const targetRoom = await Room.findById(payload.targetRoomId).session(session);
      if (!targetRoom) {
        throw Object.assign(new Error("Target room not found."), { statusCode: 404, code: "TARGET_ROOM_NOT_FOUND" });
      }
      if (String(targetRoom.branch) !== String(reservation.roomId?.branch || "")) {
        throw Object.assign(new Error("Transfers are limited to rooms within the same branch."), { statusCode: 400, code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });
      }

      const targetBed = targetRoom.beds.find((bed) => String(bed.id || bed._id) === String(payload.targetBedId));
      if (!targetBed || targetBed.status !== "available") {
        throw Object.assign(new Error("Selected target bed is not available."), { statusCode: 409, code: "BED_NOT_AVAILABLE" });
      }

      const currentRoom = await Room.findById(activeStay.roomId).session(session);
      if (!currentRoom) {
        throw Object.assign(new Error("Current room not found."), { statusCode: 404, code: "CURRENT_ROOM_NOT_FOUND" });
      }
      currentRoom.vacateBed(activeStay.bedId);
      currentRoom.currentOccupancy = Math.max(0, Number(currentRoom.currentOccupancy || 0) - 1);
      currentRoom.updateAvailability();
      await currentRoom.save({ session });

      targetRoom.occupyBed(targetBed.id || String(targetBed._id), reservation.userId?._id || reservation.userId, reservation._id);
      targetRoom.currentOccupancy = Math.min(
        Number(targetRoom.capacity || 0),
        Number(targetRoom.currentOccupancy || 0) + 1,
      );
      targetRoom.updateAvailability();
      await targetRoom.save({ session });

      const activeHistory = await BedHistory.findOne({
        reservationId: reservation._id,
        tenantId: reservation.userId?._id || reservation.userId,
        status: "active",
      })
        .sort({ moveInDate: -1 })
        .session(session);
      if (activeHistory) {
        activeHistory.moveOutDate = effectiveTransferDate;
        activeHistory.effectiveEndDate = effectiveTransferDate;
        activeHistory.status = "transferred";
        activeHistory.closedByAction = "transfer";
        activeHistory.reason = payload.reason || "Room transfer";
        activeHistory.notes = payload.notes || "";
        await activeHistory.save({ session });
      }

      await BedHistory.create(
        [
          {
            bedId: targetBed.id || String(targetBed._id),
            roomId: targetRoom._id,
            branch: targetRoom.branch,
            tenantId: reservation.userId?._id || reservation.userId,
            reservationId: reservation._id,
            stayId: activeStay._id,
            moveInDate: effectiveTransferDate,
            effectiveStartDate: effectiveTransferDate,
            status: "active",
            reason: payload.reason || "Room transfer",
            notes: payload.notes || "",
          },
        ],
        { session },
      );

      activeStay.roomId = targetRoom._id;
      activeStay.bedId = targetBed.id || String(targetBed._id);
      activeStay.transferNotes = payload.notes || payload.reason || "";
      activeStay.updatedBy = actorId;
      await activeStay.save({ session });

      reservation.roomId = targetRoom._id;
      reservation.selectedBed = {
        id: targetBed.id || String(targetBed._id),
        position: targetBed.position || null,
      };
      reservation.currentStayId = activeStay._id;
      reservation.latestStayStatus = activeStay.status;
      await reservation.save({ session });

      result = {
        reservation,
        stay: activeStay.toObject(),
        fromRoomName: currentRoom.name || currentRoom.roomNumber || "Unknown room",
        toRoomName: targetRoom.name || targetRoom.roomNumber || "Unknown room",
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function moveOutStayWorkflow({ reservationId, payload, actorId }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findById(reservationId)
        .populate("roomId", "name roomNumber branch currentOccupancy capacity")
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

      const activeStay = await ensureActiveStay(reservation, actorId, session);
      if (!activeStay || activeStay.status !== "active") {
        throw Object.assign(new Error("No active stay found for move-out."), { statusCode: 400, code: "NO_ACTIVE_STAY" });
      }

      const moveOutAt = parseDateTime(payload.moveOutDate, payload.actualVacateTime || "");
      if (!moveOutAt) {
        throw Object.assign(new Error("A valid move-out date is required."), { statusCode: 400, code: "INVALID_MOVEOUT_DATE" });
      }
      if (readMoveInDate(reservation) && moveOutAt < new Date(readMoveInDate(reservation))) {
        throw Object.assign(new Error("Move-out date cannot be earlier than move-in date."), { statusCode: 400, code: "MOVEOUT_BEFORE_MOVEIN" });
      }
      if (payload.finalUtilityReading == null || Number.isNaN(Number(payload.finalUtilityReading))) {
        throw Object.assign(new Error("A final utility reading is required for move-out."), { statusCode: 400, code: "FINAL_READING_REQUIRED" });
      }

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

      reservation.status = "moveOut";
      reservation.moveOutDate = moveOutAt;
      reservation.currentStayId = activeStay._id;
      reservation.latestStayStatus = activeStay.status;
      await reservation.save({ session });

      const tenant = await User.findById(reservation.userId?._id || reservation.userId).session(session);
      if (tenant) {
        tenant.tenantStatus = "moved_out";
        tenant.branch = reservation.roomId?.branch || tenant.branch;
        await tenant.save({ session });
      }

      await UtilityReading.create(
        [
          {
            utilityType: "electricity",
            roomId: reservation.roomId?._id || reservation.roomId,
            branch: reservation.roomId?.branch || "",
            reading: Number(payload.finalUtilityReading),
            date: moveOutAt,
            eventType: "moveOut",
            tenantId: reservation.userId?._id || reservation.userId,
            recordedBy: actorId,
            utilityPeriodId: null,
            activeTenantIds: [],
          },
        ],
        { session },
      );

      result = {
        reservation,
        stay: activeStay.toObject(),
        billingSummary,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

