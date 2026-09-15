import { test, expect } from '@jest/globals';
import { toManilaStartOfDay, getManilaToday } from './dateUtils.js';
import { getRoomTransferError } from './roomTransferErrors.js';
test.each(['2027-02-29', '2027-02-30', '2026-13-01', '2027-02-29T10:00:00+08:00'])('rejects nonexistent transfer day %s', value => expect(toManilaStartOfDay(value)).toBeNull());
test('valid leap day and Manila midnight', () => {
 expect(toManilaStartOfDay('2028-02-29').format('YYYY-MM-DD')).toBe('2028-02-29');
 expect(getManilaToday(new Date('2026-09-14T16:00:01Z')).format('YYYY-MM-DD')).toBe('2026-09-15');
});
test.each(['CastError: bad ObjectId', 'E11000 duplicate key', 'Request failed with status code 400', 'undefined', 'Network Error'])('safe transfer API error for %s', message => expect(getRoomTransferError({ message })).not.toContain(message));
