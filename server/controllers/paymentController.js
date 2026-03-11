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

import { createCheckoutSession, getCheckoutSession } from "../config/paymongo.js";
import { Bill, Reservation, User } from "../models/index.js";
import { sendPaymentApprovedEmail } from "../config/email.js";

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
export const createBillCheckout = async (req, res) => {
  try {
    const { billId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    // Ownership check
    if (String(bill.userId) !== String(dbUser._id)) {
      return res.status(403).json({ error: "You can only pay your own bills" });
    }

    // Status check
    if (bill.status === "paid") {
      return res.status(400).json({ error: "Bill is already paid" });
    }

    const amountDue = bill.totalAmount - (bill.paidAmount || 0);
    const monthLabel = new Date(bill.billingMonth).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
    });

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

    // Store session ID on the bill for later verification
    bill.paymongoSessionId = sessionId;
    await bill.save();

    console.log(`✅ Checkout created for bill ${billId} → ${sessionId}`);
    res.json({ checkoutUrl, sessionId });
  } catch (error) {
    console.error("❌ Create bill checkout error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout" });
  }
};

/**
 * POST /api/payments/deposit/:resId/checkout
 * Create a PayMongo checkout session for a reservation deposit.
 */
export const createDepositCheckout = async (req, res) => {
  try {
    const { resId } = req.params;
    const dbUser = await getDbUser(req.user.uid);
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const reservation = await Reservation.findById(resId).populate("roomId", "name branch");
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });

    // Ownership check
    if (String(reservation.userId) !== String(dbUser._id)) {
      return res.status(403).json({ error: "You can only pay for your own reservation" });
    }

    // Status check
    if (reservation.paymentStatus === "paid") {
      return res.status(400).json({ error: "Deposit is already paid" });
    }

    const amount = reservation.totalPrice || reservation.depositAmount || 0;
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid deposit amount" });
    }

    const roomName = reservation.roomId?.name || "Room";

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      description: `Lilycrest Dormitory — Reservation Deposit (${roomName})`,
      metadata: {
        type: "deposit",
        reservationId: String(reservation._id),
        userId: String(dbUser._id),
      },
      successUrl: `${FRONTEND_URL}/profile?payment=success&session_id={id}`,
      cancelUrl: `${FRONTEND_URL}/profile?payment=cancelled`,
    });

    // Store session ID on the reservation for later verification
    reservation.paymongoSessionId = sessionId;
    await reservation.save();

    console.log(`✅ Deposit checkout created for reservation ${resId} → ${sessionId}`);
    res.json({ checkoutUrl, sessionId });
  } catch (error) {
    console.error("❌ Create deposit checkout error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout" });
  }
};

/**
 * GET /api/payments/session/:sessionId/status
 * Check whether a PayMongo checkout session has been paid.
 * Called by the frontend after redirect back from PayMongo.
 */
export const checkSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getCheckoutSession(sessionId);
    const payments = session.attributes.payments || [];
    const isPaid = payments.length > 0;

    if (isPaid) {
      const metadata = session.attributes.metadata || {};

      // Auto-mark the bill or reservation as paid
      if (metadata.type === "bill" && metadata.billId) {
        const bill = await Bill.findById(metadata.billId);
        if (bill && bill.status !== "paid") {
          bill.paidAmount = bill.totalAmount;
          bill.status = "paid";
          bill.paymentDate = new Date();
          bill.paymentMethod = "paymongo";
          bill.paymongoPaymentId = payments[0]?.id || sessionId;
          bill.paymentProof = {
            verificationStatus: "auto-verified",
            verifiedAt: new Date(),
            submittedAmount: bill.totalAmount,
          };
          await bill.save();
          console.log(`✅ Bill ${metadata.billId} auto-marked as paid via PayMongo`);

          // Send confirmation email
          try {
            const tenant = await User.findById(bill.userId).lean();
            if (tenant?.email) {
              const monthStr = new Date(bill.billingMonth).toLocaleDateString("en-PH", {
                year: "numeric",
                month: "long",
              });
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

      if (metadata.type === "deposit" && metadata.reservationId) {
        const reservation = await Reservation.findById(metadata.reservationId);
        if (reservation && reservation.paymentStatus !== "paid") {
          reservation.paymentStatus = "paid";
          reservation.paymentDate = new Date();
          reservation.paymentMethod = "paymongo";
          reservation.paymongoPaymentId = payments[0]?.id || sessionId;
          await reservation.save();
          console.log(`✅ Reservation ${metadata.reservationId} deposit auto-marked as paid`);
        }
      }
    }

    res.json({
      sessionId,
      status: isPaid ? "paid" : "pending",
      paymentCount: payments.length,
    });
  } catch (error) {
    console.error("❌ Check session status error:", error);
    res.status(500).json({ error: "Failed to check payment status" });
  }
};
