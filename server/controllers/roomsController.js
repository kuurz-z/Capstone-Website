/**
 * Room Controllers
 */

import { Room } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";

const normalizeRoomType = (rawType) => {
  if (!rawType) return null;
  const value = String(rawType).toLowerCase();
  if (value.includes("private")) return "private";
  if (value.includes("double") || value.includes("shared")) {
    return "double-sharing";
  }
  if (value.includes("quad")) return "quadruple-sharing";
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

export const getRooms = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { branch, type, available } = req.query;
    const filter = {};

    // Build filter object based on provided query parameters
    if (branch) {
      filter.branch = branch;
    }
    if (type) {
      filter.type = type;
    }
    if (available !== undefined) {
      filter.available = available === "true";
    }

    // Fetch rooms matching the filter, excluding version key
    const rooms = await Room.find(filter).select("-__v").lean();
    const normalizedRooms = rooms.map(normalizeRoom);

    console.log(
      `✅ Retrieved ${normalizedRooms.length} rooms with filter:`,
      filter,
    );
    res.json(normalizedRooms);
  } catch (error) {
    console.error("❌ Fetch rooms error:", error);
    res.status(500).json({
      error: "Failed to fetch rooms",
      details: error.message,
      code: "FETCH_ROOMS_ERROR",
    });
  }
};

export const createRoom = async (req, res) => {
  try {
    // Validate required fields
    const { name, branch, type, capacity, price } = req.body;

    if (!name || !branch || !type || !capacity || !price) {
      return res.status(400).json({
        error:
          "Missing required fields: name, branch, type, capacity, and price are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Ensure admin can only create rooms for their branch (unless super admin)
    if (req.branchFilter && branch !== req.branchFilter) {
      return res.status(403).json({
        error: `Access denied. You can only create rooms for ${req.branchFilter} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    // Create new room instance (uses shared Room model with branch field)
    const room = new Room(req.body);

    // Save to database
    await room.save();

    // Log room creation
    await auditLogger.logModification(
      req,
      "room",
      room._id,
      null,
      room.toObject(),
      `Created room: ${room.name}`,
    );

    console.log(`✅ Room created: ${room.name} (${room._id}) for ${branch}`);
    res.status(201).json({
      message: "Room created successfully",
      roomId: room._id,
      room,
    });
  } catch (error) {
    console.error("❌ Create room error:", error);
    await auditLogger.logError(req, error, "Failed to create room");

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    res.status(500).json({
      error: "Failed to create room",
      details: error.message,
      code: "CREATE_ROOM_ERROR",
    });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Validate roomId format
    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid room ID format",
        code: "INVALID_ROOM_ID",
      });
    }

    // Build query with branch filter
    const query = { _id: roomId };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    // Find room first to check access
    const existingRoom = await Room.findOne(query);
    if (!existingRoom) {
      return res.status(404).json({
        error: "Room not found or access denied",
        code: "ROOM_NOT_FOUND",
      });
    }

    // Store old data for audit log
    const oldRoomData = existingRoom.toObject();

    // Prevent changing branch (unless super admin)
    if (
      req.body.branch &&
      req.body.branch !== existingRoom.branch &&
      req.branchFilter
    ) {
      return res.status(403).json({
        error: "Cannot change room branch. Contact a super admin.",
        code: "BRANCH_CHANGE_DENIED",
      });
    }

    // Update room and return the updated document
    const room = await Room.findByIdAndUpdate(roomId, req.body, {
      new: true,
      runValidators: true,
    });

    // Log room modification
    await auditLogger.logModification(
      req,
      "room",
      roomId,
      oldRoomData,
      room.toObject(),
    );

    console.log(`✅ Room updated: ${room.name} (${room._id})`);
    res.json({
      message: "Room updated successfully",
      room,
    });
  } catch (error) {
    console.error("❌ Update room error:", error);
    await auditLogger.logError(req, error, "Failed to update room");

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
        error: "Invalid room ID format",
        code: "INVALID_ROOM_ID",
      });
    }

    res.status(500).json({
      error: "Failed to update room",
      details: error.message,
      code: "UPDATE_ROOM_ERROR",
    });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Validate roomId format
    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid room ID format",
        code: "INVALID_ROOM_ID",
      });
    }

    // Build query with branch filter
    const query = { _id: roomId };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    // Find and delete room
    const room = await Room.findOneAndDelete(query);

    if (!room) {
      return res.status(404).json({
        error: "Room not found or access denied",
        code: "ROOM_NOT_FOUND",
      });
    }

    // Log room deletion
    await auditLogger.logDeletion(
      req,
      "room",
      roomId,
      room.toObject(),
      `Deleted room: ${room.name}`,
    );

    console.log(`✅ Room deleted: ${room.name} (${room._id})`);
    res.json({
      message: "Room deleted successfully",
      deletedRoom: {
        id: room._id,
        name: room.name,
        branch: room.branch,
      },
    });
  } catch (error) {
    console.error("❌ Delete room error:", error);
    await auditLogger.logError(req, error, "Failed to delete room");

    // Handle cast errors (invalid ID)
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid room ID format",
        code: "INVALID_ROOM_ID",
      });
    }

    res.status(500).json({
      error: "Failed to delete room",
      details: error.message,
      code: "DELETE_ROOM_ERROR",
    });
  }
};

/* ─── PATCH bed status (lock/unlock for maintenance) ───────────── */
export const updateBedStatus = async (req, res) => {
  try {
    const { roomId, bedId } = req.params;
    const { status } = req.body; // "maintenance" or "available"

    if (!["maintenance", "available"].includes(status)) {
      return res.status(400).json({
        error: "Invalid bed status. Use 'maintenance' or 'available'.",
        code: "INVALID_BED_STATUS",
      });
    }

    const query = { _id: roomId };
    if (req.branchFilter) query.branch = req.branchFilter;

    const room = await Room.findOne(query);
    if (!room) {
      return res.status(404).json({ error: "Room not found", code: "ROOM_NOT_FOUND" });
    }

    let success;
    if (status === "maintenance") {
      success = room.lockBedForMaintenance(bedId);
    } else {
      success = room.unlockBed(bedId);
    }

    if (!success) {
      return res.status(404).json({ error: "Bed not found or already in requested state", code: "BED_NOT_FOUND" });
    }

    await room.save();

    await auditLogger.logModification(req, "room", roomId, null, null, `Bed ${bedId} → ${status}`);
    console.log(`✅ Bed ${bedId} in ${room.name} → ${status}`);
    res.json({ message: `Bed ${bedId} set to ${status}`, room });
  } catch (error) {
    console.error("❌ Update bed status error:", error);
    res.status(500).json({ error: "Failed to update bed status", code: "BED_STATUS_ERROR" });
  }
};
