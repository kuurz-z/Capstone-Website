/**
 * ============================================================================
 * MOBILE BILLING BRIDGE
 * ============================================================================
 *
 * Pure mapping functions between the canonical Bill model / billingPolicy
 * engine and the mobile app's existing (legacy-mobile-backend-shaped) JSON
 * contract, so mobile screens keep working unmodified while the data
 * underneath is the authoritative canonical Bill — the same pattern already
 * used by routes/mobileContractRoutes.js.
 *
 * This module must NEVER write to the database and must NEVER derive its
 * output from anything client-supplied — only from a resolved canonical
 * Bill document (plus the shared billingPolicy snapshot for that bill).
 */

import { getVisibleBillSnapshot, getUtilityDispatchEntry } from "../utils/billingPolicy.js";
import { formatManilaDate } from "../utils/dateUtils.js";
import { PAYMENT_METHOD_LABELS } from "../utils/paymongoPaymentMethod.js";
import { BILL_STATEMENT_TEMPLATE_VERSION } from "./billingStatementTemplate.js";
import { BILL_RECEIPT_TEMPLATE_VERSION } from "./billingReceiptTemplate.js";

// "Which bill is the tenant's current bill" selection rule (NON_DRAFT_BILL_
// FILTER / CURRENT_BILL_SORT / selectCurrentBillFromList) lives in
// services/billing/currentBillResolver.js — the canonical, consumer-neutral
// module every bill-selecting query (web, mobile Billing tab, mobile
// dashboard) imports directly. It intentionally does NOT live here: this
// bridge is mobile-specific field mapping, and the selection rule must have
// no web/mobile ownership so it can never re-diverge per consumer.

/**
 * Mobile-facing effective status vocabulary. This is the ONLY status
 * vocabulary the mobile app is shown — never the raw canonical Bill.status
 * enum, and never the mobile-only legacy vocabulary either.
 */
export const MOBILE_BILL_STATUSES = Object.freeze([
  "unpaid",
  "pending_verification",
  "partially_paid",
  "rejected",
  "paid",
  "cancelled",
]);

const MOBILE_STATUS_LABELS = Object.freeze({
  unpaid: "Unpaid",
  pending_verification: "Pending Verification",
  partially_paid: "Partially Paid",
  rejected: "Rejected",
  paid: "Paid",
  cancelled: "Cancelled",
});

/**
 * Derive the mobile-facing effective status purely from canonical evidence.
 *
 * Precedence (strongest evidence wins — never let a stale/derived field
 * override stronger payment evidence, and never let an in-flight
 * verification flag claim "paid" before the balance is actually zero):
 *   1. status === "voided"                        -> cancelled
 *   2. remainingAmount <= 0 (or status === "waived") -> paid
 *   3. paymentProof pending-verification            -> pending_verification
 *   4. paymentProof rejected                        -> rejected
 *   5. paidAmount > 0                               -> partially_paid
 *   6. otherwise                                    -> unpaid
 *
 * `status === "adjusted"` is a modifier, not a lifecycle terminus, so it
 * intentionally falls through to the payment-evidence rules above.
 * `status === "draft"` bills must never reach this function — callers are
 * expected to filter drafts out before mapping (mirrors every canonical
 * tenant-facing billing query, e.g. billingQueryController.js).
 *
 * @param {{status: string, remainingAmount: number, paidAmount: number, paymentProof?: {verificationStatus?: string}}} evidence
 * @returns {string} one of MOBILE_BILL_STATUSES
 */
export function resolveMobileBillStatus(evidence = {}) {
  const status = String(evidence.status || "").toLowerCase();
  const remainingAmount = Number(evidence.remainingAmount || 0);
  const paidAmount = Number(evidence.paidAmount || 0);
  const proofStatus = String(evidence.paymentProof?.verificationStatus || "none");

  if (status === "voided") return "cancelled";
  if (remainingAmount <= 0) return "paid";
  if (status === "waived") return "paid";
  if (proofStatus === "pending-verification") return "pending_verification";
  if (proofStatus === "rejected") return "rejected";
  if (paidAmount > 0) return "partially_paid";
  return "unpaid";
}

export function mobileBillStatusLabel(mobileStatus) {
  return MOBILE_STATUS_LABELS[mobileStatus] || "Unpaid";
}

/**
 * Map a raw canonical payment-method enum value (Bill.paymentMethod, see
 * config/paymentMethods.js PAYMENT_METHODS) to a human-readable mobile
 * label. Never returns the literal string "PayMongo" as a channel name —
 * "paymongo" is a settlement rail, not a tenant-facing payment method, so it
 * maps to a neutral, accurate "Online Payment (PayMongo)" label instead.
 * Returns null (not a guess) when there is no reliable evidence at all.
 *
 * @param {string|null|undefined} rawMethod
 * @returns {string|null}
 */
export function toMobilePaymentMethodLabel(rawMethod) {
  const key = String(rawMethod || "").trim().toLowerCase();
  if (!key) return null;

  const extraLabels = {
    bank: "Bank Transfer",
    check: "Check",
    offline_cash: "Cash (Branch)",
    offline_bank_transfer: "Bank Transfer (Branch)",
    online: "Online Payment (PayMongo)",
    paymongo: "Online Payment (PayMongo)",
  };

  return PAYMENT_METHOD_LABELS[key] || extraLabels[key] || null;
}

/**
 * Map a bill's per-utility dispatch state (billingPolicy.js
 * getUtilityDispatchEntry — the SAME authoritative "is this utility charge
 * actually released to the tenant yet" signal the canonical web app already
 * uses via isUtilityChargeVisible/getVisibleBillCharges) into the
 * { billReleaseDate, finalDueDate, meterReadingDate } shape the mobile
 * frontend's billingStatus.js already expects.
 *
 * Only includes a utility once its dispatch state is genuinely "sent" — a
 * still-draft utility charge correctly produces no entry here, which is
 * what makes the mobile "Your utility bill has not been released yet."
 * copy accurate instead of a permanent false contradiction against a
 * bill that already shows "Paid" (the bug this bridge exists to prevent).
 *
 * billReleaseDate deliberately uses the bill-level bill.releasedAt (the
 * authoritative release lifecycle — see models/Bill.js and
 * services/billing/billingPolicy.js syncBillAmounts()), the SAME value used
 * for top-level release_date below, not the per-utility entry.issuedAt/
 * publishedAt. A bill is released once, as one document — electricity and
 * water intentionally share this one release timestamp, while their
 * finalDueDate/meterReadingDate stay independent per-utility values. Never
 * falls back to billingCycleStart, createdAt, or any meter-reading/period
 * date — a utility with no genuine release evidence shows "—", not a guess.
 *
 * @param {Object} bill - canonical Bill (Mongoose document or plain object)
 * @param {{electricity: number, water: number}} charges - visible charges
 * @returns {Object} keyed by utility type, only for genuinely-dispatched charges
 */
function mobileUtilityDeadlines(bill, charges = {}) {
  const deadlines = {};
  for (const utilityType of ["electricity", "water"]) {
    if (Number(charges[utilityType] || 0) <= 0) continue;
    const entry = getUtilityDispatchEntry(bill, utilityType);
    if (entry.state !== "sent") continue;
    deadlines[utilityType] = {
      billReleaseDate: bill.releasedAt || null,
      finalDueDate: entry.dueDate || null,
      meterReadingDate: entry.publishedAt || null,
    };
  }
  return deadlines;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toManilaDateKeyOrLabel(value, fallback = "") {
  if (!value) return fallback;
  return formatManilaDate(value) || fallback;
}

/**
 * Explicit mobile schedule state derived only from canonical persisted data.
 * A utility card therefore always has dates or an honest pending/unavailable
 * state; the client never invents billing dates.
 */
export function buildMobileUtilitySchedule(bill, utilityType, charge, breakdown = null) {
  const amount = Number(charge || 0);
  const rawAmount = Number(bill?.charges?.[utilityType] || 0);
  const dispatch = getUtilityDispatchEntry(bill, utilityType);
  const periodStart = breakdown?.period?.startDate || bill?.utilityCycleStart || null;
  const periodEnd = breakdown?.period?.endDate || bill?.utilityCycleEnd || null;
  const readingDate = bill?.utilityReadingDate || dispatch.publishedAt || null;
  const dueDate = dispatch.dueDate || bill?.dueDate || null;
  const releaseDate = bill?.releasedAt || null;

  if (amount <= 0 && rawAmount <= 0) {
    return { state: "not_applicable", amount: 0, source: "canonical_bill" };
  }
  if (dispatch.state !== "sent" || amount <= 0) {
    return {
      state: "pending",
      amount,
      period_start: toIsoOrNull(periodStart),
      period_end: toIsoOrNull(periodEnd),
      reading_date: toIsoOrNull(readingDate),
      release_date: toIsoOrNull(releaseDate),
      due_date: toIsoOrNull(dueDate),
      source: breakdown ? "canonical_utility_period" : "canonical_bill",
    };
  }
  const state = periodStart && periodEnd && dueDate ? "available" : "unavailable";
  return {
    state,
    amount,
    period_start: toIsoOrNull(periodStart),
    period_end: toIsoOrNull(periodEnd),
    reading_date: toIsoOrNull(readingDate),
    release_date: toIsoOrNull(releaseDate),
    due_date: toIsoOrNull(dueDate),
    source: breakdown ? "canonical_utility_period" : "canonical_bill",
  };
}

/**
 * Format canonical electricity breakdown (buildTenantUtilityBreakdown) into
 * the mobile app's legacy-compatible segment array structure.
 *
 * @param {Object|null} breakdown
 * @returns {Array<Object>|null}
 */
export function formatMobileElectricityBreakdown(breakdown) {
  if (!breakdown || !Array.isArray(breakdown.segments) || breakdown.segments.length === 0) {
    return null;
  }

  const rate = Number(breakdown.ratePerKwh || 16);
  return breakdown.segments.map((seg, idx) => {
    const occupants = Number(seg.activeTenantCount || 1);
    const readingFrom = Number(seg.readingFrom ?? 0);
    const readingTo = Number(seg.readingTo ?? 0);
    const consumption = Number(seg.segmentTotalKwh ?? (readingTo - readingFrom) ?? 0);
    const shareCost = Number(seg.sharePerTenantCost ?? 0);
    const shareKwh = Number(seg.sharePerTenantKwh ?? 0);
    const segmentTotal = Number(seg.segmentTotalCost ?? (shareCost * occupants) ?? (consumption * rate));

    const startDateStr = toManilaDateKeyOrLabel(seg.startDate, seg.periodLabel || "");
    const endDateStr = toManilaDateKeyOrLabel(seg.endDate, seg.periodLabel || "");

    return {
      segment_index: idx + 1,
      period_label: seg.periodLabel || `Segment ${idx + 1}`,
      occupants,
      active_tenants: occupants,
      reading_date_from: startDateStr,
      reading_date_to: endDateStr,
      period_start: startDateStr,
      period_end: endDateStr,
      reading_from: readingFrom,
      reading_to: readingTo,
      consumption: +consumption.toFixed(2),
      rate,
      segment_total: +segmentTotal.toFixed(2),
      share_per_tenant: +shareCost.toFixed(2),
      share_per_tenant_kwh: +shareKwh.toFixed(2),
    };
  });
}

/**
 * Format canonical water breakdown (buildTenantUtilityBreakdown) into
 * the mobile app's legacy-compatible water_breakdown structure.
 *
 * @param {Object|null} breakdown
 * @returns {Object|null}
 */
export function formatMobileWaterBreakdown(breakdown) {
  if (!breakdown?.record) return null;
  const rec=breakdown.record;
  const measured=breakdown.calculationVersion === 'water-meter-v1';
  return {...breakdown,
    period_start:toIsoOrNull(rec.cycleStart),period_end:toIsoOrNull(rec.cycleEnd),reading_date:toIsoOrNull(rec.cycleEnd),
    reading_from:measured?rec.readingFrom:null,reading_to:measured?rec.readingTo:null,
    consumption:measured?rec.usage:null,rate:measured?rec.ratePerUnit:null,
    total:rec.roomTotal ?? null,my_share:breakdown.tenantAmount ?? rec.myShare ?? null,
    sharing_policy:breakdown.billingBasis || 'Historical water allocation; physical consumption is unknown',
    tenants_sharing:rec.tenantsSharing ?? null,
  };
}

/**
 * Map a canonical Bill (Mongoose document or .lean() object) to the flat,
 * legacy-mobile-shaped JSON the current mobile frontend already expects
 * (see server/mobile/controllers/billing.controller.js `mapRealBill()`,
 * which this intentionally mirrors field-for-field so no mobile screen
 * needs to change). The ONLY difference from the legacy mapper is that
 * `status` here is the explicit mobile effective-status vocabulary
 * (MOBILE_BILL_STATUSES) derived from canonical evidence, never a raw
 * canonical or legacy status string, and `payment_method` is a
 * human-readable label rather than a raw enum/settlement-rail value.
 *
 * @param {import("mongoose").Document|Object} bill - canonical Bill
 * @param {{electricityBreakdown?: Object|null, waterBreakdown?: Object|null}} [options]
 * @returns {Object} mobile-shaped bill JSON
 */
export function toMobileBill(bill, { electricityBreakdown = null, waterBreakdown = null } = {}) {
  const visible = getVisibleBillSnapshot(bill);
  const mobileStatus = resolveMobileBillStatus({
    status: bill.status,
    remainingAmount: visible.remainingAmount,
    paidAmount: bill.paidAmount || 0,
    paymentProof: bill.paymentProof,
  });

  let billingPeriod = bill.billingMonth || "";
  try {
    billingPeriod = billingPeriod
      ? new Date(billingPeriod).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "";
  } catch {
    billingPeriod = "";
  }

  const charges = visible.charges || {};
  const formattedElectricityBreakdown = formatMobileElectricityBreakdown(electricityBreakdown);
  const formattedWaterBreakdown = formatMobileWaterBreakdown(waterBreakdown);
  const sourceRevision = String(
    (bill.updatedAt || bill.createdAt || new Date()).getTime?.()
    ?? new Date(bill.updatedAt || bill.createdAt || Date.now()).getTime(),
  );

  return {
    billing_id: String(bill._id),
    description: billingPeriod ? `${billingPeriod} Billing Statement` : "Billing Statement",
    billing_period: billingPeriod,
    billing_type: "consolidated",
    due_date: visible.dueDate,
    // The authoritative bill-release lifecycle timestamp (models/Bill.js
    // releasedAt, written once by syncBillAmounts() — see billingPolicy.js).
    // Deliberately NEVER falls back to bill.billingCycleStart (a billing-
    // PERIOD boundary, not a release event) or visible.issuedAt (a
    // per-charge "current issue date" that can legitimately move forward
    // as new utility charges publish, and is used for due-date math, not
    // for "when was this bill first shown to the tenant"). A bill with no
    // trustworthy release evidence yet correctly reports null here, which
    // the mobile frontend renders as "—" rather than a fabricated date.
    release_date: bill.releasedAt || null,
    status: mobileStatus,
    status_label: mobileBillStatusLabel(mobileStatus),
    rent: charges.rent || 0,
    electricity: charges.electricity || 0,
    water: charges.water || 0,
    // Security-deposit component — non-zero only on a transfer_settlement
    // Bill (the additional deposit due because a room transfer raised the
    // required deposit). Its own line so the mobile app never shows it as
    // rent; already included in `total`/`gross_amount` via sumBillCharges.
    security_deposit: charges.securityDeposit || 0,
    penalties: (charges.penalty || 0) + (charges.applianceFees || 0) + (charges.corkageFees || 0),
    amount: visible.totalAmount,
    total: visible.totalAmount,
    gross_amount: visible.grossAmount,
    remaining_amount: visible.remainingAmount,
    paid_amount: bill.paidAmount || 0,
    payment_method: toMobilePaymentMethodLabel(bill.paymentMethod),
    payment_date: bill.paymentDate || null,
    paymongo_reference: bill.paymongoPaymentId || null,
    additional_charges: bill.additionalCharges || [],
    payment_proof_status: bill.paymentProof?.verificationStatus || "none",
    created_at: bill.createdAt || null,
    // Cache-busting version for the mobile app's on-device statement/receipt
    // PDF cache (see frontend/app/bill-details.jsx and billing-history.jsx,
    // which key the cached file as `${billId}_v${statement_version}`). Any
    // server-side change to this bill (e.g. a utility charge posting,
    // payment recorded, status transition) advances bill.updatedAt via
    // Mongoose timestamps, while the template suffix advances independently
    // when statement presentation changes. Either change forces the app to
    // refetch instead of serving a stale cached PDF. Falls back to createdAt
    // so a never-updated bill still has a stable, present version string.
    statement_version: `${sourceRevision}-i${Number(bill.invoiceVersion || 1)}-t${BILL_STATEMENT_TEMPLATE_VERSION}`,
    receipt_version: `${bill.receiptSourceVersion || sourceRevision}-i${Number(bill.invoiceVersion || 1)}-t${BILL_RECEIPT_TEMPLATE_VERSION}`,
    utility_deadlines: mobileUtilityDeadlines(bill, charges),
    utility_schedules: {
      electricity: buildMobileUtilitySchedule(bill, "electricity", charges.electricity, electricityBreakdown),
      water: buildMobileUtilitySchedule(bill, "water", charges.water, waterBreakdown),
    },
    electricity_breakdown: formattedElectricityBreakdown,
    water_breakdown: formattedWaterBreakdown,
    utility_breakdowns: {
      electricity: electricityBreakdown || null,
      water: waterBreakdown || null,
    },
  };
}

/**
 * True when the canonical Bill's mobile effective status is "paid" —
 * used to build the mobile "paid history" list (GET /billing/history/paid)
 * by filtering the same canonical Bill collection used for regular history,
 * preserving the mobile app's existing bill-shaped (not ledger-shaped)
 * response contract for that endpoint.
 */
export function isMobileEffectivelyPaid(bill) {
  const visible = getVisibleBillSnapshot(bill);
  return resolveMobileBillStatus({
    status: bill.status,
    remainingAmount: visible.remainingAmount,
    paidAmount: bill.paidAmount || 0,
    paymentProof: bill.paymentProof,
  }) === "paid";
}
