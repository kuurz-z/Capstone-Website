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
 * - GET    /api/users/branch/:branch     - Get users for specific branch (super admin)
 * - GET    /api/users/email-by-username  - Get email by username (public)
 * - GET    /api/users/:userId            - Get specific user by ID
 * - PUT    /api/users/:userId            - Update user
 * - DELETE /api/users/:userId            - Delete user (super admin only)
 *
 * Branch Access Rules:
 * - Regular admins: Can only access users from their assigned branch
 * - Super admins: Can access users from ALL branches
 */

import express from "express";
import {
  verifyToken,
  verifyAdmin,
  verifySuperAdmin,
} from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  createUser,
  getUserStats,
  getUsersByBranch,
  getEmailByUsername,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
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
 * Access: Admin (filtered by branch) | Super Admin (all branches)
 */
router.get("/stats", verifyToken, verifyAdmin, filterByBranch, getUserStats);

// ============================================================================
// GET USERS BY BRANCH (Super Admin only)
// ============================================================================

/**
 * GET /api/users/branch/:branch
 *
 * Get all users for a specific branch.
 *
 * Access: Super Admin only
 */
router.get("/branch/:branch", verifyToken, verifySuperAdmin, getUsersByBranch);

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
// CREATE USER (Super Admin only)
// ============================================================================

/**
 * POST /api/users
 *
 * Create a new user account from the admin panel.
 * Creates both a Firebase Auth account and a MongoDB user record.
 *
 * Access: Super Admin only
 */
router.post("/", verifyToken, verifySuperAdmin, createUser);

// ============================================================================
// GET ALL USERS
// ============================================================================

/**
 * GET /api/users
 *
 * Retrieve all users from the database.
 * Results are filtered by the admin's assigned branch.
 *
 * Access: Admin (filtered by branch) | Super Admin (all branches)
 *
 * Query Parameters:
 * - role: Filter by role (user, tenant, admin, superAdmin)
 * - branch: Filter by branch (super admin only)
 * - isActive: Filter by active status (true/false)
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort field (default: createdAt)
 * - order: Sort order (asc/desc, default: desc)
 */
router.get("/", verifyToken, verifyAdmin, filterByBranch, getUsers);

// ============================================================================
// GET SINGLE USER
// ============================================================================

/**
 * GET /api/users/:userId
 *
 * Retrieve a specific user by their MongoDB ID.
 *
 * Access: Admin (must be from their branch) | Super Admin (any user)
 */
router.get("/:userId", verifyToken, verifyAdmin, filterByBranch, getUserById);

// ============================================================================
// UPDATE USER (Super Admin only)
// ============================================================================

/**
 * PUT /api/users/:userId
 *
 * Update a user's information.
 *
 * Access: Super Admin only
 */
router.put("/:userId", verifyToken, verifySuperAdmin, updateUser);

// ============================================================================
// DELETE USER (Super Admin only)
// ============================================================================

/**
 * DELETE /api/users/:userId
 *
 * Delete a user permanently.
 *
 * Access: Super Admin only
 */
router.delete("/:userId", verifyToken, verifySuperAdmin, deleteUser);

export default router;
