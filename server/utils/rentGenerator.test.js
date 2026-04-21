import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFind = jest.fn();
const billFindOne = jest.fn();
const billInstances = [];
const notify = {
  billGenerated: jest.fn(),
};

const makePopulateChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
    finally: (handler) => Promise.resolve(result).finally(handler),
  };
  return chain;
};

await jest.unstable_mockModule("../models/index.js", () => {
  const Bill = jest.fn().mockImplementation(function Bill(doc) {
    Object.assign(this, doc);
    this.save = jest.fn(async function save() {
      return this;
    });
    billInstances.push(this);
    return this;
  });
  Bill.findOne = billFindOne;

  return {
    Bill,
    Reservation: {
      find: reservationFind,
    },
  };
});

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule("./notificationService.js", () => ({
  default: notify,
}));

await jest.unstable_mockModule("./lifecycleNaming.js", () => ({
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  readMoveInDate: (reservation) => reservation.moveInDate || reservation.checkInDate || null,
}));

const {
  ensureCurrentCycleRentBill,
  generateAutomatedRentBills,
} = await import("./rentGenerator.js");

const localYmd = (date) => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
].join("-");

const createReservation = (overrides = {}) => ({
  _id: "reservation-1",
  userId: { _id: "user-1", email: "tenant@example.com" },
  roomId: {
    _id: "room-1",
    branch: "gil-puyat",
    monthlyPrice: 5500,
    price: 5500,
    type: "private",
  },
  moveInDate: new Date("2026-01-05T00:00:00.000Z"),
  monthlyRent: null,
  totalPrice: null,
  customCharges: [],
  applianceFees: 0,
  paymentStatus: "pending",
  save: jest.fn(async function save() {
    return this;
  }),
  ...overrides,
});

describe("generateAutomatedRentBills", () => {
  beforeEach(() => {
    reservationFind.mockReset();
    billFindOne.mockReset();
    billInstances.length = 0;
    notify.billGenerated.mockReset();
  });

  test("skips rent generation until the tenant reaches the cycle start date", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-31T00:00:00.000Z"),
    });

    reservationFind.mockReturnValue(makePopulateChain([reservation]));

    await generateAutomatedRentBills({
      now: new Date("2026-02-10T00:00:00.000Z"),
    });

    expect(billFindOne).not.toHaveBeenCalled();
    expect(billInstances).toHaveLength(0);
    expect(notify.billGenerated).not.toHaveBeenCalled();
  });

  test("does not generate a duplicate bill when the current cycle already exists", async () => {
    const reservation = createReservation();

    reservationFind.mockReturnValue(makePopulateChain([reservation]));
    billFindOne.mockResolvedValueOnce({ _id: "existing-cycle-bill" });

    await generateAutomatedRentBills({
      now: new Date("2026-02-05T00:00:00.000Z"),
    });

    expect(billInstances).toHaveLength(0);
    expect(notify.billGenerated).not.toHaveBeenCalled();
  });
});

describe("ensureCurrentCycleRentBill", () => {
  beforeEach(() => {
    reservationFind.mockReset();
    billFindOne.mockReset();
    billInstances.length = 0;
    notify.billGenerated.mockReset();
  });

  test.each([
    ["2026-01-05T00:00:00.000Z", "2026-03-05T00:00:00.000Z", "2026-3-5", "2026-4-5"],
    ["2026-01-12T00:00:00.000Z", "2026-03-12T00:00:00.000Z", "2026-3-12", "2026-4-12"],
    ["2026-01-23T00:00:00.000Z", "2026-03-23T00:00:00.000Z", "2026-3-23", "2026-4-23"],
  ])(
    "creates a bill on the tenant-specific cycle start for move-in %s",
    async (moveInDate, referenceDate, expectedStart, expectedEnd) => {
      const reservation = createReservation({
        moveInDate: new Date(moveInDate),
      });

      billFindOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await ensureCurrentCycleRentBill({
        reservation,
        referenceDate: new Date(referenceDate),
        dryRun: false,
        notifyTenant: true,
        requireCycleStartMatch: true,
      });

      expect(result.status).toBe("created");
      expect(billInstances).toHaveLength(1);
      expect(localYmd(billInstances[0].billingCycleStart)).toBe(expectedStart);
      expect(localYmd(billInstances[0].billingCycleEnd)).toBe(expectedEnd);
      expect(localYmd(billInstances[0].dueDate)).toBe(expectedEnd);
      expect(notify.billGenerated).toHaveBeenCalledTimes(1);
    },
  );

  test("includes recurring custom charges in both appliance total and named line items", async () => {
    const reservation = createReservation({
      customCharges: [
        { name: "Aircon", amount: 500 },
        { name: "Locker", amount: 200 },
      ],
    });

    billFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-02-05T00:00:00.000Z"),
      dryRun: false,
      notifyTenant: false,
      requireCycleStartMatch: true,
    });

    expect(result.status).toBe("created");
    expect(billInstances[0].charges.applianceFees).toBe(700);
    expect(billInstances[0].additionalCharges).toEqual([
      { name: "Aircon", amount: 500 },
      { name: "Locker", amount: 200 },
    ]);
  });

  test("falls back to the legacy applianceFees field when recurring custom charges are absent", async () => {
    const reservation = createReservation({
      customCharges: [],
      applianceFees: 900,
    });

    billFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-02-05T00:00:00.000Z"),
      dryRun: false,
      notifyTenant: false,
      requireCycleStartMatch: true,
    });

    expect(result.status).toBe("created");
    expect(billInstances[0].charges.applianceFees).toBe(900);
    expect(billInstances[0].additionalCharges).toEqual([
      { name: "Appliance Fees", amount: 900 },
    ]);
  });

  test("previews the missing current cycle during backfill without creating historical cycles", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-05T00:00:00.000Z"),
    });

    billFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-03-20T00:00:00.000Z"),
      dryRun: true,
      notifyTenant: false,
      requireCycleStartMatch: false,
    });

    expect(result.status).toBe("preview");
    expect(localYmd(result.cycle.billingCycleStart)).toBe("2026-3-5");
    expect(localYmd(result.cycle.billingCycleEnd)).toBe("2026-4-5");
    expect(localYmd(result.bill.billingCycleStart)).toBe("2026-3-5");
    expect(notify.billGenerated).not.toHaveBeenCalled();
  });
});
