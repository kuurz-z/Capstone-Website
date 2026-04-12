import { describe, expect, test } from "@jest/globals";
import {
  buildBillingCycle,
  getVisibleBillCharges,
  getVisibleBillSnapshot,
  getNextUtilityCycleBoundary,
  getNextWorkingDay,
  getPreviousUtilityCycleBoundary,
  getReservationCreditAvailable,
  isSameUtilityCycleBoundary,
  resolveUtilityAutoOpenStartDate,
  getUtilityCycleFromPeriod,
  getUtilityDueDate,
  getUtilityIssueDate,
  getUtilityTargetCloseDate,
  resolveBillStatus,
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

    syncBillAmounts(bill);

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

    syncBillAmounts(bill);
    expect(bill.status).toBe("paid");
    expect(bill.totalAmount).toBe(1000);

    bill.utilityDispatch.water = {
      state: "sent",
      amount: 500,
      issuedAt: new Date("2026-06-10T00:00:00.000Z"),
      dueDate: new Date("2026-06-17T00:00:00.000Z"),
    };
    const reopened = getVisibleBillSnapshot(bill);

    expect(reopened.totalAmount).toBe(1500);
    expect(reopened.remainingAmount).toBe(500);
    expect(reopened.status).toBe("partially-paid");

    syncBillAmounts(bill);

    expect(bill.totalAmount).toBe(1500);
    expect(bill.remainingAmount).toBe(500);
    expect(bill.status).toBe("partially-paid");
    expect(bill.paymentDate).toBeNull();
  });
});

describe("getReservationCreditAvailable", () => {
  test("returns the configured reservation fee only while the first-bill credit is unused", () => {
    expect(
      getReservationCreditAvailable({
        paymentStatus: "paid",
        reservationFeeAmount: 2500,
        reservationCreditConsumedAt: null,
        reservationCreditAppliedBillId: null,
      }),
    ).toBe(2500);
  });

  test("returns zero once the credit has been consumed or the reservation is unpaid", () => {
    expect(
      getReservationCreditAvailable({
        paymentStatus: "pending",
        reservationFeeAmount: 2000,
        reservationCreditConsumedAt: null,
        reservationCreditAppliedBillId: null,
      }),
    ).toBe(0);

    expect(
      getReservationCreditAvailable({
        paymentStatus: "paid",
        reservationFeeAmount: 2000,
        reservationCreditConsumedAt: new Date("2026-06-05T00:00:00.000Z"),
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

  test("issues utility bills no earlier than the next working day after reading", () => {
    const issuedAt = getUtilityIssueDate({
      readingDate: new Date("2026-05-15T00:00:00.000Z"),
      finalizedAt: new Date("2026-05-15T10:00:00.000Z"),
    });

    expect(localYmd(issuedAt)).toBe("2026-5-18");
    expect(localYmd(getUtilityDueDate(issuedAt))).toBe("2026-5-25");
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
