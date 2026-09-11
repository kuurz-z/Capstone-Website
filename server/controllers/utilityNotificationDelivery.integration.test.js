import mongoose from 'mongoose';
import BusinessSettings from '../models/BusinessSettings.js';
import { jest, beforeAll, afterAll, beforeEach, afterEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// All financial/notification persistence is real in an isolated local replica
// set. Mock only outbound delivery; these tests cannot email or push to tenants.
const email = jest.fn(async () => ({success:true}));
const push = jest.fn(async () => ({status:'accepted',attempted:true,accepted:1,acceptedTokenHashes:['device-a']}));
await jest.unstable_mockModule('../services/email/lilycrestEmailService.js',()=>({sendLilycrestEmail:email}));
await jest.unstable_mockModule('../services/notifications/mobilePushService.js',()=>({sendMobilePushBill:push,sendMobilePushToRecipients:push}));
await jest.unstable_mockModule('../utils/socket.js',()=>({emitToUser:jest.fn()}));
await jest.unstable_mockModule('../middleware/mobileTenantAuth.js',()=>({mobileTenantAuth:(req,res,next)=>{req.mobileTenant={_id:tenant._id};next();}}));
const {User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading,Payment} = await import('../models/index.js');
await jest.unstable_mockModule('../utils/pdfGenerator.js',()=>({generateBillPdf:jest.fn(async()=>{throw new Error('PDF omitted in delivery test');})}));
const {default:Delivery} = await import('../models/UtilityNotificationDelivery.js');
const {default:notify} = await import('../services/notifications/notificationService.js');
const {resolveUtilityNotificationRecipient} = await import('../services/notifications/utilityNotificationDelivery.js');
const {sendDraftUtilityBills} = await import('../utils/utilityBillFlow.js');
const {default:Notification} = await import('../models/Notification.js');
const {closeUtilityPeriod,sendUtilityPeriod,generateHistoricalUtilityPeriod,previewWaterBilling,recordUtilityReading,updateUtilityReading} = await import('./utilityBillingController.js');
const {createOpenUtilityPeriodWithBoundary} = await import('../services/billing/utilityPeriodLifecycleService.js');
const {getVisibleBillCharges} = await import('../services/billing/billingPolicy.js');
const {getUtilityDiagnostics} = await import('../utils/utilityDiagnostics.js');
const {getReservationBillingContextForUser,upsertDraftBillsForUtility,publishElectricityBill} = await import('../utils/utilityBillFlow.js');
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
  jest.restoreAllMocks();
  push.mockReset().mockResolvedValue({status:"accepted",attempted:true,accepted:1,acceptedTokenHashes:["device-a"]});
  await BusinessSettings.findOneAndUpdate({key:'global'},{$set:{defaultElectricityRatePerKwh:16,defaultWaterRatePerUnit:16}},{upsert:true});
  for (const model of [User,Room,Reservation,BedHistory,Bill,UtilityPeriod,UtilityReading,Notification,Payment,Delivery]) await model.deleteMany({});
  email.mockClear();push.mockClear();
  const user=role=>User.create({firebaseUid:`${role}-${new mongoose.Types.ObjectId()}`,username:`${role}-${new mongoose.Types.ObjectId()}`,email:`${new mongoose.Types.ObjectId()}@example.test`,firstName:role,lastName:'Monthly',role,tenantStatus:role==='tenant'?'active':'applicant',branch:'gil-puyat'});
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

async function closed(type) {
  const p=await createOpenUtilityPeriodWithBoundary({utilityType:type,room,startDate:new Date('2026-08-01T00:00:00+08:00'),startReading:100,ratePerUnit:50,actorId:admin._id});
  const close=await invoke(closeUtilityPeriod,type,p._id,{endDate:'2026-09-01',endReading:118});
  expect(close.error).toBeUndefined();
  return UtilityPeriod.findById(p._id).lean();
}
for (const type of ['water','electricity']) {
  for (const failure of ['null','throw']) test(`${type}: ${failure} persistence is reported and Send retries without rewriting the invoice`,async()=>{
    const p=await closed(type);
    const spy=jest.spyOn(notify,'utilityChargeAvailable');
    if(failure==='null') spy.mockResolvedValueOnce(null); else spy.mockRejectedValueOnce(new Error('notification database unavailable'));
    const first=await invoke(sendUtilityPeriod,type,p._id);
    expect(first.error).toBeUndefined();expect(first.body.published).toBe(1);
    expect(first.body.deliveries[0]).toMatchObject({notificationSent:false,notificationDelivery:{notificationPersisted:false,retryable:true}});
    expect(await Notification.countDocuments()).toBe(0);expect(push).not.toHaveBeenCalled();
    const snapshot=JSON.stringify(await Bill.find().sort({_id:1}).lean());
    const retry=await invoke(sendUtilityPeriod,type,p._id);
    expect(retry.error).toBeUndefined();expect(retry.body.published).toBe(0);
    expect(retry.body.deliveries[0].notificationDelivery).toMatchObject({notificationPersisted:true,push:{status:'accepted'}});
    expect(await Notification.countDocuments()).toBe(1);
    expect(JSON.stringify(await Bill.find().sort({_id:1}).lean())).toBe(snapshot);
    await invoke(sendUtilityPeriod,type,p._id);
    expect(await Notification.countDocuments()).toBe(1);expect(push).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
  });
  test(`${type}: push failure retries the same persisted event and preserves read state`,async()=>{
    const p=await closed(type);
    push.mockRejectedValueOnce(new Error('provider unavailable'));
    const first=await invoke(sendUtilityPeriod,type,p._id);
    expect(first.body.deliveries[0].notificationDelivery).toMatchObject({notificationPersisted:true,push:{status:'failed'}});
    const notification=await Notification.findOne();
    await Notification.updateOne({_id:notification._id},{$set:{isRead:true}});
    const snapshot=JSON.stringify(await Bill.find().lean());
    const retry=await invoke(sendUtilityPeriod,type,p._id);
    expect(retry.body.deliveries[0].notificationDelivery.push.status).toBe('accepted');
    expect(await Notification.countDocuments()).toBe(1);
    expect((await Notification.findById(notification._id)).isRead).toBe(true);
    expect(JSON.stringify(await Bill.find().lean())).toBe(snapshot);
    expect(push.mock.calls[1][1].data).toMatchObject({utilityType:type,billing_id:String(notification.entityId),url:`/bill-details?billId=${notification.entityId}`});
    expect(notification.title).toBe(`${type==='water'?'Water':'Electricity'} Charge Available`);
  });
  test(`${type}: no enabled token is in-app-only and a later registration can be retried`,async()=>{
    const p=await closed(type);push.mockResolvedValueOnce({status:'no_eligible_token',attempted:false,accepted:0});
    const first=await invoke(sendUtilityPeriod,type,p._id);
    expect(first.body.deliveries[0].notificationDelivery).toMatchObject({notificationPersisted:true,push:{status:'no_eligible_token',attempted:false}});
    await invoke(sendUtilityPeriod,type,p._id);expect(await Notification.countDocuments()).toBe(1);expect(push).toHaveBeenCalledTimes(2);
  });
  test(`${type}: applicant cannot receive an event or push even with a previously generated bill`,async()=>{
    const p=await closed(type);await User.updateOne({_id:tenant._id},{$set:{role:'applicant'}});
    const result=await invoke(sendUtilityPeriod,type,p._id);
    expect(result.error).toBeUndefined();expect(result.body.deliveries[0].notificationDelivery.notificationStatus).toBe('recipient_excluded');
    expect(await Notification.countDocuments()).toBe(0);expect(push).not.toHaveBeenCalled();expect(email).not.toHaveBeenCalled();
  });
  test(`${type}: publication rolls back if durable enqueue fails`,async()=>{
    const p=await closed(type);const snapshot=JSON.stringify(await Bill.find().lean());
    jest.spyOn(Delivery,'updateOne').mockRejectedValueOnce(new Error('outbox unavailable'));
    const result=await invoke(sendUtilityPeriod,type,p._id);
    expect(result.error).toBeDefined();expect(JSON.stringify(await Bill.find().lean())).toBe(snapshot);
    expect(await Notification.countDocuments()).toBe(0);
  });
}
test('shared room recipients retain separate canonical IDs and bill links',async()=>{
  room.type='double-sharing';room.capacity=2;room.currentOccupancy=2;await room.save();
  const second=await User.create({firebaseUid:'second',username:'second',email:'second@example.test',role:'tenant',tenantStatus:'active',firstName:'Second',lastName:'Tenant',branch:'gil-puyat'});
  const r=await Reservation.create({userId:second._id,roomId:room._id,status:'moveIn',moveInDate:reservation.moveInDate,leaseDuration:6,preferredRoomType:'double-sharing',agreedToPrivacy:true,agreedToCertification:true,totalPrice:5000,monthlyRent:5000,selectedBed:{id:'b'}});
  await BedHistory.create({roomId:room._id,tenantId:second._id,reservationId:r._id,bedId:'b',moveInDate:r.moveInDate,observedStartAt:r.moveInDate,status:'active'});
  for(const type of ['water','electricity']) {
    const p=await closed(type);const sent=await invoke(sendUtilityPeriod,type,p._id);expect(sent.error).toBeUndefined();
    const rows=await Notification.find({'data.utilityType':type}).lean();expect(rows).toHaveLength(2);
    for(const row of rows) expect(String((await Bill.findById(row.entityId)).userId)).toBe(String(row.userId));
  }
});
test('canonical ID and supported business ID resolve only the current tenant',async()=>{
  await User.collection.updateOne({_id:tenant._id},{$set:{user_id:'legacy-tenant'}});
  expect(String((await resolveUtilityNotificationRecipient('legacy-tenant'))._id)).toBe(String(tenant._id));
  expect(String((await resolveUtilityNotificationRecipient(tenant._id))._id)).toBe(String(tenant._id));
  await User.updateOne({_id:tenant._id},{$set:{role:'applicant'}});
  expect(await resolveUtilityNotificationRecipient('legacy-tenant')).toBeNull();
});
test('generic publisher and period Send share one event and do not re-alert',async()=>{
  const p=await closed('water');const bills=await Bill.find({status:'draft'});
  await sendDraftUtilityBills({bills,period:p,result:p});
  expect(await Notification.countDocuments()).toBe(1);
  const snapshot=JSON.stringify(await Bill.find().lean());
  const retry=await invoke(sendUtilityPeriod,'water',p._id);
  expect(retry.error).toBeUndefined();expect(retry.body.published).toBe(0);
  expect(await Notification.countDocuments()).toBe(1);expect(push).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(await Bill.find().lean())).toBe(snapshot);
});
test('concurrent Send requests publish once and acquire only one delivery lease',async()=>{
  const p=await closed('water');
  const results=await Promise.all([invoke(sendUtilityPeriod,'water',p._id),invoke(sendUtilityPeriod,'water',p._id)]);
  expect(results.every(r=>!r.error)).toBe(true);
  expect(await Bill.countDocuments()).toBe(1);expect(await Notification.countDocuments()).toBe(1);expect(push).toHaveBeenCalledTimes(1);
});

test('a real notification save failure remains retryable and does not produce an orphan push',async()=>{
  const p=await closed('water');
  jest.spyOn(Notification.prototype,'save').mockRejectedValueOnce(new Error('persistence failed'));
  const sent=await invoke(sendUtilityPeriod,'water',p._id);
  expect(sent.body.deliveries[0].notificationSent).toBe(false);expect(push).not.toHaveBeenCalled();
  expect((await Delivery.findOne()).notificationStatus).toBe('failed');
  const retry=await invoke(sendUtilityPeriod,'water',p._id);
  expect(retry.body.deliveries[0].notificationSent).toBe(true);expect(await Bill.countDocuments()).toBe(1);
});
test('committed publication without a delivery attempt is recovered on the next Send',async()=>{
  const p=await closed('electricity');const bill=await Bill.findOne();
  const when=new Date();
  await publishElectricityBill({billId:bill._id,period:p,publishedAt:when,issuedAt:when,dueDate:when});
  expect(await Notification.countDocuments()).toBe(0);expect(await Delivery.countDocuments()).toBe(1);
  const snapshot=JSON.stringify(await Bill.find().lean());
  await invoke(sendUtilityPeriod,'electricity',p._id);
  expect(await Notification.countDocuments()).toBe(1);expect(JSON.stringify(await Bill.find().lean())).toBe(snapshot);
});
test('partial push retry carries accepted device identities and preserves the original notification',async()=>{
  const p=await closed('water');
  push.mockResolvedValueOnce({status:'partial',attempted:true,accepted:1,acceptedTokenHashes:['accepted-device'],error:'second device unavailable'});
  await invoke(sendUtilityPeriod,'water',p._id);
  await invoke(sendUtilityPeriod,'water',p._id);
  expect(push.mock.calls[1][2].acceptedTokenHashes).toEqual(['accepted-device']);
  expect(await Notification.countDocuments()).toBe(1);
});
test('legacy generic event is adopted without a cross-path duplicate alert',async()=>{
  const p=await closed('electricity');const bill=await Bill.findOne();const when=new Date();
  await publishElectricityBill({billId:bill._id,period:p,publishedAt:when,issuedAt:when,dueDate:when});
  await Notification.create({userId:tenant._id,type:'bill_generated',title:'New Bill Available',message:'Existing bill notice',entityType:'bill',entityId:String(bill._id),dedupeKey:`bill_released:${bill._id}:invoice:${Number(bill.invoiceVersion||1)}`});
  const retry=await invoke(sendUtilityPeriod,'electricity',p._id);
  expect(retry.body.deliveries[0].notificationDelivery.push.status).toBe('legacy_unverified');
  expect(await Notification.countDocuments()).toBe(1);expect(push).not.toHaveBeenCalled();
});
test('Water and Electricity events appear in the owner feed with correct bill links, not an applicant feed',async()=>{
  const {listUserNotifications}=await import('../services/mobileNotificationBridge.js');
  for(const type of ['water','electricity']) await invoke(sendUtilityPeriod,type,(await closed(type))._id);
  const dbUser=await User.collection.findOne({_id:tenant._id});
  const rows=await listUserNotifications(mongoose.connection.db,dbUser.user_id,tenant._id,'tenant');
  expect(rows).toHaveLength(2);
  for(const row of rows) { expect(row.read).toBe(false);expect(row.url).toBe(`/bill-details?billId=${row.billing_id}`); }
  expect(await listUserNotifications(mongoose.connection.db,dbUser.user_id,tenant._id,'applicant')).toHaveLength(0);
});
