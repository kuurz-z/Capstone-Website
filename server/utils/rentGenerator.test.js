import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFind = jest.fn();
const billCountDocuments = jest.fn();
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
  Bill.countDocuments = billCountDocuments;
  Bill.findOne = billFindOne;

  return {
    Bill,
    Reservation: {
      find: reservationFind,
    },
    Room: {},
    User: {},
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

await jest.unstable_mockModule("./businessSettings.js", () => ({
  getPenaltyRatePerDay: jest.fn(async () => 50),
}));

await jest.unstable_mockModule("./lifecycleNaming.js", () => ({
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  readMoveInDate: (reservation) => reservation.moveInDate || null,
}));

const { generateAutomatedRentBills } = await import("./rentGenerator.js");

const localYmd = (date) => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
].join("-");

describe("generateAutomatedRentBills", () => {
  beforeEach(() => {
    reservationFind.mockReset();
    billCountDocuments.mockReset();
    billFindOne.mockReset();
    billInstances.length = 0;
    notify.billGenerated.mockReset();
  });

  test("skips rent generation until the due date is five days away", async () => {
    const reservation = {
      _id: "reservation-1",
      userId: { _id: "user-1", email: "tenant@example.com" },
      roomId: {
        _id: "room-1",
        branch: "gil-puyat",
        monthlyPrice: 5500,
        price: 5500,
        type: "private",
      },
      moveInDate: new Date("2026-01-31T00:00:00.000Z"),
      monthlyRent: null,
      totalPrice: null,
      customCharges: [],
    };

    reservationFind.mockReturnValue(makePopulateChain([reservation]));
    billCountDocuments.mockResolvedValue(0);
    billFindOne.mockResolvedValue(null);

    await generateAutomatedRentBills({ now: new Date("2026-02-10T00:00:00.000Z") });

    expect(billInstances).toHaveLength(0);
    expect(notify.billGenerated).not.toHaveBeenCalled();
  });

  test("uses the tenant move-in cycle for due dates when force-running rent generation", async () => {
    const reservation = {
      _id: "reservation-2",
      userId: { _id: "user-2", email: "tenant2@example.com" },
      roomId: {
        _id: "room-2",
        branch: "gil-puyat",
        monthlyPrice: 5500,
        price: 5500,
        type: "private",
      },
      moveInDate: new Date("2026-01-31T00:00:00.000Z"),
      monthlyRent: null,
      totalPrice: null,
      customCharges: [],
    };

    reservationFind.mockReturnValue(makePopulateChain([reservation]));
    billCountDocuments.mockResolvedValue(0);
    billFindOne.mockResolvedValue(null);

    await generateAutomatedRentBills({
      force: true,
      now: new Date("2026-02-10T00:00:00.000Z"),
    });

    expect(billInstances).toHaveLength(1);
    expect(localYmd(billInstances[0].billingMonth)).toBe("2026-1-31");
    expect(localYmd(billInstances[0].billingCycleEnd)).toBe("2026-2-28");
    expect(localYmd(billInstances[0].dueDate)).toBe("2026-2-28");
    expect(notify.billGenerated).toHaveBeenCalledWith(
      "user-2",
      "January 2026",
      expect.any(Number),
      "February 28, 2026",
    );
  });
});