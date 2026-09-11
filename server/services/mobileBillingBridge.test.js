import { describe, expect, test } from "@jest/globals";
import {
  resolveMobileBillStatus,
  mobileBillStatusLabel,
  toMobilePaymentMethodLabel,
  toMobileBill,
  formatMobileElectricityBreakdown,
  isMobileEffectivelyPaid,
  MOBILE_BILL_STATUSES,
} from "./mobileBillingBridge.js";
import { BILL_STATEMENT_TEMPLATE_VERSION } from "./billingStatementTemplate.js";
import { BILL_RECEIPT_TEMPLATE_VERSION } from "./billingReceiptTemplate.js";

describe("resolveMobileBillStatus", () => {
  test("unpaid: no payments made yet, not overdue", () => {
    expect(
      resolveMobileBillStatus({ status: "pending", remainingAmount: 5000, paidAmount: 0 }),
    ).toBe("unpaid");
  });

  test("unpaid: overdue is still unpaid at the mobile-effective-status level", () => {
    expect(
      resolveMobileBillStatus({ status: "overdue", remainingAmount: 5000, paidAmount: 0 }),
    ).toBe("unpaid");
  });

  test("partially_paid: some payment applied, balance remains", () => {
    expect(
      resolveMobileBillStatus({ status: "partially-paid", remainingAmount: 2000, paidAmount: 3000 }),
    ).toBe("partially_paid");
  });

  test("paid: remainingAmount <= 0 wins regardless of stale stored status", () => {
    // Stored status still says "pending" (stale write, e.g. sync race) but
    // the balance is actually zero — must show Paid, never Unpaid.
    expect(
      resolveMobileBillStatus({ status: "pending", remainingAmount: 0, paidAmount: 5000 }),
    ).toBe("paid");
  });

  test("paid: negative remaining (overpayment) still resolves to paid", () => {
    expect(
      resolveMobileBillStatus({ status: "pending", remainingAmount: -50, paidAmount: 5050 }),
    ).toBe("paid");
  });

  test("cancelled: voided bill", () => {
    expect(
      resolveMobileBillStatus({ status: "voided", remainingAmount: 5000, paidAmount: 0 }),
    ).toBe("cancelled");
  });

  test("paid: waived bill (tenant no longer liable)", () => {
    expect(
      resolveMobileBillStatus({ status: "waived", remainingAmount: 500, paidAmount: 0 }),
    ).toBe("paid");
  });

  test("pending_verification: proof submitted, balance still owed", () => {
    expect(
      resolveMobileBillStatus({
        status: "pending",
        remainingAmount: 5000,
        paidAmount: 0,
        paymentProof: { verificationStatus: "pending-verification" },
      }),
    ).toBe("pending_verification");
  });

  test("paid wins over a stale pending-verification flag once balance is actually zero", () => {
    // e.g. tenant submitted proof, but the bill was separately settled via
    // PayMongo before an admin reviewed the proof.
    expect(
      resolveMobileBillStatus({
        status: "paid",
        remainingAmount: 0,
        paidAmount: 5000,
        paymentProof: { verificationStatus: "pending-verification" },
      }),
    ).toBe("paid");
  });

  test("rejected: proof rejected, balance still owed", () => {
    expect(
      resolveMobileBillStatus({
        status: "pending",
        remainingAmount: 5000,
        paidAmount: 0,
        paymentProof: { verificationStatus: "rejected" },
      }),
    ).toBe("rejected");
  });

  test("adjusted status falls through to payment-evidence rules, not treated as terminal", () => {
    expect(
      resolveMobileBillStatus({ status: "adjusted", remainingAmount: 1000, paidAmount: 500 }),
    ).toBe("partially_paid");
    expect(
      resolveMobileBillStatus({ status: "adjusted", remainingAmount: 0, paidAmount: 1000 }),
    ).toBe("paid");
  });

  test("every branch returns a value from the mobile status vocabulary", () => {
    const cases = [
      { status: "voided", remainingAmount: 1, paidAmount: 0 },
      { status: "pending", remainingAmount: 0, paidAmount: 1 },
      { status: "waived", remainingAmount: 1, paidAmount: 0 },
      { status: "pending", remainingAmount: 1, paidAmount: 0, paymentProof: { verificationStatus: "pending-verification" } },
      { status: "pending", remainingAmount: 1, paidAmount: 0, paymentProof: { verificationStatus: "rejected" } },
      { status: "partially-paid", remainingAmount: 1, paidAmount: 1 },
      { status: "pending", remainingAmount: 1, paidAmount: 0 },
    ];
    for (const c of cases) {
      expect(MOBILE_BILL_STATUSES).toContain(resolveMobileBillStatus(c));
    }
  });
});

describe("mobileBillStatusLabel", () => {
  test("maps every vocabulary entry to a human label", () => {
    for (const status of MOBILE_BILL_STATUSES) {
      expect(typeof mobileBillStatusLabel(status)).toBe("string");
      expect(mobileBillStatusLabel(status).length).toBeGreaterThan(0);
    }
  });
});

describe("toMobilePaymentMethodLabel", () => {
  test("never surfaces the raw settlement-rail name 'PayMongo' verbatim as a channel", () => {
    const label = toMobilePaymentMethodLabel("paymongo");
    expect(label).not.toBe("PayMongo");
    expect(label).toBe("Online Payment (PayMongo)");
  });

  test("maps real channels to human labels", () => {
    expect(toMobilePaymentMethodLabel("gcash")).toBe("GCash");
    expect(toMobilePaymentMethodLabel("card")).toBe("Credit / Debit Card");
    expect(toMobilePaymentMethodLabel("grab_pay")).toBe("GrabPay");
    expect(toMobilePaymentMethodLabel("bank")).toBe("Bank Transfer");
    expect(toMobilePaymentMethodLabel("offline_cash")).toBe("Cash (Branch)");
  });

  test("returns null (a neutral fallback) rather than guessing for unknown/empty input", () => {
    expect(toMobilePaymentMethodLabel(null)).toBeNull();
    expect(toMobilePaymentMethodLabel("")).toBeNull();
    expect(toMobilePaymentMethodLabel("some_future_unmapped_channel")).toBeNull();
  });
});

describe("formatMobileElectricityBreakdown", () => {
  test("formats canonical timestamps as Manila calendar dates instead of UTC date keys", () => {
    const [segment] = formatMobileElectricityBreakdown({
      ratePerKwh: 16,
      segments: [{
        startDate: new Date("2026-08-17T16:00:00.000Z"),
        endDate: "2026-08-17T16:00:00.000Z",
        readingFrom: 1000,
        readingTo: 1459,
        segmentTotalKwh: 459,
        activeTenantCount: 1,
        sharePerTenantCost: 7344,
      }],
    });

    expect(segment.reading_date_from).toBe("2026-08-18");
    expect(segment.reading_date_to).toBe("2026-08-18");
    expect(segment.period_start).toBe("2026-08-18");
    expect(segment.period_end).toBe("2026-08-18");
  });
});

function makeBill(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    status: "pending",
    billingMonth: new Date("2026-05-01"),
    billingCycleStart: new Date("2026-05-01"),
    dueDate: new Date("2026-05-31"),
    charges: { rent: 5000, electricity: 300, water: 100, penalty: 0, applianceFees: 0, corkageFees: 0, discount: 0 },
    totalAmount: 5400,
    grossAmount: 5400,
    paidAmount: 0,
    remainingAmount: 5400,
    paymentMethod: null,
    paymentDate: null,
    paymongoPaymentId: null,
    additionalCharges: [],
    paymentProof: { verificationStatus: "none" },
    createdAt: new Date("2026-05-01"),
    ...overrides,
  };
}

describe("toMobileBill", () => {
  test("maps a canonical Bill into the legacy-mobile-shaped contract with an explicit mobile status", () => {
    const mobileBill = toMobileBill(makeBill());
    expect(mobileBill.billing_id).toBe("507f1f77bcf86cd799439011");
    expect(mobileBill.status).toBe("unpaid");
    expect(MOBILE_BILL_STATUSES).toContain(mobileBill.status);
    expect(mobileBill.rent).toBe(5000);
    expect(mobileBill.total).toBe(5400);
    expect(mobileBill.remaining_amount).toBe(5400);
  });

  test("never leaks the raw canonical status string as the status field", () => {
    const mobileBill = toMobileBill(makeBill({ status: "overdue" }));
    expect(mobileBill.status).not.toBe("overdue");
    expect(mobileBill.status).toBe("unpaid");
  });

  test("humanizes payment_method instead of exposing the raw rail value", () => {
    const mobileBill = toMobileBill(
      makeBill({ status: "paid", remainingAmount: 0, paidAmount: 5400, paymentMethod: "gcash" }),
    );
    expect(mobileBill.payment_method).toBe("GCash");
    expect(mobileBill.status).toBe("paid");
  });
});

describe("toMobileBill statement_version (PDF cache-busting)", () => {
  // The mobile app keys its on-device statement/receipt PDF cache as
  // `${billId}_v${statement_version}` (see frontend/app/bill-details.jsx,
  // billing-history.jsx). If this bridge never surfaced a version that
  // changes when the underlying bill changes, a bill edited server-side
  // (e.g. a utility charge posting) could keep serving a stale cached PDF
  // to a device that already fetched it once, indefinitely.
  test("is present on every bill response", () => {
    const mobileBill = toMobileBill(makeBill());
    expect(mobileBill.statement_version).toBeTruthy();
    expect(typeof mobileBill.statement_version).toBe("string");
  });

  test("changes when the bill's updatedAt advances (a real server-side change bumps the cache key)", () => {
    const before = toMobileBill(makeBill({ updatedAt: new Date("2026-05-02T00:00:00Z") }));
    const after = toMobileBill(makeBill({ updatedAt: new Date("2026-05-03T00:00:00Z") }));
    expect(after.statement_version).not.toBe(before.statement_version);
  });

  test("falls back to createdAt so a never-updated bill still has a stable, present version", () => {
    const mobileBill = toMobileBill(makeBill({ updatedAt: undefined, createdAt: new Date("2026-05-01T00:00:00Z") }));
    expect(mobileBill.statement_version).toBe(
      `${new Date("2026-05-01T00:00:00Z").getTime()}-i1-t${BILL_STATEMENT_TEMPLATE_VERSION}`,
    );
  });

  test("includes the server template version so a template-only deployment changes the device cache key", () => {
    const mobileBill = toMobileBill(makeBill({ updatedAt: new Date("2026-05-01T00:00:00Z") }));
    expect(mobileBill.statement_version).toMatch(
      new RegExp(`-t${BILL_STATEMENT_TEMPLATE_VERSION}$`),
    );
  });

  test("Statement and Receipt expose independent template cache versions", () => {
    const mobileBill = toMobileBill(makeBill({ updatedAt: new Date("2026-05-01T00:00:00Z") }));
    expect(mobileBill.receipt_version).toMatch(new RegExp(`-t${BILL_RECEIPT_TEMPLATE_VERSION}$`));
    expect(mobileBill.receipt_version).not.toBe(mobileBill.statement_version);
  });
});

describe("toMobileBill utility_deadlines", () => {
  test("an undispatched canonical utility has an explicit pending schedule instead of a blank card", () => {
    const mobileBill = toMobileBill(makeBill({ utilityDispatch: { electricity: { state: "draft" } } }));
    expect(mobileBill.utility_schedules.electricity.state).toBe("pending");
    expect(mobileBill.utility_schedules.electricity.source).toBe("canonical_bill");
  });

  test("a dispatched utility with persisted period dates has an available schedule", () => {
    const mobileBill = toMobileBill(makeBill({
      utilityCycleStart: new Date("2026-05-01"),
      utilityCycleEnd: new Date("2026-05-31"),
      utilityDispatch: { electricity: { state: "sent", dueDate: new Date("2026-06-08") } },
    }));
    expect(mobileBill.utility_schedules.electricity).toEqual(expect.objectContaining({
      state: "available",
      period_start: "2026-05-01T00:00:00.000Z",
      period_end: "2026-05-31T00:00:00.000Z",
      due_date: "2026-06-08T00:00:00.000Z",
    }));
  });
  // Regression for the exact bug this bridge reconciliation phase was
  // built to close: a bill with an electricity/water charge but no
  // utility_deadlines entry renders as permanently "not released" on the
  // mobile app (billingStatus.js getUtilityReleaseSchedule), independent of
  // paid status — so a fully paid bill could show "Paid" AND "Your utility
  // bill has not been released yet." at the same time. utility_deadlines
  // must be populated whenever the canonical utility dispatch state is
  // genuinely "sent", using the SAME signal isUtilityChargeVisible() uses.
  test("a bill with a dispatched (sent) electricity charge carries a populated utility_deadlines entry", () => {
    const issuedAt = new Date("2026-05-10");
    const dueDate = new Date("2026-05-20");
    const releasedAt = new Date("2026-05-11");
    const mobileBill = toMobileBill(makeBill({
      releasedAt,
      utilityDispatch: { electricity: { state: "sent", issuedAt, dueDate, publishedAt: issuedAt } },
    }));
    expect(mobileBill.utility_deadlines.electricity).toEqual({
      // billReleaseDate is the bill-level authoritative releasedAt, not the
      // per-utility issuedAt (a due-date-calculation concept — see
      // mobileUtilityDeadlines()'s doc comment).
      billReleaseDate: releasedAt,
      finalDueDate: dueDate,
      meterReadingDate: issuedAt,
    });
  });

  test("a dispatched electricity charge with no bill-level releasedAt yet reports billReleaseDate: null, not a guess", () => {
    const issuedAt = new Date("2026-05-10");
    const dueDate = new Date("2026-05-20");
    const mobileBill = toMobileBill(makeBill({
      releasedAt: null,
      utilityDispatch: { electricity: { state: "sent", issuedAt, dueDate, publishedAt: issuedAt } },
    }));
    expect(mobileBill.utility_deadlines.electricity.billReleaseDate).toBeNull();
    expect(mobileBill.utility_deadlines.electricity.finalDueDate).toEqual(dueDate);
  });

  test("a bill with a still-draft (undispatched) electricity charge carries no utility_deadlines entry for it — not a fabricated null-dated one", () => {
    const mobileBill = toMobileBill(makeBill({
      utilityDispatch: { electricity: { state: "draft" } },
    }));
    expect(mobileBill.utility_deadlines.electricity).toBeUndefined();
  });

  test("a bill with no electricity/water charge carries no utility_deadlines entries at all", () => {
    const mobileBill = toMobileBill(makeBill({ charges: { rent: 5000 }, totalAmount: 5000, remainingAmount: 5000 }));
    expect(mobileBill.utility_deadlines).toEqual({});
  });

  test("a paid bill with a dispatched electricity charge is simultaneously 'paid' and has a released utility schedule — never a contradiction", () => {
    const issuedAt = new Date("2026-05-10");
    const dueDate = new Date("2026-05-20");
    const releasedAt = new Date("2026-05-11");
    const mobileBill = toMobileBill(makeBill({
      status: "paid",
      remainingAmount: 0,
      paidAmount: 5400,
      releasedAt,
      utilityDispatch: { electricity: { state: "sent", issuedAt, dueDate } },
    }));
    expect(mobileBill.status).toBe("paid");
    expect(mobileBill.utility_deadlines.electricity.billReleaseDate).toEqual(releasedAt);
    expect(mobileBill.utility_deadlines.electricity.finalDueDate).toEqual(dueDate);
  });
});

describe("toMobileBill release_date (authoritative release lifecycle)", () => {
  test("release_date reflects bill.releasedAt directly", () => {
    const releasedAt = new Date("2026-05-11T10:00:00.000Z");
    const mobileBill = toMobileBill(makeBill({ releasedAt }));
    expect(mobileBill.release_date).toEqual(releasedAt);
  });

  test("release_date is null (not billingCycleStart) when releasedAt is not yet set", () => {
    const mobileBill = toMobileBill(makeBill({ releasedAt: null, billingCycleStart: new Date("2026-05-01") }));
    expect(mobileBill.release_date).toBeNull();
  });

  test("release_date never falls back to createdAt", () => {
    const mobileBill = toMobileBill(makeBill({ releasedAt: null, createdAt: new Date("2026-05-01") }));
    expect(mobileBill.release_date).toBeNull();
  });

  test("electricity and water utility_deadlines share the same bill-level release_date", () => {
    const releasedAt = new Date("2026-05-11T10:00:00.000Z");
    const mobileBill = toMobileBill(makeBill({
      releasedAt,
      utilityDispatch: {
        electricity: { state: "sent", issuedAt: new Date("2026-05-10"), dueDate: new Date("2026-05-20") },
        water: { state: "sent", issuedAt: new Date("2026-05-12"), dueDate: new Date("2026-05-22") },
      },
    }));
    expect(mobileBill.utility_deadlines.electricity.billReleaseDate).toEqual(releasedAt);
    expect(mobileBill.utility_deadlines.water.billReleaseDate).toEqual(releasedAt);
    expect(mobileBill.release_date).toEqual(releasedAt);
    // Period/reading fields stay independent per utility.
    expect(mobileBill.utility_deadlines.electricity.finalDueDate).not.toEqual(mobileBill.utility_deadlines.water.finalDueDate);
  });
});

describe("isMobileEffectivelyPaid", () => {
  test("true only when the resolved mobile status is paid", () => {
    expect(isMobileEffectivelyPaid(makeBill({ remainingAmount: 0, paidAmount: 5400 }))).toBe(true);
    expect(isMobileEffectivelyPaid(makeBill({ remainingAmount: 5400, paidAmount: 0 }))).toBe(false);
    expect(
      isMobileEffectivelyPaid(
        makeBill({ paymentProof: { verificationStatus: "pending-verification" } }),
      ),
    ).toBe(false);
  });
});

// selectCurrentBillFromList moved to services/billing/currentBillResolver.js
// (consumer-neutral canonical module) — see currentBillResolver.test.js for
// its coverage. It no longer lives in or is re-exported from this bridge.

describe("utility breakdowns formatting & bridge", () => {
  const sampleElectricityBreakdown = {
    period: {
      id: "607f1f77bcf86cd799439001",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
    },
    ratePerKwh: 16,
    myTotalKwh: 50.5,
    myBillAmount: 808,
    segments: [
      {
        periodLabel: "May 1 - May 15",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-15"),
        readingFrom: 1000,
        readingTo: 1060,
        segmentTotalKwh: 60,
        activeTenantCount: 2,
        sharePerTenantKwh: 30,
        sharePerTenantCost: 480,
      },
      {
        periodLabel: "May 15 - May 31",
        startDate: new Date("2026-05-15"),
        endDate: new Date("2026-05-31"),
        readingFrom: 1060,
        readingTo: 1121.5,
        segmentTotalKwh: 61.5,
        activeTenantCount: 3,
        sharePerTenantKwh: 20.5,
        sharePerTenantCost: 328,
      },
    ],
  };

  const sampleWaterBreakdown = {
    calculationVersion:'water-meter-v1', unit:'m3',
    record: {
      id: "607f1f77bcf86cd799439002",
      cycleStart: new Date("2026-05-01"),
      cycleEnd: new Date("2026-05-31"),
      readingFrom: 20,
      readingTo: 28,
      usage: 8,
      ratePerUnit: 50,
      roomTotal: 400,
      tenantsSharing: 2,
      myShare: 200,
    },
  };

  test("toMobileBill with electricityBreakdown and waterBreakdown populates mobile fields correctly", () => {
    const mobileBill = toMobileBill(makeBill(), {
      electricityBreakdown: sampleElectricityBreakdown,
      waterBreakdown: sampleWaterBreakdown,
    });

    expect(Array.isArray(mobileBill.electricity_breakdown)).toBe(true);
    expect(mobileBill.electricity_breakdown.length).toBe(2);
    expect(mobileBill.electricity_breakdown[0]).toEqual(
      expect.objectContaining({
        segment_index: 1,
        occupants: 2,
        reading_from: 1000,
        reading_to: 1060,
        consumption: 60,
        rate: 16,
        share_per_tenant: 480,
        share_per_tenant_kwh: 30,
      }),
    );

    expect(mobileBill.water_breakdown).toEqual(
      expect.objectContaining({
        reading_from: 20,
        reading_to: 28,
        consumption: 8,
        rate: 50,
        total: 400,
        my_share: 200,
        tenants_sharing: 2,
      }),
    );

    expect(mobileBill.utility_breakdowns.electricity).toEqual(sampleElectricityBreakdown);
    expect(mobileBill.utility_breakdowns.water).toEqual(sampleWaterBreakdown);
  });

  test("toMobileBill without breakdowns leaves electricity_breakdown and water_breakdown null/empty", () => {
    const mobileBill = toMobileBill(makeBill());
    expect(mobileBill.electricity_breakdown).toBeNull();
    expect(mobileBill.water_breakdown).toBeNull();
    expect(mobileBill.utility_breakdowns).toEqual({ electricity: null, water: null });
  });
});
