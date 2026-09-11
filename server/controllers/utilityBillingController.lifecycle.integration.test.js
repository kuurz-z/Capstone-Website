import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { BedHistory, Bill, Reservation, Room, User, UtilityPeriod, UtilityReading } from "../models/index.js";
import {
  closeUtilityPeriod,
  generateHistoricalUtilityPeriod,
  recordUtilityReading,
} from "./utilityBillingController.js";
import {
  createOpenUtilityPeriodWithBoundary,
  UTILITY_PERIOD_START_MODE,
} from "../services/billing/utilityPeriodLifecycleService.js";

jest.setTimeout(180_000);

describe("utility billing lifecycle controller commands", () => {
  let mongo;
  let admin;
  let room;
  let tenant;
  let reservation;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "utility_lifecycle_controller" });
    await UtilityPeriod.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      BedHistory.deleteMany({}), Bill.deleteMany({}), Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      UtilityPeriod.deleteMany({}), UtilityReading.deleteMany({}),
    ]);
    admin = await User.create({
      firebaseUid: `admin-${new mongoose.Types.ObjectId()}`,
      email: `admin-${new mongoose.Types.ObjectId()}@ex.test`, username: `admin_${new mongoose.Types.ObjectId()}`,
      firstName: "Admin", lastName: "Tester", role: "branch_admin", branch: "gil-puyat",
    });
    tenant = await User.create({
      firebaseUid: `tenant-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@ex.test`, username: `tenant_${new mongoose.Types.ObjectId()}`,
      firstName: "Tenant", lastName: "Tester", role: "tenant", tenantStatus: "active",
    });
    room = await Room.create({
      name: "GP - Lifecycle Test", roomNumber: "LT-1", branch: "gil-puyat",
      type: "private", capacity: 1, currentOccupancy: 1, price: 10000,
    });
    reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: "private", agreedToPrivacy: true,
      agreedToCertification: true, totalPrice: 10000, monthlyRent: 10000,
      selectedBed: { id: "" }, moveInDate: new Date("2026-08-01T00:00:00.000+08:00"),
    });
  });

  async function invokeHistorical(overrides = {}) {
    let statusCode = 200;
    let payload;
    let forwardedError;
    const req = {
      params: { utilityType: "electricity" },
      body: {
        roomId: String(room._id), startDate: "2026-08-01", startReading: 100,
        endDate: "2026-09-01", endReading: 120, ratePerUnit: 10,
        ...overrides,
      },
      user: { uid: admin.firebaseUid },
    };
    const res = {
      status(code) { statusCode = code; return res; },
      json(value) { payload = value; return res; },
    };
    await generateHistoricalUtilityPeriod(req, res, (error) => { forwardedError = error; });
    return { statusCode, payload, error: forwardedError };
  }

  async function invokeClose(periodId, body) {
    let payload;
    let forwardedError;
    const req = {
      params: { utilityType: "electricity", id: String(periodId) },
      body,
      user: { uid: admin.firebaseUid },
    };
    const res = { json(value) { payload = value; return res; } };
    await closeUtilityPeriod(req, res, (error) => { forwardedError = error; });
    return { payload, error: forwardedError };
  }

  async function invokeReading(body) {
    let statusCode = 200;
    let payload;
    let forwardedError;
    const req = {
      params: { utilityType: "electricity" },
      body,
      user: { uid: admin.firebaseUid },
    };
    const res = {
      status(code) { statusCode = code; return res; },
      json(value) { payload = value; return res; },
    };
    await recordUtilityReading(req, res, (error) => { forwardedError = error; });
    return { statusCode, payload, error: forwardedError };
  }

  test("historical generation is one atomic closed-cycle command and creates its expected draft", async () => {
    await UtilityReading.create({utilityType:'electricity',roomId:room._id,branch:room.branch,date:new Date('2026-08-01T00:00:00+08:00'),reading:100,eventType:'regularBilling',recordedBy:admin._id});
    const response = await invokeHistorical();
    expect(response.error).toBeUndefined();
    expect(response.statusCode).toBe(201);
    const period = await UtilityPeriod.findOne({ roomId: room._id }).lean();
    expect(period).toMatchObject({ status: "closed", startReading: 100, endReading: 120 });
    expect(period.endDate).toBeTruthy();
    expect(period.closedAt).toBeTruthy();
    expect(await UtilityReading.countDocuments({ utilityPeriodId: period._id, eventType: "periodStart" })).toBe(1);
    expect(await UtilityReading.countDocuments({ utilityPeriodId: period._id, eventType: "periodEnd" })).toBe(1);
    const bill = await Bill.findOne({ reservationId: reservation._id }).lean();
    expect(bill.status).toBe("draft");
    expect(bill.charges.electricity).toBeCloseTo(200, 2);
  });

  test("historical generation cannot delete or replace an unrelated active period", async () => {
    const active = await UtilityPeriod.create({
      utilityType: "electricity", roomId: room._id, branch: room.branch,
      startDate: new Date("2026-09-01T00:00:00.000+08:00"), startReading: 120,
      ratePerUnit: 10, status: "open",
    });
    const response = await invokeHistorical();
    expect(response.error).toMatchObject({ statusCode: 409, code: "UTILITY_PERIOD_ALREADY_ACTIVE" });
    expect(await UtilityPeriod.countDocuments()).toBe(1);
    expect((await UtilityPeriod.findById(active._id).lean()).status).toBe("open");
    expect(await Bill.countDocuments()).toBe(0);
  });

  test("a historical close failure rolls back the period and both boundaries", async () => {
    const baseline = await UtilityReading.create({utilityType:'electricity',roomId:room._id,branch:room.branch,date:new Date('2026-08-01T00:00:00+08:00'),reading:100,eventType:'regularBilling',recordedBy:admin._id});
    reservation.moveInDate = new Date("2026-08-10T00:00:00.000+08:00");
    await reservation.save();
    const response = await invokeHistorical();
    expect(response.error?.message).toMatch(/move-in.*reading|reading.*move-in/i);
    expect(await UtilityPeriod.countDocuments()).toBe(0);
    expect(await UtilityReading.countDocuments()).toBe(1);
    expect(await UtilityReading.findById(baseline._id).lean()).toEqual(baseline.toObject());
    expect(await Bill.countDocuments()).toBe(0);
  });

  test("closing an exact-observation period excludes earlier same-day readings", async () => {
    const observedAt = new Date("2026-09-01T12:00:00.000+08:00");
    await UtilityReading.create({
      utilityType: "electricity", roomId: room._id, branch: room.branch,
      // Earlier same-meter usage must stay outside the recovered interval;
      // keep the fixture chronological now that opening writes validate it.
      reading: 90, date: new Date("2026-09-01T08:00:00.000+08:00"),
      eventType: "regularBilling", readingStatus: "locked", recordedBy: admin._id,
      utilityPeriodId: null,
    });
    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity", room, startDate: observedAt,
      startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
      startReading: 100, ratePerUnit: 10, actorId: admin._id,
    });

    const response = await invokeClose(period._id, {
      endDate: "2026-09-02",
      endReading: 110,
    });

    expect(response.error).toBeUndefined();
    const closed = await UtilityPeriod.findById(period._id).lean();
    expect(closed.status).toBe("closed");
    expect(closed.startDate).toEqual(observedAt);
    expect(closed.computedTotalUsage).toBe(10);
    expect(closed.computedTotalCost).toBe(100);
    const next = await UtilityPeriod.findOne({
      roomId: room._id,
      status: "open",
    }).lean();
    expect(next).toBeTruthy();
    expect(next.startDate).toEqual(closed.endDate);
    expect(next.startReading).toBe(closed.endReading);
    expect(response.payload.result.nextPeriodId).toBeTruthy();

    const retry = await invokeClose(period._id, {
      endDate: "2026-09-02",
      endReading: 110,
    });
    expect(retry.error).toBeUndefined();
    expect(retry.payload.result.idempotent).toBe(true);
    expect(await UtilityPeriod.countDocuments({ roomId: room._id })).toBe(2);
    expect(await UtilityReading.countDocuments({
      roomId: room._id,
      eventType: "periodEnd",
    })).toBe(1);
  });

  test("closing a vacant room stops at CLOSED and retry remains idempotent", async () => {
    await reservation.deleteOne();
    room.currentOccupancy = 0;
    await room.save();
    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: new Date("2026-09-01T00:00:00.000+08:00"),
      startReading: 100,
      ratePerUnit: 10,
      actorId: admin._id,
    });
    period.overheadSegments = [{
      segmentIndex: -1,
      periodLabel: "Vacant gap before current period",
      startDate: new Date("2026-08-31T00:00:00.000+08:00"),
      endDate: period.startDate,
      readingFrom: 90,
      readingTo: 100,
      kwhConsumed: 10,
      cost: 100,
      reason: "VACANT_GAP_BEFORE_PERIOD",
    }];
    await period.save();

    const response = await invokeClose(period._id, {
      endDate: "2026-09-02",
      endReading: 110,
    });

    expect(response.error).toBeUndefined();
    expect(response.payload.result).toMatchObject({
      nextPeriodId: null,
      occupancyContinued: false,
      continuingOccupantCount: 0,
    });
    const closed = await UtilityPeriod.findById(period._id).lean();
    expect(closed.status).toBe("closed");
    expect(closed.overheadSegments).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "VACANT_GAP_BEFORE_PERIOD", kwhConsumed: 10 }),
      expect.objectContaining({ reason: "ZERO_OCCUPANCY_WITH_CONSUMPTION", kwhConsumed: 10 }),
    ]));
    expect(await UtilityPeriod.countDocuments({ roomId: room._id, status: "open" })).toBe(0);

    const retry = await invokeClose(period._id, {
      endDate: "2026-09-02",
      endReading: 110,
    });
    expect(retry.error).toBeUndefined();
    expect(retry.payload.result).toMatchObject({ idempotent: true, nextPeriodId: null });
    expect(await UtilityReading.countDocuments({ roomId: room._id, eventType: "periodEnd" })).toBe(1);
  });

  test("next-period creation failure rolls back the close and draft changes", async () => {
    const start = new Date("2026-09-01T00:00:00.000+08:00");
    const end = new Date("2026-09-02T00:00:00.000+08:00");
    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: start,
      startReading: 100,
      ratePerUnit: 10,
      actorId: admin._id,
    });
    await UtilityPeriod.create({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      startDate: end,
      endDate: new Date("2026-09-03T00:00:00.000+08:00"),
      startReading: 110,
      endReading: 120,
      ratePerUnit: 10,
      status: "closed",
    });

    const response = await invokeClose(period._id, {
      endDate: "2026-09-02",
      endReading: 110,
    });

    expect(response.error).toBeTruthy();
    expect((await UtilityPeriod.findById(period._id).lean()).status).toBe("open");
    expect(await UtilityReading.countDocuments({
      utilityPeriodId: period._id,
      eventType: "periodEnd",
    })).toBe(0);
    expect(await Bill.countDocuments()).toBe(0);
  });

  test("generic reading creation cannot bypass manual-review lifecycle authority", async () => {
    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      startReading: 100,
      ratePerUnit: 10,
      actorId: admin._id,
    });
    period.status = "manual_review_required";
    period.manualReviewReason = "test conflict";
    await period.save();

    const response = await invokeReading({
      roomId: String(room._id),
      reading: 110,
      date: "2026-09-02",
      eventType: "moveIn",
      tenantId: String(tenant._id),
    });

    expect(response.error).toMatchObject({
      code: "ROOM_UTILITY_BOUNDARY_MANUAL_REVIEW_REQUIRED",
    });
    expect(await UtilityReading.countDocuments({
      roomId: room._id,
      eventType: "moveIn",
    })).toBe(0);
  });
});
