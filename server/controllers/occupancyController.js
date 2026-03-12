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
