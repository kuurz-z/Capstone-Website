export const WATER_SETUP_CONFIRMATION = 'Water billing starts from this verified reading. Earlier usage remains unknown. No bill has been created.';
export const WATER_SETUP_MISSING = 'No active water cycle found. Create a water cycle to start billing for this room.';

export function friendlyWaterError(error, { hasActiveCycle = false } = {}) {
  const payload = error?.response?.data;
  const code = payload?.error?.code || payload?.code || error?.code || '';
  const message = typeof error === 'string' ? error : payload?.error?.message ||
    (typeof payload?.error === 'string' ? payload.error : '') || error?.message || '';
  const text = `${code} ${message}`;
  if (/VERIFIED_BASELINE_REQUIRED|verified.*opening.*boundary|matching verified opening/i.test(text)) return hasActiveCycle
    ? 'This cycle needs a verified opening reading before billing can continue.'
    : 'Water billing is not active for this room yet. Create a water cycle first.';
  if (/BASELINE_ALREADY_EXISTS|verified opening already exists/i.test(text)) return 'An opening reading is already recorded. Use reading correction if it is incorrect.';
  if (/FINANCIAL_HISTORY_LOCKED|financial history|paid.*cannot|issued.*immutable|already.*sent/i.test(text)) return 'This cycle already has billing history and cannot be changed through opening recovery.';
  if (/LEGACY_CUTOVER_REQUIRED|legacy Water cycle/i.test(text)) return 'Review or close the existing flat-charge cycle before starting metered Water billing.';
  if (/ROOM_EXCLUDED|BRANCH_UTILITY_NOT_SUPPORTED|ROOM_POLICY_NOT_APPLICABLE|excluded.*Water/i.test(text)) return 'Separate metered Water billing does not apply to this room.';
  if (/HISTORICAL_EVIDENCE_REQUIRED|EVIDENCE_INVALID|historical.*evidence/i.test(text)) return 'Add a reference to the record supporting this historical reading.';
  if (/OBSERVATION_INVALID|INVALID_UTILITY.*DATE|future|actual observation time/i.test(text)) return 'Enter when the reading was taken. It cannot be in the future.';
  if (/READING_CONFLICT|READING_DECREASED|METER_READING_CONTINUITY_ERROR|cannot decrease|between the previous|conflict.*reading/i.test(text)) return 'This meter reading conflicts with an existing record. Please check the date and reading.';
  if (/READING_INVALID|PHYSICAL_METER|finite|non-negative|numeric physical reading/i.test(text)) return 'Enter a valid meter reading of zero or more.';
  if (/SOURCE_REQUIRED|REASON_REQUIRED|correction reason/i.test(text)) return 'Select the reading source and explain why it is being recorded.';
  if (/DATE_OVERLAP|CUTOVER_OVERLAP|BEFORE_BASELINE|WOULD_SKIP_USAGE|overlap|start date falls within/i.test(text)) return 'This date conflicts with existing Water records. Review the timeline before continuing.';
  if (/ALREADY_ACTIVE|lifecycle-active/i.test(text)) return 'This room already has an active Water cycle. Refresh and review its opening reading.';
  if (/PERIOD_REVIEW_REQUIRED|manual.review/i.test(text)) return 'Review the existing Water cycle before continuing.';
  if (/SNAPSHOT_IMMUTABLE|BOUNDARY_IMMUTABLE|superseded|timestamp cannot be moved|physical observations cannot be deleted/i.test(text)) return 'This saved record cannot be changed here. Use the permitted reading correction process.';
  if (/RATE_INVALID|RATE_UNAVAILABLE|Utility rate/i.test(text)) return 'Check the Water rate in Settings before continuing.';
  if (/OCCUPANCY_CONFLICT|occupancy exceeds/i.test(text)) return 'Review the room occupancy records before billing.';
  if (/METER_BOUNDARY_REQUIRED|METER_RESET_REQUIRES_NEW_BASELINE|missing.*boundary/i.test(text)) return 'A required meter reading is missing. Review the meter and occupancy records.';
  if (/ROOM_NOT_FOUND|ROOM_INVALID|BRANCH_FORBIDDEN|Access denied|not found/i.test(text)) return 'This room is unavailable or outside your access.';
  return 'Unable to complete this action. Please try again.';
}
