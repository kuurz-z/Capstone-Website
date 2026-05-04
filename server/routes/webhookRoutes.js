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
import logger from "../middleware/logger.js";

const router = express.Router();
const paymongoRawBody = express.raw({ type: "*/*", limit: "1mb" });

const acknowledgePaymongoBodyError = (err, req, res, next) => {
  logger.warn(
    { err },
    "PayMongo webhook raw body parsing failed - acknowledging with 200",
  );
  return res.status(200).json({ received: true });
};

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
  paymongoRawBody,
  acknowledgePaymongoBodyError,
  handlePaymongoWebhook,
);

// POST /api/paymongo/webhook — payment.paid, payment.failed, source.chargeable
// (mounted at /api/paymongo in server.js)
router.post(
  "/webhook",
  paymongoRawBody,
  acknowledgePaymongoBodyError,
  handlePaymongoSourceWebhook,
);

router.post(
  "/",
  paymongoRawBody,
  acknowledgePaymongoBodyError,
  handlePaymongoSourceWebhook,
);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
