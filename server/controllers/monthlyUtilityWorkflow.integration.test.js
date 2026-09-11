import mongoose from 'mongoose';
import { jest, beforeAll, afterAll, beforeEach, afterEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// All financial/notification persistence is real in an isolated local replica
// set. Mock only outbound delivery; these tests cannot email or push to tenants.
const email = jest.fn(async () => ({success:true}));
const push = jest.fn(async () => ({success:true}));
await jest.unstable_mockModule('../services/email/lilycrestEmailService.js',()=>({sendLilycrestEmail:email}));
await jest.unstable_mockModule('../services/notifications/mobilePushService.js',()=>({sendMobilePushBill:push,sendMobilePushToRecipients:push}));
await jest.unstable_mockModule('../utils/socket.js',()=>({emitToUser:jest.fn()}));
await jest.unstable_mockModule('../middleware/mobileTenantAuth.js',()=>({mobileTenantAuth:(req,res,next)=>{req.mobileTenant={_id:tenant._id};next();}}));
const {User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading,Payment} = await import('../models/index.js');
const {default:Notification} = await import('../models/Notification.js');
const {closeUtilityPeriod,sendUtilityPeriod,generateHistoricalUtilityPeriod,previewWaterBilling,recordUtilityReading,updateUtilityReading} = await import('./utilityBillingController.js');
const {createOpenUtilityPeriodWithBoundary} = await import('../services/billing/utilityPeriodLifecycleService.js');
const {getVisibleBillCharges} = await import('../services/billing/billingPolicy.js');
const {getUtilityDiagnostics} = await import('../utils/utilityDiagnostics.js');
const {getReservationBillingContextForUser,upsertDraftBillsForUtility,publishElectricityBill} = await import('../utils/utilityBillFlow.js');
const {default:express} = await import('express');
const {default:mobileBillingRoutes} = await import('../routes/mobileBillingRoutes.js');
const {buildTenantUtilityBreakdown} = await import('./billing/_helpers.js');
let mongo,admin,room,tenant,reservation;
jest.setTimeout(120000);
beforeAll(async()=>{
  mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:'monthly_utility_workflow'});
  await UtilityPeriod.syncIndexes();
  for(const field of ['electricitySupplementKey','waterSupplementKey']) await Bill.collection.createIndex({[field]:1},{unique:true,sparse:true});
});
afterEach(()=>jest.useRealTimers());
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();});
beforeEach(async()=>{
  for (const model of [User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading,Notification,Payment]) await model.deleteMany({});
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
for (const type of ['electricity','water']) for (const sendDay of [15,18]) test(`${type} Sep ${sendDay} send: monthly close keeps the period, drafts stay hidden, Send releases once and only then notifies`,async()=>{
  jest.useFakeTimers({doNotFake:['nextTick','setImmediate','clearImmediate','setTimeout','clearTimeout','setInterval','clearInterval','hrtime','performance','queueMicrotask']});
  jest.setSystemTime(new Date('2026-09-15T12:00:00+08:00'));
  const rate=type==='electricity'?16:50;
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:rate,actorId:admin._id});
  const generated=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-08-15',startReading:100,endDate:'2026-09-15',endReading:118});
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
  await Bill.updateOne({_id:draft._id},{$set:{paymongoSessionId:'audit-stale-checkout'}});
  const diagnostics=await getUtilityDiagnostics({branch:'gil-puyat'});
  const diagnostic=diagnostics[`${type}Rooms`][0];
  expect(diagnostic.billingState).toBe('open');
  expect(diagnostic.readyPeriods.map(period=>String(period.id))).toEqual([String(p._id)]);
  jest.setSystemTime(new Date(`2026-09-${sendDay}T12:00:00+08:00`));
  if (sendDay === 18) await UtilityReading.create({utilityType:type,roomId:room._id,branch:room.branch,date:new Date('2026-09-16T00:00:00+08:00'),reading:119,eventType:'regularBilling',recordedBy:admin._id,utilityPeriodId:next._id});
  const sent=await invoke(sendUtilityPeriod,type,p._id);
  expect(sent.error).toBeUndefined();expect(sent.statusCode).toBe(200);
  const released=await Bill.findById(draft._id).lean();
  expect(getVisibleBillCharges(released)[type]).toBe(18*rate);expect(released.totalAmount).toBe(18*rate);expect(released.remainingAmount).toBe(18*rate);
  expect(released.utilityDispatch[type].state).toBe('sent');
  expect(released.paymongoSessionId).toBeNull();
  expect(released.issuedAt).toEqual(new Date(`2026-09-${sendDay}T00:00:00+08:00`));
  expect(await Notification.countDocuments()).toBe(1);expect(email).toHaveBeenCalledTimes(1);expect(push).toHaveBeenCalled();
  const notification=await Notification.findOne({userId:tenant._id}).lean();
  expect(String(notification.entityId)).toBe(String(released._id));
  expect(String(notification.data.utilityPeriodId)).toBe(String(p._id));
  if(type==='water') expect(notification.data.allocationIds).toBe(released.waterAllocations.map(a=>a.allocationId).sort().join(','));
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
  expect(after).toEqual(closed);
  expect((await getUtilityDiagnostics({branch:'gil-puyat'}))[`${type}Rooms`][0].readyPeriods).toHaveLength(0);
  if (sendDay === 18) {
    const following=await invoke(closeUtilityPeriod,type,next._id,{startDate:'2026-09-15',startReading:118,endDate:'2026-10-15',endReading:130});
    expect(following.error).toBeUndefined();
    expect((await UtilityPeriod.findById(next._id).lean()).computedTotalUsage).toBe(12);
    expect(await UtilityPeriod.findById(p._id).lean()).toEqual(closed);
    expect(await Notification.countDocuments()).toBe(1);
  }
});


const observed = (type, date, reading, extra={}) => UtilityReading.create({utilityType:type,roomId:room._id,branch:room.branch,date:new Date(date),reading,eventType:'regularBilling',recordedBy:admin._id,...extra});

test('legacy Water breakdown follows canonical dispatch visibility',async()=>{
  const bill=await Bill.create({userId:tenant._id,reservationId:reservation._id,roomId:room._id,branch:room.branch,billingMonth:new Date('2026-08-01'),charges:{water:300},totalAmount:0,status:'draft'});
  const period=await UtilityPeriod.create({utilityType:'water',calculationVersion:'water-occupancy-legacy',roomId:room._id,branch:room.branch,startDate:new Date('2026-08-01'),endDate:new Date('2026-09-01'),startReading:0,endReading:0,ratePerUnit:300,status:'closed',computedTotalCost:300,tenantSummaries:[{tenantId:tenant._id,tenantName:'Monthly Tenant',totalUsage:0,reservationId:reservation._id,billId:bill._id,billAmount:300}]});
  bill.utilityDispatch.water={state:'draft',periodId:period._id,amount:300};await bill.save();
  expect(await buildTenantUtilityBreakdown({dbUser:tenant,bill,utilityType:'water'})).toBeNull();
  bill.utilityDispatch.water.state='sent';await bill.save();
  expect((await buildTenantUtilityBreakdown({dbUser:tenant,bill,utilityType:'water'})).tenantAmount).toBe(300);
});

test('Electricity create/update enforce both neighbors, excluded evidence and explicit replacement boundaries',async()=>{
  const type='electricity';
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-01T00:00:00+08:00'),startReading:90,ratePerUnit:16,actorId:admin._id});
  await observed(type,'2026-08-10T00:00:00+08:00',100,{utilityPeriodId:p._id});
  await observed(type,'2026-08-20T00:00:00+08:00',120,{utilityPeriodId:p._id});
  for (const excluded of [{readingStatus:'corrected'},{readingStatus:'voided'},{isArchived:true},{supersededByReadingId:new mongoose.Types.ObjectId()}]) {
    await observed(type,'2026-08-14T00:00:00+08:00',999,{...excluded,utilityPeriodId:p._id});
    await observed(type,'2026-08-16T00:00:00+08:00',1,{...excluded,utilityPeriodId:p._id});
  }
  const body={roomId:room._id,date:'2026-08-15',eventType:'moveIn',tenantId:tenant._id};
  for(const reading of [99,130]) expect((await invoke(recordUtilityReading,type,null,{...body,reading})).error?.code).toBe('ELECTRICITY_READING_CONFLICT');
  expect((await invoke(recordUtilityReading,type,null,{...body,reading:110})).statusCode).toBe(201);
  const reading=await UtilityReading.findOne({eventType:'moveIn',date:new Date('2026-08-15T00:00:00+08:00')});
  expect((await invoke(updateUtilityReading,type,reading._id,{reading:115})).error).toBeUndefined();
  expect((await invoke(updateUtilityReading,type,reading._id,{reading:130})).error?.code).toBe('ELECTRICITY_READING_CONFLICT');
  expect((await invoke(updateUtilityReading,type,reading._id,{date:'2026-08-09'})).error?.code).toBe('ELECTRICITY_READING_CONFLICT');
  expect((await UtilityReading.findById(reading._id)).reading).toBe(115);
  expect((await invoke(recordUtilityReading,type,null,{...body,eventType:'moveOut',reading:116})).error?.code).toBe('ELECTRICITY_READING_CONFLICT');
  expect((await invoke(recordUtilityReading,type,null,{...body,eventType:'moveOut',reading:115})).statusCode).toBe(201);
  await observed(type,'2026-08-30T00:00:00+08:00',5,{utilityPeriodId:p._id});
  expect((await invoke(recordUtilityReading,type,null,{roomId:room._id,date:'2026-08-25',reading:0,eventType:'meterReplacement',meterReset:{oldMeterFinalReading:125,evidenceReferences:['replacement-ticket']}})).statusCode).toBe(201);
  await observed(type,'2026-08-25T00:00:00+08:00',125,{eventType:'periodEnd',utilityPeriodId:p._id});
  expect((await invoke(recordUtilityReading,type,null,{...body,date:'2026-08-26',reading:3})).statusCode).toBe(201);
});

for(const paidAmount of [0,4000,10000]) test(`Electricity 1000 draft preserves ${paidAmount}/10000 rent payment history through Send`,async()=>{
  const type='electricity';
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:10,actorId:admin._id});
  const context=await getReservationBillingContextForUser(tenant._id,new Date('2026-09-15T00:00:00+08:00'));
  const status=paidAmount===10000?'paid':paidAmount?'partially-paid':'pending';
  const rent=await Bill.create({userId:tenant._id,reservationId:reservation._id,roomId:room._id,branch:room.branch,billingMonth:context.cycle.billingMonth,billingCycleStart:context.cycle.billingCycleStart,billingCycleEnd:context.cycle.billingCycleEnd,charges:{rent:10000},totalAmount:10000,grossAmount:10000,paidAmount,remainingAmount:10000-paidAmount,status,paymentState:paidAmount===10000?'paid':paidAmount?'partially-paid':'unpaid',paymentDate:paidAmount?new Date('2026-09-01'):null,paymongoPaymentId:'historical-payment',paymongoSessionId:'historical-session',receiptSourceVersion:'historical-receipt',releasedAt:new Date('2026-09-01')});
  if(paidAmount) await Payment.create({tenantId:tenant._id,billId:rent._id,amount:paidAmount,method:'offline_cash',branch:room.branch,purpose:'rent'});
  const original=await Bill.findById(rent._id).lean();const ledger=await Payment.find({}).lean();
  expect((await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-15',endReading:200})).error).toBeUndefined();
  const period=await UtilityPeriod.findById(p._id);
  const summary=period.tenantSummaries[0];
  const draft=await Bill.findById(summary.billId);
  expect(draft.charges.electricity).toBe(1000);expect(getVisibleBillCharges(draft).electricity).toBe(0);
  expect(String(draft._id)===String(rent._id)).toBe(paidAmount<10000);
  for(let n=0;n<2;n++) await upsertDraftBillsForUtility({period,room,tenantSummaries:period.tenantSummaries,utilityType:type});
  expect(await Bill.countDocuments()).toBe(paidAmount===10000?2:1);
  expect((await invoke(sendUtilityPeriod,type,p._id)).error).toBeUndefined();
  const sent=await Bill.findById(draft._id);
  expect(sent.remainingAmount).toBe((paidAmount===10000?0:10000-paidAmount)+1000);
  expect(getVisibleBillCharges(sent).electricity).toBe(1000);
  await expect(upsertDraftBillsForUtility({period,room,tenantSummaries:period.tenantSummaries,utilityType:type})).rejects.toMatchObject({statusCode:409});
  expect(await Payment.find({}).lean()).toEqual(ledger);
  if(paidAmount===10000) expect(await Bill.findById(rent._id).lean()).toEqual(original);
  else expect((await Bill.findById(rent._id)).paidAmount).toBe(paidAmount);
});

test('Electricity rechecks paid status at Send and publishes a supplement exactly once',async()=>{
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:'electricity',room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
  await invoke(closeUtilityPeriod,'electricity',p._id,{endDate:'2026-09-15',endReading:118});
  const bill=await Bill.findOne({reservationId:reservation._id});
  await Bill.updateOne({_id:bill._id},{$set:{status:'paid',paidAmount:0,paymongoPaymentId:'settled-payment',paymongoSessionId:'settled-session'}});
  const original=await Bill.findById(bill._id).lean();
  const closed=await UtilityPeriod.findById(p._id);
  const args={billId:bill._id,period:closed,publishedAt:new Date(),issuedAt:new Date(),dueDate:new Date()};
  const published=await publishElectricityBill(args);
  expect(published.bill._id.equals(bill._id)).toBe(false);
  expect(published.bill.remainingAmount).toBe(288);
  expect(await publishElectricityBill(args)).toBeNull();
  expect(await Bill.findById(bill._id).lean()).toEqual(original);
  expect(String((await UtilityPeriod.findById(p._id)).tenantSummaries[0].billId)).toBe(String(published.bill._id));
  expect(await Bill.countDocuments()).toBe(2);
});
for (const type of ['electricity','water']) {
  test(`${type}: audit monthly generation preserves an already paid rent invoice`,async()=>{
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
    const context=await getReservationBillingContextForUser(tenant._id,new Date('2026-09-15T00:00:00+08:00'));
    const paid=await Bill.create({userId:tenant._id,reservationId:reservation._id,roomId:room._id,branch:room.branch,billingMonth:context.cycle.billingMonth,billingCycleStart:context.cycle.billingCycleStart,billingCycleEnd:context.cycle.billingCycleEnd,charges:{rent:5000},totalAmount:5000,grossAmount:5000,paidAmount:5000,remainingAmount:0,status:'paid',releasedAt:new Date('2026-09-01T00:00:00+08:00')});
    paid.paymentState='paid';paid.paymentDate=new Date('2026-09-01T12:00:00+08:00');await paid.save();
    const original=await Bill.findById(paid._id).lean();
    const response=await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-15',endReading:118});
    expect(response.error).toBeUndefined();
    expect(await Bill.findById(paid._id).lean()).toEqual(original);
    const generated=await Bill.findOne({_id:{$ne:paid._id},reservationId:reservation._id});
    expect(generated).not.toBeNull();
    expect(getVisibleBillCharges(generated)[type]).toBe(0);
    const duplicate=await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-15',endReading:118});
    expect(duplicate.error).toBeUndefined();expect(await Bill.countDocuments()).toBe(2);
    expect((await invoke(sendUtilityPeriod,type,p._id)).error).toBeUndefined();
    expect(getVisibleBillCharges(await Bill.findById(generated._id))[type]).toBe(288);
    expect(await Bill.findById(paid._id).lean()).toEqual(original);
    expect((await invoke(sendUtilityPeriod,type,p._id)).statusCode).toBe(409);
    expect(await Bill.countDocuments()).toBe(2);
  });
  test(`${type}: audit later edited opening with no skipped usage and a custom end preserves evidence`,async()=>{
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-09-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
    const evidence=await observed(type,'2026-09-20T10:00:00+08:00',100,{utilityPeriodId:p._id});
    const response=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-09-20',startReading:100,endDate:'2026-10-12',endReading:118});
    expect(response.error).toBeUndefined();
    const closed=await UtilityPeriod.findById(p._id).lean();
    expect(closed.startDate).toEqual(evidence.date);
    expect(closed.endDate).toEqual(new Date('2026-10-12T00:00:00+08:00'));
    expect(closed.computedTotalUsage).toBe(18);
    const closing=await UtilityReading.findOne({utilityPeriodId:p._id,eventType:'periodEnd'}).lean();
    expect(closing.date).toEqual(closed.endDate);expect(closing.reading).toBe(118);
    if(type==='water') expect(closed.calculationInputs.openingObservationId).toBe(String(evidence._id));
  });
  test(`${type}: audit edited end cannot contradict a later recorded physical observation`,async()=>{
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
    await observed(type,'2026-09-12T00:00:00+08:00',120,{utilityPeriodId:p._id});
    const response=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-08-15',startReading:100,endDate:'2026-09-10',endReading:130});
    expect(response.error?.statusCode || response.statusCode).toBeGreaterThanOrEqual(400);
    expect((await UtilityPeriod.findById(p._id).lean()).status).toBe('open');
    expect(await Bill.countDocuments()).toBe(0);
  });
  test(`${type}: audit direct mobile breakdown hides an owned unreleased draft`,async()=>{
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
    const generated=await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-15',endReading:118});
    expect(generated.error).toBeUndefined();
    const bill=await Bill.findOne({reservationId:reservation._id});
    const app=express();app.use('/api/m',mobileBillingRoutes);
    const http=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
    try {
      const base=`http://127.0.0.1:${http.address().port}/api/m`;
      const list=await fetch(`${base}/billing/me`);
      expect(await list.json()).toEqual([]);
      const stranger=await User.create({firebaseUid:'audit-stranger',username:'audit-stranger',email:'stranger@example.test',firstName:'Other',lastName:'Tenant',role:'tenant',branch:room.branch});
      await Bill.updateOne({_id:bill._id},{$set:{userId:stranger._id}});
      const forbidden=await fetch(`${base}/billing/${bill._id}/breakdown/${type}`);
      expect(forbidden.status).toBe(404);
      await Bill.updateOne({_id:bill._id},{$set:{userId:tenant._id}});
      const response=await fetch(`${base}/billing/${bill._id}/breakdown/${type}`);
      expect(response.status).toBe(404);
      const detail=await (await fetch(`${base}/billing/${bill._id}`)).json();
      expect(detail[type]).toBe(0);expect(detail.utility_breakdowns[type]).toBeNull();
      expect((await invoke(sendUtilityPeriod,type,p._id)).error).toBeUndefined();
      const releasedList=await (await fetch(`${base}/billing/me`)).json();
      expect(releasedList).toHaveLength(1);expect(releasedList[0][type]).toBe(288);
      const released=await fetch(`${base}/billing/${bill._id}/breakdown/${type}`);
      expect(released.status).toBe(200);
      const breakdown=await released.json();
      expect(type==='electricity' ? breakdown.myBillAmount : breakdown.tenantAmount).toBe(288);
    } finally { await new Promise(resolve=>http.close(resolve)); }
  });
}
for (const type of ['electricity','water']) {
  test(`${type}: valid edited active opening uses evidence atomically without rewriting observations`,async()=>{
    const baseline=await observed(type,'2026-08-15T10:00:00+08:00',100);
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-20T00:00:00+08:00'),startReading:105,ratePerUnit:16,actorId:admin._id});
    const before=await UtilityReading.find({}).sort({_id:1}).lean();
    const body={roomId:room._id,periodId:p._id,startDate:'2026-08-15',startReading:100,endDate:'2026-09-15',endReading:118};
    let preview;
    if(type==='water') { preview=await invoke(previewWaterBilling,type,p._id,body);expect(preview.error).toBeUndefined(); }
    const response=await invoke(closeUtilityPeriod,type,p._id,body);
    expect(response.error).toBeUndefined();
    const closed=await UtilityPeriod.findById(p._id).lean();
    expect(closed.startDate).toEqual(baseline.date);expect(closed.startReading).toBe(100);
    expect(closed.computedTotalUsage).toBe(18);expect(closed.computedTotalCost).toBe(288);
    if(preview) expect(closed.computedTotalCost).toBe(preview.body.result.computedTotalCost);
    expect(await UtilityReading.find({_id:{$in:before.map(r=>r._id)}}).sort({_id:1}).lean()).toEqual(before);
    const marker=await UtilityReading.findOne({source:'verified_monthly_opening'}).lean();
    expect(marker.evidenceReferences).toEqual([String(baseline._id)]);
  });

  test(`${type}: no evidence, equal/reversed dates and discarded usage cannot change the active cycle`,async()=>{
    const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-15T00:00:00+08:00'),startReading:100,ratePerUnit:16,actorId:admin._id});
    const original=await UtilityPeriod.findById(p._id).lean();
    for(const endDate of ['2026-08-15','2026-08-14']) {
      const result=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-08-15',startReading:100,endDate,endReading:118});
      expect(result.error?.code).toBe('UTILITY_PERIOD_INVALID_RANGE');
    }
    const malformed=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-08-15',startReading:100,endDate:'2026-02-31',endReading:118});
    expect(malformed.error?.code).toBe('UTILITY_DATE_INVALID');
    const missing=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-08-16',startReading:100,endDate:'2026-09-15',endReading:118});
    expect(missing.error?.code).toBe(`${type.toUpperCase()}_VERIFIED_BASELINE_REQUIRED`);
    await observed(type,'2026-09-01T00:00:00+08:00',110,{utilityPeriodId:p._id});
    const skipped=await invoke(closeUtilityPeriod,type,p._id,{startDate:'2026-09-01',startReading:110,endDate:'2026-09-15',endReading:118});
    expect(skipped.error?.code).toBe('UTILITY_OPENING_WOULD_SKIP_USAGE');
    expect(await UtilityPeriod.findById(p._id).lean()).toEqual(original);
    expect(await Bill.countDocuments()).toBe(0);expect(await UtilityReading.countDocuments({eventType:'periodEnd'})).toBe(0);
  });

  test(`${type}: overlap with finalized paid history is rejected and history stays byte-for-byte unchanged`,async()=>{
    const prior=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-07-15T00:00:00+08:00'),startReading:80,ratePerUnit:16,actorId:admin._id});
    expect((await invoke(closeUtilityPeriod,type,prior._id,{endDate:'2026-08-15',endReading:100})).error).toBeUndefined();
    await invoke(sendUtilityPeriod,type,prior._id);
    await Bill.updateMany({},{$set:{status:'paid',paidAmount:320,remainingAmount:0}});
    const history=await UtilityPeriod.findById(prior._id).lean();
    const bills=await Bill.find({}).lean();
    let active=await UtilityPeriod.findOne({utilityType:type,status:'open'});
    if(!active) active=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:history.endDate,startReading:100,ratePerUnit:16,actorId:admin._id});
    const response=await invoke(closeUtilityPeriod,type,active._id,{startDate:'2026-07-15',startReading:80,endDate:'2026-09-15',endReading:118});
    expect(response.error?.code).toBe('UTILITY_PERIOD_DATE_OVERLAP');
    expect(await UtilityPeriod.findById(prior._id).lean()).toEqual(history);
    expect(await Bill.find({}).lean()).toEqual(bills);
  });

  test(`${type}: partial first cycle and next monthly cycle retain observed opening timestamps`,async()=>{
    const moveInDate=new Date('2026-09-20T10:00:00+08:00');
    await Reservation.updateOne({_id:reservation._id},{$set:{moveInDate}});
    await BedHistory.updateOne({reservationId:reservation._id},{$set:{moveInDate,observedStartAt:moveInDate}});
    const missing=await invoke(generateHistoricalUtilityPeriod,type,null,{roomId:room._id,startDate:'2026-09-20',startReading:100,endDate:'2026-10-15',endReading:118,ratePerUnit:16});
    expect(missing.error?.code).toBe(`${type.toUpperCase()}_VERIFIED_BASELINE_REQUIRED`);
    expect(await UtilityPeriod.countDocuments()).toBe(0);
    const baseline=await observed(type,moveInDate,100,{eventType:'moveIn',tenantId:tenant._id,reservationId:reservation._id});
    const first=await invoke(generateHistoricalUtilityPeriod,type,null,{roomId:room._id,startDate:'2026-09-20',startReading:100,endDate:'2026-10-15',endReading:118,ratePerUnit:16});
    expect(first.error).toBeUndefined();
    const period=await UtilityPeriod.findById(first.body.result.periodId).lean();
    expect(period.startDate).toEqual(baseline.date);expect(period.endDate).toEqual(new Date('2026-10-15T00:00:00+08:00'));
    const second=await invoke(generateHistoricalUtilityPeriod,type,null,{roomId:room._id,startDate:'2026-10-15',startReading:118,endDate:'2026-11-15',endReading:130,ratePerUnit:16});
    expect(second.error).toBeUndefined();
    const following=await UtilityPeriod.findById(second.body.result.periodId).lean();
    expect(following.startDate).toEqual(period.endDate);expect(following.startReading).toBe(period.endReading);
  });

  test(`${type}: exact shared closing/opening observation on the same calendar day is not an overlap`,async()=>{
    const end=new Date('2026-08-15T10:00:00+08:00');
    const prior=await UtilityPeriod.create({utilityType:type,roomId:room._id,branch:room.branch,status:'closed',startDate:new Date('2026-07-15T00:00:00+08:00'),endDate:end,startReading:80,endReading:100,ratePerUnit:16});
    await observed(type,end,100,{eventType:'periodEnd',utilityPeriodId:prior._id});
    const result=await invoke(generateHistoricalUtilityPeriod,type,null,{roomId:room._id,startDate:'2026-08-15',startReading:100,endDate:'2026-09-15',endReading:118,ratePerUnit:16});
    expect(result.error).toBeUndefined();
    expect((await UtilityPeriod.findById(result.body.result.periodId).lean()).startDate).toEqual(end);
    expect(await UtilityPeriod.findById(prior._id).lean()).toEqual(prior.toObject());
  });
}
