import { resolveReservationFinancials, hasSettledAdvanceAndDeposit } from "./depositUtils.js";

describe("server depositUtils - resolveReservationFinancials", () => {
  test("does NOT deduct reservation fee when unpaid or pending", () => {
    const reservation = {
      _id: "res_unpaid_123",
      roomType: "quadruple-sharing",
      monthlyRent: 6300,
      reservationFeeAmount: 2000,
      reservationFeePaymentStatus: "pending",
      initialPaymentStatus: "unpaid",
      status: "pending",
    };

    const financials = resolveReservationFinancials(reservation);

    expect(financials.monthlyRent).toBe(6300);
    expect(financials.advanceRent).toBe(6300);
    expect(financials.securityDeposit).toBe(6300);
    expect(financials.grossTotal).toBe(12600);
    expect(financials.isReservationFeePaid).toBe(false);
    expect(financials.appliedReservationCredit).toBe(0);
    expect(financials.remainingDue).toBe(12600);
    expect(financials.isSettled).toBe(false);
  });

  test("deducts reservation fee ONLY when reservationFeePaymentStatus is verified", () => {
    const reservation = {
      _id: "res_paid_123",
      roomType: "quadruple-sharing",
      monthlyRent: 6300,
      reservationFeeAmount: 2000,
      reservationFeePaymentStatus: "verified",
      initialPaymentStatus: "unpaid",
      status: "pending",
    };

    const financials = resolveReservationFinancials(reservation);

    expect(financials.monthlyRent).toBe(6300);
    expect(financials.advanceRent).toBe(6300);
    expect(financials.securityDeposit).toBe(6300);
    expect(financials.grossTotal).toBe(12600);
    expect(financials.isReservationFeePaid).toBe(true);
    expect(financials.appliedReservationCredit).toBe(2000);
    expect(financials.remainingDue).toBe(10600);
    expect(financials.isSettled).toBe(false);
  });

  test("returns remaining due 0 when initialPaymentStatus is paid", () => {
    const reservation = {
      _id: "res_settled_123",
      roomType: "quadruple-sharing",
      monthlyRent: 6300,
      reservationFeeAmount: 2000,
      reservationFeePaymentStatus: "verified",
      initialPaymentStatus: "paid",
      status: "reserved",
    };

    const financials = resolveReservationFinancials(reservation);

    expect(financials.remainingDue).toBe(0);
    expect(financials.isSettled).toBe(true);
    expect(financials.appliedReservationCredit).toBe(2000);
  });

  test("recognizes legacy reservation fee statuses (settled, completed, paid)", () => {
    const legacySettled = {
      _id: "res_legacy_1",
      monthlyRent: 5000,
      reservationFeeAmount: 1500,
      reservationFeePaymentStatus: "settled",
      initialPaymentStatus: "pending",
      status: "pending",
    };
    const legacyCompleted = {
      _id: "res_legacy_2",
      monthlyRent: 5000,
      reservationFeeAmount: 1500,
      reservationFeePaymentStatus: "completed",
      initialPaymentStatus: "pending",
      status: "pending",
    };
    const legacyPaid = {
      _id: "res_legacy_3",
      monthlyRent: 5000,
      reservationFeeAmount: 1500,
      reservationFeePaymentStatus: "paid",
      initialPaymentStatus: "pending",
      status: "pending",
    };

    expect(resolveReservationFinancials(legacySettled).isReservationFeePaid).toBe(true);
    expect(resolveReservationFinancials(legacySettled).appliedReservationCredit).toBe(1500);
    expect(resolveReservationFinancials(legacyCompleted).isReservationFeePaid).toBe(true);
    expect(resolveReservationFinancials(legacyCompleted).appliedReservationCredit).toBe(1500);
    expect(resolveReservationFinancials(legacyPaid).isReservationFeePaid).toBe(true);
    expect(resolveReservationFinancials(legacyPaid).appliedReservationCredit).toBe(1500);
  });

  test("recognizes payment timestamps as proof of settlement", () => {
    const withTimestamp = {
      _id: "res_ts_1",
      monthlyRent: 7000,
      reservationFeeAmount: 2000,
      reservationFeePaidAt: new Date("2026-08-01"),
      initialPaymentStatus: "unpaid",
      status: "pending",
    };

    const financials = resolveReservationFinancials(withTimestamp);
    expect(financials.isReservationFeePaid).toBe(true);
    expect(financials.appliedReservationCredit).toBe(2000);
    expect(financials.remainingDue).toBe(12000); // (7000 + 7000) - 2000
  });

  describe("hasSettledAdvanceAndDeposit", () => {
    test("returns false when initialPaymentStatus is pending or unpaid", () => {
      expect(hasSettledAdvanceAndDeposit({ initialPaymentStatus: "pending" })).toBe(false);
      expect(hasSettledAdvanceAndDeposit({ initialPaymentStatus: "unpaid" })).toBe(false);
      expect(hasSettledAdvanceAndDeposit(null)).toBe(false);
    });

    test("returns true when initialPaymentStatus is paid", () => {
      expect(hasSettledAdvanceAndDeposit({ initialPaymentStatus: "paid" })).toBe(true);
      expect(hasSettledAdvanceAndDeposit({ initialPaymentStatus: "completed" })).toBe(true);
    });

    test("returns true when paymentStatus is paid_in_full", () => {
      expect(hasSettledAdvanceAndDeposit({ paymentStatus: "paid_in_full" })).toBe(true);
    });

    test("returns true when initialPaymentSettledAt is present", () => {
      expect(hasSettledAdvanceAndDeposit({ initialPaymentSettledAt: new Date() })).toBe(true);
    });
  });
});

