import { UtilityReading } from '../../models/index.js';
import { parsePhysicalMeterReading } from '../../utils/physicalMeterReading.js';

export const validWaterObservations = roomId => ({
  roomId, utilityType: 'water', unit: 'm3', isArchived: false,
  readingStatus: { $nin: ['voided', 'corrected'] }, supersededByReadingId: null,
});
const reset = observation => ['meterReplacement', 'meterRollover'].includes(observation?.eventType);
const reject = message => { throw Object.assign(new Error(message), { statusCode: 422, code: 'WATER_READING_CONFLICT' }); };

// At a replacement boundary, the preceding meter ends at oldMeterFinalReading;
// the following meter starts at reading. Never compare values across meters.
export function assertWaterNeighbors({ previous, following, same = [], date, reading, eventType, meterReset }) {
  const value = parsePhysicalMeterReading(reading, { maximum: 999999.99 });
  if (!Number.isFinite(new Date(date).getTime())) reject('A valid observation time is required.');
  if (same.some(r => Number(r.reading) !== value)) reject('A different water reading already exists at this timestamp.');
  const candidate = { eventType, meterReset };
  const lowerValue = reset(candidate) ? parsePhysicalMeterReading(meterReset?.oldMeterFinalReading) : value;
  if (reset(candidate) && !(meterReset?.evidenceReferences || []).some(r => String(r).trim())) reject('Meter replacement/rollover requires evidence.');
  const upperValue = reset(following) ? following.meterReset?.oldMeterFinalReading : following?.reading;
  if ((previous && lowerValue < previous.reading) || (following && value > upperValue)) {
    reject('Water reading must remain between the previous and following valid observations.');
  }
  return value;
}

// Callers serialize writes through Room.waterObservationRevision in their transaction.
export async function assertWaterChronology({ roomId, date, reading, eventType, meterReset, session = null, excludeIds = [] }) {
  const valid = { ...validWaterObservations(roomId), _id: { $nin: excludeIds } };
  const [previous, following, same] = await Promise.all([
    UtilityReading.findOne({ ...valid, date: { $lt: date } }).sort({ date: -1, createdAt: -1 }).session(session).lean(),
    UtilityReading.findOne({ ...valid, date: { $gt: date } }).sort({ date: 1, createdAt: 1 }).session(session).lean(),
    UtilityReading.find({ ...valid, date }).session(session).lean(),
  ]);
  return assertWaterNeighbors({ previous, following, same, date, reading, eventType, meterReset });
}
