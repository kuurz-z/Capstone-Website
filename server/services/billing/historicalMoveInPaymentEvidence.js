import { getCheckoutSession } from '../../config/paymongo.js';
import { readPaidPayments, readPaymentMethod } from '../../utils/paymongoPaymentMethod.js';

// A legacy check-in could replace a real checkout settlement with synthetic
// cash. Recover presentation evidence only; never reconcile or write history.
export async function readHistoricalMoveInPaymentEvidence(bill, tenantId, { getSession = getCheckoutSession } = {}) {
  if (bill.billType !== 'initial_payment' || bill.status !== 'paid' ||
      String(bill.userId) !== String(tenantId) ||
      !/^cs_[A-Za-z0-9]+$/.test(bill.paymongoSessionId || '')) return null;
  try {
    const session = await getSession(bill.paymongoSessionId, { signal: AbortSignal.timeout(5000) });
    const metadata = session?.attributes?.metadata;
    if (session?.id !== bill.paymongoSessionId || metadata?.purpose !== 'initial_payment' ||
        String(metadata.billId) !== String(bill._id) ||
        String(metadata.userId) !== String(tenantId) ||
        !bill.reservationId || String(metadata.reservationId) !== String(bill.reservationId)) return null;
    const payments = readPaidPayments(session);
    // Split/batch/refunded settlements need independent reconciliation; do not
    // attribute their total or channel to this one historical invoice.
    if (payments.length !== 1) return null;
    const payment = payments[0], attrs = payment.attributes;
    if (!/^pay_[A-Za-z0-9]+$/.test(payment.id || '') || attrs?.currency !== 'PHP' ||
        !(attrs.amount > 0) || attrs.amount !== Math.round(Number(bill.paidAmount) * 100) ||
        attrs.refunds?.length || !(attrs.paid_at > 0)) return null;
    const { rawPaymentType } = readPaymentMethod(session, payments);
    if (!rawPaymentType || rawPaymentType === 'online') return null;
    return {
      method: rawPaymentType,
      paymentReference: payment.id,
      processedAt: new Date(attrs.paid_at * 1000),
      evidenceSource: 'paymongo_checkout_transaction',
    };
  } catch {
    // Provider errors must not hide billing or invent a tender.
    return null;
  }
}
