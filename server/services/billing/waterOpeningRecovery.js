import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditLog, Bill, Room, UtilityFinalization, UtilityPeriod, UtilityReading } from '../../models/index.js';
import { toManilaStartOfDay } from '../../utils/dateUtils.js';
import { parsePhysicalMeterReading } from '../../utils/physicalMeterReading.js';
import { requiresWaterObservation } from './waterObservations.js';
import { assertWaterChronology, validWaterObservations } from './waterChronology.js';
import { resolveCurrentUtilityRate } from './roomUtilityBoundaryService.js';
import { createOpenUtilityPeriodWithBoundary, resolveUtilityPeriodState, UTILITY_PERIOD_START_MODE } from './utilityPeriodLifecycleService.js';

const fail = (message, code, statusCode = 422) => { throw Object.assign(new Error(message), { code, statusCode }); };

// Recovery records physical evidence only. It never creates a tenant event,
// calculates unknown consumption, generates an invoice, or publishes a bill.
export async function recordWaterOpeningRecovery({ admin, roomId, reading, observedAt, source, reason, evidenceReferences = [] }) {
  if (!['number', 'string'].includes(typeof reading)) fail('Enter a numeric physical reading.', 'WATER_READING_INVALID');
  const value = parsePhysicalMeterReading(reading, { fieldLabel: 'Opening water reading', maximum: 999999.99 });
  const date = new Date(observedAt);
  if (typeof observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt) || !Number.isFinite(+date) || date > new Date()) fail('Enter the actual observation time with its time zone, no later than now.', 'WATER_OBSERVATION_INVALID');
  if (!['current-observation', 'documented-history'].includes(source)) fail('Select the source of the physical reading.', 'WATER_SOURCE_REQUIRED');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('A reason of up to 1,000 characters is required.', 'WATER_REASON_REQUIRED');
  if (!Array.isArray(evidenceReferences) || evidenceReferences.length > 10 || evidenceReferences.some(item => typeof item !== 'string' || item.length > 500)) fail('Use up to ten evidence references.', 'WATER_EVIDENCE_INVALID');
  const evidence = [...new Set(evidenceReferences.map(item => item.trim()).filter(Boolean))];
  if (source === 'documented-history' && !evidence.length) fail('A historical observation requires a documented evidence reference.', 'WATER_HISTORICAL_EVIDENCE_REQUIRED');
  if (source === 'current-observation' && !toManilaStartOfDay(date).isSame(toManilaStartOfDay(new Date()))) fail('Older observations require documented historical evidence.', 'WATER_HISTORICAL_EVIDENCE_REQUIRED');
  if (!mongoose.isValidObjectId(roomId)) fail('A valid room is required.', 'WATER_ROOM_INVALID', 400);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const room = await Room.findById(roomId).session(session);
      if (!room || room.isArchived) fail('Room not found.', 'WATER_ROOM_NOT_FOUND', 404);
      if (!admin.isOwner && (!admin.branch || room.branch !== admin.branch)) fail('Access denied.', 'WATER_BRANCH_FORBIDDEN', 403);
      if (!requiresWaterObservation(room)) fail('This room is excluded from separate Water billing.', 'WATER_ROOM_EXCLUDED');
      const resolution = await resolveUtilityPeriodState({ roomId, utilityType: 'water', session });
      if (!['OPEN', 'MISSING', 'CLOSED_ONLY'].includes(resolution.state)) fail('Resolve the existing Water cycle review before recording a baseline.', 'WATER_PERIOD_REVIEW_REQUIRED');
      let period = resolution.state === 'OPEN'
        ? await UtilityPeriod.findById(resolution.period._id).session(session) : null;
      if (period && period.calculationVersion !== 'water-meter-v1') fail('Close or review the legacy Water cycle before an explicit measured cutover.', 'WATER_LEGACY_CUTOVER_REQUIRED');
      const valid = validWaterObservations(roomId);
      const existing = period && await UtilityReading.findOne({ ...valid, date: period.startDate }).session(session);
      if (existing) {
        if (+existing.date === +date && existing.reading === value && existing.source === `opening-recovery:${source}`) {
          result = { period, reading: existing, unknownConsumptionBeforeBaseline: true, idempotent: true };
          return;
        }
        fail('A verified opening already exists. Use observation correction if it is wrong.', 'WATER_BASELINE_ALREADY_EXISTS', 409);
      }
      const before = period ? { startDate: period.startDate, startReading: period.startReading, ratePerUnit: period.ratePerUnit } : null;
      if (period) {
        const financial = await Bill.exists({ $or: [
          { _id: { $in: period.tenantSummaries.map(item => item.billId).filter(Boolean) } },
          { 'waterAllocations.utilityPeriodId': period._id }, { 'utilityDispatch.water.periodId': period._id },
        ] }).session(session);
        if (financial || await UtilityFinalization.exists({ utilityPeriodId: period._id }).session(session)) fail('The period has financial history. Use a separately reviewed correction.', 'UTILITY_FINANCIAL_HISTORY_LOCKED', 409);
        if (await UtilityReading.exists({ ...valid, date: { $gte: period.startDate, $lt: date } }).session(session)) fail('The new opening would discard existing observations.', 'UTILITY_OPENING_WOULD_SKIP_USAGE', 409);
        await Room.updateOne({ _id: roomId }, { $inc: { waterObservationRevision: 1 } }, { session, timestamps: false });
      }
      // A baseline begins open coverage. It cannot overlap later or finalized
      // periods, even when their underlying observations were archived.
      const overlap = await UtilityPeriod.exists({ roomId, utilityType: 'water', isArchived: false,
        ...(period ? { _id: { $ne: period._id } } : {}),
        $or: [{ endDate: null }, { endDate: { $gt: date } }],
      }).session(session);
      if (overlap) fail('The baseline would overlap existing Water coverage.', 'UTILITY_PERIOD_DATE_OVERLAP', 409);
      await assertWaterChronology({ roomId, date, reading: value, eventType: 'periodStart', session });
      let observation;
      if (period) {
        // Repair an unbilled opening with no physical evidence. The captured
        // tariff is unchanged; the unknown earlier interval is audited below.
        period.startDate = date;
        period.startReading = value;
        await period.save({ session });
        [observation] = await UtilityReading.create([{ utilityType: 'water', roomId, branch: room.branch,
          utilityPeriodId: period._id, date, observedAt: date, reading: value, unit: 'm3',
          eventType: 'periodStart', readingStatus: 'locked', recordedBy: admin._id,
          source: `opening-recovery:${source}`, correctionReason: reason.trim(), evidenceReferences: evidence,
        }], { session });
      } else {
        period = await createOpenUtilityPeriodWithBoundary({ utilityType: 'water', room, startDate: date,
          startReading: value, startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
          ratePerUnit: await resolveCurrentUtilityRate({ utilityType: 'water' }), actorId: admin._id, session });
        observation = await UtilityReading.findOne({ utilityPeriodId: period._id, eventType: 'periodStart' }).session(session);
        observation.source = `opening-recovery:${source}`;
        observation.correctionReason = reason.trim();
        observation.evidenceReferences = evidence;
        await observation.save({ session });
      }
      await AuditLog.create([{ logId: randomUUID(), type: 'data_modification', action: 'water_opening_recovered',
        severity: 'high', user: String(admin._id), userId: admin._id, branch: room.branch,
        entityType: 'utility', entityId: String(period._id),
        details: 'Recorded verified Water baseline; pre-baseline consumption remains unknown. No charges generated.',
        metadata: { roomId: String(roomId), observationId: String(observation._id), observedAt: date,
          source, reason: reason.trim(), evidenceReferences: evidence, before,
          after: { startDate: date, startReading: value, ratePerUnit: period.ratePerUnit },
          unknownConsumptionBeforeBaseline: true, generatedCharges: false },
      }], { session });
      result = { period, reading: observation, unknownConsumptionBeforeBaseline: true, idempotent: false };
    });
    return result;
  } finally { await session.endSession(); }
}
