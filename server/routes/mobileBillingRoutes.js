/**
 * ============================================================================
 * MOBILE BILLING ROUTES (thin compatibility bridge over canonical Billing)
 * ============================================================================
 *
 * Server-side bridge so the mobile app's /api/m/billing/* and
 * /api/m/paymongo/* calls are answered from the SAME authoritative Bill
 * data, business rules, and payment workflow as the web application —
 * instead of the vendored server/mobile/controllers/billing.controller.js,
 * which reads/writes a legacy `billing` collection with its own status
 * vocabulary (see docs/reports for the audit that identified this).
 *
 * Mounted at /api/m BEFORE the vendored mobile router (server.js), so every
 * path defined here fully supersedes the vendored controller for mobile
 * billing traffic — same pattern as routes/mobileContractRoutes.js.
 * Paths NOT defined here (there are none for
 * billing after this change) would fall through to the vendored router.
 *
 * Every route derives tenant identity exclusively from the resolved mobile
 * session (req.mobileTenant / req.user.mongoId, set by mobileTenantAuth) —
 * never from a client-supplied id — and every bill lookup is scoped by
 * { _id, userId } so a tenant can only ever see their own bills.
 */

import express from "express";
import { loadMobilePaymentEvidence } from "../services/billing/mobilePaymentEvidence.js";
import fs from "fs";
import path from "path";
import { Bill, Reservation } from "../models/index.js";
import { mobileTenantAuth } from "../middleware/mobileTenantAuth.js";
import {
  toMobileBill,
  isMobileEffectivelyPaid,
  formatMobileElectricityBreakdown,
  formatMobileWaterBreakdown,
} from "../services/mobileBillingBridge.js";
import {
  NON_DRAFT_BILL_FILTER,
  CURRENT_BILL_SORT,
  selectCurrentBillFromList,
} from "../services/billing/currentBillResolver.js";
import { getVisibleBillCharges } from "../utils/billingPolicy.js";
import { isBillPdfStale } from "../services/billPdfCache.js";
import {
  generateRentBillPdf,
  formatBillReference,
  buildTenantUtilityBreakdown,
  generateCanonicalBillReceiptPdf,
  SERVER_ROOT,
  isPathInsideBillingPdfRoot,
} from "../controllers/billing/_helpers.js";

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// IMPORTANT: mobileTenantAuth is attached per-route below, NEVER via
// router.use() at the router level. This router is mounted at /api/m
// alongside sibling routers for /auth, /rooms, /faqs, etc. A router-level
// router.use(mobileTenantAuth) would run for EVERY /api/m/* request that
// reaches this router — including unauthenticated paths like
// /api/m/auth/login — and, since mobileTenantAuth ends the response with
// 401 instead of calling next() on failure, it would never fall through to
// the sibling router that actually owns that path. Matches the existing
// per-route convention in routes/mobileContractRoutes.js.

// Canonical selection rule lives in services/billing/currentBillResolver.js
// — see NON_DRAFT_BILL_FILTER/CURRENT_BILL_SORT/selectCurrentBillFromList
// there for why (shared verbatim with billingQueryController.js's web
// getCurrentBilling and the mobile dashboard controller so Billing, Home,
// and the web app never disagree on which bill is "current").
const NON_DRAFT_FILTER = NON_DRAFT_BILL_FILTER;

async function mapMobileBillsWithBreakdowns(bills, tenantId) {
  const dbUser = { _id: tenantId };
  const payments = await loadMobilePaymentEvidence(bills, tenantId);
  return Promise.all(
    bills.map(async (bill) => {
      const visibleCharges = getVisibleBillCharges(bill);
      let electricityBreakdown = null;
      let waterBreakdown = null;
      if (Number(visibleCharges.electricity || 0) > 0) {
        electricityBreakdown = await buildTenantUtilityBreakdown({ dbUser, bill, utilityType: "electricity" });
      }
      if (Number(visibleCharges.water || 0) > 0) {
        waterBreakdown = await buildTenantUtilityBreakdown({ dbUser, bill, utilityType: "water" });
      }
      return toMobileBill(bill, { electricityBreakdown, waterBreakdown, payment: payments.get(String(bill._id)) || null });
    }),
  );
}

async function mapMobileBillWithBreakdowns(bill, tenantId) {
  if (!bill) return null;
  const [mobileBill] = await mapMobileBillsWithBreakdowns([bill], tenantId);
  return mobileBill;
}

router.get("/billing/me", mobileTenantAuth, asyncRoute(async (req, res) => {
  const bills = await Bill.find({ userId: req.mobileTenant._id, ...NON_DRAFT_FILTER })
    .sort(CURRENT_BILL_SORT);
  const mapped = await mapMobileBillsWithBreakdowns(bills, req.mobileTenant._id);
  res.json(mapped);
}));

router.get("/billing/me/latest", mobileTenantAuth, asyncRoute(async (req, res) => {
  // selectCurrentBillFromList (not bills[0]) — a later billingCycleStart
  // alone doesn't mean "current"; see its doc comment in
  // services/mobileBillingBridge.js for the pre-generated-next-cycle overlap
  // this guards against, matching the same rule the mobile dashboard uses.
  const bills = await Bill.find({ userId: req.mobileTenant._id, ...NON_DRAFT_FILTER })
    .sort(CURRENT_BILL_SORT)
    .limit(5);
  const bill = selectCurrentBillFromList(bills);
  if (!bill) {
    return res.json({ state: "NO_CURRENT_BILL", bill: null });
  }
  const mapped = await mapMobileBillWithBreakdowns(bill, req.mobileTenant._id);
  const hasPendingUtility = Object.values(mapped.utility_schedules || {})
    .some((schedule) => schedule?.state === "pending");
  res.json({
    state: hasPendingUtility ? "UTILITY_PENDING" : "CURRENT_BILL",
    bill: mapped,
  });
}));

router.get("/billing/history", mobileTenantAuth, asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const bills = await Bill.find({ userId: req.mobileTenant._id, ...NON_DRAFT_FILTER })
    .sort(CURRENT_BILL_SORT)
    .limit(limit);
  const mapped = await mapMobileBillsWithBreakdowns(bills, req.mobileTenant._id);
  res.json(mapped);
}));

// Preserves the mobile app's existing bill-shaped (not ledger-shaped)
// contract for "paid history": same query as /history, filtered to bills
// whose canonical effective status is "paid" — see mobileBillingBridge.js.
router.get("/billing/history/paid", mobileTenantAuth, asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const bills = await Bill.find({ userId: req.mobileTenant._id, ...NON_DRAFT_FILTER })
    .sort(CURRENT_BILL_SORT)
    .limit(limit);
  const paidBills = bills.filter(isMobileEffectivelyPaid);
  const mapped = await mapMobileBillsWithBreakdowns(paidBills, req.mobileTenant._id);
  res.json(mapped);
}));

router.get("/billing/:billingId", mobileTenantAuth, asyncRoute(async (req, res) => {
  const { billingId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(billingId)) {
    return res.status(404).json({ detail: "Bill not found" });
  }
  const bill = await Bill.findOne({ _id: billingId, userId: req.mobileTenant._id, isArchived: false });
  if (!bill) return res.status(404).json({ detail: "Bill not found" });
  const mapped = await mapMobileBillWithBreakdowns(bill, req.mobileTenant._id);
  res.json(mapped);
}));

router.get("/billing/:billingId/breakdown/:utilityType", mobileTenantAuth, asyncRoute(async (req, res) => {
  const { billingId, utilityType } = req.params;
  if (!["electricity", "water"].includes(utilityType)) {
    return res.status(400).json({ detail: "Invalid utility type" });
  }
  if (!/^[0-9a-fA-F]{24}$/.test(billingId)) {
    return res.status(404).json({ detail: "Bill not found" });
  }
  const bill = await Bill.findOne({ _id: billingId, userId: req.mobileTenant._id, isArchived: false });
  if (!bill) return res.status(404).json({ detail: "Bill not found" });

  const dbUser = { _id: req.mobileTenant._id };
  const breakdown = await buildTenantUtilityBreakdown({ dbUser, bill, utilityType });
  if (!breakdown) {
    return res.status(404).json({ detail: `No ${utilityType} breakdown found for this bill` });
  }

  if (utilityType === "electricity") {
    return res.json({
      ...breakdown,
      electricity_breakdown: formatMobileElectricityBreakdown(breakdown),
    });
  }

  return res.json({
    ...breakdown,
    water_breakdown: formatMobileWaterBreakdown(breakdown),
  });
}));

router.get("/billing/:billingId/pdf", mobileTenantAuth, asyncRoute(async (req, res) => {
  const { billingId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(billingId)) {
    return res.status(404).json({ detail: "Bill not found" });
  }
  const bill = await Bill.findOne({ _id: billingId, userId: req.mobileTenant._id, isArchived: false })
    .populate("userId", "firstName lastName email")
    .populate("roomId", "name roomNumber branch");
  if (!bill) return res.status(404).json({ detail: "Bill not found" });

  let absolutePdfPath = bill.pdfPath ? path.resolve(SERVER_ROOT, bill.pdfPath) : null;
  if (
    !absolutePdfPath ||
    !isPathInsideBillingPdfRoot(absolutePdfPath) ||
    !fs.existsSync(absolutePdfPath) ||
    isBillPdfStale(bill)
  ) {
    const reservation = bill.reservationId
      ? await Reservation.findById(bill.reservationId)
          .populate("userId", "firstName lastName email")
          .populate("roomId", "name roomNumber branch type price monthlyPrice")
      : null;

    await generateRentBillPdf({
      bill,
      reservation: reservation || { userId: bill.userId, roomId: bill.roomId },
    });
    absolutePdfPath = path.resolve(SERVER_ROOT, bill.pdfPath);
  }

  if (!isPathInsideBillingPdfRoot(absolutePdfPath) || !fs.existsSync(absolutePdfPath)) {
    return res.status(404).json({ detail: "PDF not found" });
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.download(absolutePdfPath, `${formatBillReference(bill)}.pdf`);
}));

// Payment Receipt — a distinct document from the Billing Statement above.
// Only ever generated for a bill with confirmed payment evidence (the same
// isMobileEffectivelyPaid() check /history/paid uses); an unpaid/partially
// paid bill gets 404, never a fabricated receipt. Content is deliberately
// narrower than the statement — payment evidence only, no charges table,
// no TOTAL DUE, no payment instructions (see generateBillReceiptPdf).
router.get("/billing/:billingId/receipt", mobileTenantAuth, asyncRoute(async (req, res) => {
  const { billingId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(billingId)) {
    return res.status(404).json({ detail: "Bill not found" });
  }
  const bill = await Bill.findOne({ _id: billingId, userId: req.mobileTenant._id, isArchived: false })
    .populate("userId", "firstName lastName email");
  if (!bill) return res.status(404).json({ detail: "Bill not found" });

  if (!isMobileEffectivelyPaid(bill)) {
    return res.status(404).json({ detail: "No payment receipt is available for this bill yet." });
  }

  const billReference = formatBillReference(bill);
  const { absolutePath: absoluteReceiptPath } = await generateCanonicalBillReceiptPdf({
    bill,
    tenant: bill.userId,
    room: bill.roomId,
  });
  if (!isPathInsideBillingPdfRoot(absoluteReceiptPath) || !fs.existsSync(absoluteReceiptPath)) {
    return res.status(404).json({ detail: "Receipt not found" });
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.download(absoluteReceiptPath, `Payment-Receipt-${billReference}.pdf`);
}));

// Payment-proof submission: bridged to the SAME canonical workflow the web
// app uses. The web app has retired manual proof-of-payment for monthly
// bills in favor of PayMongo checkout (see paymentVerificationController.js
// submitPaymentProof, which now unconditionally returns 409) — so the
// canonical answer here is authoritative and identical: mobile is pointed
// at online checkout instead of being allowed to self-report a payment.
// This also closes the audit-flagged unvalidated-status-write route (the
// old PUT /:billingId with a raw client-supplied `status`), since this
// handler never mutates the bill at all.
router.post("/billing/:billingId/payment-proof", mobileTenantAuth, asyncRoute(async (req, res) => {
  const { billingId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(billingId)) {
    return res.status(404).json({ detail: "Bill not found" });
  }
  const bill = await Bill.findOne({ _id: billingId, userId: req.mobileTenant._id, isArchived: false });
  if (!bill) return res.status(404).json({ detail: "Bill not found" });

  return res.status(409).json({
    detail:
      "Manual payment-proof uploads are no longer supported for monthly bills. " +
      "Please pay online through the app's checkout instead.",
    code: "PAYMONGO_SETTLEMENT_REQUIRED",
    bill: toMobileBill(bill),
  });
}));

// The vendored mobile billing controller exposed:
//   POST /billing         (createBilling — writes an arbitrary bill into the
//                           legacy collection with no admin check, letting
//                           any authenticated tenant fabricate billing
//                           history for themselves)
//   PUT  /billing/:billingId (updateBilling — accepted a raw client-supplied
//                           `status` with no enum validation)
// Neither is called by the current mobile frontend (see audit's endpoint
// inventory). Both are intercepted here and explicitly rejected so they can
// no longer be reached through the vendored fallback for mobile traffic.
router.post("/billing", mobileTenantAuth, (req, res) => {
  res.status(403).json({ detail: "Not permitted from the mobile app." });
});
router.put("/billing/:billingId", mobileTenantAuth, (req, res) => {
  res.status(403).json({ detail: "Not permitted from the mobile app." });
});

export default router;
