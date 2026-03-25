/**
 * ============================================================================
 * OCCUPANCY CONTROLLERS
 * ============================================================================
 *
 * Controllers for room occupancy management.
 * Extracted from reservationsController.js for separation of concerns.
 *
 * ============================================================================
 */

import { getRoomOccupancyStatus } from "../utils/occupancyManager.js";
import {
  sendSuccess,
  AppError,
} from "../middleware/errorHandler.js";

/**
 * Get occupancy status of a specific room
 * GET /api/reservations/:roomId/occupancy
 */
export const getRoomOccupancy = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
    }

    const occupancyStatus = await getRoomOccupancyStatus(roomId);

    sendSuccess(res, {
      message: "Room occupancy status retrieved",
      occupancy: occupancyStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get branch occupancy statistics
 * GET /api/reservations/stats/occupancy?branch=gil-puyat
 */
export const getBranchOccupancyStatistics = async (req, res, next) => {
  try {
    const { branch } = req.query;
    const { getBranchOccupancyStats } =
      await import("../utils/occupancyManager.js");

    const stats = await getBranchOccupancyStats(branch || null);

    sendSuccess(res, {
      message: "Branch occupancy statistics retrieved",
      statistics: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vacancy forecast for a specific room or branch
 * Computes expected vacancy dates based on checkInDate + leaseDuration + extensions
 * GET /api/reservations/vacancy-forecast?branch=gil-puyat
 * GET /api/reservations/vacancy-forecast?roomId=<id>
 */
export const getVacancyForecast = async (req, res, next) => {
  try {
    const { branch, roomId } = req.query;
    const { default: Room } = await import("../models/Room.js");
    const { default: Reservation } = await import("../models/Reservation.js");
    const { default: dayjs } = await import("dayjs");

    // Build room filter
    const roomFilter = { isArchived: false };
    if (roomId) {
      if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
      }
      roomFilter._id = roomId;
    } else if (branch) {
      roomFilter.branch = branch;
    }

    const rooms = await Room.find(roomFilter).lean();
    const roomIds = rooms.map((r) => r._id);

    // Find all checked-in reservations for these rooms
    const reservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: "checked-in",
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .lean();

    // Build per-bed vacancy forecast
    const forecast = rooms.map((room) => {
      const roomReservations = reservations.filter(
        (r) => String(r.roomId) === String(room._id),
      );

      const bedForecasts = room.beds
        .filter((bed) => bed.status === "occupied" && bed.occupiedBy?.userId)
        .map((bed) => {
          const reservation = roomReservations.find(
            (r) =>
              String(r._id) === String(bed.occupiedBy?.reservationId) ||
              String(r.userId?._id) === String(bed.occupiedBy?.userId),
          );

          if (!reservation) {
            return {
              bedId: bed.id,
              position: bed.position,
              expectedVacancy: null,
              reason: "No matching reservation found",
            };
          }

          // Compute total lease duration including extensions
          const baseDuration = reservation.leaseDuration || 12; // months
          const extensions = (reservation.leaseExtensions || []).reduce(
            (total, ext) => total + (ext.addedMonths || 0),
            0,
          );
          const totalMonths = baseDuration + extensions;

          const checkIn = dayjs(reservation.checkInDate);
          const expectedEnd = checkIn.add(totalMonths, "month");
          const daysRemaining = expectedEnd.diff(dayjs(), "day");

          return {
            bedId: bed.id,
            position: bed.position,
            tenant: reservation.userId
              ? {
                  name: `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim(),
                  email: reservation.userId.email,
                }
              : null,
            checkInDate: reservation.checkInDate,
            leaseDuration: `${totalMonths} months`,
            expectedVacancy: expectedEnd.toDate(),
            daysRemaining: Math.max(0, daysRemaining),
            isExpiringSoon: daysRemaining <= 30 && daysRemaining > 0,
            isOverdue: daysRemaining <= 0,
          };
        })
        .sort((a, b) => {
          // Sort by soonest vacancy first
          if (!a.expectedVacancy) return 1;
          if (!b.expectedVacancy) return -1;
          return new Date(a.expectedVacancy) - new Date(b.expectedVacancy);
        });

      // Room-level summary
      const soonestVacancy = bedForecasts.find((f) => f.expectedVacancy);

      return {
        roomId: room._id,
        roomName: room.name,
        roomNumber: room.roomNumber,
        branch: room.branch,
        type: room.type,
        capacity: room.capacity,
        currentOccupancy: room.currentOccupancy,
        nextExpectedVacancy: soonestVacancy?.expectedVacancy || null,
        beds: bedForecasts,
      };
    });

    sendSuccess(res, {
      message: "Vacancy forecast retrieved",
      forecast,
    });
  } catch (error) {
    next(error);
  }
};
