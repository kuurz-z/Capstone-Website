import { WATER_METER_VERSION } from './utilityHistorySafety.js';

const id = value => String(value?._id || value || '');
const time = value => new Date(value).getTime();
const fail = (message, code = 'WATER_METER_BOUNDARY_REQUIRED') => {
  throw Object.assign(new Error(message), {statusCode:422, code});
};
const round = value => Math.round(value * 100) / 100;

/** Pure canonical calculation. Occupancy selects people; it never estimates usage. */
export function computeWaterMeterBilling({utilityPeriod:period, readings=[], reservations=[], roomType}) {
  if (!['private','double-sharing'].includes(roomType)) fail('This room is excluded from water metering.', 'WATER_ROOM_EXCLUDED');
  const start = time(period.startDate), end = time(period.endDate);
  const rawRate = period.pricingSnapshot?.ratePerUnit ?? period.ratePerUnit;
  const rate = typeof rawRate === 'boolean' || rawRate === null || rawRate === '' ? NaN : Number(rawRate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail('A valid measured interval is required.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 100000) fail('A non-negative water rate is required.', 'WATER_RATE_INVALID');
  const events = readings.filter(r => !r.isArchived && !r.supersededByReadingId && !['voided','corrected'].includes(r.readingStatus))
    .map(r => ({id:id(r._id), date:new Date(r.observedAt || r.date), reading:Number(r.reading), eventType:r.eventType, tenantId:r.tenantId || null}))
    .filter(r => time(r.date) >= start && time(r.date) <= end)
    .sort((a,b) => time(a.date)-time(b.date) || a.id.localeCompare(b.id));
  const boundaries = [];
  for (const event of events) {
    if (!Number.isFinite(event.reading) || event.reading < 0) fail('Invalid water observation.');
    const previous = boundaries.at(-1);
    if (previous && time(previous.date) === time(event.date)) {
      if (previous.reading !== event.reading) fail('Conflicting water observations at the same timestamp.');
      continue;
    }
    if (previous && event.reading < previous.reading) fail('Water reading cannot decrease.', 'WATER_READING_DECREASED');
    boundaries.push(event);
  }
  if (time(boundaries[0]?.date) !== start || time(boundaries.at(-1)?.date) !== end) fail('Verified opening and closing water observations are required.');
  if (Number(period.startReading) !== boundaries[0].reading || Number(period.endReading) !== boundaries.at(-1).reading) fail('Period readings do not match the physical observations.');
  const intervals = reservations.flatMap(r => (r._roomOccupancyIntervals || [{
    start:r._roomScopedMoveInDate || r.moveInDate || r.checkInDate,
    end:r._roomScopedMoveOutDate || r.moveOutDate || r.checkOutDate,
  }]).map(interval => ({reservation:r, start:time(interval.start), end:interval.end ? time(interval.end) : Infinity})))
    .filter(i => i.start < end && i.end > start && i.end > i.start);
  const boundaryTimes = new Set(boundaries.map(b => time(b.date)));
  for (const interval of intervals) {
    for (const boundary of [interval.start, interval.end]) {
      if (boundary > start && boundary < end && !boundaryTimes.has(boundary)) fail('An occupancy change is missing its measured water boundary.');
    }
  }
  const totals = new Map(), segments = [], overheadSegments = [];
  for (let n=0; n<boundaries.length-1; n++) {
    const a = boundaries[n], b = boundaries[n+1];
    const active = new Map();
    for (const i of intervals.filter(i => i.start <= time(a.date) && i.end >= time(b.date))) {
      active.set(id(i.reservation.userId), i.reservation);
    }
    if (active.size > (roomType === 'private' ? 1 : 2)) fail('Room occupancy exceeds water billing capacity.', 'WATER_OCCUPANCY_CONFLICT');
    const usage = Number((b.reading-a.reading).toFixed(8));
    const occupants = [...active.values()];
    const segment = {segmentIndex:n, periodLabel:`${a.date.toISOString()} – ${b.date.toISOString()}`,
      startDate:a.date,endDate:b.date, readingFrom:a.reading,readingTo:b.reading,
      unitsConsumed:usage,totalCost:round(usage*rate),activeTenantCount:active.size,
      sharePerTenantUnits:active.size ? usage/active.size : 0,
      sharePerTenantCost:active.size ? round(usage*rate/active.size) : 0,
      activeTenantIds:[...active.keys()], coveredTenantNames:occupants.map(r => [r.userId?.firstName,r.userId?.lastName].filter(Boolean).join(' ') || 'Tenant'),
      startEventType:a.eventType,endEventType:b.eventType};
    segments.push(segment);
    if (!active.size && usage) overheadSegments.push({...segment,kwhConsumed:usage,cost:round(usage*rate),reason:'ZERO_OCCUPANCY_WITH_CONSUMPTION'});
    for (const r of occupants) {
      const key = `${id(r._id)}:${id(r.userId)}`;
      const entry = totals.get(key) || {tenantId:id(r.userId),reservationId:id(r._id),tenantName:[r.userId?.firstName,r.userId?.lastName].filter(Boolean).join(' ') || 'Tenant',
        totalUsage:0,billAmount:0,billingBasis:'measured-water-segments',allocationRule:'equal-within-measured-segment',overlapStart:a.date,overlapEnd:b.date};
      entry.totalUsage += usage/active.size; entry.overlapEnd=b.date;
      totals.set(key,entry);
    }
  }
  // Round once across tenant totals using largest remainders; retain exact usage shares.
  const tenantSummaries = [...totals.values()].sort((a,b) => id(a.tenantId).localeCompare(id(b.tenantId)));
  const exactCents = tenantSummaries.map(s => s.totalUsage*rate*100);
  const cents = exactCents.map(v => Math.floor(v + 1e-8));
  let remainder = Math.round(exactCents.reduce((s,v) => s+v,0))-cents.reduce((s,v) => s+v,0);
  const order = exactCents.map((v,i) => ({i,f:v-cents[i]})).sort((a,b) => b.f-a.f || a.i-b.i);
  for (const {i} of order) { if (remainder-- > 0) cents[i]++; }
  tenantSummaries.forEach((s,i) => {s.billAmount=cents[i]/100;});
  return {calculationVersion:WATER_METER_VERSION, unit:'m3',strategy:'measured-water-segments',
    meterEvents:events,segments,tenantSummaries,overheadSegments,verified:true,
    computedTotalUsage:boundaries.at(-1).reading-boundaries[0].reading,
    computedTotalCost:round((boundaries.at(-1).reading-boundaries[0].reading)*rate), ratePerUnit:rate};
}
