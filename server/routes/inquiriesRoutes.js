/**
 * =============================================================================
 * INQUIRY MANAGEMENT ROUTES
 * =============================================================================
 *
 * Full CRUD routes for managing customer inquiries and contact form submissions.
 * Data is separated by branch - admins only see their branch's inquiries.
 *
 * Available Endpoints:
 * - GET    /api/inquiries              - Get all inquiries (filtered by branch)
 * - GET    /api/inquiries/stats        - Get inquiry statistics
 * - GET    /api/inquiries/branch/:branch - Get inquiries for specific branch (super admin)
 * - GET    /api/inquiries/:id          - Get single inquiry by ID
 * - POST   /api/inquiries              - Submit new inquiry (public)
 * - PUT    /api/inquiries/:id          - Update inquiry (admin only)
 * - DELETE /api/inquiries/:id          - Archive inquiry (admin only)
 *
 * Branch Access Rules:
 * - Regular admins: Can only access inquiries from their assigned branch
 * - Super admins: Can access inquiries from ALL branches
 * - Public: Can only submit new inquiries (POST)
 */

import express from "express";
import { verifyToken, verifyAdmin, verifyOwner } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import { inquiryLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../validation/validate.js";
import { createInquirySchema } from "../validation/schemas.js";
import {
  getInquiryStats,
  getInquiriesByBranch,
  getInquiries,
  getInquiryById,
  createInquiry,
  updateInquiry,
  deleteInquiry,
} from "../controllers/inquiriesController.js";

const router = express.Router();

// ============================================================================
// STATISTICS ENDPOINT (must be before /:id route)
// ============================================================================

/**
 * GET /api/inquiries/stats
 *
 * Get inquiry statistics for dashboard.
 *
 * Access: Admin (filtered by branch) | Super Admin (all branches)
 */
router.get("/stats", verifyToken, verifyAdmin, filterByBranch, getInquiryStats);

// ============================================================================
// GET INQUIRIES BY BRANCH (Super Admin only)
// ============================================================================

/**
 * GET /api/inquiries/branch/:branch
 *
 * Get all inquiries for a specific branch.
 *
 * Access: Super Admin only
 */
router.get("/branch/:branch", verifyToken, verifyOwner, getInquiriesByBranch);

// ============================================================================
// GET ALL INQUIRIES
// ============================================================================

/**
 * GET /api/inquiries
 *
 * Retrieve all inquiries with respondent information.
 * Results are filtered by the admin's assigned branch.
 *
 * Access: Admin (filtered by branch) | Super Admin (all branches)
 *
 * Query Parameters:
 * - status: Filter by status (pending, in-progress, resolved, closed)
 * - branch: Filter by branch (super admin only)
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort field (default: createdAt)
 * - order: Sort order (asc/desc, default: desc)
 */
router.get("/", verifyToken, verifyAdmin, filterByBranch, getInquiries);

// ============================================================================
// GET SINGLE INQUIRY
// ============================================================================

/**
 * GET /api/inquiries/:id
 *
 * Retrieve a single inquiry by ID.
 *
 * Access: Admin (must be from their branch) | Super Admin (any inquiry)
 */
router.get("/:id", verifyToken, verifyAdmin, filterByBranch, getInquiryById);

// ============================================================================
// CREATE INQUIRY (Public)
// ============================================================================

/**
 * POST /api/inquiries
 *
 * Submit a new inquiry from the contact form.
 *
 * Access: Public (no authentication required)
 */
router.post("/", inquiryLimiter, validate(createInquirySchema), createInquiry);

// ============================================================================
// UPDATE INQUIRY
// ============================================================================

/**
 * PUT /api/inquiries/:id
 *
 * Update an inquiry's status, response, or other details.
 *
 * Access: Admin (must be from their branch) | Super Admin (any inquiry)
 */
router.put("/:id", verifyToken, verifyAdmin, filterByBranch, updateInquiry);

// ============================================================================
// DELETE INQUIRY
// ============================================================================

/**
 * DELETE /api/inquiries/:id
 *
 * Archive an inquiry (soft delete).
 *
 * Access: Admin (must be from their branch) | Super Admin (any inquiry)
 */
router.delete("/:id", verifyToken, verifyAdmin, filterByBranch, deleteInquiry);

export default router;
