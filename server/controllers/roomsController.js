/**
 * Room controllers.
 */

import {
  Room,
  Reservation,
  BillingPeriod,
  UtilityPeriod,
  MaintenanceRequest,
  ROOM_BRANCHES,
} from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import {
  getBusinessSettings,
  getBranchSettings,
} from "../utils/businessSettings.js";
import { deriveRoomOccupancyState } from "../utils/occupancyManager.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  reservationStatusesForQuery,
} from "../utils/lifecycleNaming.js";

const ROOM_CREATE_FIELDS = Object.freeze([
  "name",
  "roomNumber",
  "description",
  "floor",
  "branch",
  "type",
  "capacity",
  "price",
  "monthlyPrice",
  "amenities",
  "policies",
  "intendedTenant",
  "images",
  "beds",
]);

const ROOM_UPDATE_FIELDS = Object.freeze(
  ROOM_CREATE_FIELDS.filter((field) => field !== "beds"),
);

const SYSTEM_OWNED_ROOM_FIELDS = Object.freeze([
  "currentOccupancy",
  "available",
  "isArchived",
  "archivedAt",
  "archivedBy",
]);

const SYSTEM_OWNED_BED_FIELDS = Object.freeze([
  "occupiedBy",
  "lockExpiresAt",
  "lockedBy",
]);

const SYSTEM_OWNED_BED_STATUSES = new Set(["locked", "reserved", "occupied"]);
const ADMIN_EDITABLE_BED_STATUSES = new Set(["available", "maintenance"]);

const normalizeRoomType = (rawType) => {
  if (!rawType) return null;
  const value = String(rawType).toLowerCase();
  if (value.includes("private")) return "private";
  if (value.includes("double") || value.includes("shared")) {
    return "double-sharing";
  }
  if (
    value.includes("quad") ||
    value.includes("six") ||
    value.includes("6-person")
  ) {
    return "quadruple-sharing";
  }
  return null;
};

const normalizeBranch = (rawBranch) => {
  if (!rawBranch) return null;
  const value = String(rawBranch).toLowerCase();
  if (value.includes("gil")) return "gil-puyat";
  if (value.includes("guad")) return "guadalupe";
  return value;
};

const normalizeRoom = (room) => {
  const name =
    room.name || room.roomNumber || room.room_number || room.room_id || null;
  const roomNumber =
    room.roomNumber || room.room_number || room.name || room.room_id || null;
  const type = normalizeRoomType(room.type || room.room_type);
  const branch = normalizeBranch(room.branch);
  const capacity = room.capacity ?? null;
  const currentOccupancy = room.currentOccupancy ?? 0;
  const price = room.price ?? room.regular_price ?? null;
  const available =
    typeof room.available === "boolean"
      ? room.available
      : typeof room.status === "string"
        ? room.status.toLowerCase() === "available"
        : capacity !== null
          ? currentOccupancy < capacity
          : undefined;

  return {
    ...room,
    name,
    roomNumber,
    type,
    branch,
    capacity,
    currentOccupancy,
    price,
    available,
  };
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const pickFields = (payload, allowedFields) =>
  Object.fromEntries(
    Object.entries(payload || {}).filter(([field]) => allowedFields.includes(field)),
  );

const generateDefaultBeds = (type, capacity) => {
  if (type === "private") {
    return [
      { id: "bed-1", position: "upper", status: "available" },
      { id: "bed-2", position: "lower", status: "available" },
    ];
  }

  return Array.from({ length: Number(capacity) || 0 }, (_, index) => ({
    id: `bed-${index + 1}`,
    position: index % 2 === 0 ? "upper" : "lower",
    status: "available",
  }));
};

const normalizeBedPayload = (beds = [], fallbackType, fallbackCapacity) => {
  const sourceBeds = Array.isArray(beds) && beds.length > 0
    ? beds
    : generateDefaultBeds(fallbackType, fallbackCapacity);

  return sourceBeds.map((bed, index) => ({
    id: String(bed.id || `bed-${index + 1}`),
    position: bed.position,
    status: bed.status === "maintenance" ? "maintenance" : "available",
  }));
};

const assertNoSystemOwnedRoomFields = (payload, { allowBeds }) => {
  const forbiddenRoomFields = SYSTEM_OWNED_ROOM_FIELDS.filter(
    (field) => payload?.[field] !== undefined,
  );

  if (payload?.beds !== undefined && !allowBeds) {
    forbiddenRoomFields.push("beds");
  }

  if (forbiddenRoomFields.length > 0) {
    throw new AppError(
      `Room payload contains system-owned fields: ${forbiddenRoomFields.join(", ")}`,
      400,
      "ROOM_SYSTEM_FIELDS_FORBIDDEN",
      { fields: forbiddenRoomFields },
    );
  }

  if (!Array.isArray(payload?.beds)) {
    return;
  }

  const forbiddenBedFields = [];
  for (const bed of payload.beds) {
    for (const field of SYSTEM_OWNED_BED_FIELDS) {
      if (bed?.[field] !== undefined) {
        forbiddenBedFields.push(field);
      }
    }

    if (bed?.status && SYSTEM_OWNED_BED_STATUSES.has(String(bed.status))) {
      forbiddenBedFields.push(`status:${bed.status}`);
    }
  }

  if (forbiddenBedFields.length > 0) {
    throw new AppError(
      "Bed payload contains system-owned occupancy fields",
      400,
      "BED_SYSTEM_FIELDS_FORBIDDEN",
      { fields: [...new Set(forbiddenBedFields)] },
    );
  }
};

const sanitizeRoomPayload = (payload, { allowBeds }) => {
  assertNoSystemOwnedRoomFields(payload, { allowBeds });

  const allowedFields = allowBeds ? ROOM_CREATE_FIELDS : ROOM_UPDATE_FIELDS;
  const sanitized = pickFields(payload, allowedFields);

  if (sanitized.name !== undefined) sanitized.name = String(sanitized.name).trim();
  if (sanitized.roomNumber !== undefined) {
    sanitized.roomNumber = String(sanitized.roomNumber).trim();
  }
  if (sanitized.description !== undefined) {
    sanitized.description = String(sanitized.description || "").trim();
  }
  if (sanitized.intendedTenant !== undefined) {
    sanitized.intendedTenant = String(sanitized.intendedTenant || "").trim();
  }
  if (sanitized.branch !== undefined) {
    sanitized.branch = normalizeBranch(sanitized.branch);
  }
  if (sanitized.type !== undefined) {
    sanitized.type = normalizeRoomType(sanitized.type) || sanitized.type;
  }
  if (sanitized.floor !== undefined) sanitized.floor = parseNumber(sanitized.floor);
  if (sanitized.capacity !== undefined) {
    sanitized.capacity = parseNumber(sanitized.capacity);
  }
  if (sanitized.price !== undefined) sanitized.price = parseNumber(sanitized.price);
  if (sanitized.monthlyPrice !== undefined) {
    sanitized.monthlyPrice = parseNumber(sanitized.monthlyPrice);
  }
  if (sanitized.amenities !== undefined) {
    sanitized.amenities = Array.isArray(sanitized.amenities)
      ? sanitized.amenities.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }
  if (sanitized.policies !== undefined) {
    sanitized.policies = Array.isArray(sanitized.policies)
      ? sanitized.policies.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }
  if (sanitized.images !== undefined) {
    sanitized.images = Array.isArray(sanitized.images)
      ? sanitized.images.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  }

  if (allowBeds) {
    sanitized.beds = normalizeBedPayload(
      sanitized.beds,
      sanitized.type,
      sanitized.capacity,
    );
  }

  return sanitized;
};

const buildRoomQueryFilter = (query = {}) => {
  const filter = { isArchived: false };

  if (query.branch) filter.branch = query.branch;
  if (query.type) filter.type = query.type;
  if (query.available !== undefined) filter.available = query.available === "true";

  const floor = parsePositiveInt(query.floor);
  if (floor !== null) filter.floor = floor;

  const search = String(query.search || "").trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { roomNumber: { $regex: escaped, $options: "i" } },
    ];
  }

  return filter;
};

const attachBranchSettings = (rooms, settings) =>
  rooms.map((room) => {
    const normalizedRoom = normalizeRoom(room);
    const branchSettings = getBranchSettings(normalizedRoom.branch, settings);
    return {
      ...normalizedRoom,
      applianceFeeEnabled: !!branchSettings?.isApplianceFeeEnabled,
      applianceFeeAmountPerUnit: branchSettings?.applianceFeeAmountPerUnit ?? 0,
    };
  });

const assertBranchCode = (branch) => {
  if (!ROOM_BRANCHES.includes(branch)) {
    throw new AppError(
      `Invalid branch. Must be one of: ${ROOM_BRANCHES.join(", ")}`,
      400,
      "INVALID_BRANCH",
    );
  }
};

const ensureUniqueRoomNumber = async ({ roomId = null, branch, roomNumber }) => {
  const duplicate = await Room.findOne({
    _id: roomId ? { $ne: roomId } : { $exists: true },
    branch,
    roomNumber,
    isArchived: false,
  })
    .select("_id name roomNumber branch")
    .lean();

  if (duplicate) {
    throw new AppError(
      `Room number ${roomNumber} already exists in ${branch}.`,
      409,
      "ROOM_NUMBER_ALREADY_EXISTS",
    );
  }
};

const buildOccupancyConsistencyReport = (room, reservations) => {
  const derived = deriveRoomOccupancyState(room, reservations);
  const storedOccupiedBeds = (room.beds || []).filter(
    (bed) => bed.status === "occupied",
  ).length;
  const storedReservedBeds = (room.beds || []).filter(
    (bed) => bed.status === "reserved",
  ).length;
  const activeReservationCount = reservations.length;
  const movedInReservationCount = reservations.filter(
    (reservation) => reservation.status === "moveIn",
  ).length;
  const reservedReservationCount = reservations.filter(
    (reservation) => reservation.status === "reserved",
  ).length;

  const issues = [];

  if ((room.currentOccupancy || 0) !== derived.currentOccupancy) {
    issues.push({
      code: "CURRENT_OCCUPANCY_MISMATCH",
      message:
        "Room currentOccupancy does not match reservation-derived occupancy.",
      stored: room.currentOccupancy || 0,
      derived: derived.currentOccupancy,
    });
  }

  if (Boolean(room.available) !== Boolean(derived.available)) {
    issues.push({
      code: "ROOM_AVAILABILITY_MISMATCH",
      message: "Room availability does not match reservation-derived readiness.",
      stored: Boolean(room.available),
      derived: Boolean(derived.available),
    });
  }

  if (storedOccupiedBeds !== movedInReservationCount) {
    issues.push({
      code: "OCCUPIED_BED_MISMATCH",
      message: "Occupied beds do not match moved-in reservations.",
      stored: storedOccupiedBeds,
      derived: movedInReservationCount,
    });
  }

  if (storedReservedBeds !== reservedReservationCount) {
    issues.push({
      code: "RESERVED_BED_MISMATCH",
      message: "Reserved beds do not match reserved reservations.",
      stored: storedReservedBeds,
      derived: reservedReservationCount,
    });
  }

  if (activeReservationCount !== derived.currentOccupancy) {
    issues.push({
      code: "ACTIVE_RESERVATION_COUNT_MISMATCH",
      message: "Active reservation count does not match derived occupancy.",
      stored: activeReservationCount,
      derived: derived.currentOccupancy,
    });
  }

  return {
    roomId: room._id,
    roomName: room.name,
    roomNumber: room.roomNumber,
    branch: room.branch,
    capacity: room.capacity,
    issueCount: issues.length,
    issues,
    storedState: {
      currentOccupancy: room.currentOccupancy || 0,
      available: Boolean(room.available),
      occupiedBeds: storedOccupiedBeds,
      reservedBeds: storedReservedBeds,
    },
    derivedState: {
      currentOccupancy: derived.currentOccupancy,
      available: Boolean(derived.available),
      occupiedBeds: movedInReservationCount,
      reservedBeds: reservedReservationCount,
    },
  };
};

export const getRooms = async (req, res, next) => {
  try {
    const filter = buildRoomQueryFilter(req.query);
    const page = parsePositiveInt(req.query.page);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize) || 20, 100);
    const hasPagination = page !== null;
    const settings = await getBusinessSettings();

    if (!hasPagination) {
      const rooms = await Room.find(filter)
        .select("-__v")
        .sort({ branch: 1, floor: 1, roomNumber: 1 })
        .lean();
      sendSuccess(res, attachBranchSettings(rooms, settings));
      return;
    }

    const total = await Room.countDocuments(filter);
    const rooms = await Room.find(filter)
      .select("-__v")
      .sort({ branch: 1, floor: 1, roomNumber: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    sendSuccess(res, {
      items: attachBranchSettings(rooms, settings),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomById = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
    }

    const room = await Room.findOne({ _id: roomId, isArchived: false })
      .select("-__v")
      .lean();
    if (!room) {
      throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
    }

    const settings = await getBusinessSettings();
    const [normalizedRoom] = attachBranchSettings([room], settings);
    sendSuccess(res, normalizedRoom);
  } catch (error) {
    next(error);
  }
};

export const getOccupancyConsistency = async (req, res, next) => {
  try {
    const includeAll = req.query.includeAll === "true";
    const requestedBranchRaw = String(req.query.branch || "").trim();
    const requestedBranch =
      requestedBranchRaw && requestedBranchRaw !== "all"
        ? normalizeBranch(requestedBranchRaw)
        : null;

    if (requestedBranch) {
      assertBranchCode(requestedBranch);
    }

    const filter = { isArchived: false };
    if (req.branchFilter) {
      filter.branch = req.branchFilter;
    } else if (requestedBranch) {
      filter.branch = requestedBranch;
    }

    const rooms = await Room.find(filter)
      .select("_id name roomNumber branch capacity currentOccupancy available beds")
      .sort({ branch: 1, floor: 1, roomNumber: 1 })
      .lean();

    const roomIds = rooms.map((room) => room._id);
    const reservations = roomIds.length > 0
      ? await Reservation.find({
          roomId: { $in: roomIds },
          isArchived: false,
          status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
        })
          .select("_id roomId userId selectedBed status")
          .lean()
      : [];

    const reservationsByRoom = new Map();
    for (const reservation of reservations) {
      const roomKey = String(reservation.roomId);
      if (!reservationsByRoom.has(roomKey)) {
        reservationsByRoom.set(roomKey, []);
      }
      reservationsByRoom.get(roomKey).push(reservation);
    }

    const report = rooms.map((room) =>
      buildOccupancyConsistencyReport(
        room,
        reservationsByRoom.get(String(room._id)) || [],
      ),
    );
    const inconsistentRooms = report.filter((entry) => entry.issueCount > 0);

    sendSuccess(res, {
      summary: {
        totalRooms: report.length,
        inconsistentRooms: inconsistentRooms.length,
        consistentRooms: report.length - inconsistentRooms.length,
      },
      rooms: includeAll ? report : inconsistentRooms,
    });
  } catch (error) {
    next(error);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    const roomData = sanitizeRoomPayload(req.body, { allowBeds: true });
    const { name, roomNumber, branch, type, capacity, price } = roomData;

    if (!name || !roomNumber || !branch || !type || !capacity || price === undefined) {
      throw new AppError(
        "Missing required fields: name, roomNumber, branch, type, capacity, and price are required",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    assertBranchCode(branch);

    if (req.branchFilter && branch !== req.branchFilter) {
      throw new AppError(
        `Access denied. You can only create rooms for ${req.branchFilter} branch.`,
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }

    await ensureUniqueRoomNumber({ branch, roomNumber });

    const room = new Room({
      ...roomData,
      beds: roomData.beds?.length
        ? roomData.beds
        : generateDefaultBeds(type, capacity),
    });
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      room._id,
      null,
      room.toObject(),
      `Created room: ${room.name}`,
    );

    sendSuccess(
      res,
      { message: "Room created successfully", roomId: room._id, room },
      201,
    );
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to create room");
    next(error);
  }
};

export const updateRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
    }

    const query = { _id: roomId };
    if (req.branchFilter) query.branch = req.branchFilter;

    const existingRoom = await Room.findOne(query);
    if (!existingRoom) {
      throw new AppError("Room not found or access denied", 404, "ROOM_NOT_FOUND");
    }

    const roomData = sanitizeRoomPayload(req.body, { allowBeds: false });
    const oldRoomData = existingRoom.toObject();

    if (roomData.branch && roomData.branch !== existingRoom.branch && req.branchFilter) {
      throw new AppError(
        "Cannot change room branch. Contact an owner.",
        403,
        "BRANCH_CHANGE_DENIED",
      );
    }

    const nextBranch = roomData.branch || existingRoom.branch;
    const nextRoomNumber = roomData.roomNumber || existingRoom.roomNumber;
    assertBranchCode(nextBranch);
    await ensureUniqueRoomNumber({
      roomId: existingRoom._id,
      branch: nextBranch,
      roomNumber: nextRoomNumber,
    });

    Object.assign(existingRoom, roomData);
    await existingRoom.save();

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      oldRoomData,
      existingRoom.toObject(),
    );

    sendSuccess(res, { message: "Room updated successfully", room: existingRoom });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update room");
    next(error);
  }
};

export const deleteRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
    }

    const query = { _id: roomId };
    if (req.branchFilter) query.branch = req.branchFilter;

    const room = await Room.findOne(query);
    if (!room) {
      throw new AppError("Room not found or access denied", 404, "ROOM_NOT_FOUND");
    }

    const [
      activeReservationCount,
      openBillingPeriodCount,
      openUtilityPeriodCount,
      openMaintenanceCount,
    ] = await Promise.all([
      Reservation.countDocuments({
        roomId,
        isArchived: false,
        status: {
          $nin: reservationStatusesForQuery("moveOut", "cancelled", "archived"),
        },
      }),
      BillingPeriod.countDocuments({
        roomId,
        isArchived: false,
        status: "open",
      }),
      UtilityPeriod.countDocuments({
        roomId,
        isArchived: false,
        status: "open",
      }),
      MaintenanceRequest.countDocuments({
        roomId,
        isArchived: false,
        status: { $nin: ["completed", "cancelled"] },
      }),
    ]);

    if (
      activeReservationCount > 0 ||
      openBillingPeriodCount > 0 ||
      openUtilityPeriodCount > 0 ||
      openMaintenanceCount > 0
    ) {
      throw new AppError(
        "Room cannot be archived while it has active reservations, open billing periods, open utility periods, or unresolved maintenance work.",
        409,
        "ROOM_ARCHIVE_BLOCKED",
        {
          activeReservationCount,
          openBillingPeriodCount,
          openUtilityPeriodCount,
          openMaintenanceCount,
        },
      );
    }

    const before = room.toObject();
    await room.archive(req.user?._id || null);

    await auditLogger.logModification(
      req,
      "room",
      roomId,
      before,
      room.toObject(),
      `Archived room: ${room.name}`,
    );

    sendSuccess(res, {
      message: "Room archived successfully",
      archivedRoom: { id: room._id, name: room.name, branch: room.branch },
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to archive room");
    next(error);
  }
};

export const updateBedStatus = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const requestedStatus = String(req.body?.status || "").trim();

    if (!ADMIN_EDITABLE_BED_STATUSES.has(requestedStatus)) {
      throw new AppError(
        "Invalid bed status. Use 'maintenance' or 'available'.",
        400,
        "INVALID_BED_STATUS",
      );
    }

    const query = { _id: roomId };
    if (req.branchFilter) query.branch = req.branchFilter;

    const room = await Room.findOne(query);
    if (!room) {
      throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
    }

    let success;
    if (requestedStatus === "maintenance") {
      success = room.lockBedForMaintenance(bedId);
    } else {
      success = room.unlockBed(bedId);
    }

    if (!success) {
      throw new AppError(
        "Bed not found or already in requested state",
        404,
        "BED_NOT_FOUND",
      );
    }

    await room.save();
    await auditLogger.logModification(
      req,
      "room",
      roomId,
      null,
      null,
      `Bed ${bedId} -> ${requestedStatus}`,
    );

    sendSuccess(res, { message: `Bed ${bedId} set to ${requestedStatus}`, room });
  } catch (error) {
    next(error);
  }
};
