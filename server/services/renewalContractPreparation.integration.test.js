import { jest, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const push = jest.fn().mockResolvedValue({sent: 1});
await jest.unstable_mockModule('./notifications/mobilePushService.js', () => ({sendMobilePushToRecipients:push,sendMobilePushBill:jest.fn(),sendMobilePushAnnouncement:jest.fn()}));
const { Contract, Reservation, Room, Stay, User, BusinessSettings, Bill } = await import('../models/index.js');
const {default: logger} = await import('../middleware/logger.js');
const {default: Notification} = await import('../models/Notification.js');
const {createDraftContract, createSuccessorContractForRenewal, generateContractNumber} = await import('./contractService.js');
const {buildContractGenerationData} = await import('./contractGenerationDataService.js');
const {buildContractHtml} = await import('./contractHtmlPdfService.js');
const {renewStayWorkflow} = await import('../utils/tenantActionService.js');
const {createStayExtension, reviewStayExtension, serializeStayExtension} = await import('./stayExtensionRequestService.js');
const {autoGenerateRenewalContract} = await import('./autoContractOrchestratorService.js');
const {reconcileMissingContractGeneration} = await import('../utils/scheduler.js');
const {toManilaStartOfDay} = await import('../utils/dateUtils.js');
const {activateDueRenewalContracts} = await import('./contractRenewalActivationService.js');
let mongo, admin, roomSequence = 300;
jest.setTimeout(120000);
beforeAll(async()=>{mongo=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(mongo.getUri(),{dbName:'renewal_preparation_fix'});await Notification.init();},120000);
beforeEach(async()=>{for(const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
 await BusinessSettings.create({key:'global',longTermLeaseMinMonths:10});
 admin=await User.create({firebaseUid:String(new mongoose.Types.ObjectId()),email:'admin@example.test',username:'auditowner',firstName:'Test',lastName:'Admin',role:'owner',accountStatus:'active'});
 push.mockClear();
});
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();},120000);
async function seed(roomType='quadruple-sharing', status='active') {
 const token=new mongoose.Types.ObjectId().toString();
 const tenant=await User.create({firebaseUid:token,email:`${token}@example.test`,username:token,firstName:'Synthetic',lastName:'Audit',role:'tenant',tenantStatus:'active'});
 const room=await Room.create({name:`Audit ${token}`,roomNumber:++roomSequence,branch:'gil-puyat',type:roomType,capacity:roomType==='private'?1:roomType==='double-sharing'?2:4,price:6300,beds:[{id:'bed-1',position:'upper',status:'occupied'}]});
 const start=toManilaStartOfDay('2026-04-15').toDate(), end=toManilaStartOfDay('2027-01-14').endOf('day').toDate();
 const reservation=await Reservation.create({userId:tenant._id,roomId:room._id,status:'moveIn',leaseDuration:9,monthlyRent:6300,totalPrice:6300,reservationFeeAmount:2000,paymentStatus:'paid',applicationReviewedAt:new Date(),applicationReviewedBy:tenant._id,approvedForPaymentAt:new Date(),preferredRoomType:roomType,agreedToPrivacy:true,agreedToCertification:true,moveInDate:start,selectedBed:{id:'bed-1'}});
 const stay=await Stay.create({tenantId:tenant._id,reservationId:reservation._id,branch:room.branch,roomId:room._id,bedId:'bed-1',leaseStartDate:start,leaseEndDate:end,monthlyRent:6300,status});
 reservation.currentStayId=stay._id; await reservation.save();
 const oldContract=await Contract.create({...await generateContractNumber(room.branch,new Date()),tenantId:tenant._id,reservationId:reservation._id,applicationId:reservation._id,stayId:stay._id,roomId:room._id,branch:room.branch,roomNumber:room.roomNumber,roomType,bedId:'bed-1',leaseType:'short_term',leaseStartDate:start,leaseEndDate:end,leaseDurationMonths:9,propertyName:'Lilycrest',propertyAddress:'Synthetic Property',tenantLegalName:'Synthetic Audit',tenantAddress:'123 Synthetic Street Makati',tenantNationality:'Filipino',tenantBirthDate:new Date('1995-01-01'),approvedMonthlyRate:6300,securityDepositAmount:6300,status:'active',isCurrent:true,createdBy:tenant._id,updatedBy:tenant._id});
 return {tenant,room,reservation,stay,oldContract};
}

async function future(f, months=6) {
 const start=toManilaStartOfDay('2027-01-15'), end=start.add(months,'month').subtract(1,'millisecond');
 return Stay.create({tenantId:f.tenant._id,reservationId:f.reservation._id,roomId:f.room._id,branch:f.room.branch,
   bedId:'bed-1',status:'upcoming',previousStayId:f.stay._id,leaseStartDate:start.toDate(),leaseEndDate:end.toDate(),
   leaseDurationMonths:months,createdBy:admin._id,updatedBy:admin._id,monthlyRent:6300});
}
async function expectPrepared(f, next) {
 const c=await Contract.findOne({stayId:next._id,contractPurpose:'renewal'});
 expect(c.status).toBe('generated');expect(c.leaseDurationMonths).toBe(6);
 expect(c.templateType).toBe(`${f.room.type}-long-term`);
 expect(c.leaseType).toBe('short_term'); // Pricing tier remains under the ten-month threshold.
 const data=await buildContractGenerationData(c); expect(()=>buildContractHtml(data)).not.toThrow();
 expect(c.preparedDocuments).toHaveLength(1);
 const r=await Reservation.findById(f.reservation._id);
 expect(r.monthlyRent).toBe(6300);expect(String(r.currentStayId)).toBe(String(f.stay._id));
 expect((await Stay.findById(f.stay._id)).status).toBe(f.stay.status);
 expect((await Stay.findById(next._id)).status).toBe('upcoming');
 expect(await Bill.countDocuments({reservationId:r._id})).toBe(0);
 return c;
}
test.each(['private','double-sharing','quadruple-sharing'])('initial six-month %s uses long legal template without repricing',async type=>{
 const f=await seed(type);await Contract.deleteMany({reservationId:f.reservation._id});
 await Reservation.updateOne({_id:f.reservation._id},{$set:{leaseDuration:6,firstName:'Test',lastName:'Tenant',nationality:'Filipino',birthday:new Date('1995-01-01'),address:{street:'Test St',barangay:'Test',city:'Makati',province:'Metro Manila'},monthlyRent:type==='private'?14400:type==='double-sharing'?8000:6300}});
 await Stay.updateOne({_id:f.stay._id},{$set:{leaseEndDate:toManilaStartOfDay("2026-10-15").subtract(1,"millisecond").toDate()}});
 const c=await createDraftContract({reservationId:f.reservation._id,actorId:admin._id});
 const rate=c.approvedMonthlyRate;
 const data=await buildContractGenerationData(c);expect(data.template.templateId).toBe(`${type}-long-term`);
 expect(data.pricing.approvedMonthlyRate).toBe(rate);expect(c.leaseType).toBe('short_term');
});
test.each(['private','double-sharing','quadruple-sharing'])('Job 19 generates six-month %s; retries keep one shell and PDF',async type=>{
 const f=await seed(type), next=await future(f);
 await reconcileMissingContractGeneration();const c=await expectPrepared(f,next);
 expect(c.approvedMonthlyRate).toBe(type==='private'?14400:type==='double-sharing'?8000:6300);
 await reconcileMissingContractGeneration();await expectPrepared(f,next);
 expect(await Contract.countDocuments({replacesContractId:f.oldContract._id,contractPurpose:'renewal'})).toBe(1);
});
test.each(['active','ending_soon'])('direct admin renewal from %s preserves current tenure until activation',async status=>{
 const f=await seed('quadruple-sharing',status);
 const result=await renewStayWorkflow({reservationId:f.reservation._id,actorId:admin._id,payload:{confirm:true,newLeaseStartDate:'2027-01-15',newLeaseEndDate:'2027-07-14',monthlyRent:6300}});
 await expectPrepared(f,result.stay);
});
test('mobile Extend Stay approval prepares the exact six-month case and preserves frozen pricing',async()=>{
 const f=await seed();
 const request=await createStayExtension({tenantId:f.tenant._id,payload:{stayId:String(f.stay._id),months:6,reason:'Continue stay'}});
 const approved=await reviewStayExtension({requestId:request._id,actor:admin,decision:'approved'});
 expect(approved.status).toBe('approved');const next=await Stay.findById(approved.successorStayId);
 const c=await expectPrepared(f,next);expect(c.approvedMonthlyRate).toBe(request.monthlyRent);
 await BusinessSettings.updateOne({key:'global'},{$set:{longTermLeaseMinMonths:6}});
 await reconcileMissingContractGeneration();expect((await Contract.findById(c._id)).approvedMonthlyRate).toBe(6300);
});
test('deterministic metadata error is action_required once; good renewals continue; changed input recovers',async()=>{
 const bad=await seed(), next=await future(bad);
 const shell=await createSuccessorContractForRenewal({reservationId:bad.reservation._id,oldContract:bad.oldContract,newStay:next,actorId:admin._id});
 shell.leaseDurationMonths=7;await shell.save();
 const good=await seed(), goodNext=await future(good);
 await reconcileMissingContractGeneration();await expectPrepared(good,goodNext);
 const first=await Stay.findById(next._id);expect(first.contractPreparation.status).toBe('action_required');
 expect(first.contractPreparation.code).toBe('LEASE_DURATION_CONFLICT');
 const alerts=()=>Notification.countDocuments({userId:admin._id,type:'contract_error',entityId:bad.reservation._id});
 expect(await alerts()).toBe(1);
 const warning = jest.spyOn(logger, 'warn');
 const info = jest.spyOn(logger, 'info');
 await reconcileMissingContractGeneration();await reconcileMissingContractGeneration();
 expect(warning.mock.calls.filter(call=>String(call[1]).includes('Renewal contract preparation failed'))).toHaveLength(0);
 expect(info.mock.calls.filter(call=>String(call[1]).includes('Duplicate event suppressed'))).toHaveLength(0);
 warning.mockRestore();info.mockRestore();
 expect(await alerts()).toBe(1);expect((await Stay.findById(next._id)).contractPreparation.failedAt).toEqual(first.contractPreparation.failedAt);
 expect(await Contract.countDocuments({replacesContractId:bad.oldContract._id,contractPurpose:'renewal'})).toBe(1);
 await Contract.updateOne({_id:shell._id},{$set:{leaseDurationMonths:6}});
 await reconcileMissingContractGeneration();await expectPrepared(bad,next);
 expect((await Stay.findById(next._id)).contractPreparation).toBeNull();
});
test('transient database failure remains retryable and the next Job 19 succeeds',async()=>{
 const f=await seed(), next=await future(f);
 const fault=jest.spyOn(Contract,'findById').mockRejectedValueOnce(Object.assign(new Error('Temporary database outage'),{code:'ECONNRESET'}));
 await reconcileMissingContractGeneration();fault.mockRestore();
 expect((await Stay.findById(next._id)).contractPreparation.status).toBe('retryable');
 await reconcileMissingContractGeneration();await expectPrepared(f,next);
});
test('concurrent renewal preparation reuses one successor shell',async()=>{
 const f=await seed(), next=await future(f);
 const args={reservationId:f.reservation._id,oldContract:f.oldContract,newStay:next,actorId:admin._id};
 const [a,b]=await Promise.all([createSuccessorContractForRenewal(args),createSuccessorContractForRenewal(args)]);
 expect(String(a._id)).toBe(String(b._id));expect(await Contract.countDocuments({replacesContractId:f.oldContract._id})).toBe(1);
});

test('explicit Admin retry preserves the shell and diagnostic dedupe; effective-date activation stays deferred', async()=>{
 const f=await seed();
 const request=await createStayExtension({tenantId:f.tenant._id,payload:{stayId:String(f.stay._id),months:6}});
 const approved=await reviewStayExtension({requestId:request._id,actor:admin,decision:'approved'});
 const next=await Stay.findById(approved.successorStayId), c=await expectPrepared(f,next);
 await Contract.updateOne({_id:c._id},{$set:{status:'draft',leaseDurationMonths:7}});
 await autoGenerateRenewalContract({reservationId:f.reservation._id,oldContract:f.oldContract,newStay:next,actorId:admin._id});
 const blocked=await serializeStayExtension(approved);
 expect(blocked.fulfillmentState).toBe('action_required');expect(blocked.preparationFailure.code).toBe('LEASE_DURATION_CONFLICT');
 const first=(await Stay.findById(next._id)).contractPreparation.failedAt;
 await new Promise(resolve=>setTimeout(resolve,5));
 const retried=await reviewStayExtension({requestId:request._id,actor:admin,decision:'retry_preparation'});
 expect(retried.fulfillmentState).toBe('action_required');
 expect((await Stay.findById(next._id)).contractPreparation.failedAt.getTime()).toBeGreaterThan(first.getTime());
 expect(await Notification.countDocuments({userId:admin._id,type:'contract_error',entityId:f.reservation._id})).toBe(1);
 await Contract.updateOne({_id:c._id},{$set:{leaseDurationMonths:6,status:'published',approvedMonthlyRate:6800,
 finalDocument:{storageKey:'test/final.pdf',fileName:'final.pdf',fileHash:'test',fileSize:1024,mimeType:'application/pdf',pageCount:4,sourceType:'admin_scan',sourceVersion:1,sourceUploadedAt:new Date(),publishedAt:new Date(),publishedBy:admin._id,tenantVisible:true}}});
 expect((await activateDueRenewalContracts({now:new Date('2027-01-14T15:59:59Z')})).activated).toBe(0);
 expect(String((await Reservation.findById(f.reservation._id)).currentStayId)).toBe(String(f.stay._id));
 const activated=await activateDueRenewalContracts({now:new Date('2027-01-14T16:00:00Z')});
 expect(activated.errors).toBe(0);expect(activated.activated).toBe(1);
 const reservation=await Reservation.findById(f.reservation._id);
 expect(String(reservation.currentStayId)).toBe(String(next._id));expect(reservation.monthlyRent).toBe(6800);
 expect((await Stay.findById(next._id)).status).toBe('active');
 expect((await Stay.findById(f.stay._id)).status).toBe('renewed');
 expect((await activateDueRenewalContracts({now:new Date('2027-01-15T00:00:00Z')})).activated).toBe(0);
});

test('direct Admin approved rate is frozen independently of legal template and pricing threshold', async()=>{
 const f=await seed();
 const result=await renewStayWorkflow({reservationId:f.reservation._id,actorId:admin._id,payload:{confirm:true,newLeaseStartDate:'2027-01-15',newLeaseEndDate:'2027-07-14',monthlyRent:6800}});
 const c=await expectPrepared(f,result.stay);expect(c.approvedMonthlyRate).toBe(6800);
});

test('concurrent manual and scheduled generation emits only one prepared PDF', async()=>{
 const f=await seed(), next=await future(f);
 const args={reservationId:f.reservation._id,oldContract:f.oldContract,newStay:next,actorId:admin._id};
 const results=await Promise.all([autoGenerateRenewalContract(args),autoGenerateRenewalContract(args)]);
 expect(results.filter(r=>r.success)).toHaveLength(1);
 expect(results.filter(r=>r.inProgress)).toHaveLength(1);
 await expectPrepared(f,next);
 expect((await Stay.findById(next._id)).contractPreparationLease).toBeNull();
});

test('Job 19 does not recreate a closed renewal contract', async()=>{
 const f=await seed(), next=await future(f);
 await reconcileMissingContractGeneration();const c=await expectPrepared(f,next);
 await Contract.updateOne({_id:c._id},{$set:{status:'cancelled'}});
 await reconcileMissingContractGeneration();await reconcileMissingContractGeneration();
 expect(await Contract.countDocuments({stayId:next._id,contractPurpose:'renewal'})).toBe(1);
 expect((await Stay.findById(next._id)).contractPreparation.code).toBe('RENEWAL_PREPARATION_CLOSED');
});
