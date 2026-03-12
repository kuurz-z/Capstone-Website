/**
 * =============================================================================
 * ROOM MANAGEMENT ROUTES
 * =============================================================================
 *
 * Routes for managing dormitory rooms across both branches.
 *
 * Available Endpoints:
 * - GET /api/rooms - Get all rooms (with optional filters) - Public
 * - POST /api/rooms - Create new room - Admin only
 * - PUT /api/rooms/:roomId - Update room - Admin only
 * - DELETE /api/rooms/:roomId - Delete room - Admin only
 *
 * Public routes: GET (anyone can view available rooms)
 * Protected routes: POST, PUT, DELETE (require admin authentication)
 */

import express from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  updateBedStatus,
} from "../controllers/roomsController.js";

const router = express.Router();

/**
 * GET /api/rooms
 *
 * Retrieve all rooms with optional filtering.
 *
 * Access: Public (no authentication required)
 *
 * Query Parameters:
 * @param {string} branch - Filter by branch ("gil-puyat" or "guadalupe")
 * @param {string} type - Filter by room type ("private", "double-sharing", "quadruple-sharing")
 * @param {string} available - Filter by availability ("true" or "false")
 *
 * @returns {Array} List of rooms matching the filters
 */
router.get("/", getRooms);

/**
 * POST /api/rooms
 *
 * Create a new room in the system.
 *
 * Access: Admin only (creates room in their branch) | Super Admin (any branch)
 *
 * @body {Object} Room data (name, branch, type, capacity, price, etc.)
 * @returns {Object} Created room with success message
 */
router.post("/", verifyToken, verifyAdmin, filterByBranch, createRoom);

/**
 * PUT /api/rooms/:roomId
 *
 * Update an existing room's information.
 *
 * Access: Admin (must be from their branch) | Super Admin (any room)
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @body {Object} Updated room data
 * @returns {Object} Updated room with success message
 */
router.put("/:roomId", verifyToken, verifyAdmin, filterByBranch, updateRoom);

/**
 * DELETE /api/rooms/:roomId
 *
 * Delete a room from the system.
 *
 * Access: Admin (must be from their branch) | Super Admin (any room)
 *
 * IMPORTANT: This permanently deletes the room.
 * Consider implementing soft delete (isActive flag) instead.
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @returns {Object} Success message
 */
router.delete("/:roomId", verifyToken, verifyAdmin, filterByBranch, deleteRoom);

/**
 * PATCH /api/rooms/:roomId/beds/:bedId/status
 *
 * Lock or unlock a bed for maintenance.
 *
 * Access: Admin only
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @param {string} bedId - Bed ID within the room
 * @body {string} status - "maintenance" or "available"
 * @returns {Object} Updated room
 */
router.patch("/:roomId/beds/:bedId/status", verifyToken, verifyAdmin, filterByBranch, updateBedStatus);

export default router;
