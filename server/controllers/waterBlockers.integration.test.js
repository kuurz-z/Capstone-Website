import mongoose from 'mongoose';
import BusinessSettings from '../models/BusinessSettings.js';
import {jest, beforeAll,afterAll,beforeEach,test,expect} from '@jest/globals';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading} from '../models/index.js';
import {closeUtilityPeriod,deleteUtilityPeriod,previewWaterBilling,getUtilityLatestReading,updateUtilityPeriod,generateHistoricalUtilityPeriod,getUtilityResult,getUtilityReadings,getUtilityPeriods,getRoomHistory,getUtilityAiReview,exportUtilityRows,reviseUtilityResult,sendUtilityPeriod} from './utilityBillingController.js';
import {createOpenUtilityPeriodWithBoundary} from '../services/billing/utilityPeriodLifecycleService.js';
import {getVisibleBillCharges} from '../services/billing/billingPolicy.js';
let mongo,admin,room,a,b,ra,rb;
const date=n=>new Date(`2026-08-${String(n).padStart(2,'0')}T00:00:00+08:00`);
jest.setTimeout(120000);
beforeAll(async()=>{mongo=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(mongo.getUri());await UtilityPeriod.syncIndexes();});
afterAll(async()=>{await mongoose.disconnect();await mongo.stop();});
async function user(name,role='tenant') {return User.create({firebaseUid:`${name}-${new mongoose.Types.ObjectId()}`,username:`${name}-${new mongoose.Types.ObjectId()}`,email:`${new mongoose.Types.ObjectId()}@example.test`,firstName:name,lastName:'Water',role,branch:'gil-puyat'});}
async function resident(u,n,bed) {
  const r=await Reservation.create({userId:u._id,roomId:room._id,status:'moveIn',moveInDate:date(n),leaseDuration:6,preferredRoomType:'double-sharing',agreedToPrivacy:true,agreedToCertification:true,totalPrice:5000,monthlyRent:5000,selectedBed:{id:bed}});
  await BedHistory.create({roomId:room._id,tenantId:u._id,reservationId:r._id,bedId:bed,moveInDate:date(n),observedStartAt:date(n),status:'active'});return r;
}
beforeEach(async()=>{
  await BusinessSettings.findOneAndUpdate({}, {$set:{defaultElectricityRatePerKwh:16,defaultWaterRatePerUnit:50}}, {upsert:true});
  for(const model of [User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading]) await model.deleteMany({});
  admin=await user('Admin','branch_admin');a=await user('A');b=await user('B');
  room=await Room.create({name:'Water test',roomNumber:'WT',branch:'gil-puyat',type:'double-sharing',capacity:2,currentOccupancy:2,price:5000});
  ra=await resident(a,1,'a');rb=await resident(b,10,'b');
});
async function invoke(controller,body,extra={}) {
  let error;const res={statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};
  await controller({params:{utilityType:'water',...extra},body,user:{uid:admin.firebaseUid},query:{}},res,e=>{error=e;});return {...res,error};
}
async function measuredPeriod() {
  const period=await createOpenUtilityPeriodWithBoundary({utilityType:'water',room,startDate:date(1),startReading:100,ratePerUnit:50,actorId:admin._id});
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(10),reading:106,eventType:'moveIn',tenantId:b._id,reservationId:rb._id,recordedBy:admin._id,utilityPeriodId:period._id});
  return period;
}

import {projectWaterPeriod} from '../services/billing/waterProjection.js';

// Acceptance regressions from the PR #172 premerge audit.
test('F1: measured PATCH preserves the physical opening',async()=>{
  const p=await measuredPeriod();
  const update=await invoke(updateUtilityPeriod,{startReading:100},{id:String(p._id)});
  expect(update.error).toBeUndefined();expect(update.statusCode).toBe(200);
  expect((await UtilityPeriod.findById(p._id)).startReading).toBe(100);
  expect((await UtilityReading.findOne({utilityPeriodId:p._id,eventType:'periodStart'})).reading).toBe(100);
  const preview=await invoke(previewWaterBilling,{roomId:room._id,periodId:p._id,endDate:'2026-09-01',endReading:118});
  expect(preview.error).toBeUndefined();
  const close=await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  expect(close.error).toBeUndefined();
  const saved=await UtilityPeriod.findById(p._id).lean();
  expect(JSON.parse(JSON.stringify(saved.segments.map(({_id,...s})=>s)))).toEqual(JSON.parse(JSON.stringify(preview.body.result.segments)));
  expect(saved.computedTotalCost).toBe(preview.body.result.computedTotalCost);
  expect(saved.calculationFingerprint).toBe(preview.body.result.calculationFingerprint);
});
test('F1: rate-only PATCH updates the authoritative snapshot and preserves opening',async()=>{
  const p=await measuredPeriod();
  const update=await invoke(updateUtilityPeriod,{ratePerUnit:54.20},{id:String(p._id)});
  expect(update.error).toBeUndefined();
  const saved=await UtilityPeriod.findById(p._id);
  expect(saved.ratePerUnit).toBe(54.20);expect(saved.pricingSnapshot.ratePerUnit).toBe(54.20);expect(saved.startReading).toBe(100);
  expect(saved.pricingAudit[0].previousRate).toBe(50);expect(String(saved.pricingSnapshot.recordedBy)).toBe(String(admin._id));
  const preview=await invoke(previewWaterBilling,{roomId:room._id,periodId:p._id,endDate:'2026-09-01',endReading:118});
  expect(preview.body.result.ratePerUnit).toBe(54.20);
  const closed=await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  expect(closed.error).toBeUndefined();
  const generated=await UtilityPeriod.findById(p._id).lean();
  expect(generated.computedTotalCost).toBe(preview.body.result.computedTotalCost);
  expect(generated.startReading).toBe(100);
  expect(generated.pricingSnapshot.ratePerUnit).toBe(preview.body.result.ratePerUnit);
});
test('F2: archive/regenerate preserves canonical occupancy boundaries',async()=>{
  const p=await measuredPeriod();
  const archived=await invoke(deleteUtilityPeriod,{}, {id:String(p._id)});
  expect(archived.error).toBeUndefined();
  const body={roomId:room._id,startDate:'2026-08-01',startReading:100,endDate:'2026-09-01',endReading:118,ratePerUnit:50};
  const preview=await invoke(previewWaterBilling,body);expect(preview.error).toBeUndefined();
  expect(preview.body.result.tenantSummaries.map(s=>s.totalUsage).sort((a,b)=>a-b)).toEqual([6,12]);
  const generated=await invoke(generateHistoricalUtilityPeriod,body);
  expect(generated.error).toBeUndefined();
  const saved=await UtilityPeriod.findOne({roomId:room._id,isArchived:false,status:'closed'}).lean();
  expect(JSON.parse(JSON.stringify(saved.segments.map(({_id,...s})=>s)))).toEqual(JSON.parse(JSON.stringify(preview.body.result.segments)));
  expect(saved.tenantSummaries.map(s=>s.totalUsage).sort((a,b)=>a-b)).toEqual([6,12]);
  expect(saved.computedTotalCost).toBe(preview.body.result.computedTotalCost);
  expect(saved.calculationFingerprint).toBe(preview.body.result.calculationFingerprint);
  for (const event of preview.body.result.meterEvents.filter(e=>e.id)) expect(saved.meterEvents).toEqual(expect.arrayContaining([expect.objectContaining({id:event.id,reading:event.reading})]));
});
test('F3: backdated closing cannot exceed a later physical observation',async()=>{
  const p=await measuredPeriod();
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(20),reading:110,eventType:'moveIn',recordedBy:admin._id,utilityPeriodId:p._id});
  const close=await invoke(closeUtilityPeriod,{endDate:'2026-08-15',endReading:120},{id:String(p._id)});
  expect(close.error?.statusCode).toBe(422);
  expect((await UtilityPeriod.findById(p._id)).status).toBe('open');
  expect(await Bill.countDocuments()).toBe(0);
  const observations=await UtilityReading.find({roomId:room._id}).sort({date:1}).lean();
  expect(observations.some((r,i)=>i>0 && r.reading<observations[i-1].reading)).toBe(false);
});
test('F5: second reservation projection uses its stored allocation identity',()=>{
  const first=new mongoose.Types.ObjectId(),second=new mongoose.Types.ObjectId();
  const projection=projectWaterPeriod({_id:new mongoose.Types.ObjectId(),calculationVersion:'water-meter-v1',startReading:100,endReading:107,ratePerUnit:50,computedTotalUsage:7,computedTotalCost:350,tenantSummaries:[{tenantId:a._id,reservationId:first,totalUsage:2,billAmount:100},{tenantId:a._id,reservationId:second,totalUsage:5,billAmount:250}]},a._id,250,`water:period:${second}:${a._id}`,{reservationId:second,usage:5,amount:250,calculationVersion:'water-meter-v1'});
  expect(projection.tenantAmount).toBe(250);expect(projection.tenantUsageShare).toBe(5);expect(projection.reservationId).toEqual(second);
});
test('F6: foreign branch admin cannot receive the water result',async()=>{
  const p=await measuredPeriod();
  await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  admin.branch='guadalupe';await admin.save();
  const result=await invoke(getUtilityResult,{}, {periodId:String(p._id)});
  expect(result.error).toBeUndefined();expect(result.statusCode).toBe(403);
  expect(result.body).toEqual({error:'Access denied'});
});

import {assertWaterChronology,assertWaterNeighbors} from '../services/billing/waterChronology.js';
import {validateWaterCutoverReadiness} from '../services/billing/waterCutoverReadiness.js';
import {buildTenantUtilityBreakdown} from './billing/_helpers.js';
import {formatMobileWaterBreakdown} from '../services/mobileBillingBridge.js';

test.each([99,120])('F3: rejects backdated %s between 100 and 110',async reading=>{
  const p=await measuredPeriod();
  await UtilityReading.updateOne({utilityPeriodId:p._id,eventType:'moveIn'},{$set:{reading:100}});
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(20),reading:110,eventType:'moveIn',recordedBy:admin._id});
  await expect(assertWaterChronology({roomId:room._id,date:date(15),reading})).rejects.toMatchObject({statusCode:422});
});
test.each([100,105,110])('F3: accepts interpolated %s between 100 and 110',async reading=>{
  const p=await measuredPeriod();
  await UtilityReading.updateOne({utilityPeriodId:p._id,eventType:'moveIn'},{$set:{reading:100}});
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(20),reading:110,eventType:'moveIn',recordedBy:admin._id});
  const close=await invoke(closeUtilityPeriod,{endDate:'2026-08-15',endReading:reading},{id:String(p._id)});
  expect(close.error).toBeUndefined();expect((await UtilityPeriod.findById(p._id)).status).toBe('closed');
});
test('F3: same timestamp agreement and excluded evidence',async()=>{
  await measuredPeriod();
  await expect(assertWaterChronology({roomId:room._id,date:date(10),reading:107})).rejects.toMatchObject({statusCode:422});
  await expect(assertWaterChronology({roomId:room._id,date:date(10),reading:106})).resolves.toBe(106);
  for (const attrs of [{readingStatus:'corrected'},{readingStatus:'voided'},{isArchived:true},{supersededByReadingId:new mongoose.Types.ObjectId()},{utilityType:'electricity'}]) {
    await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(20),reading:1,eventType:'moveIn',recordedBy:admin._id,...attrs});
  }
  await expect(assertWaterChronology({roomId:room._id,date:date(15),reading:108})).resolves.toBe(108);
});
test.each(['meterReplacement','meterRollover'])('F3: %s retains old/new meter semantics',eventType=>{
  const meterReset={oldMeterFinalReading:120,evidenceReferences:['verified-work-order']};
  expect(assertWaterNeighbors({previous:{reading:110},following:{reading:10},date:date(15),reading:0,eventType,meterReset})).toBe(0);
  expect(assertWaterNeighbors({previous:{reading:110},following:{reading:0,eventType,meterReset},date:date(14),reading:115})).toBe(115);
  expect(()=>assertWaterNeighbors({previous:{reading:110},date:date(15),reading:0,eventType,meterReset:{...meterReset,evidenceReferences:[]}})).toThrow(/evidence/);
});
test.each([{startReading:0},{startReading:null},{startDate:'2026-08-02'},{calculationVersion:'water-occupancy-legacy'}])('F1: rejects physical evidence PATCH %j',async payload=>{
  const p=await measuredPeriod();
  const result=await invoke(updateUtilityPeriod,payload,{id:String(p._id)});
  expect(result.error?.statusCode).toBe(409);expect((await UtilityPeriod.findById(p._id)).startReading).toBe(100);
});
test.each(['water','electricity'])('F6: %s result enforces both branches and owner access',async utilityType=>{
  for (const branch of ['gil-puyat','guadalupe']) {
    const p=await UtilityPeriod.create({utilityType,roomId:room._id,branch,startDate:date(branch==='gil-puyat'?1:2),startReading:0,ratePerUnit:50,status:'closed'});
    for (const adminBranch of ['gil-puyat','guadalupe']) {
      admin.branch=adminBranch;await admin.save();
      const result=await invoke(getUtilityResult,{}, {utilityType,periodId:String(p._id)});
      expect(result.error).toBeUndefined();expect(result.statusCode).toBe(branch===adminBranch?200:403);
      if (branch!==adminBranch) expect(result.body).toEqual({error:'Access denied'});
    }
    admin.role='owner';await admin.save();
    const global=await invoke(getUtilityResult,{}, {utilityType,periodId:String(p._id)});
    expect(global.error).toBeUndefined();expect(global.statusCode).toBe(200);
    admin.role='branch_admin';await admin.save();
  }
});
test('F5: web and mobile preserve two room allocations and sum once',async()=>{
  const period=await measuredPeriod();
  const otherRoom=new mongoose.Types.ObjectId(),otherPeriod=new mongoose.Types.ObjectId();
  const allocations=[{allocationId:'first',utilityPeriodId:period._id,roomId:room._id,reservationId:ra._id,tenantId:a._id,usage:4,amount:200},
    {allocationId:'second',utilityPeriodId:otherPeriod,roomId:otherRoom,reservationId:rb._id,tenantId:a._id,usage:6,amount:300}]
    .map(a=>({...a,calculationVersion:'water-meter-v1',state:'sent',cycleStart:date(1),cycleEnd:date(20),pricingSnapshot:{ratePerUnit:50,unit:'m3'}}));
  const bill={_id:new mongoose.Types.ObjectId(),userId:a._id,charges:{water:500},waterAllocations:allocations,status:'pending',totalAmount:500};
  const web=await buildTenantUtilityBreakdown({bill,utilityType:'water',dbUser:a});
  expect(web.tenantAmount).toBe(500);expect(web.tenantUsageShare).toBeNull();
  expect(web.allocations.map(a=>a.tenantUsageShare)).toEqual([4,6]);
  expect(web.allocations.map(a=>a.tenantAllocations[0].consumptionShare)).toEqual([4,6]);
  expect(web.allocations.map(a=>a.tenantAllocations[0].amount)).toEqual([200,300]);
  expect(web.allocations.map(a=>a.allocationId)).toEqual(['first','second']);
  const mobile=formatMobileWaterBreakdown(web);
  expect(mobile.allocations).toEqual(web.allocations);
  expect(mobile.tenantAmount).toBe(500);
  expect(getVisibleBillCharges(bill).water).toBe(500);
});
test('cutover readiness requires verified baseline, chronology and applicable policy without writes',async()=>{
  await measuredPeriod();
  const baseline=await UtilityReading.findOne({roomId:room._id,eventType:'periodStart'});
  const before=await UtilityReading.countDocuments();
  expect((await validateWaterCutoverReadiness({roomId:room._id,baselineId:baseline._id})).status).toBe('READY');
  expect((await validateWaterCutoverReadiness({roomId:room._id,baselineId:new mongoose.Types.ObjectId()})).status).toBe('BLOCKED');
  await UtilityReading.updateOne({roomId:room._id,eventType:'moveIn'},{$set:{reading:90}});
  expect((await validateWaterCutoverReadiness({roomId:room._id,baselineId:baseline._id})).status).toBe('BLOCKED');
  await Room.updateOne({_id:room._id},{$set:{type:'quadruple-sharing'}});
  expect((await validateWaterCutoverReadiness({roomId:room._id,baselineId:baseline._id})).reasons).toContain('ROOM_POLICY_NOT_APPLICABLE');
  expect(await UtilityReading.countDocuments()).toBe(before);
});

import {getWaterObservationBaseline} from '../services/billing/waterObservations.js';
test('F4: source and destination baselines use their own water observations, Quad excluded',async()=>{
  await measuredPeriod();
  const destination=await Room.create({name:'Destination',roomNumber:'WD',branch:room.branch,type:'private',capacity:1,price:5000});
  await UtilityReading.create({roomId:destination._id,utilityType:'water',branch:room.branch,reading:84.2,date:date(11),eventType:'moveIn',recordedBy:admin._id});
  await UtilityReading.create({roomId:room._id,utilityType:'electricity',branch:room.branch,reading:1250,date:date(12),eventType:'moveIn',recordedBy:admin._id});
  const source=await getWaterObservationBaseline(room),target=await getWaterObservationBaseline(destination);
  expect(source.previousReading).toBe(106);expect(source.roomId).toBe(String(room._id));expect(source.lastRecordedReadingDate).toEqual(date(10));
  expect(target.previousReading).toBe(84.2);expect(target.roomId).toBe(String(destination._id));expect(target.lastRecordedReadingDate).toEqual(date(11));
  expect(await getWaterObservationBaseline({...destination.toObject(),type:'quadruple-sharing'})).toEqual({required:false});
});

test('F6: utility detail, preview, review, send and export enforce branch scope before disclosure',async()=>{
  const p=await measuredPeriod();
  const electricity=await UtilityPeriod.create({utilityType:'electricity',roomId:room._id,branch:room.branch,startDate:date(1),startReading:0,ratePerUnit:10,status:'closed'});
  admin.branch='guadalupe';await admin.save();
  for (const controller of [getUtilityReadings,getUtilityLatestReading,getUtilityPeriods,getRoomHistory]) {
    for (const utilityType of ['water','electricity']) {
      const result=await invoke(controller,{}, {roomId:String(room._id),utilityType});
      expect(result.statusCode).toBe(403);expect(result.body).toEqual({error:'Access denied'});
    }
  }
  for (const controller of [updateUtilityPeriod,reviseUtilityResult,sendUtilityPeriod]) {
    const result=await invoke(controller,{}, {id:String(p._id),periodId:String(p._id)});
    expect(result.statusCode).toBe(403);expect(result.body).toEqual({error:'Access denied'});
  }
  const closed=await invoke(closeUtilityPeriod,{endReading:118,endDate:'2026-09-01'}, {id:String(p._id)});
  expect(closed.error?.statusCode).toBe(403);
  const preview=await invoke(previewWaterBilling,{roomId:room._id,periodId:p._id});
  expect(preview.statusCode).toBe(403);
  const review=await invoke(getUtilityAiReview,{}, {utilityType:'electricity',periodId:String(electricity._id)});
  expect(review.statusCode).toBe(403);
  for (const utilityType of ['water','electricity']) {
    const exported=await invoke(exportUtilityRows,{}, {utilityType});
    expect(exported.error).toBeUndefined();expect(exported.body.rows).toEqual([]);
  }
});
