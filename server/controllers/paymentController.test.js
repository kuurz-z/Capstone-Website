import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const createCheckoutSession = jest.fn();
const getCheckoutSession = jest.fn();
const billFindById = jest.fn();
const reservationFindById = jest.fn();
const userFindOne = jest.fn();
const userFindById = jest.fn();
const sendPaymentApprovedEmail = jest.fn();
const sendPaymentReceiptEmail = jest.fn();
const updateOccupancyOnReservationChange = jest.fn();
const syncBillAmounts = jest.fn();
const getBillRemainingAmount = jest.fn();
const resolveBillStatus = jest.fn();
const settlePaymongoBill = jest.fn();
const sendSuccess = jest.fn();
const mockLean = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

await jest.unstable_mockModule("../config/paymongo.js", () => ({
  createCheckoutSession,
  getCheckoutSession,
}));

await jest.unstable_mockModule("../models/index.js", () => ({
  Bill: { findById: billFindById },
  Reservation: { findById: reservationFindById },
  User: { findOne: userFindOne, findById: userFindById },
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule("../config/email.js", () => ({
  sendPaymentApprovedEmail,
  sendPaymentReceiptEmail,
}));

await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  updateOccupancyOnReservationChange,
}));

await jest.unstable_mockModule("../config/constants.js", () => ({
  BUSINESS: { DEPOSIT_AMOUNT: 2000 },
}));

await jest.unstable_mockModule("../utils/businessSettings.js", () => ({
  getReservationFeeAmount: jest.fn(async () => 2000),
}));

await jest.unstable_mockModule("../utils/billSettlement.js", () => ({
  settlePaymongoBill,
}));

await jest.unstable_mockModule("../utils/billingPolicy.js", () => ({
  getBillRemainingAmount,
  getVisibleBillSnapshot: (bill) => ({
    status: bill.status || "pending",
    remainingAmount: bill.remainingAmount ?? bill.totalAmount ?? 0,
  }),
  resolveBillStatus,
  roundMoney: (value) => Number(value),
  syncBillAmounts,
}));

await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess,
  AppError: class AppError extends Error {
    constructor(message, statusCode, code) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

const { createBillCheckout, checkSessionStatus } = await import("./paymentController.js");

describe("paymentController", () => {
  beforeEach(() => {
    createCheckoutSession.mockReset();
    getCheckoutSession.mockReset();
    billFindById.mockReset();
    reservationFindById.mockReset();
    userFindOne.mockReset();
    userFindById.mockReset();
    sendPaymentApprovedEmail.mockReset();
    sendPaymentReceiptEmail.mockReset();
    updateOccupancyOnReservationChange.mockReset();
    syncBillAmounts.mockReset();
    getBillRemainingAmount.mockReset();
    resolveBillStatus.mockReset();
    settlePaymongoBill.mockReset();
    sendSuccess.mockReset();
  });

  test("createBillCheckout redirects paid tenant bills back to applicant billing", async () => {
    const bill = {
      _id: "bill_1",
      userId: "tenant_1",
      totalAmount: 5000,
      status: "pending",
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    getBillRemainingAmount.mockReturnValue(5000);
    resolveBillStatus.mockReturnValue("pending");
    createCheckoutSession.mockResolvedValue({
      checkoutUrl: "https://checkout.test/cs_bill",
      sessionId: "cs_bill",
    });

    const req = { params: { billId: "bill_1" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createBillCheckout(req, res, next);

    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl:
          "http://localhost:5173/applicant/billing?payment=success&session_id={id}",
        cancelUrl: "http://localhost:5173/applicant/billing?payment=cancelled",
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        checkoutUrl: "https://checkout.test/cs_bill",
        sessionId: "cs_bill",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("createBillCheckout reuses an existing open bill checkout session", async () => {
    const bill = {
      _id: "bill_existing",
      userId: "tenant_1",
      status: "pending",
      paymongoSessionId: "cs_existing",
      save: jest.fn(),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    getCheckoutSession.mockResolvedValue({
      attributes: {
        checkout_url: "https://checkout.test/cs_existing",
        payments: [],
      },
    });

    const req = { params: { billId: "bill_existing" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createBillCheckout(req, res, next);

    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(bill.save).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        checkoutUrl: "https://checkout.test/cs_existing",
        sessionId: "cs_existing",
        reused: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects session inspection for another tenant", async () => {
    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "deposit",
          reservationId: "res_1",
          userId: "tenant_2",
        },
        payments: [],
      },
    });

    const req = { params: { sessionId: "cs_1" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("FORBIDDEN");
    expect(sendSuccess).not.toHaveBeenCalled();
  });

  test("auto-reserves a paid payment_pending deposit exactly once", async () => {
    const reservation = {
      _id: "res_1",
      userId: "tenant_1",
      roomId: { name: "GP-101", branch: "gil-puyat" },
      status: "payment_pending",
      paymentStatus: "pending",
      reservationFeeAmount: 2000,
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    userFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        email: "tenant@example.com",
        firstName: "Test",
        lastName: "Tenant",
      }),
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "deposit",
          reservationId: "res_1",
          userId: "tenant_1",
        },
        payment_method_used: "gcash",
        payments: [
          {
            id: "pay_1",
            attributes: { status: "paid", source: { type: "gcash" } },
          },
        ],
      },
    });

    const req = { params: { sessionId: "cs_1" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(reservation.paymentStatus).toBe("paid");
    expect(reservation.status).toBe("reserved");
    expect(reservation.paymongoPaymentId).toBe("pay_1");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(updateOccupancyOnReservationChange).toHaveBeenCalledTimes(1);
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_1", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("settles a paid bill session through the shared bill-settlement helper", async () => {
    const bill = {
      _id: "bill_2",
      userId: "tenant_1",
      billingMonth: new Date("2026-03-01T00:00:00.000Z"),
      branch: "gil-puyat",
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    settlePaymongoBill.mockResolvedValue({
      applied: true,
      reason: "settled",
      appliedAmount: 5000,
      bill,
    });
    userFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        email: "tenant@example.com",
        firstName: "Test",
        lastName: "Tenant",
      }),
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "bill",
          billId: "bill_2",
          userId: "tenant_1",
          amountDue: "5000",
        },
        payment_method_used: "gcash",
        payments: [
          {
            id: "pay_2",
            attributes: { status: "paid", amount: 500000 },
          },
        ],
      },
    });

    const req = { params: { sessionId: "cs_bill_2" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(settlePaymongoBill).toHaveBeenCalledWith({
      bill,
      paymentReference: "pay_2",
      settledAmount: 5000,
      source: "paymongo-polling",
      metadata: {
        sessionId: "cs_bill_2",
        sessionType: "bill",
      },
    });
    expect(sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 5000 }),
    );
    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, referenceId: "pay_2" }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_bill_2", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("falls back to the PayMongo centavos amount when amountDue metadata is missing", async () => {
    const bill = {
      _id: "bill_3",
      userId: "tenant_1",
      billingMonth: new Date("2026-04-01T00:00:00.000Z"),
      branch: "gil-puyat",
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    settlePaymongoBill.mockResolvedValue({
      applied: true,
      reason: "settled",
      appliedAmount: 4500,
      bill,
    });
    userFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        email: "tenant@example.com",
        firstName: "Fallback",
        lastName: "Tenant",
      }),
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "bill",
          billId: "bill_3",
          userId: "tenant_1",
        },
        payment_method_used: "gcash",
        payments: [
          {
            id: "pay_3",
            attributes: { status: "paid", amount: 450000 },
          },
        ],
      },
    });

    const req = { params: { sessionId: "cs_bill_3" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(settlePaymongoBill).toHaveBeenCalledWith({
      bill,
      paymentReference: "pay_3",
      settledAmount: 4500,
      source: "paymongo-polling",
      metadata: {
        sessionId: "cs_bill_3",
        sessionType: "bill",
      },
    });
    expect(sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 4500 }),
    );
    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4500, referenceId: "pay_3" }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_bill_3", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("does not reapply an already settled bill", async () => {
    const bill = {
      _id: "bill_1",
      userId: "tenant_1",
      status: "paid",
      paymongoPaymentId: "pay_same",
      save: jest.fn(),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    settlePaymongoBill.mockResolvedValue({
      applied: false,
      reason: "already_applied",
      appliedAmount: 0,
      bill,
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "bill",
          billId: "bill_1",
          userId: "tenant_1",
          amountDue: "5000",
        },
        payments: [
          {
            id: "pay_same",
            attributes: { status: "paid" },
          },
        ],
      },
    });

    const req = { params: { sessionId: "cs_bill" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(settlePaymongoBill).toHaveBeenCalledWith({
      bill,
      paymentReference: "pay_same",
      settledAmount: 5000,
      source: "paymongo-polling",
      metadata: {
        sessionId: "cs_bill",
        sessionType: "bill",
      },
    });
    expect(bill.save).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_bill", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
