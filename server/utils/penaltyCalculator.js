/**
 * Unified penalty calculation.
 * Both the nightly scheduler job and the admin-triggered applyPenalties
 * controller use this function so the math is always identical.
 */

import dayjs from "dayjs";
import {
  getPenaltyRatePerDay,
  getMaxPenaltyCapPercent,
  resolvePenaltyRatePerDay,
} from "./businessSettings.js";

/**
 * Compute the penalty amount for a single overdue bill.
 *
 * @param {object} bill     - Mongoose bill document (or plain object with same shape)
 * @param {object} settings - Optional pre-fetched settings: { penaltyRatePerDay, maxCapPercent }
 *                            If omitted, settings are fetched from BusinessSettings.
 * @param {Date|dayjs}  now  - Reference "now" — defaults to current time.
 * @returns {{ penalty: number, daysLate: number, ratePerDay: number, capped: boolean }}
 */
export async function computePenalty(bill, settings = null, now = dayjs()) {
  const nowDayjs = dayjs.isDayjs(now) ? now : dayjs(now);

  const [configuredRate, maxCapPercent] = settings
    ? [settings.penaltyRatePerDay, settings.maxCapPercent]
    : await Promise.all([getPenaltyRatePerDay(), getMaxPenaltyCapPercent()]);

  const daysLate = nowDayjs.diff(dayjs(bill.dueDate), "day");

  if (!Number.isFinite(daysLate) || daysLate <= 0) {
    return { penalty: 0, daysLate: 0, ratePerDay: configuredRate, capped: false };
  }

  const ratePerDay = resolvePenaltyRatePerDay(
    bill.penaltyDetails?.ratePerDay,
    configuredRate,
  );

  const rawPenalty = daysLate * ratePerDay;
  const rentBase = bill.charges?.rent || 0;
  const cap = rentBase > 0 ? (rentBase * maxCapPercent) / 100 : Infinity;
  const penalty = Math.min(rawPenalty, cap);

  return {
    penalty,
    daysLate,
    ratePerDay,
    capped: penalty < rawPenalty,
  };
}

/**
 * Fetch shared settings once and return a handle usable for multiple
 * computePenalty calls (avoids N DB fetches in a loop).
 */
export async function fetchPenaltySettings() {
  const [penaltyRatePerDay, maxCapPercent] = await Promise.all([
    getPenaltyRatePerDay(),
    getMaxPenaltyCapPercent(),
  ]);
  return { penaltyRatePerDay, maxCapPercent };
}
