import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyWaterError } from './waterErrors.js';
import { utilityDeliveryMessage } from './utilityDeliveryMessage.js';

test('missing opening guidance distinguishes an existing cycle from missing setup', () => {
  const error = {response:{data:{error:{code:'WATER_VERIFIED_BASELINE_REQUIRED'}}}};
  assert.equal(friendlyWaterError(error), 'Water billing is not active for this room yet. Create a water cycle first.');
  assert.equal(friendlyWaterError(error,{hasActiveCycle:true}), 'This cycle needs a verified opening reading before billing can continue.');
});
for (const [code, message] of Object.entries({
  WATER_READING_INVALID:'Enter a valid meter reading of zero or more.',
  WATER_OBSERVATION_INVALID:'Enter when the reading was taken. It cannot be in the future.',
  WATER_HISTORICAL_EVIDENCE_REQUIRED:'Add a reference to the record supporting this historical reading.',
  WATER_READING_CONFLICT:'This meter reading conflicts with an existing record. Please check the date and reading.',
  WATER_READING_DECREASED:'This meter reading conflicts with an existing record. Please check the date and reading.',
  WATER_BASELINE_ALREADY_EXISTS:'An opening reading is already recorded. Use reading correction if it is incorrect.',
  UTILITY_FINANCIAL_HISTORY_LOCKED:'This cycle already has billing history and cannot be changed through opening recovery.',
  WATER_LEGACY_CUTOVER_REQUIRED:'Review or close the existing flat-charge cycle before starting metered Water billing.',
  WATER_ROOM_EXCLUDED:'Separate metered Water billing does not apply to this room.',
  BRANCH_UTILITY_NOT_SUPPORTED:'Separate metered Water billing does not apply to this room.',
  UTILITY_PERIOD_DATE_OVERLAP:'This date conflicts with existing Water records. Review the timeline before continuing.',
})) test(`${code} has actionable wording`, () => {
  assert.equal(friendlyWaterError({code,message:'Internal implementation detail'}),message);
});
test('unknown server internals are never displayed', () => {
  assert.equal(friendlyWaterError(new Error('MongoServerError E11000 private details')), 'Unable to complete this action. Please try again.');
});
test('Send distinguishes persistence, push failure, no token and provider acceptance', () => {
  const result = value => utilityDeliveryMessage({deliveries:[{notificationDelivery:value}]});
  assert.equal(result({notificationPersisted:false}).tone,'warn');
  assert.match(result({notificationPersisted:true,push:{status:'failed'}}).message,/need a retry/);
  assert.match(result({notificationPersisted:true,push:{status:'no_eligible_token'}}).message,/no enabled device/);
  assert.match(result({notificationPersisted:true,push:{status:'accepted'}}).message,/accepted by the push provider/);
});
