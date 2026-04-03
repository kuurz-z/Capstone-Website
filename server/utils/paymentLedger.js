import Payment from "../models/Payment.js";
import { getBillRemainingAmount, roundMoney, syncBillAmounts } from "./billingPolicy.js";

async function rollbackCreatedPayment(payment, paymentModel) {
  if (!payment) {
    return;
  }

  if (typeof payment.deleteOne === "function") {
    await payment.deleteOne();
    return;
  }

  if (typeof paymentModel?.deleteOne === "function" && payment?._id) {
    await paymentModel.deleteOne({ _id: payment._id });
  }
}

async function findPaymentByExternalId(paymentModel, externalPaymentId, session = null) {
  if (!externalPaymentId || typeof paymentModel?.findOne !== "function") {
    return null;
  }

  const query = paymentModel.findOne({ externalPaymentId });
  if (session && query && typeof query.session === "function") {
    query.session(session);
  }

  return query;
}

async function createPaymentRecord(paymentModel, payload, session = null) {
  if (session) {
    return paymentModel.create(payload, { session });
  }

  return paymentModel.create(payload);
}

async function finalizeBillPayment({
  bill,
  amount,
  method,
  source,
  actorId,
  referenceNumber,
  externalPaymentId,
  notes,
  metadata,
  paymentModel,
  now,
  session,
}) {
  syncBillAmounts(bill, { preserveStatus: true });
  const remainingBefore = getBillRemainingAmount(bill);
  if (remainingBefore <= 0) {
    throw new Error("Bill has no remaining balance.");
  }

  const appliedAmount = Math.min(remainingBefore, amount);
  if (appliedAmount <= 0) {
    throw new Error("Bill has no remaining balance.");
  }

  const payment = await createPaymentRecord(
    paymentModel,
    {
      tenantId: bill.userId,
      billId: bill._id,
      branch: bill.branch,
      amount: appliedAmount,
      method,
      referenceNumber,
      status: "approved",
      verifiedBy: actorId,
      verifiedAt: actorId ? now : null,
      source,
      externalPaymentId,
      processedAt: now,
      notes,
      metadata,
    },
    session,
  );

  try {
    bill.paidAmount = roundMoney((bill.paidAmount || 0) + appliedAmount);
    syncBillAmounts(bill);
    bill.paymentMethod = method;
    bill.paymentDate = bill.paidAmount > 0 ? now : null;
    if (session && typeof bill.save === "function") {
      await bill.save({ session });
    } else {
      await bill.save();
    }
  } catch (error) {
    if (!session) {
      await rollbackCreatedPayment(payment, paymentModel);
    }
    throw error;
  }

  return { bill, payment, appliedAmount };
}

export async function applyBillPayment({
  bill,
  amount,
  method,
  source,
  actorId = null,
  referenceNumber = null,
  externalPaymentId = null,
  notes = "",
  metadata = {},
  paymentModel = Payment,
  now = new Date(),
  session = null,
}) {
  const numericAmount = roundMoney(amount);
  if (numericAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const resolvedSession = session || bill?.$session?.() || null;
  const existingPayment = await findPaymentByExternalId(paymentModel, externalPaymentId, resolvedSession);
  if (existingPayment) {
    return { bill, payment: existingPayment, appliedAmount: 0, reused: true };
  }

  if (resolvedSession && typeof resolvedSession.withTransaction === "function") {
    return resolvedSession.withTransaction(async () =>
      finalizeBillPayment({
        bill,
        amount: numericAmount,
        method,
        source,
        actorId,
        referenceNumber,
        externalPaymentId,
        notes,
        metadata,
        paymentModel,
        now,
        session: resolvedSession,
      }),
    );
  }

  return finalizeBillPayment({
    bill,
    amount: numericAmount,
    method,
    source,
    actorId,
    referenceNumber,
    externalPaymentId,
    notes,
    metadata,
    paymentModel,
    now,
    session: null,
  });
}
