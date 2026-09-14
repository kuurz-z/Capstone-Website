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

await jest.unstable_mockModule("../../models/index.js", () => {
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
    AuditLog: { create: jest.fn().mockResolvedValue({}) },
    Reservation: {
      find: reservationFind,
    },
    User: {},
    TenantCredit: {
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        session: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      })),
      findOne: jest.fn(() => ({ session: jest.fn().mockResolvedValue(null) })),
      create: jest.fn(),
    },
  };
});

await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule("../notifications/notificationService.js", () => ({
  default: notify,
}));

await jest.unstable_mockModule("../../config/email.js", () => ({
  sendBillGeneratedEmail: jest.fn(async () => ({ success: true })),
}));

await jest.unstable_mockModule("../../utils/lifecycleNaming.js", () => ({
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

describe("services/billing/rentGenerator", () => {
  beforeEach(() => {
    reservationFind.mockReset();
    billFindOne.mockReset();
    billInstances.length = 0;
    notify.billGenerated.mockReset();
  });

  test("skips rent generation until the bill reaches its generation day", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-31T00:00:00.000Z"),
    });

    reservationFind.mockReturnValue(makePopulateChain([reservation]));

    await generateAutomatedRentBills({
      now: new Date("2026-01-28T00:00:00.000Z"),
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
      now: new Date("2026-02-04T00:00:00.000Z"),
    });

    expect(billInstances).toHaveLength(0);
    expect(notify.billGenerated).not.toHaveBeenCalled();
  });

  test("creates a bill on the tenant-specific generation date", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-05T00:00:00.000Z"),
    });

    billFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-02-19T00:00:00.000Z"),
      dryRun: false,
      notifyTenant: true,
      requireGenerationDateMatch: true,
    });

    expect(result.status).toBe("created");
    expect(billInstances).toHaveLength(1);
    expect(localYmd(billInstances[0].billingCycleStart)).toBe("2026-3-5");
    expect(localYmd(billInstances[0].billingCycleEnd)).toBe("2026-4-5");
    expect(localYmd(billInstances[0].dueDate)).toBe("2026-3-5");
    expect(notify.billGenerated).toHaveBeenCalledTimes(1);

    // Regression (bill-release notification audit): this cron-generation
    // path previously called notify.billGenerated() with no options object
    // at all, so the resulting push payload's billing_id was empty and
    // tapping it fell back to the generic Billing tab instead of this
    // specific bill. billId/billType must now be passed through.
    const [, , , , options] = notify.billGenerated.mock.calls[0];
    expect(options).toMatchObject({ billType: "rent" });
    expect(options).toHaveProperty("billId");
    expect(options.actionUrl).toEqual(expect.stringContaining("/bill-details?billId="));
  });

  test("does not bill the advance-covered first month for a structured Reservation", async () => {
    const reservation = createReservation({
      financialWorkflowVersion: "structured-initial-payment-v1",
      moveInDate: new Date("2026-03-23T00:00:00.000Z"),
      advanceCoverageStart: new Date("2026-03-23T00:00:00.000Z"),
      advanceCoverageEndExclusive: new Date("2026-04-23T00:00:00.000Z"),
      nextRegularBillingDate: new Date("2026-04-23T00:00:00.000Z"),
      pricingSnapshot: { finalMonthlyRate: 6300 },
      pricingSnapshotVersion: 1,
    });

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-03-23T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "skipped", reason: "advance_period_covered" });
    expect(billInstances).toHaveLength(0);
  });

  test("creates the full-rate first regular Bill for the second rental month", async () => {
    const reservation = createReservation({
      financialWorkflowVersion: "structured-initial-payment-v1",
      moveInDate: new Date("2026-03-23T00:00:00.000Z"),
      advanceCoverageStart: new Date("2026-03-23T00:00:00.000Z"),
      advanceCoverageEndExclusive: new Date("2026-04-23T00:00:00.000Z"),
      nextRegularBillingDate: new Date("2026-04-23T00:00:00.000Z"),
      pricingSnapshot: { finalMonthlyRate: 6300 },
      pricingSnapshotVersion: 1,
      reservationCreditConsumedAt: null,
    });
    billFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-04-09T00:00:00.000Z"),
      notifyTenant: false,
      requireGenerationDateMatch: true,
    });

    expect(result.status).toBe("created");
    expect(billInstances).toHaveLength(1);
    expect(localYmd(billInstances[0].billingCycleStart)).toBe("2026-4-23");
    expect(localYmd(billInstances[0].billingCycleEnd)).toBe("2026-5-23");
    expect(localYmd(billInstances[0].dueDate)).toBe("2026-4-23");
    expect(billInstances[0].charges.rent).toBe(6300);
    expect(billInstances[0].totalAmount).toBe(6300);
    expect(billInstances[0].reservationCreditApplied).toBe(0);
    expect(billInstances[0].structuredWorkflowVersion).toBe(
      "structured-initial-payment-v1",
    );
  });

  test("blocks structured rent generation when coverage was not finalized", async () => {
    const reservation = createReservation({
      financialWorkflowVersion: "structured-initial-payment-v1",
      pricingSnapshot: { finalMonthlyRate: 6300 },
    });
    await expect(ensureCurrentCycleRentBill({ reservation })).resolves.toEqual({
      status: "blocked",
      reason: "structured_advance_coverage_missing",
    });
    expect(billInstances).toHaveLength(0);
  });

  // Phase 2B renewal-cutover regression: rentGenerator itself has no
  // renewal awareness — it always reads whatever reservation.monthlyRent
  // currently is at generation time. Correctness for a pending renewal
  // therefore depends entirely on WHEN that field changes, which is now
  // contractRenewalActivationService's job (at the successor Contract's
  // leaseStartDate), not renewStayWorkflow's (at acceptance). These two
  // tests lock in the two halves of that contract: an already-generated
  // Bill is immutable even if the Reservation's rate changes later, and a
  // bill generated for a later cycle picks up whatever rate is current at
  // ITS generation time.
  test("an already-generated Bill's rent is immutable even if reservation.monthlyRent changes afterward", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-05T00:00:00.000Z"),
      monthlyRent: 6300,
    });
    billFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-02-26T00:00:00.000Z"),
    });

    expect(result.status).toBe("created");
    expect(billInstances[0].charges.rent).toBe(6300);

    // Simulates the renewal's effective-date cutover happening AFTER this
    // bill was already generated — the historical bill must not retroactively
    // change.
    reservation.monthlyRent = 6800;
    expect(billInstances[0].charges.rent).toBe(6300);
  });

  test("a bill generated for a later cycle uses whichever rate is current at ITS generation time (post-cutover rate applies going forward, not retroactively)", async () => {
    const reservation = createReservation({
      moveInDate: new Date("2026-01-05T00:00:00.000Z"),
      monthlyRent: 6300,
    });

    billFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const beforeCutover = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-02-26T00:00:00.000Z"),
    });
    expect(beforeCutover.status).toBe("created");
    expect(billInstances[0].charges.rent).toBe(6300);

    // Renewal effective-date cutover: contractRenewalActivationService
    // applies the successor Contract's approvedMonthlyRate to
    // reservation.monthlyRent exactly once, atomically, at leaseStartDate.
    reservation.monthlyRent = 6800;

    billFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const afterCutover = await ensureCurrentCycleRentBill({
      reservation,
      referenceDate: new Date("2026-03-26T00:00:00.000Z"),
    });

    expect(afterCutover.status).toBe("created");
    expect(billInstances[1].charges.rent).toBe(6800);
    // The earlier bill remains untouched.
    expect(billInstances[0].charges.rent).toBe(6300);
  });
});
