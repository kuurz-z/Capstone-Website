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
 * - Checked-in (status=checked-in): Room is occupied, bed is occupied
 * - Cancelled (status=cancelled): Room occupancy decreases, bed is vacated
 * - Checked-out (status=checked-out): Room occupancy decreases, bed is vacated
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import Room from "../models/Room.js";
import Reservation from "../models/Reservation.js";
import logger from "../middleware/logger.js";
import { emitRoomUpdate } from "./socket.js";

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
  const newStatus = reservation.status;

  // If status hasn't changed, no writes needed — skip opening a session
  if (oldStatus === newStatus) {
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

      // === INCREASE OCCUPANCY ===
      // Transition to reserved (from any state that isn't already reserved/checked-in)
      if (
        newStatus === "reserved" &&
        oldStatus !== "reserved" &&
        oldStatus !== "checked-in"
      ) {
        const updated = await Room.atomicIncreaseOccupancy(room._id, session);
        if (!updated) {
          logger.warn({ roomId: String(room._id) }, "Occupancy increase: no room matched atomic update");
        }

        if (reservation.selectedBed?.id) {
          const freshRoom = await Room.findById(room._id).session(session);
          if (freshRoom) {
            const assigned = freshRoom.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) await freshRoom.save({ session });
          }
        }
      }

      // Transition to checked-in directly (reserved step was skipped)
      if (
        newStatus === "checked-in" &&
        oldStatus !== "reserved" &&
        oldStatus !== "checked-in"
      ) {
        await Room.atomicIncreaseOccupancy(room._id, session);

        if (reservation.selectedBed?.id) {
          const freshRoom = await Room.findById(room._id).session(session);
          if (freshRoom) {
            const assigned = freshRoom.occupyBed(
              reservation.selectedBed.id,
              reservation.userId,
              reservation._id,
            );
            if (assigned) await freshRoom.save({ session });
          }
        }
      }

      // === DECREASE OCCUPANCY ===
      if (newStatus === "cancelled" && oldStatus !== "cancelled") {
        await Room.atomicDecreaseOccupancy(room._id, session);

        if (reservation.selectedBed?.id) {
          const freshRoom = await Room.findById(room._id).session(session);
          if (freshRoom) {
            const vacated = freshRoom.vacateBed(reservation.selectedBed.id);
            if (vacated) await freshRoom.save({ session });
          }
        }
      }

      if (newStatus === "checked-out" && oldStatus !== "checked-out") {
        if (oldStatus === "reserved" || oldStatus === "checked-in") {
          await Room.atomicDecreaseOccupancy(room._id, session);

          if (reservation.selectedBed?.id) {
            const freshRoom = await Room.findById(room._id).session(session);
            if (freshRoom) {
              const vacated = freshRoom.vacateBed(reservation.selectedBed.id);
              if (vacated) await freshRoom.save({ session });
            }
          }
        }
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
 * Recalculate occupancy for a room based on confirmed/checked-in reservations
 * @param {string} roomId - Room ID to recalculate
 * @returns {Promise<Object>} - Updated room
 */
export const recalculateRoomOccupancy = async (roomId) => {
  try {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Count all reserved and checked-in reservations
    const activeReservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ["reserved", "checked-in"] },
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
        bed.status = "occupied";
        bed.occupiedBy = {
          userId: occupier.userId,
          reservationId: occupier._id,
          occupiedSince: occupier.createdAt,
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
    const room = await Room.findById(roomId).populate(
      "beds.occupiedBy.userId",
      "firstName lastName email",
    );

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const occupiedBeds = room.beds.filter((bed) => bed.status === "occupied");
    const maintenanceBeds = room.beds.filter((bed) => bed.status === "maintenance");
    const availableBeds = room.beds.filter((bed) => bed.status === "available");

    return {
      roomName: room.name,
      roomType: room.type,
      capacity: room.capacity,
      currentOccupancy: room.currentOccupancy,
      occupancyRate:
        room.capacity > 0
          ? `${Math.round((room.currentOccupancy / room.capacity) * 100)}%`
          : "0%",
      isAvailable: room.available,
      totalBeds: room.beds.length,
      occupiedBeds: occupiedBeds.map((bed) => ({
        bedId: bed.id,
        position: bed.position,
        occupiedBy: {
          userId: bed.occupiedBy?.userId?._id,
          userName:
            bed.occupiedBy?.userId?.firstName +
            " " +
            bed.occupiedBy?.userId?.lastName,
          email: bed.occupiedBy?.userId?.email,
          occupiedSince: bed.occupiedBy?.occupiedSince,
        },
      })),
      availableBeds: availableBeds.map((bed) => ({
        bedId: bed.id,
        position: bed.position,
      })),
      maintenanceBeds: maintenanceBeds.map((bed) => ({
        bedId: bed.id,
        position: bed.position,
      })),
    };
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
export const getBranchOccupancyStats = async (branch = null) => {
  try {
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter);

    const stats = await Promise.all(
      rooms.map(async (room) => {
        const occupancyStatus = await getRoomOccupancyStatus(room._id);
        return occupancyStatus;
      }),
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
  updateOccupancyOnReservationChange,
  recalculateRoomOccupancy,
  getRoomOccupancyStatus,
  getBranchOccupancyStats,
};
