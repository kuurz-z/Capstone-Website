/**
 * ============================================================================
 * BILLING ROUTES
 * ============================================================================
 *
 * API endpoints for billing operations.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import * as billingController from "../controllers/billingController.js";

const router = express.Router();

// All billing routes require authentication
router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

/**
 * GET /api/billing/current
 * Get current month's billing for logged-in tenant
 */
router.get("/current", billingController.getCurrentBilling);

/**
 * GET /api/billing/history
 * Get billing history for logged-in tenant
 */
router.get("/history", billingController.getBillingHistory);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/billing/stats
 * Get billing statistics by branch (Admin only)
 */
router.get("/stats", billingController.getBillingStats);

/**
 * POST /api/billing/:billId/mark-paid
 * Mark a bill as paid (Admin only)
 */
router.post("/:billId/mark-paid", billingController.markBillAsPaid);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
