import { toManilaStartOfDay } from '../utils/dateUtils.js';

// Historical Stays may store the Contract's exclusive endpoint or the
// inclusive final day. Both are valid; never round arbitrary drift away.
export function stayContractEndDatesMatch(stayEnd, contractEnd) {
  const stayDay = toManilaStartOfDay(stayEnd)?.valueOf();
  const contractDay = toManilaStartOfDay(contractEnd)?.valueOf();
  if (!Number.isFinite(stayDay) || !Number.isFinite(contractDay)) return false;
  const inclusiveDay = toManilaStartOfDay(new Date(new Date(contractEnd).getTime() - 1))?.valueOf();
  return stayDay === contractDay || stayDay === inclusiveDay;
}

export function assertStayContractEndDates(stay, contract) {
  if (!stayContractEndDatesMatch(stay?.leaseEndDate, contract?.leaseEndDate)) {
    throw Object.assign(new Error('The current stay and contract dates require Admin review.'), {
      code: 'STAY_CONTRACT_DATE_MISMATCH', statusCode: 409,
    });
  }
}

// A later actual check-in must not silently extend an already agreed term.
// Do not alter the Contract or physical occupancy/meter observation dates.
export function resolveCheckInLeaseEndDate(contract, fallbackEndDate) {
  if (!contract) return fallbackEndDate;
  if (!toManilaStartOfDay(contract.leaseEndDate)) {
    throw Object.assign(new Error('The current contract needs a valid lease end date before check-in.'), {
      code: 'CONTRACT_LEASE_END_DATE_REQUIRED', statusCode: 409,
    });
  }
  return contract.leaseEndDate;
}
