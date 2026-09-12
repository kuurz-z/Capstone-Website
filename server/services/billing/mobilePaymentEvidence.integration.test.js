import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll, beforeEach, expect, test, jest } from '@jest/globals';
import Payment from '../../models/Payment.js';
import { loadMobilePaymentEvidence } from './mobilePaymentEvidence.js';
import { toMobileBill } from '../mobileBillingBridge.js';
import { readHistoricalMoveInPaymentEvidence } from './historicalMoveInPaymentEvidence.js';

jest.setTimeout(60000);
let mongo;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'payment_evidence' }); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Payment.deleteMany({}); });
const tenantId = new mongoose.Types.ObjectId();
const bill = () => ({ _id: new mongoose.Types.ObjectId(), userId: tenantId, branch: 'gil-puyat', billType: 'initial_payment', charges: { rent: 100 }, totalAmount: 100, paidAmount: 100, remainingAmount: 0, status: 'paid', paymentMethod: 'offline_cash' });

test.each([['gcash', 'GCash'], ['paymaya', 'Maya'], ['card', 'Credit / Debit Card'], ['bank', 'Bank Transfer'], ['offline_cash', 'Cash (Branch)']])('uses successful %s transaction over the bill projection without changing historical data', async (method, label) => {
  const invoice = bill(), before = JSON.stringify(invoice);
  await Payment.collection.insertMany([
    { paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'paid', method, amount: 100, processedAt: new Date() },
    { paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'pending', method: 'offline_cash', amount: 100, processedAt: new Date(Date.now() + 1000) },
    { paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId: new mongoose.Types.ObjectId(), status: 'paid', method: 'card', amount: 100, processedAt: new Date(Date.now() + 2000) },
  ]);
  const records = await Payment.find().lean();
  const evidence = await loadMobilePaymentEvidence([invoice], tenantId);
  const dto = toMobileBill(invoice, { payment: evidence.get(String(invoice._id)) });
  expect(dto.payment_method).toBe(label);
  expect(dto.payment_method_source).toBe('successful_transaction');
  expect(JSON.stringify(invoice)).toBe(before);
  expect(await Payment.find().lean()).toEqual(records);
});
test('legacy synthetic move-in cash is not treated as reliable tender evidence', async () => {
  const invoice = bill();
  await Payment.collection.insertOne({ paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'paid', method: 'offline_cash', amount: 100, metadata: { reason: 'Settled upon move-in check-in' } });
  const evidence = await loadMobilePaymentEvidence([invoice], tenantId);
  expect(evidence.size).toBe(0);
  expect(toMobileBill(invoice, { payment: null }).payment_method_label).toBe('Method unavailable');
});

test('method, reference and date come from the latest successful transaction including historical manual records', async () => {
  const invoice = { ...bill(), paymentDate: new Date('2026-08-01T00:00:00Z') };
  const verifiedAt = new Date('2026-08-30T00:00:00Z');
  await Payment.collection.insertMany([
    { paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'paid', method: 'gcash', amount: 50, processedAt: new Date('2026-08-20T00:00:00Z') },
    { paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'approved', method: 'bank', amount: 50, verifiedAt, createdAt: new Date('2026-08-29T00:00:00Z'), referenceNumber: 'verified-bank-reference' },
  ]);
  const evidence = await loadMobilePaymentEvidence([invoice], tenantId);
  const dto = toMobileBill(invoice, { payment: evidence.get(String(invoice._id)) });
  expect(dto.payment_method).toBe('Bank Transfer');
  expect(dto.payment_reference).toBe('verified-bank-reference');
  expect(dto.payment_date).toEqual(verifiedAt);
});
test('explicit branch payment remains supported, partial/unpaid/outstanding totals are unchanged', async () => {
  const invoices = [bill(), { ...bill(), paidAmount: 20, remainingAmount: 80, status: 'partially_paid' }, { ...bill(), paidAmount: 0, remainingAmount: 100, status: 'unpaid' }];
  await Payment.collection.insertOne({ paymentId: String(new mongoose.Types.ObjectId()), billId: invoices[0]._id, tenantId, status: 'paid', method: 'offline_cash', amount: 100, metadata: { reason: 'Settled upon move-in check-in', methodExplicitlyRecorded: true } });
  const evidence = await loadMobilePaymentEvidence(invoices, tenantId);
  expect(evidence.size).toBe(1);
  for (const invoice of invoices) {
    const dto = toMobileBill(invoice, { payment: evidence.get(String(invoice._id)) || null });
    const original = toMobileBill(invoice);
    expect(dto.remaining_amount).toBe(original.remaining_amount);
    expect(dto.status).toBe(original.status);
    expect(dto.total).toBe(original.total);
  }
});

const historicalCheckout = (invoice, method = 'gcash') => ({
  id: invoice.paymongoSessionId,
  attributes: {
    metadata: { purpose: 'initial_payment', billId: String(invoice._id), userId: String(tenantId), reservationId: String(invoice.reservationId) },
    payments: [{ id: 'pay_verifiedTransaction', attributes: { status: 'paid', amount: 10000, currency: 'PHP', source: { type: method }, paid_at: 1787657816, refunds: [] } }],
  },
});
const historicalBill = () => ({ ...bill(), reservationId: new mongoose.Types.ObjectId(), paymongoSessionId: 'cs_verifiedCheckout' });

test.each([['gcash', 'GCash'], ['paymaya', 'Maya'], ['card', 'Credit / Debit Card'], ['dob', 'Online Banking']])('recovers historical %s checkout evidence without rewriting synthetic payments or invoices', async (method, label) => {
  const invoice = historicalBill(), before = JSON.stringify(invoice);
  await Payment.collection.insertOne({ paymentId: String(new mongoose.Types.ObjectId()), billId: invoice._id, tenantId, status: 'paid', method: 'offline_cash', amount: 100, metadata: { reason: 'Settled upon move-in check-in' } });
  const ledger = await Payment.find().lean();
  const getSession = jest.fn().mockResolvedValue(historicalCheckout(invoice, method));
  const evidence = await loadMobilePaymentEvidence([invoice], tenantId, { getSession });
  const dto = toMobileBill(invoice, { payment: evidence.get(String(invoice._id)) });
  expect(dto.payment_method_label).toBe(label);
  expect(dto.payment_method_source).toBe('paymongo_checkout_transaction');
  expect(dto.payment_reference).toBe('pay_verifiedTransaction');
  expect(JSON.stringify(invoice)).toBe(before);
  expect(await Payment.find().lean()).toEqual(ledger);
});

test.each(['tenant', 'bill', 'reservation', 'amount', 'currency', 'pending', 'refund', 'multiple', 'session'])('rejects historical checkout evidence with mismatched %s', async (mismatch) => {
  const invoice = historicalBill(), session = historicalCheckout(invoice);
  const attrs = session.attributes.payments[0].attributes;
  if (mismatch === 'tenant') session.attributes.metadata.userId = 'another-tenant';
  if (mismatch === 'bill') session.attributes.metadata.billId = 'another-bill';
  if (mismatch === 'reservation') session.attributes.metadata.reservationId = 'another-reservation';
  if (mismatch === 'amount') attrs.amount = 20000;
  if (mismatch === 'currency') attrs.currency = 'USD';
  if (mismatch === 'pending') attrs.status = 'pending';
  if (mismatch === 'refund') attrs.refunds = [{ status: 'succeeded' }];
  if (mismatch === 'multiple') session.attributes.payments.push(session.attributes.payments[0]);
  if (mismatch === 'session') session.id = 'cs_other';
  expect(await readHistoricalMoveInPaymentEvidence(invoice, tenantId, { getSession: async () => session })).toBeNull();
});

test('provider outages and locally synthesized checkout IDs cannot fabricate a method', async () => {
  const invoice = historicalBill();
  expect(await readHistoricalMoveInPaymentEvidence(invoice, tenantId, { getSession: async () => { throw new Error('timeout'); } })).toBeNull();
  const getSession = jest.fn();
  expect(await readHistoricalMoveInPaymentEvidence({ ...invoice, paymongoSessionId: 'cs_test_mock_payload' }, tenantId, { getSession })).toBeNull();
  expect(getSession).not.toHaveBeenCalled();
});
