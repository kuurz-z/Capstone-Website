/**
 * ============================================================================
 * BILLING POLICY SERVICE
 * ============================================================================
 *
 * Core business rules, calculation logic, and status resolvers for billing.
 */

import dayjs from "dayjs";
import { getManilaDayjs, toManilaStartOfDay } from "../../utils/dateUtils.js";

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
export const UTILITY_CYCLE_DAY = 15;
export const UTILITY_CHARGE_FIELDS = ["electricity", "water"];
export const RENT_GENERATION_LEAD_DAYS = 14;

function normalizeBillingDate(dateLike) {
  const normalized = toManilaStartOfDay(dateLike);
  return normalized && normalized.isValid() ? normalized : null;
}

export function sumBillCharges(charges = {}) {
  return roundMoney(
    (charges.rent || 0) +
    (charges.electricity || 0) +
    (charges.water || 0) +
    (charges.applianceFees || 0) +
    (charges.corkageFees || 0) +
    (charges.penalty || 0) +
    // Security-deposit component (transfer_settlement Bills only today).
    // Additive like every other positive charge; absent/0 on all legacy Bills.
    (charges.securityDeposit || 0) -
    (charges.discount || 0),
  );
}

export function getUtilityDispatchEntry(billLike = {}, utilityType) {
  if (utilityType === 'water' && billLike.waterAllocations?.length) {
    const sent = billLike.waterAllocations.filter(a => a.state === 'sent');
    const latest = [...sent].sort((a,b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))[0];
    return {state: sent.length ? 'sent' : 'draft', periodId: latest?.utilityPeriodId || null,
      publishedAt: latest?.publishedAt || null, issuedAt: latest?.issuedAt || null,
      dueDate: latest?.dueDate || null,
      amount: roundMoney((sent.length ? sent : billLike.waterAllocations).reduce((s,a) => s + Number(a.amount),0))};
  }
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
    securityDeposit: Number(billLike?.charges?.securityDeposit || 0),
    discount: Number(billLike?.charges?.discount || 0),
  };

  for (const utilityType of UTILITY_CHARGE_FIELDS) {
    if (!isUtilityChargeVisible(billLike, utilityType)) {
      charges[utilityType] = 0;
    }
  }

  if (billLike.waterAllocations?.length) {
    charges.water = roundMoney(billLike.waterAllocations.filter(a => a.state === 'sent').reduce((s,a) => s + Number(a.amount), 0));
  }

  return charges;
}

export function getVisibleBillIssuedAt(billLike = {}) {
  const baseVisibleAmount = roundMoney(
    (billLike?.charges?.rent || 0) +
      (billLike?.charges?.applianceFees || 0) +
      (billLike?.charges?.corkageFees || 0) +
      (billLike?.charges?.penalty || 0) +
      (billLike?.charges?.securityDeposit || 0) -
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
      (billLike?.charges?.penalty || 0) +
      (billLike?.charges?.securityDeposit || 0) -
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

  // A voided Bill (e.g. an unpaid Scheduled Room Transfer Balance Bill whose
  // schedule was cancelled before cutover) keeps its historical total, charge
  // breakdown and paidAmount for audit, but is NEVER outstanding. Its
  // tenant-facing remaining balance is zero on every surface (web + mobile),
  // and syncBillAmounts() must not recompute total - paid back into it.
  if (billLike?.status === "voided") {
    const grossAmount = sumBillCharges(charges);
    const totalAmount = roundMoney(
      Math.max(grossAmount - (billLike?.reservationCreditApplied || 0), 0),
    );
    return {
      charges,
      grossAmount,
      totalAmount,
      paidAmount: roundMoney(billLike?.paidAmount || 0),
      remainingAmount: 0,
      dueDate: getVisibleBillDueDate(billLike),
      issuedAt: getVisibleBillIssuedAt(billLike),
      status: "voided",
    };
  }

  if (billLike?.billType === "initial_payment") {
    const breakdownGross = Number(billLike?.initialPaymentBreakdown?.grossInitialAmount || 0);
    const breakdownTotal = Number(billLike?.initialPaymentBreakdown?.initialPaymentTotal || 0);
    const grossAmount = roundMoney(
      breakdownGross > 0
        ? breakdownGross
        : (billLike?.grossAmount || billLike?.totalAmount || 0),
    );
    const totalAmount = roundMoney(
      breakdownTotal > 0
        ? breakdownTotal
        : (billLike?.totalAmount || grossAmount || 0),
    );
    const paidAmount = roundMoney(billLike?.paidAmount || 0);
    const remainingAmount = roundMoney(Math.max(totalAmount - paidAmount, 0));
    const status = resolveBillStatus(
      { ...billLike, totalAmount, paidAmount, remainingAmount },
      now,
    );
    return {
      charges,
      grossAmount,
      totalAmount,
      paidAmount,
      remainingAmount,
      dueDate: billLike?.dueDate || null,
      issuedAt: billLike?.issuedAt || billLike?.createdAt || null,
      status,
    };
  }
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

/**
 * Resolve the authoritative paymentState dimension from a bill snapshot.
 * Pure function — does not mutate.
 * @param {Object} billLike
 * @returns {"unpaid"|"partially-paid"|"paid"}
 */
export function resolvePaymentState(billLike) {
  const remaining = getBillRemainingAmount(billLike);
  if (remaining <= 0) return "paid";
  if ((billLike.paidAmount || 0) > 0) return "partially-paid";
  return "unpaid";
}

/**
 * Resolve the authoritative dueState dimension from a bill snapshot.
 * Pure function — does not mutate.
 * @param {Object} billLike
 * @param {Date} [now]
 * @returns {"current"|"overdue"}
 */
export function resolveDueState(billLike, now = new Date()) {
  if (billLike.dueDate && new Date(billLike.dueDate) < now) {
    return "overdue";
  }
  return "current";
}

export function syncBillAmounts(bill, { preserveStatus = false, now = new Date(), releasing = false } = {}) {
  // bill.isNew is Mongoose's own "not yet saved" flag — true only for a
  // document built via `new Bill(...)` and not yet persisted. Plain objects
  // (as used by this file's own unit tests, or any legacy-shaped record)
  // simply have it undefined/falsy, which is the correct, safe default.
  const isFreshlyConstructedDocument = bill.isNew === true;

  const snapshot = getVisibleBillSnapshot(bill, now);

  bill.grossAmount = snapshot.grossAmount;
  bill.totalAmount = snapshot.totalAmount;
  bill.remainingAmount = snapshot.remainingAmount;

  // Phase 3: Write the authoritative independent state dimensions.
  // These are written lazily on every sync — no migration script required.
  bill.paymentState = resolvePaymentState(bill);
  bill.dueState = resolveDueState(bill, now);
  // publicationState is set explicitly by publish operations (rentBillingController, utilityBillFlow);
  // syncBillAmounts preserves the existing value and only initialises it if missing.
  if (!bill.publicationState) {
    // Infer from legacy status for existing documents
    bill.publicationState = bill.status === "draft" ? "draft" : "published";
  }

  if (!preserveStatus) {
    bill.status = snapshot.status;
  }

  // releasedAt: the immutable, first-ever tenant-visible timestamp for this
  // bill (see the field doc comment in models/Bill.js). syncBillAmounts()
  // is the one shared choke point every bill writer and every "send"/
  // "publish" action already calls, so this is where the write lives —
  // but it only actually fires under two provable conditions:
  //
  //   1. isFreshlyConstructedDocument (bill.isNew) — a brand-new document's
  //      very first sync. Rent bills are created directly as "pending",
  //      never "draft" (proven in Phase 1 of the release-lifecycle
  //      investigation), so for them creation IS the release event.
  //
  //   2. releasing: true — an explicit signal passed ONLY by the two
  //      functions that perform the actual draft -> published transition
  //      for utility bills (sendDraftUtilityBills, sendUtilityPeriodBills
  //      in utils/utilityBillFlow.js). This can't be inferred from
  //      `bill.status` here: those callers already flip bill.status (or
  //      just the per-utility utilityDispatch state) to non-draft BEFORE
  //      calling syncBillAmounts, so by the time this function runs, the
  //      "was it draft a moment ago" evidence is already gone from
  //      bill.status alone — and resolveBillStatus() never moves a bill
  //      *out* of "draft" on its own (it's a hard early-exit guard), so
  //      inferring the transition from the resolved snapshot doesn't work
  //      either. An explicit flag from the actual publish action is the
  //      only reliable signal.
  //
  // Deliberately EXCLUDES the case where an older bill that was already
  // non-draft before this feature existed gets re-synced by something
  // unrelated (a payment update, the daily overdue cron, an admin edit)
  // years later — that must NOT silently backfill releasedAt = today, which
  // would fabricate a release date. Those bills correctly stay
  // releasedAt: null until real historical evidence is provided (Phase 7 —
  // no createdAt/billingCycleStart/dueDate/meter-date backfill, ever).
  if (
    !bill.releasedAt &&
    bill.status !== "draft" &&
    (isFreshlyConstructedDocument || releasing)
  ) {
    bill.releasedAt = now;
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
  const start = toManilaStartOfDay(checkInDate).add(cycleIndex, "month");
  const end = start.add(1, "month");

  return {
    billingMonth: start.toDate(),
    billingCycleStart: start.toDate(),
    billingCycleEnd: end.toDate(),
    dueDate: end.toDate(),
  };
}

export function buildRentBillingCycle(moveInDate, cycleIndex = 0) {
  const start = toManilaStartOfDay(moveInDate).add(cycleIndex, "month");
  const end = start.add(1, "month");
  // Recurring due date is on the 1st day of the rental period (move-in anniversary date).
  const dueDate = start.toDate();
  const generationDate = start
    .subtract(RENT_GENERATION_LEAD_DAYS, "day")
    .toDate();

  return {
    billingMonth: start.toDate(),
    billingCycleStart: start.toDate(),
    billingCycleEnd: end.toDate(),
    dueDate,
    generationDate,
    cycleIndex,
  };
}

export function resolveCurrentBillingCycle(checkInDate, referenceDate = new Date()) {
  const anchor = normalizeBillingDate(checkInDate);
  const reference = normalizeBillingDate(referenceDate);
  if (!anchor || !reference) return null;

  let cycleStart = anchor;
  let cycleIndex = 0;
  let nextCycleStart = cycleStart.add(1, "month");

  while (!nextCycleStart.isAfter(reference)) {
    cycleStart = nextCycleStart;
    cycleIndex += 1;
    nextCycleStart = cycleStart.add(1, "month");
  }

  return {
    billingMonth: cycleStart.toDate(),
    billingCycleStart: cycleStart.toDate(),
    billingCycleEnd: nextCycleStart.toDate(),
    dueDate: nextCycleStart.toDate(),
    cycleIndex,
  };
}

export function resolveCurrentRentBillingCycle(moveInDate, referenceDate = new Date()) {
  const anchor = normalizeBillingDate(moveInDate);
  const reference = normalizeBillingDate(referenceDate);
  if (!anchor || !reference) return null;

  let cycleStart = anchor;
  let cycleIndex = 0;
  let nextCycleStart = cycleStart.add(1, "month");

  while (!nextCycleStart.isAfter(reference)) {
    cycleStart = nextCycleStart;
    cycleIndex += 1;
    nextCycleStart = cycleStart.add(1, "month");
  }

  // Cycle index 0 is the first rental period, already covered by advance
  // rent collected at move-in — the first *regular* rent bill must start
  // at the second period.
  return buildRentBillingCycle(anchor.toDate(), Math.max(1, cycleIndex));
}

export function resolveVisibleRentBillingCycle(moveInDate, referenceDate = new Date()) {
  const anchor = normalizeBillingDate(moveInDate);
  const reference = normalizeBillingDate(referenceDate);
  if (!anchor || !reference) return null;

  // Cycle index 0 (the first rental period) is covered by advance rent
  // collected at move-in; the first regular bill is for cycle index 1.
  let cycleIndex = 1;
  let cycle = buildRentBillingCycle(anchor.toDate(), cycleIndex);

  if (reference.isBefore(dayjs(cycle.generationDate).startOf("day"))) {
    return null;
  }

  while (true) {
    const nextCycle = buildRentBillingCycle(anchor.toDate(), cycleIndex + 1);
    if (reference.isBefore(dayjs(nextCycle.generationDate).startOf("day"))) {
      return cycle;
    }
    cycleIndex += 1;
    cycle = nextCycle;
  }
}

export function getReservationRecurringFeeEntries(reservation = {}) {
  const customCharges = Array.isArray(reservation?.customCharges)
    ? reservation.customCharges
        .map((charge) => ({
          name: String(charge?.name || "").trim(),
          amount: roundMoney(charge?.amount || 0),
        }))
        .filter((charge) => charge.name && charge.amount > 0)
    : [];

  let applianceEntries = [];
  if (Array.isArray(reservation?.selectedAppliances)) {
    applianceEntries = reservation.selectedAppliances
      .filter(
        (item) =>
          Number(item?.quantity) > 0 && String(item?.name || "").trim().length > 0,
      )
      .map((item) => ({
        name: `${String(item.name).trim()} (${Number(item.quantity)}x)`,
        amount: roundMoney(Number(item.quantity) * Number(item.price || 200)),
      }))
      .filter((entry) => entry.amount > 0);
  }

  if (applianceEntries.length === 0) {
    const legacyApplianceFees = roundMoney(reservation?.applianceFees || 0);
    if (legacyApplianceFees > 0) {
      applianceEntries = [
        {
          name: "Appliance Fees",
          amount: legacyApplianceFees,
        },
      ];
    }
  }

  return [...customCharges, ...applianceEntries];
}

export function getReservationRecurringFees(reservation = {}) {
  const additionalCharges = getReservationRecurringFeeEntries(reservation);
  const applianceFees = roundMoney(
    additionalCharges.reduce(
      (sum, charge) => sum + Number(charge.amount || 0),
      0,
    ),
  );

  return {
    applianceFees,
    additionalCharges,
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
  // Reservation fee credit belongs exclusively to the initial move-in payment
  // (advance rent + security deposit) via structuredInitialPaymentService.
  // Regular monthly rent and utility bills must never absorb or deduct reservation credit.
  return 0;
}
