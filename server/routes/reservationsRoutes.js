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
  markTenantWorkspaceAsViewed,
  getTenantActionContext,
  getRoomMeterBaseline,
  getVisitAvailability,
  getVisitAvailabilityRules,
  getVisitAvailabilityHistory,
  preflightVisitAvailabilityRules,
  getVisitConflictHistory,
  toggleResolveVisitConflict,
  getVisitSlotVisitors,
  getVisitScheduledUsersHistory,
  getReservationById,
  manageReservationVisit,
  precheckReservationDocument,
  createReservation,
  updateVisitAvailabilityRules,
  updateReservation,
  updateReservationByUser,
  touchReservationActivity,
  cancelReservationByUser,
  requestCancellationByUser,
  withdrawCancellationRequestByUser,
  approveCancellationRequest,
  rejectCancellationRequest,
  requestPreMoveInModification,
  approvePreMoveInModification,
  rejectPreMoveInModification,
  deleteReservation,
  extendReservation,
  releaseSlot,
  archiveReservation,
  restoreReservation,
  renewContract,
  previewRenewalPricing,
  createRenewalOffer,
  cancelRenewalOffer,
  respondToRenewalOffer,
  getMyRenewalOffers,
  moveOutReservation,
  transferTenant,
  prepareRoomTransferAddendumAction,
  discardRoomTransferAddendumAction,
  cancelScheduledRoomTransferAction,
  retryScheduledRoomTransferAction,
  rescheduleRoomTransferAction,
  completeRoomTransferAction,
  processDepositRefund,
  cancelMoveOutAction,
  earlyTerminationAction,
  swapRoomsAction,
  triggerAbandonmentAction,
  checkExtensionConflictAction,
  getMyContract,
  updateVisitPreferenceAndSchedule,
  saveApplicationDraft,
  submitApplication,
} from "../controllers/reservations/index.js";
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
  "/visit-availability",
  verifyToken,
  getVisitAvailability,
);

router.get(
  "/visit-availability/settings",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getVisitAvailabilityRules,
);

router.patch(
  "/visit-availability/settings",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  updateVisitAvailabilityRules,
);

router.put(
  "/visit-availability/settings",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  updateVisitAvailabilityRules,
);

/**
 * POST /api/reservations/visit-availability/rules/preflight
 * Preflight check for rule change conflicts without persisting changes.
 */
router.post(
  "/visit-availability/rules/preflight",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  preflightVisitAvailabilityRules,
);

/**
 * GET /api/reservations/visit-availability/history
 *
 * Returns paginated change history for availability rules for a branch.
 * Branch admins are scoped to their own branch via filterByBranch.
 *
 * @query {string} branch - Target branch (required for owner)
 * @query {number} page   - Page number (default: 1)
 * @query {number} limit  - Records per page (default: 20, max: 50)
 */
router.get(
  "/visit-availability/history",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getVisitAvailabilityHistory,
);

/**
 * GET /api/reservations/visit-availability/slot-visitors
 * Returns booked visitors for a specific date and time slot.
 */
router.get(
  "/visit-availability/slot-visitors",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getVisitSlotVisitors,
);

/**
 * GET /api/reservations/visit-availability/scheduled-users
 * Returns paginated scheduled users/visits history for a branch.
 */
router.get(
  "/visit-availability/scheduled-users",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getVisitScheduledUsersHistory,
);

/**
 * GET /api/reservations/visit-availability/conflicts
 * Returns paginated conflict logs for availability rule changes.
 */
router.get(
  "/visit-availability/conflicts",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getVisitConflictHistory,
);

/**
 * PATCH /api/reservations/visit-availability/conflicts/:conflictId/resolve
 * Toggles or updates resolution status of a conflict log record.
 */
router.patch(
  "/visit-availability/conflicts/:conflictId/resolve",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  toggleResolveVisitConflict,
);

router.get(
  "/current-residents",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getCurrentResidents,
);

router.get(
  "/tenant-workspace",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantWorkspace,
);

router.get(
  "/tenant-workspace/:reservationId",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantWorkspaceById,
);

router.post(
  "/tenant-workspace/:reservationId/viewed",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  markTenantWorkspaceAsViewed,
);

router.get(
  "/:reservationId/tenant-actions/context",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getTenantActionContext,
);

/**
 * GET /api/reservations/room-meter-baseline/:roomId
 *
 * Returns the latest electricity meter reading for a given room.
 * Used by the Transfer Tenant modal to pre-fill the target room baseline.
 *
 * Access: Admin only
 */
router.get(
  "/room-meter-baseline/:roomId",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  getRoomMeterBaseline,
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
router.get(
  "/occupancy/:roomId",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getRoomOccupancy,
);

/**
 * GET /api/reservations/stats/occupancy
 *
 * Get occupancy statistics for a branch.
 * Query parameter: branch (optional) - 'gil-puyat' or 'guadalupe'
 *
 * Access: Authenticated users (admin)
 *
 * @query {string} branch - Optional branch filter
 * @returns {Object} Branch occupancy statistics with all rooms
 */
router.get(
  "/stats/occupancy",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  getBranchOccupancyStatistics,
);

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
 * GET /api/reservations/my-renewal-offers
 *
 * Get pending lease renewal offers for the logged-in tenant.
 * Access: Authenticated tenants
 */
router.get("/my-renewal-offers", verifyToken, getMyRenewalOffers);

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

router.post(
  "/:reservationId/document-precheck",
  verifyToken,
  verifyApplicant,
  precheckReservationDocument,
);

router.post(
  "/:reservationId/id-validation",
  verifyToken,
  verifyApplicant,
  precheckReservationDocument,
);

router.post(
  "/:reservationId/visit-management",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  manageReservationVisit,
);

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
 * POST /api/reservations/:id/heartbeat
 * Keep-alive endpoint to touch updatedAt for rolling inactivity timeout.
 */
router.post(
  "/:reservationId/heartbeat",
  verifyToken,
  verifyApplicant,
  touchReservationActivity,
);
router.post(
  "/:id/heartbeat",
  verifyToken,
  verifyApplicant,
  touchReservationActivity,
);

/**
 * PATCH /api/reservations/:reservationId/visit
 * Update viewing preference and physical visit schedule (tenant only).
 */
router.patch(
  "/:reservationId/visit",
  verifyToken,
  verifyApplicant,
  updateVisitPreferenceAndSchedule,
);

/**
 * PATCH /api/reservations/:reservationId/application/draft
 * Save tenant application draft (tenant only).
 */
router.patch(
  "/:reservationId/application/draft",
  verifyToken,
  verifyApplicant,
  saveApplicationDraft,
);

/**
 * POST /api/reservations/:reservationId/application/submit
 * Submit tenant application with parallel document pre-checks and optimistic lock.
 */
router.post(
  "/:reservationId/application/submit",
  verifyToken,
  verifyApplicant,
  submitApplication,
);

// POST /:reservationId/payment — REMOVED: manual proof upload decommissioned.
// All reservation fee payments are handled via automated PayMongo checkout.

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
 * POST /api/reservations/:reservationId/cancel-request
 *
 * Tenant submits a cancellation request for a paid reservation.
 * Reservation fee is non-refundable. Bed is NOT released until admin approves.
 */
router.post(
  "/:reservationId/cancel-request",
  verifyToken,
  verifyApplicant,
  requestCancellationByUser,
);

/**
 * POST /api/reservations/:reservationId/cancel-request/withdraw
 *
 * Tenant withdraws a pending cancellation request before admin review.
 * Reservation returns to regular active/reserved status.
 */
router.post(
  "/:reservationId/cancel-request/withdraw",
  verifyToken,
  verifyApplicant,
  withdrawCancellationRequestByUser,
);

/**
 * POST /api/reservations/:reservationId/cancel-request/approve
 *
 * Admin approves a pending cancellation request.
 * Cancels the reservation and releases the bed. No refund.
 */
router.post(
  "/:reservationId/cancel-request/approve",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  approveCancellationRequest,
);

/**
 * POST /api/reservations/:reservationId/cancel-request/reject
 *
 * Admin rejects a pending cancellation request. Reservation stays active.
 */
router.post(
  "/:reservationId/cancel-request/reject",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  rejectCancellationRequest,
);

/**
 * POST /api/reservations/:reservationId/modification-request
 * Tenant submits a pre-move-in modification request (e.g. move-in date change).
 */
router.post(
  "/:reservationId/modification-request",
  verifyToken,
  verifyApplicant,
  requestPreMoveInModification,
);

/**
 * POST /api/reservations/:reservationId/modification-request/approve
 * Admin approves a pre-move-in modification request.
 */
router.post(
  "/:reservationId/modification-request/approve",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  approvePreMoveInModification,
);

/**
 * POST /api/reservations/:reservationId/modification-request/reject
 * Admin rejects a pre-move-in modification request.
 */
router.post(
  "/:reservationId/modification-request/reject",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  rejectPreMoveInModification,
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
 * PATCH /api/reservations/:reservationId/restore
 *
 * Restore an archived reservation to the reservations list.
 *
 * Access: Admin (must be from room's branch) | Owner (any reservation)
 */
router.patch(
  "/:reservationId/restore",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requirePermission("manageReservations"),
  restoreReservation,
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
  requireAnyPermission(["manageReservations", "manageTenants"]),
  renewContract,
);

/**
 * GET /api/reservations/:reservationId/renewal-offer/preview?months=N
 * Read-only preview of the canonical room-type + duration pricing a
 * renewal offer for this reservation would use (see createRenewalOffer).
 */
router.get(
  "/:reservationId/renewal-offer/preview",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  previewRenewalPricing,
);

/**
 * POST /api/reservations/:reservationId/renewal-offer
 * Issue a contract renewal offer to a tenant.
 */
router.post(
  "/:reservationId/renewal-offer",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  createRenewalOffer,
);

/**
 * POST /api/reservations/:reservationId/renewal-offer/:offerId/cancel
 * Cancel a pending contract renewal offer.
 */
router.post(
  "/:reservationId/renewal-offer/:offerId/cancel",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  cancelRenewalOffer,
);

/**
 * POST /api/reservations/:reservationId/renewal-offer/:offerId/respond
 * Respond (accept/decline) to a contract renewal offer.
 */
router.post(
  "/:reservationId/renewal-offer/:offerId/respond",
  verifyToken,
  respondToRenewalOffer,
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
  requireAnyPermission(["manageReservations", "manageTenants"]),
  moveOutReservation,
);

// SCENARIO 1: Mid-Lifecycle Contract & Occupancy Mutation Routes
router.post(
  "/:reservationId/cancel-moveout",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  cancelMoveOutAction,
);

router.post(
  "/:reservationId/early-termination",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  earlyTerminationAction,
);

router.post(
  "/room-swap",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  swapRoomsAction,
);

router.post(
  "/:reservationId/abandonment",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  triggerAbandonmentAction,
);

router.get(
  "/:reservationId/check-extension",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  checkExtensionConflictAction,
);

/**
 * PUT /api/reservations/:reservationId/transfer
 *
 * Transfer a tenant to a different room (same room type). One canonical
 * server operation: prepares the replacement Contract as a tenant-visible
 * Draft, then atomically performs the physical cutover (bed/occupancy,
 * settlement bill, Stay, Contract). No separate prepare/wet-sign step.
 *
 * Access: Admin | Owner
 *
 * @param {string} reservationId - MongoDB ObjectId
 * @body {string} targetRoomId - Destination room ObjectId (same room type)
 * @body {string} [targetBedId] - Destination bed; required only for a
 *   double-sharing / quadruple-sharing destination, omitted for private
 * @body {string} reason - Transfer reason
 * @body {boolean} confirm - Must be true
 * @body {boolean} [forceOverride] - Proceed despite an outstanding balance
 * @returns {Object} Updated reservation + stay + settlement snapshot
 */
router.put(
  "/:reservationId/transfer",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  transferTenant,
);

/**
 * POST /api/reservations/:reservationId/transfer/prepare-addendum
 *
 * R2 — Prepare (or reuse) the Room Transfer Addendum Draft + PDF for a planned
 * transfer so Admin can preview / download it before Confirm. Mutates nothing
 * physical; does NOT activate the Addendum. Idempotent.
 *
 * Access: Admin | Owner
 */
router.post(
  "/:reservationId/transfer/prepare-addendum",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  prepareRoomTransferAddendumAction,
);

/**
 * POST /api/reservations/:reservationId/transfer/discard-addendum
 *
 * R4 — Discard a PRE-CUTOVER Room Transfer Addendum Draft (generated ->
 * cancelled). NOT a reversal of a completed transfer. Leaves the current
 * lease, Stay, room, occupancy and utilities unchanged.
 *
 * Access: Admin | Owner
 */
router.post(
  "/:reservationId/transfer/discard-addendum",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  discardRoomTransferAddendumAction,
);

/**
 * POST /api/reservations/:reservationId/scheduled-transfer/cancel
 *
 * Cancel a NOT-yet-executed scheduled room transfer. Automatic only when no
 * money was received; any payment -> action_required (Administration Office).
 *
 * Access: Admin | Owner
 */
router.post(
  "/:reservationId/scheduled-transfer/cancel",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  cancelScheduledRoomTransferAction,
);

/**
 * POST /api/reservations/:reservationId/scheduled-transfer/retry
 *
 * Admin retry for an `action_required` scheduled room transfer. Re-runs every
 * gate; not allowed for FINANCIAL_ADJUSTMENT_REQUIRED / PAYMENT_ALREADY_RECEIVED.
 *
 * Access: Admin | Owner
 */
router.post(
  "/:reservationId/scheduled-transfer/retry",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  retryScheduledRoomTransferAction,
);

/**
 * PATCH /api/reservations/:reservationId/scheduled-transfer/reschedule
 *
 * Move an OPEN scheduled room transfer to a new Manila date + time on the SAME
 * destination. Revalidates intent + hold + (same-day) office hours; appends a
 * schedule-history entry. Changing the destination = cancel + new schedule.
 *
 * Access: Admin | Owner
 */
router.patch(
  "/:reservationId/scheduled-transfer/reschedule",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  rescheduleRoomTransferAction,
);

/**
 * POST /api/reservations/:reservationId/scheduled-transfer/complete
 *
 * Admin-driven room transfer completion on/after the effective date + time:
 * meter reading → settlement → settle → atomic cutover (transferStayWorkflow).
 * Returns outcome "awaiting_settlement" (202) with the Bill when the transfer
 * balance is unpaid — no cutover. Idempotent.
 *
 * Access: Admin | Owner
 */
router.post(
  "/:reservationId/scheduled-transfer/complete",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  completeRoomTransferAction,
);

/**
 * PUT /api/reservations/:reservationId/deposit-refund
 *
 * Mark deposit refund status and payout reference.
 *
 * Access: Admin | Owner
 */
router.put(
  "/:reservationId/deposit-refund",
  verifyToken,
  verifyAdmin,
  filterByBranch,
  requireAnyPermission(["manageReservations", "manageTenants"]),
  processDepositRefund,
);

export default router;
