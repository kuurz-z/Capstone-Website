import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const createCheckoutSession = jest.fn();
const getCheckoutSession = jest.fn();
const billFindById = jest.fn();
const billFindOne = jest.fn();
const paymentGetPaymentsForBill = jest.fn();
const reservationFindById = jest.fn();
const reservationUpdateOne = jest.fn();
const userFindOne = jest.fn();
const userFindById = jest.fn();
const userFind = jest.fn();
const sendPaymentApprovedEmail = jest.fn();
const sendPaymentReceiptEmail = jest.fn();
const updateOccupancyOnReservationChange = jest.fn();
const syncBillAmounts = jest.fn();
const getBillRemainingAmount = jest.fn();
const resolveBillStatus = jest.fn();
const settlePaymongoBill = jest.fn();
const sendSuccess = jest.fn();
const notifyGeneral = jest.fn();
const notifyPaymentApproved = jest.fn();
const settleReservationDeposit = jest.fn();
const auditLog = jest.fn();
const mockLean = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

await jest.unstable_mockModule("../config/paymongo.js", () => ({
  createCheckoutSession,
  getCheckoutSession,
}));

function MockBill(data) {
  Object.assign(this, data);
  this.save = jest.fn(async function save() {
    return this;
  });
}
MockBill.findById = billFindById;
MockBill.findOne = billFindOne;
MockBill.updateMany = jest.fn().mockResolvedValue({ acknowledged: true });

await jest.unstable_mockModule("../models/index.js", () => ({
  Bill: MockBill,
  Payment: { getPaymentsForBill: paymentGetPaymentsForBill },
  Reservation: { findById: reservationFindById, updateOne: reservationUpdateOne },
  User: { findOne: userFindOne, findById: userFindById, find: userFind },
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
  getPenaltyRatePerDay: jest.fn(async () => 50),
  getLatePaymentGraceDays: jest.fn(async () => 1),
  resolvePenaltyRatePerDay: (stored, configured) => stored || configured || 50,
  resolveLatePaymentGraceDays: (stored, configured) => (stored !== undefined && stored !== null ? Number(stored) : (configured !== undefined && configured !== null ? Number(configured) : 1)),
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
    constructor(message, statusCode, code, details) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  },
}));

await jest.unstable_mockModule("../utils/notificationService.js", () => ({
  notify: { general: notifyGeneral, paymentApproved: notifyPaymentApproved },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { log: auditLog },
}));
await jest.unstable_mockModule(
  "../services/reservationDepositSettlementService.js",
  () => ({ settleReservationDeposit }),
);
const {
  createBillCheckout,
  createDepositCheckout,
  createMoveInCheckout,
  checkSessionStatus,
  getPaymentsForBill,
} = await import("./paymentController.js");

describe("paymentController", () => {
  beforeEach(() => {
    createCheckoutSession.mockReset();
    getCheckoutSession.mockReset();
    billFindById.mockReset();
    billFindOne.mockReset();
    paymentGetPaymentsForBill.mockReset();
    reservationFindById.mockReset();
    reservationUpdateOne.mockReset();
    userFindOne.mockReset();
    userFindById.mockReset();
    userFind.mockReset();
    sendPaymentApprovedEmail.mockReset();
    sendPaymentReceiptEmail.mockReset();
    updateOccupancyOnReservationChange.mockReset();
    syncBillAmounts.mockReset();
    getBillRemainingAmount.mockReset();
    resolveBillStatus.mockReset();
    settlePaymongoBill.mockReset();
    sendSuccess.mockReset();
    notifyGeneral.mockReset();
    notifyPaymentApproved.mockReset();
    notifyPaymentApproved.mockResolvedValue({});
    settleReservationDeposit.mockReset();
    auditLog.mockReset();
    auditLog.mockResolvedValue(undefined);
    settleReservationDeposit.mockImplementation(async ({ reservationId, externalPaymentId }) => {
      const query = reservationFindById(reservationId);
      const reservation = query?.populate ? await query.populate() : await query;
      if (!["approved_for_payment", "payment_pending"].includes(reservation.status)) {
        reservation.paymongoPaymentId = externalPaymentId;
        await reservation.save();
        return { reservation, reconciliationRequired: true };
      }
      reservation.paymentStatus = "paid";
      reservation.status = "reserved";
      reservation.paymongoPaymentId = externalPaymentId;
      await reservation.save();
      return { reservation, settled: true, idempotent: false };
    });
    userFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
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
          "http://localhost:3000/applicant/billing?payment=success&session_id={id}",
        cancelUrl: "http://localhost:3000/applicant/billing?payment=cancelled&session_id={id}",
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
      remainingAmount: 5000,
      totalAmount: 5000,
      paymongoSessionId: "cs_existing",
      save: jest.fn(),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    billFindById.mockResolvedValue(bill);
    getBillRemainingAmount.mockReturnValue(5000);
    resolveBillStatus.mockReturnValue("pending");
    getCheckoutSession.mockResolvedValue({
      attributes: {
        checkout_url: "https://checkout.test/cs_existing",
        payments: [],
        line_items: [{ amount: 500000 }],
        metadata: { amountDue: "5000" },
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

  test("rejects deposit checkout before the reservation reaches payment stage", async () => {
    const reservation = {
      _id: "res_early",
      userId: "tenant_1",
      roomId: { name: "GP-101", branch: "gil-puyat" },
      status: "visit_approved",
      paymentStatus: "pending",
      applicationSubmittedAt: new Date(),
      save: jest.fn(),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });

    const req = { params: { resId: "res_early" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createDepositCheckout(req, res, next);

    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(reservation.save).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("PAYMENT_LOCKED_PENDING_APPLICATION_REVIEW");
  });

  test("creates deposit checkout only for an unpaid submitted payment_pending reservation", async () => {
    const reservation = {
      _id: "res_ready",
      userId: "tenant_1",
      roomId: { name: "GD-201", branch: "guadalupe" },
      status: "payment_pending",
      paymentStatus: "pending",
      applicationSubmittedAt: new Date(),
      reservationFeeAmount: null,
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    createCheckoutSession.mockResolvedValue({
      checkoutUrl: "https://checkout.test/cs_deposit",
      sessionId: "cs_deposit",
    });

    const req = { params: { resId: "res_ready" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createDepositCheckout(req, res, next);

    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2000,
        metadata: expect.objectContaining({
          type: "deposit",
          reservationId: "res_ready",
          userId: "tenant_1",
        }),
      }),
    );
    expect(reservation.paymongoSessionId).toBe("cs_deposit");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        checkoutUrl: "https://checkout.test/cs_deposit",
        sessionId: "cs_deposit",
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

  test("createDepositCheckout keeps payment locked before application approval", async () => {
    const reservation = {
      _id: "res_locked",
      userId: "tenant_1",
      roomId: { name: "GP-103", branch: "gil-puyat" },
      status: "pending_application_review",
      paymentStatus: "pending",
      save: jest.fn(),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });

    const req = { params: { resId: "res_locked" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createDepositCheckout(req, res, next);

    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(sendSuccess).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(
      "PAYMENT_LOCKED_PENDING_APPLICATION_REVIEW",
    );
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
    expect(updateOccupancyOnReservationChange).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_1", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("marks out-of-sequence paid deposit sessions for manual review", async () => {
    const reservation = {
      _id: "res_review",
      userId: "tenant_1",
      roomId: { name: "GP-103", branch: "gil-puyat" },
      status: "visit_approved",
      paymentStatus: "pending",
      reservationFeeAmount: 2000,
      paymongoPaymentId: null,
      notes: "",
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "deposit",
          reservationId: "res_review",
          userId: "tenant_1",
        },
        payment_method_used: "gcash",
        payments: [
          {
            id: "pay_review",
            attributes: { status: "paid", source: { type: "gcash" } },
          },
        ],
      },
    });

    const req = { params: { sessionId: "cs_review" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(reservation.paymentStatus).toBe("pending");
    expect(reservation.status).toBe("visit_approved");
    expect(reservation.paymongoPaymentId).toBe("pay_review");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(updateOccupancyOnReservationChange).not.toHaveBeenCalled();
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        sessionId: "cs_review",
        status: "paid",
        requiresReview: true,
        reservation: expect.objectContaining({
          status: "visit_approved",
          paymentStatus: "pending",
          requiresReview: true,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("auto-reserves a paid deposit when PayMongo nests payments under payment_intent", async () => {
    const reservation = {
      _id: "res_2",
      userId: "tenant_1",
      roomId: { name: "GD-102", branch: "guadalupe" },
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
      lean: jest.fn().mockResolvedValue(null),
    });
    getCheckoutSession.mockResolvedValue({
      attributes: {
        metadata: {
          type: "deposit",
          reservationId: "res_2",
          userId: "tenant_1",
        },
        payment_intent: {
          payments: [
            {
              id: "pay_nested",
              attributes: { status: "paid", source: { type: "gcash" } },
            },
          ],
        },
        payments: [],
      },
    });

    const req = { params: { sessionId: "cs_nested" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await checkSessionStatus(req, res, next);

    expect(reservation.paymentStatus).toBe("paid");
    expect(reservation.status).toBe("reserved");
    expect(reservation.paymongoPaymentId).toBe("pay_nested");
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_nested", status: "paid" }),
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
      payment: { _id: "ledger-payment-2" },
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
        currency: "PHP",
      },
    });
    expect(notifyPaymentApproved).toHaveBeenCalledWith(
      "tenant_1",
      "March 2026",
      5000,
      { billId: "bill_2", eventId: "ledger-payment-2" },
    );
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
      payment: { _id: "ledger-payment-3" },
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
        currency: "PHP",
      },
    });
    expect(notifyPaymentApproved).toHaveBeenCalledWith(
      "tenant_1",
      "April 2026",
      4500,
      { billId: "bill_3", eventId: "ledger-payment-3" },
    );
    expect(sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 4500 }),
    );
    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4500, referenceId: "pay_3" }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        sessionId: "cs_bill_3",
        status: "paid",
        referenceNumber: "pay_3",
        amount: 4500,
        paidAt: expect.any(String),
      }),
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
        currency: "PHP",
      },
    });
    expect(bill.save).not.toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ sessionId: "cs_bill", status: "paid" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("returns payments for a tenant-owned bill", async () => {
    const bill = {
      _id: "bill_own",
      userId: "tenant_1",
      branch: "gil-puyat",
    };
    const payments = [{ paymentId: "PAY-1", amount: 2500 }];

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1", role: "tenant" }));
    billFindById.mockReturnValue(mockLean(bill));
    paymentGetPaymentsForBill.mockResolvedValue(payments);

    const req = { params: { billId: "bill_own" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await getPaymentsForBill(req, res, next);

    expect(paymentGetPaymentsForBill).toHaveBeenCalledWith("bill_own");
    expect(sendSuccess).toHaveBeenCalledWith(res, { data: payments });
    expect(next).not.toHaveBeenCalled();
  });

  test("denies payments for another tenant's bill", async () => {
    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1", role: "tenant" }));
    billFindById.mockReturnValue(
      mockLean({ _id: "bill_other", userId: "tenant_2", branch: "gil-puyat" }),
    );

    const req = { params: { billId: "bill_other" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await getPaymentsForBill(req, res, next);

    expect(paymentGetPaymentsForBill).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("FORBIDDEN");
  });

  test("allows branch billing admins only for their branch", async () => {
    userFindOne.mockReturnValue(
      mockLean({
        _id: "admin_1",
        role: "branch_admin",
        branch: "gil-puyat",
        permissions: ["manageBilling"],
      }),
    );
    billFindById.mockReturnValue(
      mockLean({ _id: "bill_branch", userId: "tenant_1", branch: "gil-puyat" }),
    );
    paymentGetPaymentsForBill.mockResolvedValue([]);

    const req = { params: { billId: "bill_branch" }, user: { uid: "admin-fb" } };
    const res = {};
    const next = jest.fn();

    await getPaymentsForBill(req, res, next);

    expect(paymentGetPaymentsForBill).toHaveBeenCalledWith("bill_branch");
    expect(sendSuccess).toHaveBeenCalledWith(res, { data: [] });
    expect(next).not.toHaveBeenCalled();
  });

  test("denies branch admins without billing permission", async () => {
    userFindOne.mockReturnValue(
      mockLean({
        _id: "admin_1",
        role: "branch_admin",
        branch: "gil-puyat",
        permissions: ["manageRooms"],
      }),
    );
    billFindById.mockReturnValue(
      mockLean({ _id: "bill_branch", userId: "tenant_1", branch: "gil-puyat" }),
    );

    const req = { params: { billId: "bill_branch" }, user: { uid: "admin-fb" } };
    const res = {};
    const next = jest.fn();

    await getPaymentsForBill(req, res, next);

    expect(paymentGetPaymentsForBill).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("FORBIDDEN");
  });

  test("creates move-in checkout with exact price matching remaining balance (PHP 25,000)", async () => {
    const reservation = {
      _id: "res_movein_1",
      userId: "tenant_1",
      roomId: {
        _id: "room_1",
        name: "Private Room 101",
        branch: "gil-puyat",
        type: "private",
        price: 13500,
        monthlyPrice: 13500,
        capacity: 1,
      },
      reservationFeeAmount: 2000,
      reservationFeePaymentStatus: "verified",
      initialPaymentStatus: "pending",
      paymentStatus: "pending",
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    billFindById.mockResolvedValue(null);
    billFindOne.mockResolvedValue(null);
    createCheckoutSession.mockResolvedValue({
      checkoutUrl: "https://checkout.test/cs_movein_25000",
      sessionId: "cs_movein_25000",
    });

    const req = { params: { resId: "res_movein_1" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createMoveInCheckout(req, res, next);

    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25000,
        description: expect.stringContaining("Private Room 101"),
        metadata: expect.objectContaining({
          type: "bill",
          purpose: "initial_payment",
          amountDue: "25000",
        }),
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        checkoutUrl: "https://checkout.test/cs_movein_25000",
        sessionId: "cs_movein_25000",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("createMoveInCheckout replaces stale session when existing session amount differs from remaining balance", async () => {
    const bill = {
      _id: "bill_initial_old",
      userId: "tenant_1",
      status: "pending",
      paymongoSessionId: "cs_old_stale",
      grossAmount: 10800,
      totalAmount: 8800,
      remainingAmount: 8800,
      save: jest.fn(async function save() {
        return this;
      }),
    };

    const reservation = {
      _id: "res_movein_2",
      userId: "tenant_1",
      roomId: {
        _id: "room_1",
        name: "Private Room 101",
        branch: "gil-puyat",
        type: "private",
        price: 13500,
        monthlyPrice: 13500,
        capacity: 1,
      },
      initialPaymentBillId: "bill_initial_old",
      reservationFeeAmount: 2000,
      reservationFeePaymentStatus: "verified",
      initialPaymentStatus: "pending",
      paymentStatus: "paid",
      save: jest.fn(async function save() {
        return this;
      }),
    };

    userFindOne.mockReturnValue(mockLean({ _id: "tenant_1" }));
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    billFindById.mockResolvedValue(bill);
    getCheckoutSession.mockResolvedValue({
      attributes: {
        checkout_url: "https://checkout.test/cs_old_stale",
        payments: [],
        line_items: [{ amount: 880000 }], // 8,800.00 old amount
        metadata: { amountDue: "8800" },
      },
    });
    createCheckoutSession.mockResolvedValue({
      checkoutUrl: "https://checkout.test/cs_fresh_25000",
      sessionId: "cs_fresh_25000",
    });

    const req = { params: { resId: "res_movein_2" }, user: { uid: "firebase-1" } };
    const res = {};
    const next = jest.fn();

    await createMoveInCheckout(req, res, next);

    // Old session should NOT be reused because 8,800 != 25,000
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25000,
      }),
    );
    // Bill should be updated with new amounts
    expect(bill.totalAmount).toBe(25000);
    expect(bill.remainingAmount).toBe(25000);
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        checkoutUrl: "https://checkout.test/cs_fresh_25000",
        sessionId: "cs_fresh_25000",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
