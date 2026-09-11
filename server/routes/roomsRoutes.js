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
import { verifyToken, verifyAdmin, optionalAuth } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/permissions.js";
import {
  getRooms,
  getRoomById,
  getOccupancyConsistency,
  getOccupancyHealth,
  reconcileAllOccupancy,
  createRoom,
  updateRoom,
  deleteRoom,
  addBed,
  updateBed,
  reorderBeds,
  deleteBed,
  updateBedStatus,
  repairRoomOccupancy,
  releaseBed,
} from "../controllers/roomsController.js";
import {
  uploadRoomPhotos,
  uploadPhotosMiddleware,
} from "../controllers/roomPhotoController.js";
import { optimizeRoomPhoto } from "../controllers/imageOptimizationController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createRoomSchema, updateRoomSchema } from "../validation/zodSchemas.js";


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
router.get("/", optionalAuth, getRooms);

/**
 * GET /api/rooms/photos/optimize
 *
 * On-the-fly room photo optimization and caching endpoint.
 * Returns resized WebP with immutable caching headers.
 * Placed before /:roomId routes so Express does not capture "photos" as :roomId.
 *
 * Access: Public
 */
router.get("/photos/optimize", optimizeRoomPhoto);

/**
 * POST /api/rooms/:roomId/photos
 *
 * Upload one or more room photos to Firebase Storage (server-side).
 * Files are stored under room-photos/{roomId}/ and returned as public URLs.
 *
 * Access: Admin (manageRooms)
 */
router.post(
  "/:roomId/photos",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageRooms"),
  uploadPhotosMiddleware,
  uploadRoomPhotos,
);
router.get(
  "/occupancy-consistency",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageRooms", "viewReports"]),
  filterByBranch,
  getOccupancyConsistency,
);

/**
 * GET /api/rooms/occupancy-health
 *
 * Read-only scan: returns count and details of orphaned reservations
 * (userId hard-deleted) and rooms with currentOccupancy drift.
 * Safe to call at any time — no writes are performed.
 *
 * Access: Admin (manageRooms or viewReports)
 */
router.get(
  "/occupancy-health",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageRooms", "viewReports"]),
  filterByBranch,
  getOccupancyHealth,
);

/**
 * POST /api/rooms/reconcile-occupancy
 *
 * On-demand occupancy reconciliation: archives orphaned reservations,
 * releases their beds, and recomputes currentOccupancy for all rooms.
 * Equivalent to running the nightly Job 15 immediately.
 *
 * Access: Owner only (isOwner checked in controller)
 */
router.post(
  "/reconcile-occupancy",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  reconcileAllOccupancy,
);

router.get("/:roomId", optionalAuth, getRoomById);

/**
 * POST /api/rooms
 *
 * Create a new room in the system.
 *
 * Access: Admin only (creates room in their branch) | Owner (any branch)
 *
 * @body {Object} Room data (name, branch, type, capacity, price, etc.)
 * @returns {Object} Created room with success message
 */
router.post(
  "/",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  validateRequest({ body: createRoomSchema }),
  createRoom,
);

/**
 * PUT /api/rooms/:roomId
 *
 * Update an existing room's information.
 *
 * Access: Admin (must be from their branch) | Owner (any room)
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @body {Object} Updated room data
 * @returns {Object} Updated room with success message
 */
router.put(
  "/:roomId",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  validateRequest({ body: updateRoomSchema }),
  updateRoom,
);

/**
 * DELETE /api/rooms/:roomId
 *
 * Delete a room from the system.
 *
 * Access: Admin (must be from their branch) | Owner (any room)
 *
 * IMPORTANT:
 * This archives the room after validating there are no active reservations,
 * open billing periods, open utility periods, or unresolved maintenance.
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @returns {Object} Success message
 */
router.delete(
  "/:roomId",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  deleteRoom,
);

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
router.patch(
  "/:roomId/beds/reorder",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  reorderBeds,
);

router.post(
  "/:roomId/beds",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  addBed,
);

router.put(
  "/:roomId/beds/:bedId",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  updateBed,
);

router.delete(
  "/:roomId/beds/:bedId",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  deleteBed,
);

router.patch(
  "/:roomId/beds/:bedId/status",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  updateBedStatus,
);

/**
 * POST /api/rooms/:roomId/repair-occupancy
 *
 * Force-recalculate a room's currentOccupancy counter and bed statuses
 * from ground-truth active reservations. Resolves drift caused by
 * reservations deleted outside the normal lifecycle state machine.
 *
 * Access: Admin only (manageRooms permission)
 */
router.post(
  "/:roomId/repair-occupancy",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  repairRoomOccupancy,
);

/**
 * POST /api/rooms/:roomId/beds/:bedId/release
 *
 * Admin emergency action — releases a payment-pending (locked) bed back
 * to Vacant and auto-cancels the linked reservation's payment window.
 *
 * Access: Admin / Owner only (manageRooms permission)
 */
router.post(
  "/:roomId/beds/:bedId/release",
  verifyToken,
  verifyAdmin,
  requirePermission("manageRooms"),
  filterByBranch,
  releaseBed,
);

export default router;
