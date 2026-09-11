import { createHash } from 'node:crypto';
import { UtilityReading } from '../../models/index.js';
import { computeWaterMeterBilling } from './waterMeterEngine.js';
import { resolveRoomScopedReservationsForUtilityPeriod } from './roomScopedUtilityParticipants.js';
import { assertWaterChronology, validWaterObservations } from './waterChronology.js';

// Room/date evidence survives archiving a billing period. A period ID is billing
// provenance, not ownership of the room's physical observation history.
export async function calculateCanonicalWaterPeriod({ room, period, endDate, endReading, session = null }) {
  await assertWaterChronology({ roomId: room._id, date: endDate, reading: endReading, session });
  const readings = await UtilityReading.find({ ...validWaterObservations(room._id),
    date: { $gte: period.startDate, $lte: endDate },
  }).sort({ date: 1, createdAt: 1, _id: 1 }).session(session).lean();
  const opening = readings.find(r => +r.date === +new Date(period.startDate));
  if (!opening) throw Object.assign(new Error('Establish a verified water opening boundary before billing.'), {
    statusCode: 422, code: 'WATER_VERIFIED_BASELINE_REQUIRED',
  });
  const reservations = await resolveRoomScopedReservationsForUtilityPeriod({ room,
    utilityType: 'water', calculationVersion: 'water-meter-v1', periodStart: period.startDate,
    periodEnd: endDate, session,
  });
  // A preview-only closing boundary has no persisted ID. Persisted observations
  // are retained verbatim; generation adds only its newly committed closing ID.
  if (!readings.some(r => +r.date === +new Date(endDate))) readings.push({ date: endDate, reading: endReading, eventType: 'periodEnd' });
  const result = computeWaterMeterBilling({ roomType: room.type, reservations, readings,
    utilityPeriod: { ...period, startReading: opening.reading, endDate, endReading },
  });
  // Duplicate period/occupancy records can describe one physical instant. Use
  // the oldest valid identity at that instant, independent of period linkage.
  const evidence = [...new Map(readings.slice().reverse().filter(r => +new Date(r.date) < +new Date(endDate))
    .map(r => [+new Date(r.date), r])).values()].sort((a,b) => +new Date(a.date) - +new Date(b.date));
  const calculationInputs = {
    calculationVersion: 'water-meter-v1', roomId: String(room._id),
    openingObservationId: String(opening._id), observationIds: evidence.map(r => String(r._id)),
    startDate: new Date(period.startDate).toISOString(), endDate: new Date(endDate).toISOString(),
    openingReading: opening.reading, closingReading: Number(endReading), ratePerUnit: result.ratePerUnit,
    participants: result.tenantSummaries.map(s => ({tenantId:String(s.tenantId),reservationId:String(s.reservationId),usage:s.totalUsage,amount:s.billAmount})),
    segments: result.segments,
  };
  const calculationFingerprint = createHash('sha256').update(JSON.stringify(calculationInputs)).digest('hex');
  return { ...result, calculationInputs, calculationFingerprint };
}

