import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindOne = jest.fn();
const reservationFind = jest.fn();
const reservationFindById = jest.fn();
const billFindOne = jest.fn();
const billFind = jest.fn();
const billFindById = jest.fn();
const billCountDocuments = jest.fn();
const utilityPeriodFindOne = jest.fn();
const ensureCurrentCycleRentBill = jest.fn();
const userFindById = jest.fn();
const sendPaymentApprovedEmail = jest.fn();
const sendPaymentRejectedEmail = jest.fn();
const applyBillPayment = jest.fn();

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
    findById: billFindById,
    countDocuments: billCountDocuments,
  },
  Reservation: {
    find: reservationFind,
    findById: reservationFindById,
  },
  Room: {},
  User: {
    findOne: userFindOne,
    findById: userFindById,
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
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
}));

await jest.unstable_mockModule("../utils/paymentLedger.js", () => ({
  applyBillPayment,
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
  resolveCurrentRentBillingCycle: jest.fn(() => ({
    billingMonth: new Date("2026-03-05T00:00:00.000Z"),
    billingCycleStart: new Date("2026-03-05T00:00:00.000Z"),
    billingCycleEnd: new Date("2026-04-05T00:00:00.000Z"),
    dueDate: new Date("2026-04-07T00:00:00.000Z"),
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

await jest.unstable_mockModule("../utils/rentGenerator.js", () => ({
  ensureCurrentCycleRentBill,
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
  markBillAsPaid,
  submitPaymentProof,
  verifyPayment,
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
    billFindById.mockReset();
    billCountDocuments.mockReset();
    utilityPeriodFindOne.mockReset();
    ensureCurrentCycleRentBill.mockReset();
    userFindById.mockReset();
    sendPaymentApprovedEmail.mockReset();
    sendPaymentRejectedEmail.mockReset();
    applyBillPayment.mockReset();
    sendPaymentApprovedEmail.mockResolvedValue({ success: true });
    sendPaymentRejectedEmail.mockResolvedValue({ success: true });
    getVisibleBillSnapshot.mockClear();
    getVisibleBillCharges.mockClear();
  });

  test("getCurrentBilling falls back to the latest bill for the active reservation and returns additionalCharges", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    ensureCurrentCycleRentBill.mockResolvedValue({ status: "skipped" });
    reservationFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "reservation-1",
          moveInDate: new Date("2026-01-05T00:00:00.000Z"),
          userId: {
            _id: "user-1",
            email: "tenant@example.com",
          },
          roomId: {
            _id: "room-1",
            branch: "gil-puyat",
            price: 5500,
            monthlyPrice: 5500,
          },
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
    ensureCurrentCycleRentBill.mockResolvedValue({ status: "skipped" });
    reservationFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "reservation-1",
          moveInDate: new Date("2026-03-12T00:00:00.000Z"),
          userId: {
            _id: "user-1",
            email: "tenant@example.com",
          },
          roomId: {
            _id: "room-1",
            branch: "gil-puyat",
            price: 5200,
            monthlyPrice: 5200,
          },
        },
      ]),
    );
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
          paymentFlow: expect.objectContaining({
            primary: "online_checkout",
            manualProofSubmissionEnabled: false,
            adminManualSettlementScope: "offline-only",
          }),
        }),
      ],
    });
  });

  test("getMyBills self-heals the active tenant's missing current rent bill before reading invoices", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    reservationFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "reservation-1",
          moveInDate: new Date("2026-03-12T00:00:00.000Z"),
          userId: {
            _id: "user-1",
            email: "tenant@example.com",
          },
          roomId: {
            _id: "room-1",
            branch: "gil-puyat",
            price: 5200,
            monthlyPrice: 5200,
          },
        },
      ]),
    );
    ensureCurrentCycleRentBill.mockResolvedValue({ status: "created" });
    billFind.mockReturnValue(makeQueryChain([]));

    const req = { user: { uid: "firebase-1" } };
    const res = createRes();
    const next = jest.fn();

    await getMyBills(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(ensureCurrentCycleRentBill).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({ _id: "reservation-1" }),
        referenceDate: expect.any(Date),
        dryRun: false,
        notifyTenant: false,
        requireGenerationDateMatch: false,
      }),
    );
  });

  test("submitPaymentProof rejects new monthly-bill proof uploads and returns online-checkout guidance", async () => {
    userFindOne.mockReturnValue(makeQueryChain({ _id: "user-1" }));
    billFindById.mockResolvedValue({
      _id: "bill-proof-disabled-1",
      userId: "user-1",
      totalAmount: 2450,
      remainingAmount: 2450,
      status: "pending",
      paymentProof: { verificationStatus: "none" },
    });

    const req = {
      params: { billId: "bill-proof-disabled-1" },
      body: {},
      user: { uid: "firebase-1" },
    };
    const res = createRes();
    const next = jest.fn();

    await submitPaymentProof(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("online checkout"),
        bill: expect.objectContaining({
          id: "bill-proof-disabled-1",
          paymentFlow: expect.objectContaining({
            primary: "online_checkout",
            manualProofSubmissionEnabled: false,
            onlineCheckoutEligible: true,
          }),
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("markBillAsPaid writes a manual ledger payment and preserves the bill note", async () => {
    const bill = {
      _id: "bill-admin-1",
      branch: "gil-puyat",
      remainingAmount: 1200,
      totalAmount: 1200,
      toObject: jest.fn(() => ({ _id: "bill-admin-1", notes: "GCash received at desk" })),
      save: jest.fn(async function save() {
        return this;
      }),
    };

    billFindById.mockResolvedValue(bill);
    applyBillPayment.mockResolvedValue({ bill, appliedAmount: 1200 });

    const req = {
      params: { billId: "bill-admin-1" },
      body: { amount: 1200, note: "GCash received at desk" },
      user: { uid: "firebase-admin" },
    };
    const res = createRes();
    const next = jest.fn();

    await markBillAsPaid(req, res, next);

    expect(applyBillPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        bill,
        amount: 1200,
        method: "gcash",
        source: "admin-manual",
        notes: "GCash received at desk",
        metadata: { action: "markBillAsPaid" },
      }),
    );
    expect(bill.notes).toBe("GCash received at desk");
    expect(bill.save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      bill: { _id: "bill-admin-1", notes: "GCash received at desk" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("verifyPayment approval records a tenant-proof ledger entry with the proof image", async () => {
    const bill = {
      _id: "bill-proof-1",
      branch: "gil-puyat",
      userId: "user-1",
      billingMonth: new Date("2026-03-01T00:00:00.000Z"),
      status: "pending",
      paymentProof: {
        imageUrl: "https://example.com/proof.png",
        submittedAmount: 1500,
        verificationStatus: "pending-verification",
      },
      save: jest.fn(async function save() {
        return this;
      }),
    };

    billFindById.mockResolvedValue(bill);
    applyBillPayment.mockResolvedValue({ bill, appliedAmount: 1500 });
    userFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        email: "tenant@example.com",
        firstName: "Proof",
        lastName: "Tenant",
      }),
    });

    const req = {
      params: { billId: "bill-proof-1" },
      body: { action: "approve" },
      user: { uid: "firebase-admin" },
    };
    const res = createRes();
    const next = jest.fn();

    await verifyPayment(req, res, next);

    expect(applyBillPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        bill,
        amount: 1500,
        method: "bank",
        source: "tenant-proof",
        proofImageUrl: "https://example.com/proof.png",
        metadata: {
          action: "verifyPayment",
          verificationAction: "approve",
        },
      }),
    );
    expect(bill.paymentProof.verificationStatus).toBe("approved");
    expect(sendPaymentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 1500 }),
    );
    expect(res.json).toHaveBeenCalledWith({
      message: "Payment approved successfully",
      bill: {
        id: "bill-proof-1",
        status: "pending",
        paymentProof: bill.paymentProof,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
