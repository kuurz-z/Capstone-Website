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
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,
  updateReservationByUser,
  deleteReservation,
  extendReservation,
  releaseSlot,
  archiveReservation,
  renewContract,
  checkoutReservation,
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
 * - Super Admin: Get all reservations
 * - Tenant: Get only their own reservations
 *
 * Access: Authenticated users only
 *
 * @returns {Array} List of reservations with populated user and room data
 */
router.get("/", verifyToken, getReservations);

/**
 * GET /api/reservations/my-contract
 *
 * Get the logged-in tenant's active contract details.
 *
 * Access: Authenticated tenants (checked-in status)
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
 * @body {Object} Reservation data (roomId, checkInDate, checkOutDate, etc.)
 * @returns {Object} Created reservation with success message
 */
router.post("/", verifyToken, verifyApplicant, createReservation);

/**
 * PUT /api/reservations/:reservationId
 *
 * Update an existing reservation (status, payment, notes, etc.).
 *
 * Access: Admin (must be from room's branch) | Super Admin (any reservation)
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
 * DELETE /api/reservations/:reservationId
 *
 * Delete an existing reservation.
 *
 * Access: User (own reservation) | Admin (any reservation in their branch) | Super Admin (any reservation)
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
 * Access: Admin (must be from room's branch) | Super Admin (any reservation)
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
  extendReservation,
);

/**
 * PUT /api/reservations/:reservationId/release
 *
 * Release a reservation slot (admin action to cancel and free up room).
 *
 * Access: Admin (must be from room's branch) | Super Admin (any reservation)
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
  releaseSlot,
);

/**
 * PUT /api/reservations/:reservationId/archive
 *
 * Soft delete (archive) a reservation.
 *
 * Access: Admin (must be from room's branch) | Super Admin (any reservation)
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
  archiveReservation,
);

/**
 * PUT /api/reservations/:reservationId/renew
 *
 * Renew a tenant's contract (extend lease duration).
 *
 * Access: Admin | Super Admin
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
  renewContract,
);

/**
 * PUT /api/reservations/:reservationId/checkout
 *
 * Check out a tenant (end stay, vacate bed, update user status).
 *
 * Access: Admin | Super Admin
 *
 * @param {string} reservationId - MongoDB ObjectId
 * @body {string} notes - Checkout notes
 * @body {boolean} inspectionPassed - Room inspection result
 * @returns {Object} Updated reservation
 */
router.put(
  "/:reservationId/checkout",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  checkoutReservation,
);

/**
 * PUT /api/reservations/:reservationId/transfer
 *
 * Transfer a tenant to a different room/bed.
 *
 * Access: Admin | Super Admin
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
  transferTenant,
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
 * Access: Admin | Super Admin
 *
 * @returns {Object} Vacancy forecast per room/bed
 */
router.get("/vacancy-forecast", verifyToken, verifyAdmin, getVacancyForecast);

export default router;
