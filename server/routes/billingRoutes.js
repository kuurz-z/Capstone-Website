/**
 * ============================================================================
 * BILLING ROUTES
 * ============================================================================
 *
 * Module 4 billing route group.
 * Owns bills, verification, penalties, readiness, publishing, reporting, and exports.
 * All endpoints require authentication.
 *
 * ============================================================================
 */

import express from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import * as billingController from "../controllers/billingController.js";
import { requirePermission } from "../middleware/permissions.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

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
 * GET /api/billing/:billId/pdf
 * Download a generated bill PDF. Tenants may download their own bills; admins
 * may download bills in their branch.
 */
router.get("/:billId/pdf", billingController.downloadBillPdf);

router.get("/:billId/utility-breakdown/:utilityType", billingController.getMyUtilityBreakdownByBillId);

/**
 * POST /api/billing/:billId/submit-proof
 * Legacy compatibility route. New monthly bill payments must use online checkout.
 */
router.post("/:billId/submit-proof", billingController.submitPaymentProof);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/billing/stats
 * Get billing statistics by branch (Admin only)
 */
router.get(
  "/stats",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getBillingStats,
);

/**
 * GET /api/billing/branch
 * Get all bills for a branch (Admin only)
 */
router.get(
  "/branch",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getBillsByBranch,
);

/**
 * GET /api/billing/rooms
 * Get rooms with occupants for bill generation (Admin only)
 */
router.get(
  "/rooms",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getRoomsWithTenants,
);

/**
 * GET /api/billing/pending-verifications
 * Get bills with pending payment proof verifications (Admin only)
 */
router.get(
  "/pending-verifications",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getPendingVerifications,
);

/**
 * GET /api/billing/report
 * Get billing report (revenue, overdue, penalties) (Admin only)
 */
router.get(
  "/report",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getBillingReport,
);

/**
 * GET /api/billing/rent
 * List monthly rent bills (Admin only)
 */
router.get(
  "/rent",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getRentBills,
);

/**
 * GET /api/billing/rent/tenants
 * List active tenants/contracts eligible for rent billing (Admin only)
 */
router.get(
  "/rent/tenants",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getRentBillableTenants,
);

/**
 * POST /api/billing/rent/preview
 * Preview one monthly rent bill before final generation (Admin only)
 */
router.post(
  "/rent/preview",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getRentBillPreview,
);

/**
 * POST /api/billing/rent/generate
 * Generate one monthly rent bill for an active reservation (Admin only)
 */
router.post(
  "/rent/generate",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.generateRentBill,
);

/**
 * POST /api/billing/rent/generate-all
 * Generate all ready monthly rent bills for a branch + billing month (Admin only)
 */
router.post(
  "/rent/generate-all",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.generateAllRentBills,
);

/**
 * POST /api/billing/rent/:billId/send
 * Send or resend an existing monthly rent bill (Admin only)
 */
router.post(
  "/rent/:billId/send",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.sendRentBill,
);

/**
 * POST /api/billing/:billId/verify
 * Admin approves or rejects payment proof
 */
router.post(
  "/:billId/verify",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.verifyPayment,
);

/**
 * POST /api/billing/:billId/mark-paid
 * Mark a bill as paid (Admin only)
 */
router.post(
  "/:billId/mark-paid",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.markBillAsPaid,
);

/**
 * DELETE /api/billing/:billId
 * Hard-delete an orphaned or erroneous bill (Admin only)
 * Note: paid bills cannot be deleted.
 */
router.delete(
  "/:billId",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.deleteBill,
);

/**
 * POST /api/billing/apply-penalties
 * Auto-calculate and apply penalties to overdue bills (Admin only)
 */
router.post(
  "/apply-penalties",
  apiLimiter,
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.applyPenalties,
);

/**
 * GET /api/billing/readiness
 * Get per-room utility finalization status for the active billing cycle.
 * Used by the Issue Invoices tab to show what rooms are ready to publish.
 */
router.get(
  "/readiness",
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.getRoomReadiness,
);

/**
 * POST /api/billing/publish/:roomId
 * Atomically publish all draft bills for a room — flip to pending + PDF + email.
 * Guards: electricity must be closed + water must be finalized (where applicable).
 */
router.post(
  "/publish/:roomId",
  apiLimiter,
  verifyAdmin,
  requirePermission("manageBilling"),
  filterByBranch,
  billingController.publishRoomBills,
);


/**
 * GET /api/billing/export
 * Get flattened billing data for CSV export (Admin only).
 * Query: ?branch=gil-puyat&status=overdue&month=2026-01
 */
router.get("/export", verifyAdmin, requirePermission("manageBilling"), filterByBranch, async (req, res) => {
  try {
    const { Bill } = await import("../models/index.js");
    // Branch admins: branch is forced from req.branchFilter (their assigned branch)
    // Owners: branch may optionally come from the query param
    const branch = req.branchFilter || req.query.branch;
    const { status, month } = req.query;

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month format — use YYYY-MM", code: "INVALID_MONTH" });
    }

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
