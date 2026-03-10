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

/**
 * GET /api/billing/my-bills
 * Get all bills for logged-in tenant with full breakdown
 */
router.get("/my-bills", billingController.getMyBills);

/**
 * POST /api/billing/:billId/submit-proof
 * Tenant submits payment proof (image + amount)
 */
router.post("/:billId/submit-proof", billingController.submitPaymentProof);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/billing/stats
 * Get billing statistics by branch (Admin only)
 */
router.get("/stats", billingController.getBillingStats);

/**
 * GET /api/billing/branch
 * Get all bills for a branch (Admin only)
 */
router.get("/branch", billingController.getBillsByBranch);

/**
 * GET /api/billing/rooms
 * Get rooms with occupants for bill generation (Admin only)
 */
router.get("/rooms", billingController.getRoomsWithTenants);

/**
 * GET /api/billing/pending-verifications
 * Get bills with pending payment proof verifications (Admin only)
 */
router.get("/pending-verifications", billingController.getPendingVerifications);

/**
 * GET /api/billing/report
 * Get billing report (revenue, overdue, penalties) (Admin only)
 */
router.get("/report", billingController.getBillingReport);

/**
 * POST /api/billing/generate-room
 * Generate room-based bills distributed among tenants (Admin only)
 */
router.post("/generate-room", billingController.generateRoomBill);

/**
 * POST /api/billing/:billId/verify
 * Admin approves or rejects payment proof
 */
router.post("/:billId/verify", billingController.verifyPayment);

/**
 * POST /api/billing/:billId/mark-paid
 * Mark a bill as paid (Admin only)
 */
router.post("/:billId/mark-paid", billingController.markBillAsPaid);

/**
 * POST /api/billing/apply-penalties
 * Auto-calculate and apply penalties to overdue bills (Admin only)
 */
router.post("/apply-penalties", billingController.applyPenalties);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
