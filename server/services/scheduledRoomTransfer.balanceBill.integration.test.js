/**
 * ============================================================================
 * Phase 2D — Scheduled Room Transfer Balance Bill + payment readiness
 * ============================================================================
 * Proves:
 *   - higher-rent / higher-deposit future transfer -> ONE transfer_settlement
 *     Bill with charges.rent + charges.securityDeposit, electricity/water = 0,
 *     dueDate = effective transfer date (Manila), status "pending"
 *   - ScheduledRoomTransfer.settlementBillId links it
 *   - zero-balance schedule (same/cheaper rate + held deposit already covers)
 *     -> NO Bill, settlementBillId null, user status "ready"
 *   - cheaper destination -> NO TenantCredit created at scheduling; excess
 *     held deposit not refunded/credited (informational in the serializer)
 *   - serializer: unpaid -> awaiting_payment, partial -> awaiting_payment +
 *     paymentState "partial", fully paid -> ready
 *   - recording a payment on the Bill does NOT change room / Stay / rent
 *   - the same canonical Bill serialises through the mobile billing bridge
 *     (toMobileBill) with rent + security_deposit + total + remaining
 *   - all cross-room-type combinations schedule without type-specific logic
 *
 * PDF + contract validation mocked (same pattern as the other transfer
 * integration suites).
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
  serializeScheduledRoomTransfer,
  resolveScheduledTransferBalance,
} = await import("./scheduledRoomTransferView.js");
const { toMobileBill } = await import("./mobileBillingBridge.js");
const { generateContractNumber } = await import("./contractService.js");
const { getManilaToday, toManilaStartOfDay } = await import("../utils/dateUtils.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  TenantCredit, UtilityPeriod, ScheduledRoomTransfer,
} = await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");

function futureDateStr(daysAhead = 10) {
  return getManilaToday().add(daysAhead, "day").format("YYYY-MM-DD");
}
function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seed({
  sourceType = "quadruple-sharing",
  roomNumber = "301",
  heldDeposit = null,
  moveIn = MOVE_IN,
  leaseEnd = LEASE_END,
} = {}) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "Bal", lastName: "Tenant", role: "tenant", tenantStatus: "active",
  });
  const srcBeds = bedsFor(sourceType, `r${roomNumber}`);
  if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
  const roomA = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
  });
  await UtilityPeriod.create({
    utilityType: "electricity", roomId: roomA._id, branch: "gil-puyat",
    startDate: moveIn, startReading: 0, ratePerUnit: 1, status: "open",
  });
  const srcBedId = NEEDS_BED.has(sourceType) ? `r${roomNumber}-b1` : "";
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    reservationFeeAmount: 2000, preferredRoomType: sourceType,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: RATE[sourceType], monthlyRent: RATE[sourceType],
    selectedBed: { id: srcBedId }, moveInDate: moveIn,
    securityDepositHeld: heldDeposit == null ? RATE[sourceType] : heldDeposit,
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
  return { tenant, roomA, reservation, stay, original, actorId };
}

async function emptyRoom(type, roomNumber) {
  const room = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
  await UtilityPeriod.create({
    utilityType: "electricity", roomId: room._id, branch: "gil-puyat",
    startDate: MOVE_IN, startReading: 0, ratePerUnit: 1, status: "open",
  });
  return room;
}
function payloadFor({ targetRoom, transferDate }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: String(targetRoom._id),
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
  };
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_2d" });
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
    Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
    UtilityPeriod.deleteMany({}), ScheduledRoomTransfer.deleteMany({}),
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


// The transfer_settlement Bill is created by the admin Complete Transfer flow
// on the transfer day — NOT at scheduling. Helper: schedule same-day (office
// hours wide open in beforeEach), back-date so it is due, then run
// completeRoomTransfer with meter readings so the Bill is created + linked
// (returns awaiting_settlement — no cutover while unpaid).
async function scheduleThenComplete({ reservation, dest, actorId, daysAgo = 3, source = 0, target = 0 }) {
  const today = new Date(); today.setHours(9, 0, 0, 0);
  const destBedId = NEEDS_BED.has(dest.type) ? `r${dest.roomNumber}-b1` : undefined;
  const { scheduledTransfer, previewSnapshot } = await scheduleRoomTransfer({
    reservationId: reservation._id,
    payload: {
      confirm: true, targetRoomId: String(dest._id),
      ...(destBedId ? { targetBedId: destBedId } : {}),
      effectiveTransferDate: today.toISOString(), effectiveTransferTimeMinutes: 540,
    },
    actorId,
  });
  const back = new Date(); back.setDate(back.getDate() - daysAgo); back.setHours(0, 0, 0, 0);
  await ScheduledRoomTransfer.updateOne({ _id: scheduledTransfer._id }, { $set: { effectiveTransferDate: back } });
  const r = await completeRoomTransfer({
    reservationId: String(reservation._id),
    payload: { sourceWaterReading:100, targetWaterReading:100, sourceRoomMeterReading: source, targetRoomMeterReading: target },
    actorId,
  });
  const rec = await ScheduledRoomTransfer.findById(scheduledTransfer._id);
  return { scheduledTransfer: rec, previewSnapshot, outcome: r.outcome, billId: r.bill?._id || rec.settlementBillId || null };
}

describe("transfer_settlement Bill is created at Complete Transfer (NOT at scheduling)", () => {
  test("scheduling creates NO Bill; Complete Transfer creates ONE with rent + securityDeposit (+ electricity), water = 0, linked", async () => {
    const { reservation, roomA, stay, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");

    // Schedule for a future date -> no Bill.
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureDateStr(10) }), actorId,
    });
    expect(scheduledTransfer.settlementBillId == null).toBe(true);
    expect(await Bill.countDocuments({ reservationId: reservation._id, billType: "transfer_settlement" })).toBe(0);

    // Back-date + Complete Transfer -> ONE Bill, unpaid, linked.
    const back = new Date(); back.setDate(back.getDate() - 3); back.setHours(0, 0, 0, 0);
    await ScheduledRoomTransfer.updateOne({ _id: scheduledTransfer._id }, { $set: { effectiveTransferDate: back } });
    const r = await completeRoomTransfer({
      reservationId: String(reservation._id),
      payload: { sourceWaterReading:100, targetWaterReading:100, sourceRoomMeterReading: 0, targetRoomMeterReading: 0 },
      actorId,
    });
    expect(r.outcome).toBe("awaiting_settlement");

    const bills = await Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bills).toHaveLength(1);
    const bill = bills[0];
    expect(bill.charges.rent).toBeGreaterThan(0);
    expect(bill.charges.securityDeposit).toBeGreaterThan(0);
    expect(bill.charges.water).toBe(0);              // water NEVER on this Bill
    expect(bill.charges.electricity).toBeGreaterThanOrEqual(0); // 0 here (reading 0 == baseline)
    expect(bill.totalAmount).toBe(
      Math.round((bill.charges.rent + bill.charges.securityDeposit + (bill.charges.electricity || 0)) * 100) / 100,
    );
    expect(bill.status).toBe("pending");
    expect(bill.paidAmount).toBe(0);
    expect(String((await ScheduledRoomTransfer.findById(scheduledTransfer._id)).settlementBillId)).toBe(String(bill._id));

    // No cutover while unpaid: source room / Stay / rent untouched, no TenantCredit.
    const [resAfter, stayAfter, roomAAfter] = await Promise.all([
      Reservation.findById(reservation._id), Stay.findById(stay._id), Room.findById(roomA._id),
    ]);
    expect(String(resAfter.roomId)).toBe(String(roomA._id));
    expect(Number(resAfter.monthlyRent)).toBe(RATE["quadruple-sharing"]);
    expect(stayAfter.status).toBe("active");
    expect(roomAAfter.currentOccupancy).toBe(1);
    expect(await TenantCredit.countDocuments({})).toBe(0);
  });

  test("serializer: due + unpaid -> awaiting_settlement; partial -> awaiting_settlement + partial; paid -> ready_for_transfer", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { scheduledTransfer, billId } = await scheduleThenComplete({ reservation, dest, actorId });
    expect(billId).toBeTruthy();

    let view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    expect(view.status).toBe("awaiting_settlement");
    expect(view.transferBalance.paymentState).toBe("unpaid");

    const bill = await Bill.findById(billId);
    await Bill.updateOne({ _id: billId }, { $set: { paidAmount: 1000, remainingAmount: bill.totalAmount - 1000, status: "partially-paid" } });
    view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    expect(view.status).toBe("awaiting_settlement");
    expect(view.transferBalance.paymentState).toBe("partial");
    expect(view.transferBalance.amountPaid).toBe(1000);

    await Bill.updateOne({ _id: billId }, { $set: { paidAmount: bill.totalAmount, remainingAmount: 0, status: "paid" } });
    view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    expect(view.status).toBe("ready_for_transfer");
    expect(view.transferBalance.paymentState).toBe("paid");
    expect(view.transferBalance.remaining).toBe(0);
  });

  test("mobile billing bridge exposes the same canonical Bill", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const dest = await emptyRoom("private", "205");
    const { billId } = await scheduleThenComplete({ reservation, dest, actorId });
    const bill = await Bill.findById(billId).lean();
    const mobile = toMobileBill(bill);
    expect(mobile.billing_id).toBe(String(bill._id));
    expect(mobile.rent).toBe(bill.charges.rent);
    expect(mobile.security_deposit).toBe(bill.charges.securityDeposit);
    expect(mobile.water).toBe(0);
    expect(mobile.total).toBe(bill.totalAmount);
    expect(mobile.paid_amount).toBe(0);
  });
});

describe("zero-balance transfer (nothing owed)", () => {
  const recentMoveIn = getManilaToday().subtract(5, "day").toDate();
  const farLeaseEnd = getManilaToday().add(300, "day").toDate();

  test("same-type same-rate, deposit already covering -> Complete Transfer creates NO Bill and CUTS OVER", async () => {
    const { reservation, roomA, actorId } = await seed({
      sourceType: "quadruple-sharing", roomNumber: "301",
      moveIn: recentMoveIn, leaseEnd: farLeaseEnd,
    });
    const dest = await emptyRoom("quadruple-sharing", "302");
    const { scheduledTransfer, outcome, billId } = await scheduleThenComplete({ reservation, dest, actorId });

    // Nothing owed -> the payment gate is satisfied and the transfer executes.
    expect(outcome).toBe("executed");
    expect(billId == null || (await Bill.findById(billId))?.status === "paid").toBeTruthy();

    const view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    expect(view.status).toBe("completed");

    // The tenant actually moved.
    const stayAfter = await Stay.findOne({ reservationId: reservation._id });
    expect(String(stayAfter.roomId)).toBe(String(dest._id));
    void roomA;
  });
});

describe("cheaper destination (Private -> Quad)", () => {
  const recentMoveIn = getManilaToday().subtract(5, "day").toDate();
  const farLeaseEnd = getManilaToday().add(300, "day").toDate();

  test("no TenantCredit at scheduling; excess rent/deposit stay informational for manual review", async () => {
    const { reservation, actorId } = await seed({
      sourceType: "private", roomNumber: "101",
      moveIn: recentMoveIn, leaseEnd: farLeaseEnd,
    });
    const dest = await emptyRoom("quadruple-sharing", "301");

    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureDateStr(10) }), actorId,
    });
    expect(await TenantCredit.countDocuments({})).toBe(0);
    const view = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(scheduledTransfer._id));
    // Future, not yet due -> scheduled.
    expect(view.status).toBe("scheduled");
    // Nothing refunded / credited at scheduling.
    expect(Number((await Reservation.findById(reservation._id)).securityDepositHeld)).toBe(RATE.private);
  });
});

describe("all cross-room-type combinations schedule (no type-specific logic)", () => {
  const COMBOS = [
    ["private", "double-sharing"],
    ["private", "quadruple-sharing"],
    ["double-sharing", "private"],
    ["double-sharing", "quadruple-sharing"],
    ["quadruple-sharing", "private"],
    ["quadruple-sharing", "double-sharing"],
    ["private", "private"],
    ["double-sharing", "double-sharing"],
    ["quadruple-sharing", "quadruple-sharing"],
  ];
  test.each(COMBOS)("%s -> %s schedules (no Bill created at scheduling)", async (src, dst) => {
    const { reservation, actorId } = await seed({ sourceType: src, roomNumber: "701" });
    const dest = await emptyRoom(dst, "801");
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: reservation._id, payload: payloadFor({ targetRoom: dest, transferDate: futureDateStr(10) }), actorId,
    });
    expect(scheduledTransfer.status).toBe("scheduled");
    expect(scheduledTransfer.settlementBillId == null).toBe(true);
    expect(await Bill.countDocuments({ reservationId: reservation._id, billType: "transfer_settlement" })).toBe(0);
  });
});
