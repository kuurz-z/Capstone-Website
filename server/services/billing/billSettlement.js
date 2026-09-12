/**
 * ============================================================================
 * BILL SETTLEMENT SERVICE
 * ============================================================================
 *
 * Automated payment settlement processors (PayMongo webhook, online gateways).
 */

import { getVisibleBillSnapshot, roundMoney } from "./billingPolicy.js";
import { applyBillPayment } from "./paymentLedger.js";
import {
  syncStructuredReservationAfterBillSettlement,
  quarantineStructuredSettlementMismatch,
} from "../structuredInitialPaymentService.js";
import { STRUCTURED_INITIAL_PAYMENT_WORKFLOW } from "../../config/structuredInitialPayment.js";
import { Bill, Reservation } from "../../models/index.js";

export async function settlePaymongoBill({
  bill,
  paymentReference,
  settledAmount = null,
  paymentMethod = "paymongo",
  source = "paymongo-webhook",
  metadata = {},
  now = new Date(),
} = {}) {
  const visible = getVisibleBillSnapshot(bill, now);

  if (
    bill?.paymongoPaymentId === paymentReference ||
    visible.status === "paid"
  ) {
    // A retry must also heal Reservation state when the Bill write succeeded
    // but the post-settlement projection update was interrupted.
    await syncStructuredReservationAfterBillSettlement(bill);
    return {
      applied: false,
      reason: "already_applied",
      bill,
      appliedAmount: 0,
    };
  }

  const normalizedSettledAmount = roundMoney(settledAmount);
  const isStructuredInitialPayment =
    bill?.billType === "initial_payment" &&
    bill?.structuredWorkflowVersion === STRUCTURED_INITIAL_PAYMENT_WORKFLOW;
  const currency = String(metadata?.currency || "PHP").toUpperCase();
  if (isStructuredInitialPayment && currency !== "PHP") {
    await quarantineStructuredSettlementMismatch({
      bill,
      paymentReference,
      settledAmount: normalizedSettledAmount,
      currency,
      source,
      metadata,
      reason: "currency_mismatch",
      now,
    });
    return {
      applied: false,
      reason: "currency_mismatch_reconciliation_required",
      bill,
      appliedAmount: 0,
    };
  }
  if (
    isStructuredInitialPayment &&
    normalizedSettledAmount !== visible.remainingAmount
  ) {
    await quarantineStructuredSettlementMismatch({
      bill,
      paymentReference,
      settledAmount: normalizedSettledAmount,
      currency,
      source,
      metadata,
      reason: "amount_mismatch",
      now,
    });
    return {
      applied: false,
      reason: "amount_mismatch_reconciliation_required",
      bill,
      appliedAmount: 0,
    };
  }
  const appliedAmount =
    normalizedSettledAmount > 0
      ? roundMoney(Math.min(visible.remainingAmount, normalizedSettledAmount))
      : visible.remainingAmount;

  if (appliedAmount <= 0) {
    return {
      applied: false,
      reason: "no_balance_due",
      bill,
      appliedAmount: 0,
    };
  }

  const paymentResult = await applyBillPayment({
    bill,
    amount: appliedAmount,
    method: paymentMethod,
    source,
    referenceNumber: paymentReference,
    externalPaymentId: paymentReference,
    metadata: {
      ...metadata,
      provider: "paymongo",
    },
    now,
  });

  if (paymentResult?.reused) {
    return {
      applied: false,
      reason: "already_applied",
      bill,
      appliedAmount: 0,
    };
  }

  bill.paymongoPaymentId = paymentReference;
  bill.paymentProof = {
    verificationStatus: "approved",
    verifiedAt: now,
    submittedAmount: paymentResult.appliedAmount,
  };
  await bill.save();
  await syncStructuredReservationAfterBillSettlement(bill);

  return {
    applied: true,
    reason: "settled",
    bill,
    appliedAmount: paymentResult.appliedAmount,
    payment: paymentResult.payment,
  };
}

export async function settleInitialMoveInOnCheckIn({
  reservation,
  actorId = "system",
  paymentMethod = null,
  now = new Date(),
} = {}) {
  if (!reservation) return { settled: false, reason: "no_reservation" };
  const resDoc = reservation._id ? reservation : await Reservation.findById(reservation);
  if (!resDoc) return { settled: false, reason: "reservation_not_found" };

  let bill = null;
  if (resDoc.initialPaymentBillId) {
    bill = await Bill.findById(resDoc.initialPaymentBillId);
  }
  if (!bill) {
    bill = await Bill.findOne({
      reservationId: resDoc._id,
      billType: "initial_payment",
      isArchived: { $ne: true },
    });
  }

  if (!bill) return { settled: false, reason: "no_initial_bill" };
  if (bill.status === "paid" && Number(bill.remainingAmount) === 0) {
    return { settled: false, reason: "already_paid", bill };
  }

  if (!String(paymentMethod || '').trim()) {
    return { settled: false, reason: 'explicit_payment_method_required', bill };
  }

  const amountToSettle = Number(bill.remainingAmount || bill.totalAmount || 0);
  const rawMethod = String(paymentMethod || "").trim().toLowerCase();
  const normalizedMethod =
    rawMethod === "cash" || !rawMethod ? "offline_cash" : paymentMethod;

  const paymentResult = await applyBillPayment({
    bill,
    amount: amountToSettle,
    method: normalizedMethod,
    source: "admin-manual",
    referenceNumber: `MOVEIN-${resDoc._id.toString().slice(-6).toUpperCase()}`,
    recordedBy: actorId,
    metadata: {
      reservationId: String(resDoc._id),
      reason: "Settled upon move-in check-in",
      methodExplicitlyRecorded: true,
    },
    now,
  });

  resDoc.initialPaymentStatus = "paid";
  resDoc.paymentStatus = "paid_in_full";
  resDoc.isMoveInSettled = true;
  resDoc.initialPaymentSettledAt = now;
  if (typeof resDoc.save === "function") {
    await resDoc.save({ validateModifiedOnly: true });
  }

  await syncStructuredReservationAfterBillSettlement(bill);

  return {
    settled: true,
    bill,
    payment: paymentResult?.payment,
  };
}

export default {
  settlePaymongoBill,
  settleInitialMoveInOnCheckIn,
};
