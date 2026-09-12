import Payment from '../../models/Payment.js';
import { readHistoricalMoveInPaymentEvidence } from './historicalMoveInPaymentEvidence.js';

// Read-only projection: never repair historical invoices or infer a method
// from a PayMongo reference. The successful ledger transaction owns method.
export async function loadMobilePaymentEvidence(bills, tenantId, options = {}) {
  const payments = await Payment.find({
    tenantId, billId: { $in: bills.map((bill) => bill._id) },
    status: { $in: ['paid', 'confirmed', 'approved'] }, amount: { $gt: 0 },
  }).sort({ processedAt: -1, createdAt: -1 }).lean();
  const settledAt = (payment) => new Date(payment.processedAt || payment.settlementTimestamp || payment.verifiedAt || payment.createdAt || 0).getTime() || 0;
  payments.sort((left, right) => settledAt(right) - settledAt(left));
  const byBill = new Map();
  const syntheticBills = new Set();
  for (const payment of payments) {
    // Old check-in auto-settlements supplied cash even without a method.
    // Such synthetic records are not evidence of the tender used.
    if (payment.metadata?.reason === 'Settled upon move-in check-in'
        && !payment.metadata?.methodExplicitlyRecorded) {
      syntheticBills.add(String(payment.billId));
      continue;
    }
    const key = String(payment.billId);
    if (!byBill.has(key)) byBill.set(key, payment);
  }
  await Promise.all(bills.filter((bill) => syntheticBills.has(String(bill._id)) && !byBill.has(String(bill._id))).map(async (bill) => {
    const evidence = await readHistoricalMoveInPaymentEvidence(bill, tenantId, options);
    if (evidence) byBill.set(String(bill._id), evidence);
  }));
  return byBill;
}
