/**
 * ============================================================================
 * OCCUPANCY MANAGER UTILITY
 * ============================================================================
 *
 * Handles room occupancy and bed assignment tracking when reservations
 * change status. Automatically updates room availability based on occupancy.
 *
 * OCCUPANCY RULES:
 * - Reserved (status=reserved): Room is occupied, bed is assigned
 * - Moved in (status=moveIn): Room is occupied, bed is occupied
 * - Cancelled (status=cancelled): Room occupancy decreases, bed is vacated
 * - Moved out (status=moveOut): Room occupancy decreases, bed is vacated
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import Room from "../models/Room.js";
import Reservation from "../models/Reservation.js";
import logger from "../middleware/logger.js";
import { emitRoomUpdate, emitDigitalTwinUpdate } from "./socket.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  hasReservationStatus,
  normalizeReservationStatus,
} from "./lifecycleNaming.js";
import { resolveReferencedUser } from "./userReference.js";

const ACTIVE_OCCUPANCY_STATUSES = ACTIVE_OCCUPANCY_STATUS_QUERY;

const getDisplayStatusForReservation = (status) =>
  hasReservationStatus(status, "moveIn") ? "occupied" : "reserved";

const buildOccupantSnapshot = (userRef, reservation, occupiedSince = null) => {
  if (!userRef) return null;
  const occupant = resolveReferencedUser(userRef);
  return {
    _id: occupant.id,
    name: occupant.name,
    email: occupant.email,
    phone: userRef?.phone || null,
    reservationId: reservation?._id || null,
    reservationStatus: reservation?.status || null,
    occupiedSince,
  };
};

const getRoomAvailabilityFromBeds = (room, beds, currentOccupancy) => {
  if (Array.isArray(beds) && beds.length > 0) {
    return beds.some((bed) => bed.status === "available");
  }

  return currentOccupancy < (room.capacity || 0) && !room.isArchived;
};

const getRoomReadinessStatus = (beds, isAvailable) => {
  if (!Array.isArray(beds) || beds.length === 0) {
    return isAvailable ? "available" : "occupied";
  }

  const statuses = new Set(beds.map((bed) => bed.status));
  if (statuses.size === 1) return beds[0]?.status || "available";
  if (statuses.has("available")) return "available";
  if (statuses.has("reserved")) return "reserved";
  if (statuses.has("occupied")) return "occupied";
  if (statuses.has("maintenance")) return "maintenance";
  return "mixed";
};

export const deriveRoomOccupancyState = (room, reservations = []) => {
  const reservationsByBedId = new Map();
  const reservationsByReservationId = new Map();
  const reservationsByUserId = new Map();

  for (const reservation of reservations) {
    reservationsByReservationId.set(String(reservation._id), reservation);

    if (reservation.selectedBed?.id) {
      reservationsByBedId.set(reservation.selectedBed.id, reservation);
    }

    const userId = reservation.userId?._id || reservation.userId;
    if (userId) {
      reservationsByUserId.set(String(userId), reservation);
    }
  }

  const beds = (room.beds || []).map((bed) => {
    const matchedReservation =
      reservationsByBedId.get(bed.id) ||
      (bed.occupiedBy?.reservationId
        ? reservationsByReservationId.get(String(bed.occupiedBy.reservationId))
        : null) ||
      (bed.occupiedBy?.userId
        ? reservationsByUserId.get(String(bed.occupiedBy.userId))
        : null) ||
      null;

    let status = bed.status || "available";
    if (matchedReservation && status !== "maintenance" && status !== "locked") {
      status = getDisplayStatusForReservation(matchedReservation.status);
    }

    return {
      id: bed.id,
      position: bed.position,
      status,
      lockExpiresAt: bed.lockExpiresAt || null,
      lockedBy: bed.lockedBy || null,
      occupant: buildOccupantSnapshot(
        matchedReservation?.userId,
        matchedReservation,
        bed.occupiedBy?.occupiedSince || null,
      ),
    };
  });

  const matchedReservationIds = new Set(
    beds
      .map((bed) => bed.occupant?.reservationId)
      .filter(Boolean)
      .map((reservationId) => String(reservationId)),
  );

  const unmatchedReservations = reservations.filter(
    (reservation) => !matchedReservationIds.has(String(reservation._id)),
  );

  for (const reservation of unmatchedReservations) {
    const freeBed = beds.find((bed) => bed.status === "available");
    if (!freeBed) break;

    freeBed.status = getDisplayStatusForReservation(reservation.status);
    freeBed.occupant = buildOccupantSnapshot(reservation.userId, reservation);
  }

  const occupiedBeds = beds.filter((bed) => bed.status === "occupied");
  const reservedBeds = beds.filter((bed) => bed.status === "reserved");
  const availableBeds = beds.filter((bed) => bed.status === "available");
  const lockedBeds = beds.filter((bed) => bed.status === "locked");
  const maintenanceBeds = beds.filter((bed) => bed.status === "maintenance");
  const currentOccupancy = reservations.length;
  const isAvailable = getRoomAvailabilityFromBeds(room, beds, currentOccupancy);
  const readinessStatus = getRoomReadinessStatus(beds, isAvailable);

  return {
    roomId: room._id,
    roomName: room.name,
    roomNumber: room.roomNumber,
    branch: room.branch,
    floor: room.floor,
    roomType: room.type,
    type: room.type,
    capacity: room.capacity,
    currentOccupancy,
    physicalOccupancy: occupiedBeds.length,
    reservedCount: reservedBeds.length,
    occupancyRate:
      room.capacity > 0
        ? `${Math.round((currentOccupancy / room.capacity) * 100)}%`
        : "0%",
    isAvailable,
    available: isAvailable,
    readinessStatus,
    totalBeds: beds.length,
    beds,
    occupiedBeds: occupiedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      occupiedBy: {
        userId: bed.occupant?._id || null,
        userName: bed.occupant?.name || "Unknown",
        email: bed.occupant?.email || null,
        occupiedSince: bed.occupant?.occupiedSince || null,
        reservationId: bed.occupant?.reservationId || null,
        reservationStatus: bed.occupant?.reservationStatus || null,
      },
    })),
    reservedBeds: reservedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      reservedBy: {
        userId: bed.occupant?._id || null,
        userName: bed.occupant?.name || "Unknown",
        email: bed.occupant?.email || null,
        reservationId: bed.occupant?.reservationId || null,
      },
    })),
    availableBeds: availableBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      lockExpiresAt: bed.lockExpiresAt || null,
    })),
    lockedBeds: lockedBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
      lockExpiresAt: bed.lockExpiresAt || null,
      lockedBy: bed.lockedBy || null,
    })),
    maintenanceBeds: maintenanceBeds.map((bed) => ({
      bedId: bed.id,
      position: bed.position,
    })),
  };
};

/**
 * Update occupancy when reservation status changes
 * @param {Object} reservation - The updated reservation
 * @param {Object} oldData - The previous reservation data
 * @returns {Promise<Object>} - Updated room with occupancy changes
 */
export const updateOccupancyOnReservationChange = async (
  reservation,
  oldData,
) => {
  const oldStatus = oldData?.status;
  const newStatus = normalizeReservationStatus(reservation.status);
  const previousStatus = normalizeReservationStatus(oldStatus);

  // If status hasn't changed, no writes needed — skip opening a session
  if (previousStatus === newStatus) {
    return Room.findById(reservation.roomId);
  }

  const session = await mongoose.startSession();
  let finalRoom = null;

  try {
    // session.withTransaction() handles commit, abort, and retry on
    // transient write conflicts automatically (MongoServerError code 112)
    await session.withTransaction(async () => {
      const room = await Room.findById(reservation.roomId).session(session);
      if (!room) return;

      let roomChanged = false;

      const increaseOccupancy = async () => {
        const updated = await Room.atomicIncreaseOccupancy(room._id, session);
        if (!updated) {
          logger.warn({ roomId: String(room._id) }, "Occupancy increase: no room matched atomic update");
          return false;
        }

        room.currentOccupancy = Math.min((room.currentOccupancy || 0) + 1, room.capacity || 0);
        room.updateAvailability();
        roomChanged = true;
        return true;
      };

      const decreaseOccupancy = async () => {
        const updated = await Room.atomicDecreaseOccupancy(room._id, session);
        if (!updated) {
          logger.warn({ roomId: String(room._id) }, "Occupancy decrease: no room matched atomic update");
          return false;
        }

        room.currentOccupancy = Math.max((room.currentOccupancy || 0) - 1, 0);
        room.updateAvailability();
        roomChanged = true;
        return true;
      };

      // === INCREASE OCCUPANCY ===
      // Transition to reserved (from any state that isn't already reserved/moved in)
      if (
        newStatus === "reserved" &&
        previousStatus !== "reserved" &&
        previousStatus !== "moveIn"
      ) {
        await increaseOccupancy();

        // Mark the bed as "reserved" (not yet occupied — tenant hasn't moved in)
        if (reservation.selectedBed?.id) {
          const bed = room.beds.find((b) => b.id === reservation.selectedBed.id);
          if (bed) {
            bed.status = "reserved";
            bed.lockExpiresAt = null;
            bed.lockedBy = null;
            bed.occupiedBy = {
              userId: reservation.userId,
              reservationId: reservation._id,
              occupiedSince: null,
            };
            roomChanged = true;
          }
        }
      }

      // Transition to moved in:
      //  a) coming from "reserved" → upgrade bed from "reserved" → "occupied" (no occupancy count change)
      //  b) coming from any other state → increase occupancy + occupy bed
      if (newStatus === "moveIn" && previousStatus !== "moveIn") {
        if (previousStatus === "reserved") {
          // Occupancy counter was already increased at reservation time — just upgrade bed status
          if (reservation.selectedBed?.id) {
            const assigned = room.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) roomChanged = true;
          }
        } else {
          // Skipped "reserved" stage — increase occupancy now
          await increaseOccupancy();

          if (reservation.selectedBed?.id) {
            const assigned = room.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) roomChanged = true;
          }
        }
      }

      // === DECREASE OCCUPANCY ===
      if (newStatus === "cancelled" && previousStatus !== "cancelled") {
        await decreaseOccupancy();

        if (reservation.selectedBed?.id) {
          const vacated = room.vacateBed(reservation.selectedBed.id);
          if (vacated) roomChanged = true;
        }
      }

      if (newStatus === "moveOut" && previousStatus !== "moveOut") {
        if (previousStatus === "reserved" || previousStatus === "moveIn") {
          await decreaseOccupancy();

          if (reservation.selectedBed?.id) {
            const vacated = room.vacateBed(reservation.selectedBed.id);
            if (vacated) roomChanged = true;
          }
        }
      }

      if (roomChanged) {
        room.updateAvailability();
        await room.save({ session });
      }

      // Fetch final state within the same session so the return value is consistent
      finalRoom = await Room.findById(room._id).session(session);
    });

    // Broadcast the updated room state to all connected browsers
    // so room cards update live without a manual refresh
    if (finalRoom) {
      emitRoomUpdate(finalRoom._id, {
        currentOccupancy: finalRoom.currentOccupancy,
        available: finalRoom.available,
        capacity: finalRoom.capacity,
      });
      emitDigitalTwinUpdate(finalRoom.branch || null, finalRoom._id);
    }

    return finalRoom;
  } catch (error) {
    logger.error(
      { err: error, reservationId: String(reservation._id) },
      "Occupancy update failed — transaction aborted",
    );
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Recalculate occupancy for a room based on reserved/moved-in reservations
 * @param {string} roomId - Room ID to recalculate
 * @returns {Promise<Object>} - Updated room
 */
export const recalculateRoomOccupancy = async (roomId) => {
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Count all reserved and moved-in reservations
    const activeReservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ACTIVE_OCCUPANCY_STATUSES },
    });

    // Reset occupancy
    room.currentOccupancy = activeReservations.length;

    // Reset bed occupancy status
    room.beds.forEach((bed) => {
      // Don't touch beds locked for maintenance
      if (bed.status === "maintenance") return;

      const occupier = activeReservations.find(
        (res) => res.selectedBed?.id === bed.id,
      );
      if (occupier) {
        // Use the correct status based on whether the tenant has physically moved in
        bed.status = hasReservationStatus(occupier.status, "moveIn")
          ? "occupied"
          : "reserved";
        bed.occupiedBy = {
          userId: occupier.userId,
          reservationId: occupier._id,
          occupiedSince: hasReservationStatus(occupier.status, "moveIn")
            ? occupier.moveInDate || occupier.createdAt || new Date()
            : null,
        };
      } else {
        bed.status = "available";
        bed.occupiedBy = {
          userId: null,
          reservationId: null,
          occupiedSince: null,
        };
      }
    });

    // Update availability
    room.updateAvailability();

    // Save the room
    await room.save();

    return room;
  } catch (error) {
    logger.error({ err: error, roomId: String(roomId) }, "Recalculate occupancy failed");
    throw error;
  }
};

/**
 * Get occupancy status of a room
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} - Occupancy information
 */
export const getRoomOccupancyStatus = async (roomId) => {
  try {
    const room = await Room.findById(roomId).lean();

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const reservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ACTIVE_OCCUPANCY_STATUSES },
    })
      .populate("userId", "firstName lastName email phone")
      .lean();

    return deriveRoomOccupancyState(room, reservations);
  } catch (error) {
    logger.error({ err: error, roomId: String(roomId) }, "Get occupancy status failed");
    throw error;
  }
};

/**
 * Get all room occupancy statistics for a branch
 * @param {string} branch - Branch name ('gil-puyat' or 'guadalupe')
 * @returns {Promise<Object>} - Statistics with room occupancy info
 */
export const getBranchOccupancyStats = async (
  branch = null,
  { includeUserDetails = true } = {},
) => {
  try {
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter).lean();
    const roomIds = rooms.map((room) => room._id);
    let reservations = [];

    if (roomIds.length > 0) {
      const reservationQuery = Reservation.find({
        roomId: { $in: roomIds },
        isArchived: false,
        status: { $in: ACTIVE_OCCUPANCY_STATUSES },
      });

      if (includeUserDetails) {
        reservationQuery.populate("userId", "firstName lastName email phone");
      }

      reservations = await reservationQuery.lean();
    }

    const reservationsByRoom = new Map();
    for (const reservation of reservations) {
      const key = String(reservation.roomId);
      if (!reservationsByRoom.has(key)) reservationsByRoom.set(key, []);
      reservationsByRoom.get(key).push(reservation);
    }

    const stats = rooms.map((room) =>
      deriveRoomOccupancyState(room, reservationsByRoom.get(String(room._id)) || []),
    );

    const totalCapacity = stats.reduce((sum, room) => sum + room.capacity, 0);
    const totalOccupancy = stats.reduce(
      (sum, room) => sum + room.currentOccupancy,
      0,
    );

    // Calculate occupancy rate (handle division by zero)
    const occupancyRate =
      totalCapacity > 0
        ? Math.round((totalOccupancy / totalCapacity) * 100)
        : 0;

    return {
      branch: branch || "all",
      totalRooms: stats.length,
      totalCapacity,
      totalOccupancy,
      overallOccupancyRate: `${occupancyRate}%`,
      rooms: stats,
    };
  } catch (error) {
    logger.error({ err: error, branch }, "Get branch occupancy stats failed");
    throw error;
  }
};

export default {
  deriveRoomOccupancyState,
  updateOccupancyOnReservationChange,
  recalculateRoomOccupancy,
  getRoomOccupancyStatus,
  getBranchOccupancyStats,
};
