import {describe,test,expect,beforeAll,beforeEach,afterAll} from '@jest/globals';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {Room,UtilityReading} from '../../models/index.js';
import {assertElectricityNeighbors,assertElectricityChronology} from './electricityChronology.js';

const date=new Date('2026-08-15T00:00:00+08:00');
const between=reading=>({date,reading,eventType:'periodEnd',previous:{reading:100},following:{reading:120}});
describe('Electricity physical meter chronology',()=>{
  test.each([100,110,120])('accepts interpolation %s including equal boundaries',reading=>{
    expect(assertElectricityNeighbors(between(reading))).toBe(reading);
  });
  test.each([99,130])('rejects impossible interpolation %s',reading=>{
    expect(()=>assertElectricityNeighbors(between(reading))).toThrow(/between/);
  });
  test('same timestamp requires agreement for a normal meter',()=>{
    expect(assertElectricityNeighbors({...between(110),same:[{reading:110}]})).toBe(110);
    expect(()=>assertElectricityNeighbors({...between(110),same:[{reading:111}]})).toThrow(/timestamp/);
  });
  test.each(['meterReplacement','meterRollover'])('%s compares outgoing final and incoming meter separately',eventType=>{
    const replacement={eventType,reading:0,meterReset:{oldMeterFinalReading:125,evidenceReferences:['work-order']}};
    expect(assertElectricityNeighbors({date,...replacement,previous:{reading:120},following:{reading:5}})).toBe(0);
    expect(()=>assertElectricityNeighbors({date,...replacement,previous:{reading:130}})).toThrow(/between/);
    expect(assertElectricityNeighbors({date,reading:124,previous:{reading:120},following:replacement})).toBe(124);
    expect(()=>assertElectricityNeighbors({date,reading:126,previous:{reading:120},following:replacement})).toThrow(/between/);
    expect(assertElectricityNeighbors({date,reading:125,eventType:'periodEnd',previous:{reading:120},same:[replacement],following:{reading:5}})).toBe(125);
    expect(assertElectricityNeighbors({date,reading:0,eventType:'periodStart',previous:{reading:120},same:[replacement],following:{reading:5}})).toBe(0);
    expect(()=>assertElectricityNeighbors({date,...replacement,meterReset:{oldMeterFinalReading:125}})).toThrow(/evidence/);
  });
});

describe('Electricity coordination writes',()=>{
  let mongo;
  const roomId=new mongoose.Types.ObjectId();
  const originalTimestamp=new Date('2000-01-01T00:00:00Z');
  beforeAll(async()=>{
    mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
    await mongoose.connect(mongo.getUri(),{dbName:'electricity_coordination_test'});
    // Manual transactions below intentionally expose write conflicts rather
    // than retrying them. Finish background index DDL before taking snapshots.
    await Promise.all([Room.init(),UtilityReading.init()]);
  },120000);
  afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();},120000);
  beforeEach(async()=>{
    await Room.deleteMany({});await UtilityReading.deleteMany({});
    await Room.collection.insertOne({_id:roomId,branch:'gil-puyat',updatedAt:originalTimestamp,createdAt:originalTimestamp});
  });

  test.each([undefined,7])('coordination increments %s exactly and preserves business timestamps',async revision=>{
    if(revision!==undefined) await Room.collection.updateOne({_id:roomId},{$set:{electricityObservationRevision:revision}});
    const before=await Room.collection.findOne({_id:roomId});
    const session=await mongoose.startSession();
    try {await session.withTransaction(()=>assertElectricityChronology({roomId,date,reading:100,eventType:'periodStart',session}));}
    finally {await session.endSession();}
    expect(await Room.collection.findOne({_id:roomId})).toEqual({...before,electricityObservationRevision:(revision??0)+1});
    await Room.updateOne({_id:roomId},{$set:{price:12345}});
    const edited=await Room.findById(roomId).lean();
    expect(edited.updatedAt.getTime()).toBeGreaterThan(originalTimestamp.getTime());
    expect(edited.createdAt).toEqual(originalTimestamp);
    expect(edited.electricityObservationRevision).toBe((revision??0)+1);
  });

  test('stale concurrent writer conflicts; fresh retry rechecks chronology and rolls back its counter',async()=>{
    const first=await mongoose.startSession();const stale=await mongoose.startSession();
    const later=new Date(+date+60000);
    try {
      first.startTransaction();stale.startTransaction();
      await Room.findById(roomId).session(stale).lean();
      await assertElectricityChronology({roomId,date,reading:120,eventType:'periodStart',session:first});
      await UtilityReading.collection.insertOne({roomId,utilityType:'electricity',date,reading:120,eventType:'periodStart',isArchived:false,readingStatus:'locked'}, {session:first});
      await first.commitTransaction();
      await expect(assertElectricityChronology({roomId,date:later,reading:110,eventType:'periodEnd',session:stale})).rejects.toMatchObject({code:112});
      await stale.abortTransaction();
      const before=await Room.collection.findOne({_id:roomId});
      await expect(stale.withTransaction(()=>assertElectricityChronology({roomId,date:later,reading:110,eventType:'periodEnd',session:stale}))).rejects.toMatchObject({code:'ELECTRICITY_READING_CONFLICT'});
      expect(await Room.collection.findOne({_id:roomId})).toEqual(before);
      expect(before.electricityObservationRevision).toBe(1);
      expect(before.updatedAt).toEqual(originalTimestamp);
      expect(await UtilityReading.countDocuments()).toBe(1);
    } finally {
      if(first.inTransaction()) await first.abortTransaction();
      if(stale.inTransaction()) await stale.abortTransaction();
      await first.endSession();await stale.endSession();
    }
  });
});
