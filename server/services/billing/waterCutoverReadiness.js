import { Room, UtilityReading } from '../../models/index.js';
import { requiresWaterObservation } from './waterObservations.js';
import { assertWaterNeighbors, validWaterObservations } from './waterChronology.js';

// Read-only evidence check. It never creates a baseline or changes a period.
export async function validateWaterCutoverReadiness({ roomId, baselineId }) {
  const room = await Room.findById(roomId).lean();
  const reasons = [];
  if (!room || !requiresWaterObservation(room)) reasons.push('ROOM_POLICY_NOT_APPLICABLE');
  const readings = await UtilityReading.find(validWaterObservations(roomId)).sort({ date: 1, createdAt: 1 }).lean();
  const baseline = readings.find(r => String(r._id) === String(baselineId));
  if (!baseline || !baseline.recordedBy || !baseline.observedAt || baseline.date > new Date()) reasons.push('VERIFIED_BASELINE_REQUIRED');
  for (let i = 0; i < readings.length; i++) {
    const current = readings[i], previous = readings[i - 1];
    try {
      assertWaterNeighbors({ ...current, previous: previous && +previous.date !== +current.date ? previous : null,
        same: previous && +previous.date === +current.date ? [previous] : [] });
    } catch { reasons.push(`CONTRADICTORY_OBSERVATION:${current._id}`); }
  }
  // The current measured engine requires uninterrupted monotonic meter evidence.
  // A reset needs its dedicated cutover; do not claim a cycle spanning it ready.
  if (baseline && readings.some(r => r.date > baseline.date && ['meterReplacement','meterRollover'].includes(r.eventType))) reasons.push('METER_RESET_REQUIRES_NEW_BASELINE');
  return { status: reasons.length ? 'BLOCKED' : 'READY', roomId: String(roomId),
    baselineId: baseline ? String(baseline._id) : null, calculationVersion: 'water-meter-v1', reasons };
}
