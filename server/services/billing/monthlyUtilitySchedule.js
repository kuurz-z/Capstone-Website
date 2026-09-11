import { Bill, UtilityPeriod, UtilityReading } from '../../models/index.js';
import { toManilaStartOfDay } from '../../utils/dateUtils.js';
import { parsePhysicalMeterReading } from '../../utils/physicalMeterReading.js';

const fail = (message, code, statusCode = 422) => {
  throw Object.assign(new Error(message), {code, statusCode});
};
const validReadings = (roomId, utilityType) => ({
  roomId, utilityType, isArchived:false,
  readingStatus:{$nin:['voided','corrected']}, supersededByReadingId:null,
  ...(utilityType === 'water' ? {unit:'m3'} : {}),
});

export function parseUtilityCycleDate(value) {
  const day = toManilaStartOfDay(value);
  if (!day?.isValid() || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && day.format('YYYY-MM-DD') !== value)) {
    fail('A valid cycle date is required.', 'UTILITY_DATE_INVALID', 400);
  }
  return day.toDate();
}

// Resolve an observed instant, never a synthetic midnight with an unrelated
// reading. A date-only edit on the saved opening day preserves its exact time.
export async function resolveUtilityOpening({roomId, utilityType, startDate, startReading, period = null, session = null}) {
  const day = toManilaStartOfDay(parseUtilityCycleDate(startDate));
  const sameOpeningDay = period && day.isSame(toManilaStartOfDay(period.startDate));
  const reading = parsePhysicalMeterReading(startReading ?? (sameOpeningDay ? period.startReading : undefined), {fieldLabel:'Opening meter reading',maximum:999999.99});
  const observations = await UtilityReading.find({
    ...validReadings(roomId, utilityType),
    date: sameOpeningDay ? period.startDate : {$gte:day.toDate(),$lt:day.add(1,'day').toDate()},
  }).sort({date:1,createdAt:1,_id:1}).session(session).lean();
  const evidence = observations.find(item => Number(item.reading) === reading);
  if (!evidence || observations.some(item => +item.date === +evidence.date && Number(item.reading) !== reading)) {
    fail('No matching verified opening boundary exists on this date. Record or correct the physical boundary through the meter initialization/correction workflow.', `${utilityType.toUpperCase()}_VERIFIED_BASELINE_REQUIRED`);
  }
  if (sameOpeningDay && Number(period.startReading) !== reading) {
    fail('The saved opening reading must be corrected through the meter correction workflow.', 'UTILITY_OPENING_CORRECTION_REQUIRED');
  }
  return evidence;
}

export async function assertUtilityCycleRange({roomId, utilityType, startDate, endDate, periodId = null, session = null}) {
  if (!startDate || !endDate || !Number.isFinite(+new Date(startDate)) || !Number.isFinite(+new Date(endDate)) || +new Date(startDate) >= +new Date(endDate)) {
    fail('Cycle start must be before cycle end.', 'UTILITY_PERIOD_INVALID_RANGE', 400);
  }
  const overlapping = await UtilityPeriod.findOne({
    roomId, utilityType, isArchived:false,
    ...(periodId ? {_id:{$ne:periodId}} : {}),
    startDate:{$lt:endDate}, $or:[{endDate:null},{endDate:{$gt:startDate}}],
  }).session(session).lean();
  if (overlapping) fail('The cycle overlaps existing utility coverage. Finalized history cannot be moved.', 'UTILITY_PERIOD_DATE_OVERLAP', 409);
}

export async function assertUtilityOpeningChange({period, evidence, session = null}) {
  if (+new Date(period.startDate) === +new Date(evidence.date)) return;
  if (period.status !== 'open') fail('Only an open cycle can select another verified opening.', 'UTILITY_PERIOD_NOT_OPEN', 409);
  const billed = await Bill.exists({$or:[
    {[`utilityDispatch.${period.utilityType}.periodId`]:period._id},
    {'waterAllocations.utilityPeriodId':period._id},
  ]}).session(session);
  if (billed) fail('This opening is linked to billing history. Use the audited correction workflow.', 'UTILITY_FINANCIAL_HISTORY_LOCKED', 409);
  if (+new Date(evidence.date) > +new Date(period.startDate)) {
    const skipped = await UtilityReading.find({
      ...validReadings(period.roomId, period.utilityType),
      date:{$gte:period.startDate,$lt:evidence.date},
    }).session(session).lean();
    if (Number(evidence.reading) !== Number(period.startReading) || skipped.some(item =>
      Number(item.reading) !== Number(evidence.reading) || !['periodStart','regularBilling'].includes(item.eventType))) {
      fail('This start would discard recorded usage or a lifecycle boundary. Close the earlier interval or use the audited correction workflow.', 'UTILITY_OPENING_WOULD_SKIP_USAGE', 409);
    }
  }
}

// Called inside the close transaction. Existing observations remain immutable;
// the new opening marker explicitly references the already recorded evidence.
export async function applyUtilityOpening({period, evidence, actorId, session}) {
  if (+new Date(period.startDate) === +new Date(evidence.date)) return;
  await assertUtilityOpeningChange({period,evidence,session});
  period.startDate = evidence.date;
  period.startReading = evidence.reading;
  await UtilityReading.create([{
    utilityType:period.utilityType,roomId:period.roomId,branch:period.branch,
    date:evidence.date,reading:evidence.reading,eventType:'periodStart',readingStatus:'locked',
    recordedBy:actorId,utilityPeriodId:period._id,source:'verified_monthly_opening',
    evidenceReferences:[String(evidence._id)],
  }],{session});
}
