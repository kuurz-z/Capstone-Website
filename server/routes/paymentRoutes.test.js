import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const noop = (_req, _res, next) => next?.();

const verifyToken = jest.fn(noop);
const verifyAdmin = jest.fn(noop);

const requirePermission = jest.fn((permission) => {
  const middleware = (_req, _res, next) => next?.();
  middleware.requiredPermission = permission;
  return middleware;
});

const createBillCheckout = jest.fn(noop);
const createDepositCheckout = jest.fn(noop);
const checkSessionStatus = jest.fn(noop);
const getPaymentsForBillController = jest.fn(noop);
const getPaymentHistory = jest.fn();
const getPaymentsForBill = jest.fn();
const userFindOne = jest.fn();
const reservationFind = jest.fn();
const readMoveInDate = jest.fn();

await jest.unstable_mockModule("../middleware/auth.js", () => ({
  verifyToken,
  verifyAdmin,
}));

await jest.unstable_mockModule("../middleware/permissions.js", () => ({
  requirePermission,
}));

await jest.unstable_mockModule("../controllers/paymentController.js", () => ({
  createBillCheckout,
  createDepositCheckout,
  checkSessionStatus,
  getPaymentsForBill: getPaymentsForBillController,
}));

await jest.unstable_mockModule("../models/Payment.js", () => ({
  default: {
    getPaymentHistory,
    getPaymentsForBill,
  },
}));

await jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    findOne: userFindOne,
  },
}));

await jest.unstable_mockModule("../models/Reservation.js", () => ({
  default: {
    find: reservationFind,
  },
}));

await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => ({
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  readMoveInDate,
}));

const paymentRoutes = (await import("./paymentRoutes.js")).default;

function getRouteHandlers(router, path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  return layer?.route?.stack?.map((entry) => entry.handle) || [];
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe("paymentRoutes", () => {
  beforeEach(() => {
    verifyToken.mockClear();
    verifyAdmin.mockClear();
    requirePermission.mockClear();
    createBillCheckout.mockClear();
    createDepositCheckout.mockClear();
    checkSessionStatus.mockClear();
    getPaymentsForBillController.mockClear();
    getPaymentHistory.mockReset();
    getPaymentsForBill.mockReset();
    userFindOne.mockReset();
    reservationFind.mockReset();
    readMoveInDate.mockReset();
  });

  test("history route returns tenant ledger entries for the authenticated user", async () => {
    const handlers = getRouteHandlers(paymentRoutes, "/history", "get");
    const historyHandler = handlers[handlers.length - 1];
    const payments = [
      {
        paymentId: "PAY-12345678",
        amount: 5000,
        method: "paymongo",
        source: "paymongo-webhook",
        externalPaymentId: "pay_123",
      },
    ];

    userFindOne.mockResolvedValue({ _id: "tenant_1" });
    getPaymentHistory.mockResolvedValue(payments);

    const req = { user: { uid: "firebase-1" }, query: { limit: "10" } };
    const res = createRes();

    await historyHandler(req, res);

    expect(userFindOne).toHaveBeenCalledWith({ firebaseUid: "firebase-1" });
    expect(getPaymentHistory).toHaveBeenCalledWith("tenant_1", { limit: 10 });
    expect(res.payload).toEqual({ success: true, data: payments });
  });

  test("bill-payments route returns payment ledger records for a specific bill", async () => {
    const handlers = getRouteHandlers(paymentRoutes, "/bill/:billId/payments", "get");
    const billPaymentsHandler = handlers[handlers.length - 1];

    const req = { params: { billId: "bill_1" } };
    const res = createRes();
    const next = jest.fn();

    await billPaymentsHandler(req, res, next);

    expect(getPaymentsForBillController).toHaveBeenCalledWith(req, res, next);
  });
});
