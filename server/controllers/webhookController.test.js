import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const verifyWebhookSignature = jest.fn();
const reservationFindById = jest.fn();
const reservationFindOne = jest.fn();
const reservationUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const billFindById = jest.fn();
const billFindOne = jest.fn();
const userFindById = jest.fn();
const sendPaymentReceiptEmail = jest.fn();
const updateOccupancyOnReservationChange = jest.fn();
const paymentApproved = jest.fn();
const settlePaymongoBill = jest.fn();

await jest.unstable_mockModule("../config/paymongo.js", () => ({
  verifyWebhookSignature,
}));

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: {
    findById: reservationFindById,
    findOne: reservationFindOne,
    updateOne: reservationUpdateOne,
  },
  Bill: { findById: billFindById, findOne: billFindOne },
  User: { findById: userFindById },
}));

await jest.unstable_mockModule("../config/email.js", () => ({
  sendPaymentReceiptEmail,
}));

await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  updateOccupancyOnReservationChange,
}));

await jest.unstable_mockModule("../utils/notificationService.js", () => ({
  notify: { paymentApproved },
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
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

const {
  handlePaymongoWebhook,
  handlePaymongoSourceWebhook,
} = await import("./webhookController.js");

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return res;
};

const buildCheckoutPaidEvent = ({ metadata, paymentId = "pay_1", amount = 200000 } = {}) => ({
  data: {
    id: "evt_1",
    attributes: {
      type: "checkout_session.payment.paid",
      data: {
        id: "cs_1",
        attributes: {
          metadata,
          payments: [
            {
              id: paymentId,
              attributes: { amount },
            },
          ],
        },
      },
    },
  },
});

describe("handlePaymongoWebhook", () => {
  beforeEach(() => {
    verifyWebhookSignature.mockReset();
    reservationFindById.mockReset();
    reservationFindOne.mockReset();
    reservationUpdateOne.mockReset();
    reservationUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    billFindById.mockReset();
    billFindOne.mockReset();
    userFindById.mockReset();
    sendPaymentReceiptEmail.mockReset();
    updateOccupancyOnReservationChange.mockReset();
    paymentApproved.mockReset();
    settlePaymongoBill.mockReset();
  });

  test("returns 200 and skips duplicate deposit payments", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutPaidEvent({
        metadata: { type: "deposit", reservationId: "res_1" },
        paymentId: "pay_dup",
      }),
    );

    const reservation = {
      _id: "res_1",
      userId: "user_1",
      roomId: { name: "Room 1" },
      status: "reserved",
      paymentStatus: "paid",
      paymongoPaymentId: "pay_dup",
      save: jest.fn(),
    };

    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "sig" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(reservation.save).not.toHaveBeenCalled();
    expect(updateOccupancyOnReservationChange).not.toHaveBeenCalled();
  });

  test("auto-reserves payment_pending deposit reservations and updates occupancy", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutPaidEvent({
        metadata: { type: "deposit", reservationId: "res_2" },
        paymentId: "pay_new",
      }),
    );

    const reservation = {
      _id: "res_2",
      userId: "user_2",
      roomId: { name: "Room 2" },
      status: "payment_pending",
      paymentStatus: "pending",
      paymongoPaymentId: null,
      reservationFeeAmount: null,
      save: jest.fn(async function save() {
        return this;
      }),
    };

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

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "sig" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(reservation.paymentStatus).toBe("paid");
    expect(reservation.status).toBe("reserved");
    expect(reservation.paymongoPaymentId).toBe("pay_new");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(updateOccupancyOnReservationChange).toHaveBeenCalledTimes(1);
  });

  test("does not force status change when deposit arrives before payment stage", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutPaidEvent({
        metadata: { type: "deposit", reservationId: "res_3" },
        paymentId: "pay_midflow",
      }),
    );

    const reservation = {
      _id: "res_3",
      userId: "user_3",
      roomId: { name: "Room 3" },
      status: "visit_approved",
      paymentStatus: "pending",
      paymongoPaymentId: null,
      reservationFeeAmount: 2000,
      save: jest.fn(async function save() {
        return this;
      }),
    };

    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(reservation),
    });
    userFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        email: "tenant3@example.com",
        firstName: "Mid",
        lastName: "Flow",
      }),
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "sig" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(reservation.paymentStatus).toBe("paid");
    expect(reservation.status).toBe("visit_approved");
    expect(updateOccupancyOnReservationChange).not.toHaveBeenCalled();
  });

  test("settles bill webhooks through the shared bill-settlement helper", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutPaidEvent({
        metadata: { type: "bill", billId: "bill_1" },
        paymentId: "pay_bill_1",
        amount: 450000,
      }),
    );

    const bill = {
      _id: "bill_1",
      userId: "user_1",
      billingMonth: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: 5000,
    };

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
        firstName: "Bill",
        lastName: "Tenant",
      }),
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "sig" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(settlePaymongoBill).toHaveBeenCalledWith({
      bill,
      paymentReference: "pay_bill_1",
      settledAmount: 4500,
      source: "paymongo-webhook",
      metadata: {
        eventType: "checkout_session.payment.paid",
        provider: "paymongo",
      },
    });
    expect(paymentApproved).toHaveBeenCalledTimes(1);
    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4500,
        referenceId: "pay_bill_1",
      }),
    );
  });

  test("does not resend bill side effects when the webhook delivery is a duplicate", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutPaidEvent({
        metadata: { type: "bill", billId: "bill_dup" },
        paymentId: "pay_dup_bill",
        amount: 500000,
      }),
    );

    const bill = {
      _id: "bill_dup",
      userId: "user_dup",
      billingMonth: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: 5000,
    };

    billFindById.mockResolvedValue(bill);
    settlePaymongoBill.mockResolvedValue({
      applied: false,
      reason: "already_applied",
      appliedAmount: 0,
      bill,
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "sig" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(settlePaymongoBill).toHaveBeenCalledWith({
      bill,
      paymentReference: "pay_dup_bill",
      settledAmount: 5000,
      source: "paymongo-webhook",
      metadata: {
        eventType: "checkout_session.payment.paid",
        provider: "paymongo",
      },
    });
    expect(userFindById).not.toHaveBeenCalled();
    expect(paymentApproved).not.toHaveBeenCalled();
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled();
  });

  test("always returns 200 when signature verification fails", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "bad" } };
    const res = createResponse();

    await handlePaymongoWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test("payment-level webhook also returns 200 when signature verification fails", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const req = { body: Buffer.from("{}"), headers: { "paymongo-signature": "bad" } };
    const res = createResponse();

    await handlePaymongoSourceWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
