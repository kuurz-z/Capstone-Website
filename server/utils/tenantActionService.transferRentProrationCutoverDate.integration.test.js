/**
 * ============================================================================
 * TRANSFER — RENT/DEPOSIT PRORATION FOLLOWS THE ACTUAL CUTOVER DAY
 * ============================================================================
 *
 * Round-4 rule: when a scheduled transfer is completed LATER than its
 * scheduled `effectiveTransferDate` (payment / office-hours delay), the
 * tenant occupied the OLD room through the ACTUAL physical cutover — so
 * rent/deposit proration, the billing cycle, the transfer_settlement Bill's
 * billingMonth, and the BedHistory day-boundary all follow the
 * transaction-local `cutoverAt` (≈ "today"), NOT the scheduled date.
 *
 * Electricity uses the exact `cutoverAt` timestamp; water uses
 * `normalizeDate(cutoverAt)`. The scheduled date is preserved untouched on
 * ScheduledRoomTransfer + scheduleHistory.
 *
 * These tests drive `transferStayWorkflow` directly with a PAST
 * `effectiveTransferDate` and assert every boundary aligns to "today"
 * (the real cutover), proving the scheduled date is not used as the billing
 * boundary.
 * ============================================================================
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockGenerate = jest.fn(async ({ contractId, actorId, session = null }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("../services/contractService.js");
  const c = await Contract.findById(contractId).session(session);
  c.preparedDocuments = c.preparedDocuments || [];
  c.preparedDocuments.push({
    documentType: "prepared", version: 1, storageProvider: "local", storageKey: "t/p.pdf",
    fileName: "p.pdf", fileHash: `h-${c._id}`, fileSize: 1, pageCount: 1, templateId: "g",
    templateVersion: "1", coordinateVersion: "1", generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  c.generatedFileHash = `h-${c._id}`; c.generatedVersion = 1;
  c.publicationStatus = "ready_for_resident"; c.tenantVisible = true;
  if (c.status === "ready_for_generation") await transitionContract(c, "generated", actorId, "t");
  else await c.save();
  return { contract: c, document: c.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("../services/contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realCS = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realCS,
  validateContractForGeneration: jest.fn(async () => ({
    valid: true, missingFields: [], errors: [], generationData: { pricing: {} },
    template: { templateId: "g", templateVersion: 1, legalContentVersion: 1 },
  })),
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { resolveCurrentBillingCycle } = await import("../services/billing/billingPolicy.js");
const { formatManilaDate } = await import("./dateUtils.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  UtilityReading, UtilityPeriod, UtilityFinalization,
} = await import("../models/index.js");

jest.setTimeout(240_000);
// Compare Manila calendar days — the transfer path normalises via server-local
// (Asia/Manila) start-of-day, so a UTC .toISOString() slice would be off by
// one when Manila is ahead of UTC.
const dayISO = (d) => formatManilaDate(d, "YYYY-MM-DD");

// Move-in far in the past so "today" is deep inside the lease, whatever the
// real clock is when the suite runs.
const MOVE_IN = new Date("2020-01-01T00:00:00.000Z");
const LEASE_END = new Date("2035-12-31T00:00:00.000Z");

async function seed(branch = "gil-puyat") {
  await BusinessSettings.deleteMany({});
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${Date.now()}@ex.test`,
    username: `t_${Date.now()}`, firstName: "R", lastName: "P", role: "tenant", tenantStatus: "active",
  });
  const type = "double-sharing";
  const roomA = await Room.create({
    name: "RA", roomNumber: "RA1", branch, type, capacity: 2, currentOccupancy: 1, price: 8100,
    beds: [
      { id: "ra-b1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
      { id: "ra-b2", position: "upper", status: "available" },
    ],
  });
  const roomB = await Room.create({
    name: "RB", roomNumber: "RB1", branch, type, capacity: 2, currentOccupancy: 0, price: 8100,
    beds: [
      { id: "rb-b1", position: "lower", status: "available" },
      { id: "rb-b2", position: "upper", status: "available" },
    ],
  });
  const res = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    reservationFeeAmount: 2000, preferredRoomType: type,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: 8100, monthlyRent: 8100, selectedBed: { id: "ra-b1" }, moveInDate: MOVE_IN,
    securityDepositHeld: 8100,
  });
  roomA.beds[0].occupiedBy.reservationId = res._id;
  await roomA.save();
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: res._id, branch, roomId: roomA._id, bedId: "ra-b1",
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: 8100, status: "active",
  });
  await BedHistory.create({
    bedId: "ra-b1", roomId: roomA._id, tenantId: tenant._id, reservationId: res._id, stayId: stay._id,
    branch, moveInDate: MOVE_IN, effectiveStartDate: MOVE_IN, status: "active",
  });
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber(branch, new Date());
  await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: res._id,
    reservationId: res._id, stayId: stay._id, roomId: roomA._id, branch,
    propertyName: "L", propertyAddress: "x", roomNumber: "RA1", roomType: type,
    leaseType: "long_term", approvedMonthlyRate: 8100, securityDepositAmount: 8100,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    statusHistory: [{ status: "active", changedBy: actorId, reason: "s" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, res, roomA, roomB, actorId };
}

async function runCutover({ res, roomB, actorId, scheduledDateISO }) {
  return transferStayWorkflow({
    reservationId: res._id,
    payload: {
      confirm: true, targetRoomId: roomB._id, targetBedId: "rb-b1",
      effectiveTransferDate: scheduledDateISO,   // PLANNING date only
      sourceRoomMeterReading: null, targetRoomMeterReading: null,
      reason: "rent-proration test",
    },
    actorId,
  });
}

describe("Transfer rent/deposit proration follows the ACTUAL cutover day", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "xfer_rent_cutover" });
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
      Bill.deleteMany({}), UtilityReading.deleteMany({}), UtilityPeriod.deleteMany({}),
      UtilityFinalization.deleteMany({}), BusinessSettings.deleteMany({}),
    ]);
  });

  test("scheduled = today, completed = today -> boundaries use today", async () => {
    const { res, roomB, actorId } = await seed();
    const todayISO = new Date().toISOString();
    const result = await runCutover({ res, roomB, actorId, scheduledDateISO: todayISO });

    const today = dayISO(new Date());
    expect(dayISO(result.cutoverAt)).toBe(today);

    const bill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(dayISO(bill.billingMonth)).toBe(today);
    expect(dayISO(bill.transferSnapshot.effectiveTransferDate)).toBe(today);

    const bh = await BedHistory.findOne({ reservationId: res._id, status: "transferred" }).lean();
    expect(dayISO(bh.effectiveEndDate)).toBe(today);
    const newBh = await BedHistory.findOne({ reservationId: res._id, status: "active" }).lean();
    expect(dayISO(newBh.moveInDate)).toBe(today);
  });

  test("scheduled = 30 days ago, completed = today -> ALL boundaries use today, NOT the scheduled date", async () => {
    const { res, roomB, actorId } = await seed();
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() - 30);
    scheduled.setHours(0, 0, 0, 0);
    const scheduledISO = scheduled.toISOString();

    const result = await runCutover({ res, roomB, actorId, scheduledDateISO: scheduledISO });

    const today = dayISO(new Date());
    expect(today).not.toBe(dayISO(scheduled));

    // cutoverAt is today, not the 30-day-old scheduled date.
    expect(dayISO(result.cutoverAt)).toBe(today);

    // transfer_settlement Bill billingMonth + snapshot use TODAY.
    const bill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(dayISO(bill.billingMonth)).toBe(today);
    expect(dayISO(bill.transferSnapshot.effectiveTransferDate)).toBe(today);
    expect(dayISO(bill.transferSnapshot.effectiveTransferDate)).not.toBe(dayISO(scheduled));

    // Rent settlement snapshot: source days are prorated through TODAY, so the
    // billing cycle used is the one containing TODAY (anchored on MOVE_IN),
    // NOT the cycle containing the 30-day-old scheduled date.
    const cycleForToday = resolveCurrentBillingCycle(MOVE_IN, new Date());
    const cycleForScheduled = resolveCurrentBillingCycle(MOVE_IN, scheduled);
    expect(dayISO(bill.transferSnapshot.cycleStart)).toBe(dayISO(cycleForToday.billingCycleStart));
    // Only assert divergence when the two dates actually fall in different cycles.
    if (dayISO(cycleForToday.billingCycleStart) !== dayISO(cycleForScheduled.billingCycleStart)) {
      expect(dayISO(bill.transferSnapshot.cycleStart)).not.toBe(dayISO(cycleForScheduled.billingCycleStart));
    }

    // BedHistory day-boundaries use TODAY.
    const bh = await BedHistory.findOne({ reservationId: res._id, status: "transferred" }).lean();
    expect(dayISO(bh.effectiveEndDate)).toBe(today);
    expect(dayISO(bh.effectiveEndDate)).not.toBe(dayISO(scheduled));
    const newBh = await BedHistory.findOne({ reservationId: res._id, status: "active" }).lean();
    expect(dayISO(newBh.moveInDate)).toBe(today);

    // Stay lease dates are NEVER mutated by a transfer.
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(dayISO(stay.leaseStartDate)).toBe(dayISO(MOVE_IN));
  });

  test("electricity moveOut/moveIn readings + water day-boundary + rent cycle + occupancy all align to the SAME cutover event", async () => {
    const { res, roomA, roomB, actorId, tenant } = await seed();
    // Give room A an open electricity period so a moveOut reading is written.
    const actorId2 = new mongoose.Types.ObjectId();
    const period = await UtilityPeriod.create({
      utilityType: "electricity", roomId: roomA._id, branch: "gil-puyat", startDate: MOVE_IN,
      startReading: 1000, ratePerUnit: 5, status: "open",
    });
    await UtilityReading.create({
      utilityType: "electricity", roomId: roomA._id, branch: "gil-puyat", reading: 1000, date: MOVE_IN,
      eventType: "periodStart", readingStatus: "locked", recordedBy: actorId2, utilityPeriodId: period._id,
    });
    await UtilityPeriod.create({
      utilityType: "electricity", roomId: roomB._id, branch: "gil-puyat", startDate: MOVE_IN,
      startReading: 500, ratePerUnit: 5, status: "open",
    });

    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() - 10);
    scheduled.setHours(0, 0, 0, 0);

    const result = await transferStayWorkflow({
      reservationId: res._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "rb-b1",
        effectiveTransferDate: scheduled.toISOString(),
        sourceRoomMeterReading: 1080, targetRoomMeterReading: 500,
        reason: "alignment test",
      },
      actorId,
    });

    const cutoverAt = result.cutoverAt;
    const today = dayISO(cutoverAt);

    // Electricity moveOut reading: EXACT cutoverAt timestamp.
    const moveOut = await UtilityReading.findOne({
      roomId: roomA._id, utilityType: "electricity", eventType: "moveOut", tenantId: tenant._id,
    }).lean();
    expect(new Date(moveOut.date).getTime()).toBe(cutoverAt.getTime());
    const moveIn = await UtilityReading.findOne({
      roomId: roomB._id, utilityType: "electricity", eventType: "moveIn", tenantId: tenant._id,
    }).lean();
    expect(new Date(moveIn.date).getTime()).toBe(cutoverAt.getTime());

    // Water day-boundary (BedHistory) = cutover DAY.
    const bh = await BedHistory.findOne({ reservationId: res._id, status: "transferred" }).lean();
    expect(dayISO(bh.effectiveEndDate)).toBe(today);

    // Rent cycle (transfer_settlement Bill) = cutover DAY's cycle.
    const bill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(dayISO(bill.billingMonth)).toBe(today);

    // Occupancy mutated at the cutover: source down, dest up.
    const rA = await Room.findById(roomA._id).lean();
    const rB = await Room.findById(roomB._id).lean();
    expect(rA.currentOccupancy).toBe(0);
    expect(rB.currentOccupancy).toBe(1);

    // UtilityFinalization.throughDate = cutoverAt; period linkage matches.
    const fin = await UtilityFinalization.findOne({ reservationId: res._id, utilityType: "electricity" }).lean();
    expect(new Date(fin.throughDate).getTime()).toBe(cutoverAt.getTime());
    expect(String(fin.utilityPeriodId)).toBe(String(period._id));
  });
});
