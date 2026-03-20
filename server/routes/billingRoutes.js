/**
 * ============================================================================
 * BILLING ROUTES
 * ============================================================================
 *
 * API endpoints for billing operations.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import * as billingController from "../controllers/billingController.js";

const router = express.Router();

// All billing routes require authentication
router.use(verifyToken);

// ============================================================================
// TENANT ROUTES
// ============================================================================

/**
 * GET /api/billing/current
 * Get current month's billing for logged-in tenant
 */
router.get("/current", billingController.getCurrentBilling);

/**
 * GET /api/billing/history
 * Get billing history for logged-in tenant
 */
router.get("/history", billingController.getBillingHistory);

/**
 * GET /api/billing/my-bills
 * Get all bills for logged-in tenant with full breakdown
 */
router.get("/my-bills", billingController.getMyBills);

/**
 * POST /api/billing/:billId/submit-proof
 * Tenant submits payment proof (image + amount)
 */
router.post("/:billId/submit-proof", billingController.submitPaymentProof);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/billing/stats
 * Get billing statistics by branch (Admin only)
 */
router.get("/stats", verifyAdmin, filterByBranch, billingController.getBillingStats);

/**
 * GET /api/billing/branch
 * Get all bills for a branch (Admin only)
 */
router.get("/branch", verifyAdmin, filterByBranch, billingController.getBillsByBranch);

/**
 * GET /api/billing/rooms
 * Get rooms with occupants for bill generation (Admin only)
 */
router.get("/rooms", verifyAdmin, filterByBranch, billingController.getRoomsWithTenants);

/**
 * GET /api/billing/pending-verifications
 * Get bills with pending payment proof verifications (Admin only)
 */
router.get("/pending-verifications", verifyAdmin, filterByBranch, billingController.getPendingVerifications);

/**
 * GET /api/billing/report
 * Get billing report (revenue, overdue, penalties) (Admin only)
 */
router.get("/report", verifyAdmin, filterByBranch, billingController.getBillingReport);

/**
 * POST /api/billing/generate-room
 * Generate room-based bills distributed among tenants (Admin only)
 */
router.post("/generate-room", verifyAdmin, filterByBranch, billingController.generateRoomBill);

/**
 * POST /api/billing/:billId/verify
 * Admin approves or rejects payment proof
 */
router.post("/:billId/verify", verifyAdmin, filterByBranch, billingController.verifyPayment);

/**
 * POST /api/billing/:billId/mark-paid
 * Mark a bill as paid (Admin only)
 */
router.post("/:billId/mark-paid", verifyAdmin, filterByBranch, billingController.markBillAsPaid);

/**
 * POST /api/billing/apply-penalties
 * Auto-calculate and apply penalties to overdue bills (Admin only)
 */
router.post("/apply-penalties", verifyAdmin, filterByBranch, billingController.applyPenalties);

/**
 * GET /api/billing/export
 * Get flattened billing data for CSV export (Admin only).
 * Query: ?branch=gil-puyat&status=overdue&month=2026-01
 */
router.get("/export", verifyAdmin, filterByBranch, async (req, res) => {
  try {
    const { Bill } = await import("../models/index.js");
    // Regular admins: branch is forced from req.branchFilter (their assigned branch)
    // Super admins: branch comes from query param
    const branch = req.branchFilter || req.query.branch;
    const { status, month } = req.query;

    const filter = { isArchived: { $ne: true } };
    if (branch) filter.branch = branch;
    if (status) filter.status = status;
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      filter.billingMonth = { $gte: start, $lt: end };
    }

    const bills = await Bill.find(filter)
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name")
      .sort({ billingMonth: -1 })
      .lean();

    const data = bills.map((b) => ({
      tenantName: `${b.userId?.firstName || ""} ${b.userId?.lastName || ""}`.trim(),
      email: b.userId?.email || "",
      roomName: b.roomId?.name || "",
      billingMonth: b.billingMonth ? new Date(b.billingMonth).toISOString().slice(0, 7) : "",
      rent: b.charges?.rent || 0,
      electricity: b.charges?.electricity || 0,
      water: b.charges?.water || 0,
      penalty: b.charges?.penalty || 0,
      totalAmount: b.totalAmount || 0,
      paidAmount: b.paidAmount || 0,
      status: b.status,
      dueDate: b.dueDate,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("❌ Billing export error:", error);
    res.status(500).json({ error: "Failed to export billing data" });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
