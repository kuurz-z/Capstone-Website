/**
 * ============================================================================
 * PAYMONGO PAYMENT GATEWAY — CONFIGURATION
 * ============================================================================
 *
 * Helpers for creating checkout sessions and verifying webhooks.
 * Uses PayMongo REST API v1 directly (no SDK needed).
 *
 * Sandbox docs: https://developers.paymongo.com
 * ============================================================================
 */

import crypto from "crypto";

const PAYMONGO_API = "https://api.paymongo.com/v1";

/**
 * Base64-encoded secret key for Basic Auth header.
 * PayMongo uses Basic Auth with the secret key as the username.
 */
function getAuthHeader() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY is not set in .env");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

/**
 * Create a PayMongo Checkout Session.
 *
 * @param {Object} opts
 * @param {number} opts.amount      - Amount in PHP (e.g. 5000 for ₱5,000)
 * @param {string} opts.description - Line item description shown on checkout
 * @param {Object} opts.metadata    - Custom data (billId, reservationId, etc.)
 * @param {string} opts.successUrl  - Redirect URL after successful payment
 * @param {string} opts.cancelUrl   - Redirect URL if tenant cancels
 * @returns {Object} { checkoutUrl, sessionId }
 */
export async function createCheckoutSession({
  amount,
  description,
  metadata = {},
  successUrl,
  cancelUrl,
}) {
  const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          payment_method_types: ["gcash", "grab_pay", "paymaya", "card"],
          line_items: [
            {
              currency: "PHP",
              amount: Math.round(amount * 100), // PayMongo uses centavos
              name: description,
              quantity: 1,
            },
          ],
          metadata,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("❌ PayMongo checkout error:", JSON.stringify(error, null, 2));
    throw new Error(
      error.errors?.[0]?.detail || "Failed to create checkout session",
    );
  }

  const data = await response.json();
  return {
    checkoutUrl: data.data.attributes.checkout_url,
    sessionId: data.data.id,
  };
}

/**
 * Retrieve a checkout session by ID to check its payment status.
 *
 * @param {string} sessionId - The checkout session ID
 * @returns {Object} Full session data from PayMongo
 */
export async function getCheckoutSession(sessionId) {
  const response = await fetch(`${PAYMONGO_API}/checkout_sessions/${sessionId}`, {
    headers: { Authorization: getAuthHeader() },
  });

  if (!response.ok) {
    throw new Error("Failed to retrieve checkout session");
  }

  const data = await response.json();
  return data.data;
}

/**
 * Verify a PayMongo webhook signature.
 *
 * PayMongo sends a `Paymongo-Signature` header in the format:
 *   t=<timestamp>,te=<test_signature>,li=<live_signature>
 *
 * We compute HMAC-SHA256 of `<timestamp>.<rawBody>` using the webhook secret
 * and compare it against the appropriate signature (te for test, li for live).
 *
 * @param {string|Buffer} rawBody  - The raw request body (unparsed)
 * @param {string} signatureHeader - The `Paymongo-Signature` header value
 * @returns {Object} Parsed event payload
 * @throws {Error} If signature is invalid or secret is missing
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("PAYMONGO_WEBHOOK_SECRET is not set in .env");
  }

  if (!signatureHeader) {
    throw new Error("Missing Paymongo-Signature header");
  }

  // Parse the signature header: t=<ts>,te=<test_sig>,li=<live_sig>
  const parts = {};
  signatureHeader.split(",").forEach((part) => {
    const [key, ...valueParts] = part.split("=");
    parts[key.trim()] = valueParts.join("=");
  });

  const timestamp = parts.t;
  if (!timestamp) {
    throw new Error("Missing timestamp in Paymongo-Signature header");
  }

  // Compute expected signature
  const payload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Use test signature in test mode, live signature in production
  const actualSignature = parts.li || parts.te;
  if (!actualSignature) {
    throw new Error("No signature found in Paymongo-Signature header");
  }

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(actualSignature, "hex");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("Invalid webhook signature");
  }

  // Signature valid — parse and return the event
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return JSON.parse(body);
}
