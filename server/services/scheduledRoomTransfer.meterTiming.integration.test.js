/**
 * ============================================================================
 * SCHEDULED TRANSFER — METER READING TIMING FIX
 * ============================================================================
 * The boundary UtilityReading fallback (source "moveOut" / destination
 * "moveIn") in `transferStayWorkflow` must NEVER adopt a reading dated AFTER
 * the effective transfer date — for immediate OR scheduled transfers. A
 * scheduled transfer executes days/weeks after it was scheduled, so a reading
 * recorded (or back-dated) after the effective date can exist in the DB by the
 * time the executor runs.
 *
 * Proven here (effective date = E):
 *   - exact E-dated reading present  -> the E reading is used
 *   - no E reading, an E-5 reading + an E+20 reading present -> E-5 is used,
 *     E+20 is NEVER selected  (source AND destination)
 *   - only an E+20 reading present -> no fallback snapshot is created
 *     (existing "no prior reading" behavior, nothing fabricated)
 *   - the created boundary readings are dated on the effective date
 *   - scheduling does NOT persist scheduling-day meter readings
 *
 * PDF + contract validation mocked (same shims as the executor suite).
 */
import mongoose from "mongoose";
import express from "express";
import { once } from "node:events";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockValidate = jest.fn(async () => ({
  valid: true, missingFields: [], errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));
const mockGenerate = jest.fn(async ({ contractId, actorId, session = null }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("./contractService.js");
  const contract = await Contract.findById(contractId).session(session);
  contract.preparedDocuments = contract.preparedDocuments || [];
  contract.preparedDocuments.push({
    documentType: "prepared", version: 1, storageProvider: "local",
    storageKey: "t/p_v1.pdf", fileName: "p_v1.pdf", fileHash: `h-${contract._id}-v1`,
    fileSize: 2048, pageCount: 4, templateId: "generic", templateVersion: "1",
    coordinateVersion: "1", generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  contract.generatedFileHash = `h-${contract._id}-v1`;
  contract.generatedVersion = 1;
  contract.publicationStatus = "ready_for_resident";
  contract.tenantVisible = true;
  if (contract.status === "ready_for_generation") {
    await transitionContract(contract, "generated", actorId, "prepared (test)", session);
  } else {
    await contract.save(session ? { session } : undefined);
  }
  return { contract, document: contract.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("../services/contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realContractService = await import("./contractService.js");
await jest.unstable_mockModule("./contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { scheduleRoomTransfer } = await import("./scheduledRoomTransferService.js");
const { transferStayWorkflow } = await import("../utils/tenantActionService.js");
const { completeRoomTransferAction } = await import("../controllers/reservations/tenancyActionsController.js");
const { applyBillPayment } = await import("./billing/paymentLedger.js");
const { generateContractNumber } = await import("./contractService.js");
const { getManilaToday } = await import("../utils/dateUtils.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  TenantCredit, UtilityReading, UtilityPeriod, ScheduledRoomTransfer, Payment,
} = await import("../models/index.js");

jest.setTimeout(300_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);

// Effective date 2 days out; execution clock 1 day past it.
const E = () => getManilaToday().add(2, "day");
const EFFECTIVE_STR = () => E().format("YYYY-MM-DD");
const DUE_NOW = () => E().add(1, "day").toDate();
// A date relative to the effective date, as a Manila start-of-day Date.
const rel = (days) => E().add(days, "day").startOf("day").toDate();

const bedsFor = (type, prefix) =>
  NEEDS_BED.has(type)
    ? Array.from({ length: CAP[type] }, (_, i) => ({ id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available" }))
    : [];

async function seed({ sourceType = "quadruple-sharing", roomNumber = "301", moveInDaysAgo = 40 } = {}) {
  const moveIn = getManilaToday().subtract(moveInDaysAgo, "day").toDate();
  const leaseEnd = getManilaToday().add(320, "day").toDate();
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Meter", lastName: "Timing", role: "tenant", tenantStatus: "active",
  });
  const srcBeds = bedsFor(sourceType, `r${roomNumber}`);
  if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
  const roomA = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
  });
  const srcBedId = NEEDS_BED.has(sourceType) ? `r${roomNumber}-b1` : "";
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    reservationFeeAmount: 2000, preferredRoomType: sourceType,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: RATE[sourceType], monthlyRent: RATE[sourceType],
    selectedBed: { id: srcBedId }, moveInDate: moveIn, securityDepositHeld: RATE[sourceType],
  });
  if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
    roomId: roomA._id, bedId: srcBedId || `room-${roomA._id}`,
    leaseStartDate: moveIn, leaseEndDate: leaseEnd, monthlyRent: RATE[sourceType], status: "active",
  });
  if (NEEDS_BED.has(sourceType)) {
    await BedHistory.create({
      bedId: srcBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: "gil-puyat", moveInDate: moveIn, status: "active",
    });
  }
  const actorId = new mongoose.Types.ObjectId();
  await UtilityPeriod.create({
    utilityType: "electricity",
    roomId: roomA._id,
    branch: roomA.branch,
    startDate: moveIn,
    startReading: 0,
    ratePerUnit: 16,
    status: "open",
  });
  const num = await generateContractNumber("gil-puyat", new Date());
  const original = await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: "gil-puyat",
    propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
    roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
    securityDepositAmount: RATE[sourceType],
    leaseStartDate: moveIn, leaseEndDate: leaseEnd, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    finalDocument: {
      version: 1, storageKey: "orig/final_v1.pdf", fileName: "final_v1.pdf",
      fileHash: "originalfinalhash", fileSize: 4096, mimeType: "application/pdf", pageCount: 8,
      sourceType: "notarized", sourceVersion: 1, sourceUploadedAt: new Date(),
      publishedAt: new Date(), publishedBy: actorId, tenantVisible: true,
    },
    statusHistory: [{ status: "active", changedBy: actorId, reason: "seed notarized lease" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, roomA, reservation, stay, original, actorId };
}
const emptyRoom = async (type, roomNumber) => {
  const room = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
  await UtilityPeriod.create({
    utilityType: "electricity",
    roomId: room._id,
    branch: room.branch,
    startDate: getManilaToday().subtract(100, "day").toDate(),
    startReading: 0,
    ratePerUnit: 16,
    status: "open",
  });
  return room;
};
function payloadFor({ targetRoom, transferDate, extra = {} }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: String(targetRoom._id),
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
    ...extra,
  };
}
async function payFull(billId) {
  if (!billId) return;
  const bill = await Bill.findById(billId);
  if (!bill || bill.remainingAmount <= 0) return;
  return applyBillPayment({ bill, amount: bill.remainingAmount, method: "offline_cash", source: "admin-manual", now: new Date() });
}
const seedReading = (roomId, reading, date, eventType = "regularBilling") =>
  UtilityReading.create({
    utilityType: "electricity", roomId, branch: "gil-puyat", reading, date,
    eventType, tenantId: null, recordedBy: new mongoose.Types.ObjectId(), readingStatus: "recorded",
  });

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_meter_timing" });
  await ScheduledRoomTransfer.syncIndexes();
  await UtilityPeriod.syncIndexes();
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([
    Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
    Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
    Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
    UtilityReading.deleteMany({}), UtilityPeriod.deleteMany({}),
    ScheduledRoomTransfer.deleteMany({}), Payment.deleteMany({}),
  ]);
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
  mockValidate.mockClear();
  mockGenerate.mockClear();
});

// The boundary UtilityReading is written at the ACTUAL cutover timestamp
// (`cutoverAt` = new Date() inside transferStayWorkflow's transaction). The
// fallback (when the admin does not supply a reading) MUST NOT adopt a reading
// dated AFTER `cutoverAt`. These tests drive transferStayWorkflow directly with
// a scheduled effectiveTransferDate in the PAST — the cutover runs "now", so
// "now" is the effective billing boundary (round-4). Readings are dated
// relative to "now".
const now = () => getManilaToday();
const relNow = (days) => now().add(days, "day").startOf("day").toDate();

async function runCutover({ reservation, dest, actorId, source, target }) {
  const destBedId = NEEDS_BED.has(dest.type) ? `r${dest.roomNumber}-b1` : undefined;
  // Scheduled a few days ago; completed now.
  const scheduledPast = now().subtract(5, "day").format("YYYY-MM-DD");
  return transferStayWorkflow({
    reservationId: reservation._id,
    payload: {
      confirm: true, targetRoomId: String(dest._id),
      ...(destBedId ? { targetBedId: destBedId } : {}),
      effectiveTransferDate: scheduledPast,
      ...(source != null ? { sourceRoomMeterReading: source } : {}),
      ...(target != null ? { targetRoomMeterReading: target } : {}),
      sourceWaterReading: 100, targetWaterReading: 100,
      reason: "meter timing test",
    },
    actorId,
  });
}

const sourceMoveOut = (roomId) =>
  UtilityReading.findOne({ roomId, utilityType: "electricity", eventType: "moveOut" }).sort({ createdAt: -1 }).lean();
const destMoveIn = (roomId) =>
  UtilityReading.findOne({ roomId, utilityType: "electricity", eventType: "moveIn" }).sort({ createdAt: -1 }).lean();

describe("admin-supplied readings are used verbatim, dated at the actual cutover", () => {
  test("source closing + destination opening readings entered at completion are persisted at cutoverAt", async () => {
    const { roomA, reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    await seedReading(roomA._id, 90, relNow(-6));
    await seedReading(dest._id, 40, relNow(-6));

    const result = await runCutover({ reservation, dest, actorId, source: 130, target: 55 });

    const waterSource=await UtilityReading.findOne({roomId:roomA._id,utilityType:'water',eventType:'moveOut'});
    const waterDestination=await UtilityReading.findOne({roomId:dest._id,utilityType:'water',eventType:'moveIn'});
    expect(waterSource).toBeNull(); // Quad source remains excluded.
    expect(waterDestination.reading).toBe(100);
    expect(waterDestination.date.getTime()).toBe(result.cutoverAt.getTime());
    const mo = await sourceMoveOut(roomA._id);
    expect(mo.reading).toBe(130);
    expect(new Date(mo.date).getTime()).toBe(result.cutoverAt.getTime());
    const mi = await destMoveIn(dest._id);
    expect(mi.reading).toBe(55);
    expect(new Date(mi.date).getTime()).toBe(result.cutoverAt.getTime());
  });
});

describe("transfer completion requires fresh physical readings", () => {
  test("stored readings never substitute for a missing fresh source reading", async () => {
    const { roomA, reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    await seedReading(roomA._id, 90, relNow(-6));
    await seedReading(roomA._id, 100, relNow(20));

    await expect(runCutover({ reservation, dest, actorId })).rejects.toMatchObject({
      code: "ROOM_TRANSFER_SOURCE_READING_REQUIRED",
    });
    expect(await sourceMoveOut(roomA._id)).toBeNull();
  });

  test("a fresh source reading does not substitute for a missing destination reading", async () => {
    const { roomA, reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");

    await expect(runCutover({ reservation, dest, actorId, source: 130 })).rejects.toMatchObject({
      code: "INVALID_PHYSICAL_METER_READING",
    });
    expect(await sourceMoveOut(roomA._id)).toBeNull();
    expect(await destMoveIn(dest._id)).toBeNull();
  });
});

describe("scheduling does not capture scheduling-day readings", () => {
  test("meter readings sent at scheduling time are NOT persisted on the ScheduledRoomTransfer", async () => {
    await BusinessSettings.updateOne(
      { key: "global" },
      { $set: { officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7] } },
    );
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: String(dest._id),
        effectiveTransferDate: now().add(3, "day").format("YYYY-MM-DD"),
        // Even if a caller passes readings at scheduling, they are dropped.
        sourceRoomMeterReading: 1234, targetRoomMeterReading: 567,
        sourceWaterReading: 333, targetWaterReading: 444,
      },
      actorId,
    });
    const fresh = await ScheduledRoomTransfer.findById(scheduledTransfer._id).lean();
    expect(fresh.sourceWaterReading).toBeUndefined();
    expect(fresh.targetWaterReading).toBeUndefined();
    expect(await UtilityReading.countDocuments({utilityType:"water"})).toBe(0);
    expect(fresh.sourceRoomMeterReading).toBeNull();
    expect(fresh.targetRoomMeterReading).toBeNull();
  });
});

// HTTP -> real controller -> real completion/observation services. Only the
// authenticated principal is supplied by the harness; PDF shims are above.
// Follow-up: exercise stale Reservation.roomId / scheduled sourceRoomId /
// active Stay.roomId combinations. Do not redesign source selection in this
// controller-forwarding fix; all fixtures below have consistent pointers.
describe("scheduled-transfer completion HTTP water regression", () => {
  let httpServer;
  let baseUrl;
  let adminUid;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/reservations/:reservationId/scheduled-transfer/complete", (req, res, next) => {
      req.user = { uid: adminUid };
      req.branchFilter = null;
      req.id = "water-forwarding-test";
      return completeRoomTransferAction(req, res, next);
    });
    httpServer = app.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  });

  afterAll(async () => {
    httpServer.closeAllConnections();
    await new Promise(resolve => httpServer.close(resolve));
  });

  async function setup(sourceType = "private", destinationType = "private") {
    const fixture = await seed({ sourceType });
    const dest = await emptyRoom(destinationType, "205");
    adminUid = `water-admin-${fixture.actorId}`;
    await User.create({
      _id: fixture.actorId, firebaseUid: adminUid,
      email: `${adminUid}@example.test`, username: adminUid,
      firstName: "Water", lastName: "Admin", role: "owner",
    });
    // Seed canonical electricity boundaries so water tests cannot fail on an
    // unrelated missing electricity observation or historical period fixture.
    const { prepareCanonicalTransferUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
    await prepareCanonicalTransferUtilityFixture({
      reservationId: fixture.reservation._id, actorId: fixture.actorId,
      payload: { targetRoomId: dest._id, sourceRoomMeterReading: 0, targetRoomMeterReading: 0 },
    });
    await scheduleRoomTransfer({
      reservationId: fixture.reservation._id, actorId: fixture.actorId,
      payload: payloadFor({ targetRoom: dest, transferDate: now().format("YYYY-MM-DD") }),
    });
    return { ...fixture, dest };
  }

  async function post(fixture, water = {}) {
    const response = await fetch(`${baseUrl}/api/reservations/${fixture.reservation._id}/scheduled-transfer/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceRoomMeterReading: 0, targetRoomMeterReading: 0, ...water }),
    });
    return { status: response.status, body: await response.json() };
  }

  async function finish(fixture, water) {
    let result = await post(fixture, water);
    if (result.status === 202 && result.body.bill?.id) {
      await payFull(result.body.bill.id);
      result = await post(fixture, water);
    }
    expect(result).toMatchObject({ status: 200, body: { outcome: "executed" } });
    return result;
  }

  test.each([
    ["source only", "private", "quadruple-sharing", { sourceWaterReading: 123.45 }, 1],
    ["destination only", "quadruple-sharing", "private", { targetWaterReading: 200 }, 1],
    ["both", "private", "private", { sourceWaterReading: 123.45, targetWaterReading: 200 }, 2],
    ["neither", "quadruple-sharing", "quadruple-sharing", {}, 0],
  ])("%s required policy completes and records only applicable water observations", async (_label, sourceType, destType, water, count) => {
    const fixture = await setup(sourceType, destType);
    await finish(fixture, water);
    const observations = await UtilityReading.find({ utilityType: "water", source: "transfer-completion" }).lean();
    expect(observations).toHaveLength(count);
    if (water.sourceWaterReading != null) expect(observations.find(r => r.eventType === "moveOut").reading).toBe(water.sourceWaterReading);
    if (water.targetWaterReading != null) expect(observations.find(r => r.eventType === "moveIn").reading).toBe(water.targetWaterReading);
  });

  test.each([
    ["source", { targetWaterReading: 200 }, "Source"],
    ["destination", { sourceWaterReading: 123.45 }, "Destination"],
  ])("missing %s returns the correct required-reading error", async (_label, water, label) => {
    const fixture = await setup();
    expect(await post(fixture, water)).toEqual({ status: 400, body: {
      code: "INVALID_PHYSICAL_METER_READING", error: `${label} water reading (m\u00b3) is required.`,
    } });
    expect(await UtilityReading.countDocuments({ utilityType: "water" })).toBe(0);
  });

  test.each([0, "123.45"])("source %p reaches existing normalization and persists numerically", async value => {
    const fixture = await setup();
    await finish(fixture, { sourceWaterReading: value, targetWaterReading: 200 });
    const reading = await UtilityReading.findOne({ roomId: fixture.roomA._id, utilityType: "water", eventType: "moveOut" });
    expect(reading.reading).toBe(Number(value));
  });

  test("a real water chronology conflict preserves its specific error and rolls back observations", async () => {
    const fixture = await setup();
    await UtilityReading.create({
      roomId: fixture.roomA._id, branch: "gil-puyat", utilityType: "water",
      reading: 150, date: relNow(-1), eventType: "regularBilling", recordedBy: fixture.actorId,
    });
    const water = { sourceWaterReading: 123.45, targetWaterReading: 200 };
    let result = await post(fixture, water);
    if (result.status === 202 && result.body.bill?.id) {
      await payFull(result.body.bill.id);
      result = await post(fixture, water);
    }
    // Preserve the existing paid-settlement response contract: operational
    // failures retain their cause inside actionRequiredReason, not top-level 422.
    expect(result).toMatchObject({ status: 202, body: {
      outcome: "action_required", reason: "PAID_TRANSFER_CANNOT_COMPLETE",
      scheduledRoomTransfer: { actionRequiredReason: "PAID_TRANSFER_CANNOT_COMPLETE: WATER_READING_CONFLICT" },
    } });
    expect(result.body.message).toContain("Water reading must remain between the previous and following valid observations.");
    expect(JSON.stringify(result.body)).not.toContain("water reading (m\u00b3) is required");
    expect(await UtilityReading.countDocuments({ utilityType: "water", source: "transfer-completion" })).toBe(0);
    expect(String((await Reservation.findById(fixture.reservation._id)).roomId)).toBe(String(fixture.roomA._id));
  });
});
