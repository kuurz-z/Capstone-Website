import { getUtilityDispatchEntry } from './billingPolicy.js';

export const WATER_METER_VERSION = 'water-meter-v1';
export const WATER_LEGACY_VERSION = 'water-occupancy-legacy';
export function waterCalculationVersion(period) {
  return period?.calculationVersion || WATER_LEGACY_VERSION;
}

// A force flag must never bypass financial history protection.
export function assertUtilityHistoryMutable(bills, utilityType) {
  if (bills.some((bill) => bill.releasedAt || bill.sentAt || bill.issuedAt ||
    Number(bill.paidAmount || 0) > 0 || ['paid', 'partially-paid'].includes(bill.status) ||
    getUtilityDispatchEntry(bill, utilityType).state === 'sent')) {
    throw Object.assign(new Error('Issued or paid utility history cannot be deleted or rewritten. Use an audited adjustment.'), {
      statusCode: 409, code: 'UTILITY_FINANCIAL_HISTORY_LOCKED',
    });
  }
}
