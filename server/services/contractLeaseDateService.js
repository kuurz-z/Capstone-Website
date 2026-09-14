import { getManilaDayjs, toManilaStartOfDay } from '../utils/dateUtils.js';

const contractDateError = (message, code, details = undefined) =>
  Object.assign(new Error(message), { code, statusCode: 422, details });

const validDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Canonical legal-Contract term calculation.
 *
 * Contract validation defines an N-month term as the same calendar instant
 * N months after leaseStartDate. Stay/workspace displays sometimes use an
 * inclusive final day (minus one day); that convention must not leak into
 * legal Contract dates because validateLeaseDuration requires whole months.
 */
export const deriveContractLeaseDates = ({
  leaseStartDate,
  leaseDurationMonths,
}) => {
  const start = validDate(leaseStartDate);
  const duration = Number(leaseDurationMonths);
  if (!start) {
    throw contractDateError(
      "A valid lease start date is required.",
      "CONTRACT_LEASE_START_DATE_INVALID",
      { leaseStartDate: leaseStartDate ?? null },
    );
  }
  if (!Number.isInteger(duration) || duration < 1) {
    throw contractDateError(
      "A positive whole-number lease duration is required.",
      "CONTRACT_LEASE_DURATION_INVALID",
      { leaseDurationMonths: leaseDurationMonths ?? null },
    );
  }
  const end = getManilaDayjs(start).add(duration, "month");
  if (!end.isValid()) {
    throw contractDateError(
      "The Contract lease end date could not be derived.",
      "CONTRACT_LEASE_END_DATE_INVALID",
    );
  }
  return {
    leaseStartDate: start,
    leaseEndDate: end.toDate(),
    leaseDurationMonths: duration,
  };
};

export const deriveAdvanceCoverageDates = (leaseStartDate) => {
  const start = validDate(leaseStartDate);
  if (!start) {
    throw contractDateError(
      "A valid lease start date is required for advance-rent coverage.",
      "CONTRACT_ADVANCE_COVERAGE_START_INVALID",
    );
  }
  return {
    advanceCoverageStart: start,
    advanceCoverageEnd: getManilaDayjs(start).add(1, "month").subtract(1, "day").toDate(),
  };
};

// A Stay uses an inclusive final day; its legal Contract uses the exclusive
// calendar anniversary. Validate the endpoint rather than rounding a diff.
export function resolveRenewalTerm({ leaseStartDate, leaseEndDate, leaseDurationMonths }) {
  const start = toManilaStartOfDay(leaseStartDate);
  const end = leaseEndDate == null ? null : toManilaStartOfDay(leaseEndDate);
  if (!start || (leaseEndDate != null && !end)) {
    throw contractDateError('Valid renewal dates are required.', 'INVALID_RENEWAL_DATES');
  }
  const hasMonths = leaseDurationMonths != null;
  const delta = end ? (end.year() - start.year()) * 12 + end.month() - start.month() : 0;
  const candidates = hasMonths ? [Number(leaseDurationMonths)] : [delta, delta + 1];
  for (const months of candidates) {
    if (!Number.isInteger(months) || months < 1) continue;
    const legal = deriveContractLeaseDates({ leaseStartDate: start.toDate(), leaseDurationMonths: months });
    const inclusiveEnd = getManilaDayjs(legal.leaseEndDate).subtract(1, 'millisecond');
    const legacyExclusive = deriveContractLeaseDates({ leaseStartDate, leaseDurationMonths: months }).leaseEndDate;
    if (end && end.valueOf() !== inclusiveEnd.startOf('day').valueOf() &&
        new Date(leaseEndDate).getTime() !== legacyExclusive.getTime()) continue;
    return { ...legal, stayEndDate: inclusiveEnd.toDate() };
  }
  throw contractDateError('Renewal dates do not match the requested whole-month term.', 'LEASE_DURATION_CONFLICT', {
    leaseStartDate, leaseEndDate, requestedMonths: leaseDurationMonths ?? null,
  });
}
