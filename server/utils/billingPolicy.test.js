import { describe, expect, test } from "@jest/globals";
import {
  buildBillingCycle,
  buildRentBillingCycle,
  getReservationRecurringFees,
  getVisibleBillCharges,
  getVisibleBillSnapshot,
  getNextUtilityCycleBoundary,
  getNextWorkingDay,
  getPreviousUtilityCycleBoundary,
  getReservationCreditAvailable,
  isSameUtilityCycleBoundary,
  resolveCurrentBillingCycle,
  resolveUtilityAutoOpenStartDate,
  getUtilityCycleFromPeriod,
  getUtilityDueDate,
  getUtilityIssueDate,
  getUtilityTargetCloseDate,
  resolveBillStatus,
  resolveCurrentRentBillingCycle,
  syncBillAmounts,
} from "./billingPolicy.js";

const localYmd = (date) => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
].join("-");

describe("buildBillingCycle", () => {
  test("anchors the first cycle to the move-in anniversary", () => {
    const cycle = buildBillingCycle(new Date("2026-05-05T00:00:00.000Z"));

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-5-5");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-6-5");
    expect(localYmd(cycle.dueDate)).toBe("2026-6-5");
  });

  test("clamps shorter months when the move-in date is at month end", () => {
    const firstCycle = buildBillingCycle(new Date("2026-01-31T00:00:00.000Z"));
    const secondCycle = buildBillingCycle(new Date("2026-01-31T00:00:00.000Z"), 1);

    expect(localYmd(firstCycle.billingCycleStart)).toBe("2026-1-31");
    expect(localYmd(firstCycle.billingCycleEnd)).toBe("2026-2-28");
    expect(localYmd(secondCycle.billingCycleStart)).toBe("2026-2-28");
    expect(localYmd(secondCycle.billingCycleEnd)).toBe("2026-3-28");
  });
});

describe("buildRentBillingCycle", () => {
  test("sets the rent due date to the 1st day of the cycle start", () => {
    const cycle = buildRentBillingCycle(new Date("2026-05-05T00:00:00.000Z"));

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-5-5");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-6-5");
    expect(localYmd(cycle.dueDate)).toBe("2026-5-5");
    expect(localYmd(cycle.generationDate)).toBe("2026-4-21");
  });

  test("keeps the cycle start due date regardless of weekday", () => {
    const cycle = buildRentBillingCycle(new Date("2026-01-23T00:00:00.000Z"));

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-1-23");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-2-23");
    expect(localYmd(cycle.dueDate)).toBe("2026-1-23");
    expect(localYmd(cycle.generationDate)).toBe("2026-1-9");
  });
});

describe("resolveCurrentBillingCycle", () => {
  test("returns the cycle that contains the provided reference date", () => {
    const cycle = resolveCurrentBillingCycle(
      new Date("2026-01-05T09:00:00.000Z"),
      new Date("2026-03-18T12:30:00.000Z"),
    );

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-3-5");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-4-5");
    expect(localYmd(cycle.dueDate)).toBe("2026-4-5");
    expect(cycle.cycleIndex).toBe(2);
  });

  test("rolls month-end move-ins forward using the same clamped anniversaries as indexed cycles", () => {
    const cycle = resolveCurrentBillingCycle(
      new Date("2026-01-31T00:00:00.000Z"),
      new Date("2026-03-10T00:00:00.000Z"),
    );

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-2-28");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-3-28");
    expect(cycle.cycleIndex).toBe(1);
  });

  test("treats the exact cycle end as the start of the next cycle", () => {
    const cycle = resolveCurrentBillingCycle(
      new Date("2026-01-23T00:00:00.000Z"),
      new Date("2026-03-23T00:00:00.000Z"),
    );

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-3-23");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-4-23");
    expect(cycle.cycleIndex).toBe(2);
  });
});

describe("resolveCurrentRentBillingCycle", () => {
  test("returns the active rent cycle with the rent-specific due date", () => {
    const cycle = resolveCurrentRentBillingCycle(
      new Date("2026-01-05T09:00:00.000Z"),
      new Date("2026-03-18T12:30:00.000Z"),
    );

    expect(localYmd(cycle.billingCycleStart)).toBe("2026-3-5");
    expect(localYmd(cycle.billingCycleEnd)).toBe("2026-4-5");
    expect(localYmd(cycle.dueDate)).toBe("2026-3-5");
    expect(localYmd(cycle.generationDate)).toBe("2026-2-19");
    expect(cycle.cycleIndex).toBe(2);
  });
});

describe("getReservationRecurringFees", () => {
  test("generates itemized additionalCharges from selectedAppliances with default and custom prices", () => {
    expect(
      getReservationRecurringFees({
        selectedAppliances: [
          { name: "Electric Fan", quantity: 2 }, // default price 200 -> 400
          { name: "Refrigerator", quantity: 1, price: 500 }, // custom price 500 -> 500
          { name: "Unused Appliance", quantity: 0 }, // filtered out
        ],
      }),
    ).toEqual({
      applianceFees: 900,
      additionalCharges: [
        { name: "Electric Fan (2x)", amount: 400 },
        { name: "Refrigerator (1x)", amount: 500 },
      ],
    });
  });

  test("combines customCharges and selectedAppliances cleanly without overwriting", () => {
    expect(
      getReservationRecurringFees({
        customCharges: [
          { name: "Locker", amount: 150 },
          { name: "WiFi Booster", amount: 250 },
        ],
        selectedAppliances: [
          { name: "Electric Fan", quantity: 1, price: 200 },
          { name: "Laptop", quantity: 2, price: 200 },
        ],
      }),
    ).toEqual({
      applianceFees: 1000,
      additionalCharges: [
        { name: "Locker", amount: 150 },
        { name: "WiFi Booster", amount: 250 },
        { name: "Electric Fan (1x)", amount: 200 },
        { name: "Laptop (2x)", amount: 400 },
      ],
    });
  });

  test("combines customCharges and legacy applianceFees fallback when selectedAppliances is absent", () => {
    expect(
      getReservationRecurringFees({
        customCharges: [
          { name: "Aircon", amount: 500 },
          { name: "Locker", amount: 150 },
        ],
        applianceFees: 900,
      }),
    ).toEqual({
      applianceFees: 1550,
      additionalCharges: [
        { name: "Aircon", amount: 500 },
        { name: "Locker", amount: 150 },
        { name: "Appliance Fees", amount: 900 },
      ],
    });
  });

  test("falls back to legacy applianceFees when selectedAppliances is empty and no customCharges exist", () => {
    expect(
      getReservationRecurringFees({
        customCharges: [],
        selectedAppliances: [],
        applianceFees: 700,
      }),
    ).toEqual({
      applianceFees: 700,
      additionalCharges: [{ name: "Appliance Fees", amount: 700 }],
    });
  });

  test("returns empty array and 0 fees when no charges or appliances are present", () => {
    expect(getReservationRecurringFees({})).toEqual({
      applianceFees: 0,
      additionalCharges: [],
    });
  });
});

describe("syncBillAmounts", () => {
  test("applies reservation credit to the first bill and keeps the remaining amount payable", () => {
    const bill = {
      status: "pending",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      charges: {
        rent: 5500,
        electricity: 0,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      },
      reservationCreditApplied: 2000,
      paidAmount: 0,
      paymentDate: null,
    };

    syncBillAmounts(bill, { now: new Date("2026-06-01T00:00:00.000Z") });

    expect(bill.grossAmount).toBe(5500);
    expect(bill.totalAmount).toBe(3500);
    expect(bill.remainingAmount).toBe(3500);
    expect(bill.status).toBe("pending");
    expect(bill.paymentDate).toBeNull();
  });

  test("marks an unpaid bill overdue after the due date", () => {
    const bill = {
      status: "pending",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      charges: {
        rent: 3500,
        electricity: 0,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
    };

    syncBillAmounts(bill);

    expect(resolveBillStatus(bill, new Date("2026-06-06T00:00:00.000Z"))).toBe("overdue");
  });

  test("marks the bill paid when the credited total has been fully settled", () => {
    const bill = {
      status: "pending",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      charges: {
        rent: 5500,
        electricity: 0,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      },
      reservationCreditApplied: 2000,
      paidAmount: 3500,
      paymentDate: null,
    };

    syncBillAmounts(bill);

    expect(bill.totalAmount).toBe(3500);
    expect(bill.remainingAmount).toBe(0);
    expect(bill.status).toBe("paid");
    expect(bill.paymentDate).toBeInstanceOf(Date);
  });

  test("hides unsent utility charges from the payable total while keeping raw charges intact", () => {
    const bill = {
      status: "pending",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      charges: {
        rent: 3500,
        electricity: 900,
        water: 300,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      },
      utilityDispatch: {
        electricity: { state: "sent", amount: 900 },
        water: { state: "draft", amount: 300 },
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
    };

    expect(getVisibleBillCharges(bill)).toEqual({
      rent: 3500,
      electricity: 900,
      water: 0,
      applianceFees: 0,
      corkageFees: 0,
      penalty: 0,
      securityDeposit: 0,
      discount: 0,
    });

    syncBillAmounts(bill);

    expect(bill.charges.water).toBe(300);
    expect(bill.totalAmount).toBe(4400);
    expect(bill.remainingAmount).toBe(4400);
  });

  test("reopens a previously paid bill when a later utility becomes visible", () => {
    const bill = {
      status: "paid",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      issuedAt: new Date("2026-05-29T00:00:00.000Z"),
      charges: {
        rent: 0,
        electricity: 1000,
        water: 500,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
      },
      utilityDispatch: {
        electricity: {
          state: "sent",
          amount: 1000,
          issuedAt: new Date("2026-05-29T00:00:00.000Z"),
          dueDate: new Date("2026-06-05T00:00:00.000Z"),
        },
        water: {
          state: "draft",
          amount: 500,
        },
      },
      reservationCreditApplied: 0,
      paidAmount: 1000,
      paymentDate: new Date("2026-06-01T00:00:00.000Z"),
    };

    const refDate = new Date("2026-06-01T00:00:00.000Z");
    syncBillAmounts(bill, { now: refDate });
    expect(bill.status).toBe("paid");
    expect(bill.totalAmount).toBe(1000);

    bill.utilityDispatch.water = {
      state: "sent",
      amount: 500,
      issuedAt: new Date("2026-06-10T00:00:00.000Z"),
      dueDate: new Date("2026-06-17T00:00:00.000Z"),
    };
    const reopened = getVisibleBillSnapshot(bill, refDate);

    expect(reopened.totalAmount).toBe(1500);
    expect(reopened.remainingAmount).toBe(500);
    expect(reopened.status).toBe("partially-paid");

    syncBillAmounts(bill, { now: refDate });

    expect(bill.totalAmount).toBe(1500);
    expect(bill.remainingAmount).toBe(500);
    expect(bill.status).toBe("partially-paid");
    expect(bill.paymentDate).toBeNull();
  });
});

// Regression coverage for the authoritative bill release lifecycle
// (releasedAt). syncBillAmounts() is the single shared choke point every
// real writer/send action already calls (rentGenerator, buildRentBillDraft,
// the inline rentBillingController bulk path, sendUtilityPeriodBills,
// sendDraftUtilityBills, payment settlement, overdue processing), so
// hooking the write here — rather than in each writer individually —
// guarantees exactly one write, using server time, the first time (and
// only the first time) a bill is observed leaving "draft".
//
// `isNew: true` on a test bill simulates a document just built via
// `new Bill(...)` and not yet saved (Mongoose's own semantics) — the exact
// shape every real writer passes to syncBillAmounts() on creation. It is
// flipped to `false` after the first sync to simulate `.save()` completing,
// matching what a subsequent re-fetch-and-resync would see in production.
describe("syncBillAmounts — releasedAt (authoritative release lifecycle)", () => {
  const baseCharges = {
    rent: 3500,
    electricity: 0,
    water: 0,
    applianceFees: 0,
    corkageFees: 0,
    penalty: 0,
    discount: 0,
  };

  test("1. first release writes releasedAt using server time (the `now` passed to syncBillAmounts)", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const now = new Date("2026-06-16T09:00:00.000Z");

    syncBillAmounts(bill, { now });

    expect(bill.releasedAt).toEqual(now);
  });

  test("2. a draft bill (utility period not yet sent) never receives releasedAt", () => {
    const bill = {
      status: "draft",
      dueDate: null,
      charges: { rent: 0, electricity: 1760, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0 },
      utilityDispatch: {
        electricity: { state: "draft", amount: 1760 },
        water: { state: "draft", amount: 0 },
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };

    syncBillAmounts(bill, { preserveStatus: true, now: new Date("2026-06-16T09:00:00.000Z") });

    expect(bill.status).toBe("draft");
    expect(bill.releasedAt).toBeNull();
  });

  test("3. the moment the same bill's status leaves draft, releasedAt is set (utility publish transition)", () => {
    const bill = {
      status: "draft",
      dueDate: null,
      charges: { rent: 0, electricity: 1760, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0 },
      utilityDispatch: {
        electricity: { state: "draft", amount: 1760 },
        water: { state: "draft", amount: 0 },
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    syncBillAmounts(bill, { preserveStatus: true, now: new Date("2026-06-16T09:00:00.000Z") });
    expect(bill.releasedAt).toBeNull();

    // Simulates sendUtilityPeriodBills()/sendDraftUtilityBills() flipping
    // the bill out of draft as part of the actual publish action.
    bill.status = "pending";
    bill.dueDate = new Date("2026-06-23T00:00:00.000Z");
    bill.utilityDispatch.electricity = {
      state: "sent",
      amount: 1760,
      publishedAt: new Date("2026-06-17T10:00:00.000Z"),
      issuedAt: new Date("2026-06-17T10:00:00.000Z"),
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
    };
    const publishNow = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { releasing: true, now: publishNow });

    expect(bill.releasedAt).toEqual(publishNow);
    // Matches the spec's worked example: period end / generation time must
    // not be what releasedAt reports.
    expect(bill.releasedAt).not.toEqual(new Date("2026-06-16T09:00:00.000Z"));
  });

  test("4. repeated release (second syncBillAmounts call after already-released) preserves the original timestamp", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const firstNow = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: firstNow });
    expect(bill.releasedAt).toEqual(firstNow);
    bill.isNew = false; // simulates .save() completing

    const muchLater = new Date("2026-09-01T00:00:00.000Z");
    syncBillAmounts(bill, { now: muchLater });

    expect(bill.releasedAt).toEqual(firstNow);
    expect(bill.releasedAt).not.toEqual(muchLater);
  });

  test("5. reminder/resend (repeated calls with unrelated field changes) preserves releasedAt", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      sentAt: new Date("2026-06-17T10:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const originalRelease = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: originalRelease });
    expect(bill.releasedAt).toEqual(originalRelease);
    bill.isNew = false; // simulates .save() completing

    // Simulates an admin "resend" that (as sendRentBill already does today)
    // bumps sentAt to track the latest send attempt — a separate concept
    // from the immutable first-release timestamp.
    bill.sentAt = new Date("2026-06-21T08:00:00.000Z");
    syncBillAmounts(bill, { now: new Date("2026-06-21T08:00:00.000Z") });

    expect(bill.releasedAt).toEqual(originalRelease);
    expect(bill.sentAt).toEqual(new Date("2026-06-21T08:00:00.000Z"));
  });

  test("6. payment settlement (status -> paid) preserves the original releasedAt", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const releaseTime = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: releaseTime });
    expect(bill.releasedAt).toEqual(releaseTime);
    bill.isNew = false; // simulates .save() completing

    bill.paidAmount = 3500;
    syncBillAmounts(bill, { now: new Date("2026-06-20T00:00:00.000Z") });

    expect(bill.status).toBe("paid");
    expect(bill.releasedAt).toEqual(releaseTime);
  });

  test("7. overdue processing (status -> overdue past due date) preserves the original releasedAt", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const releaseTime = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: releaseTime });
    expect(bill.releasedAt).toEqual(releaseTime);
    bill.isNew = false; // simulates .save() completing

    syncBillAmounts(bill, { now: new Date("2026-07-01T00:00:00.000Z") });

    expect(resolveBillStatus(bill, new Date("2026-07-01T00:00:00.000Z"))).toBe("overdue");
    expect(bill.releasedAt).toEqual(releaseTime);
  });

  test("8. a general bill edit (e.g. description/branch metadata) cannot overwrite releasedAt through syncBillAmounts", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
      description: "June 2026 Billing Statement",
    };
    const releaseTime = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: releaseTime });
    bill.isNew = false; // simulates .save() completing

    bill.description = "June 2026 Billing Statement (corrected)";
    syncBillAmounts(bill, { now: new Date("2026-08-01T00:00:00.000Z") });

    expect(bill.releasedAt).toEqual(releaseTime);
  });

  test("9. releasedAt is never derived from createdAt/dueDate/billingCycleStart/meter-reading date — only from server `now` at the moment status first leaves draft", () => {
    const bill = {
      isNew: true,
      status: "pending",
      createdAt: new Date("2026-06-16T09:00:00.000Z"), // bill generated internally
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      billingCycleStart: new Date("2026-05-26T00:00:00.000Z"),
      billingCycleEnd: new Date("2026-06-15T00:00:00.000Z"),
      utilityReadingDate: new Date("2026-06-15T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    // The actual official release happens the next day.
    const officialRelease = new Date("2026-06-17T10:00:00.000Z");

    syncBillAmounts(bill, { now: officialRelease });

    expect(bill.releasedAt).toEqual(officialRelease);
    expect(bill.releasedAt).not.toEqual(bill.createdAt);
    expect(bill.releasedAt).not.toEqual(bill.dueDate);
    expect(bill.releasedAt).not.toEqual(bill.billingCycleStart);
    expect(bill.releasedAt).not.toEqual(bill.billingCycleEnd);
    expect(bill.releasedAt).not.toEqual(bill.utilityReadingDate);
  });

  test("10. a historical bill with no trustworthy release evidence stays null until it is actually synced past draft", () => {
    const bill = {
      status: "draft",
      dueDate: null,
      charges: { rent: 0, electricity: 1760, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0 },
      utilityDispatch: {
        electricity: { state: "draft", amount: 1760 },
        water: { state: "draft", amount: 0 },
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      // No releasedAt field at all on this legacy-shaped document.
    };

    syncBillAmounts(bill, { preserveStatus: true, now: new Date("2026-08-16T00:00:00.000Z") });

    expect(bill.releasedAt ?? null).toBeNull();
  });

  test("10b. an OLDER, already non-draft bill with no releasedAt (pre-existing production data, isNew: false) is NOT backfilled when re-synced by an unrelated later operation — this is the critical anti-fabrication guarantee", () => {
    // Simulates a bill that was created and released long before this
    // feature shipped: already "pending" (never draft, per the rent-bill
    // lifecycle), loaded fresh from the database (isNew defaults to false
    // for a document fetched via Bill.findOne/find), with no releasedAt on
    // record. An unrelated later action (a payment update, the daily
    // overdue cron) must NOT stamp releasedAt = today — that would fabricate
    // a release date months after the real, unrecorded release event.
    const bill = {
      isNew: false,
      status: "pending",
      dueDate: new Date("2026-04-05T00:00:00.000Z"),
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };

    // An unrelated operation touches this old bill much later (e.g. the
    // tenant finally pays, or the overdue cron re-evaluates it).
    syncBillAmounts(bill, { now: new Date("2026-08-16T00:00:00.000Z") });

    expect(bill.releasedAt).toBeNull();

    bill.paidAmount = 3500;
    syncBillAmounts(bill, { now: new Date("2026-08-17T00:00:00.000Z") });

    expect(bill.status).toBe("paid");
    expect(bill.releasedAt).toBeNull();
  });

  test("11. electricity and water dispatch entries publishing at different times still resolve to one bill-level releasedAt, set on the FIRST transition", () => {
    const bill = {
      status: "draft",
      dueDate: null,
      charges: { rent: 0, electricity: 1760, water: 450, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0 },
      utilityDispatch: {
        electricity: { state: "draft", amount: 1760 },
        water: { state: "draft", amount: 450 },
      },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    syncBillAmounts(bill, { preserveStatus: true, now: new Date("2026-06-16T00:00:00.000Z") });
    expect(bill.releasedAt).toBeNull();

    // Electricity is published first — this is the bill's first-ever release.
    bill.status = "pending";
    bill.utilityDispatch.electricity = { state: "sent", amount: 1760, publishedAt: new Date("2026-06-17T10:00:00.000Z") };
    const firstRelease = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { releasing: true, now: firstRelease });
    expect(bill.releasedAt).toEqual(firstRelease);

    // Water publishes later, on a separate admin action (its own call to
    // syncBillAmounts with releasing: true, exactly like electricity's) —
    // releasedAt must NOT jump forward to this second event (see
    // getVisibleBillIssuedAt for the intentionally different "current
    // issued date" behavior, which is untouched by this change).
    bill.utilityDispatch.water = { state: "sent", amount: 450, publishedAt: new Date("2026-06-20T00:00:00.000Z") };
    syncBillAmounts(bill, { releasing: true, now: new Date("2026-06-20T00:00:00.000Z") });

    expect(bill.releasedAt).toEqual(firstRelease);
  });

  test("12. releasing: true on an already-released bill is a safe no-op (idempotent — matches a genuine resend/retry of the publish action)", () => {
    const bill = {
      isNew: true,
      status: "pending",
      dueDate: new Date("2026-06-23T00:00:00.000Z"),
      charges: { ...baseCharges },
      reservationCreditApplied: 0,
      paidAmount: 0,
      paymentDate: null,
      releasedAt: null,
    };
    const releaseTime = new Date("2026-06-17T10:00:00.000Z");
    syncBillAmounts(bill, { now: releaseTime });
    expect(bill.releasedAt).toEqual(releaseTime);
    bill.isNew = false;

    // A retried/duplicate "publish" call (e.g. an admin double-clicking
    // send, or a request retry) for a bill that is already released.
    syncBillAmounts(bill, { releasing: true, now: new Date("2026-07-15T00:00:00.000Z") });

    expect(bill.releasedAt).toEqual(releaseTime);
  });
});

describe("getReservationCreditAvailable", () => {
  test("always returns 0 because reservation credit applies exclusively to initial move-in payment", () => {
    expect(
      getReservationCreditAvailable({
        paymentStatus: "paid",
        reservationFeeAmount: 2500,
        reservationCreditConsumedAt: null,
        reservationCreditAppliedBillId: null,
      }),
    ).toBe(0);

    expect(
      getReservationCreditAvailable({
        paymentStatus: "pending",
        reservationFeeAmount: 2000,
        reservationCreditConsumedAt: null,
        reservationCreditAppliedBillId: null,
      }),
    ).toBe(0);
  });
});

describe("utility billing dates", () => {
  test("targets the next 15th as the utility close boundary", () => {
    expect(
      localYmd(getUtilityTargetCloseDate(new Date("2026-04-02T10:00:00.000Z"))),
    ).toBe("2026-4-15");
    expect(
      localYmd(getUtilityTargetCloseDate(new Date("2026-04-15T00:00:00.000Z"))),
    ).toBe("2026-5-15");
  });

  test("returns previous and next utility cycle boundaries around an arbitrary date", () => {
    expect(
      localYmd(getPreviousUtilityCycleBoundary(new Date("2026-04-02T10:00:00.000Z"))),
    ).toBe("2026-3-15");
    expect(
      localYmd(getNextUtilityCycleBoundary(new Date("2026-04-02T10:00:00.000Z"))),
    ).toBe("2026-4-15");
  });

  test("aligns the first auto-opened period to the current 15th cycle", () => {
    expect(
      localYmd(resolveUtilityAutoOpenStartDate({
        anchorDate: new Date("2026-04-02T10:00:00.000Z"),
      })),
    ).toBe("2026-3-15");
  });

  test("starts the next auto-opened period from the prior close boundary", () => {
    expect(
      localYmd(resolveUtilityAutoOpenStartDate({
        anchorDate: new Date(2026, 4, 15, 12, 0, 0),
        previousPeriodEndDate: new Date(2026, 4, 15, 19, 30, 0),
      })),
    ).toBe("2026-5-15");
  });

  test("matches utility boundaries by calendar day", () => {
    expect(
      isSameUtilityCycleBoundary(
        new Date(2026, 4, 15, 0, 0, 0),
        new Date(2026, 4, 15, 18, 15, 0),
      ),
    ).toBe(true);
    expect(
      isSameUtilityCycleBoundary(
        new Date(2026, 4, 14, 23, 59, 59),
        new Date(2026, 4, 15, 0, 0, 0),
      ),
    ).toBe(false);
  });

  test("maps utility cycle metadata directly from the billing period", () => {
    const cycle = getUtilityCycleFromPeriod({
      startDate: new Date(2026, 2, 15, 9, 0, 0),
      endDate: new Date(2026, 3, 15, 17, 30, 0),
    });

    expect(localYmd(cycle.utilityCycleStart)).toBe("2026-3-15");
    expect(localYmd(cycle.utilityCycleEnd)).toBe("2026-4-15");
    expect(localYmd(cycle.utilityReadingDate)).toBe("2026-4-15");
  });

  test("skips weekends when picking the next working day", () => {
    expect(localYmd(getNextWorkingDay(new Date("2026-08-15T00:00:00.000Z")))).toBe("2026-8-17");
    expect(localYmd(getNextWorkingDay(new Date("2026-08-17T08:00:00.000Z"), { includeSameDay: true }))).toBe("2026-8-17");
  });

  test("issues utility bills immediately on the chosen send date", () => {
    const issuedAt = getUtilityIssueDate({
      readingDate: new Date("2026-05-15T00:00:00.000Z"),
      finalizedAt: new Date("2026-05-15T10:00:00.000Z"),
    });

    expect(localYmd(issuedAt)).toBe("2026-5-15");
    expect(localYmd(getUtilityDueDate(issuedAt))).toBe("2026-5-22");
  });

  test("uses the actual finalized day when bills are sent after the reading date", () => {
    const issuedAt = getUtilityIssueDate({
      readingDate: new Date("2026-05-15T00:00:00.000Z"),
      finalizedAt: new Date("2026-05-19T11:00:00.000Z"),
    });

    expect(localYmd(issuedAt)).toBe("2026-5-19");
    expect(localYmd(getUtilityDueDate(issuedAt))).toBe("2026-5-26");
  });
});

describe("getVisibleBillSnapshot — voided bill is never outstanding", () => {
  const chargesOf = (over = {}) => ({
    rent: 0,
    electricity: 0,
    water: 0,
    applianceFees: 0,
    corkageFees: 0,
    penalty: 0,
    discount: 0,
    securityDeposit: 0,
    ...over,
  });

  test("voided UNPAID transfer balance bill: remainingAmount 0, total/breakdown preserved", () => {
    const bill = {
      billType: "transfer_settlement",
      status: "voided",
      charges: chargesOf({ rent: 12450, securityDeposit: 6000 }),
      paidAmount: 0,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
    };

    const snap = getVisibleBillSnapshot(bill, new Date("2026-09-10T00:00:00.000Z"));

    expect(snap.remainingAmount).toBe(0);
    expect(snap.status).toBe("voided");
    // Historical total + charge breakdown intact for audit.
    expect(snap.grossAmount).toBe(18450);
    expect(snap.totalAmount).toBe(18450);
    expect(snap.charges.rent).toBe(12450);
    expect(snap.charges.securityDeposit).toBe(6000);
    expect(snap.paidAmount).toBe(0);
  });

  test("voided regular rent bill: remainingAmount 0, past due date does NOT make it overdue", () => {
    const bill = {
      billType: "rent",
      status: "voided",
      charges: chargesOf({ rent: 5500 }),
      paidAmount: 0,
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
    };

    const snap = getVisibleBillSnapshot(bill, new Date("2026-07-01T00:00:00.000Z"));

    expect(snap.remainingAmount).toBe(0);
    expect(snap.status).toBe("voided");
    expect(snap.totalAmount).toBe(5500);
  });

  test("voided PARTIALLY-PAID bill: paidAmount preserved, remainingAmount still 0", () => {
    const bill = {
      billType: "transfer_settlement",
      status: "voided",
      charges: chargesOf({ rent: 10000 }),
      paidAmount: 4000,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
    };

    const snap = getVisibleBillSnapshot(bill);

    expect(snap.remainingAmount).toBe(0);
    expect(snap.paidAmount).toBe(4000);
    expect(snap.totalAmount).toBe(10000);
  });

  test("syncBillAmounts does not recompute total - paid back into a voided bill", () => {
    const bill = {
      billType: "transfer_settlement",
      status: "voided",
      charges: chargesOf({ rent: 12450, securityDeposit: 6000 }),
      reservationCreditApplied: 0,
      paidAmount: 0,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
    };

    syncBillAmounts(bill, { now: new Date("2026-09-10T00:00:00.000Z") });

    expect(bill.remainingAmount).toBe(0);
    expect(bill.totalAmount).toBe(18450); // original total kept
    expect(bill.status).toBe("voided");
  });

  test("buildBillingSummary excludes a voided bill from the outstanding balance", async () => {
    const { buildBillingSummary } = await import("./tenantWorkspace.js");
    const now = new Date("2026-09-10T00:00:00.000Z");
    const bills = [
      {
        _id: "a",
        billType: "rent",
        status: "pending",
        charges: chargesOf({ rent: 5500 }),
        paidAmount: 0,
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
      },
      {
        _id: "b",
        billType: "transfer_settlement",
        status: "voided",
        charges: chargesOf({ rent: 12450, securityDeposit: 6000 }),
        paidAmount: 0,
        dueDate: new Date("2026-09-05T00:00:00.000Z"),
      },
    ];

    const summary = buildBillingSummary(bills, now);

    // Only the live 5,500 rent bill counts — the voided 18,450 is excluded.
    expect(summary.currentBalance).toBe(5500);
    expect(summary.hasOutstanding).toBe(true);
  });
});

describe("resolveMobileBillStatus / toMobileBill — voided bill", () => {
  test("voided bill maps to mobile status 'cancelled' with remaining_amount 0", async () => {
    const { toMobileBill } = await import("../services/mobileBillingBridge.js");
    const bill = {
      _id: "aa11bb22cc33dd44ee55ff66",
      billType: "transfer_settlement",
      status: "voided",
      billingMonth: new Date("2026-09-01T00:00:00.000Z"),
      charges: {
        rent: 12450,
        electricity: 0,
        water: 0,
        applianceFees: 0,
        corkageFees: 0,
        penalty: 0,
        discount: 0,
        securityDeposit: 6000,
      },
      paidAmount: 0,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    };

    const mobile = toMobileBill(bill);

    expect(mobile.status).toBe("cancelled");
    expect(mobile.remaining_amount).toBe(0);
    // Historical figures still exposed.
    expect(mobile.total).toBe(18450);
    expect(mobile.rent).toBe(12450);
    expect(mobile.security_deposit).toBe(6000);
  });
});
