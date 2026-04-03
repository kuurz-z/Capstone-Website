import { describe, expect, jest, test } from "@jest/globals";
import Payment from "../models/Payment.js";
import { applyBillPayment } from "./paymentLedger.js";

function buildBillFixture(overrides = {}) {
  return {
    _id: "bill-1",
    userId: "tenant-1",
    branch: "gil-puyat",
    charges: {
      rent: 1500,
      electricity: 0,
      water: 0,
      applianceFees: 0,
      corkageFees: 0,
      penalty: 0,
      discount: 0,
    },
    paidAmount: 0,
    remainingAmount: 0,
    status: "pending",
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
}

describe("applyBillPayment", () => {
  test("applies a partial payment using bill charges and preserves the remaining balance", async () => {
    const bill = buildBillFixture();
    const paymentModel = {
      create: jest.fn(async (payload) => ({ ...payload, deleteOne: jest.fn() })),
    };

    const result = await applyBillPayment({
      bill,
      amount: 500,
      method: "cash",
      source: "admin-manual",
      actorId: "admin-1",
      paymentModel,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });

    expect(result.bill.totalAmount).toBe(1500);
    expect(result.bill.remainingAmount).toBe(1000);
    expect(result.bill.status).toBe("partially-paid");
    expect(result.payment.amount).toBe(500);
    expect(result.payment.status).toBe("approved");
    expect(result.payment.billId).toBe("bill-1");
    expect(paymentModel.create).toHaveBeenCalledTimes(1);
    expect(bill.save).toHaveBeenCalledTimes(1);
  });

  test("caps an overpayment at the remaining balance and marks the bill paid", async () => {
    const bill = buildBillFixture();
    const paymentModel = {
      create: jest.fn(async (payload) => ({ ...payload, deleteOne: jest.fn() })),
    };

    const result = await applyBillPayment({
      bill,
      amount: 2000,
      method: "cash",
      source: "admin-manual",
      actorId: "admin-1",
      paymentModel,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });

    expect(result.bill.totalAmount).toBe(1500);
    expect(result.bill.remainingAmount).toBe(0);
    expect(result.bill.status).toBe("paid");
    expect(result.payment.amount).toBe(1500);
  });

  test("rejects a payment when the bill has no remaining balance", async () => {
    const bill = buildBillFixture({
      paidAmount: 1500,
      remainingAmount: 0,
      status: "paid",
    });
    const paymentModel = {
      create: jest.fn(),
    };

    await expect(
      applyBillPayment({
        bill,
        amount: 100,
        method: "cash",
        source: "admin-manual",
        actorId: "admin-1",
        paymentModel,
        now: new Date("2026-04-03T10:00:00.000Z"),
      }),
    ).rejects.toThrow("Bill has no remaining balance.");

    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(bill.save).not.toHaveBeenCalled();
  });

  test("rejects a non-positive payment amount", async () => {
    const bill = buildBillFixture();
    const paymentModel = {
      create: jest.fn(),
    };

    await expect(
      applyBillPayment({
        bill,
        amount: 0,
        method: "cash",
        source: "admin-manual",
        actorId: "admin-1",
        paymentModel,
        now: new Date("2026-04-03T10:00:00.000Z"),
      }),
    ).rejects.toThrow("Payment amount must be greater than zero.");

    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(bill.save).not.toHaveBeenCalled();
  });

  test("rolls back the created payment if saving the bill fails", async () => {
    const rollback = jest.fn();
    const bill = buildBillFixture({
      save: jest.fn(async () => {
        throw new Error("bill-save-failed");
      }),
    });
    const paymentModel = {
      create: jest.fn(async (payload) => ({ ...payload, deleteOne: rollback })),
    };

    await expect(
      applyBillPayment({
        bill,
        amount: 500,
        method: "cash",
        source: "admin-manual",
        actorId: "admin-1",
        paymentModel,
        now: new Date("2026-04-03T10:00:00.000Z"),
      }),
    ).rejects.toThrow("bill-save-failed");

    expect(paymentModel.create).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  test("reuses an existing payment for the same external provider id regardless of source", async () => {
    const existingPayment = {
      paymentId: "PAY-EXISTING",
      externalPaymentId: "pay_123",
      source: "paymongo-polling",
      amount: 1500,
    };
    const bill = buildBillFixture();
    const paymentModel = {
      findOne: jest.fn(async () => existingPayment),
      create: jest.fn(),
    };

    const result = await applyBillPayment({
      bill,
      amount: 1500,
      method: "paymongo",
      source: "paymongo-webhook",
      externalPaymentId: "pay_123",
      actorId: "admin-1",
      paymentModel,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });

    expect(paymentModel.findOne).toHaveBeenCalledWith({ externalPaymentId: "pay_123" });
    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(bill.save).not.toHaveBeenCalled();
    expect(result.payment).toBe(existingPayment);
    expect(result.appliedAmount).toBe(0);
  });

  test("uses the provided Mongo session for atomic bill and payment writes", async () => {
    const session = {
      withTransaction: jest.fn(async (fn) => fn()),
      endSession: jest.fn(),
    };
    const bill = buildBillFixture();
    const paymentModel = {
      findOne: jest.fn(async () => null),
      create: jest.fn(async (payload) => ({ ...payload, deleteOne: jest.fn() })),
    };

    const result = await applyBillPayment({
      bill,
      amount: 500,
      method: "cash",
      source: "admin-manual",
      actorId: "admin-1",
      paymentModel,
      session,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(paymentModel.create).toHaveBeenCalledTimes(1);
    expect(result.bill.remainingAmount).toBe(1000);
    expect(result.payment.amount).toBe(500);
  });

  test("exposes ledger fields and idempotency index on the payment schema", () => {
    expect(Payment.schema.path("source")).toBeDefined();
    expect(Payment.schema.path("externalPaymentId")).toBeDefined();
    expect(Payment.schema.path("processedAt")).toBeDefined();
    expect(Payment.schema.path("metadata")).toBeDefined();

    const indexedFields = Payment.schema
      .indexes()
      .find(([fields, options]) => fields.externalPaymentId === 1 && options.unique === true);

    expect(indexedFields).toBeDefined();
    expect(indexedFields[1].unique).toBe(true);
    expect(indexedFields[1].partialFilterExpression).toEqual({
      externalPaymentId: { $type: "string" },
    });
  });
});
