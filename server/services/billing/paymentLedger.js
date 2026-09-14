/**
 * ============================================================================
 * PAYMENT LEDGER SERVICE
 * ============================================================================
 *
 * Transaction-safe ledger operations for applying payments to bills.
 */

import Payment from "../../models/Payment.js";
import { Reservation } from "../../models/index.js";
import { getBillRemainingAmount, roundMoney, syncBillAmounts } from "./billingPolicy.js";
import {
  generatePaymentReference,
  isRawPaymentGatewayId,
} from "../../utils/referenceGenerator.js";

/**
 * Fund reservation.securityDepositHeld from a transfer_settlement Bill whose
 * charges.securityDeposit is being settled. Idempotent + partial-payment
 * aware: the held amount is DERIVED from the Bill's cumulative paid state,
 * not incremented, so a duplicate webhook / retry converges to the same
 * value and never double-funds.
 *
 * Allocation order on a partially-paid Bill: RENT (and any electricity)
 * first, then SECURITY DEPOSIT — so the deposit is only considered funded
 * once the rent/utility portion is covered.
 */
async function reconcileTransferDepositHeld({ bill, paymentId, session, now }) {
  const depositComponent = roundMoney(Number(bill?.charges?.securityDeposit || 0));
  if (bill?.billType !== "transfer_settlement" || depositComponent <= 0) return;
  if (!bill?.reservationId) return;

  const reservation = await Reservation.findById(bill.reservationId).session(session || null);
  if (!reservation) return;

  const nonDepositComponent = roundMoney(
    Number(bill.charges?.rent || 0) +
      Number(bill.charges?.electricity || 0) +
      Number(bill.charges?.water || 0) +
      Number(bill.charges?.applianceFees || 0) +
      Number(bill.charges?.corkageFees || 0) +
      Number(bill.charges?.penalty || 0) -
      Number(bill.charges?.discount || 0),
  );
  const paidSoFar = roundMoney(Number(bill.paidAmount || 0));
  // How much of what's been paid is attributable to the deposit component.
  const depositFunded = roundMoney(
    Math.max(0, Math.min(depositComponent, paidSoFar - nonDepositComponent)),
  );
  if (depositFunded <= 0) return;

  // Idempotency: a ledger entry keyed to this Bill already recorded the
  // deposit settlement for the same (or greater) funded amount -> no-op.
  const key = `room_transfer_deposit_settlement:${String(bill._id)}`;
  reservation.securityDepositLedger = reservation.securityDepositLedger || [];
  const existing = reservation.securityDepositLedger.find((e) => e.idempotencyKey === key);

  // Baseline held = whatever was held BEFORE this Bill's deposit settlement.
  // Prefer the first settlement entry, then the canonical field. For a legacy
  // null, use the verified baseline frozen on the Room Transfer Bill instead
  // of treating UNKNOWN as zero or backfilling it merely to prepare payment.
  const canonicalHeld = reservation.securityDepositHeld;
  const canonicalHeldKnown =
    canonicalHeld !== null &&
    canonicalHeld !== undefined &&
    canonicalHeld !== "" &&
    Number.isFinite(Number(canonicalHeld)) &&
    Number(canonicalHeld) >= 0;
  const snapshotHeld = Number(bill?.transferSnapshot?.depositPreviouslyHeld);
  const heldBefore = existing
    ? roundMoney(Number(existing.previousHeld ?? reservation.securityDepositHeld ?? 0))
    : roundMoney(
        canonicalHeldKnown
          ? Number(canonicalHeld)
          : Number.isFinite(snapshotHeld) && snapshotHeld >= 0
            ? snapshotHeld
            : 0,
      );
  const resultingHeld = roundMoney(heldBefore + depositFunded);

  if (existing) {
    if (roundMoney(Number(existing.adjustmentAmount || 0)) >= depositFunded) return; // already at/above
    existing.adjustmentAmount = depositFunded;
    existing.resultingHeld = resultingHeld;
    existing.paymentId = paymentId || existing.paymentId || null;
    existing.createdAt = now || new Date();
    existing.reason = `Deposit component of transfer settlement Bill funded (₱${depositFunded.toFixed(2)}).`;
  } else {
    reservation.securityDepositLedger.push({
      kind: "transfer_deposit_settlement",
      previousHeld: heldBefore,
      adjustmentAmount: depositFunded,
      resultingHeld,
      sourceRef: { kind: "bill", id: bill._id },
      transferReference: bill.transferSnapshot?.transferReference || null,
      billId: bill._id,
      paymentId: paymentId || null,
      idempotencyKey: key,
      reason: `Deposit component of transfer settlement Bill funded (₱${depositFunded.toFixed(2)}).`,
    });
  }
  reservation.securityDepositHeld = resultingHeld;

  if (session && typeof reservation.save === "function") {
    await reservation.save({ session });
  } else {
    await reservation.save();
  }
}

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
  recordedBy,
  referenceNumber,
  externalPaymentId,
  notes,
  metadata,
  proofImageUrl,
  paymentModel,
  now,
  session,
}) {
  syncBillAmounts(bill, { preserveStatus: true });
  const remainingBefore = getBillRemainingAmount(bill);
  if (remainingBefore <= 0) {
    throw new Error("Bill has no remaining balance.");
  }

  // Phase 4: Reject overpayments — excess payment must not silently disappear.
  // 1-cent tolerance handles floating-point drift at the peso/cent boundary.
  if (amount > remainingBefore + 0.01) {
    throw new Error(
      `OVERPAYMENT_REJECTED: Payment amount (₱${amount.toFixed(2)}) exceeds remaining balance (₱${remainingBefore.toFixed(2)}). Reduce the payment amount or settle the exact balance.`,
    );
  }

  const appliedAmount = Math.min(remainingBefore, amount);
  if (appliedAmount <= 0) {
    throw new Error("Bill has no remaining balance.");
  }

  const rawExternalPaymentId =
    externalPaymentId || (isRawPaymentGatewayId(referenceNumber) ? referenceNumber : null);
  const cleanReferenceNumber =
    referenceNumber && !isRawPaymentGatewayId(referenceNumber)
      ? referenceNumber
      : generatePaymentReference({ prefix: "PAY", date: now });

  const payment = await createPaymentRecord(
    paymentModel,
    {
      tenantId: bill.userId,
      billId: bill._id,
      branch: bill.branch,
      amount: appliedAmount,
      method,
      purpose:
        bill.billType === "initial_payment"
          ? "initial_payment"
          : Number(bill?.charges?.rent || 0) > 0
            ? "regular_rent"
            : "other",
      provider: String(source || "").startsWith("paymongo") ? "paymongo" : null,
      providerPaymentId: String(source || "").startsWith("paymongo")
        ? rawExternalPaymentId
        : null,
      externalSessionId: metadata?.sessionId || null,
      webhookEventReference: metadata?.eventId || null,
      settlementTimestamp: String(source || "").startsWith("paymongo") ? now : null,
      currency: String(metadata?.currency || "PHP").toUpperCase(),
      referenceNumber: cleanReferenceNumber,
      paymentReference: cleanReferenceNumber,
      status: "paid",
      verifiedBy: actorId,
      verifiedAt: actorId ? now : null,
      source,
      externalPaymentId: rawExternalPaymentId,
      processedAt: now,
      notes,
      metadata,
      proofImageUrl,
      // Plan 3 (D5): Audit ledger snapshot — before/after balance + who recorded it
      balanceBefore: remainingBefore,
      balanceAfter: Math.max(0, roundMoney(remainingBefore - appliedAmount)),
      recordedBy: recordedBy || (actorId ? String(actorId) : "system"),
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
    // Fund the tenant's held security deposit from the deposit component of
    // a transfer_settlement Bill — only on confirmed payment, idempotent,
    // partial-payment aware. Participates in the caller's transaction.
    await reconcileTransferDepositHeld({
      bill,
      paymentId: payment?._id || null,
      session,
      now,
    });
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
  recordedBy = null,
  referenceNumber = null,
  externalPaymentId = null,
  notes = "",
  metadata = {},
  proofImageUrl = null,
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
        recordedBy,
        referenceNumber,
        externalPaymentId,
        notes,
        metadata,
        proofImageUrl,
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
    recordedBy,
    referenceNumber,
    externalPaymentId,
    notes,
    metadata,
    proofImageUrl,
    paymentModel,
    now,
    session: null,
  });
}
