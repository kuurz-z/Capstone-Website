import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const applyBillPayment = jest.fn();
const syncStructuredReservationAfterBillSettlement = jest.fn();
const ReservationFindById = jest.fn();
const BillFindById = jest.fn();
const BillFindOne = jest.fn();

await jest.unstable_mockModule("./paymentLedger.js", () => ({
  applyBillPayment,
}));

await jest.unstable_mockModule("../structuredInitialPaymentService.js", () => ({
  syncStructuredReservationAfterBillSettlement,
  quarantineStructuredSettlementMismatch: jest.fn(),
}));

await jest.unstable_mockModule("../../models/index.js", () => ({
  Reservation: {
    findById: ReservationFindById,
  },
  Bill: {
    findById: BillFindById,
    findOne: BillFindOne,
  },
  AuditLog: {
    create: jest.fn(),
  },
  Payment: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
}));

const { settleInitialMoveInOnCheckIn } = await import("./billSettlement.js");

describe("settleInitialMoveInOnCheckIn", () => {
  beforeEach(() => {
    applyBillPayment.mockReset();
    syncStructuredReservationAfterBillSettlement.mockReset();
    ReservationFindById.mockReset();
    BillFindById.mockReset();
    BillFindOne.mockReset();
  });

  test("settles a pending initial_payment bill and syncs reservation to paid_in_full", async () => {
    const mockReservation = {
      _id: "66bc00000000000000000001",
      userId: "66bc00000000000000000002",
      initialPaymentBillId: "66bc00000000000000000003",
      initialPaymentStatus: "pending",
      paymentStatus: "pending",
      isMoveInSettled: false,
      save: jest.fn().mockResolvedValue(true),
    };

    const mockBill = {
      _id: "66bc00000000000000000003",
      reservationId: "66bc00000000000000000001",
      userId: "66bc00000000000000000002",
      billType: "initial_payment",
      totalAmount: 10600,
      remainingAmount: 10600,
      paidAmount: 0,
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
    };

    ReservationFindById.mockResolvedValue(mockReservation);
    BillFindById.mockResolvedValue(mockBill);
    applyBillPayment.mockImplementation(async ({ bill, amount }) => {
      bill.status = "paid";
      bill.remainingAmount = 0;
      bill.paidAmount = amount;
      return {
        bill,
        payment: { _id: "66bc00000000000000000004", amount },
        appliedAmount: amount,
      };
    });

    const result = await settleInitialMoveInOnCheckIn({
      reservation: mockReservation,
      actorId: "admin-user-id",
      paymentMethod: "offline_cash",
    });

    expect(result.settled).toBe(true);
    expect(mockBill.status).toBe("paid");
    expect(mockBill.remainingAmount).toBe(0);
    expect(mockBill.paidAmount).toBe(10600);
    expect(mockReservation.initialPaymentStatus).toBe("paid");
    expect(mockReservation.paymentStatus).toBe("paid_in_full");
    expect(mockReservation.isMoveInSettled).toBe(true);
    expect(syncStructuredReservationAfterBillSettlement).toHaveBeenCalledWith(mockBill);
  });

  test("returns already_paid if bill is already settled", async () => {
    const mockReservation = {
      _id: "66bc00000000000000000001",
      initialPaymentBillId: "66bc00000000000000000003",
    };

    const mockBill = {
      _id: "66bc00000000000000000003",
      billType: "initial_payment",
      totalAmount: 10600,
      remainingAmount: 0,
      paidAmount: 10600,
      status: "paid",
    };

    ReservationFindById.mockResolvedValue(mockReservation);
    BillFindById.mockResolvedValue(mockBill);

    const result = await settleInitialMoveInOnCheckIn({
      reservation: mockReservation,
    });

    expect(result.settled).toBe(false);
    expect(result.reason).toBe("already_paid");
  });

  test("normalizes legacy cash paymentMethod to offline_cash and avoids redundant bill save", async () => {
    const mockReservation = {
      _id: "66bc00000000000000000001",
      userId: "66bc00000000000000000002",
      initialPaymentBillId: "66bc00000000000000000003",
      initialPaymentStatus: "pending",
      paymentStatus: "pending",
      isMoveInSettled: false,
      save: jest.fn().mockResolvedValue(true),
    };

    const mockBill = {
      _id: "66bc00000000000000000003",
      reservationId: "66bc00000000000000000001",
      billType: "initial_payment",
      totalAmount: 10600,
      remainingAmount: 10600,
      paidAmount: 0,
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
    };

    ReservationFindById.mockResolvedValue(mockReservation);
    BillFindById.mockResolvedValue(mockBill);
    applyBillPayment.mockResolvedValue({
      bill: mockBill,
      payment: { _id: "66bc00000000000000000004", amount: 10600 },
      appliedAmount: 10600,
    });

    await settleInitialMoveInOnCheckIn({
      reservation: mockReservation,
      actorId: "admin-user-id",
      paymentMethod: "cash",
    });

    expect(applyBillPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "offline_cash",
      }),
    );
    expect(mockBill.save).not.toHaveBeenCalled();
  });
});


test('an omitted method does not fabricate a cash payment on check-in', async () => {
  const invoice = { status: 'pending', totalAmount: 100, remainingAmount: 100 };
  const reservation = { _id: '66bc00000000000000000001', initialPaymentBillId: '66bc00000000000000000003' };
  BillFindById.mockResolvedValue(invoice);
  applyBillPayment.mockClear();
  expect(await settleInitialMoveInOnCheckIn({ reservation })).toMatchObject({ settled: false, reason: 'explicit_payment_method_required' });
  expect(applyBillPayment).not.toHaveBeenCalled();
  expect(invoice.remainingAmount).toBe(100);
});
