import { getVisibleBillSnapshot, roundMoney } from "./billingPolicy.js";
import { applyBillPayment } from "./paymentLedger.js";

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
    return {
      applied: false,
      reason: "already_applied",
      bill,
      appliedAmount: 0,
    };
  }

  const normalizedSettledAmount = roundMoney(settledAmount);
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

  return {
    applied: true,
    reason: "settled",
    bill,
    appliedAmount: paymentResult.appliedAmount,
  };
}

export default {
  settlePaymongoBill,
};
