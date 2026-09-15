import test from 'node:test';
import assert from 'node:assert/strict';
import { toDateInputValue, minScheduleDateStr, timeStrToMinutes } from './transferScheduleDate.js';
test('Manila calendar day is independent of device timezone', () => {
  assert.equal(minScheduleDateStr(new Date('2026-09-14T16:00:01Z')), '2026-09-15');
  assert.equal(toDateInputValue('2026-09-15'), '2026-09-15');
});
test('invalid calendar dates and clock minutes are rejected', () => {
  assert.equal(toDateInputValue('2027-02-29'), '');
  assert.equal(toDateInputValue('2028-02-29'), '2028-02-29');
  assert.equal(timeStrToMinutes('09:99'), null);
});
