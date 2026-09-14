import { test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { resolveRenewalTerm } from './contractLeaseDateService.js';
import { validateLeaseDuration } from './contractTemplateService.js';
import { resolveLegalLeaseType } from '../config/contractLegalTerm.js';

for (const start of ['2027-01-01', '2027-01-29', '2027-01-30', '2027-01-31', '2028-01-31', '2028-02-29', '2027-08-31']) {
  test.each([1, 3, 5, 6, 12])(`${start} + %i whole months`, months => {
    const term = resolveRenewalTerm({ leaseStartDate: start, leaseDurationMonths: months });
    expect(validateLeaseDuration({ ...term, leaseType: resolveLegalLeaseType(months) }).durationMonths).toBe(months);
    expect(resolveRenewalTerm({ leaseStartDate: term.leaseStartDate, leaseEndDate: term.stayEndDate }).leaseDurationMonths).toBe(months);
    expect(() => resolveRenewalTerm({ leaseStartDate: term.leaseStartDate,
      leaseEndDate: new Date(term.stayEndDate.getTime() - 86400000), leaseDurationMonths: months }))
      .toThrow(expect.objectContaining({ code: 'LEASE_DURATION_CONFLICT' }));
  });
}
test.each([
  ['2027-01-31', 1, '2027-02-27T16:00:00.000Z'],
  ['2028-01-31', 1, '2028-02-28T16:00:00.000Z'],
  ['2027-08-31', 1, '2027-09-29T16:00:00.000Z'],
  ['2028-02-29', 12, '2029-02-27T16:00:00.000Z'],
])('Manila calendar anniversary %s + %i', (start, months, expected) => {
  expect(resolveRenewalTerm({ leaseStartDate: start, leaseDurationMonths: months }).leaseEndDate.toISOString()).toBe(expected);
});
test('UTC and Manila hosts produce identical Manila month-end terms', () => {
  const moduleUrl = new URL('./contractLeaseDateService.js', import.meta.url).href;
  const script = `import { resolveRenewalTerm } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(['2027-01-31','2028-01-31','2028-02-29','2027-08-31'].flatMap(start =>
      [1,6,12].map(months => resolveRenewalTerm({leaseStartDate:start,leaseDurationMonths:months})))));`;
  const run = TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { env: { ...process.env, TZ }, encoding: 'utf8' });
  expect(run('UTC')).toBe(run('Asia/Manila'));
});
