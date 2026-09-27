/**
 * ============================================================================
 * DEPOSIT UTILITY — Server-side canonical formula
 * ============================================================================
 * Single source of truth for security deposit resolution and move-in cash-out
 * computation. All controllers, services, and action handlers MUST use these
 * helpers instead of ad-hoc derivations from monthlyRent or totalPrice.
 *
 * Canonical formula (matches _helpers.js + ReservationPaymentStep.jsx):
 *   securityDeposit    = monthlyRent × 1
 *   advanceRent        = monthlyRent × 1
 *   grossTotal         = monthlyRent × 2
 *   netAmountDue       = grossTotal − reservationFeeAmount
 */

export const DEFAULT_RESERVATION_FEE = 2000;

/**
 * Authoritative server-side financial resolver for any reservation.
 * Calculates monthlyRent, advanceRent, securityDeposit, grossTotal, and remainingDue
 * strictly based on the chosen room and room type, self-healing any stale defaults.
 *
 * @param {object} reservation — Mongoose document or plain object
 * @returns {{ monthlyRent: number, advanceRent: number, securityDeposit: number, grossTotal: number, reservationFeeAmount: number, remainingDue: number, isSettled: boolean }}
 */
export function resolveReservationFinancials(reservation = {}) {
  if (!reservation) {
    return {
      monthlyRent: 0,
      advanceRent: 0,
      securityDeposit: 0,
      grossTotal: 0,
      reservationFeeAmount: DEFAULT_RESERVATION_FEE,
      remainingDue: 0,
      isSettled: false,
    };
  }

  const room =
    typeof reservation.roomId === "object" && reservation.roomId !== null
      ? reservation.roomId
      : typeof reservation.room === "object" && reservation.room !== null
        ? reservation.room
        : {};

  const rawRoomType = String(
    room.type ||
      reservation.roomType ||
      reservation.preferredRoomType ||
      reservation.selectedBed?.roomType ||
      room.name ||
      reservation.roomName ||
      "",
  ).toLowerCase();

  const isPrivate = rawRoomType.includes("private") || room.capacity === 1;
  const isDouble = rawRoomType.includes("double") || room.capacity === 2;

  const duration = Number(
    reservation.leaseDuration ||
      reservation.pricingSnapshot?.leaseDurationMonths ||
      0,
  );
  const isShortTerm = Number.isFinite(duration) && duration > 0 && duration < 6;

  // 1. Determine authoritative monthly rent based on chosen room & snapshots
  let monthlyRent = 0;
  const snapshotCandidates = [
    reservation.pricingSnapshot?.finalMonthlyRate,
    reservation.contract?.approvedMonthlyRate,
    reservation.pricingDisplay?.finalMonthlyRate,
    reservation.monthlyRent,
    reservation.totalPrice,
  ];

  for (const candidate of snapshotCandidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) {
      monthlyRent = num;
      break;
    }
  }

  // Self-heal room-type rate anomalies & align with lease duration tiers
  if (isPrivate) {
    const isCustomSnapshot = Boolean(
      reservation.pricingSnapshot?.finalMonthlyRate ||
      reservation.contract?.approvedMonthlyRate,
    );
    if (!isCustomSnapshot) {
      if (monthlyRent <= 0 || monthlyRent < 10000 || (!isShortTerm && monthlyRent === 14400)) {
        monthlyRent = isShortTerm
          ? Number(room.shortTermRate || 14400)
          : Number(room.monthlyPrice || (room.price && room.price <= 13500 ? room.price : 13500));
      }
    }
  } else if (isDouble) {
    const isCustomSnapshot = Boolean(
      reservation.pricingSnapshot?.finalMonthlyRate ||
      reservation.contract?.approvedMonthlyRate,
    );
    if (!isCustomSnapshot) {
      if (monthlyRent <= 0 || monthlyRent < 7000 || (!isShortTerm && monthlyRent === 8000)) {
        monthlyRent = isShortTerm
          ? Number(room.shortTermRate || 8000)
          : Number(room.monthlyPrice || (room.price && room.price <= 7200 ? room.price : 7200));
      }
    }
  } else {
    // Quadruple or general sharing
    if (monthlyRent <= 0) {
      monthlyRent = isShortTerm
        ? Number(room.shortTermRate || 6300)
        : Number(room.monthlyPrice || (room.price && room.price <= 5400 ? room.price : 5400));
    }
  }

  const reservationFeeAmount = Number(
    reservation.reservationFeeAmount ||
      reservation.pricingSnapshot?.reservationFeeAmount ||
      DEFAULT_RESERVATION_FEE,
  );

  // Advance Rent is 1 month rent (prefer authoritative pricingSnapshot when present)
  let advanceRent =
    Number(reservation.pricingSnapshot?.advanceRentAmount) || monthlyRent;
  const rawAdvance = Number(reservation.moveInCashOut?.monthlyAdvance);
  if (
    !reservation.pricingSnapshot?.advanceRentAmount &&
    Number.isFinite(rawAdvance) &&
    rawAdvance > 0 &&
    Math.abs(rawAdvance - monthlyRent) < 1
  ) {
    advanceRent = rawAdvance;
  }

  // Security Deposit is 1 month rent (prefer authoritative pricingSnapshot when present)
  let securityDeposit =
    Number(reservation.pricingSnapshot?.securityDepositAmount) || monthlyRent;
  const rawDeposit = Number(
    reservation.moveInCashOut?.securityDeposit ?? reservation.securityDeposit,
  );
  if (
    !reservation.pricingSnapshot?.securityDepositAmount &&
    Number.isFinite(rawDeposit) &&
    rawDeposit > 0 &&
    Math.abs(rawDeposit - monthlyRent) < 1
  ) {
    securityDeposit = rawDeposit;
  }

  const feeStatus = String(reservation.reservationFeePaymentStatus || "").trim().toLowerCase();
  const paymentStatus = String(reservation.paymentStatus || "").trim().toLowerCase();
  const initialStatus = String(reservation.initialPaymentStatus || "").trim().toLowerCase();
  const generalStatus = String(reservation.status || reservation.reservationStatus || "").trim().toLowerCase();

  const isFeePaidStatus = ["verified", "paid", "settled", "completed", "paid_in_full"].includes(feeStatus);
  const isGeneralPaymentSettled =
    ["paid", "paid_in_full", "settled", "completed"].includes(paymentStatus) ||
    ["paid", "paid_in_full", "settled", "completed"].includes(initialStatus);
  const hasPaymentTimestamp = Boolean(
    reservation.reservationFeePaidAt ||
    reservation.initialPaymentSettledAt ||
    reservation.initialPaymentPaidAt ||
    reservation.initialPaymentDate
  );

  const isReservationFeePaid =
    isFeePaidStatus ||
    generalStatus === "reserved" ||
    generalStatus === "ready_for_move_in" ||
    isGeneralPaymentSettled ||
    hasPaymentTimestamp;

  const appliedReservationCredit = isReservationFeePaid ? reservationFeeAmount : 0;

  const grossTotal = advanceRent + securityDeposit;
  const remainingDue = Math.max(0, grossTotal - appliedReservationCredit);
  const isSettled =
    ["paid", "paid_in_full", "settled", "completed"].includes(initialStatus) ||
    paymentStatus === "paid_in_full" ||
    Boolean(reservation.initialPaymentSettledAt);

  return {
    monthlyRent,
    advanceRent,
    securityDeposit,
    grossTotal,
    reservationFeeAmount,
    appliedReservationCredit,
    isReservationFeePaid,
    remainingDue: isSettled ? 0 : remainingDue,
    isSettled,
  };
}

/**
 * Resolves the security deposit for a reservation.
 *
 * @param {object} reservation — Mongoose document or plain object
 * @returns {number}
 */
export function resolveSecurityDeposit(reservation = {}) {
  const financials = resolveReservationFinancials(reservation);
  return financials.securityDeposit;
}

/**
 * Computes the canonical move-in cash-out breakdown.
 * Use this for previews and new reservations (where no stored value exists yet).
 *
 * @param {number} monthlyRent
 * @param {number} [reservationFeeAmount]
 * @returns {{ monthlyAdvance, securityDeposit, grossTotal, reservationFeeDeductible, netAmountDue }}
 */
export function computeMoveInCashOut(
  monthlyRent,
  reservationFeeAmount = DEFAULT_RESERVATION_FEE,
) {
  const monthly = Math.max(0, Number(monthlyRent) || 0);
  const fee = Math.max(0, Number(reservationFeeAmount) || DEFAULT_RESERVATION_FEE);
  const securityDeposit = monthly; // 1× monthly
  const grossTotal = monthly + securityDeposit; // 2× monthly
  const netAmountDue = Math.max(0, grossTotal - fee);

  return {
    monthlyAdvance: monthly,
    securityDeposit,
    grossTotal,
    reservationFeeDeductible: fee,
    netAmountDue,
  };
}

/**
 * Checks if the reservation has fully settled the 1-month advance rent and security deposit.
 * When settled, reservation cancellation is locked.
 *
 * @param {object} reservation — Mongoose document or plain object
 * @returns {boolean}
 */
export function hasSettledAdvanceAndDeposit(reservation = {}) {
  if (!reservation) return false;
  const initialStatus = String(reservation.initialPaymentStatus || "").trim().toLowerCase();
  const paymentStatus = String(reservation.paymentStatus || "").trim().toLowerCase();
  if (["paid", "paid_in_full", "settled", "completed"].includes(initialStatus)) return true;
  if (paymentStatus === "paid_in_full") return true;
  if (Boolean(reservation.initialPaymentSettledAt)) return true;
  const financials = resolveReservationFinancials(reservation);
  return Boolean(financials.isSettled);
}
