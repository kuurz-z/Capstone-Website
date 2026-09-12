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

const mockCheckoutSessions = new Map();

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
  idempotencyKey = null,
}) {
  if (!process.env.PAYMONGO_SECRET_KEY && process.env.NODE_ENV !== "production") {
    // Encode the metadata into the session ID (base64url) so it survives server restarts.
    const enrichedMetadata = {
      ...metadata,
      amountDue: String(amount),
    };
    const encodedMeta = Buffer.from(JSON.stringify(enrichedMetadata)).toString("base64url");
    const mockSessionId = `cs_test_mock_${encodedMeta}`;
    const checkoutUrl = successUrl.replace("{id}", mockSessionId);
    const amountCents = Math.round(amount * 100);
    const mockSession = {
      id: mockSessionId,
      type: "checkout_session",
      attributes: {
        status: "active",
        checkout_url: checkoutUrl,
        line_items: [
          {
            currency: "PHP",
            amount: amountCents,
            name: description,
            quantity: 1,
          },
        ],
        payments: [
          {
            id: `pay_mock_${Date.now()}`,
            type: "payment",
            attributes: {
              status: "paid",
              amount: amountCents,
              currency: "PHP",
              payment_method_type: "gcash",
              source: { type: "gcash" },
            },
          },
        ],
        metadata: enrichedMetadata,
      },
    };
    mockCheckoutSessions.set(mockSessionId, mockSession);
    return { checkoutUrl, sessionId: mockSessionId };
  }

  const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
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
export async function getCheckoutSession(sessionId, { signal } = {}) {
  if (mockCheckoutSessions.has(sessionId)) {
    return mockCheckoutSessions.get(sessionId);
  }
  if (sessionId && String(sessionId).startsWith("cs_test_mock_")) {
    // Decode metadata embedded in the session ID (survives server restarts).
    let metadata = {};
    try {
      const encodedPart = String(sessionId).slice("cs_test_mock_".length);
      metadata = JSON.parse(Buffer.from(encodedPart, "base64url").toString("utf8"));
    } catch {
      // If decoding fails, proceed with empty metadata (settlement skipped).
    }
    const resolvedAmount = Number(metadata.amountDue || metadata.amount || 0);
    const amountCents = resolvedAmount > 0 ? Math.round(resolvedAmount * 100) : 500000;
    return {
      id: sessionId,
      type: "checkout_session",
      attributes: {
        status: "active",
        line_items: [
          {
            currency: "PHP",
            amount: amountCents,
            name: "Lilycrest Dormitory Payment",
            quantity: 1,
          },
        ],
        payments: [
          {
            id: `pay_mock_${Date.now()}`,
            type: "payment",
            attributes: {
              status: "paid",
              amount: amountCents,
              currency: "PHP",
              payment_method_type: "gcash",
              source: { type: "gcash" },
            },
          },
        ],
        metadata,
      },
    };
  }

  if (!process.env.PAYMONGO_SECRET_KEY) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured in server environment");
  }

  const response = await fetch(`${PAYMONGO_API}/checkout_sessions/${sessionId}`, {
    headers: { Authorization: getAuthHeader() },
    signal,
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => null);
    const detail = errPayload?.errors?.[0]?.detail || `HTTP ${response.status}`;
    throw new Error(`Failed to retrieve checkout session (${detail})`);
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

  const timestampNum = Number(timestamp);
  if (!Number.isFinite(timestampNum)) {
    throw new Error("Invalid timestamp in Paymongo-Signature header");
  }

  // Enforce timestamp freshness to prevent replay attacks (5 minute window)
  const MAX_TOLERANCE_SECONDS = 300;
  const currentSeconds = Math.floor(Date.now() / 1000);
  if (process.env.NODE_ENV === "production" && Math.abs(currentSeconds - timestampNum) > MAX_TOLERANCE_SECONDS) {
    throw new Error("Webhook signature timestamp expired (possible replay attack)");
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
