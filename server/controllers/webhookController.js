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
import { sendPaymentApprovedEmail } from "../config/email.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";
import { notify } from "../utils/notificationService.js";
import logger from "../middleware/logger.js";
import { BUSINESS } from "../config/constants.js";

/* ─── helpers ───────────────────────────────────── */

/**
 * Extract the PayMongo payment ID from the event data.
 */
function extractPaymentId(eventData) {
  const payments = eventData?.attributes?.payments || [];
  return payments[0]?.id || eventData?.id || "unknown";
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
  const { reservationId, userId } = metadata;

  const reservation = await Reservation.findById(reservationId).populate(
    "roomId",
    "name branch",
  );
  if (!reservation) {
    logger.warn({ reservationId }, "Webhook: Reservation not found, skipping");
    return;
  }

  // Idempotent — skip if already paid
  if (reservation.paymentStatus === "paid") {
    logger.info({ reservationId }, "Webhook: Deposit already paid, skipping");
    return;
  }

  // Save old status for occupancy tracking
  const oldStatus = reservation.status;
  const oldData = { status: oldStatus };

  // Update payment fields
  const paymentId = extractPaymentId(eventData);
  reservation.paymentStatus = "paid";
  reservation.paymentDate = new Date();
  reservation.paymentMethod = "paymongo";
  reservation.paymongoPaymentId = paymentId;

  // Auto-reserve: set status to "reserved" (triggers reservation code generation in pre-save hook)
  reservation.status = "reserved";

  await reservation.save();

  // Update room occupancy — lock the bed
  await updateOccupancyOnReservationChange(reservation, oldData);

  logger.info(
    { reservationId, oldStatus, newStatus: "reserved", paymentId },
    "Webhook: Deposit paid → reservation auto-reserved",
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

  // Send confirmation email
  try {
    const tenant = await User.findById(reservation.userId).lean();
    if (tenant?.email) {
      await sendPaymentApprovedEmail({
        to: tenant.email,
        tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        billingMonth: "Reservation Deposit",
        paidAmount: reservation.totalPrice || BUSINESS.DEPOSIT_AMOUNT,
        branchName: reservation.roomId?.branch || "",
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
  const { billId, userId } = metadata;

  const bill = await Bill.findById(billId);
  if (!bill) {
    logger.warn({ billId }, "Webhook: Bill not found, skipping");
    return;
  }

  // Idempotent — skip if already paid
  if (bill.status === "paid") {
    logger.info({ billId }, "Webhook: Bill already paid, skipping");
    return;
  }

  // Update payment fields
  const paymentId = extractPaymentId(eventData);
  bill.paidAmount = bill.totalAmount;
  bill.status = "paid";
  bill.paymentDate = new Date();
  bill.paymentMethod = "paymongo";
  bill.paymongoPaymentId = paymentId;
  bill.paymentProof = {
    verificationStatus: "approved",
    verifiedAt: new Date(),
    submittedAmount: bill.totalAmount,
  };

  await bill.save();

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

  // Send confirmation email
  try {
    const tenant = await User.findById(bill.userId).lean();
    if (tenant?.email) {
      const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
      await sendPaymentApprovedEmail({
        to: tenant.email,
        tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
        billingMonth: monthStr,
        paidAmount: bill.totalAmount,
        branchName: bill.branch,
      });
    }
  } catch (emailErr) {
    logger.error({ err: emailErr }, "Webhook: Failed to send email");
  }
}

/* ─── main handler ──────────────────────────────── */

/**
 * POST /api/webhooks/paymongo
 *
 * Main webhook endpoint. Verifies the PayMongo signature, extracts the event,
 * and routes to the appropriate handler based on metadata.type.
 *
 * IMPORTANT: Always returns 200 to PayMongo, even on errors.
 * Returning non-200 causes PayMongo to retry, which we don't want
 * for application-level errors (only for signature failures).
 */
export const handlePaymongoWebhook = async (req, res) => {
  try {
    // req.body is a raw Buffer (from express.raw middleware)
    const rawBody = req.body;
    const signatureHeader = req.headers["paymongo-signature"];

    // Verify signature — throws if invalid
    const event = verifyWebhookSignature(rawBody, signatureHeader);

    // Extract event data
    const eventData = event?.data;
    const eventType = eventData?.attributes?.type;

    logger.info(
      { eventType, eventId: eventData?.id },
      "Webhook: Received PayMongo event",
    );

    // Only process payment.paid events
    if (eventType !== "checkout_session.payment.paid") {
      logger.info({ eventType }, "Webhook: Ignoring non-payment event");
      return res.status(200).json({ received: true });
    }

    // Extract checkout session data and metadata
    const checkoutData = eventData?.attributes?.data;
    const metadata = checkoutData?.attributes?.metadata || {};

    // Route to appropriate handler
    if (metadata.type === "deposit") {
      await handleDepositPayment(metadata, checkoutData);
    } else if (metadata.type === "bill") {
      await handleBillPayment(metadata, checkoutData);
    } else {
      logger.warn(
        { metadataType: metadata.type },
        "Webhook: Unknown payment type in metadata",
      );
    }

    res.status(200).json({ received: true });
  } catch (error) {
    // ALWAYS return 200 to PayMongo — returning 4xx/5xx causes webhook disablement.
    // Per PayMongo: "ensure that all webhook responses return an HTTP status code of 200"
    logger.error(
      { err: error },
      "Webhook: Error during processing (returning 200 per PayMongo guidelines)",
    );
    res.status(200).json({ received: true });
  }
};
