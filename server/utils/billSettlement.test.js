import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const applyBillPayment = jest.fn();
const getVisibleBillSnapshot = jest.fn();
const roundMoney = jest.fn((value) => Math.round((Number(value) || 0) * 100) / 100);

await jest.unstable_mockModule("./paymentLedger.js", () => ({
  applyBillPayment,
}));

await jest.unstable_mockModule("./billingPolicy.js", () => ({
  getVisibleBillSnapshot,
  roundMoney,
}));

const { settlePaymongoBill } = await import("./billSettlement.js");

describe("settlePaymongoBill", () => {
  beforeEach(() => {
    applyBillPayment.mockReset();
    getVisibleBillSnapshot.mockReset();
    roundMoney.mockClear();
  });

  test("delegates bill settlement to the payment ledger and annotates paymongo fields", async () => {
    const now = new Date("2026-04-22T09:00:00.000Z");
    const bill = {
      save: jest.fn(async function save() {
        return this;
      }),
    };

    getVisibleBillSnapshot.mockReturnValue({
      status: "partially-paid",
      remainingAmount: 4000,
    });
    applyBillPayment.mockResolvedValue({
      appliedAmount: 4000,
      bill,
    });

    const result = await settlePaymongoBill({
      bill,
      paymentReference: "pay_1",
      settledAmount: 4500,
      source: "paymongo-polling",
      metadata: { sessionId: "cs_1" },
      now,
    });

    expect(applyBillPayment).toHaveBeenCalledWith({
      bill,
      amount: 4000,
      method: "paymongo",
      source: "paymongo-polling",
      referenceNumber: "pay_1",
      externalPaymentId: "pay_1",
      metadata: {
        sessionId: "cs_1",
        provider: "paymongo",
      },
      now,
    });
    expect(bill.paymongoPaymentId).toBe("pay_1");
    expect(bill.paymentProof).toEqual(
      expect.objectContaining({
        verificationStatus: "approved",
        verifiedAt: now,
        submittedAmount: 4000,
      }),
    );
    expect(bill.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        reason: "settled",
        appliedAmount: 4000,
        bill,
      }),
    );
  });

  test("skips already-settled bills without calling the payment ledger", async () => {
    const bill = {
      paymongoPaymentId: "pay_1",
      save: jest.fn(),
    };

    getVisibleBillSnapshot.mockReturnValue({
      status: "paid",
      remainingAmount: 0,
    });

    const result = await settlePaymongoBill({
      bill,
      paymentReference: "pay_1",
      settledAmount: 5000,
    });

    expect(applyBillPayment).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        reason: "already_applied",
        appliedAmount: 0,
        bill,
      }),
    );
    expect(bill.save).not.toHaveBeenCalled();
  });

  test("treats reused external payments as already applied", async () => {
    const bill = {
      save: jest.fn(),
    };

    getVisibleBillSnapshot.mockReturnValue({
      status: "pending",
      remainingAmount: 3000,
    });
    applyBillPayment.mockResolvedValue({
      appliedAmount: 0,
      reused: true,
      bill,
    });

    const result = await settlePaymongoBill({
      bill,
      paymentReference: "pay_existing",
      settledAmount: 3000,
    });

    expect(applyBillPayment).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        reason: "already_applied",
        appliedAmount: 0,
        bill,
      }),
    );
    expect(bill.save).not.toHaveBeenCalled();
  });
});
