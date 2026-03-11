/**
 * ============================================================================
 * PAYMENT ROUTES — PAYMONGO INTEGRATION
 * ============================================================================
 *
 * API endpoints for online payment processing via PayMongo.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import * as paymentController from "../controllers/paymentController.js";

const router = express.Router();

// ============================================================================
// AUTHENTICATED ROUTES (Tenant)
// ============================================================================

/**
 * POST /api/payments/bill/:billId/checkout
 * Create a PayMongo checkout session for a monthly bill
 */
router.post("/bill/:billId/checkout", verifyToken, paymentController.createBillCheckout);

/**
 * POST /api/payments/deposit/:resId/checkout
 * Create a PayMongo checkout session for a reservation deposit
 */
router.post("/deposit/:resId/checkout", verifyToken, paymentController.createDepositCheckout);

/**
 * GET /api/payments/session/:sessionId/status
 * Check whether a PayMongo checkout session has been paid
 * (called by frontend after redirect back from PayMongo)
 */
router.get("/session/:sessionId/status", verifyToken, paymentController.checkSessionStatus);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
