/**
 * ============================================================================
 * MAINTENANCE ROUTES
 * ============================================================================
 *
 * API endpoints for maintenance requests with branch isolation.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import * as maintenanceController from "../controllers/maintenanceController.js";

const router = express.Router();

// All maintenance routes require authentication
router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

/**
 * GET /api/maintenance/my-requests
 * Get current tenant's maintenance requests
 */
router.get("/my-requests", maintenanceController.getMyRequests);

/**
 * POST /api/maintenance/requests
 * Create new maintenance request
 */
router.post("/requests", maintenanceController.createRequest);

/**
 * GET /api/maintenance/requests/:requestId
 * Get maintenance request details
 */
router.get("/requests/:requestId", maintenanceController.getRequest);

// ============================================================================
// ADMIN/STAFF ROUTES
// ============================================================================

/**
 * GET /api/maintenance/branch
 * Get all maintenance requests for branch (Admin only)
 */
router.get("/branch", maintenanceController.getByBranch);

/**
 * PATCH /api/maintenance/requests/:requestId
 * Update maintenance request status (Admin only)
 */
router.patch("/requests/:requestId", maintenanceController.updateRequest);

/**
 * GET /api/maintenance/stats/completion
 * Get completion statistics by branch (Admin only)
 */
router.get("/stats/completion", maintenanceController.getCompletionStats);

/**
 * GET /api/maintenance/stats/issue-frequency
 * Get issue frequency for predictive maintenance (Admin only)
 */
router.get("/stats/issue-frequency", maintenanceController.getIssueFrequency);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
