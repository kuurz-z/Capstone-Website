import { describe, expect, test } from '@jest/globals';
import { assertStayContractEndDates, resolveCheckInLeaseEndDate, stayContractEndDatesMatch } from './stayContractIntegrity.js';

describe('Stay/Contract end-date integrity', () => {
  test('accepts an exclusive endpoint and its inclusive Manila final day', () => {
    const legalEnd = '2027-02-24T16:00:00.000Z';
    expect(stayContractEndDatesMatch(legalEnd, legalEnd)).toBe(true);
    expect(stayContractEndDatesMatch('2027-02-24T15:59:59.999Z', legalEnd)).toBe(true);
  });
  test.each([null, '', 'invalid', '2027-02-28T00:00:00.000Z'])(
    'rejects a missing, invalid, or drifted Stay endpoint: %s', (end) => {
      expect(stayContractEndDatesMatch(end, '2027-02-24T16:00:00.000Z')).toBe(false);
      expect(() => assertStayContractEndDates({leaseEndDate:end}, {leaseEndDate:'2027-02-24T16:00:00.000Z'}))
        .toThrow(expect.objectContaining({code:'STAY_CONTRACT_DATE_MISMATCH'}));
    });
  test('later check-in preserves the existing legal endpoint rather than adding the duration again', () => {
    const contract = {leaseEndDate:new Date('2027-02-24T16:00:00.000Z')};
    expect(resolveCheckInLeaseEndDate(contract, new Date('2027-02-28T00:00:00.000Z'))).toBe(contract.leaseEndDate);
  });
  test('only a missing Contract permits the check-in fallback; malformed existing terms fail closed', () => {
    const fallback = new Date('2027-02-28T00:00:00.000Z');
    expect(resolveCheckInLeaseEndDate(null, fallback)).toBe(fallback);
    expect(() => resolveCheckInLeaseEndDate({}, fallback)).toThrow(expect.objectContaining({code:'CONTRACT_LEASE_END_DATE_REQUIRED'}));
  });
});
