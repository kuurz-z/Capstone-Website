/**
 * Room Controllers
 */

import { Room } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";

const normalizeRoomType = (rawType) => {
  if (!rawType) return null;
  const value = String(rawType).toLowerCase();
  if (value.includes("private")) return "private";
  if (value.includes("double") || value.includes("shared")) {
    return "double-sharing";
  }
  if (value.includes("quad") || value.includes("six") || value.includes("6-person")) return "quadruple-sharing";
  return null;
};

const normalizeBranch = (rawBranch) => {
  if (!rawBranch) return null;
  const value = String(rawBranch).toLowerCase();
  if (value.includes("gil")) return "gil-puyat";
  if (value.includes("guad")) return "guadalupe";
  return null;
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

export const getRooms = async (req, res, next) => {
  try {
    const { branch, type, available } = req.query;
    const filter = { isArchived: false };

    if (branch) filter.branch = branch;
    if (type) filter.type = type;
    if (available !== undefined) filter.available = available === "true";

    const rooms = await Room.find(filter).select("-__v").lean();
    const normalizedRooms = rooms.map(normalizeRoom);

    sendSuccess(res, normalizedRooms);
  } catch (error) {
    next(error);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    const { name, branch, type, capacity, price } = req.body;

    if (!name || !branch || !type || !capacity || !price) {
      throw new AppError(
        "Missing required fields: name, branch, type, capacity, and price are required",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }



    if (req.branchFilter && branch !== req.branchFilter) {
      throw new AppError(
        `Access denied. You can only create rooms for ${req.branchFilter} branch.`,
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }

    const room = new Room(req.body);
    await room.save();

    await auditLogger.logModification(
      req,
      "room",
      room._id,
      null,
      room.toObject(),
      `Created room: ${room.name}`,
    );

    sendSuccess(res, { message: "Room created successfully", roomId: room._id, room }, 201);
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



    const oldRoomData = existingRoom.toObject();

    if (req.body.branch && req.body.branch !== existingRoom.branch && req.branchFilter) {
      throw new AppError(
        "Cannot change room branch. Contact a super admin.",
        403,
        "BRANCH_CHANGE_DENIED",
      );
    }

    const room = await Room.findByIdAndUpdate(roomId, req.body, {
      new: true,
      runValidators: true,
    });

    await auditLogger.logModification(req, "room", roomId, oldRoomData, room.toObject());

    sendSuccess(res, { message: "Room updated successfully", room });
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

    const room = await Room.findOneAndDelete(query);
    if (!room) {
      throw new AppError("Room not found or access denied", 404, "ROOM_NOT_FOUND");
    }

    await auditLogger.logDeletion(
      req,
      "room",
      roomId,
      room.toObject(),
      `Deleted room: ${room.name}`,
    );

    sendSuccess(res, {
      message: "Room deleted successfully",
      deletedRoom: { id: room._id, name: room.name, branch: room.branch },
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to delete room");
    next(error);
  }
};

/* ─── PATCH bed status (lock/unlock for maintenance) ───────────── */
export const updateBedStatus = async (req, res, next) => {
  try {
    const { roomId, bedId } = req.params;
    const { status } = req.body;

    if (!["maintenance", "available"].includes(status)) {
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
    if (status === "maintenance") {
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
    await auditLogger.logModification(req, "room", roomId, null, null, `Bed ${bedId} → ${status}`);

    sendSuccess(res, { message: `Bed ${bedId} set to ${status}`, room });
  } catch (error) {
    next(error);
  }
};
