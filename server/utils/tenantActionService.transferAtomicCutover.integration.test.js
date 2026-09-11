/**
 * ============================================================================
 * PHASE 7 — ATOMIC ROOM-TRANSFER CUTOVER: CROSS-DOMAIN CONSISTENCY
 * ============================================================================
 * Phases 2-6 proved occupancy, rent, electricity, water, and financial
 * settlement each in isolation. This file proves they change together — the
 * transfer is ALL-OR-NOTHING across every domain at the final cutover.
 *
 * Not duplicated (already proven elsewhere):
 *   - the 3x3 room-type occupancy matrix              -> transferCrossType
 *   - physical-mutation rollback on cutover failure   -> transferCutoverRollback
 *   - multi-transfer financial rate/held-deposit      -> transferSettlementHardening
 *   - electricity/water room-scoped windows           -> *RoomScopedTransfer
 *
 * This file adds:
 *   1. ONE successful transfer -> occupancy + rent + utility cutoffs +
 *      financial records + lease dates all consistent with the SAME transfer
 *   2. destination fills between the guard and the atomic cutover ->
 *      DESTINATION_ROOM_FULL, zero artifacts
 *   3. idempotent retry -> no duplicate UtilityReading / occupancy / ledger
 *   4. two concurrent transfers into the last destination slot -> exactly one
 *      wins, the other fails cleanly
 *   5. same-type cross-domain consistency
 *   6. lease start/end dates never change
 *
 * The forced-cutover-failure "everything rolls back together" case lives in
 * tenantActionService.transferAtomicRollback.integration.test.js (it needs a
 * mid-file jest.resetModules() to swap the cutover module, which would tear
 * down this file's shared mongoose connection).
 *
 * PDF generation is mocked.
 */
import mongoose from "mongoose";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockValidate = jest.fn(async () => ({
  valid: true, missingFields: [], errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));
const mockGenerate = jest.fn(async ({ contractId, actorId }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("../services/contractService.js");
  const contract = await Contract.findById(contractId);
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
    await transitionContract(contract, "generated", actorId, "prepared (test)");
  } else {
    await contract.save();
  }
  return { contract, document: contract.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("../services/contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realContractService = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("./tenantActionService.js");
const {
  prepareCanonicalTransferUtilityFixture,
  transferWithCanonicalUtilityFixture,
} = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { sumBillCharges } = await import("../services/billing/billingPolicy.js");
const { resolveReservationRentAmount } = await import("../services/billing/rentGenerator.js");
const { resolveCurrentStayForReservation, CURRENT_STAY_STATUSES } =
  await import("../services/tenantContractSelectionService.js");
const { initSocket } = await import("./socket.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit, UtilityReading, AuditLog, Notification } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const LEASE_END = new Date("2027-01-31T00:00:00.000Z");
const TRANSFER_DATE = "2026-08-15T00:00:00.000Z";
// transferStayWorkflow.normalizeDate does setHours(0,0,0,0) in the runner's
// LOCAL tz, so assert the transfer day in local time.
const dayOfMonthLocal = (d) => new Date(d).getDate();

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seedTenant({ sourceType, roomNumber = "301", branch = "gil-puyat" }) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`,
    email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "P7", lastName: "T", role: "tenant", tenantStatus: "active",
  });
  const srcBeds = bedsFor(sourceType, `r${roomNumber}`);
  if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
  const roomA = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch,
    type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
  });
  const srcBedId = NEEDS_BED.has(sourceType) ? `r${roomNumber}-b1` : "";
  const srcStayBedId = srcBedId || `room-${roomA._id}`;
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
    reservationFeeAmount: 2000, preferredRoomType: sourceType,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: RATE[sourceType], monthlyRent: RATE[sourceType],
    selectedBed: { id: srcBedId }, moveInDate: MOVE_IN, securityDepositHeld: RATE[sourceType],
  });
  if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: reservation._id, branch: roomA.branch,
    roomId: roomA._id, bedId: srcStayBedId,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: RATE[sourceType], status: "active",
  });
  if (NEEDS_BED.has(sourceType)) {
    await BedHistory.create({
      bedId: srcBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: roomA.branch, moveInDate: MOVE_IN, status: "active",
    });
  }
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber(roomA.branch, new Date());
  const predecessor = await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: roomA.branch,
    propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
    roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
    securityDepositAmount: RATE[sourceType],
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 6,
    status: "active", isCurrent: true,
    statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, roomA, reservation, stay, predecessor, actorId, srcBedId };
}

async function emptyRoom(type, roomNumber, branch = "gil-puyat", occupancy = 0) {
  return Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch,
    type, capacity: CAP[type], currentOccupancy: occupancy, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
}

function transferPayload({ targetRoom, transferDate = TRANSFER_DATE, sourceReading, targetReading }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: targetRoom._id,
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
    ...(sourceReading != null ? { sourceRoomMeterReading: sourceReading } : {}),
    ...(targetReading != null ? { targetRoomMeterReading: targetReading } : {}),
  };
}

describe("Phase 7 — atomic cutover cross-domain consistency", () => {
  let mongo;
  let httpServer;
  let socketServer;
  let socketEvents = [];
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "phase7_atomic" });
    httpServer = createServer();
    socketServer = initSocket(httpServer, { allowedOrigins: [], isOriginAllowed: () => true });
    jest.spyOn(socketServer, "to").mockImplementation((room) => ({
      emit(event, payload) {
        socketEvents.push({ room, event, payload });
        return this;
      },
      to() { return this; },
    }));
  }, 120_000);
  afterAll(async () => {
    socketServer?.close();
    httpServer?.close();
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-08-15T10:00:00.000+08:00"), doNotFake: ["nextTick", "setImmediate", "setInterval", "setTimeout", "clearInterval", "clearTimeout", "queueMicrotask"] });
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
      Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
      UtilityReading.deleteMany({}), AuditLog.deleteMany({}), Notification.deleteMany({}),
    ]);
    await BusinessSettings.create({
      key: "global",
      officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
      isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    });
    mockValidate.mockClear();
    mockGenerate.mockClear();
    socketEvents = [];
  });

  afterEach(() => { jest.useRealTimers(); });

  test('eligible source and destination persist fresh water at the same physical transfer instant',async()=>{
    const {roomA,reservation,actorId}=await seedTenant({sourceType:'double-sharing'});
    const roomB=await emptyRoom('double-sharing','water-success');
    const result=await transferStayWorkflow({reservationId:reservation._id,actorId,
      payload:{...transferPayload({targetRoom:roomB,sourceReading:1200,targetReading:5000}),sourceWaterReading:106,targetWaterReading:200}});
    for (const [roomId,eventType,reading] of [[roomA._id,'moveOut',106],[roomB._id,'moveIn',200]]) {
      const observation=await UtilityReading.findOne({roomId,utilityType:'water',eventType});
      expect(observation.reading).toBe(reading);expect(observation.date.getTime()).toBe(result.cutoverAt.getTime());
      expect(String(observation.reservationId)).toBe(String(reservation._id));
    }
  });

  test('water save failure rolls back source and destination occupancy together',async()=>{
    const {roomA,reservation,stay,actorId}=await seedTenant({sourceType:'double-sharing'});
    const roomB=await emptyRoom('private','water-dest');
    const create=UtilityReading.create.bind(UtilityReading);
    const spy=jest.spyOn(UtilityReading,'create').mockImplementation((docs,...args)=>{
      if ((Array.isArray(docs)?docs:[docs]).some(d=>d.utilityType==='water' && String(d.roomId)===String(roomB._id))) throw new Error('Injected water meter failure');
      return create(docs,...args);
    });
    try {
      await expect(transferStayWorkflow({reservationId:reservation._id,actorId,
        payload:{...transferPayload({targetRoom:roomB,sourceReading:1200,targetReading:5000}),sourceWaterReading:106,targetWaterReading:200}})).rejects.toThrow('Injected water meter failure');
    } finally {spy.mockRestore();}
    expect(String((await Reservation.findById(reservation._id)).roomId)).toBe(String(roomA._id));
    expect(String((await Stay.findById(stay._id)).roomId)).toBe(String(roomA._id));
    expect((await Room.findById(roomA._id)).currentOccupancy).toBe(1);
    expect((await Room.findById(roomB._id)).currentOccupancy).toBe(0);
    expect(await UtilityReading.countDocuments({utilityType:'water'})).toBe(0);
    expect(await BedHistory.countDocuments({reservationId:reservation._id,status:'transferred'})).toBe(0);
  });

  // ── 1. Successful transfer: every domain agrees with the SAME transfer ──
  test("Quad -> Private: occupancy + rent + utility cutoffs + financial records + lease dates all consistent after one transfer", async () => {
    const { tenant, roomA, reservation, stay, predecessor, actorId } = await seedTenant({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("private", "402");

    const result = await transferStayWorkflow({
      reservationId: reservation._id,
      payload: transferPayload({ targetRoom: roomB, sourceReading: 1200, targetReading: 5000 }),
      actorId,
    });

    // Post-commit actions are intentionally non-blocking. Wait only until the
    // persisted audit and tenant-notification callbacks have completed.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [auditCount, notificationCount] = await Promise.all([
        AuditLog.countDocuments({ action: /^Room transfer:/ }),
        Notification.countDocuments({ userId: tenant._id, type: "general", title: "Room Transfer Confirmed" }),
      ]);
      if (auditCount === 1 && notificationCount === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const [
      currentStay, stayCount, reloadedRes, reloadedRoomA, reloadedRoomB,
      oldBedHistory, activeBedHistories, settlementBills, credits,
      srcMoveOutReadings, dstMoveInReadings, reloadedPredecessor, successor,
    ] = await Promise.all([
      resolveCurrentStayForReservation(reservation._id),
      Stay.countDocuments({ reservationId: reservation._id, status: { $in: [...CURRENT_STAY_STATUSES] } }),
      Reservation.findById(reservation._id),
      Room.findById(roomA._id),
      Room.findById(roomB._id),
      BedHistory.find({ roomId: roomA._id, reservationId: reservation._id }),
      BedHistory.find({ reservationId: reservation._id, status: "active" }),
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      TenantCredit.find({ userId: tenant._id }),
      UtilityReading.find({ roomId: roomA._id, utilityType: "electricity", eventType: "moveOut", tenantId: tenant._id }),
      UtilityReading.find({ roomId: roomB._id, utilityType: "electricity", eventType: "moveIn", tenantId: tenant._id }),
      Contract.findById(predecessor._id),
      Contract.findOne({ replacesContractId: predecessor._id, contractPurpose: { $in: ["amendment", "replacement"] } }),
    ]);

    // ── OCCUPANCY ──────────────────────────────────────────────────────
    expect(stayCount).toBe(1);
    expect(String(currentStay._id)).toBe(String(stay._id));         // same Stay, mutated
    expect(String(currentStay.roomId)).toBe(String(roomB._id));
    expect(currentStay.bedId).toBe(`room-${roomB._id}`);            // private sentinel
    expect(String(reloadedRes.roomId)).toBe(String(roomB._id));
    expect(reloadedRoomA.currentOccupancy).toBe(0);                 // source decremented
    expect(reloadedRoomB.currentOccupancy).toBe(1);                 // destination incremented
    expect(oldBedHistory.every((b) => b.status === "transferred")).toBe(true);
    expect(oldBedHistory[0].effectiveEndDate).toBeTruthy();
    expect(activeBedHistories).toHaveLength(1);
    expect(String(activeBedHistories[0].roomId)).toBe(String(roomB._id));

    // ── RENT ───────────────────────────────────────────────────────────
    expect(reloadedRes.recurringRentRate).toBe(13500);             // destination approved rate
    expect(resolveReservationRentAmount(reloadedRes)).toBe(13500);
    expect(new Date(reloadedRes.moveInDate).toISOString()).toBe(MOVE_IN.toISOString()); // anchor unchanged

    // ── ELECTRICITY CUTOFFS ────────────────────────────────────────────
    expect(srcMoveOutReadings).toHaveLength(1);                    // exactly one source cutoff
    expect(dstMoveInReadings).toHaveLength(1);                     // exactly one destination cutoff
    expect(dayOfMonthLocal(srcMoveOutReadings[0].date)).toBe(15);  // dated the transfer day
    // Source cutoff and destination cutoff are the SAME day (no gap / overlap).
    expect(dayOfMonthLocal(dstMoveInReadings[0].date)).toBe(15);

    // ── FINANCIAL SETTLEMENT ──────────────────────────────────────────
    expect(settlementBills).toHaveLength(1);
    const bill = settlementBills[0];
    expect(bill.charges.rent).toBeGreaterThan(0);                  // additional rent due
    expect(bill.charges.securityDeposit).toBe(13500 - 5400);       // deposit difference, separate
    expect(bill.charges.electricity).toBe(0);                      // NOT double-charged here
    expect(bill.charges.water).toBe(0);
    expect(bill.totalAmount).toBeCloseTo(sumBillCharges(bill.charges), 2); // canonical total
    expect(reloadedRes.securityDepositHeld).toBe(5400);            // NOT raised before payment
    expect(credits).toHaveLength(0);                               // higher rent -> no credit

    // ── CONTRACT LINEAGE + LEASE DATES ────────────────────────────────
    expect(reloadedPredecessor.status).toBe("replaced");
    expect(reloadedPredecessor.isCurrent).toBe(false);
    expect(successor.isCurrent).toBe(true);

    // The ACTUAL LEASE (the Stay) is never mutated by a room transfer.
    expect(new Date(currentStay.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(currentStay.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    // The predecessor legal record's dates are untouched.
    expect(new Date(reloadedPredecessor.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(reloadedPredecessor.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    // PHASE 8: the successor is a Room Transfer ADDENDUM. It carries the
    // ORIGINAL lease term verbatim; the transfer date is a SEPARATE
    // amendmentEffectiveDate, never leaseStartDate.
    expect(successor.contractPurpose).toBe("amendment");
    expect(new Date(successor.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(successor.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    expect(successor.leaseDurationMonths).toBe(reloadedPredecessor.leaseDurationMonths);
    expect(dayOfMonthLocal(successor.amendmentEffectiveDate)).toBe(15);
    expect(String(successor.parentContractId)).toBe(String(reloadedPredecessor._id)); // root lease

    expect(result.contractCutover.successorStatus).toBe("generated");
    expect(await AuditLog.countDocuments({ action: /^Room transfer:/ })).toBe(1);
    expect(await Notification.countDocuments({ userId: tenant._id, type: "general", title: "Room Transfer Confirmed" })).toBe(1);
    const contractEvents = socketEvents.filter((entry) => entry.event === "contract:updated");
    expect(contractEvents.filter((entry) => entry.room === `user:${tenant._id}`)).toHaveLength(1);
    expect(contractEvents.filter((entry) => entry.room === "admins")).toHaveLength(1);
  });

  // ── 2. Destination fills between the guard and the atomic cutover ─────
  test("destination room fills (occupancy pushed to capacity) mid-flow -> DESTINATION_ROOM_FULL, zero artifacts", async () => {
    const { tenant, roomA, reservation, actorId } = await seedTenant({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("private", "402"); // capacity 1

    // Simulate a concurrent claim: fill roomB to capacity AFTER Stage A but
    // (from the workflow's perspective) before its in-transaction atomic
    // increment. We approximate by filling it before calling — the Stage-A
    // guard uses a populated snapshot so it may pass; the in-transaction
    // atomicIncreaseOccupancy is the real gate.
    await Room.updateOne({ _id: roomB._id }, { $set: { currentOccupancy: 1 } });

    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: transferPayload({ targetRoom: roomB, sourceReading: 1200, targetReading: 5000 }),
      actorId,
    })).rejects.toMatchObject({ code: "DESTINATION_ROOM_FULL" });

    const [rRes, rRoomA, rRoomB, bills, credits, readings, transferredBH] = await Promise.all([
      Reservation.findById(reservation._id),
      Room.findById(roomA._id),
      Room.findById(roomB._id),
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      TenantCredit.find({ userId: tenant._id }),
      UtilityReading.find({ reservationId: reservation._id, eventType: { $in: ["moveIn", "moveOut"] } }),
      BedHistory.find({ reservationId: reservation._id, status: "transferred" }),
    ]);
    expect(String(rRes.roomId)).toBe(String(roomA._id));
    expect(rRoomA.currentOccupancy).toBe(1);      // source NOT decremented
    expect(rRoomB.currentOccupancy).toBe(1);      // destination unchanged (the pre-filled 1)
    expect(rRes.recurringRentRate == null).toBe(true);
    expect(bills).toHaveLength(0);
    expect(credits).toHaveLength(0);
    expect(readings).toHaveLength(0);
    expect(transferredBH).toHaveLength(0);
  });

  // ── 3. Idempotent retry: no duplicate artifacts across domains ────────
  test("retrying a successful transfer creates no second Bill / occupancy increment / UtilityReading / deposit-ledger entry", async () => {
    const { tenant, roomA, reservation, actorId } = await seedTenant({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("quadruple-sharing", "402");

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: transferPayload({ targetRoom: roomB, sourceReading: 1200, targetReading: 5000 }),
      actorId,
    });

    // Retry (rejected — predecessor no longer active).
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: transferPayload({ targetRoom: roomB, sourceReading: 1250, targetReading: 5050 }),
      actorId,
    })).rejects.toMatchObject({ code: expect.stringMatching(/ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE|SAME_TRANSFER_TARGET/) });

    const [bills, rRoomB, srcOut, dstIn, rRes] = await Promise.all([
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      Room.findById(roomB._id),
      UtilityReading.find({ roomId: roomA._id, utilityType: "electricity", eventType: "moveOut", tenantId: tenant._id }),
      UtilityReading.find({ roomId: roomB._id, utilityType: "electricity", eventType: "moveIn", tenantId: tenant._id }),
      Reservation.findById(reservation._id),
    ]);
    expect(bills).toHaveLength(1);
    expect(rRoomB.currentOccupancy).toBe(1);     // not 2
    expect(srcOut).toHaveLength(1);
    expect(dstIn).toHaveLength(1);
    const ledgerForThisTransfer = (rRes.securityDepositLedger || []).filter((e) => e.kind && e.kind.startsWith("transfer"));
    expect(ledgerForThisTransfer.length).toBeLessThanOrEqual(1);
  });

  // ── 4. Concurrency: two simultaneous transfers into the last slot ─────
  test("two concurrent transfers into a 1-slot private room: exactly one succeeds, the other fails cleanly", async () => {
    const tA = await seedTenant({ sourceType: "double-sharing", roomNumber: "301" });
    const tB = await seedTenant({ sourceType: "double-sharing", roomNumber: "305" });
    const dest = await emptyRoom("private", "900"); // capacity 1

    const inputA = { reservationId: tA.reservation._id, payload: transferPayload({ targetRoom: dest }), actorId: tA.actorId };
    const inputB = { reservationId: tB.reservation._id, payload: transferPayload({ targetRoom: dest }), actorId: tB.actorId };
    inputA.payload = (await prepareCanonicalTransferUtilityFixture(inputA)).payload;
    inputB.payload = (await prepareCanonicalTransferUtilityFixture(inputB)).payload;

    const results = await Promise.allSettled([
      rawTransferStayWorkflow(inputA),
      rawTransferStayWorkflow(inputB),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rDest = await Room.findById(dest._id);
    expect(rDest.currentOccupancy).toBe(1);               // exactly one occupant, never 2

    const settlementBills = await Bill.find({ billType: "transfer_settlement" });
    expect(settlementBills).toHaveLength(1);              // only the winner settled

    // The loser is entirely intact in their source room.
    const loserResId = results.findIndex((r) => r.status === "rejected") === 0 ? tA.reservation._id : tB.reservation._id;
    const loserSourceId = loserResId === tA.reservation._id ? tA.roomA._id : tB.roomA._id;
    const [loserRes, loserSrcRoom] = await Promise.all([
      Reservation.findById(loserResId),
      Room.findById(loserSourceId),
    ]);
    expect(String(loserRes.roomId)).toBe(String(loserSourceId));
    expect(loserRes.recurringRentRate == null).toBe(true);
    expect(loserSrcRoom.currentOccupancy).toBe(1);
  });

  // ── 5. Same-type cross-domain: Double -> Double another room ─────────
  test("Double -> Double (same type, another room): occupancy, rent, readings, and one settlement Bill all agree", async () => {
    const { tenant, reservation, actorId } = await seedTenant({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("double-sharing", "402");

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: transferPayload({ targetRoom: roomB, sourceReading: 1200, targetReading: 5000 }),
      actorId,
    });

    const [currentStay, rRes, bills, srcOut, dstIn] = await Promise.all([
      resolveCurrentStayForReservation(reservation._id),
      Reservation.findById(reservation._id),
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      UtilityReading.find({ roomId: reservation.roomId, utilityType:"electricity", eventType: "moveOut", tenantId: tenant._id }),
      UtilityReading.find({ roomId: roomB._id, utilityType:"electricity", eventType: "moveIn", tenantId: tenant._id }),
    ]);
    expect(String(currentStay.roomId)).toBe(String(roomB._id));
    expect(currentStay.bedId).toBe("r402-b1");
    expect(rRes.recurringRentRate).toBe(8100);           // same rate -> unchanged value
    expect(resolveReservationRentAmount(rRes)).toBe(8100);
    expect(bills).toHaveLength(1);
    expect(bills[0].charges.rent).toBe(0);               // same rate -> no manufactured charge
    expect(bills[0].charges.securityDeposit).toBe(0);    // same deposit
    expect(bills[0].totalAmount).toBe(0);
    expect(srcOut).toHaveLength(1);
    expect(dstIn).toHaveLength(1);
    // Lease dates untouched
    expect(new Date(currentStay.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(currentStay.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
  });
});
