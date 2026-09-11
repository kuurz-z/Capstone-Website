import mongoose from 'mongoose';
import {jest, beforeAll,afterAll,beforeEach,test,expect} from '@jest/globals';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading} from '../models/index.js';
import {closeUtilityPeriod,deleteUtilityPeriod,previewWaterBilling,updateUtilityReading,getUtilityLatestReading} from './utilityBillingController.js';
import {createOpenUtilityPeriodWithBoundary} from '../services/billing/utilityPeriodLifecycleService.js';
import {recordWaterObservation} from '../services/billing/waterObservations.js';
import {upsertDraftBillsForUtility,publishWaterAllocationBill} from '../utils/utilityBillFlow.js';
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
test('preview and persisted close agree, snapshot tables survive and drafts stay hidden',async()=>{
  const p=await measuredPeriod();
  const preview=await invoke(previewWaterBilling,{roomId:room._id,periodId:p._id,startDate:'2026-08-01',endDate:'2026-09-01',endReading:118,ratePerUnit:999});
  expect(preview.error).toBeUndefined();
  const result=await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  expect(result.error).toBeUndefined();
  const closed=await UtilityPeriod.findById(p._id).lean();
  expect(closed.computedTotalCost).toBe(preview.body.result.computedTotalCost);
  expect(closed.tenantSummaries.map(s=>s.billAmount).sort()).toEqual([300,600]);
  expect(closed.segments).toHaveLength(2);expect(closed.meterEvents.length).toBeGreaterThanOrEqual(3);
  const bills=await Bill.find({}).lean();expect(bills).toHaveLength(2);
  expect(bills.reduce((sum,bill)=>sum+bill.charges.water,0)).toBe(900);
  expect(bills.every(bill=>getVisibleBillCharges(bill).water===0)).toBe(true);
  expect(closed.pricingSnapshot.ratePerUnit).toBe(50);
});
test('missing occupancy reading rolls back closing and draft generation',async()=>{
  const p=await measuredPeriod();await UtilityReading.deleteMany({eventType:'moveIn'});
  const result=await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  expect(result.error).toBeTruthy();expect(await Bill.countDocuments()).toBe(0);
  expect((await UtilityPeriod.findById(p._id)).status).toBe('open');
  expect(await UtilityReading.countDocuments({eventType:'periodEnd'})).toBe(0);
});
test('force deletion cannot touch issued or paid financial history',async()=>{
  const p=await measuredPeriod();await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  await Bill.updateMany({},{$set:{paidAmount:10,status:'partially-paid'}});
  const before=await Bill.find({}).lean();
  const result=await invoke(deleteUtilityPeriod,{force:true},{id:String(p._id)});
  expect(result.error?.code).toBe('UTILITY_FINANCIAL_HISTORY_LOCKED');
  expect(await Bill.find({}).lean()).toEqual(before);
  expect((await UtilityPeriod.findById(p._id)).isArchived).toBe(false);
});
test('two periods add idempotently and a paid invoice receives no rewrite',async()=>{
  const p=await measuredPeriod();
  const base={...p.toObject(),endDate:date(31)};
  const summary={tenantId:a._id,reservationId:ra._id,tenantName:'A',totalUsage:2,billAmount:100};
  await upsertDraftBillsForUtility({period:base,room,tenantSummaries:[summary],utilityType:'water'});
  const next={...base,_id:new mongoose.Types.ObjectId()};
  await upsertDraftBillsForUtility({period:next,room,tenantSummaries:[summary],utilityType:'water'});
  await upsertDraftBillsForUtility({period:next,room,tenantSummaries:[summary],utilityType:'water'});
  const bill=await Bill.findOne({userId:a._id});expect(bill.charges.water).toBe(200);expect(bill.waterAllocations).toHaveLength(2);
  bill.status='paid';bill.paidAmount=200;await bill.save();const old=bill.toObject();
  await upsertDraftBillsForUtility({period:{...base,_id:new mongoose.Types.ObjectId()},room,tenantSummaries:[summary],utilityType:'water'});
  expect((await Bill.findById(bill._id)).toObject()).toEqual(old);
  expect(await Bill.countDocuments({userId:a._id})).toBe(2);
});
test('water observations reject a lower baseline without changing the room',async()=>{
  await measuredPeriod();const before=await Room.findById(room._id).lean();
  const session=await mongoose.startSession();
  try {await expect(session.withTransaction(()=>recordWaterObservation({room,reading:105,eventAt:date(11),eventType:'moveOut',tenantId:b._id,reservationId:rb._id,actorId:admin._id,session}))).rejects.toThrow(/between/);}
  finally {await session.endSession();}
  expect(await Room.findById(room._id).lean()).toEqual(before);
});

test('superseding an opening preserves the original and updates the usable baseline',async()=>{
  const p=await measuredPeriod();const opening=await UtilityReading.findOne({utilityPeriodId:p._id,eventType:'periodStart'});
  const corrected=await invoke(updateUtilityReading,{reading:101,correctionReason:'Verified transcription correction'},{id:String(opening._id)});
  expect(corrected.error).toBeUndefined();
  const original=await UtilityReading.findById(opening._id);
  expect(original.reading).toBe(100);expect(original.readingStatus).toBe('corrected');
  expect(String(original.supersededByReadingId)).toBe(String(corrected.body.reading._id));
  expect((await UtilityPeriod.findById(p._id)).startReading).toBe(101);
  const closed=await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  expect(closed.error).toBeUndefined();
});
test('preview resolves a verified midday baseline without inventing midnight measurements',async()=>{
  const stamp=new Date('2026-08-01T11:22:00+08:00');
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:stamp,reading:100,eventType:'moveIn',recordedBy:admin._id});
  await UtilityReading.create({utilityType:'water',roomId:room._id,branch:room.branch,date:date(10),reading:106,eventType:'moveIn',recordedBy:admin._id});
  const preview=await invoke(previewWaterBilling,{roomId:room._id,startDate:'2026-08-01',startReading:100,endDate:'2026-09-01',endReading:118,ratePerUnit:50});
  expect(preview.error).toBeUndefined();
  expect(new Date(preview.body.result.segments[0].startDate).getTime()).toBe(stamp.getTime());
  expect(preview.body.result.tenantSummaries.map(s=>s.billAmount).sort()).toEqual([300,600]);
});

test('payment before draft dispatch uses a separate invoice and preserves the paid record',async()=>{
  const p=await measuredPeriod();await invoke(closeUtilityPeriod,{endDate:'2026-09-01',endReading:118},{id:String(p._id)});
  const paid=await Bill.findOne({userId:a._id});paid.status='paid';paid.paidAmount=0;await paid.save();
  const original=(await Bill.findById(paid._id)).toObject();
  const published=await publishWaterAllocationBill({billId:paid._id,period:(await UtilityPeriod.findById(p._id)).toObject(),publishedAt:new Date(),issuedAt:new Date(),dueDate:new Date()});
  expect((await Bill.findById(paid._id)).toObject()).toEqual(original);
  expect(String(published.bill._id)).not.toBe(String(paid._id));
  expect(getVisibleBillCharges(published.bill).water).toBe(600);
  const again=await publishWaterAllocationBill({billId:paid._id,period:p,publishedAt:new Date(),issuedAt:new Date(),dueDate:new Date()});
  expect(again).toBeNull();
  expect(await Bill.countDocuments({userId:a._id})).toBe(2);
});
