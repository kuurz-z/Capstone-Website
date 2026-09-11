import mongoose from "mongoose";
import { rawSnapshot, seedProtectedControls, guardMutations, controls } from "./utilityRepairTestSupport.mjs";
import { resolveUtilityPeriodState } from "../services/billing/utilityPeriodLifecycleService.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditLog, Bill, Contract, Payment, Reservation, Room, ScheduledRoomTransfer, Stay, UtilityFinalization, UtilityHistoricalGap, UtilityPeriod, UtilityReading } from "../models/index.js";
import { CONFIRM_TOKEN, EXPECTED_READINGS, GENERATED_IDS, REPAIR_KEY, TARGET, parseRepairArgs, runFreshBaselineRepair } from "./repair_gp705_gp1008_utility_lifecycle_v2.mjs";

const O = (value) => new mongoose.Types.ObjectId(String(value));
const actor = O("69bb9249dcab8f0bf467a0f4");
const reservationUpdatedAt = new Date("2026-09-01T12:11:36.903Z");
const sourceUpdatedAt = new Date("2026-09-01T09:08:48.910Z");
const destinationUpdatedAt = new Date("2026-09-01T09:16:32.147Z");
const billUpdatedAt = new Date("2026-09-01T09:08:48.744Z");
const models = { AuditLog, Bill, Contract, Payment, Reservation, Room, ScheduledRoomTransfer, Stay, UtilityFinalization, UtilityHistoricalGap, UtilityPeriod, UtilityReading };

function args(write = false) {
  const values = {
    "schedule-id": TARGET.scheduleId, "source-period-id": TARGET.sourcePeriodId, "destination-period-id": TARGET.destinationPeriodId,
    "source-opening": "1301.25", "destination-opening": "1266.5", "observed-at": "2026-09-01T04:20:00.123Z",
    "source-evidence": "photo:gp705:fresh", "destination-evidence": "photo:gp1008:fresh", "source-review-owner": String(actor),
    "source-review-reference": "review:gp705:001", "destination-gap-reference": "gap:gp1008:001",
    "expected-source-updated-at": sourceUpdatedAt.toISOString(), "expected-destination-updated-at": destinationUpdatedAt.toISOString(),
    "expected-bill-updated-at": billUpdatedAt.toISOString(), "expected-reservation-updated-at": reservationUpdatedAt.toISOString(),
    "reservation-change-reference": "audit:benign-metadata-change:verified", "actor-id": String(actor),
  };
  const argv = Object.entries(values).flatMap(([key, value]) => [`--${key}`, value]);
  if (write) argv.push("--write", "--confirm-token", CONFIRM_TOKEN);
  return parseRepairArgs(argv);
}

async function seed() {
  await Room.collection.insertMany([
    { _id: O(TARGET.sourceRoomId), name: "GP - Room 705", roomNumber: "GP-705", branch: "gil-puyat", type: "private", capacity: 1, currentOccupancy: 1, price: 14400 },
    { _id: O(TARGET.destinationRoomId), name: "GP - Room 1008", roomNumber: "GP-1008", branch: "gil-puyat", type: "private", capacity: 1, currentOccupancy: 1, price: 14400 },
  ]);
  await Reservation.collection.insertOne({ _id: O(TARGET.reservationId), userId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId), status: "moveIn", isArchived: false, updatedAt: reservationUpdatedAt });
  await Stay.collection.insertOne({ _id: new mongoose.Types.ObjectId(), reservationId: O(TARGET.reservationId), tenantId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId), branch: "gil-puyat", status: "active", leaseStartDate: new Date("2026-08-24T16:00:00Z"), monthlyRent: 14400 });
  await ScheduledRoomTransfer.collection.insertOne({ _id: O(TARGET.scheduleId), reservationId: O(TARGET.reservationId), tenantId: O(TARGET.tenantId), branch: "gil-puyat", sourceRoomId: O(TARGET.sourceRoomId), destinationRoomId: O(TARGET.destinationRoomId), status: "scheduled", holdApplied: true, isArchived: false, scheduledBy: actor, effectiveTransferDate: new Date(TARGET.gapStart), scheduleHistory: [], updatedAt: new Date("2026-09-01T08:54:56.065Z") });
  await UtilityPeriod.collection.insertMany([
    { _id: O(TARGET.sourcePeriodId), utilityType: "electricity", roomId: O(TARGET.sourceRoomId), branch: "gil-puyat", startDate: new Date(TARGET.gapStart), endDate: new Date("2026-09-30T16:00:00Z"), startReading: 1000, endReading: 1250, ratePerUnit: 16, computedTotalCost: 4000, status: "closed", isArchived: false, updatedAt: sourceUpdatedAt },
    { _id: O(TARGET.destinationPeriodId), utilityType: "electricity", roomId: O(TARGET.destinationRoomId), branch: "gil-puyat", startDate: new Date(TARGET.gapStart), endDate: new Date("2026-09-30T16:00:00Z"), startReading: 1000, endReading: 1260, ratePerUnit: 16, computedTotalCost: 4160, status: "closed", isArchived: false, updatedAt: destinationUpdatedAt },
  ]);
  await UtilityReading.collection.insertMany(Object.entries(EXPECTED_READINGS).map(([id, value]) => ({ _id: O(id), utilityType: "electricity", roomId: O(value.roomId), branch: "gil-puyat", utilityPeriodId: O(value.periodId), eventType: value.eventType, reading: value.reading, date: new Date(value.date), readingStatus: "locked", recordedBy: actor, isArchived: false, updatedAt: new Date(value.updatedAt) })));
  await Bill.collection.insertOne({ _id: O(TARGET.sourceBillId), reservationId: O(TARGET.reservationId), userId: O(TARGET.tenantId), roomId: O(TARGET.sourceRoomId), branch: "gil-puyat", billType: "monthly", status: "draft", paidAmount: 0, sentAt: null, issuedAt: null, isArchived: false, charges: { electricity: 4000 }, utilityDispatch: { electricity: { state: "draft", periodId: O(TARGET.sourcePeriodId), amount: 4000 } }, updatedAt: billUpdatedAt });
}

describe("fresh-baseline v2 repair script", () => {
  let mongo;
  beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(mongo.getUri(), { dbName: "fresh_baseline_v2" }); await UtilityPeriod.syncIndexes(); }, 120_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); }, 120_000);
  beforeEach(async () => { await Promise.all(Object.values(models).map((Model) => Model.deleteMany({}))); await seed(); await seedProtectedControls(models); });

  test("15. v2 dry-run performs zero writes", async () => {
    const before = await rawSnapshot(models);
    expect(await runFreshBaselineRepair({ args: args(), models })).toMatchObject({ mode: "dry-run", status: "READY", databaseMutations: 0 });
    expect(await rawSnapshot(models)).toBe(before);
  });
  test("16. v2 write transaction archives history rather than deleting it", async () => {
    await runFreshBaselineRepair({ args: args(true), models, now: () => new Date("2026-09-01T04:21:00Z") });
    expect(await UtilityPeriod.countDocuments({ _id: { $in: [O(TARGET.sourcePeriodId), O(TARGET.destinationPeriodId)] } })).toBe(2);
    expect(await UtilityPeriod.countDocuments({ _id: { $in: [O(TARGET.sourcePeriodId), O(TARGET.destinationPeriodId)] }, isArchived: true, status: "closed" })).toBe(2);
    expect(await UtilityReading.countDocuments({ _id: { $in: [...TARGET.sourceReadingIds, ...TARGET.destinationReadingIds].map(O) }, isArchived: true })).toBe(4);
    expect(await Bill.countDocuments({ _id: O(TARGET.sourceBillId), isArchived: true, status: "draft", "charges.electricity": 4000 })).toBe(1);
  });
  test("17. exact observedAt is stored on both replacement periods and locked boundaries", async () => {
    const input = args(true); await runFreshBaselineRepair({ args: input, models, now: () => new Date("2026-09-01T04:21:00Z") });
    const periods = await UtilityPeriod.find({ _id: { $in: [O(GENERATED_IDS.sourcePeriodId), O(GENERATED_IDS.destinationPeriodId)] } }).lean();
    const readings = await UtilityReading.find({ _id: { $in: [O(GENERATED_IDS.sourceReadingId), O(GENERATED_IDS.destinationReadingId)] } }).lean();
    expect(periods.every((item) => item.startDate.getTime() === input.observedAt.getTime())).toBe(true);
    expect(readings.every((item) => item.date.getTime() === input.observedAt.getTime() && item.eventType === "periodStart" && item.readingStatus === "locked")).toBe(true);
  });
  test("19. stale audited fingerprint aborts before mutation", async () => {
    await UtilityPeriod.collection.updateOne({ _id: O(TARGET.sourcePeriodId) }, { $set: { updatedAt: new Date("2026-09-01T13:00:00Z") } });
    await expect(runFreshBaselineRepair({ args: args(true), models })).rejects.toMatchObject({ code: "SOURCE_FINGERPRINT_CHANGED" });
    expect(await AuditLog.countDocuments({ "metadata.repairKey": REPAIR_KEY })).toBe(0);
  });
  test("20. changed Reservation fingerprint aborts explicitly", async () => {
    await Reservation.collection.updateOne({ _id: O(TARGET.reservationId) }, { $set: { updatedAt: new Date("2026-09-01T13:00:00Z") } });
    await expect(runFreshBaselineRepair({ args: args(), models })).rejects.toMatchObject({ code: "RESERVATION_FINGERPRINT_CHANGED" });
  });
  test("21. repair leaves schedule, hold, and effective date unchanged", async () => {
    const before = await ScheduledRoomTransfer.findById(TARGET.scheduleId).lean();
    await runFreshBaselineRepair({ args: args(true), models, now: () => new Date("2026-09-01T04:21:00Z") });
    const after = await ScheduledRoomTransfer.findById(TARGET.scheduleId).lean();
    expect(after).toMatchObject({ status: before.status, holdApplied: before.holdApplied, effectiveTransferDate: before.effectiveTransferDate, scheduleHistory: before.scheduleHistory });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  test.each([undefined, 7])("exact revision increment from %s preserves other Room fields and paid history", async revision => {
    if (revision !== undefined) await Room.collection.updateMany({ _id: { $in: [O(TARGET.sourceRoomId), O(TARGET.destinationRoomId)] } }, { $set: { electricityObservationRevision: revision } });
    const before = JSON.parse(await rawSnapshot(models));
    await runFreshBaselineRepair({ args: args(true), models });
    const after = JSON.parse(await rawSnapshot(models));
    expect(after.Room).toEqual(before.Room.map(room => [TARGET.sourceRoomId, TARGET.destinationRoomId].includes(room._id) ? { ...room, electricityObservationRevision: (revision ?? 0) + 1 } : room));
    for (const name of ["Payment", "Contract", "Stay", "Reservation", "ScheduledRoomTransfer"]) expect(after[name]).toEqual(before[name]);
    expect(after.Bill.filter(bill => bill.status === "paid")).toEqual(before.Bill.filter(bill => bill.status === "paid"));
    expect(after.UtilityPeriod.find(period => period._id === String(controls.period))).toEqual(before.UtilityPeriod.find(period => period._id === String(controls.period)));
    expect(after.UtilityReading.find(reading => reading._id === String(controls.reading))).toEqual(before.UtilityReading.find(reading => reading._id === String(controls.reading)));
  });

  test.each(guardMutations(TARGET))("rejects %s and rolls back all raw documents", async (_label, model, filter, update) => {
    const before = await rawSnapshot(models);
    let injected = false;
    await expect(runFreshBaselineRepair({ args: args(true), models, deps: {
      resolvePeriod: async options => {
        // The script resolves replacements after writing its audit record.
        if (!injected) { injected = true; await models[model].collection.updateOne(filter, update, { session: options.session }); }
        return resolveUtilityPeriodState(options);
      },
    } })).rejects.toMatchObject({ code: "UNTOUCHED_STATE_CHANGED" });
    expect(injected).toBe(true);
    expect(await rawSnapshot(models)).toBe(before);
  });
});
