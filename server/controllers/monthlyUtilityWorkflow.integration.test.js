import mongoose from 'mongoose';
import { jest, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// All financial/notification persistence is real in an isolated local replica
// set. Mock only outbound delivery; these tests cannot email or push to tenants.
const email = jest.fn(async () => ({success:true}));
const push = jest.fn(async () => ({success:true}));
await jest.unstable_mockModule('../services/email/lilycrestEmailService.js',()=>({sendLilycrestEmail:email}));
await jest.unstable_mockModule('../services/notifications/mobilePushService.js',()=>({sendMobilePushBill:push,sendMobilePushToRecipients:push}));
await jest.unstable_mockModule('../utils/socket.js',()=>({emitToUser:jest.fn()}));
const {User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading} = await import('../models/index.js');
const {default:Notification} = await import('../models/Notification.js');
const {closeUtilityPeriod,sendUtilityPeriod} = await import('./utilityBillingController.js');
const {createOpenUtilityPeriodWithBoundary} = await import('../services/billing/utilityPeriodLifecycleService.js');
const {getVisibleBillCharges} = await import('../services/billing/billingPolicy.js');
const {getUtilityDiagnostics} = await import('../utils/utilityDiagnostics.js');
let mongo,admin,room,tenant,reservation;
jest.setTimeout(120000);
beforeAll(async()=>{
  mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:'monthly_utility_workflow'});
  await UtilityPeriod.syncIndexes();
});
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();});
beforeEach(async()=>{
  for (const model of [User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading,Notification]) await model.deleteMany({});
  email.mockClear();push.mockClear();
  const user=role=>User.create({firebaseUid:`${role}-${new mongoose.Types.ObjectId()}`,username:`${role}-${new mongoose.Types.ObjectId()}`,email:`${new mongoose.Types.ObjectId()}@example.test`,firstName:role,lastName:'Monthly',role,branch:'gil-puyat'});
  admin=await user('branch_admin');tenant=await user('tenant');
  room=await Room.create({name:'Monthly test',roomNumber:'MT',branch:'gil-puyat',type:'private',capacity:1,currentOccupancy:1,price:5000});
  const moveInDate=new Date('2026-07-01T00:00:00+08:00');
  reservation=await Reservation.create({userId:tenant._id,roomId:room._id,status:'moveIn',moveInDate,leaseDuration:6,preferredRoomType:'private',agreedToPrivacy:true,agreedToCertification:true,totalPrice:5000,monthlyRent:5000,selectedBed:{id:'a'}});
  await BedHistory.create({roomId:room._id,tenantId:tenant._id,reservationId:reservation._id,bedId:'a',moveInDate,observedStartAt:moveInDate,status:'active'});
});
async function invoke(controller,type,id,body={}) {
  let error;
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
  await controller({params:{utilityType:type,id:String(id)},body,user:{uid:admin.firebaseUid},query:{}},res,e=>{error=e;});
  return {...res,error};
}
for (const type of ['electricity','water']) test(`${type}: monthly close keeps the period, drafts stay hidden, Send releases once and only then notifies`,async()=>{
  const rate=type==='electricity'?16:50;
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-01T00:00:00+08:00'),startReading:100,ratePerUnit:rate,actorId:admin._id});
  const generated=await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-01',endReading:118});
  expect(generated.error).toBeUndefined();expect(generated.statusCode).toBe(200);
  expect(String(generated.body.result.periodId)).toBe(String(p._id));
  const closed=await UtilityPeriod.findById(p._id).lean();
  expect(closed).toMatchObject({status:'closed',startReading:100,endReading:118,computedTotalUsage:18,computedTotalCost:18*rate});
  expect(closed.startDate).toEqual(p.startDate);
  let next=await UtilityPeriod.findOne({utilityType:type,status:'open'}).lean();
  if(type==='water') {
    // Measured Water currently closes without auto-continuation. Preserve that
    // behavior, then establish a later active cycle via the safe boundary service.
    expect(next).toBeNull();
    next=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:closed.endDate,startReading:118,ratePerUnit:rate,actorId:admin._id});
  }
  expect(next.startDate).toEqual(closed.endDate);expect(next.startReading).toBe(118);
  expect(await UtilityPeriod.countDocuments()).toBe(2);
  const draft=await Bill.findOne({reservationId:reservation._id}).lean();
  expect(draft.status).toBe('draft');expect(draft.charges[type]).toBe(18*rate);
  expect(getVisibleBillCharges(draft)[type]).toBe(0);expect(draft.totalAmount).toBe(0);expect(draft.remainingAmount).toBe(0);
  expect(await Notification.countDocuments()).toBe(0);expect(email).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();
  const diagnostics=await getUtilityDiagnostics({branch:'gil-puyat'});
  const diagnostic=diagnostics[`${type}Rooms`][0];
  expect(diagnostic.billingState).toBe('open');
  expect(diagnostic.readyPeriods.map(period=>String(period.id))).toEqual([String(p._id)]);
  const sent=await invoke(sendUtilityPeriod,type,p._id);
  expect(sent.error).toBeUndefined();expect(sent.statusCode).toBe(200);
  const released=await Bill.findById(draft._id).lean();
  expect(getVisibleBillCharges(released)[type]).toBe(18*rate);expect(released.totalAmount).toBe(18*rate);expect(released.remainingAmount).toBe(18*rate);
  expect(released.utilityDispatch[type].state).toBe('sent');
  expect(await Notification.countDocuments()).toBe(1);expect(email).toHaveBeenCalledTimes(1);expect(push).toHaveBeenCalled();
  if(type==='water') {
    expect(closed.calculationVersion).toBe('water-meter-v1');expect(closed.pricingSnapshot.ratePerUnit).toBe(50);
    expect(released.waterAllocations).toHaveLength(1);
    expect(released.waterAllocations[0].allocationId).toBe(draft.waterAllocations[0].allocationId);
  }
  const retry=await invoke(sendUtilityPeriod,type,p._id);
  expect(retry.statusCode).toBe(409);
  expect((await Bill.findById(draft._id).lean()).totalAmount).toBe(18*rate);
  expect(await Notification.countDocuments()).toBe(1);expect(email).toHaveBeenCalledTimes(1);
  const after=await UtilityPeriod.findById(p._id).lean();
  expect(after.startDate).toEqual(closed.startDate);expect(after.endDate).toEqual(closed.endDate);
  expect(after.segments).toEqual(closed.segments);expect(after.computedTotalCost).toBe(closed.computedTotalCost);
  expect((await getUtilityDiagnostics({branch:'gil-puyat'}))[`${type}Rooms`][0].readyPeriods).toHaveLength(0);
});
