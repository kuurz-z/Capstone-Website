import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindOne = jest.fn();
const reservationFind = jest.fn();
const reservationFindById = jest.fn();
const billFindOne = jest.fn();
const billFind = jest.fn();
const billCountDocuments = jest.fn();
const utilityPeriodFindOne = jest.fn();

const getVisibleBillSnapshot = jest.fn((bill) => ({
  charges: bill.charges || {},
  grossAmount: bill.grossAmount ?? bill.totalAmount ?? 0,
  totalAmount: bill.totalAmount ?? 0,
  paidAmount: bill.paidAmount ?? 0,
  remainingAmount: bill.remainingAmount ?? bill.totalAmount ?? 0,
  dueDate: bill.dueDate || null,
  issuedAt: bill.issuedAt || null,
  status: bill.status || "pending",
}));
const getVisibleBillCharges = jest.fn((bill) => bill.charges || {});

const makeQueryChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    select: jest.fn(() => chain),
    lean: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
    finally: (handler) => Promise.resolve(result).finally(handler),
  };
  return chain;
};

await jest.unstable_mockModule("../models/index.js", () => ({
  Bill: {
    findOne: billFindOne,
    find: billFind,
    countDocuments: billCountDocuments,
  },
  Reservation: {
    find: reservationFind,
    findById: reservationFindById,
  },
  Room: {},
  User: {
    findOne: userFindOne,
  },
  UtilityPeriod: {
    findOne: utilityPeriodFindOne,
  },
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
  AppError: class AppError extends Error {},
}));

await jest.unstable_mockModule("../config/email.js", () => ({
  sendPaymentApprovedEmail: jest.fn(),
  sendPaymentRejectedEmail: jest.fn(),
}));

await jest.unstable_mockModule("../utils/billingPolicy.js", () => ({
  getBillRemainingAmount: jest.fn((bill) => bill.remainingAmount ?? bill.totalAmount ?? 0),
  getReservationRecurringFees: jest.fn(() => ({
    applianceFees: 0,
    additionalCharges: [],
  })),
  getVisibleBillCharges,
  getVisibleBillSnapshot,
  isUtilityChargeVisible: jest.fn(() => false),
  getReservationCreditAvailable: jest.fn(() => 0),
  resolveCurrentBillingCycle: jest.fn(() => ({
    billingMonth: new Date("2026-03-05T00:00:00.000Z"),
    billingCycleStart: new Date("2026-03-05T00:00:00.000Z"),
    billingCycleEnd: new Date("2026-04-05T00:00:00.000Z"),
    dueDate: new Date("2026-04-05T00:00:00.000Z"),
  })),
  resolveBillStatus: jest.fn((bill) => bill.status || "pending"),
  roundMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
  syncBillAmounts: jest.fn(),
}));

await jest.unstable_mockModule("../utils/businessSettings.js", () => ({
  getPenaltyRatePerDay: jest.fn(async () => 50),
}));

await jest.unstable_mockModule("../utils/utilityBillFlow.js", () => ({
  sendDraftUtilityBills: jest.fn(),
}));

await jest.unstable_mockModule("../utils/utilityFlowRules.js", () => ({
  isWaterBillableRoom: jest.fn(() => true),
}));

await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => ({
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  readMoveInDate: (reservation) => reservation.moveInDate || reservation.checkInDate || null,
}));

await jest.unstable_mockModule("../utils/adminAccess.js", () => ({
  resolveAdminAccessContext: jest.fn(async () => ({
    isOwner: false,
    branch: "gil-puyat",
  })),
}));

const {
  getBillingHistory,
  getCurrentBilling,
  getMyBills,
} = await import("./billingController.js");

function createRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.payload = payload;
      return this;
    }),
  };
}

describe("billingController tenant endpoints", () => {
  beforeEach(() => {
    userFindOne.mockReset();
    reservationFind.mockReset();
    reservationFindById.mockReset();
    billFindOne.mockReset();
    billFind.mockReset();
    billCountDocuments.mockReset();
    utilityPeriodFindOne.mockReset();
    getVisibleBillSnapshot.mockClear();
    getVisibleBillCharges.mockClear();
  });

  test("getCurrentBilling falls back to the latest bill for the active reservation and returns additionalCharges", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    reservationFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "reservation-1",
          moveInDate: new Date("2026-01-05T00:00:00.000Z"),
        },
      ]),
    );

    billFindOne
      .mockReturnValueOnce(makeQueryChain(null))
      .mockReturnValueOnce(
        makeQueryChain({
          _id: "bill-1",
          reservationId: "reservation-1",
          billingCycleStart: new Date("2026-02-05T00:00:00.000Z"),
          billingCycleEnd: new Date("2026-03-05T00:00:00.000Z"),
          dueDate: new Date("2026-03-05T00:00:00.000Z"),
          charges: { rent: 5500, applianceFees: 500, electricity: 0, water: 0 },
          additionalCharges: [{ name: "Aircon", amount: 500 }],
          grossAmount: 6000,
          totalAmount: 6000,
          remainingAmount: 6000,
          status: "pending",
        }),
      );

    const req = { user: { uid: "firebase-1", branch: "gil-puyat" } };
    const res = createRes();
    const next = jest.fn();

    await getCurrentBilling(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(billFindOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reservationId: "reservation-1",
        status: { $ne: "draft" },
        isArchived: false,
        billingCycleStart: { $lte: expect.any(Date) },
        billingCycleEnd: { $gt: expect.any(Date) },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        billingCycleStart: expect.any(Date),
        billingCycleEnd: expect.any(Date),
        additionalCharges: [{ name: "Aircon", amount: 500 }],
      }),
    );
  });

  test("getBillingHistory queries by bill ownership instead of reservation branch and returns recurring fee lines", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    billFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "bill-history-1",
          userId: "user-1",
          billingMonth: new Date("2026-03-05T00:00:00.000Z"),
          billingCycleStart: new Date("2026-03-05T00:00:00.000Z"),
          billingCycleEnd: new Date("2026-04-05T00:00:00.000Z"),
          dueDate: new Date("2026-04-05T00:00:00.000Z"),
          charges: { rent: 5500, applianceFees: 350, electricity: 0, water: 0 },
          additionalCharges: [{ name: "Locker", amount: 350 }],
          grossAmount: 5850,
          totalAmount: 5850,
          remainingAmount: 2000,
          paidAmount: 3850,
          status: "partially-paid",
          paymentDate: null,
        },
      ]),
    );

    const req = { user: { uid: "firebase-1", branch: "gil-puyat" }, query: {} };
    const res = createRes();
    const next = jest.fn();

    await getBillingHistory(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(reservationFind).not.toHaveBeenCalled();
    expect(billFind).toHaveBeenCalledWith({
      userId: "user-1",
      status: { $ne: "draft" },
      isArchived: false,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
        bills: [
          expect.objectContaining({
            billingCycleStart: expect.any(Date),
            billingCycleEnd: expect.any(Date),
            additionalCharges: [{ name: "Locker", amount: 350 }],
          }),
        ],
      }),
    );
  });

  test("getMyBills includes additionalCharges in the tenant bill payload", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    billFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "bill-my-1",
          userId: "user-1",
          roomId: { name: "Room 201", branch: "gil-puyat", type: "private" },
          billingMonth: new Date("2026-03-12T00:00:00.000Z"),
          billingCycleStart: new Date("2026-03-12T00:00:00.000Z"),
          billingCycleEnd: new Date("2026-04-12T00:00:00.000Z"),
          dueDate: new Date("2026-04-12T00:00:00.000Z"),
          charges: { rent: 5200, applianceFees: 250, electricity: 0, water: 0 },
          additionalCharges: [{ name: "Desk Rental", amount: 250 }],
          grossAmount: 5450,
          totalAmount: 5450,
          remainingAmount: 5450,
          paidAmount: 0,
          status: "pending",
          paymentProof: { verificationStatus: "none" },
          penaltyDetails: { daysLate: 0 },
          createdAt: new Date("2026-03-12T00:00:00.000Z"),
        },
      ]),
    );

    const req = { user: { uid: "firebase-1" } };
    const res = createRes();
    const next = jest.fn();

    await getMyBills(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      bills: [
        expect.objectContaining({
          additionalCharges: [{ name: "Desk Rental", amount: 250 }],
          billingCycleStart: expect.any(Date),
          billingCycleEnd: expect.any(Date),
        }),
      ],
    });
  });
});
