/**
 * ============================================================================
 * PAYMENT ROUTES — PAYMONGO INTEGRATION + PAYMENT HISTORY
 * ============================================================================
 *
 * API endpoints for online payment processing via PayMongo
 * and payment history/ledger queries.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import * as paymentController from "../controllers/paymentController.js";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import Reservation from "../models/Reservation.js";
import dayjs from "dayjs";

const router = express.Router();

// ============================================================================
// PAYMONGO ROUTES (Tenant)
// ============================================================================

/**
 * POST /api/payments/bill/:billId/checkout
 * Create a PayMongo checkout session for a monthly bill
 */
router.post("/bill/:billId/checkout", verifyToken, paymentController.createBillCheckout);

/**
 * POST /api/payments/deposit/:resId/checkout
 * Create a PayMongo checkout session for a reservation deposit
 */
router.post("/deposit/:resId/checkout", verifyToken, paymentController.createDepositCheckout);

/**
 * GET /api/payments/session/:sessionId/status
 * Check whether a PayMongo checkout session has been paid
 */
router.get("/session/:sessionId/status", verifyToken, paymentController.checkSessionStatus);

// ============================================================================
// PAYMENT HISTORY ROUTES
// ============================================================================

/**
 * GET /api/payments/history
 * Get payment history for the authenticated tenant
 */
router.get("/history", verifyToken, async (req, res) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const payments = await Payment.getPaymentHistory(dbUser._id, {
      limit: parseInt(req.query.limit) || 50,
    });

    res.json({ success: true, data: payments });
  } catch (error) {
    console.error("❌ Payment history error:", error);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

/**
 * GET /api/payments/bill/:billId/payments
 * Get all payments for a specific bill
 */
router.get("/bill/:billId/payments", verifyToken, async (req, res) => {
  try {
    const payments = await Payment.getPaymentsForBill(req.params.billId);
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error("❌ Bill payments error:", error);
    res.status(500).json({ error: "Failed to fetch bill payments" });
  }
});

/**
 * GET /api/payments/vacancy-dates
 * Get expected vacancy dates for all occupied beds (admin only).
 * Computes from checkInDate + leaseDuration for checked-in reservations.
 */
router.get("/vacancy-dates", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reservations = await Reservation.find({
      status: "checked-in",
      isArchived: false,
    })
      .populate("roomId", "name branch beds")
      .populate("userId", "firstName lastName")
      .select("checkInDate leaseDuration selectedBed roomId userId")
      .lean();

    const vacancyData = reservations
      .filter((r) => r.checkInDate && r.leaseDuration && r.selectedBed?.id)
      .map((r) => ({
        roomId: r.roomId?._id,
        roomName: r.roomId?.name,
        branch: r.roomId?.branch,
        bedId: r.selectedBed.id,
        bedPosition: r.selectedBed.position,
        tenantName: `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim(),
        checkInDate: r.checkInDate,
        leaseDuration: r.leaseDuration,
        expectedVacancyDate: dayjs(r.checkInDate).add(r.leaseDuration, "month").toDate(),
        daysRemaining: dayjs(r.checkInDate).add(r.leaseDuration, "month").diff(dayjs(), "day"),
      }));

    res.json({ success: true, data: vacancyData });
  } catch (error) {
    console.error("❌ Vacancy dates error:", error);
    res.status(500).json({ error: "Failed to compute vacancy dates" });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;

