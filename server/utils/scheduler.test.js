import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFind = jest.fn();
const roomFind = jest.fn();
const billUpdateMany = jest.fn();
const billFind = jest.fn();
const syncReservationUserLifecycle = jest.fn();
const updateOccupancyOnReservationChange = jest.fn();
const resolveBillStatus = jest.fn((bill) => bill.status);
const syncBillAmounts = jest.fn();
const getLifecyclePolicySettings = jest.fn(async () => ({
  noShowGraceDays: 7,
  stalePendingHours: 2,
  staleVisitPendingHours: 336,
  visitPendingWarnDays: 12,
  staleVisitApprovedHours: 48,
  stalePaymentPendingHours: 48,
  archiveCancelledAfterDays: 7,
}));
const getPenaltyRatePerDay = jest.fn(async () => 50);
const resolvePenaltyRatePerDay = jest.fn((rate) => rate || 50);
const dispatchDueScheduledAnnouncements = jest.fn();
const notify = {
  reservationExpired: jest.fn(),
  reservationNoShow: jest.fn(),
  penaltyApplied: jest.fn(),
  billDueReminder: jest.fn(),
};

const makePopulateChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    lean: jest.fn(() => chain),
    select: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
    finally: (handler) => Promise.resolve(result).finally(handler),
  };
  return chain;
};

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: {
    find: reservationFind,
  },
  Room: {
    find: roomFind,
  },
  Bill: {
    updateMany: billUpdateMany,
    find: billFind,
  },
  User: {},
}));

await jest.unstable_mockModule("../utils/reservationHelpers.js", () => ({
  syncReservationUserLifecycle,
}));

await jest.unstable_mockModule("./notificationService.js", () => ({
  default: notify,
}));

await jest.unstable_mockModule("./occupancyManager.js", () => ({
  updateOccupancyOnReservationChange,
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth: jest.fn(() => null),
}));

await jest.unstable_mockModule("./billingPolicy.js", () => ({
  resolveBillStatus,
  syncBillAmounts,
}));

await jest.unstable_mockModule("./businessSettings.js", () => ({
  getLifecyclePolicySettings,
  getPenaltyRatePerDay,
  resolvePenaltyRatePerDay,
}));

await jest.unstable_mockModule("./rentGenerator.js", () => ({
  generateAutomatedRentBills: jest.fn(),
}));

await jest.unstable_mockModule("./announcementDispatch.js", () => ({
  dispatchDueScheduledAnnouncements,
}));

await jest.unstable_mockModule("./lifecycleNaming.js", () => ({
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  readMoveInDate: (reservation) => reservation.moveInDate || null,
}));

const scheduler = await import("./scheduler.js");

const createReservation = (overrides = {}) => ({
  _id: "reservation-1",
  userId: { _id: "user-1" },
  roomId: { _id: "room-1", name: "Room 1" },
  status: "pending",
  notes: "",
  selectedBed: { id: "bed-1" },
  targetMoveInDate: new Date("2026-04-01T00:00:00.000Z"),
  moveInExtendedTo: null,
  save: jest.fn(async function save() {
    return this;
  }),
  populate: jest.fn(async function populate() {
    return this;
  }),
  ...overrides,
});

describe("scheduler jobs", () => {
  beforeEach(() => {
    reservationFind.mockReset();
    roomFind.mockReset();
    billUpdateMany.mockReset();
    billFind.mockReset();
    syncReservationUserLifecycle.mockReset();
    updateOccupancyOnReservationChange.mockReset();
    resolveBillStatus.mockReset();
    resolveBillStatus.mockImplementation((bill) => bill.status);
    syncBillAmounts.mockReset();
    getLifecyclePolicySettings.mockReset();
    getLifecyclePolicySettings.mockResolvedValue({
      noShowGraceDays: 7,
      stalePendingHours: 2,
      staleVisitPendingHours: 336,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 48,
      stalePaymentPendingHours: 48,
      archiveCancelledAfterDays: 7,
    });
    getPenaltyRatePerDay.mockReset();
    getPenaltyRatePerDay.mockResolvedValue(50);
    resolvePenaltyRatePerDay.mockReset();
    resolvePenaltyRatePerDay.mockImplementation((rate) => rate || 50);
    dispatchDueScheduledAnnouncements.mockReset();
    notify.reservationExpired.mockReset();
    notify.reservationNoShow.mockReset();
    notify.penaltyApplied.mockReset();
    notify.billDueReminder.mockReset();
  });

  test("expireStaleReservations cancels stale reservations and syncs lifecycle", async () => {
    const reservation = createReservation({
      status: "pending",
      userId: { _id: "user-2" },
      roomId: { _id: "room-2", name: "Room 2" },
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      save: jest.fn(async function save() {
        return this;
      }),
      populate: jest.fn(async function populate() {
        return this;
      }),
    });

    reservationFind
      .mockReturnValueOnce(makePopulateChain([reservation]))
      .mockReturnValueOnce(makePopulateChain([]))
      .mockReturnValueOnce(makePopulateChain([]))
      .mockReturnValueOnce(makePopulateChain([]));
    roomFind.mockResolvedValue([]);

    await scheduler.expireStaleReservations();

    expect(getLifecyclePolicySettings).toHaveBeenCalledTimes(1);
    expect(reservation.status).toBe("cancelled");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(updateOccupancyOnReservationChange).toHaveBeenCalledTimes(1);
    expect(syncReservationUserLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        previousStatus: "pending",
        userId: "user-2",
        roomId: "room-2",
        reservationId: "reservation-1",
        force: true,
      }),
    );
    expect(notify.reservationExpired).toHaveBeenCalledTimes(1);
  });

  test("expireStaleReservations uses configured lifecycle thresholds from business settings", async () => {
    reservationFind
      .mockReturnValueOnce(makePopulateChain([]))
      .mockReturnValueOnce(makePopulateChain([]))
      .mockReturnValueOnce(makePopulateChain([]))
      .mockReturnValueOnce(makePopulateChain([]));
    getLifecyclePolicySettings.mockResolvedValue({
      noShowGraceDays: 7,
      stalePendingHours: 9,
      staleVisitPendingHours: 240,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 72,
      stalePaymentPendingHours: 60,
      archiveCancelledAfterDays: 14,
    });

    await scheduler.expireStaleReservations();

    const pendingCutoff = reservationFind.mock.calls[0][0].createdAt.$lt;
    const visitPendingCutoff = reservationFind.mock.calls[1][0].createdAt.$lt;
    const approvedCutoff = reservationFind.mock.calls[2][0].visitDate.$lt;
    const paymentCutoff = reservationFind.mock.calls[3][0].updatedAt.$lt;

    const diffHours = (date) => (Date.now() - date.getTime()) / (1000 * 60 * 60);

    expect(diffHours(pendingCutoff)).toBeGreaterThan(8.5);
    expect(diffHours(pendingCutoff)).toBeLessThan(9.5);
    expect(diffHours(visitPendingCutoff)).toBeGreaterThan(239.5);
    expect(diffHours(visitPendingCutoff)).toBeLessThan(240.5);
    expect(diffHours(approvedCutoff)).toBeGreaterThan(71.5);
    expect(diffHours(approvedCutoff)).toBeLessThan(72.5);
    expect(diffHours(paymentCutoff)).toBeGreaterThan(59.5);
    expect(diffHours(paymentCutoff)).toBeLessThan(60.5);
  });

  test("cancelNoShowReservations cancels overdue reserved reservations and syncs lifecycle", async () => {
    const reservation = createReservation({
      status: "reserved",
      userId: { _id: "user-3" },
      roomId: { _id: "room-3", name: "Room 3" },
      targetMoveInDate: new Date("2026-03-01T00:00:00.000Z"),
      moveInExtendedTo: null,
      save: jest.fn(async function save() {
        return this;
      }),
      populate: jest.fn(async function populate() {
        return this;
      }),
    });

    reservationFind.mockReturnValue(makePopulateChain([reservation]));
    roomFind.mockResolvedValue([]);

    await scheduler.cancelNoShowReservations();

    expect(getLifecyclePolicySettings).toHaveBeenCalledTimes(1);
    expect(reservation.status).toBe("cancelled");
    expect(reservation.save).toHaveBeenCalledTimes(1);
    expect(updateOccupancyOnReservationChange).toHaveBeenCalledTimes(1);
    expect(syncReservationUserLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        previousStatus: "reserved",
        userId: "user-3",
        roomId: "room-3",
        reservationId: "reservation-1",
        force: true,
      }),
    );
    expect(notify.reservationNoShow).toHaveBeenCalledTimes(1);
  });

  test("cancelNoShowReservations respects the configured no-show grace days", async () => {
    const reservation = createReservation({
      status: "reserved",
      userId: { _id: "user-4" },
      roomId: { _id: "room-4", name: "Room 4" },
      targetMoveInDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      save: jest.fn(async function save() {
        return this;
      }),
      populate: jest.fn(async function populate() {
        return this;
      }),
    });

    reservationFind.mockReturnValue(makePopulateChain([reservation]));
    getLifecyclePolicySettings.mockResolvedValue({
      noShowGraceDays: 10,
      stalePendingHours: 2,
      staleVisitPendingHours: 336,
      visitPendingWarnDays: 12,
      staleVisitApprovedHours: 48,
      stalePaymentPendingHours: 48,
      archiveCancelledAfterDays: 7,
    });

    await scheduler.cancelNoShowReservations();

    expect(reservation.status).toBe("reserved");
    expect(reservation.save).not.toHaveBeenCalled();
    expect(notify.reservationNoShow).not.toHaveBeenCalled();
  });

  test("markOverdueBills only marks records with due dates in the past", async () => {
    billUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    await scheduler.markOverdueBills();

    expect(billUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ["pending", "partially-paid"] },
        dueDate: expect.objectContaining({ $ne: null, $lt: expect.any(Date) }),
        isArchived: false,
      }),
      { $set: { status: "overdue" } },
    );
  });

  test("computeOverduePenalties skips overdue bills that do not have due dates", async () => {
    const noDueDateBill = {
      _id: "bill-1",
      status: "overdue",
      dueDate: null,
      charges: { penalty: 0 },
      penaltyDetails: { ratePerDay: 50, daysLate: 0, appliedAt: null },
      userId: { _id: "user-1" },
      save: jest.fn(async function save() {
        return this;
      }),
    };

    billFind.mockReturnValue(makePopulateChain([noDueDateBill]));

    await scheduler.computeOverduePenalties();

    expect(noDueDateBill.save).not.toHaveBeenCalled();
    expect(syncBillAmounts).not.toHaveBeenCalled();
    expect(notify.penaltyApplied).not.toHaveBeenCalled();
  });

  test("dispatchScheduledAnnouncements runs the scheduled announcement dispatcher", async () => {
    dispatchDueScheduledAnnouncements.mockResolvedValue({
      dueCount: 2,
      dispatchedCount: 1,
    });

    await scheduler.dispatchScheduledAnnouncements();

    expect(dispatchDueScheduledAnnouncements).toHaveBeenCalledTimes(1);
  });
});
