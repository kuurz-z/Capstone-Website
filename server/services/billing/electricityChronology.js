import { UtilityReading, Room } from '../../models/index.js';
import { parsePhysicalMeterReading } from '../../utils/physicalMeterReading.js';

export const validElectricityObservations = roomId => ({
  roomId, utilityType:'electricity', isArchived:false,
  readingStatus:{$nin:['voided','corrected']}, supersededByReadingId:null,
});
const reset = observation => ['meterReplacement','meterRollover'].includes(observation?.eventType);
const reject = message => { throw Object.assign(new Error(message),{statusCode:422,code:'ELECTRICITY_READING_CONFLICT'}); };

export function assertElectricityNeighbors({previous,following,same=[],date,reading,eventType,meterReset}) {
  const value=parsePhysicalMeterReading(reading,{maximum:999999.99});
  if (!Number.isFinite(+new Date(date))) reject('A valid electricity observation time is required.');
  const isReset=reset({eventType});
  const oldFinal=isReset ? parsePhysicalMeterReading(meterReset?.oldMeterFinalReading,{maximum:999999.99}) : value;
  if (isReset && !(meterReset?.evidenceReferences || []).some(r=>String(r).trim())) reject('Meter replacement/rollover requires evidence.');
  // Two physical meters can meet at one timestamp: an outgoing final value
  // and an incoming opening. Do not compare one meter's value to the other.
  const sameReset=same.find(reset);
  const oldSide=!isReset && sameReset && value===Number(sameReset.meterReset?.oldMeterFinalReading);
  const newSide=!isReset && sameReset && value===Number(sameReset.reading);
  for (const observation of same) {
    const allowed=isReset ? [value,oldFinal] : sameReset ? [Number(sameReset.reading),Number(sameReset.meterReset?.oldMeterFinalReading)] : [value];
    if (!allowed.includes(Number(observation.reading)) || (!isReset && sameReset && !oldSide && !newSide)) reject('A conflicting electricity reading already exists at this timestamp.');
    if (isReset && reset(observation) && (Number(observation.reading)!==value || Number(observation.meterReset?.oldMeterFinalReading)!==oldFinal)) reject('A conflicting meter replacement already exists at this timestamp.');
  }
  const upper=reset(following) ? following.meterReset?.oldMeterFinalReading : following?.reading;
  if ((!newSide && previous && oldFinal<Number(previous.reading)) || (!oldSide && following && value>Number(upper))) {
    reject('Electricity reading must remain between the previous and following valid observations for its physical meter.');
  }
  return value;
}

export async function assertElectricityChronology({roomId,date,reading,eventType,meterReset,session=null,excludeIds=[]}) {
  // Transactional opening/closing/occupancy writers serialize on the room.
  if (session) await Room.updateOne({_id:roomId},{$inc:{electricityObservationRevision:1}},{session,timestamps:false});
  const valid={...validElectricityObservations(roomId),_id:{$nin:excludeIds}};
  const [previous,following,same]=await Promise.all([
    UtilityReading.findOne({...valid,date:{$lt:date}}).sort({date:-1,createdAt:-1}).session(session).lean(),
    UtilityReading.findOne({...valid,date:{$gt:date}}).sort({date:1,createdAt:1}).session(session).lean(),
    UtilityReading.find({...valid,date}).session(session).lean(),
  ]);
  // A later-created periodEnd at a replacement instant still belongs to the
  // outgoing meter. Resolve the reset at either neighboring instant first.
  const [previousReset,followingReset]=await Promise.all([previous,following].map(neighbor=>neighbor
    ? UtilityReading.findOne({...valid,date:neighbor.date,eventType:{$in:['meterReplacement','meterRollover']}}).session(session).lean()
    : null));
  return assertElectricityNeighbors({previous:previousReset || previous,following:followingReset || following,same,date,reading,eventType,meterReset});
}
