import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const verifyWebhookSignature = jest.fn();
const reservationFindById = jest.fn();
const billFindById = jest.fn();
const userFindById = jest.fn();
const sendPaymentReceiptEmail = jest.fn();
const updateOccupancyOnReservationChange = jest.fn();
const paymentApproved = jest.fn();

await jest.unstable_mockModule("../config/paymongo.js", () => ({
  verifyWebhookSignature,
}));

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: { findById: reservationFindById },
  Bill: { findById: billFindById },
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

const { handlePaymongoWebhook } = await import("./webhookController.js");

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
    billFindById.mockReset();
    userFindById.mockReset();
    sendPaymentReceiptEmail.mockReset();
    updateOccupancyOnReservationChange.mockReset();
    paymentApproved.mockReset();
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

  test("auto-reserves pending deposit reservations and updates occupancy", async () => {
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
      status: "pending",
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

  test("does not force status change when deposit arrives for non-pending reservation", async () => {
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
});
