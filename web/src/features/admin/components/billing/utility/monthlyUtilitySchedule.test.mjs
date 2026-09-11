import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMonthlyCutoff,defaultUtilityOpening,openingOnDate,utilityDateInput} from './monthlyUtilitySchedule.js';

test('monthly cutoff supports normal, partial, February and year-end cycles',()=>{
  for(const [start,end] of [['2026-08-15','2026-09-15'],['2026-09-20','2026-10-15'],['2026-10-15','2026-11-15'],['2026-09-01','2026-09-15'],['2026-12-20','2027-01-15'],['2028-02-29','2028-03-15']]) assert.equal(nextMonthlyCutoff(start),end);
  assert.equal(utilityDateInput('2026-09-19T18:00:00Z'),'2026-09-20');
});
test('defaults preserve the latest physical boundary and never invent an opening',()=>{
  const previous={endDate:'2026-09-15',endReading:118};
  assert.deepEqual(defaultUtilityOpening({lastClosedPeriod:previous}),{date:'2026-09-15',reading:118});
  const latest={date:'2026-09-20',reading:120,eventType:'periodStart'};
  assert.deepEqual(defaultUtilityOpening({lastClosedPeriod:previous,latestReading:latest}),latest);
  assert.deepEqual(defaultUtilityOpening({lastClosedPeriod:previous,latestReading:{...latest,eventType:'regularBilling'}}),{date:'2026-09-15',reading:118});
  assert.equal(defaultUtilityOpening({}),null);
  assert.equal(openingOnDate({date:'2026-09-15',readings:[latest]}),null);
  assert.equal(openingOnDate({date:'2026-09-20',readings:[{...latest,readingStatus:'corrected'}]}),null);
});
