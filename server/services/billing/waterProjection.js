import { waterCalculationVersion, WATER_METER_VERSION } from './utilityHistorySafety.js';

export function projectWaterPeriod(period, tenantId, amount = null, allocationId = null, allocation = null) {
  const version=waterCalculationVersion(allocation || period), measured=version === WATER_METER_VERSION;
  const matches=(period.tenantSummaries || []).filter(s=>String(s.tenantId)===String(tenantId) &&
    (!allocation?.reservationId || String(s.reservationId)===String(allocation.reservationId)));
  const summary=matches.length === 1 ? matches[0] : null;
  const usage=allocation?.usage ?? summary?.totalUsage ?? null;
  const tenantAmount=allocation?.amount ?? amount ?? summary?.billAmount ?? null;
  const rate=measured ? allocation?.pricingSnapshot?.ratePerUnit ?? period.pricingSnapshot?.ratePerUnit ?? period.ratePerUnit : null;
  return {
    calculationVersion:version,unit:measured?'m3':null,allocationId:allocation?.allocationId ?? allocationId,utilityPeriodId:allocation?.utilityPeriodId ?? period._id,
    reservationId:allocation?.reservationId ?? summary?.reservationId ?? null,
    cycleStart:allocation?.cycleStart ?? period.startDate,cycleEnd:allocation?.cycleEnd ?? period.endDate,
    usage:measured?usage:null,amount:tenantAmount,rate,pricingSnapshot:allocation?.pricingSnapshot ?? period.pricingSnapshot,
    roomId:allocation?.roomId ?? period.roomId?._id ?? period.roomId,
    roomName:period.roomId?.name || period.roomId?.roomNumber || null,
    openingReading:measured?period.startReading:null,closingReading:measured?period.endReading:null,
    consumption:measured?period.computedTotalUsage:null,ratePerCubicMeter:rate,
    totalWaterAmount:period.computedTotalCost,tenantUsageShare:measured?usage:null,
    tenantAmount:tenantAmount,
    calculationInputs:measured?period.calculationInputs ?? null:null,
    calculationFingerprint:measured?period.calculationFingerprint ?? null:null,
    meterEvents:measured?period.meterEvents || []:[],
    consumptionSegments:measured?period.segments || []:[],
    tenantAllocations:measured ? (allocation ? [{tenantId:allocation.tenantId ?? tenantId,
      reservationId:allocation.reservationId,tenantName:summary?.tenantName || 'Tenant',consumptionShare:usage,rate,amount:tenantAmount}]
      : (period.tenantSummaries || []).map(s=>({tenantId:s.tenantId,reservationId:s.reservationId,tenantName:s.tenantName,consumptionShare:s.totalUsage,rate,amount:s.billAmount}))) : [],
    billingBasis:measured?'Measured consumption shared only within occupied segments':'Historical water allocation; physical consumption is unknown',
    record:{id:period._id,cycleStart:allocation?.cycleStart ?? period.startDate,cycleEnd:allocation?.cycleEnd ?? period.endDate,
      readingFrom:measured?period.startReading:null,readingTo:measured?period.endReading:null,
      usage:measured?period.computedTotalUsage:null,ratePerUnit:rate,roomTotal:period.computedTotalCost,
      tenantsSharing:period.tenantSummaries?.length || 0,myShare:tenantAmount},
  };
}
