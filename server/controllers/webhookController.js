/**
 * ============================================================================
 * WEBHOOK CONTROLLER — PAYMONGO PAYMENT EVENTS
 * ============================================================================
 *
 * Handles incoming webhook callbacks from PayMongo when payments are completed.
 * This replaces/supplements the client-side polling approach, ensuring payments
 * are recorded even if the tenant closes their browser after paying.
 *
 * Supported events:
 *   - checkout_session.payment.paid → auto-reserve (deposit) or mark paid (bill)
 *
 * IDEMPOTENCY:
 *   - All handlers check if the payment has already been processed
 *   - Duplicate webhook deliveries are safely ignored
 *
 * SECURITY:
 *   - HMAC-SHA256 signature verification via Paymongo-Signature header
 *   - No auth middleware (server-to-server, verified by signature)
 *
 * IMPORTANT — ALWAYS RETURN HTTP 200:
 *   PayMongo disables webhooks that return 4xx/5xx status codes.
 *   All responses MUST return 200, even on signature failures or errors.
 *   Errors are logged server-side but never communicated via HTTP status.
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import { verifyWebhookSignature } from "../config/paymongo.js";
import { Reservation, Bill, User } from "../models/index.js";
import { sendPaymentReceiptEmail } from "../config/email.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";
import { notify } from "../utils/notificationService.js";
import { settlePaymongoBill } from "../utils/billSettlement.js";
import logger from "../middleware/logger.js";
import { BUSINESS } from "../config/constants.js";
import { getReservationFeeAmount } from "../utils/businessSettings.js";

/* ─── helpers ───────────────────────────────────── */

/**
 * Extract the PayMongo payment ID from the event data.
 */
function extractPaymentId(eventData) {
  const payments = eventData?.attributes?.payments || [];
  return payments[0]?.id || eventData?.id || "unknown";
}

function extractPaidAmount(eventData) {
  const payments = eventData?.attributes?.payments || [];
  const amountCents = payments[0]?.attributes?.amount;
  return amountCents ? amountCents / 100 : null;
}

function canAutoReserveReservation(status) {
  return status === "pending" || status === "payment_pending";
}

/* ─── handlers ───────────────────────────────────── */

/**
 * Handle a deposit payment — auto-reserve the room.
 *
 * Flow:
 *   1. Find reservation by metadata.reservationId
 *   2. Skip if already paid (idempotent)
 *   3. Mark payment as paid + set status to "reserved"
 *   4. Lock the bed via occupancy manager
 *   5. Notify tenant + send confirmation email
 */
async function handleDepositPayment(metadata, eventData) {
  const { reservationId } = metadata;

  const reservation = await Reservation.findById(reservationId).populate(
    "roomId",
    "name branch",
  );
  if (!reservation) {
    logger.warn({ reservationId }, "Webhook: Reservation not found, skipping");
    return;
  }

  const paymentId = extractPaymentId(eventData);

  // Idempotent — skip if already paid OR same PayMongo payment was processed.
  if (
    reservation.paymentStatus === "paid" ||
    (reservation.paymongoPaymentId && reservation.paymongoPaymentId === paymentId)
  ) {
    logger.info(
      { reservationId, paymentId },
      "Webhook: Deposit already processed, skipping",
    );
    return;
  }

  // Save old status for occupancy tracking
  const oldStatus = reservation.status;
  const oldData = { status: oldStatus };

  // Update payment fields
  if (!reservation.reservationFeeAmount) {
    reservation.reservationFeeAmount = await getReservationFeeAmount();
  }
  reservation.paymentStatus = "paid";
  reservation.paymentDate = new Date();
  reservation.paymentMethod = "paymongo";
  reservation.paymongoPaymentId = paymentId;

  const canAutoReserve = canAutoReserveReservation(reservation.status);
  if (canAutoReserve) {
    // Auto-reserve once the deposit is settled for the current staged flow,
    // while still supporting older reservations that stayed at pending.
    reservation.status = "reserved";
  }

  await reservation.save();

  // Update room occupancy only if status actually moved to reserved.
  if (canAutoReserve) {
    await updateOccupancyOnReservationChange(reservation, oldData);
  }

  logger.info(
    {
      reservationId,
      oldStatus,
      newStatus: reservation.status,
      paymentId,
      autoReserved: canAutoReserve,
    },
    "Webhook: Deposit payment processed",
  );

  // Notify tenant
  const roomName = reservation.roomId?.name || "your room";
  try {
    await notify.paymentApproved(
      reservation.userId,
      `Your deposit for ${roomName} has been verified. Your reservation is now secured!`,
    );
  } catch (notifErr) {
    logger.error({ err: notifErr }, "Webhook: Failed to send notification");
  }

  // Send PayMongo-style receipt email
  try {
    const tenant = await User.findById(reservation.userId).lean();
    if (tenant?.email) {
      // Use the actual amount charged through PayMongo (in centavos ÷ 100),
      // NOT reservation.totalPrice which is the full stay cost, not the deposit.
      const actualPaidAmount =
        extractPaidAmount(eventData) ??
        reservation.reservationFeeAmount ??
        BUSINESS.DEPOSIT_AMOUNT;

      const paymentId = extractPaymentId(eventData);
      const paymentDate = new Date().toLocaleDateString("en-PH", {
        month: "long", day: "numeric", year: "numeric",
      });
      const reservationCode = reservation.reservationCode || String(reservation._id).slice(-8).toUpperCase();

      await sendPaymentReceiptEmail({
        to: tenant.email,
        tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        amount: actualPaidAmount,
        description: `Lilycrest Dormitory — Reservation Deposit (${reservationCode})`,
        billedTo: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        paymentMethod: "GCash / Online Payment",
        paymentDate,
        referenceId: paymentId,
      });
    }
  } catch (emailErr) {
    logger.error({ err: emailErr }, "Webhook: Failed to send email");
  }
}

/**
 * Handle a monthly bill payment — mark bill as paid.
 *
 * Flow:
 *   1. Find bill by metadata.billId
 *   2. Skip if already paid (idempotent)
 *   3. Mark as paid + update payment details
 *   4. Notify tenant + send confirmation email
 */
async function handleBillPayment(metadata, eventData) {
  const { billId } = metadata;

  const bill = await Bill.findById(billId);
  if (!bill) {
    logger.warn({ billId }, "Webhook: Bill not found, skipping");
    return;
  }

  const paymentId = extractPaymentId(eventData);
  const settlement = await settlePaymongoBill({
    bill,
    paymentReference: paymentId,
    settledAmount: extractPaidAmount(eventData),
    source: "paymongo-webhook",
    metadata: {
      eventType: "checkout_session.payment.paid",
      provider: "paymongo",
    },
  });

  // Idempotent — skip if already paid OR same PayMongo payment was processed.
  if (!settlement.applied) {
    logger.info(
      { billId, paymentId, reason: settlement.reason },
      "Webhook: Bill payment already processed, skipping",
    );
    return;
  }
  logger.info({ billId, paymentId }, "Webhook: Bill payment confirmed");

  // Notify tenant
  try {
    const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
    await notify.paymentApproved(
      bill.userId,
      `Your payment of ₱${bill.totalAmount.toLocaleString()} for ${monthStr} has been confirmed.`,
    );
  } catch (notifErr) {
    logger.error({ err: notifErr }, "Webhook: Failed to send notification");
  }

  // Send PayMongo-style receipt email
  try {
    const tenant = await User.findById(bill.userId).lean();
    if (tenant?.email) {
      const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
      const paymentDate = new Date().toLocaleDateString("en-PH", {
        month: "long", day: "numeric", year: "numeric",
      });
      const paymentId = extractPaymentId(eventData);

      await sendPaymentReceiptEmail({
        to: tenant.email,
        tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        amount: settlement.appliedAmount,
        description: `Lilycrest Dormitory — Monthly Bill (${monthStr})`,
        billedTo: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        paymentMethod: "GCash / Online Payment",
        paymentDate,
        referenceId: paymentId,
      });
    }
  } catch (emailErr) {
    logger.error({ err: emailErr }, "Webhook: Failed to send email");
  }
}

/* ─── payment-level event lookup ─────────────────── */

/**
 * Resolve a reservation or bill from a payment-level event (payment.paid /
 * payment.failed). PayMongo's Payment object differs from the CheckoutSession
 * object — metadata may be absent, but checkout_session_id is always present.
 *
 * Strategy 1 — metadata copied from the Checkout Session to the Payment.
 * Strategy 2 — match checkout_session_id against stored paymongoSessionId.
 */
async function findRecordForPayment({ metadata, sessionId }) {
  if (metadata.type === "deposit" && metadata.reservationId) {
    const r = await Reservation.findOne({ _id: metadata.reservationId }, "_id");
    return r ? { recordType: "deposit", reservationId: String(r._id) } : null;
  }
  if (metadata.type === "bill" && metadata.billId) {
    const b = await Bill.findOne({ _id: metadata.billId }, "_id");
    return b ? { recordType: "bill", billId: String(b._id) } : null;
  }
  if (sessionId) {
    const r = await Reservation.findOne({ paymongoSessionId: sessionId }, "_id");
    if (r) return { recordType: "deposit", reservationId: String(r._id) };
    const b = await Bill.findOne({ paymongoSessionId: sessionId }, "_id");
    if (b) return { recordType: "bill", billId: String(b._id) };
  }
  return null;
}

/* ─── main handler ──────────────────────────────── */

/**
 * POST /api/webhooks/paymongo
 *
 * Main webhook endpoint. Verifies the PayMongo signature, then immediately
 * acknowledges with HTTP 200 before running any async work (DB, email,
 * notifications). This prevents PayMongo from timing out and disabling the
 * webhook when downstream services (Resend, MongoDB) are slow.
 *
 * Flow:
 *   1. Verify HMAC signature — return 200 on failure (prevents disable)
 *   2. Parse + log the event (type, event ID, session ID, reservation/bill ID)
 *   3. Send HTTP 200 immediately
 *   4. Process event asynchronously (DB update → notifications → email)
 */
export const handlePaymongoWebhook = async (req, res) => {
  const rawBody = req.body;
  const signatureHeader = req.headers["paymongo-signature"];

  // ── 1. Verify HMAC signature ─────────────────────────────────────────────
  let event;
  try {
    event = verifyWebhookSignature(rawBody, signatureHeader);
  } catch (sigError) {
    logger.warn(
      { err: sigError.message },
      "Webhook: Signature verification failed — returning 200",
    );
    return res.status(200).json({ received: true });
  }

  // ── 2. Parse and log the event ───────────────────────────────────────────
  const eventData = event?.data;
  const eventType = eventData?.attributes?.type || "unknown";
  const eventId = eventData?.id || "unknown";
  const checkoutData = eventData?.attributes?.data;
  const metadata = checkoutData?.attributes?.metadata || {};
  const sessionId = checkoutData?.id || "unknown";

  logger.info(
    {
      eventType,
      eventId,
      sessionId,
      metadataType: metadata.type,
      reservationId: metadata.reservationId,
      billId: metadata.billId,
    },
    "Webhook: Received PayMongo event",
  );

  // ── 3. Acknowledge receipt immediately ───────────────────────────────────
  // Send 200 BEFORE any async work so PayMongo does not time out waiting for
  // slow DB queries, Resend email delivery, or notification writes.
  res.status(200).json({ received: true });
  logger.info({ eventType, eventId, sessionId }, "Webhook: Responded 200 to PayMongo");

  // ── 4. Ignore non-payment events ─────────────────────────────────────────
  if (eventType !== "checkout_session.payment.paid") {
    logger.info({ eventType, eventId }, "Webhook: Ignoring non-payment event");
    return;
  }

  // ── 5. Process event (runs after 200 has been flushed to PayMongo) ────────
  try {
    if (metadata.type === "deposit") {
      await handleDepositPayment(metadata, checkoutData);
      logger.info(
        { eventId, sessionId, reservationId: metadata.reservationId },
        "Webhook: Deposit processing complete",
      );
    } else if (metadata.type === "bill") {
      await handleBillPayment(metadata, checkoutData);
      logger.info(
        { eventId, sessionId, billId: metadata.billId },
        "Webhook: Bill processing complete",
      );
    } else {
      logger.warn(
        { metadataType: metadata.type, eventId, sessionId },
        "Webhook: Unknown payment type in metadata",
      );
    }
  } catch (processingError) {
    logger.error(
      {
        err: processingError,
        eventType,
        eventId,
        sessionId,
        metadataType: metadata.type,
      },
      "Webhook: Processing error after 200 response",
    );
  }
};

/* ─── payment-event handler ─────────────────────── */

/**
 * POST /api/paymongo/webhook
 *
 * Handles the three events registered in the PayMongo dashboard:
 *   payment.paid       — locate reservation/bill, delegate to existing handlers
 *                        (idempotency-safe: same paymongoPaymentId check applies)
 *   payment.failed     — log only; records are NOT deleted so the user can retry
 *   source.chargeable  — no-op; LilyCrest uses Checkout Sessions, not the Source API
 *
 * The record lookup uses two strategies in order:
 *   1. metadata on the Payment object (PayMongo copies it from the Checkout Session)
 *   2. checkout_session_id on the Payment → matched against paymongoSessionId index
 *
 * IMPORTANT: Always returns 200. Response is sent BEFORE any async DB/email work.
 */
export const handlePaymongoSourceWebhook = async (req, res) => {
  const rawBody = req.body;
  const signatureHeader = req.headers["paymongo-signature"];

  // ── 1. Verify HMAC signature ─────────────────────────────────────────────
  let event;
  try {
    event = verifyWebhookSignature(rawBody, signatureHeader);
  } catch (sigError) {
    logger.warn(
      { err: sigError.message },
      "Webhook(payment): Signature verification failed — returning 200",
    );
    return res.status(200).json({ received: true });
  }

  // ── 2. Parse and log the event ───────────────────────────────────────────
  const eventData = event?.data;
  const eventType = eventData?.attributes?.type || "unknown";
  const eventId = eventData?.id || "unknown";
  const paymentData = eventData?.attributes?.data;
  const paymentId = paymentData?.id || "unknown";
  const amountCents = paymentData?.attributes?.amount ?? null;
  const sessionId = paymentData?.attributes?.checkout_session_id ?? null;
  const metadata = paymentData?.attributes?.metadata || {};

  logger.info(
    {
      eventType,
      eventId,
      paymentId,
      sessionId,
      metadataType: metadata.type,
      reservationId: metadata.reservationId,
      billId: metadata.billId,
    },
    "Webhook(payment): Received PayMongo event",
  );

  // ── 3. Acknowledge receipt immediately ───────────────────────────────────
  res.status(200).json({ received: true });
  logger.info({ eventType, eventId, paymentId }, "Webhook(payment): Responded 200 to PayMongo");

  // ── 4. Route by event type ───────────────────────────────────────────────
  try {
    if (eventType === "payment.paid") {
      if (paymentId === "unknown") {
        logger.warn({ eventId }, "Webhook(payment): payment.paid — missing payment ID, skipping");
        return;
      }

      const found = await findRecordForPayment({ metadata, sessionId });
      if (!found) {
        logger.warn(
          { eventId, paymentId, sessionId },
          "Webhook(payment): payment.paid — no matching reservation or bill found",
        );
        return;
      }

      // Build a synthetic eventData compatible with extractPaymentId / extractPaidAmount.
      // The existing handlers expect CheckoutSession shape; we adapt the Payment shape here.
      const syntheticEventData = {
        id: paymentId,
        attributes: {
          payments: amountCents !== null
            ? [{ id: paymentId, attributes: { amount: amountCents } }]
            : [],
        },
      };

      if (found.recordType === "deposit") {
        await handleDepositPayment(
          { type: "deposit", reservationId: found.reservationId },
          syntheticEventData,
        );
        logger.info(
          { eventId, paymentId, reservationId: found.reservationId },
          "Webhook(payment): Deposit processing complete",
        );
      } else {
        await handleBillPayment(
          { type: "bill", billId: found.billId },
          syntheticEventData,
        );
        logger.info(
          { eventId, paymentId, billId: found.billId },
          "Webhook(payment): Bill processing complete",
        );
      }

    } else if (eventType === "payment.failed") {
      const found = await findRecordForPayment({ metadata, sessionId });
      if (found?.recordType === "deposit") {
        logger.warn(
          { eventId, paymentId, reservationId: found.reservationId },
          "Webhook(payment): payment.failed — deposit failed, user may retry",
        );
      } else if (found?.recordType === "bill") {
        logger.warn(
          { eventId, paymentId, billId: found.billId },
          "Webhook(payment): payment.failed — bill payment failed, user may retry",
        );
      } else {
        logger.warn(
          { eventId, paymentId, sessionId },
          "Webhook(payment): payment.failed — no matching record found",
        );
      }

    } else if (eventType === "source.chargeable") {
      // Source API flow — not used with Checkout Sessions; acknowledge only
      logger.info(
        { eventId, sourceId: paymentId },
        "Webhook(payment): source.chargeable — no-op for Checkout Session flow",
      );

    } else {
      logger.info({ eventType, eventId }, "Webhook(payment): Ignoring unknown event type");
    }
  } catch (processingError) {
    logger.error(
      { err: processingError, eventType, eventId, paymentId },
      "Webhook(payment): Processing error after 200 response",
    );
  }
};
