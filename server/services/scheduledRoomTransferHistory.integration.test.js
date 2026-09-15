/**
 * F3 — ROOM TRANSFER HISTORY AGGREGATOR
 *
 * getRoomTransferHistoryForReservation returns the complete audit trail for a
 * reservation, built ONLY from canonical records (no RoomTransferTransaction
 * model): every ScheduledRoomTransfer (all statuses) + derived legacy
 * immediate transfers from BedHistory / Addendum / transfer_settlement Bill.
 *
 * Proves:
 *   - a scheduled transfer appears with the right userFacingStatus
 *     (Awaiting Payment / Ready / Completed / Cancelled / Action Required)
 *   - destination bed only when the destination needs one
 *   - scheduled/created date + initiated-by present
 *   - View Bill / View Addendum identity present
 *   - a legacy immediate transfer (BedHistory transferred + Addendum + Bill,
 *     NO ScheduledRoomTransfer) is derived as Completed, no actions
 *   - a modern scheduled transfer's own BedHistory/Addendum/Bill are NOT
 *     re-derived as a second legacy row (dedupe)
 *   - newest-first ordering
 *   - cancelled / completed transfers stay in history
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

jest.setTimeout(240_000);

const { getRoomTransferHistoryForReservation } = await import("./scheduledRoomTransferHistory.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, ScheduledRoomTransfer,
} = await import("../models/index.js");

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "srt_history_f3" });
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([
    Contract.deleteMany({}), Reservation.deleteMany({}), Room.deleteMany({}),
    User.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
    Bill.deleteMany({}), ScheduledRoomTransfer.deleteMany({}),
  ]);
});

async function baseFixture() {
  const admin = await User.create({
    firebaseUid: `a-${new mongoose.Types.ObjectId()}`, email: `a-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `a_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Ada", lastName: "Admin", role: "owner",
  });
  const tenant = await User.create({
    firebaseUid: `t-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Tom", lastName: "Tenant", role: "tenant", tenantStatus: "active",
  });
  const roomA = await Room.create({
    name: "Room 301", roomNumber: "301", branch: "gil-puyat",
    type: "quadruple-sharing", capacity: 4, currentOccupancy: 1, price: 5400, beds: [],
  });
  const roomB = await Room.create({
    name: "Room 205", roomNumber: "205", branch: "gil-puyat",
    type: "private", capacity: 1, currentOccupancy: 0, price: 13500, beds: [],
  });
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: 5400, monthlyRent: 5400, moveInDate: new Date("2026-01-01"),
  });
  return { admin, tenant, roomA, roomB, reservation };
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function makeScheduled({
  reservation, admin, roomA, roomB, status = "scheduled", withBill = true,
  effective = daysFromNow(7), settlementPaid = 0, needsBed = true, destBedId = "b2",
  executedSettlement = null, executedAt = null, cancelledAt = null,
}) {
  let settlementBillId = null;
  if (withBill) {
    const total = 8100;
    const bill = await Bill.create({
      billType: "transfer_settlement",
      reservationId: reservation._id, userId: reservation.userId,
      branch: "gil-puyat", roomId: roomA._id,
      billingMonth: effective, billingCycleStart: effective, billingCycleEnd: effective,
      dueDate: effective,
      charges: { rent: 8100, electricity: 0, water: 0, securityDeposit: 0, discount: 0 },
      totalAmount: total, grossAmount: total,
      remainingAmount: round(total - settlementPaid), paidAmount: settlementPaid,
      status: settlementPaid >= total ? "paid" : "pending",
      publicationState: "published",
      transferSnapshot: {
        fromRoomId: roomA._id, fromRoomName: "Room 301", fromRoomType: "quadruple-sharing",
        toRoomId: roomB._id, toRoomName: "Room 205", toRoomType: "private",
        effectiveTransferDate: effective, isScheduledTransferBalance: true,
      },
    });
    settlementBillId = bill._id;
  }
  const addendum = await Contract.collection.insertOne({
    _id: new mongoose.Types.ObjectId(),
    tenantId: reservation.userId, reservationId: reservation._id, roomId: roomB._id,
    branch: "gil-puyat", leaseType: "long_term",
    contractNumber: `LIL-GP-2026-0009${status === "cancelled" ? "9" : "1"}-A1`,
    contractPurpose: "amendment",
    status: status === "cancelled" ? "cancelled" : status === "executed" ? "generated" : "generated",
    isCurrent: status === "executed",
    amendmentEffectiveDate: effective, roomNumber: "205", approvedMonthlyRate: 13500,
    propertyName: "Lilycrest", propertyAddress: "x", contractYear: 2026,
    contractSequence: Math.floor(Math.random() * 1e6),
    createdBy: admin._id, updatedBy: admin._id,
    leaseStartDate: new Date("2026-01-01"), leaseEndDate: new Date("2026-12-31"),
    leaseDurationMonths: 12, regularMonthlyRate: 15000, advanceRentAmount: 13500,
    securityDepositAmount: 13500, createdAt: new Date(), updatedAt: new Date(),
  });

  return ScheduledRoomTransfer.create({
    reservationId: reservation._id, tenantId: reservation.userId, branch: "gil-puyat",
    sourceRoomId: roomA._id, sourceBedId: needsBed ? "b1" : null,
    destinationRoomId: roomB._id, destinationBedId: needsBed ? destBedId : null,
    destinationNeedsBed: needsBed,
    effectiveTransferDate: effective, reason: "Upgrade to private",
    addendumContractId: addendum.insertedId,
    settlementBillId,
    previewSnapshot: {
      fromRoom: { name: "Room 301", type: "quadruple-sharing" },
      toRoom: { name: "Room 205", type: "private" },
      rent: { sourceEffectiveRate: 5400, destinationApprovedRate: 13500, adjustmentDue: 8100, excessCredit: 0 },
      deposit: { required: 13500, held: 5400, balanceDue: 0, excessHeld: 0 },
    },
    executedSettlement,
    status,
    holdApplied: status !== "cancelled",
    scheduledBy: admin._id,
    scheduledAt: daysFromNow(-1),
    executedAt,
    cancelledAt,
    cancelledBy: status === "cancelled" ? admin._id : null,
    lastError: status === "action_required" ? "TRANSFER_BALANCE_UNPAID" : null,
  });
}

describe("getRoomTransferHistoryForReservation — scheduled records", () => {
  test("Scheduled: future transfer + unpaid balance Bill (not yet due)", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "scheduled", withBill: true, settlementPaid: 0 });
    const hist = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(hist).toHaveLength(1);
    const e = hist[0];
    expect(e.source).toBe("scheduled");
    // An unpaid settlement is visible even before the scheduled transfer day.
    expect(e.userFacingStatus).toBe("Payment Required");
    expect(e.status).toBe("awaiting_settlement");
    expect(e.fromRoom.name).toBe("Room 301");
    expect(e.toRoom.name).toBe("Room 205");
    expect(e.toBed).toBe("Assigned bed"); // legacy bed ID has no display label
    expect(e.scheduledAt).toBeTruthy();
    expect(e.initiatedBy?.name).toBe("Ada Admin");
    expect(e.settlementBillId).toBeTruthy();
    expect(e.addendumContractId).toBeTruthy();
    expect(e.addendum?.label).toMatch(/Room Transfer Addendum/);
    expect(e.utilityNote).toMatch(/normal utility billing cycle/i);
  });

  test("Scheduled: future transfer + fully paid balance Bill (still not due)", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "scheduled", withBill: true, settlementPaid: 8100 });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(e.userFacingStatus).toBe("Transfer Scheduled");
    expect(e.status).toBe("scheduled");
  });

  test("Scheduled: future transfer with no balance Bill (zero-balance transfer)", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "scheduled", withBill: false });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(e.userFacingStatus).toBe("Transfer Scheduled");
    expect(e.transferBalance.hasBill).toBe(false);
  });

  test("Completed: executed transfer, final settlement + completed timestamp", async () => {
    const f = await baseFixture();
    await makeScheduled({
      ...f, status: "executed", withBill: true, settlementPaid: 8100,
      executedAt: daysFromNow(0),
      executedSettlement: {
        rentAdjustmentDue: 8100, additionalDepositDue: 0, excessRentCredit: 0,
        excessDepositHeld: 0, totalImmediateDue: 8100, settlementBillId: null,
      },
    });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(e.userFacingStatus).toBe("Transfer Completed");
    expect(e.status).toBe("completed");
    expect(e.finalSettlementAmount).toBe(8100);
    expect(e.completedAt).toBeTruthy();
    expect(e.actionsAllowed.cancel).toBe(false);
    expect(e.actionsAllowed.retry).toBe(false);
  });

  test("Cancelled: cancelled transfer stays in history, no actions", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "cancelled", withBill: false, cancelledAt: daysFromNow(-1) });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(e.userFacingStatus).toBe("Cancelled");
    expect(e.status).toBe("cancelled");
    expect(e.cancelledAt).toBeTruthy();
    expect(e.actionsAllowed.cancel).toBe(false);
    expect(e.actionsAllowed.retry).toBe(false);
  });

  test("Action Required + unpaid balance surfaces as Awaiting Settlement with a friendly message", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "action_required", withBill: true, settlementPaid: 0 });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    // An action_required record whose only blocker is the unpaid transfer
    // settlement is presented to the admin as "Payment Required".
    expect(e.userFacingStatus).toBe("Payment Required");
    expect(e.status).toBe("awaiting_settlement");
    // The raw orchestration reason is still available for context, but never as
    // the primary message.
    expect(e.actionRequiredReason).toBe("TRANSFER_BALANCE_UNPAID");
    expect(e.actionRequiredMessage).toMatch(/not fully settled/i);
    expect(e.actionRequiredMessage).not.toMatch(/TRANSFER_BALANCE_UNPAID/);
  });

  test("private destination -> no destination bed shown", async () => {
    const f = await baseFixture();
    await makeScheduled({ ...f, status: "scheduled", withBill: false, needsBed: false });
    const [e] = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(e.toBed).toBeNull();
  });
});

describe("legacy immediate transfers — derived, deduped", () => {
  async function seedLegacyImmediate(f, { effective = new Date("2025-06-16") } = {}) {
    // The tenant's OLD room BedHistory closed by a transfer.
    await BedHistory.create({
      bedId: "b1", roomId: f.roomA._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: new Date("2025-01-01"),
      moveOutDate: effective, effectiveEndDate: effective,
      status: "transferred", closedByAction: "transfer", reason: "Legacy room change",
      fromRoomSnapshot: { roomId: f.roomA._id, name: "Room 301", roomNumber: "301", type: "quadruple-sharing", branch: "gil-puyat", monthlyPrice: 5400 },
      proratedRentAdjustment: 4200,
    });
    // The NEXT room BedHistory (destination).
    await BedHistory.create({
      bedId: `room-${f.roomB._id}`, roomId: f.roomB._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: effective, status: "active",
    });
    // The legacy replacement Contract.
    await Contract.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      tenantId: f.tenant._id, reservationId: f.reservation._id, roomId: f.roomB._id,
      branch: "gil-puyat", leaseType: "long_term",
      contractNumber: "LIL-GP-2025-00050-R1", contractPurpose: "replacement",
      status: "replaced", isCurrent: false,
      amendmentEffectiveDate: effective, roomNumber: "205", approvedMonthlyRate: 13500,
      propertyName: "Lilycrest", propertyAddress: "x", contractYear: 2025,
      contractSequence: Math.floor(Math.random() * 1e6),
      createdBy: f.admin._id, updatedBy: f.admin._id,
      leaseStartDate: new Date("2025-01-01"), leaseEndDate: new Date("2025-12-31"),
      leaseDurationMonths: 12, regularMonthlyRate: 15000, advanceRentAmount: 13500,
      securityDepositAmount: 13500, createdAt: effective, updatedAt: effective,
    });
    // The transfer_settlement Bill.
    await Bill.create({
      billType: "transfer_settlement", reservationId: f.reservation._id, userId: f.tenant._id,
      branch: "gil-puyat", roomId: f.roomA._id,
      billingMonth: effective, dueDate: effective,
      charges: { rent: 4200, electricity: 0, water: 0, securityDeposit: 0, discount: 0 },
      totalAmount: 4200, grossAmount: 4200, remainingAmount: 0, paidAmount: 4200, status: "paid",
      transferSnapshot: { toRoomId: f.roomB._id, toRoomName: "Room 205", effectiveTransferDate: effective },
    });
  }

  test("legacy immediate transfer with no ScheduledRoomTransfer -> derived Completed, no actions", async () => {
    const f = await baseFixture();
    await seedLegacyImmediate(f);
    const hist = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(hist).toHaveLength(1);
    const e = hist[0];
    expect(e.source).toBe("legacy_immediate");
    expect(e.userFacingStatus).toBe("Transfer Completed");
    expect(e.status).toBe("completed");
    expect(e.fromRoom.name).toBe("Room 301");
    expect(e.toRoom.name).toBe("Room 205");
    expect(e.settlementBillId).toBeTruthy();
    expect(e.addendumContractId).toBeTruthy();
    expect(e.addendum?.label).toBe("Transfer Replacement (legacy)");
    expect(e.actionsAllowed).toEqual({ cancel: false, retry: false });
    expect(e.actionRequiredReason).toBeNull();
  });

  test("a modern scheduled transfer's own BedHistory/Addendum/Bill are NOT re-derived as legacy", async () => {
    const f = await baseFixture();
    const effective = daysFromNow(5);
    const sched = await makeScheduled({ ...f, status: "scheduled", withBill: true, effective, settlementPaid: 0 });
    // Simulate that a modern transfer also left a closed BedHistory (as the
    // executor does) + points at the SAME settlement Bill.
    await BedHistory.create({
      bedId: "b1", roomId: f.roomA._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: new Date("2026-01-01"),
      moveOutDate: effective, effectiveEndDate: effective,
      status: "transferred", closedByAction: "transfer",
      fromRoomSnapshot: { name: "Room 301", type: "quadruple-sharing" },
    });
    await BedHistory.create({
      bedId: "b2", roomId: f.roomB._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: effective, status: "active",
    });
    const hist = await getRoomTransferHistoryForReservation(f.reservation._id);
    // EXACTLY one entry — the ScheduledRoomTransfer wins; no legacy duplicate.
    expect(hist).toHaveLength(1);
    expect(hist[0].source).toBe("scheduled");
    expect(hist[0].id).toBe(sched._id.toString());
  });
});

describe("ordering + multi-entry", () => {
  test("newest first by effective date; scheduled + legacy coexist", async () => {
    const f = await baseFixture();
    // Legacy immediate a year ago.
    await BedHistory.create({
      bedId: "b1", roomId: f.roomA._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: new Date("2025-01-01"),
      moveOutDate: new Date("2025-06-16"), effectiveEndDate: new Date("2025-06-16"),
      status: "transferred", closedByAction: "transfer",
      fromRoomSnapshot: { name: "Room 110", type: "double-sharing" },
    });
    await BedHistory.create({
      bedId: "b1", roomId: f.roomA._id, tenantId: f.tenant._id, reservationId: f.reservation._id,
      branch: "gil-puyat", moveInDate: new Date("2025-06-16"), status: "active",
    });
    // A future scheduled transfer.
    await makeScheduled({ ...f, status: "scheduled", withBill: false, effective: daysFromNow(10) });

    const hist = await getRoomTransferHistoryForReservation(f.reservation._id);
    expect(hist.length).toBeGreaterThanOrEqual(2);
    // Newest first = the future scheduled one.
    expect(hist[0].source).toBe("scheduled");
    const times = hist.map((e) => new Date(e.effectiveDate || e.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });
});
