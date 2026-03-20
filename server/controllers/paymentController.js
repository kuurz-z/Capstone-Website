/**
 * ============================================================================
 * PAYMENT CONTROLLER — PAYMONGO INTEGRATION
 * ============================================================================
 *
 * Handles online payment checkout sessions and webhook callbacks.
 * Works alongside the existing manual proof-of-payment flow.
 *
 * Endpoints:
 *   POST /api/payments/bill/:billId/checkout   — Create checkout for a bill
 *   POST /api/payments/deposit/:resId/checkout  — Create checkout for deposit
 *   GET  /api/payments/session/:sessionId/status — Check session payment status
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import { createCheckoutSession, getCheckoutSession } from "../config/paymongo.js";
import { Bill, Reservation, User } from "../models/index.js";
import logger from "../middleware/logger.js";
import { sendPaymentApprovedEmail, sendPaymentReceiptEmail } from "../config/email.js";
import { updateOccupancyOnReservationChange } from "../utils/occupancyManager.js";
import { BUSINESS } from "../config/constants.js";
import {
  sendSuccess,
  AppError,
} from "../middleware/errorHandler.js";

/* ─── helpers ───────────────────────────────────── */

const FRONTEND_URL =
  process.env.FRONTEND_URL?.split(",")[0]?.trim() || "http://localhost:5173";

async function getDbUser(firebaseUid) {
  return User.findOne({ firebaseUid }).lean();
}

/* ─── controllers ────────────────────────────────── */

/**
 * POST /api/payments/bill/:billId/checkout
 * Create a PayMongo checkout session for a monthly bill.
 */
export const createBillCheckout = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const bill = await Bill.findById(billId);
    if (!bill) throw new AppError("Bill not found", 404, "BILL_NOT_FOUND");

    if (String(bill.userId) !== String(dbUser._id)) {
      throw new AppError("You can only pay your own bills", 403, "FORBIDDEN");
    }

    if (bill.status === "paid") {
      throw new AppError("Bill is already paid", 400, "ALREADY_PAID");
    }

    // --- Double-payment guard: reuse existing unpaid session ---
    if (bill.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(bill.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        if (existingUrl && existingPayments.length === 0) {
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: bill.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Session expired or invalid — create a new one below
      }
    }

    const amountDue = bill.totalAmount - (bill.paidAmount || 0);
    const monthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount: amountDue,
      description: `Lilycrest Dormitory — ${monthLabel} Bill`,
      metadata: {
        type: "bill",
        billId: String(bill._id),
        userId: String(dbUser._id),
      },
      successUrl: `${FRONTEND_URL}/billing?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/billing?payment=cancelled`,
    });

    bill.paymongoSessionId = sessionId;
    await bill.save();

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/deposit/:resId/checkout
 * Create a PayMongo checkout session for a reservation deposit.
 */
export const createDepositCheckout = async (req, res, next) => {
  try {
    const { resId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const reservation = await Reservation.findById(resId).populate("roomId", "name branch");
    if (!reservation) throw new AppError("Reservation not found", 404, "RESERVATION_NOT_FOUND");

    if (String(reservation.userId) !== String(dbUser._id)) {
      throw new AppError("You can only pay for your own reservation", 403, "FORBIDDEN");
    }

    if (reservation.paymentStatus === "paid") {
      throw new AppError("Deposit is already paid", 400, "ALREADY_PAID");
    }

    // --- Double-payment guard: reuse existing unpaid session ---
    if (reservation.paymongoSessionId) {
      try {
        const existing = await getCheckoutSession(reservation.paymongoSessionId);
        const existingUrl = existing?.attributes?.checkout_url;
        const existingPayments = existing?.attributes?.payments || [];
        // If session exists and has no payments yet, reuse it
        if (existingUrl && existingPayments.length === 0) {
          return sendSuccess(res, {
            checkoutUrl: existingUrl,
            sessionId: reservation.paymongoSessionId,
            reused: true,
          });
        }
      } catch {
        // Session expired or invalid — create a new one below
      }
    }

    const amount = BUSINESS.DEPOSIT_AMOUNT;
    const roomName = reservation.roomId?.name || "Room";

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      description: `Lilycrest Dormitory — Reservation Deposit (${roomName})`,
      metadata: {
        type: "deposit",
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
      },
      successUrl: `${FRONTEND_URL}/applicant/reservation?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/applicant/reservation?payment=cancelled&session_id={id}`,
    });

    reservation.paymongoSessionId = sessionId;
    await reservation.save();

    sendSuccess(res, { checkoutUrl, sessionId });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/session/:sessionId/status
 * Check whether a PayMongo checkout session has been paid.
 */
export const checkSessionStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    logger.info({ sessionId }, "checkSessionStatus called");
    const session = await getCheckoutSession(sessionId);
    const payments = session.attributes.payments || [];
    // Only count payments that actually succeeded — failed/pending entries
    // still appear in the payments array but should NOT mark as paid
    const paidPayments = payments.filter((p) => {
      const status = p?.attributes?.status || p?.status;
      return status === "paid";
    });
    const isPaid = paidPayments.length > 0;
    logger.info({ isPaid, totalPayments: payments.length, paidPayments: paidPayments.length }, "Payment check result");


    // ── Extract payment method FIRST so it's available for all emails ──
    let paymentMethod = null;
    if (paidPayments.length > 0) {
      const firstPayment = paidPayments[0];
      const payObj = firstPayment?.attributes || firstPayment;
      const rawType =
        payObj?.source?.type ||
        session.attributes?.payment_method_used ||
        "online";

      const METHOD_LABELS = {
        gcash:       "GCash",
        grab_pay:    "GrabPay",
        paymaya:     "Maya",
        card:        "Credit / Debit Card",
        dob:         "Online Banking",
        billease:    "BillEase",
        qrph:        "QR Ph",
        online:      "Online Payment (PayMongo)",
      };
      paymentMethod = METHOD_LABELS[rawType] || `PayMongo — ${rawType}`;
      logger.info({ rawType, paymentMethod }, "Payment method detected");
    }

    if (isPaid) {
      const metadata = session.attributes.metadata || {};
      logger.info({ type: metadata.type, billId: metadata.billId, reservationId: metadata.reservationId }, "Payment metadata");

      // Auto-mark the bill as paid
      if (metadata.type === "bill" && metadata.billId) {
        const bill = await Bill.findById(metadata.billId);
        if (bill && bill.status !== "paid") {
          logger.info({ billId: metadata.billId }, "Marking bill as paid");
          bill.paidAmount = bill.totalAmount;
          bill.status = "paid";
          bill.paymentDate = new Date();
          bill.paymentMethod = "paymongo";
          bill.paymongoPaymentId = paidPayments[0]?.id || sessionId;
          bill.paymentProof = {
            verificationStatus: "approved",
            verifiedAt: new Date(),
            submittedAmount: bill.totalAmount,
          };
          await bill.save();

          // Send confirmation + receipt emails
          try {
            const tenant = await User.findById(bill.userId).lean();
            if (tenant?.email) {
              const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
              const tenantName = `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant";
              logger.info({ email: tenant.email }, "Sending bill receipt email");
              await sendPaymentApprovedEmail({
                to: tenant.email,
                tenantName,
                billingMonth: monthStr,
                paidAmount: bill.totalAmount,
                branchName: bill.branch,
              });
              await sendPaymentReceiptEmail({
                to: tenant.email,
                tenantName,
                amount: bill.totalAmount,
                description: `Monthly Bill — ${monthStr}`,
                paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                paymentDate: dayjs().format("MMMM D, YYYY"),
                referenceId: paidPayments[0]?.id || sessionId,
              });
            }
          } catch (emailErr) {
            logger.warn({ err: emailErr }, "Bill email error");
          }
        } else {
          logger.info({ billId: metadata.billId }, "Bill already marked as paid — skipping");
        }
      }

      // Auto-mark the reservation deposit as paid
      if (metadata.type === "deposit" && metadata.reservationId) {
        const reservation = await Reservation.findById(metadata.reservationId).populate("roomId", "name branch");
        if (reservation && reservation.paymentStatus !== "paid") {
          logger.info({ reservationId: metadata.reservationId }, "Marking deposit as paid");
          const oldStatus = reservation.status;
          reservation.paymentStatus = "paid";
          reservation.paymentDate = new Date();
          reservation.paymentMethod = paymentMethod || "paymongo";
          reservation.paymongoPaymentId = paidPayments[0]?.id || sessionId;
          reservation.status = "reserved"; // triggers reservation code generation in pre-save hook
          await reservation.save();

          // Lock the bed — update room occupancy (matches webhook handler)
          await updateOccupancyOnReservationChange(reservation, { status: oldStatus });
          logger.info({ reservationId: metadata.reservationId }, "Bed locked for reservation");

          // Send receipt email for deposit
          try {
            const tenant = await User.findById(reservation.userId).lean();
            if (tenant?.email) {
              const tenantName = `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant";
              const roomName = reservation.roomId?.name || "Room";
              logger.info({ email: tenant.email }, "Sending deposit receipt email");
              await sendPaymentReceiptEmail({
                to: tenant.email,
                tenantName,
                amount: BUSINESS.DEPOSIT_AMOUNT,
                description: `Reservation Deposit — ${roomName}`,
                paymentMethod: paymentMethod || "Online Payment (PayMongo)",
                paymentDate: dayjs().format("MMMM D, YYYY"),
                referenceId: paidPayments[0]?.id || sessionId,
              });
            }
          } catch (emailErr) {
            logger.warn({ err: emailErr }, "Deposit receipt email error");
          }
        } else {
          logger.info({ reservationId: metadata.reservationId }, "Deposit already paid — skipping");
        }
      }
    }

    logger.info({ sessionId, status: isPaid ? "paid" : "pending" }, "checkSessionStatus complete");

    sendSuccess(res, {
      sessionId,
      status: isPaid ? "paid" : "pending",
      paymentCount: paidPayments.length,
      paymentMethod,
    });
  } catch (error) {
    logger.error({ err: error, sessionId: req.params.sessionId }, "checkSessionStatus error");
    next(error);
  }
};
