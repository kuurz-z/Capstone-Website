import dayjs from "dayjs";

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
export const UTILITY_CYCLE_DAY = 15;
export const UTILITY_CHARGE_FIELDS = ["electricity", "water"];

export function sumBillCharges(charges = {}) {
  return roundMoney(
    (charges.rent || 0) +
    (charges.electricity || 0) +
    (charges.water || 0) +
    (charges.applianceFees || 0) +
    (charges.corkageFees || 0) +
    (charges.penalty || 0) -
    (charges.discount || 0),
  );
}

export function getUtilityDispatchEntry(billLike = {}, utilityType) {
  const charges = billLike?.charges || {};
  const amount = Number(charges?.[utilityType] || 0);
  const entry = billLike?.utilityDispatch?.[utilityType];
  const hasExplicitState = entry?.state === "draft" || entry?.state === "sent";

  if (hasExplicitState) {
    return {
      state: entry.state,
      periodId: entry.periodId || null,
      publishedAt: entry.publishedAt || null,
      issuedAt: entry.issuedAt || null,
      dueDate: entry.dueDate || null,
      amount: Number(entry.amount ?? amount ?? 0),
    };
  }

  const legacySent =
    amount > 0 &&
    billLike?.status &&
    billLike.status !== "draft" &&
    (billLike.sentAt || billLike.issuedAt || billLike.dueDate);

  return {
    state: legacySent ? "sent" : "draft",
    periodId: null,
    publishedAt: legacySent ? billLike.sentAt || billLike.issuedAt || null : null,
    issuedAt: legacySent ? billLike.issuedAt || billLike.sentAt || null : null,
    dueDate: legacySent ? billLike.dueDate || null : null,
    amount,
  };
}

export function isUtilityChargeVisible(billLike = {}, utilityType) {
  const amount = Number(billLike?.charges?.[utilityType] || 0);
  if (amount <= 0) return false;
  return getUtilityDispatchEntry(billLike, utilityType).state === "sent";
}

export function getVisibleBillCharges(billLike = {}) {
  const charges = {
    rent: Number(billLike?.charges?.rent || 0),
    electricity: Number(billLike?.charges?.electricity || 0),
    water: Number(billLike?.charges?.water || 0),
    applianceFees: Number(billLike?.charges?.applianceFees || 0),
    corkageFees: Number(billLike?.charges?.corkageFees || 0),
    penalty: Number(billLike?.charges?.penalty || 0),
    discount: Number(billLike?.charges?.discount || 0),
  };

  for (const utilityType of UTILITY_CHARGE_FIELDS) {
    if (!isUtilityChargeVisible(billLike, utilityType)) {
      charges[utilityType] = 0;
    }
  }

  return charges;
}

export function getVisibleBillIssuedAt(billLike = {}) {
  const baseVisibleAmount = roundMoney(
    (billLike?.charges?.rent || 0) +
      (billLike?.charges?.applianceFees || 0) +
      (billLike?.charges?.corkageFees || 0) +
      (billLike?.charges?.penalty || 0) -
      (billLike?.charges?.discount || 0),
  );

  if (baseVisibleAmount > 0 && (billLike?.issuedAt || billLike?.sentAt)) {
    return billLike.issuedAt || billLike.sentAt || null;
  }

  const visibleDispatches = UTILITY_CHARGE_FIELDS.map((utilityType) =>
    getUtilityDispatchEntry(billLike, utilityType),
  ).filter((entry) => entry.state === "sent" && entry.amount > 0);

  if (visibleDispatches.length === 0) {
    return billLike?.issuedAt || billLike?.sentAt || null;
  }

  return visibleDispatches
    .map((entry) => entry.issuedAt || entry.publishedAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
}

export function getVisibleBillDueDate(billLike = {}) {
  const baseVisibleAmount = roundMoney(
    (billLike?.charges?.rent || 0) +
      (billLike?.charges?.applianceFees || 0) +
      (billLike?.charges?.corkageFees || 0) +
      (billLike?.charges?.penalty || 0) -
      (billLike?.charges?.discount || 0),
  );

  if (baseVisibleAmount > 0 && billLike?.dueDate) {
    return billLike.dueDate;
  }

  const visibleDispatches = UTILITY_CHARGE_FIELDS.map((utilityType) =>
    getUtilityDispatchEntry(billLike, utilityType),
  ).filter((entry) => entry.state === "sent" && entry.amount > 0 && entry.dueDate);

  if (visibleDispatches.length === 0) {
    return billLike?.dueDate || null;
  }

  return visibleDispatches
    .map((entry) => entry.dueDate)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
}

export function getVisibleBillSnapshot(billLike = {}, now = new Date()) {
  const charges = getVisibleBillCharges(billLike);
  const grossAmount = sumBillCharges(charges);
  const totalAmount = roundMoney(
    Math.max(grossAmount - (billLike?.reservationCreditApplied || 0), 0),
  );
  const paidAmount = Number(billLike?.paidAmount || 0);
  const remainingAmount = roundMoney(Math.max(totalAmount - paidAmount, 0));
  const dueDate = getVisibleBillDueDate(billLike);
  const issuedAt = getVisibleBillIssuedAt(billLike);
  const statusSeed =
    billLike?.status === "draft" && grossAmount > 0 ? "pending" : billLike?.status;
  const status = resolveBillStatus(
    {
      ...billLike,
      status: statusSeed,
      charges,
      totalAmount,
      paidAmount,
      dueDate,
    },
    now,
  );

  return {
    charges,
    grossAmount,
    totalAmount,
    paidAmount,
    remainingAmount,
    dueDate,
    issuedAt,
    status,
  };
}

export function getBillRemainingAmount(billLike = {}) {
  return roundMoney(
    Math.max((billLike.totalAmount || 0) - (billLike.paidAmount || 0), 0),
  );
}

export function resolveBillStatus(billLike, now = new Date()) {
  if (billLike.status === "draft") return "draft";

  const remaining = getBillRemainingAmount(billLike);
  if (remaining <= 0) return "paid";

  if ((billLike.paidAmount || 0) > 0) {
    if (billLike.dueDate && new Date(billLike.dueDate) < now) {
      return "overdue";
    }
    return "partially-paid";
  }

  if (billLike.dueDate && new Date(billLike.dueDate) < now) {
    return "overdue";
  }

  return "pending";
}

export function syncBillAmounts(bill, { preserveStatus = false } = {}) {
  const snapshot = getVisibleBillSnapshot(bill);

  bill.grossAmount = snapshot.grossAmount;
  bill.totalAmount = snapshot.totalAmount;
  bill.remainingAmount = snapshot.remainingAmount;

  if (!preserveStatus) {
    bill.status = snapshot.status;
  }

  if (bill.status === "paid" && !bill.paymentDate) {
    bill.paymentDate = new Date();
  }

  if (bill.status !== "paid" && bill.paymentDate && bill.remainingAmount > 0) {
    bill.paymentDate = null;
  }

  return bill;
}

export function buildBillingCycle(checkInDate, cycleIndex = 0) {
  const start = dayjs(checkInDate).add(cycleIndex, "month");
  const end = start.add(1, "month");

  return {
    billingMonth: start.startOf("day").toDate(),
    billingCycleStart: start.startOf("day").toDate(),
    billingCycleEnd: end.startOf("day").toDate(),
    dueDate: end.startOf("day").toDate(),
  };
}

export function getNextUtilityCycleBoundary(dateLike, cycleDay = UTILITY_CYCLE_DAY) {
  const anchor = dayjs(dateLike).startOf("day");
  if (!anchor.isValid()) {
    return null;
  }

  const sameMonthBoundary = anchor.date(cycleDay).startOf("day");
  if (anchor.isBefore(sameMonthBoundary)) {
    return sameMonthBoundary.toDate();
  }

  return sameMonthBoundary.add(1, "month").startOf("day").toDate();
}

export function getPreviousUtilityCycleBoundary(dateLike, cycleDay = UTILITY_CYCLE_DAY) {
  const anchor = dayjs(dateLike).startOf("day");
  if (!anchor.isValid()) {
    return null;
  }

  const sameMonthBoundary = anchor.date(cycleDay).startOf("day");
  if (anchor.isSame(sameMonthBoundary) || anchor.isAfter(sameMonthBoundary)) {
    return sameMonthBoundary.toDate();
  }

  return sameMonthBoundary.subtract(1, "month").startOf("day").toDate();
}

export function getUtilityTargetCloseDate(startDate, cycleDay = UTILITY_CYCLE_DAY) {
  return getNextUtilityCycleBoundary(startDate, cycleDay);
}

export function isSameUtilityCycleBoundary(dateA, dateB) {
  if (!dateA || !dateB) return false;
  const left = dayjs(dateA).startOf("day");
  const right = dayjs(dateB).startOf("day");
  if (!left.isValid() || !right.isValid()) return false;
  return left.isSame(right);
}

export function resolveUtilityAutoOpenStartDate({
  anchorDate,
  previousPeriodEndDate = null,
  cycleDay = UTILITY_CYCLE_DAY,
} = {}) {
  if (previousPeriodEndDate) {
    const normalizedPreviousEnd = dayjs(previousPeriodEndDate).startOf("day");
    if (normalizedPreviousEnd.isValid()) {
      return normalizedPreviousEnd.toDate();
    }
  }

  return getPreviousUtilityCycleBoundary(anchorDate, cycleDay);
}

export function getUtilityCycleFromPeriod(periodLike = {}) {
  const cycleStart = periodLike?.startDate ? dayjs(periodLike.startDate).startOf("day").toDate() : null;
  const cycleEnd = periodLike?.endDate ? dayjs(periodLike.endDate).startOf("day").toDate() : null;
  const readingDate = cycleEnd;

  return {
    utilityCycleStart: cycleStart,
    utilityCycleEnd: cycleEnd,
    utilityReadingDate: readingDate,
  };
}

export function getNextWorkingDay(date, { includeSameDay = false } = {}) {
  let cursor = dayjs(date).startOf("day");
  if (!includeSameDay) {
    cursor = cursor.add(1, "day");
  }

  while (cursor.day() === 0 || cursor.day() === 6) {
    cursor = cursor.add(1, "day");
  }

  return cursor.toDate();
}

export function getUtilityIssueDate({ readingDate, finalizedAt = new Date() } = {}) {
  const finalizedDay = dayjs(finalizedAt).startOf("day");
  const earliestIssueDay = readingDate
    ? dayjs(readingDate).startOf("day").add(1, "day")
    : finalizedDay;
  const baseDay = finalizedDay.isAfter(earliestIssueDay) ? finalizedDay : earliestIssueDay;

  return getNextWorkingDay(baseDay.toDate(), { includeSameDay: true });
}

export function getUtilityDueDate(issueDate) {
  return dayjs(issueDate).startOf("day").add(7, "day").toDate();
}

export function getReservationCreditAvailable(reservation) {
  if (!reservation) return 0;
  if (reservation.paymentStatus !== "paid") return 0;
  if (reservation.reservationCreditConsumedAt || reservation.reservationCreditAppliedBillId) return 0;
  return roundMoney(reservation.reservationFeeAmount || 0);
}
