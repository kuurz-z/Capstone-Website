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
