import { waterCalculationVersion, WATER_METER_VERSION } from './utilityHistorySafety.js';

export function projectWaterPeriod(period, tenantId, amount = null, allocationId = null) {
  const version=waterCalculationVersion(period), measured=version === WATER_METER_VERSION;
  const summary=(period.tenantSummaries || []).find(s=>String(s.tenantId)===String(tenantId));
  const rate=measured ? period.pricingSnapshot?.ratePerUnit ?? period.ratePerUnit : null;
  return {
    calculationVersion:version,unit:measured?'m3':null,allocationId,utilityPeriodId:period._id,
    roomId:period.roomId?._id || period.roomId,
    roomName:period.roomId?.name || period.roomId?.roomNumber || null,
    openingReading:measured?period.startReading:null,closingReading:measured?period.endReading:null,
    consumption:measured?period.computedTotalUsage:null,ratePerCubicMeter:rate,
    totalWaterAmount:period.computedTotalCost,tenantUsageShare:measured?summary?.totalUsage ?? null:null,
    tenantAmount:amount ?? summary?.billAmount ?? null,
    meterEvents:measured?period.meterEvents || []:[],
    consumptionSegments:measured?period.segments || []:[],
    tenantAllocations:measured?(period.tenantSummaries || []).map(s=>({tenantId:s.tenantId,tenantName:s.tenantName,consumptionShare:s.totalUsage,rate,amount:s.billAmount})):[],
    billingBasis:measured?'Measured consumption shared only within occupied segments':'Historical water allocation; physical consumption is unknown',
    record:{id:period._id,cycleStart:period.startDate,cycleEnd:period.endDate,
      readingFrom:measured?period.startReading:null,readingTo:measured?period.endReading:null,
      usage:measured?period.computedTotalUsage:null,ratePerUnit:rate,roomTotal:period.computedTotalCost,
      tenantsSharing:period.tenantSummaries?.length || 0,myShare:amount ?? summary?.billAmount ?? null},
  };
}
