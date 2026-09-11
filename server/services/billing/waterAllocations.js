import { WATER_LEGACY_VERSION, waterCalculationVersion } from './utilityHistorySafety.js';

const money = value => Math.round(Number(value || 0) * 100) / 100;
export const waterAllocationId = (periodId, reservationId, tenantId) =>
  `water:${periodId}:${reservationId || 'unknown'}:${tenantId}`;

export function waterAllocationsForPeriod(bill, periodId) {
  return (bill.waterAllocations || []).filter(a => String(a.utilityPeriodId) === String(periodId));
}
export function waterPeriodSent(bill, periodId) {
  return waterAllocationsForPeriod(bill, periodId).some(a => a.state === 'sent');
}
export function refreshWaterAggregate(bill) {
  bill.charges.water = money((bill.waterAllocations || []).reduce((sum, a) => sum + Number(a.amount), 0));
}
export function upsertWaterAllocation(bill, {period, room, summary, legacyDispatch}) {
  const allocations = (bill.waterAllocations || []).map(a => a.toObject?.() || {...a});
  if (!allocations.length && Number(bill.charges?.water) > 0 && String(legacyDispatch?.periodId) !== String(period._id)) {
    allocations.push({
      allocationId: `legacy:${bill._id}`, utilityPeriodId: legacyDispatch?.periodId || null,
      roomId: bill.roomId?._id || bill.roomId, reservationId: bill.reservationId,
      tenantId: bill.userId?._id || bill.userId, cycleStart: bill.utilityCycleStart,
      cycleEnd: bill.utilityCycleEnd, amount: bill.charges.water,
      calculationVersion: WATER_LEGACY_VERSION, pricingSnapshot: null,
      state: legacyDispatch?.state || 'draft', publishedAt: legacyDispatch?.publishedAt,
      issuedAt: legacyDispatch?.issuedAt, dueDate: legacyDispatch?.dueDate,
    });
  }
  const allocationId = waterAllocationId(period._id, summary.reservationId, summary.tenantId);
  const existing = allocations.find(a => a.allocationId === allocationId);
  if (existing?.state === 'sent') {
    throw Object.assign(new Error('An issued water allocation cannot be rewritten.'), {statusCode:409});
  }
  const allocation = {
    allocationId, utilityPeriodId: period._id, roomId: room._id,
    reservationId: summary.reservationId, tenantId: summary.tenantId,
    cycleStart: period.startDate, cycleEnd: period.endDate,
    amount: money(summary.billAmount), calculationVersion: waterCalculationVersion(period),
    pricingSnapshot: period.pricingSnapshot || null, state:'draft',
    usage: period.calculationVersion === 'water-meter-v1' ? summary.totalUsage : null,
  };
  bill.waterAllocations = [...allocations.filter(a => a.allocationId !== allocationId), allocation];
  refreshWaterAggregate(bill);
  return allocation;
}
