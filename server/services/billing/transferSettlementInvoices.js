import { Bill } from '../../models/index.js';
import { roundMoney } from './billingPolicy.js';

// Transfer electricity is finalized at completion. Publish that component on
// the same invoice so normal Web/mobile checkout cannot hide it as a draft
// monthly utility charge while waiting for the room's period to close.
export function transferElectricityDispatch(amount, periodId, issuedAt = new Date()) {
  return { electricity: { state: 'sent', amount: roundMoney(amount), periodId: periodId || null,
    issuedAt, publishedAt: issuedAt, dueDate: issuedAt } };
}

// Aggregate for readiness only. Never persist this projection as an invoice.
export async function transferInvoiceBalance(primary, session = null) {
  if (!primary) return null;
  const source = primary.toObject ? primary.toObject() : primary;
  const supplements = await Bill.find({ transferSupplementOf: source._id, status: { $ne: 'voided' }, isArchived: { $ne: true } }).session(session).lean();
  const bills = [source, ...supplements];
  const sum = key => roundMoney(bills.reduce((n,b) => n + Number(b[key] || 0), 0));
  const charges = {};
  for (const bill of bills) for (const [key, amount] of Object.entries(bill.charges || {})) if (typeof amount === 'number') charges[key] = roundMoney((charges[key] || 0) + amount);
  return { ...source, charges, totalAmount: sum('totalAmount'), paidAmount: sum('paidAmount'),
    remainingAmount: roundMoney(sum('totalAmount') - sum('paidAmount')),
    invoiceIds: bills.map(b => b._id), payableBillId: bills.find(b => Number(b.totalAmount) > Number(b.paidAmount || 0))?._id || source._id };
}

export async function supplementTransferInvoice({ primary, targetCharges, record, actorId, session }) {
  const balance = await transferInvoiceBalance(primary, session);
  const charges = {};
  for (const key of ['rent', 'securityDeposit', 'electricity']) {
    charges[key] = roundMoney(Number(targetCharges[key] || 0) - Number(balance.charges[key] || 0));
    if (charges[key] < -0.01) throw Object.assign(new Error('Paid settlement components decreased; manual financial review is required.'), { statusCode: 409, code: 'FINANCIAL_ADJUSTMENT_REQUIRED' });
    charges[key] = Math.max(0, charges[key]);
  }
  const total = roundMoney(Object.values(charges).reduce((a,b) => a+b,0));
  if (total <= 0.01) return balance;
  const target = roundMoney(balance.totalAmount + total);
  await Bill.create([{
    billType: 'transfer_settlement', transferSettlementKey: `${record._id}:supplement:${target}`, transferSupplementOf: primary._id,
    reservationId: primary.reservationId, userId: primary.userId, branch: primary.branch, roomId: primary.roomId,
    billingMonth: new Date(), billingCycleStart: null, billingCycleEnd: null, dueDate: new Date(),
    charges, totalAmount: total, grossAmount: total, remainingAmount: total, paidAmount: 0,
    utilityDispatch: transferElectricityDispatch(charges.electricity, primary.utilityDispatch?.electricity?.periodId),
    status: 'pending', publicationState: 'published', createdBy: actorId,
    notes: `Supplemental Room Transfer balance for invoice ${primary._id}. Original invoice preserved.`,
  }], { session });
  return transferInvoiceBalance(primary, session);
}
