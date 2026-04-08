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

await jest.unstable_mockModule("../utils/billingPolicy.js", () => ({
  getBillRemainingAmount: jest.fn(),
  getVisibleBillSnapshot: (bill) => ({ status: bill.status || "pending" }),
  resolveBillStatus: jest.fn(),
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

const { checkSessionStatus } = await import("./paymentController.js");

describe("paymentController.checkSessionStatus", () => {
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
    sendSuccess.mockReset();
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

  test("auto-reserves a paid pending deposit exactly once", async () => {
    const reservation = {
      _id: "res_1",
      userId: "tenant_1",
      roomId: { name: "GP-101", branch: "gil-puyat" },
      status: "pending",
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

    expect(bill.save).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_bill", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
