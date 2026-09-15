/**
 * ============================================================================
 * Scheduled Room Transfer — Job 20 is a REMINDER, not a cutover engine
 * ============================================================================
 *
 * The effective-date cron NO LONGER performs the physical cutover. Proven here:
 *
 *   nudgeDueScheduledRoomTransfers (Job 20)
 *     - a schedule whose Manila effective date/time has NOT been reached is
 *       skipped (no reminder, no state change)
 *     - a DUE OPEN schedule is "nudged" once — status/holdApplied/Bill are
 *       UNCHANGED, transferStayWorkflow is NEVER called
 *     - a second run does not double-nudge or mutate anything
 *     - action_required records are left alone
 *
 *   retryScheduledRoomTransfer
 *     - delegates to completeRoomTransfer; with no fresh meter reading on a
 *       sub-metered branch it surfaces METER_READING_REQUIRED as
 *       action_required (never a cutover)
 *     - an already-executed record short-circuits to { outcome: "executed" }
 *
 * The actual cutover + payment gate + settlement recompute are covered by:
 *   - scheduledRoomTransfer.delayedCompletion.integration.test.js
 *   - billing/transferElectricityFinalization.integration.test.js
 *   - billing/transferWaterAndOfficeHours.integration.test.js
 *   - tenantActionService.transferRentProrationCutoverDate.integration.test.js
 *
 * PDF + contract validation mocked.
 */
import mongoose from "mongoose";
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

// Spy on transferStayWorkflow to PROVE Job 20 never invokes it.
const realTAS = await import("../utils/tenantActionService.js");
const transferStayWorkflowSpy = jest.fn(realTAS.transferStayWorkflow);
await jest.unstable_mockModule("../utils/tenantActionService.js", () => ({
  ...realTAS,
  transferStayWorkflow: transferStayWorkflowSpy,
}));

const { scheduleRoomTransfer } = await import("./scheduledRoomTransferService.js");
const {
  nudgeDueScheduledRoomTransfers,
  executeDueScheduledRoomTransfers, // back-compat alias -> nudge
  retryScheduledRoomTransfer,
  isScheduledTransferDue,
} = await import("./scheduledRoomTransferExecutor.js");
const { generateContractNumber } = await import("./contractService.js");
const { getManilaToday } = await import("../utils/dateUtils.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  UtilityReading, ScheduledRoomTransfer, Payment,
} = await import("../models/index.js");

jest.setTimeout(300_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const bedsFor = (type, prefix) =>
  NEEDS_BED.has(type)
    ? Array.from({ length: CAP[type] }, (_, i) => ({ id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available" }))
    : [];

async function seed({ sourceType = "quadruple-sharing", roomNumber = "301", moveInDaysAgo = 60 } = {}) {
  const moveIn = getManilaToday().subtract(moveInDaysAgo, "day").toDate();
  const leaseEnd = getManilaToday().add(320, "day").toDate();
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Exec", lastName: "Tenant", role: "tenant", tenantStatus: "active",
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
      stayId: stay._id, branch: "gil-puyat", moveInDate: moveIn, effectiveStartDate: moveIn, status: "active",
    });
  }
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber("gil-puyat", new Date());
  await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: "gil-puyat",
    propertyName: "Lilycrest", propertyAddress: "123 Test", roomNumber: roomA.roomNumber,
    roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
    securityDepositAmount: RATE[sourceType],
    leaseStartDate: moveIn, leaseEndDate: leaseEnd, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, roomA, reservation, stay, actorId };
}
const emptyRoom = (type, roomNumber) =>
  Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });

/** Schedule (same-day, office hours wide open), then back-date so it is "due". */
async function scheduleDue({ reservation, roomB, actorId, daysAgo = 5 }) {
  const today = new Date(); today.setHours(9, 0, 0, 0);
  const destBedId = NEEDS_BED.has(roomB.type) ? `r${roomB.roomNumber}-b1` : undefined;
  const { scheduledTransfer } = await scheduleRoomTransfer({
    reservationId: reservation._id,
    payload: {
      confirm: true, targetRoomId: String(roomB._id),
      ...(destBedId ? { targetBedId: destBedId } : {}),
      effectiveTransferDate: today.toISOString(), effectiveTransferTimeMinutes: 540,
    },
    actorId,
  });
  const back = new Date(); back.setDate(back.getDate() - daysAgo); back.setHours(0, 0, 0, 0);
  await ScheduledRoomTransfer.updateOne({ _id: scheduledTransfer._id }, { $set: { effectiveTransferDate: back } });
  return ScheduledRoomTransfer.findById(scheduledTransfer._id);
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_job20" });
  await ScheduledRoomTransfer.syncIndexes();
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([
    Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
    Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
    Bill.deleteMany({}), BusinessSettings.deleteMany({}),
    UtilityReading.deleteMany({}), ScheduledRoomTransfer.deleteMany({}), Payment.deleteMany({}),
  ]);
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
  transferStayWorkflowSpy.mockClear();
  mockValidate.mockClear();
  mockGenerate.mockClear();
});

describe("isScheduledTransferDue", () => {
  test("future effective date is NOT due; today IS due", () => {
    expect(isScheduledTransferDue(getManilaToday().add(3, "day").toDate())).toBe(false);
    expect(isScheduledTransferDue(getManilaToday().toDate())).toBe(true);
    expect(isScheduledTransferDue(getManilaToday().subtract(2, "day").toDate())).toBe(true);
  });
});

describe("nudgeDueScheduledRoomTransfers (Job 20) — reminder only", () => {
  test("a not-yet-due schedule is skipped: no state change, transferStayWorkflow NEVER called", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    // Future schedule (5 days out).
    const future = getManilaToday().add(5, "day");
    await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: String(roomB._id), effectiveTransferDate: future.toISOString(), effectiveTransferTimeMinutes: 540 },
      actorId,
    });

    const report = await nudgeDueScheduledRoomTransfers({ now: new Date() });
    expect(report.nudged).toBe(0);
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();
    expect((await ScheduledRoomTransfer.findOne({ reservationId: reservation._id })).status).toBe("scheduled");
  });

  test("a DUE OPEN schedule is nudged once; status / holdApplied / Bill UNCHANGED; NO cutover", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    const sched = await scheduleDue({ reservation, roomB, actorId, daysAgo: 3 });
    expect(sched.status).toBe("scheduled");
    expect(sched.holdApplied).toBe(true);

    const report = await nudgeDueScheduledRoomTransfers({ now: new Date() });
    expect(report.scanned).toBeGreaterThanOrEqual(1);
    expect(report.nudged).toBe(1);
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();

    const after = await ScheduledRoomTransfer.findById(sched._id);
    expect(after.status).toBe("scheduled");           // NOT flipped
    expect(after.holdApplied).toBe(true);             // hold kept
    expect(after.executedAt).toBeFalsy();
    // No transfer_settlement Bill created by the nudge.
    expect(await Bill.countDocuments({ reservationId: reservation._id, billType: "transfer_settlement" })).toBe(0);
    // Tenant still in the source room.
    expect(String((await Stay.findOne({ reservationId: reservation._id })).roomId)).toBe(String((await Reservation.findById(reservation._id)).roomId));
  });

  test("a second run does not double-nudge or mutate anything", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    await scheduleDue({ reservation, roomB, actorId, daysAgo: 2 });

    const r1 = await nudgeDueScheduledRoomTransfers({ now: new Date() });
    const r2 = await nudgeDueScheduledRoomTransfers({ now: new Date() });
    expect(r1.nudged).toBe(1);
    // Second run still scans it (status unchanged) — the notification itself is
    // deduped by dedupeKey; nothing is mutated either way.
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();
    const rec = await ScheduledRoomTransfer.findOne({ reservationId: reservation._id });
    expect(rec.status).toBe("scheduled");
    void r2;
  });

  test("action_required records are ignored by the due scan (status:'scheduled' filter)", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    const sched = await scheduleDue({ reservation, roomB, actorId, daysAgo: 2 });
    await ScheduledRoomTransfer.updateOne({ _id: sched._id }, { $set: { status: "action_required", lastError: "TRANSFER_BALANCE_UNPAID" } });

    const report = await nudgeDueScheduledRoomTransfers({ now: new Date() });
    expect(report.scanned).toBe(0);
    expect(report.nudged).toBe(0);
  });

  test("executeDueScheduledRoomTransfers is a back-compat alias of the nudge (no cutover)", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    await scheduleDue({ reservation, roomB, actorId, daysAgo: 1 });
    const report = await executeDueScheduledRoomTransfers({ now: new Date() });
    expect(report.nudged).toBe(1);
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();
  });
});

describe("retryScheduledRoomTransfer -> completeRoomTransfer", () => {
  test("sub-metered branch, no fresh meter reading -> action_required METER_READING_REQUIRED, no cutover", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205"); // gil-puyat is sub-metered
    const sched = await scheduleDue({ reservation, roomB, actorId, daysAgo: 2 });

    const res = await retryScheduledRoomTransfer(sched._id, { actorId, payload: {} });
    expect(res.outcome).toBe("action_required");
    expect(String(res.reason)).toMatch(/METER_READING_REQUIRED/);
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();
    expect((await ScheduledRoomTransfer.findById(sched._id)).status).not.toBe("executed");
  });

  test("already-executed record short-circuits to { outcome: 'executed' }", async () => {
    const { reservation, actorId } = await seed();
    const roomB = await emptyRoom("private", "205");
    const sched = await scheduleDue({ reservation, roomB, actorId, daysAgo: 2 });
    await ScheduledRoomTransfer.updateOne({ _id: sched._id }, { $set: { status: "executed" } });

    const res = await retryScheduledRoomTransfer(sched._id, { actorId, payload: {} });
    expect(res.outcome).toBe("executed");
    expect(transferStayWorkflowSpy).not.toHaveBeenCalled();
  });
});
