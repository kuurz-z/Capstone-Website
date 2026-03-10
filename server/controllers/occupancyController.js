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

/**
 * Get occupancy status of a specific room
 * GET /api/reservations/:roomId/occupancy
 */
export const getRoomOccupancy = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid room ID format",
        code: "INVALID_ROOM_ID",
      });
    }

    const occupancyStatus = await getRoomOccupancyStatus(roomId);

    res.json({
      message: "Room occupancy status retrieved",
      occupancy: occupancyStatus,
    });
  } catch (error) {
    console.error("❌ Get room occupancy error:", error);
    res.status(500).json({
      error: "Failed to get room occupancy",
      details: error.message,
      code: "GET_OCCUPANCY_ERROR",
    });
  }
};

/**
 * Get branch occupancy statistics
 * GET /api/reservations/stats/occupancy?branch=gil-puyat
 */
export const getBranchOccupancyStatistics = async (req, res) => {
  try {
    const { branch } = req.query;
    const { getBranchOccupancyStats } =
      await import("../utils/occupancyManager.js");

    const stats = await getBranchOccupancyStats(branch || null);

    res.json({
      message: "Branch occupancy statistics retrieved",
      statistics: stats,
    });
  } catch (error) {
    console.error("❌ Get branch occupancy stats error:", error);
    res.status(500).json({
      error: "Failed to get branch occupancy statistics",
      details: error.message,
      code: "GET_BRANCH_STATS_ERROR",
    });
  }
};
