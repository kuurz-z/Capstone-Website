/**
 * ============================================================================
 * WEBHOOK ROUTES — PAYMONGO CALLBACKS
 * ============================================================================
 *
 * External webhook endpoints for payment gateway callbacks.
 * Uses express.raw() instead of express.json() to preserve the raw body
 * for HMAC signature verification.
 *
 * IMPORTANT: These routes must be registered in server.js BEFORE the global
 * express.json() middleware. See server.js for the registration order.
 *
 * ============================================================================
 */

import express from "express";
import {
  handlePaymongoWebhook,
  handlePaymongoSourceWebhook,
} from "../controllers/webhookController.js";

const router = express.Router();

// ============================================================================
// PAYMONGO WEBHOOK
// ============================================================================

/**
 * POST /api/webhooks/paymongo
 *
 * Receives payment events from PayMongo.
 * - No auth middleware (server-to-server, verified by HMAC signature)
 * - Uses express.raw() to preserve raw body for signature verification
 * - PayMongo sends JSON with Content-Type: application/json
 */
// POST /api/webhooks/paymongo — checkout_session.payment.paid
router.post(
  "/paymongo",
  express.raw({ type: "application/json" }),
  handlePaymongoWebhook,
);

// POST /api/paymongo/webhook — payment.paid, payment.failed, source.chargeable
// (mounted at /api/paymongo in server.js)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handlePaymongoSourceWebhook,
);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
