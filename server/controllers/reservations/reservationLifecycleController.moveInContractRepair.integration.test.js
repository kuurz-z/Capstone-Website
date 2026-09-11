/**
 * Integration test for the moveIn-time draft Contract repair backstop.
 *
 * The primary Contract-creation trigger is settlement
 * (reservationDepositSettlementService.js, when a reservation first becomes
 * "reserved" — see reservationDepositSettlementService.contractCreation.integration.test.js).
 * This file only covers the backstop added to the moveIn transition in
 * updateReservation: if a reservation somehow reaches moveIn without a
 * Contract (e.g. the settlement-time attempt failed and was never retried),
 * moveIn must repair it — and must NOT create a second Contract when one
 * already exists.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

await jest.unstable_mockModule("../../config/email.js", () => ({
  sendInquiryResponseEmail: jest.fn(),
  sendReservationConfirmedEmail: jest.fn(),
  sendVisitApprovedEmail: jest.fn(),
  sendPhysicalVisitStatusEmail: jest.fn(),
  sendDocumentsRejectedEmail: jest.fn(),
  sendBillGeneratedEmail: jest.fn(),
  sendUtilityChargeAvailableEmail: jest.fn(),
  sendPaymentReminderEmail: jest.fn(),
  sendOverdueNoticeEmail: jest.fn(),
  sendPaymentApprovedEmail: jest.fn(),
  sendPaymentRejectedEmail: jest.fn(),
  sendPaymentReceiptEmail: jest.fn(),
  generateEmailVerificationEmail: jest.fn(),
  sendEmailVerificationLinkEmail: jest.fn(),
  generateLoginOtpEmail: jest.fn(),
  sendLoginOtpEmail: jest.fn(),
  normalizeOtpEmailResponse: jest.fn(),
  buildLoginOtpMessage: jest.fn(),
  classifyOtpEmailError: jest.fn(),
  default: {},
}));
await jest.unstable_mockModule("../../utils/socket.js", () => ({
  emitToUser: jest.fn(),
  emitToAdmins: jest.fn(),
  emitRoomUpdate: jest.fn(),
}));
await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
await jest.unstable_mockModule("../../utils/auditLogger.js", () => ({
  default: { log: jest.fn(), logError: jest.fn(), logModification: jest.fn() },
}));
await jest.unstable_mockModule("../../services/occupancy/occupancyManager.js", () => ({
  deriveRoomOccupancyState: jest.fn(),
  updateOccupancyOnReservationChange: jest.fn(),
  recalculateRoomOccupancy: jest.fn(),
  getRoomOccupancyStatus: jest.fn(),
  getBranchOccupancyStats: jest.fn(),
  releaseOrphanedBeds: jest.fn(),
  getDisplayStatusForReservation: jest.fn((status) => status),
  default: {},
}));

const { updateReservation } = await import("./reservationLifecycleController.js");
const { createDraftContract } = await import("../../services/contractService.js");
const { default: Reservation } = await import("../../models/Reservation.js");
const { default: Room } = await import("../../models/Room.js");
const { default: User } = await import("../../models/User.js");
const { default: Contract } = await import("../../models/Contract.js");
const { default: BusinessSettings } = await import("../../models/BusinessSettings.js");
const { default: UtilityPeriod } = await import("../../models/UtilityPeriod.js");
const { default: UtilityReading } = await import("../../models/UtilityReading.js");
const { default: Stay } = await import("../../models/Stay.js");
const { default: BedHistory } = await import("../../models/BedHistory.js");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const requestFor = (reservationId, body, overrides = {}) => ({
  id: "movein-contract-repair-test",
  params: { reservationId },
  body,
  // Production shape: verifyToken resolves the Firebase UID to the Mongo
  // User doc and attaches it as req.authUser — the controller must read
  // req.authUser._id, not a fabricated req.adminId (nothing ever sets that).
  user: { uid: "admin-firebase-uid" },
  authUser: { _id: new mongoose.Types.ObjectId() },
  branchFilter: undefined,
  ...overrides,
});

describe("moveIn transition — draft Contract repair backstop", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "movein_contract_repair" });
    await Contract.syncIndexes();
    await UtilityPeriod.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      User.deleteMany({}),
      Contract.deleteMany({}),
      BusinessSettings.deleteMany({}),
      UtilityPeriod.deleteMany({}),
      UtilityReading.deleteMany({}),
      Stay.deleteMany({}),
      BedHistory.deleteMany({}),
    ]);
    await BusinessSettings.create({
      key: "global", quadrupleDiscountPercent: 10, isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    });
  });

  async function seedReservedReservation(roomType = "quadruple-sharing") {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Move", lastName: "InTenant", role: "applicant",
    });
    const room = await Room.create({
      name: "Room 401", roomNumber: "401", branch: "gil-puyat",
      type: roomType, capacity: roomType === "private" ? 1 : 4, price: 6300,
    });
    // Written directly as already "reserved" — this test starts after the
    // point settlement would already have run, to isolate the moveIn repair
    // pass from settlement's own behavior (covered separately).
    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "reserved",
      leaseDuration: 12,
      reservationFeeAmount: 2000,
      preferredRoomType: roomType,
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      moveInDate: new Date("2026-09-01T00:00:00.000Z"),
      paymentStatus: "paid",
    });
    return { tenant, room, reservation };
  }


  test('private move-in creates a water baseline in the occupancy transaction', async () => {
    const {reservation,tenant,room}=await seedReservedReservation('private');
    const next=jest.fn();
    await updateReservation(requestFor(String(reservation._id),{status:'moveIn',meterReading:100,waterMeterReading:42}),response(),next);
    expect(next).not.toHaveBeenCalled();
    expect((await Reservation.findById(reservation._id)).status).toBe('moveIn');
    expect((await User.findById(tenant._id)).role).toBe('tenant');
    const water=await UtilityReading.findOne({roomId:room._id,utilityType:'water'});
    expect(water).toMatchObject({reading:42,unit:'m3',eventType:'moveIn'});
    expect(await Stay.countDocuments({reservationId:reservation._id,status:'active'})).toBe(1);
  },30000);

  test.each([undefined,'',-1])('private move-in rejects missing/invalid water %s atomically',async waterMeterReading=>{
    const {reservation,tenant,room}=await seedReservedReservation('private');
    const next=jest.fn();
    const res=response();
    await updateReservation(requestFor(String(reservation._id),{status:'moveIn',meterReading:100,waterMeterReading}),res,next);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await Reservation.findById(reservation._id)).status).toBe('reserved');
    expect((await User.findById(tenant._id)).role).toBe('applicant');
    expect(await Stay.countDocuments({reservationId:reservation._id})).toBe(0);
    expect(await BedHistory.countDocuments({reservationId:reservation._id})).toBe(0);
    expect(await UtilityReading.countDocuments({roomId:room._id})).toBe(0);
    expect((await Room.findById(room._id)).currentOccupancy).toBe(0);
  });

  test('water storage failure rolls back electricity, reservation, stay, history and role',async()=>{
    const {reservation,tenant,room}=await seedReservedReservation('private');
    const originalCreate=UtilityReading.create.bind(UtilityReading);
    const spy=jest.spyOn(UtilityReading,'create').mockImplementation((docs,...args)=>{
      if (docs[0]?.utilityType === 'water') throw new Error('injected water storage failure');
      return originalCreate(docs,...args);
    });
    const next=jest.fn();
    const res=response();
    try {
      await updateReservation(requestFor(String(reservation._id),{status:'moveIn',meterReading:100,waterMeterReading:42}),res,next);
    } finally {spy.mockRestore();}
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await Reservation.findById(reservation._id)).status).toBe('reserved');
    expect((await User.findById(tenant._id)).role).toBe('applicant');
    expect(await Stay.countDocuments({reservationId:reservation._id})).toBe(0);
    expect(await BedHistory.countDocuments({reservationId:reservation._id})).toBe(0);
    expect(await UtilityReading.countDocuments({roomId:room._id})).toBe(0);
    expect(await UtilityPeriod.countDocuments({roomId:room._id})).toBe(0);
    expect((await Room.findById(room._id)).currentOccupancy).toBe(0);
  });

  test("moveIn repairs a missing draft Contract when settlement never created one", async () => {
    const { reservation, tenant } = await seedReservedReservation();
    expect(await Contract.countDocuments({ reservationId: reservation._id })).toBe(0);

    const req = requestFor(String(reservation._id), { status: "moveIn", meterReading: 100 });
    const res = response();
    await updateReservation(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const contracts = await Contract.find({ reservationId: reservation._id });
    expect(contracts).toHaveLength(1);
    expect(contracts[0].status).toBe("draft");
    expect(String(contracts[0].tenantId)).toBe(String(tenant._id));
    const period = await UtilityPeriod.findOne({ roomId: reservation.roomId }).lean();
    expect(period).toMatchObject({ status: "open", startReading: 100 });
    const boundaries = await UtilityReading.find({ utilityPeriodId: period._id }).lean();
    expect(boundaries.map((entry) => entry.eventType).sort()).toEqual(["moveIn", "periodStart"]);
    expect(boundaries.every((entry) => entry.reading === 100)).toBe(true);
    const stay = await Stay.findOne({ reservationId: reservation._id, status: "active" }).lean();
    expect(stay).toBeTruthy();
    expect(await BedHistory.countDocuments({
      reservationId: reservation._id,
      stayId: stay._id,
      status: "active",
    })).toBe(1);
    expect(String(contracts[0].stayId)).toBe(String(stay._id));
  }, 20_000); // moveIn now also attempts a real (non-fatal) Firebase claims sync

  test("moveIn does not create a second Contract when settlement already created one", async () => {
    const { reservation, tenant } = await seedReservedReservation();
    const existing = await createDraftContract({ reservationId: reservation._id, actorId: tenant._id });

    const req = requestFor(String(reservation._id), { status: "moveIn", meterReading: 100 });
    const res = response();
    await updateReservation(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const contracts = await Contract.find({ reservationId: reservation._id });
    expect(contracts).toHaveLength(1);
    expect(String(contracts[0]._id)).toBe(String(existing._id));
  }, 20_000);

  test("ordinary move-in initializes a clean closed-only vacant room from the actual reading", async () => {
    const { reservation, room } = await seedReservedReservation();
    const closedAt = new Date("2026-08-31T00:00:00.000Z");
    const closed = await UtilityPeriod.create({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: closedAt,
      startReading: 900,
      endReading: 1000,
      ratePerUnit: 10,
      status: "closed",
      closedAt,
      closedBy: new mongoose.Types.ObjectId(),
    });
    await UtilityReading.create({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      reading: 1000,
      date: closedAt,
      eventType: "periodEnd",
      readingStatus: "locked",
      recordedBy: new mongoose.Types.ObjectId(),
      utilityPeriodId: closed._id,
    });

    const req = requestFor(String(reservation._id), {
      status: "moveIn",
      meterReading: 1020,
      actualMoveInDate: "2026-09-01",
    });
    const res = response();
    await updateReservation(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const opened = await UtilityPeriod.findOne({ roomId: room._id, status: "open" }).lean();
    expect(opened.startReading).toBe(1020);
    expect(opened.overheadSegments).toEqual([
      expect.objectContaining({
        readingFrom: 1000,
        readingTo: 1020,
        kwhConsumed: 20,
        reason: "VACANT_GAP_BEFORE_PERIOD",
      }),
    ]);
    const boundaries = await UtilityReading.find({ utilityPeriodId: opened._id }).lean();
    expect(boundaries.map((entry) => entry.eventType).sort()).toEqual(["moveIn", "periodStart"]);
    expect(boundaries.every((entry) => entry.reading === 1020)).toBe(true);
  }, 20_000);

  test("a failed move-in boundary write rolls back reservation, period, reading, and Stay", async () => {
    const { reservation } = await seedReservedReservation();
    const originalCreate = UtilityReading.create.bind(UtilityReading);
    const readingSpy = jest
      .spyOn(UtilityReading, "create")
      .mockImplementationOnce((...args) => originalCreate(...args))
      .mockRejectedValueOnce(new Error("simulated move-in boundary failure"));

    const req = requestFor(String(reservation._id), { status: "moveIn", meterReading: 100 });
    const res = response();
    await updateReservation(req, res, jest.fn());
    readingSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect((await Reservation.findById(reservation._id).lean()).status).toBe("reserved");
    expect(await UtilityPeriod.countDocuments({ roomId: reservation.roomId })).toBe(0);
    expect(await UtilityReading.countDocuments({ roomId: reservation.roomId })).toBe(0);
    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await BedHistory.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await Contract.countDocuments({ reservationId: reservation._id })).toBe(0);
  }, 20_000);
});
