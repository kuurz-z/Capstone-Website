import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { rawSnapshot, seedProtectedControls, guardMutations, controls } from "./utilityRepairTestSupport.mjs";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  AuditLog,
  Bill,
  Contract,
  Payment,
  Reservation,
  Room,
  ScheduledRoomTransfer,
  Stay,
  UtilityFinalization,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import {
  CONFIRM_TOKEN,
  EXPECTED_READING_UPDATED_AT,
  REPAIR_KEY,
  REPLACEMENT_IDS,
  TARGET,
  parseRepairArgs,
  runTargetedUtilityRepair,
} from "./repair_gp705_gp1008_utility_lifecycle.mjs";

const O = (value) => new mongoose.Types.ObjectId(String(value));
const sourceUpdatedAt = new Date("2026-09-01T09:08:48.910Z");
const destinationUpdatedAt = new Date("2026-09-01T09:16:32.147Z");
const billUpdatedAt = new Date("2026-09-01T09:08:48.744Z");
const actorId = O("69bb9249dcab8f0bf467a0f4");
const stayId = O("6a95508c68eac06cd7c1f0d2");
const currentContractId = O("6a8d84a36ebb68e87323c2b4");
const addendumId = O("6a9692db3c50c1349705d84f");
const initialBillId = O("6a8d84b36ebb68e87323c30b");
const initialPaymentId = O("6a9168c00000000000000001");

const models = Object.freeze({
  AuditLog,
  Bill,
  Contract,
  Payment,
  Reservation,
  Room,
  ScheduledRoomTransfer,
  Stay,
  UtilityFinalization,
  UtilityPeriod,
  UtilityReading,
});

function cliArgs(overrides = {}) {
  const values = {
    "schedule-id": TARGET.scheduleId,
    "source-period-id": TARGET.sourcePeriodId,
    "destination-period-id": TARGET.destinationPeriodId,
    "source-opening": "1010.5",
    "destination-opening": "990.25",
    "source-evidence": "timestamped-meter-photo-gp705-2026-09-01",
    "destination-evidence": "maintenance-reading-log-gp1008-2026-09-01",
    "expected-source-updated-at": sourceUpdatedAt.toISOString(),
    "expected-destination-updated-at": destinationUpdatedAt.toISOString(),
    "expected-bill-updated-at": billUpdatedAt.toISOString(),
    "actor-id": String(actorId),
    ...overrides,
  };
  const argv = [];
  for (const [name, value] of Object.entries(values)) {
    if (name === "write" || value === undefined) continue;
    argv.push(`--${name}`, String(value));
  }
  if (overrides.write) {
    argv.push("--write", "--confirm-token", CONFIRM_TOKEN);
  }
  return argv;
}

const parsedArgs = (overrides = {}) => parseRepairArgs(cliArgs(overrides));

async function clearCollections() {
  await Promise.all(Object.values(models).map((Model) => Model.deleteMany({})));
}

async function seedTargetState() {
  await Room.collection.insertMany([
    {
      _id: O(TARGET.sourceRoomId), name: "GP - Room 705", roomNumber: "GP-705",
      branch: "gil-puyat", type: "private", capacity: 1, currentOccupancy: 1,
      available: false, price: 14400,
      beds: [
        { id: "bed-1", position: "upper", status: "occupied", occupiedBy: { userId: O(TARGET.tenantId), reservationId: O(TARGET.reservationId), occupiedSince: new Date("2026-08-25T12:15:11.942Z") } },
        { id: "bed-2", position: "lower", status: "available", occupiedBy: { userId: null, reservationId: null, occupiedSince: null } },
      ],
      createdAt: new Date("2026-04-11T06:27:05.833Z"), updatedAt: new Date("2026-08-25T12:15:11.943Z"),
    },
    {
      _id: O(TARGET.destinationRoomId), name: "GP - Room 1008", roomNumber: "GP-1008",
      branch: "gil-puyat", type: "private", capacity: 1, currentOccupancy: 1,
      available: false, price: 14400,
      beds: [
        { id: "bed-1", position: "upper", status: "available", occupiedBy: { userId: null, reservationId: null, occupiedSince: null } },
        { id: "bed-2", position: "lower", status: "available", occupiedBy: { userId: null, reservationId: null, occupiedSince: null } },
      ],
      createdAt: new Date("2026-04-11T06:27:12.000Z"), updatedAt: new Date("2026-09-01T08:54:55.980Z"),
    },
  ]);
  await Reservation.collection.insertOne({
    _id: O(TARGET.reservationId), userId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId),
    status: "moveIn", isArchived: false, currentStayId: stayId, latestStayStatus: "active",
    selectedBed: { id: "bed-1", position: "upper" }, monthlyRent: 14400,
    createdAt: new Date("2026-08-25T11:44:53.430Z"), updatedAt: new Date("2026-09-01T10:41:47.193Z"),
  });
  await Stay.collection.insertOne({
    _id: stayId, tenantId: O(TARGET.tenantId), reservationId: O(TARGET.reservationId),
    branch: "gil-puyat", roomId: O(TARGET.sourceRoomId), bedId: "bed-1",
    leaseStartDate: new Date("2026-08-24T16:00:00.000Z"), leaseEndDate: new Date("2027-02-28T00:00:00.000Z"),
    monthlyRent: 14400, status: "active", createdAt: new Date("2026-08-25T12:15:00.000Z"), updatedAt: new Date("2026-08-31T09:59:40.231Z"),
  });
  await Contract.collection.insertMany([
    {
      _id: currentContractId, contractNumber: "TEST-GP705-CURRENT", branch: "gil-puyat", contractYear: 2026, contractSequence: 1, reservationId: O(TARGET.reservationId), tenantId: O(TARGET.tenantId),
      roomId: O(TARGET.sourceRoomId), contractPurpose: "initial", status: "published", isCurrent: true,
      approvedMonthlyRate: 14400, createdAt: new Date("2026-08-25T12:03:00.000Z"), updatedAt: new Date("2026-09-01T10:39:23.077Z"),
    },
    {
      _id: addendumId, contractNumber: "TEST-GP1008-ADDENDUM", branch: "gil-puyat", contractYear: 2026, contractSequence: 2, reservationId: O(TARGET.reservationId), tenantId: O(TARGET.tenantId),
      roomId: O(TARGET.destinationRoomId), contractPurpose: "amendment", status: "generated", isCurrent: false,
      approvedMonthlyRate: 14400, amendmentEffectiveDate: new Date(TARGET.periodStart), replacesContractId: currentContractId,
      createdAt: new Date("2026-09-01T08:54:54.000Z"), updatedAt: new Date("2026-09-01T08:54:54.983Z"),
    },
  ]);
  await ScheduledRoomTransfer.collection.insertOne({
    _id: O(TARGET.scheduleId), reservationId: O(TARGET.reservationId), tenantId: O(TARGET.tenantId), branch: "gil-puyat",
    sourceRoomId: O(TARGET.sourceRoomId), sourceBedId: "bed-1",
    destinationRoomId: O(TARGET.destinationRoomId), destinationBedId: null, destinationNeedsBed: false,
    effectiveTransferDate: new Date(TARGET.periodStart), effectiveTransferTimeMinutes: 540,
    addendumContractId: addendumId, status: "scheduled", holdApplied: true,
    executionToken: null, executionStartedAt: null, executedAt: null, settlementBillId: null,
    scheduledBy: actorId, scheduledAt: new Date("2026-09-01T08:54:55.897Z"),
    isArchived: false, createdAt: new Date("2026-09-01T08:54:56.065Z"), updatedAt: new Date("2026-09-01T08:54:56.065Z"),
  });
  await UtilityPeriod.collection.insertMany([
    {
      _id: O(TARGET.sourcePeriodId), utilityType: "electricity", roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      startDate: new Date(TARGET.periodStart), endDate: new Date(TARGET.periodEnd), startReading: 1000, endReading: 1250,
      ratePerUnit: 16, computedTotalUsage: 250, computedTotalCost: 4000, verified: true, status: "closed", isArchived: false,
      closedAt: new Date("2026-09-01T09:08:48.908Z"), closedBy: actorId,
      tenantSummaries: [{ tenantId: O(TARGET.tenantId), reservationId: O(TARGET.reservationId), tenantName: "Aya Guest", totalUsage: 250, billAmount: 4000, billId: O(TARGET.sourceBillId) }],
      overheadSegments: [], createdAt: new Date("2026-09-01T09:08:46.744Z"), updatedAt: sourceUpdatedAt,
    },
    {
      _id: O(TARGET.destinationPeriodId), utilityType: "electricity", roomId: O(TARGET.destinationRoomId), branch: "gil-puyat",
      startDate: new Date(TARGET.periodStart), endDate: new Date(TARGET.periodEnd), startReading: 1000, endReading: 1260,
      ratePerUnit: 16, computedTotalUsage: 260, computedTotalCost: 4160, verified: false, status: "closed", isArchived: false,
      closedAt: new Date("2026-09-01T09:16:32.145Z"), closedBy: actorId, tenantSummaries: [],
      overheadSegments: [{ segmentIndex: 0, kwhConsumed: 260, cost: 4160, reason: "ZERO_OCCUPANCY_WITH_CONSUMPTION" }],
      createdAt: new Date("2026-09-01T09:16:30.689Z"), updatedAt: destinationUpdatedAt,
    },
  ]);
  await UtilityReading.collection.insertMany([
    {
      _id: O(TARGET.sourceStartReadingId), utilityType: "electricity", roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      reading: 1000, date: new Date(TARGET.periodStart), eventType: "periodStart", readingStatus: "locked", recordedBy: actorId,
      utilityPeriodId: O(TARGET.sourcePeriodId), isArchived: false,
      createdAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceStartReadingId]), updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceStartReadingId]),
    },
    {
      _id: O(TARGET.sourceEndReadingId), utilityType: "electricity", roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      reading: 1250, date: new Date(TARGET.periodEnd), eventType: "periodEnd", readingStatus: "locked", recordedBy: actorId,
      utilityPeriodId: O(TARGET.sourcePeriodId), isArchived: false,
      createdAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceEndReadingId]), updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceEndReadingId]),
    },
    {
      _id: O(TARGET.destinationStartReadingId), utilityType: "electricity", roomId: O(TARGET.destinationRoomId), branch: "gil-puyat",
      reading: 1000, date: new Date(TARGET.periodStart), eventType: "periodStart", readingStatus: "locked", recordedBy: actorId,
      utilityPeriodId: O(TARGET.destinationPeriodId), isArchived: false,
      createdAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationStartReadingId]), updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationStartReadingId]),
    },
    {
      _id: O(TARGET.destinationEndReadingId), utilityType: "electricity", roomId: O(TARGET.destinationRoomId), branch: "gil-puyat",
      reading: 1260, date: new Date(TARGET.periodEnd), eventType: "periodEnd", readingStatus: "locked", recordedBy: actorId,
      utilityPeriodId: O(TARGET.destinationPeriodId), isArchived: false,
      createdAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationEndReadingId]), updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationEndReadingId]),
    },
  ]);
  await Bill.collection.insertMany([
    {
      _id: O(TARGET.sourceBillId), reservationId: O(TARGET.reservationId), userId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      billType: "monthly", status: "draft", paymentState: "paid", publicationState: "draft", paidAmount: 0,
      grossAmount: 0, totalAmount: 0, remainingAmount: 0, sentAt: null, issuedAt: null, releasedAt: null, dueDate: null, isArchived: false,
      charges: { rent: 0, electricity: 4000, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0, securityDeposit: 0 },
      utilityDispatch: { electricity: { state: "draft", periodId: O(TARGET.sourcePeriodId), publishedAt: null, issuedAt: null, dueDate: null, amount: 4000 } },
      createdAt: billUpdatedAt, updatedAt: billUpdatedAt,
    },
    {
      _id: initialBillId, reservationId: O(TARGET.reservationId), userId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      billType: "initial_payment", status: "paid", paidAmount: 25000, totalAmount: 25000, isArchived: false,
      createdAt: new Date("2026-08-25T12:04:03.478Z"), updatedAt: new Date("2026-08-28T10:54:00.725Z"),
    },
  ]);
  await Payment.collection.insertOne({
    _id: initialPaymentId, reservationId: O(TARGET.reservationId), userId: O(TARGET.tenantId), billId: initialBillId,
    amount: 25000, status: "paid", createdAt: new Date("2026-08-25T12:05:00.000Z"), updatedAt: new Date("2026-08-25T12:05:00.000Z"),
  });
}

async function collectionSnapshot() {
  return rawSnapshot(models);
}

describe("targeted GP-705 / GP-1008 utility repair", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "gp705_gp1008_repair_test" });
    // The AuditLog model's production TTL partial index is not supported by
    // mongodb-memory-server. The repair's deterministic _id still exercises
    // idempotency here; only the UtilityPeriod active-cycle index is required.
    await UtilityPeriod.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await clearCollections();
    await seedTargetState();
    await seedProtectedControls(models);
  });

  test("1. dry-run performs zero writes", async () => {
    const before = await collectionSnapshot();
    const result = await runTargetedUtilityRepair({ args: parsedArgs(), models });
    expect(result).toMatchObject({ mode: "dry-run", status: "READY", repairKey: REPAIR_KEY });
    expect(await collectionSnapshot()).toBe(before);
  });

  test("2. missing meter evidence aborts", () => {
    expect(() => parseRepairArgs(cliArgs({ "source-evidence": undefined }))).toThrow("--source-evidence");
  });

  test("3. negative source opening aborts", () => {
    expect(() => parseRepairArgs(cliArgs({ "source-opening": -1 }))).toThrow("cannot be negative");
  });

  test("4. negative destination opening aborts", () => {
    expect(() => parseRepairArgs(cliArgs({ "destination-opening": -1 }))).toThrow("cannot be negative");
  });

  test("5. changed source period aborts", async () => {
    await UtilityPeriod.collection.updateOne({ _id: O(TARGET.sourcePeriodId) }, { $set: { updatedAt: new Date("2026-09-01T12:00:00Z") } });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "CHANGED_SINCE_AUDIT" });
  });

  test("6. changed destination period aborts", async () => {
    await UtilityPeriod.collection.updateOne({ _id: O(TARGET.destinationPeriodId) }, { $set: { endReading: 1261 } });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "PERIOD_STATE_CHANGED" });
  });

  test("7. changed Bill aborts", async () => {
    await Bill.collection.updateOne({ _id: O(TARGET.sourceBillId) }, { $set: { "charges.electricity": 3999 } });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "BILL_STATE_CHANGED" });
  });

  test("8. schedule no longer scheduled aborts", async () => {
    await ScheduledRoomTransfer.collection.updateOne({ _id: O(TARGET.scheduleId) }, { $set: { status: "action_required" } });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "SCHEDULE_STATE_CHANGED" });
  });

  test("9. hold missing aborts", async () => {
    await ScheduledRoomTransfer.collection.updateOne({ _id: O(TARGET.scheduleId) }, { $set: { holdApplied: false } });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "SCHEDULE_HOLD_MISSING" });
  });

  test("10. real GP-1008 occupant aborts", async () => {
    await Stay.collection.insertOne({
      _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), reservationId: new mongoose.Types.ObjectId(),
      branch: "gil-puyat", roomId: O(TARGET.destinationRoomId), bedId: "bed-1",
      leaseStartDate: new Date(), leaseEndDate: new Date("2027-01-01"), status: "active",
    });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "DESTINATION_REAL_OCCUPANT" });
  });

  test("11. existing open GP-705 period aborts", async () => {
    await UtilityPeriod.collection.insertOne({
      _id: new mongoose.Types.ObjectId(), utilityType: "electricity", roomId: O(TARGET.sourceRoomId), branch: "gil-puyat",
      startDate: new Date("2026-09-02T00:00:00.000Z"), startReading: 1, ratePerUnit: 16, status: "open", isArchived: false,
    });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "ACTIVE_PERIOD_EXISTS" });
  });

  test("12. existing open GP-1008 period aborts", async () => {
    await UtilityPeriod.collection.insertOne({
      _id: new mongoose.Types.ObjectId(), utilityType: "electricity", roomId: O(TARGET.destinationRoomId), branch: "gil-puyat",
      startDate: new Date("2026-09-02T00:00:00.000Z"), startReading: 1, ratePerUnit: 16, status: "open", isArchived: false,
    });
    await expect(runTargetedUtilityRepair({ args: parsedArgs(), models })).rejects.toMatchObject({ code: "ACTIVE_PERIOD_EXISTS" });
  });

  test("13. write archives rather than deletes", async () => {
    const result = await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    expect(result.status).toBe("APPLIED");
    expect(await UtilityPeriod.findById(TARGET.sourcePeriodId).lean()).toMatchObject({ status: "closed", isArchived: true });
    expect(await UtilityPeriod.findById(TARGET.destinationPeriodId).lean()).toMatchObject({ status: "closed", isArchived: true });
    expect(await UtilityReading.countDocuments({ _id: { $in: [O(TARGET.sourceStartReadingId), O(TARGET.sourceEndReadingId), O(TARGET.destinationStartReadingId), O(TARGET.destinationEndReadingId)] }, isArchived: true })).toBe(4);
    expect(await Bill.findById(TARGET.sourceBillId).lean()).toMatchObject({ status: "draft", isArchived: true });
  });

  test("14. old amounts and history are preserved", async () => {
    const beforeSource = await UtilityPeriod.findById(TARGET.sourcePeriodId).lean();
    const beforeDestination = await UtilityPeriod.findById(TARGET.destinationPeriodId).lean();
    const beforeBill = await Bill.findById(TARGET.sourceBillId).lean();
    const beforeReadings = await UtilityReading.find({
      _id: { $in: [
        O(TARGET.sourceStartReadingId), O(TARGET.sourceEndReadingId),
        O(TARGET.destinationStartReadingId), O(TARGET.destinationEndReadingId),
      ] },
    }).sort({ _id: 1 }).lean();
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    const afterSource = await UtilityPeriod.findById(TARGET.sourcePeriodId).lean();
    const afterDestination = await UtilityPeriod.findById(TARGET.destinationPeriodId).lean();
    const afterBill = await Bill.findById(TARGET.sourceBillId).lean();
    expect(afterSource.tenantSummaries).toEqual(beforeSource.tenantSummaries);
    expect(afterSource.computedTotalCost).toBe(beforeSource.computedTotalCost);
    expect(afterDestination.overheadSegments).toEqual(beforeDestination.overheadSegments);
    expect(afterDestination.computedTotalCost).toBe(beforeDestination.computedTotalCost);
    expect(afterBill.charges).toEqual(beforeBill.charges);
    expect(afterBill.utilityDispatch).toEqual(beforeBill.utilityDispatch);
    expect(afterBill.status).toBe(beforeBill.status);
    expect(afterBill.paidAmount).toBe(beforeBill.paidAmount);
    expect(afterSource.createdAt).toEqual(beforeSource.createdAt);
    expect(afterSource.updatedAt).toEqual(beforeSource.updatedAt);
    expect(afterDestination.createdAt).toEqual(beforeDestination.createdAt);
    expect(afterDestination.updatedAt).toEqual(beforeDestination.updatedAt);
    expect(afterBill.createdAt).toEqual(beforeBill.createdAt);
    expect(afterBill.updatedAt).toEqual(beforeBill.updatedAt);
    const afterReadings = await UtilityReading.find({
      _id: { $in: beforeReadings.map((reading) => reading._id) },
    }).sort({ _id: 1 }).lean();
    expect(afterReadings.map(({ reading, date, createdAt, updatedAt }) => ({ reading, date, createdAt, updatedAt })))
      .toEqual(beforeReadings.map(({ reading, date, createdAt, updatedAt }) => ({ reading, date, createdAt, updatedAt })));
  });

  test("15. replacement source period stays open", async () => {
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    expect(await UtilityPeriod.findById(REPLACEMENT_IDS.sourcePeriodId).lean()).toMatchObject({
      roomId: O(TARGET.sourceRoomId), status: "open", isArchived: false, startReading: 1010.5, endDate: null, endReading: null,
    });
  });

  test("16. replacement destination period stays open", async () => {
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    expect(await UtilityPeriod.findById(REPLACEMENT_IDS.destinationPeriodId).lean()).toMatchObject({
      roomId: O(TARGET.destinationRoomId), status: "open", isArchived: false, startReading: 990.25, endDate: null, endReading: null,
    });
  });

  test("17. locked start readings use supplied evidence values", async () => {
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    expect(await UtilityReading.findById(REPLACEMENT_IDS.sourceStartReadingId).lean()).toMatchObject({ eventType: "periodStart", readingStatus: "locked", reading: 1010.5 });
    expect(await UtilityReading.findById(REPLACEMENT_IDS.destinationStartReadingId).lean()).toMatchObject({ eventType: "periodStart", readingStatus: "locked", reading: 990.25 });
    const audit = await AuditLog.findOne({ "metadata.repairKey": REPAIR_KEY }).lean();
    expect(audit.metadata).toMatchObject({
      sourceOpening: 1010.5,
      destinationOpening: 990.25,
      sourceEvidence: "timestamped-meter-photo-gp705-2026-09-01",
      destinationEvidence: "maintenance-reading-log-gp1008-2026-09-01",
    });
  });

  test("18. transaction rollback restores everything on failure", async () => {
    const before = await collectionSnapshot();
    await expect(runTargetedUtilityRepair({
      args: parsedArgs({ write: true }),
      models,
      hooks: { afterMutations: async () => { throw new Error("forced rollback"); } },
    })).rejects.toThrow("forced rollback");
    expect(await collectionSnapshot()).toBe(before);
    expect(await AuditLog.countDocuments({ "metadata.repairKey": REPAIR_KEY })).toBe(0);
  });

  test("19. repeat write is idempotent and reports ALREADY_APPLIED", async () => {
    const args = parsedArgs({ write: true });
    expect((await runTargetedUtilityRepair({ args, models })).status).toBe("APPLIED");
    const counts = {
      periods: await UtilityPeriod.countDocuments(),
      readings: await UtilityReading.countDocuments(),
      audits: await AuditLog.countDocuments({ "metadata.repairKey": REPAIR_KEY }),
    };
    expect((await runTargetedUtilityRepair({ args, models })).status).toBe("ALREADY_APPLIED");
    expect(await UtilityPeriod.countDocuments()).toBe(counts.periods);
    expect(await UtilityReading.countDocuments()).toBe(counts.readings);
    expect(await AuditLog.countDocuments({ "metadata.repairKey": REPAIR_KEY })).toBe(counts.audits);
  });

  test("20. schedule, occupancy, contracts, and payments remain untouched", async () => {
    const before = {
      schedule: await ScheduledRoomTransfer.findById(TARGET.scheduleId).select("+executionToken").lean(),
      rooms: await Room.find({ _id: { $in: [O(TARGET.sourceRoomId), O(TARGET.destinationRoomId)] } }).sort({ _id: 1 }).lean(),
      reservation: await Reservation.findById(TARGET.reservationId).lean(),
      stays: await Stay.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
      contracts: await Contract.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
      payments: await Payment.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
    };
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    expect(await ScheduledRoomTransfer.findById(TARGET.scheduleId).select("+executionToken").lean()).toEqual(before.schedule);
    expect(await Room.find({ _id: { $in: [O(TARGET.sourceRoomId), O(TARGET.destinationRoomId)] } }).sort({ _id: 1 }).lean()).toEqual(before.rooms.map(room => ({ ...room, electricityObservationRevision: (room.electricityObservationRevision ?? 0) + 1 })));
    expect(await Reservation.findById(TARGET.reservationId).lean()).toEqual(before.reservation);
    expect(await Stay.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean()).toEqual(before.stays);
    expect(await Contract.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean()).toEqual(before.contracts);
    expect(await Payment.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean()).toEqual(before.payments);
  });

  test.each([undefined, 7])("exact revision increment from %s preserves all other Room fields and paid history", async revision => {
    if (revision !== undefined) await Room.collection.updateMany({ _id: { $in: [O(TARGET.sourceRoomId), O(TARGET.destinationRoomId)] } }, { $set: { electricityObservationRevision: revision } });
    const before = JSON.parse(await collectionSnapshot());
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    const after = JSON.parse(await collectionSnapshot());
    expect(after.Room).toEqual(before.Room.map(room => [TARGET.sourceRoomId, TARGET.destinationRoomId].includes(room._id) ? { ...room, electricityObservationRevision: (revision ?? 0) + 1 } : room));
    expect(after.Payment).toEqual(before.Payment);
    expect(after.Bill.filter(bill => bill.status === "paid")).toEqual(before.Bill.filter(bill => bill.status === "paid"));
    expect(after.UtilityPeriod.find(period => period._id === String(controls.period))).toEqual(before.UtilityPeriod.find(period => period._id === String(controls.period)));
    expect(after.UtilityReading.find(reading => reading._id === String(controls.reading))).toEqual(before.UtilityReading.find(reading => reading._id === String(controls.reading)));
  });

  test.each(guardMutations(TARGET))("rejects %s and rolls back all raw documents", async (_label, model, filter, update) => {
    const before = await collectionSnapshot();
    await expect(runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models,
      hooks: { afterMutations: async ({ session }) => { await models[model].collection.updateOne(filter, update, { session }); } },
    })).rejects.toMatchObject({ code: "UNTOUCHED_STATE_CHANGED" });
    expect(await collectionSnapshot()).toBe(before);
  });

  test("historical v1 full-state audit hash remains readable without rewriting the audit", async () => {
    // Recreate the historical post-state: the old opener did not write Room.
    const canonical = value => {
      if (value instanceof Date) return value.toISOString();
      if (value?.toHexString) return value.toHexString();
      if (Array.isArray(value)) return value.map(canonical);
      return value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    };
    const protectedBefore = {
      schedule: await ScheduledRoomTransfer.findById(TARGET.scheduleId).select("+executionToken").lean(),
      rooms: [await Room.findById(TARGET.sourceRoomId).lean(), await Room.findById(TARGET.destinationRoomId).lean()],
      reservation: await Reservation.findById(TARGET.reservationId).lean(),
      stays: await Stay.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
      contracts: await Contract.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
      payments: await Payment.find({ reservationId: O(TARGET.reservationId) }).sort({ _id: 1 }).lean(),
    };
    await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models });
    await Room.collection.updateMany({ _id: { $in: [O(TARGET.sourceRoomId), O(TARGET.destinationRoomId)] } }, { $unset: { electricityObservationRevision: "" } });
    await AuditLog.collection.updateOne({ _id: O(REPLACEMENT_IDS.auditLogId) }, { $set: { "metadata.untouchedStateHash": createHash("sha256").update(JSON.stringify(canonical(protectedBefore))).digest("hex") } });
    const before = await collectionSnapshot();
    expect((await runTargetedUtilityRepair({ args: parsedArgs({ write: true }), models })).status).toBe("ALREADY_APPLIED");
    expect(await collectionSnapshot()).toBe(before);
  });
});
