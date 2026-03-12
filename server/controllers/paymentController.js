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
import { sendPaymentApprovedEmail } from "../config/email.js";
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

    const amount = 2000;
    const roomName = reservation.roomId?.name || "Room";

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      description: `Lilycrest Dormitory — Reservation Deposit (${roomName})`,
      metadata: {
        type: "deposit",
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
      },
      successUrl: `${FRONTEND_URL}/applicant/profile?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/applicant/profile?payment=cancelled`,
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
    const session = await getCheckoutSession(sessionId);
    const payments = session.attributes.payments || [];
    const isPaid = payments.length > 0;

    if (isPaid) {
      const metadata = session.attributes.metadata || {};

      // Auto-mark the bill as paid
      if (metadata.type === "bill" && metadata.billId) {
        const bill = await Bill.findById(metadata.billId);
        if (bill && bill.status !== "paid") {
          bill.paidAmount = bill.totalAmount;
          bill.status = "paid";
          bill.paymentDate = new Date();
          bill.paymentMethod = "paymongo";
          bill.paymongoPaymentId = payments[0]?.id || sessionId;
          bill.paymentProof = {
            verificationStatus: "approved",
            verifiedAt: new Date(),
            submittedAmount: bill.totalAmount,
          };
          await bill.save();

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
            console.error("Email error:", emailErr.message);
          }
        }
      }

      // Auto-mark the reservation deposit as paid
      if (metadata.type === "deposit" && metadata.reservationId) {
        const reservation = await Reservation.findById(metadata.reservationId);
        if (reservation && reservation.paymentStatus !== "paid") {
          reservation.paymentStatus = "paid";
          reservation.paymentDate = new Date();
          reservation.paymentMethod = "paymongo";
          reservation.paymongoPaymentId = payments[0]?.id || sessionId;
          await reservation.save();
        }
      }
    }

    sendSuccess(res, {
      sessionId,
      status: isPaid ? "paid" : "pending",
      paymentCount: payments.length,
    });
  } catch (error) {
    next(error);
  }
};
