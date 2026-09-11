/**
 * ============================================================================
 * Phase 2H — Scheduled transfer cancellation + tenant-departure fallback
 * ============================================================================
 * CANONICAL RULE proven here:
 *   paidAmount === 0  -> safe automatic cancellation (hold released once,
 *                        Addendum cancelled, unpaid Bill VOIDED not deleted,
 *                        status "cancelled"); source tenancy untouched.
 *   paidAmount  > 0   -> NOTHING financial reversed. status "action_required"
 *                        PAYMENT_ALREADY_RECEIVED. Bill / Payment / deposit
 *                        ledger / Addendum history all preserved. For an
 *                        explicit admin cancel the hold is KEPT; for a
 *                        lifecycle departure the hold IS released (physical
 *                        resource != financial refund).
 *   executed         -> TRANSFER_ALREADY_COMPLETED (skipped).
 *
 * Departure integration: moveOutStayWorkflow + executeEarlyTerminationWorkflow
 * (routes through move-out) + executeAbandonmentProtocolWorkflow call
 * resolveScheduledTransferBeforeTenantDeparture — never execute the transfer.
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
const mockGenerate = jest.fn(async ({ contractId, actorId }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("./contractService.js");
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
const realContractService = await import("./contractService.js");
await jest.unstable_mockModule("./contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { scheduleRoomTransfer, completeRoomTransfer } = await import("./scheduledRoomTransferService.js");
const {
  cancelScheduledRoomTransfer,
  resolveScheduledTransferBeforeTenantDeparture,
} = await import("./scheduledRoomTransferExecutor.js");
const {
  moveOutStayWorkflow,
  executeEarlyTerminationWorkflow,
  executeAbandonmentProtocolWorkflow,
} = await import("../utils/tenantActionService.js");
const { applyBillPayment } = await import("./billing/paymentLedger.js");
const { serializeScheduledRoomTransfer, getOpenScheduledRoomTransferForReservation } =
  await import("./scheduledRoomTransferView.js");
const { toMobileBill } = await import("./mobileBillingBridge.js");
const { generateContractNumber } = await import("./contractService.js");
const { seedCanonicalElectricityRoom } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const { getManilaToday } = await import("../utils/dateUtils.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  TenantCredit, UtilityPeriod, UtilityReading, ScheduledRoomTransfer, Payment,
} = await import("../models/index.js");

jest.setTimeout(300_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const futureStr = (d = 12) => getManilaToday().add(d, "day").format("YYYY-MM-DD");
const bedsFor = (type, prefix) =>
  NEEDS_BED.has(type)
    ? Array.from({ length: CAP[type] }, (_, i) => ({ id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available" }))
    : [];

async function seed({ sourceType = "quadruple-sharing", roomNumber = "301" } = {}) {
  const moveIn = getManilaToday().subtract(20, "day").toDate();
  const leaseEnd = getManilaToday().add(320, "day").toDate();
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Canc", lastName: "Tenant", role: "tenant", tenantStatus: "active",
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
  await seedCanonicalElectricityRoom({
    room: roomA,
    actorId,
    eventAt: new Date(),
    tenantId: tenant._id,
    reservationId: reservation._id,
    moveInAt: moveIn,
    maximumOpeningReading: 0,
  });
  return { tenant, roomA, reservation, stay, original, actorId };
}
const emptyRoom = (type, roomNumber) =>
  Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
function payloadFor({ targetRoom, transferDate }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: String(targetRoom._id),
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
  };
}
const payFull = async (billId) => {
  const bill = await Bill.findById(billId);
  return applyBillPayment({ bill, amount: bill.remainingAmount, method: "offline_cash", source: "admin-manual", now: new Date() });
};

// The transfer_settlement Bill is now created by the admin Complete Transfer
// flow on the transfer day — NOT at scheduling. This helper back-dates a
// just-scheduled record so it is "due", then drives completeRoomTransfer far
// enough to create + link the Bill (returns awaiting_settlement without a
// cutover), so cancellation tests that need a Bill to void/preserve have one.
async function makeDueWithSettlementBill(scheduledTransferId, { daysAgo = 3 } = {}) {
  const back = new Date(); back.setDate(back.getDate() - daysAgo); back.setHours(0, 0, 0, 0);
  await ScheduledRoomTransfer.updateOne({ _id: scheduledTransferId }, { $set: { effectiveTransferDate: back } });
  const rec = await ScheduledRoomTransfer.findById(scheduledTransferId).lean();
  const reservation = await Reservation.findById(rec.reservationId).lean();
  const periodStart = new Date(reservation.moveInDate);
  const fixtureActorId = rec.scheduledBy || new mongoose.Types.ObjectId();
  const [sourceRoom, destinationRoom] = await Promise.all([
    Room.findById(rec.sourceRoomId),
    Room.findById(rec.destinationRoomId),
  ]);
  await seedCanonicalElectricityRoom({
    room: sourceRoom,
    actorId: fixtureActorId,
    eventAt: back,
    tenantId: reservation.userId,
    reservationId: reservation._id,
    moveInAt: periodStart,
    maximumOpeningReading: 0,
  });
  await seedCanonicalElectricityRoom({
    room: destinationRoom,
    actorId: fixtureActorId,
    eventAt: back,
    maximumOpeningReading: 0,
  });
  const r = await completeRoomTransfer({
    reservationId: String(rec.reservationId),
    // Sub-metered branch (gil-puyat) needs meter readings even to SIZE the Bill.
    payload: { sourceRoomMeterReading: 0, targetRoomMeterReading: 0, sourceWaterReading:100,targetWaterReading:100 },
    actorId: fixtureActorId,
  });
  const linked = (await ScheduledRoomTransfer.findById(scheduledTransferId).lean())?.settlementBillId || null;
  return { outcome: r.outcome, billId: r.bill?._id || linked };
}

// After a safe (no-money) cancellation, the transfer_settlement Bill (if one
// was ever created via Complete Transfer) is VOIDED, not deleted. If no Bill
// was ever created (zero-settlement schedule), there is simply nothing.
async function expectLinkedBillVoidedOrAbsent(scheduledTransferId) {
  const rec = await ScheduledRoomTransfer.findById(scheduledTransferId).lean();
  if (!rec?.settlementBillId) return; // never had one — fine
  const bill = await Bill.findById(rec.settlementBillId).lean();
  expect(bill).toBeTruthy();
  expect(bill.status).toBe("voided");
  expect(bill.remainingAmount).toBe(0);
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_2h" });
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
    UtilityPeriod.deleteMany({}), UtilityReading.deleteMany({}), ScheduledRoomTransfer.deleteMany({}), Payment.deleteMany({}),
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

// ── Safe (unpaid) cancellation ────────────────────────────────────────────
describe("safe unpaid cancellation", () => {
  test("an in-flight Complete Transfer lease cannot be cancelled or release its hold", async () => {
    const { reservation, actorId } = await seed();
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }),
      actorId,
    });
    await ScheduledRoomTransfer.updateOne(
      { _id: scheduledTransfer._id },
      { $set: { executionToken: "active-completion", executionStartedAt: new Date() } },
    );

    const result = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(result).toEqual({ outcome: "skipped", reason: "NOT_CANCELLABLE" });
    expect((await ScheduledRoomTransfer.findById(scheduledTransfer._id)).holdApplied).toBe(true);
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(1);
  });

  test("unpaid schedule cancels: hold released once, Addendum cancelled, Bill voided, source untouched", async () => {
    const { reservation, roomA, stay, original, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(1);

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("cancelled");

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("cancelled");
    expect(s.cancelledBy).toBeTruthy();
    expect(s.cancelledAt).toBeTruthy();
    expect(s.holdApplied).toBe(false);

    // Private capacity hold released exactly once.
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);

    // Addendum cancelled / non-current; original still current.
    const addendum = await Contract.findById(scheduledTransfer.addendumContractId);
    expect(addendum.isCurrent).toBe(false);
    expect(["cancelled", "voided", "rejected", "archived"]).toContain(addendum.status);
    expect((await Contract.findById(original._id)).isCurrent).toBe(true);

    // No transfer_settlement Bill was ever created at scheduling time
    // (Round-2 decision) — nothing to void.
    expect(scheduledTransfer.settlementBillId == null).toBe(true);
    expect(await Bill.countDocuments({ reservationId: reservation._id, billType: "transfer_settlement" })).toBe(0);

    // Source tenancy completely unchanged.
    const [r, st] = await Promise.all([Reservation.findById(reservation._id), Stay.findById(stay._id)]);
    expect(String(r.roomId)).toBe(String(roomA._id));
    expect(r.recurringRentRate == null || r.recurringRentRate === 0).toBe(true);
    expect(Number(r.securityDepositHeld)).toBe(RATE["quadruple-sharing"]);
    expect(String(st.roomId)).toBe(String(roomA._id));
    expect(st.status).toBe("active");
    expect(await TenantCredit.countDocuments({})).toBe(0);
    const sourceReadings = await UtilityReading.find({ roomId: roomA._id }).sort({ date: 1, createdAt: 1 });
    expect(sourceReadings.map((reading) => reading.eventType)).toEqual(["periodStart", "moveIn"]);
    expect(sourceReadings.every((reading) => reading.utilityPeriodId != null)).toBe(true);
    expect(await UtilityReading.countDocuments({ roomId: dest._id })).toBe(0);
  });

  test("shared reserved bed hold released exactly once", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "101" });
    const dest = await emptyRoom("double-sharing", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    expect((await Room.findById(dest._id)).beds.find((b) => b.id === "r205-b1").status).toBe("reserved");

    await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    const d = await Room.findById(dest._id);
    expect(d.beds.find((b) => b.id === "r205-b1").status).toBe("available");
    expect(d.currentOccupancy).toBe(0);
  });

  test("zero-balance schedule cancels (no Bill to void)", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    // Recent move-in so it's a cycle-0, same-rate -> zero balance.
    await Reservation.updateOne({ _id: reservation._id }, { $set: { moveInDate: getManilaToday().subtract(3, "day").toDate() } });
    const stay = await Stay.findOne({ reservationId: reservation._id });
    await Stay.updateOne({ _id: stay._id }, { $set: { leaseStartDate: getManilaToday().subtract(3, "day").toDate() } });
    await Contract.updateOne({ reservationId: reservation._id }, { $set: { leaseStartDate: getManilaToday().subtract(3, "day").toDate() } });

    const dest = await emptyRoom("quadruple-sharing", "302");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(8) }), actorId,
    });
    // No Bill is created at scheduling time regardless of the eventual amount.
    expect(scheduledTransfer.settlementBillId == null).toBe(true);

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("cancelled");
    expect((await ScheduledRoomTransfer.findById(scheduledTransfer._id)).status).toBe("cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
  });

  test("duplicate cancellation is idempotent — no double-decrement", async () => {
    const { reservation, actorId } = await seed({ sourceType: "private", roomNumber: "101" });
    const dest = await emptyRoom("double-sharing", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const first = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(first.outcome).toBe("cancelled");
    const second = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(second.outcome).toBe("skipped");
    expect(second.reason).toBe("already_cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0); // not -1
  });

  test("an UNPAID transfer_settlement Bill created at Complete Transfer is VOIDED on a safe cancellation (not outstanding on web + mobile)", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    // Due + Complete Transfer attempted with an unpaid balance -> Bill created,
    // record -> action_required (no cutover).
    const { billId } = await makeDueWithSettlementBill(scheduledTransfer._id);
    expect(billId).toBeTruthy();

    // Now cancel — no money received -> safe, the unpaid Bill is VOIDED.
    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("cancelled");

    const bill = await Bill.findById(billId).lean();
    expect(bill.status).toBe("voided");
    const mobile = toMobileBill(bill);
    expect(mobile.status).toBe("cancelled");
    const view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    expect(view.status).toBe("cancelled");
    expect(view.transferBalance.paymentState).toBe("none");
    expect(await getOpenScheduledRoomTransferForReservation(reservation._id)).toBeNull();
  });
});

// ── Any payment -> manual settlement ─────────────────────────────────────
describe("paid cancellation -> action_required, no financial reversal", () => {
  test("partial payment: action_required PAYMENT_ALREADY_RECEIVED; hold KEPT; Bill/Payment/deposit preserved", async () => {
    const { reservation, roomA, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const { billId: __bid } = await makeDueWithSettlementBill(scheduledTransfer._id);
    const bill = await Bill.findById(__bid);
    await applyBillPayment({ bill, amount: Math.round(bill.totalAmount * 0.3 * 100) / 100, method: "offline_cash", source: "admin-manual", now: new Date() });
    const heldAfterPartial = (await Reservation.findById(reservation._id)).securityDepositHeld;

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("action_required");
    expect(res.reason).toBe("PAYMENT_ALREADY_RECEIVED");
    expect(res.message).toMatch(/manual processing/i);
    expect(res.message).toMatch(/Administration Office/i);
    expect(res.message).toMatch(/2nd Floor/i);

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("action_required");
    expect(s.holdApplied).toBe(true); // KEPT for an explicit admin cancel

    // Nothing financial reversed.
    const billAfter = await Bill.findById(bill._id);
    expect(billAfter.status).not.toBe("voided");
    expect(billAfter.paidAmount).toBeGreaterThan(0);
    expect(await Payment.countDocuments({ billId: bill._id })).toBe(1);
    expect(Number((await Reservation.findById(reservation._id)).securityDepositHeld)).toBeCloseTo(heldAfterPartial, 2);
    // Addendum still there (non-current); hold still on the room.
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(1);
    // Source still current.
    expect(String((await Reservation.findById(reservation._id)).roomId)).toBe(String(roomA._id));
    expect(await TenantCredit.countDocuments({ userId: reservation.userId })).toBe(0);

    const audit = s.financialAdjustmentHistory.at(-1);
    expect(audit.reason).toBe("PAYMENT_ALREADY_RECEIVED");
    expect(String(audit.settlementBillId)).toBe(String(bill._id));
    expect(String(audit.tenantId)).toBe(String(reservation.userId));
    expect(String(audit.reservationId)).toBe(String(reservation._id));
    expect(String(audit.scheduledRoomTransferId)).toBe(String(scheduledTransfer._id));
    expect(audit.amountPaid).toBeCloseTo(billAfter.paidAmount, 2);
    expect(audit.previousRequiredAmount).toBeCloseTo(billAfter.totalAmount, 2);
    expect(audit.recomputedRequiredAmount).toBeNull();
    expect(audit.difference).toBeNull();
    expect(audit.recordedAt).toBeTruthy();
  });

  test("fully paid (Ready): action_required, no refund, held deposit preserved", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const { billId } = await makeDueWithSettlementBill(scheduledTransfer._id);
    await payFull(billId);
    const heldAfterFull = (await Reservation.findById(reservation._id)).securityDepositHeld;

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("action_required");
    expect(res.reason).toBe("PAYMENT_ALREADY_RECEIVED");
    expect(res.message).toMatch(/Administration Office/i);
    expect(res.message).toMatch(/2nd Floor/i);

    const bill = await Bill.findById(billId);
    expect(bill.status).not.toBe("voided");
    expect(bill.paidAmount).toBeCloseTo(bill.totalAmount, 2);
    expect(Number((await Reservation.findById(reservation._id)).securityDepositHeld)).toBeCloseTo(heldAfterFull, 2);
  });
});

// ── Post-cutover ─────────────────────────────────────────────────────────
describe("post-cutover", () => {
  test("executed schedule -> TRANSFER_ALREADY_COMPLETED", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(2) }), actorId,
    });
    const { billId: __bid } = await makeDueWithSettlementBill(scheduledTransfer._id);
    await payFull(__bid);
    // Complete the transfer (admin-driven) — it is now paid, so it executes.
    const done = await completeRoomTransfer({
      reservationId: String(reservation._id),
      payload: { sourceRoomMeterReading: 0, targetRoomMeterReading: 0, sourceWaterReading:100,targetWaterReading:100 },
      actorId,
    });
    expect(done.outcome).toBe("executed");

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("skipped");
    expect(res.reason).toBe("TRANSFER_ALREADY_COMPLETED");
  });
});

// ── action_required cancellation safety ──────────────────────────────────
describe("action_required cancellation", () => {
  test("action_required + zero payment (TRANSFER_BALANCE_UNPAID) can be safely cancelled", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(2) }), actorId,
    });
    // Due + Complete Transfer attempted with an unpaid balance -> action_required.
    await makeDueWithSettlementBill(scheduledTransfer._id); // creates the Bill, unpaid
    const sAfter = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(sAfter.status).toBe("action_required");
    expect(sAfter.lastError).toBe("TRANSFER_BALANCE_UNPAID");

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
    await expectLinkedBillVoidedOrAbsent(scheduledTransfer._id);
  });

  test("action_required + payment cannot auto-cancel financially", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const { billId: __bid } = await makeDueWithSettlementBill(scheduledTransfer._id);
    const bill = await Bill.findById(__bid);
    await applyBillPayment({ bill, amount: 500, method: "offline_cash", source: "admin-manual", now: new Date() });
    // Force into action_required.
    await ScheduledRoomTransfer.updateOne({ _id: scheduledTransfer._id }, { $set: { status: "action_required", lastError: "OPERATIONAL_VALIDATION_FAILED" } });

    const res = await cancelScheduledRoomTransfer(scheduledTransfer._id, { actorId });
    expect(res.outcome).toBe("action_required");
    expect(res.reason).toBe("PAYMENT_ALREADY_RECEIVED");
    expect((await Bill.findById(bill._id)).status).not.toBe("voided");
  });
});

// ── Tenant departure integration ────────────────────────────────────────
describe("tenant departure before effective date", () => {
  function moveOutPayload() {
    return { confirm: true, moveOutDate: getManilaToday().toDate().toISOString(), finalUtilityReading: 100, forceOverride: true };
  }

  test("move-out + unpaid schedule -> auto-cancel, hold released, transfer NOT executed", async () => {
    const { reservation, roomA, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });

    await moveOutStayWorkflow({ reservationId: String(reservation._id), payload: moveOutPayload(), actorId });

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
    await expectLinkedBillVoidedOrAbsent(scheduledTransfer._id);
    // Tenant left the SOURCE room (moveOut), never the destination.
    expect((await Reservation.findById(reservation._id)).status).toBe("moveOut");
    void roomA;
  });

  test("executeEarlyTerminationWorkflow + unpaid schedule -> workflow completes, schedule auto-cancelled", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });

    // The real wrapper — proves the enum fix (forfeitureReason -> "early_vacancy")
    // lets the move-out save succeed and the departure hook run.
    const result = await executeEarlyTerminationWorkflow(
      String(reservation._id),
      {
        penaltyFee: 1500,
        moveOutDate: moveOutPayload().moveOutDate,
        finalUtilityReading: 100,
        keyReturned: true,
        forceOverride: true,
      },
      actorId,
    );
    expect(result.success).toBe(true);

    const r = await Reservation.findById(reservation._id);
    expect(r.status).toBe("moveOut");
    expect(r.depositForfeitureReason).toBe("early_vacancy"); // schema-valid enum

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
    await expectLinkedBillVoidedOrAbsent(scheduledTransfer._id);
  });

  test("executeAbandonmentProtocolWorkflow + unpaid schedule -> workflow completes, schedule auto-cancelled", async () => {
    const { reservation, tenant, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });

    // The real workflow — proves the enum fixes (status -> "moveOut",
    // depositForfeitureReason -> "admin_decision", tenantStatus -> "moved_out")
    // let every save succeed and the departure hook run end-to-end.
    const result = await executeAbandonmentProtocolWorkflow(String(reservation._id), {}, actorId);
    expect(result.success).toBe(true);

    const r = await Reservation.findById(reservation._id);
    expect(r.status).toBe("moveOut"); // canonical terminal departure state
    expect(r.depositForfeited).toBe(true);
    expect(r.depositForfeitureReason).toBe("admin_decision"); // schema-valid enum
    expect(r.notes).toMatch(/[Aa]bandonment/); // human-readable detail preserved
    expect((await User.findById(tenant._id)).tenantStatus).toBe("moved_out");

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("cancelled");
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
    await expectLinkedBillVoidedOrAbsent(scheduledTransfer._id);
  });

  test("executeAbandonmentProtocolWorkflow + PAID schedule -> hold released, financials PRESERVED, action_required", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const { billId: __bid } = await makeDueWithSettlementBill(scheduledTransfer._id);
    await payFull(__bid);

    const result = await executeAbandonmentProtocolWorkflow(String(reservation._id), {}, actorId);
    expect(result.success).toBe(true);

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("action_required");
    expect(s.lastError).toBe("PAYMENT_ALREADY_RECEIVED");
    // Physical resource freed, money untouched.
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);
    const bill = await Bill.findById((await ScheduledRoomTransfer.findById(scheduledTransfer._id)).settlementBillId);
    expect(bill).toBeTruthy();
    expect(bill.status).not.toBe("voided");
    expect(bill.paidAmount).toBeCloseTo(bill.totalAmount, 2);
    expect(await Payment.countDocuments({ billId: bill._id })).toBe(1);
    // Transfer never executed.
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
  });

  test("departure + PAID schedule -> destination hold RELEASED, financial history PRESERVED, action_required, transfer NOT executed", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureStr(12) }), actorId,
    });
    const { billId: __bid } = await makeDueWithSettlementBill(scheduledTransfer._id);
    await payFull(__bid);
    const heldBeforeDeparture = (await Reservation.findById(reservation._id)).securityDepositHeld;

    await moveOutStayWorkflow({ reservationId: String(reservation._id), payload: moveOutPayload(), actorId });

    const s = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
    expect(s.status).toBe("action_required");
    expect(s.lastError).toBe("PAYMENT_ALREADY_RECEIVED");
    expect(s.holdApplied).toBe(false); // physical resource freed

    // Destination hold released — room is available again.
    expect((await Room.findById(dest._id)).currentOccupancy).toBe(0);

    // Financial history preserved.
    const bill = await Bill.findById((await ScheduledRoomTransfer.findById(scheduledTransfer._id)).settlementBillId);
    expect(bill).toBeTruthy();
    expect(bill.status).not.toBe("voided");
    expect(bill.paidAmount).toBeCloseTo(bill.totalAmount, 2);
    expect(await Payment.countDocuments({ billId: bill._id })).toBe(1);
    // securityDepositHeld unchanged by the cancellation — move-out clearance
    // uses it as the ACTUAL cash basis (documented behavior).
    const resAfter = await Reservation.findById(reservation._id);
    expect(Number(resAfter.securityDepositHeld)).toBeCloseTo(heldBeforeDeparture, 2);
    expect(resAfter.status).toBe("moveOut");

    // Transfer NEVER executed — Addendum still non-current.
    expect((await Contract.findById(scheduledTransfer.addendumContractId)).isCurrent).toBe(false);
  });
});

// ── resolveScheduledTransferBeforeTenantDeparture direct ─────────────────
describe("resolveScheduledTransferBeforeTenantDeparture helper", () => {
  test("no open schedule -> handled:false (noop)", async () => {
    const { reservation, actorId } = await seed();
    const r = await resolveScheduledTransferBeforeTenantDeparture(reservation._id, { actorId });
    expect(r.handled).toBe(false);
  });
});
