/**
 * ============================================================================
 * OCCUPANCY MANAGER UTILITY
 * ============================================================================
 *
 * Handles room occupancy and bed assignment tracking when reservations
 * change status. Automatically updates room availability based on occupancy.
 *
 * OCCUPANCY RULES:
 * - Confirmed (status=confirmed): Room is occupied, bed is assigned
 * - Checked-in (status=checked-in): Room is occupied, bed is occupied
 * - Cancelled (status=cancelled): Room occupancy decreases, bed is vacated
 * - Checked-out (status=checked-out): Room occupancy decreases, bed is vacated
 *
 * ============================================================================
 */

import Room from "../models/Room.js";
import Reservation from "../models/Reservation.js";

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
  try {
    const room = await Room.findById(reservation.roomId);
    if (!room) {
      return null;
    }

    const oldStatus = oldData?.status;
    const newStatus = reservation.status;

    // If status hasn't changed, no occupancy update needed
    if (oldStatus === newStatus) {
      return room;
    }


    // === INCREASE OCCUPANCY ===
    // When transitioning to confirmed or checked-in (if not already confirmed)
    if (
      newStatus === "confirmed" &&
      oldStatus !== "confirmed" &&
      oldStatus !== "checked-in"
    ) {
      const updated = await Room.atomicIncreaseOccupancy(room._id);
      if (!updated) {
      }

      // Assign bed if selected (needs loaded doc)
      if (reservation.selectedBed?.id) {
        // Re-fetch room after atomic update to get latest state
        const freshRoom = await Room.findById(room._id);
        if (freshRoom) {
          const assigned = freshRoom.occupyBed(
            reservation.selectedBed.id,
            reservation.userId,
            reservation._id,
          );
          if (assigned) {
            await freshRoom.save();
          }
        }
      }
    }

    // When checked-in from pending (in case confirmed was skipped)
    if (
      newStatus === "checked-in" &&
      oldStatus !== "confirmed" &&
      oldStatus !== "checked-in"
    ) {
      await Room.atomicIncreaseOccupancy(room._id);

      if (reservation.selectedBed?.id) {
        const freshRoom = await Room.findById(room._id);
        if (freshRoom) {
          const assigned = freshRoom.occupyBed(
            reservation.selectedBed.id,
            reservation.userId,
            reservation._id,
          );
          if (assigned) {
            await freshRoom.save();
          }
        }
      }
    }

    // === DECREASE OCCUPANCY ===
    // When transitioning to cancelled
    if (newStatus === "cancelled" && oldStatus !== "cancelled") {
      await Room.atomicDecreaseOccupancy(room._id);

      // Vacate bed if it was occupied
      if (reservation.selectedBed?.id) {
        const freshRoom = await Room.findById(room._id);
        if (freshRoom) {
          const vacated = freshRoom.vacateBed(reservation.selectedBed.id);
          if (vacated) {
            await freshRoom.save();
          }
        }
      }
    }

    // When transitioning to checked-out
    if (newStatus === "checked-out" && oldStatus !== "checked-out") {
      if (oldStatus === "confirmed" || oldStatus === "checked-in") {
        await Room.atomicDecreaseOccupancy(room._id);

        if (reservation.selectedBed?.id) {
          const freshRoom = await Room.findById(room._id);
          if (freshRoom) {
            const vacated = freshRoom.vacateBed(reservation.selectedBed.id);
            if (vacated) {
              await freshRoom.save();
            }
          }
        }
      }
    }

    // Re-fetch room for return value (atomic ops already updated it)
    const finalRoom = await Room.findById(room._id);


    return finalRoom;
  } catch (error) {
    console.error("❌ Occupancy update error:", error);
    throw error;
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

    // Count all confirmed and checked-in reservations
    const activeReservations = await Reservation.find({
      roomId,
      isArchived: false,
      status: { $in: ["confirmed", "checked-in"] },
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
    console.error("❌ Recalculate occupancy error:", error);
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
    console.error("❌ Get occupancy status error:", error);
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
    console.error("❌ Get branch occupancy stats error:", error);
    throw error;
  }
};

export default {
  updateOccupancyOnReservationChange,
  recalculateRoomOccupancy,
  getRoomOccupancyStatus,
  getBranchOccupancyStats,
};
