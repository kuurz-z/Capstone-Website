/**
 * =============================================================================
 * RESERVATION MANAGEMENT ROUTES
 * =============================================================================
 *
 * Routes for managing room reservations and bookings.
 *
 * Available Endpoints:
 * - GET /api/reservations - Get reservations (all for admin, own for tenants)
 * - POST /api/reservations - Create new reservation (authenticated users)
 * - PUT /api/reservations/:reservationId - Update reservation status (admin only)
 *
 * Business Rules:
 * - Tenants can only view their own reservations
 * - Admins can view and manage all reservations
 * - Only admins can update reservation status
 */

import express from "express";
import {
  verifyToken,
  verifyAdmin,
  verifyApplicant,
} from "../middleware/auth.js";
import { reservationLimiter } from "../middleware/rateLimiter.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/permissions.js";
import {
  getReservations,
  getCurrentResidents,
  getTenantWorkspace,
  getTenantWorkspaceById,
  getTenantActionContext,
  getReservationById,
  createReservation,
  updateReservation,
  updateReservationByUser,
  cancelReservationByUser,
  deleteReservation,
  extendReservation,
  releaseSlot,
  archiveReservation,
  renewContract,
  moveOutReservation,
  transferTenant,
  getMyContract,
} from "../controllers/reservationsController.js";
import {
  getRoomOccupancy,
  getBranchOccupancyStatistics,
  getVacancyForecast,
} from "../controllers/occupancyController.js";

const router = express.Router();

/**
 * GET /api/reservations
 *
 * Retrieve reservations based on user role:
 * - Admin: Get all reservations for their branch
 * - Owner: Get all reservations
 * - Tenant: Get only their own reservations
 *
 * Access: Authenticated users only
 *
 * @returns {Array} List of reservations with populated user and room data
 */
router.get("/", verifyToken, getReservations);

router.get(
  "/current-residents",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getCurrentResidents,
);

router.get(
  "/tenant-workspace",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantWorkspace,
);

router.get(
  "/tenant-workspace/:reservationId",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantWorkspaceById,
);

router.get(
  "/:reservationId/tenant-actions/context",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantActionContext,
);

// ============================================================================
// OCCUPANCY MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/reservations/occupancy/:roomId
 *
 * Get occupancy status of a specific room, including bed assignments.
 *
 * Access: Authenticated users (typically admin)
 *
 * @param {string} roomId - MongoDB ObjectId of the room
 * @returns {Object} Room occupancy status with bed details
 */
router.get("/occupancy/:roomId", verifyToken, getRoomOccupancy);

/**
 * GET /api/reservations/stats/occupancy
 *
 * Get occupancy statistics for a branch.
 * Query parameter: branch (optional) - 'gil-puyat' or 'guadalupe'
 *
 * Access: Authenticated users (typically admin)
 *
 * @query {string} branch - Optional branch filter
 * @returns {Object} Branch occupancy statistics with all rooms
 */
router.get("/stats/occupancy", verifyToken, getBranchOccupancyStatistics);

/**
 * GET /api/reservations/vacancy-forecast
 *
 * Get expected vacancy dates per occupied bed.
 * Query: ?branch=gil-puyat or ?roomId=<id>
 *
 * Access: Admin | Owner
 *
 * @returns {Object} Vacancy forecast per room/bed
 */
router.get(
  "/vacancy-forecast",
  verifyToken,
  verifyAdmin,
  requirePermission("manageReservations"),
  getVacancyForecast,
);

/**
 * GET /api/reservations/my-contract
 *
 * Get the logged-in tenant's active contract details.
 *
 * Access: Authenticated tenants (moved-in status)
 *
 * @returns {Object} Contract details (lease dates, progress, room/bed info)
 */
router.get("/my-contract", verifyToken, getMyContract);

/**
 * GET /api/reservations/:reservationId
 *
 * Retrieve a single reservation by ID.
 *
 * Access: Authenticated users (admins can view all; tenants only their own)
 *
 * @returns {Object} Reservation with populated user and room data
 */
router.get("/:reservationId", verifyToken, getReservationById);

/**
 * POST /api/reservations
 *
 * Create a new reservation for the authenticated user.
 *
 * Access: Authenticated users (tenants and admins)
 *
 * @body {Object} Reservation data (roomId, moveInDate, moveOutDate, legacy aliases, etc.)
 * @returns {Object} Created reservation with success message
 */
router.post("/", reservationLimiter, verifyToken, verifyApplicant, createReservation);

/**
 * PUT /api/reservations/:reservationId
 *
 * Update an existing reservation (status, payment, notes, etc.).
 *
 * Access: Admin (must be from room's branch) | Owner (any reservation)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @body {Object} Updated reservation data
 * @returns {Object} Updated reservation with success message
 */
router.put(
  "/:reservationId",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  updateReservation,
);

/**
 * PUT /api/reservations/:reservationId/user
 *
 * Update an existing reservation (tenant only, own reservation)
 *
 * Access: Authenticated users (tenant)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @body {Object} Updated reservation data
 * @returns {Object} Updated reservation with success message
 */
router.put(
  "/:reservationId/user",
  verifyToken,
  verifyApplicant,
  updateReservationByUser,
);

/**
 * PATCH /api/reservations/:reservationId/cancel
 *
 * Applicant self-cancellation — proper endpoint replacing the unsafe
 * cancelReservation=true flag on updateReservationByUser.
 *
 * - Verifies ownership.
 * - Only allows cancellation from pre-move-in statuses.
 * - Marks fee as forfeited, syncs occupancy + user lifecycle.
 * - Fires cancellation notification.
 */
router.patch(
  "/:reservationId/cancel",
  verifyToken,
  verifyApplicant,
  cancelReservationByUser,
);

/**
 * DELETE /api/reservations/:reservationId
 *
 * Delete an existing reservation.
 *
 * Access: User (own reservation) | Admin (any reservation in their branch) | Owner (any reservation)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @returns {Object} Success message with deleted reservation ID
 */
router.delete("/:reservationId", verifyToken, deleteReservation);

/**
 * PUT /api/reservations/:reservationId/extend
 *
 * Extend a reservation's move-in date (admin action for at-risk reservations).
 *
 * Access: Admin (must be from room's branch) | Owner (any reservation)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @body {number} extensionDays - Number of days to extend (default: 3)
 * @returns {Object} Updated reservation with new move-in date
 */
router.put(
  "/:reservationId/extend",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  extendReservation,
);

/**
 * PUT /api/reservations/:reservationId/release
 *
 * Release a reservation slot (admin action to cancel and free up room).
 *
 * Access: Admin (must be from room's branch) | Owner (any reservation)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @body {string} reason - Reason for releasing the slot
 * @returns {Object} Cancelled reservation with success message
 */
router.put(
  "/:reservationId/release",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  releaseSlot,
);

/**
 * PUT /api/reservations/:reservationId/archive
 *
 * Soft delete (archive) a reservation.
 *
 * Access: Admin (must be from room's branch) | Owner (any reservation)
 *
 * @param {string} reservationId - MongoDB ObjectId of the reservation
 * @body {string} reason - Reason for archiving
 * @returns {Object} Archived reservation with success message
 */
router.put(
  "/:reservationId/archive",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  archiveReservation,
);

/**
 * PUT /api/reservations/:reservationId/renew
 *
 * Renew a tenant's contract (extend lease duration).
 *
 * Access: Admin | Owner
 *
 * @param {string} reservationId - MongoDB ObjectId
 * @body {number} additionalMonths - Months to add (1-24, default 12)
 * @body {string} notes - Optional renewal notes
 * @returns {Object} Updated reservation
 */
router.put(
  "/:reservationId/renew",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  renewContract,
);

/**
 * PUT /api/reservations/:reservationId/checkout
 *
 * Move out a tenant (end stay, vacate bed, update user status).
 * Uses the legacy /checkout route name for compatibility.
 *
 * Access: Admin | Owner
 *
 * @param {string} reservationId - MongoDB ObjectId
 * @body {string} notes - Move-out notes
 * @body {boolean} inspectionPassed - Room inspection result
 * @returns {Object} Updated reservation
 */
router.put(
  "/:reservationId/checkout",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  moveOutReservation,
);

/**
 * PUT /api/reservations/:reservationId/transfer
 *
 * Transfer a tenant to a different room/bed.
 *
 * Access: Admin | Owner
 *
 * @param {string} reservationId - MongoDB ObjectId
 * @body {string} newRoomId - Target room ObjectId
 * @body {string} newBedId - Target bed ObjectId
 * @body {string} reason - Transfer reason
 * @returns {Object} Updated reservation
 */
router.put(
  "/:reservationId/transfer",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  transferTenant,
);

export default router;
