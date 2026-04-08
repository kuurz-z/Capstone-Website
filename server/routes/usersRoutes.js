/**
 * =============================================================================
 * USER MANAGEMENT ROUTES
 * =============================================================================
 *
 * Routes for managing users in the system with branch-based access control.
 *
 * Available Endpoints:
 * - GET    /api/users                    - Get all users (filtered by branch)
 * - GET    /api/users/stats              - Get user statistics
 * - GET    /api/users/branch/:branch     - Get users for specific branch (owner)
 * - GET    /api/users/email-by-username  - Get email by username (public)
 * - GET    /api/users/:userId            - Get specific user by ID
 * - PUT    /api/users/:userId            - Update user
 * - DELETE /api/users/:userId            - Delete user (owner only)
 *
 * Branch Access Rules:
 * - Branch admins: Can only access users from their assigned branch
 * - Owners: Can access users from ALL branches
 */

import express from "express";
import {
  verifyToken,
  verifyAdmin,
  verifyOwner,
} from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/permissions.js";
import {
  createUser,
  getUserStats,
  getUsersByBranch,
  getEmailByUsername,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  suspendUser,
  reactivateUser,
  banUser,
  updatePermissions,
  getMyStays,
} from "../controllers/usersController.js";

const router = express.Router();

// ============================================================================
// STATISTICS ENDPOINT (must be before /:userId route)
// ============================================================================

/**
 * GET /api/users/stats
 *
 * Get user statistics for dashboard.
 *
 * Access: Admin (filtered by branch) | Owner (all branches)
 */
router.get(
  "/stats",
  verifyToken,
  verifyAdmin,
  requireAnyPermission(["manageUsers", "viewReports"]),
  filterByBranch,
  getUserStats,
);

// ============================================================================
// GET USERS BY BRANCH (Owner only)
// ============================================================================

/**
 * GET /api/users/branch/:branch
 *
 * Get all users for a specific branch.
 *
 * Access: Owner only
 */
router.get("/branch/:branch", verifyToken, verifyOwner, getUsersByBranch);

// ============================================================================
// PUBLIC ENDPOINT - Email by Username
// ============================================================================

/**
 * GET /api/users/email-by-username
 *
 * Get user email by username (for login with username).
 * This endpoint is public to allow username-based login.
 */
router.get("/email-by-username", getEmailByUsername);

// ============================================================================
// CREATE USER (Owner only)
// ============================================================================

/**
 * POST /api/users
 *
 * Create a new user account from the admin panel.
 * Creates both a Firebase Auth account and a MongoDB user record.
 *
 * Access: Owner only
 */
router.post("/", verifyToken, verifyOwner, createUser);

// ============================================================================
// ACCOUNT STATUS MANAGEMENT
// ============================================================================

/**
 * PATCH /api/users/:userId/suspend
 * Suspend a user account.
 * Access: Admin | Owner
 */
router.patch(
  "/:userId/suspend",
  verifyToken,
  verifyAdmin,
  requirePermission("manageUsers"),
  filterByBranch,
  suspendUser,
);

/**
 * PATCH /api/users/:userId/reactivate
 * Reactivate a suspended/banned user account.
 * Access: Admin | Owner
 */
router.patch(
  "/:userId/reactivate",
  verifyToken,
  verifyAdmin,
  requirePermission("manageUsers"),
  filterByBranch,
  reactivateUser,
);

/**
 * PATCH /api/users/:userId/ban
 * Ban a user account permanently.
 * Access: Owner only
 */
router.patch("/:userId/ban", verifyToken, verifyOwner, banUser);

/**
 * PATCH /api/users/:userId/permissions
 * Update an admin user's permissions.
 * Access: Owner only
 */
router.patch("/:userId/permissions", verifyToken, verifyOwner, updatePermissions);

// ============================================================================
// GET ALL USERS
// ============================================================================

/**
 * GET /api/users
 *
 * Retrieve all users from the database.
 * Results are filtered by the admin's assigned branch.
 *
 * Access: Admin (filtered by branch) | Owner (all branches)
 *
 * Query Parameters:
 * - role: Filter by role (applicant, tenant, branch_admin, owner)
 * - branch: Filter by branch (owner only)
 * - isActive: Filter by active status (true/false)
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort field (default: createdAt)
 * - order: Sort order (asc/desc, default: desc)
 */
router.get(
  "/",
  verifyToken,
  verifyAdmin,
  requirePermission("manageUsers"),
  filterByBranch,
  getUsers,
);

// ============================================================================
// GET MY STAY HISTORY (Tenant)
// ============================================================================

/**
 * GET /api/users/my-stays
 *
 * Retrieve current user's stay history.
 *
 * Access: Authenticated user (tenant)
 */
router.get("/my-stays", verifyToken, getMyStays);

// ============================================================================
// GET SINGLE USER
// ============================================================================

/**
 * GET /api/users/:userId
 *
 * Retrieve a specific user by their MongoDB ID.
 *
 * Access: Admin (must be from their branch) | Owner (any user)
 */
router.get(
  "/:userId",
  verifyToken,
  verifyAdmin,
  requirePermission("manageUsers"),
  filterByBranch,
  getUserById,
);

// ============================================================================
// UPDATE USER (Owner only)
// ============================================================================

/**
 * PUT /api/users/:userId
 *
 * Update a user's information.
 *
 * Access: Owner only
 */
router.put("/:userId", verifyToken, verifyOwner, updateUser);

// ============================================================================
// DELETE USER (Owner only)
// ============================================================================

/**
 * DELETE /api/users/:userId
 *
 * Delete a user permanently.
 *
 * Access: Owner only
 */
router.delete("/:userId", verifyToken, verifyOwner, deleteUser);

export default router;
