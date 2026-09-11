import { computeBilling } from './billingEngine.js';
const date = n => new Date(Date.UTC(2026,7,n));
const tenant = (name,intervals) => ({_id:name,userId:{_id:name,firstName:name},_roomOccupancyIntervals:intervals.map(([a,b]) => ({start:date(a),end:b ? date(b) : null}))});
const calculate = (reservations,points,extra={}) => computeBilling({utilityType:'water',roomType:'double-sharing',
  utilityPeriod:{calculationVersion:'water-meter-v1',startDate:date(1),endDate:date(32),startReading:100,endReading:118,ratePerUnit:50,...extra},
  readings:points.map(([n,reading]) => ({date:date(n),reading,eventType:n===1 ? 'periodStart':n===32 ? 'periodEnd':'moveIn'})),reservations});
test('100 → 106 → 118 allocates A 12 m³ and B 6 m³', () => {
  const r=calculate([tenant('A',[[1]]),tenant('B',[[10]])],[[1,100],[10,106],[32,118]]);
  expect(r.tenantSummaries.map(s => [s.totalUsage,s.billAmount])).toEqual([[12,600],[6,300]]);
  expect(r.segments.map(s=>s.activeTenantCount)).toEqual([1,2]);
});
test('same-date move-in shares measured usage', () => {
  expect(calculate([tenant('A',[[1]]),tenant('B',[[1]])],[[1,100],[32,118]]).tenantSummaries.map(s=>s.totalUsage)).toEqual([9,9]);
});
test('departure closes two-to-one segment', () => {
  expect(calculate([tenant('A',[[1]]),tenant('B',[[1,10]])],[[1,100],[10,106],[32,118]]).tenantSummaries.map(s=>s.totalUsage)).toEqual([15,3]);
});
test('replacement occupants receive only their measured intervals', () => {
  expect(calculate([tenant('A',[[1]]),tenant('B',[[1,10]]),tenant('C',[[10]])],[[1,100],[10,106],[32,118]]).tenantSummaries.map(s=>s.totalUsage)).toEqual([9,3,6]);
});
test('one tenant leaves and returns; vacancy is overhead', () => {
  const r=calculate([tenant('A',[[1,10],[20]])],[[1,100],[10,106],[20,110],[32,118]]);
  expect(r.tenantSummaries[0].totalUsage).toBe(14);
  expect(r.overheadSegments[0].cost).toBe(200);
});
test('missing occupancy boundary never falls back to day weighting', () => {
  expect(()=>calculate([tenant('A',[[1]]),tenant('B',[[10]])],[[1,100],[32,118]])).toThrow(/missing/);
});
test('missing physical opening is unknown', () => {
  expect(()=>calculate([tenant('A',[[1]])],[[32,118]])).toThrow(/Verified opening/);
});
test('rejects lower readings and contradictory simultaneous observations', () => {
  expect(()=>calculate([tenant('A',[[1]])],[[1,100],[10,99],[32,118]])).toThrow(/decrease/);
  expect(()=>calculate([tenant('A',[[1]])],[[1,100],[10,106],[10,107],[32,118]])).toThrow(/Conflicting/);
});
test('snapshot rate wins over current editable value', () => {
  const r=calculate([tenant('A',[[1]])],[[1,100],[32,118]],{ratePerUnit:54.20,pricingSnapshot:{ratePerUnit:52.86}});
  expect(r.tenantSummaries[0].billAmount).toBe(951.48);
});
test('quad excluded in low-level new engine', () => {
  expect(()=>computeBilling({utilityType:'water',roomType:'quadruple-sharing',utilityPeriod:{calculationVersion:'water-meter-v1'}})).toThrow(/excluded/);
});

test.each([{intervals:[[1,null]]},{intervals:[[10,20]]}])('private usage belongs only to measured occupancy %j', ({intervals}) => {
  const result=computeBilling({utilityType:'water',roomType:'private',
    utilityPeriod:{calculationVersion:'water-meter-v1',startDate:date(1),endDate:date(32),startReading:100,endReading:118,ratePerUnit:50},
    readings:[[1,100],[10,106],[20,110],[32,118]].map(([n,reading])=>({date:date(n),reading,eventType:'moveIn'})),
    reservations:[tenant('A',intervals)]});
  expect(result.tenantSummaries[0].totalUsage).toBe(intervals[0][0]===1 ? 18 : 4);
  expect(result.tenantSummaries[0].billAmount).toBe(intervals[0][0]===1 ? 900 : 200);
});
test.each([true,false,'',null,-1,Infinity])('rejects invalid meter price %s',ratePerUnit=>{
  expect(()=>calculate([tenant('A',[[1]])],[[1,100],[32,118]],{ratePerUnit})).toThrow(/rate/);
});
