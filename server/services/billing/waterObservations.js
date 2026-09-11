import { Room, BedHistory, UtilityPeriod, UtilityReading } from '../../models/index.js';
import { branchSupportsSeparateUtilityBilling } from '../../config/branches.js';
import { isWaterBillableRoom } from '../../utils/utilityFlowRules.js';
import { parsePhysicalMeterReading } from '../../utils/physicalMeterReading.js';
import { resolveCurrentUtilityRate } from './roomUtilityBoundaryService.js';
import { WATER_METER_VERSION } from './utilityHistorySafety.js';

export const requiresWaterObservation = room => branchSupportsSeparateUtilityBilling(room?.branch,'water') && isWaterBillableRoom(room);
const reject = (message, code) => { throw Object.assign(new Error(message), {statusCode:422,code}); };

// Uses the canonical meter and occupancy transaction; no parallel meter authority.
export async function recordWaterObservation({room,eventAt,reading,eventType,tenantId,reservationId,stayId,transferId,actorId,session,source='occupancy'}) {
  if (!requiresWaterObservation(room)) return null;
  if (!session) throw new Error('Water occupancy observations require a transaction.');
  const value = parsePhysicalMeterReading(reading,{fieldLabel:'Water meter reading (m³)',maximum:999999.99});
  const date = new Date(eventAt);
  if (!actorId || !Number.isFinite(date.getTime()) || date > new Date()) reject('A valid observed time and actor are required.','WATER_OBSERVATION_INVALID');
  // Serialize competing occupants and readings on the same physical room meter.
  await Room.updateOne({_id:room._id},{$inc:{waterObservationRevision:1}},{session});
  const valid = {roomId:room._id,utilityType:'water',isArchived:false,readingStatus:{$nin:['voided','corrected']}};
  const previous = await UtilityReading.findOne({...valid,date:{$lte:date}}).sort({date:-1,createdAt:-1}).session(session);
  const following = await UtilityReading.findOne({...valid,date:{$gte:date}}).sort({date:1,createdAt:1}).session(session);
  if ((previous && value < previous.reading) || (following && value > following.reading)) reject('Water reading must remain between the previous and following valid observations.','WATER_READING_DECREASED');
  if ((previous?.date?.getTime() === date.getTime() && previous.reading !== value) ||
      (following?.date?.getTime() === date.getTime() && following.reading !== value)) reject('A different water reading already exists at this timestamp.','WATER_READING_CONFLICT');
  const retry = await UtilityReading.findOne({...valid,date,eventType,reservationId}).session(session);
  if (retry) return retry;
  const active = await UtilityPeriod.find({roomId:room._id,utilityType:'water',isArchived:false,status:{$in:['open','manual_review_required']}}).session(session);
  if (active.length > 1 || active[0]?.status === 'manual_review_required') reject('Resolve the active water cycle before changing occupancy.','WATER_PERIOD_REVIEW_REQUIRED');
  let period = active[0];
  if (period && date < period.startDate) reject('Water observation precedes the active cycle.','WATER_OBSERVATION_BEFORE_BASELINE');
  if (!period) {
    const last = await UtilityPeriod.findOne({roomId:room._id,utilityType:'water',isArchived:false}).sort({endDate:-1}).session(session);
    if (last?.endDate && date < last.endDate) reject('Water cutover cannot overlap historical cycles.','WATER_CUTOVER_OVERLAP');
    const rate = await resolveCurrentUtilityRate({utilityType:'water'});
    [period] = await UtilityPeriod.create([{utilityType:'water',roomId:room._id,branch:room.branch,
      calculationVersion:WATER_METER_VERSION,unit:'m3',startDate:date,startReading:value,ratePerUnit:rate,
      pricingSnapshot:{ratePerUnit:rate,unit:'m3',capturedAt:new Date(),recordedBy:actorId},status:'open'}],{session});
  }
  const histories = await BedHistory.find({roomId:room._id}).session(session).lean();
  const activeTenantIds = new Set(histories.filter(h => {
    const start = new Date(h.observedStartAt || h.moveInDate || h.effectiveStartDate);
    const end = h.observedEndAt || h.moveOutDate || h.effectiveEndDate;
    return start <= date && (!end || new Date(end) > date);
  }).map(h => String(h.tenantId)).filter(Boolean));
  if (tenantId) {
    if (eventType === 'moveIn') activeTenantIds.add(String(tenantId));
    if (eventType === 'moveOut') activeTenantIds.delete(String(tenantId));
  }
  const [observation] = await UtilityReading.create([{utilityType:'water',roomId:room._id,branch:room.branch,
    activeTenantIds:[...activeTenantIds],reading:value,unit:'m3',date,observedAt:date,eventType,tenantId,reservationId,stayId,transferId,
    recordedBy:actorId,utilityPeriodId:period._id,source,readingStatus:'locked'}],{session});
  return observation;
}
