/**
 * ============================================================================
 * TRANSFER — WATER (not finalized early)
 * ============================================================================
 *
 * WATER (Checkpoint-3-corrected):
 *   - `transfer_settlement.charges.water` is ALWAYS 0. Water cannot be
 *     finalized on transfer day (its period total + covered-day denominator
 *     are unknown until close).
 *   - The transferee is billed for their room-scoped occupancy days at the
 *     NORMAL water period close; the room's billed total == the canonical
 *     day-prorated total, with zero duplication.
 *
 *   Numeric example (gil-puyat double-sharing, water total ₱900, cycle
 *   Aug 1..Sep 1 = 31 days; A + B from the start; A transfers out Aug 16):
 *     A room-scoped days = Aug 1..16 (half-open) = 15
 *     B days             = Aug 1..Sep 1          = 31
 *     total covered days = 46
 *     A share = 900 × 15/46 = 293.48 ; B share = 900 × 31/46 = 606.52
 *     A + B = ₱900 = canonical room total ✅  (A billed ONCE, at close)
 *
 * (There is no office-hours restriction on scheduling or completing a
 * transfer — any date and time is allowed. This file previously also covered
 * an office-hours abort path that has since been removed.)
 * ============================================================================
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockGenerate = jest.fn(async ({ contractId, actorId, session = null }) => {
  const { Contract } = await import("../../models/index.js");
  const { transitionContract } = await import("../contractService.js");
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
await jest.unstable_mockModule("../contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realCS = await import("../contractService.js");
await jest.unstable_mockModule("../contractService.js", () => ({
  ...realCS,
  validateContractForGeneration: jest.fn(async () => ({
    valid: true, missingFields: [], errors: [], generationData: { pricing: {} },
    template: { templateId: "g", templateVersion: 1, legalContentVersion: 1 },
  })),
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("../../utils/tenantActionService.js");
const {
  seedCanonicalElectricityRoom,
  transferWithCanonicalUtilityFixture,
} = await import("../../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../contractService.js");
const { computeBilling } = await import("./billingEngine.js");
const { resolveRoomScopedReservationsForUtilityPeriod } =
  await import("./roomScopedUtilityParticipants.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  UtilityReading, UtilityPeriod, UtilityFinalization,
} = await import("../../models/index.js");

jest.setTimeout(240_000);
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");

async function seedBusinessSettings() {
  await BusinessSettings.deleteMany({});
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
  });
}

describe("Transfer — water (no early finalization) + office-hours completion gate", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "xfer_water_office" });
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
      Bill.deleteMany({}), UtilityReading.deleteMany({}), UtilityPeriod.deleteMany({}),
      UtilityFinalization.deleteMany({}), BusinessSettings.deleteMany({}),
    ]);
  });

  // ── WATER NUMERIC PROOF (engine level, no transfer needed) ────────────────
  test("water day-proration: room-scoped days for a transferred tenant sum to the canonical room total, zero duplication", () => {
    const A = new mongoose.Types.ObjectId();
    const B = new mongoose.Types.ObjectId();
    const cycleStart = MOVE_IN;
    const cycleEnd = new Date("2026-09-01T00:00:00.000Z");
    const transferBoundary = new Date("2026-08-16T00:00:00.000Z");

    const reservations = [
      // A transferred out of THIS room on Aug 16 — room-scoped window Aug 1..16.
      {
        _id: new mongoose.Types.ObjectId(), userId: { _id: A, firstName: "A" },
        _roomScopedMoveInDate: cycleStart, _roomScopedMoveOutDate: transferBoundary,
        status: "moveIn", selectedBed: { id: "b1" },
      },
      // B stays the whole cycle.
      {
        _id: new mongoose.Types.ObjectId(), userId: { _id: B, firstName: "B" },
        _roomScopedMoveInDate: cycleStart, _roomScopedMoveOutDate: null,
        status: "moveIn", selectedBed: { id: "b2" },
      },
    ];

    const utilityPeriod = {
      startDate: cycleStart, endDate: cycleEnd,
      ratePerUnit: 900, // for water, ratePerUnit IS the flat whole-cycle total
    };

    const result = computeBilling({
      utilityPeriod, reservations, utilityType: "water", roomType: "double-sharing",
    });

    const byTenant = Object.fromEntries(
      result.tenantSummaries.map((s) => [String(s.tenantId), s]),
    );
    // A: 15 days, B: 31 days, total 46.
    expect(byTenant[String(A)].coveredDays).toBeCloseTo(15, 0);
    expect(byTenant[String(B)].coveredDays).toBeCloseTo(31, 0);
    expect(round(byTenant[String(A)].billAmount)).toBeCloseTo(round(900 * 15 / 46), 0);
    expect(round(byTenant[String(B)].billAmount)).toBeCloseTo(round(900 * 31 / 46), 0);
    // INVARIANT: A + B == canonical room total, zero duplication.
    const sum = result.tenantSummaries.reduce((s, t) => s + Number(t.billAmount || 0), 0);
    expect(round(sum)).toBeCloseTo(900, 0);
  });

  // ── OFFICE HOURS: transferStayWorkflow aborts outside hours ───────────────
  async function seedSimple(branch = "gil-puyat") {
    const tenant = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${Date.now()}@ex.test`,
      username: `t_${Date.now()}`, firstName: "O", lastName: "H", role: "tenant", tenantStatus: "active",
    });
    const type = "double-sharing";
    const roomA = await Room.create({
      name: "R-1", roomNumber: "R1", branch, type, capacity: 2, currentOccupancy: 1, price: 8100,
      beds: [
        { id: "ra-b1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "ra-b2", position: "upper", status: "available" },
      ],
    });
    const roomB = await Room.create({
      name: "R-2", roomNumber: "R2", branch, type, capacity: 2, currentOccupancy: 0, price: 8100,
      beds: [
        { id: "rb-b1", position: "lower", status: "available" },
        { id: "rb-b2", position: "upper", status: "available" },
      ],
    });
    const res = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: type,
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: 8100, monthlyRent: 8100, selectedBed: { id: "ra-b1" }, moveInDate: MOVE_IN,
      securityDepositHeld: 8100,
    });
    roomA.beds[0].occupiedBy.reservationId = res._id;
    await roomA.save();
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: res._id, branch, roomId: roomA._id, bedId: "ra-b1",
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), monthlyRent: 8100, status: "active",
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
      propertyName: "L", propertyAddress: "x", roomNumber: "R1", roomType: type,
      leaseType: "long_term", approvedMonthlyRate: 8100, securityDepositAmount: 8100,
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "s" }],
      createdBy: actorId, updatedBy: actorId,
    });
    await seedCanonicalElectricityRoom({
      room: roomA,
      actorId,
      eventAt: "2026-08-16T00:00:00.000Z",
      tenantId: tenant._id,
      reservationId: res._id,
      moveInAt: MOVE_IN,
      maximumOpeningReading: 100,
    });
    return { res, roomA, roomB, actorId, tenant };
  }

  test("transferStayWorkflow proceeds regardless of the time of day (no office-hours gate)", async () => {
    await seedBusinessSettings();
    const { res, roomA, roomB, actorId, tenant } = await seedSimple();

    const result = await transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, {
      reservationId: res._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "rb-b1",
        effectiveTransferDate: "2026-08-16T00:00:00.000Z",
        sourceRoomMeterReading: 160, targetRoomMeterReading: 50, reason: "ok",
      },
      actorId,
    }, { destinationState: "never_initialized" });
    expect(result.cutoverAt).toBeInstanceOf(Date);
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(String(stay.roomId)).toBe(String(roomB._id));
    // Electricity finalized (sub-metered gil-puyat), water NOT on the Bill.
    const bill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(bill.charges.water).toBe(0);
    expect(Number(bill.charges.electricity)).toBeGreaterThan(0); // 60 kWh, sole occupant
    const destinationPeriods = await UtilityPeriod.find({ roomId: roomB._id, utilityType: "electricity", status: "open", isArchived: false });
    const destinationStart = await UtilityReading.findOne({ roomId: roomB._id, utilityType: "electricity", eventType: "periodStart", readingStatus: "locked" });
    const destinationMoveIn = await UtilityReading.findOne({ roomId: roomB._id, utilityType: "electricity", eventType: "moveIn", tenantId: tenant._id });
    expect(destinationPeriods).toHaveLength(1);
    expect(destinationStart).toMatchObject({ reading: 50 });
    expect(String(destinationStart.utilityPeriodId)).toBe(String(destinationPeriods[0]._id));
    expect(destinationMoveIn).toMatchObject({ reading: 50 });
    expect(String(destinationMoveIn.utilityPeriodId)).toBe(String(destinationPeriods[0]._id));
  });

  test("two same-day transfers retain the zero-length audit row but exclude it from utility participants", async () => {
    await seedBusinessSettings();
    const { res, roomB, actorId, tenant } = await seedSimple();
    // Keep explicit canonical electricity periods in place; this test isolates
    // water allocation through its assertions rather than corrupting utility state.
    const roomC = await Room.create({
      name: "R-3", roomNumber: "R3", branch: "gil-puyat",
      type: "double-sharing", capacity: 2, currentOccupancy: 0, price: 8100,
      beds: [
        { id: "rc-b1", position: "lower", status: "available" },
        { id: "rc-b2", position: "upper", status: "available" },
      ],
    });
    const transferDay = "2026-08-16T00:00:00.000Z";

    await transferStayWorkflow({
      reservationId: res._id,
      payload: {
        confirm: true, forceOverride: true,
        targetRoomId: roomB._id, targetBedId: "rb-b1",
        effectiveTransferDate: transferDay,
        sourceRoomMeterReading: 160, targetRoomMeterReading: 50,
      },
      actorId,
    });
    // A second physical cutover cannot bypass the canonical transfer-settlement
    // payment gate. Settle the first transfer's durable bill; this test is about
    // same-day water occupancy boundaries, not unpaid-settlement behavior.
    const firstSettlement = await Bill.findOne({
      reservationId: res._id,
      billType: "transfer_settlement",
      status: { $ne: "voided" },
    });
    firstSettlement.paidAmount = firstSettlement.totalAmount;
    firstSettlement.remainingAmount = 0;
    firstSettlement.status = "paid";
    await firstSettlement.save();
    await transferStayWorkflow({
      reservationId: res._id,
      payload: {
        confirm: true, forceOverride: true,
        targetRoomId: roomC._id, targetBedId: "rc-b1",
        effectiveTransferDate: transferDay,
        sourceRoomMeterReading: 50, targetRoomMeterReading: 20,
      },
      actorId,
    });

    const middle = await BedHistory.findOne({
      reservationId: res._id,
      roomId: roomB._id,
      status: "transferred",
    }).lean();
    expect(middle).toBeTruthy();
    expect(new Date(middle.effectiveStartDate).getTime()).toBe(
      new Date(middle.effectiveEndDate).getTime(),
    );

    const participants = await resolveRoomScopedReservationsForUtilityPeriod({
      room: roomB,
      periodStart: MOVE_IN,
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      utilityType: "water",
    });
    expect(
      participants.some((participant) =>
        String(participant.userId?._id || participant.userId) === String(tenant._id)),
    ).toBe(false);

    const electricityParticipants =
      await resolveRoomScopedReservationsForUtilityPeriod({
        room: roomB,
        periodStart: MOVE_IN,
        periodEnd: new Date("2026-09-01T00:00:00.000Z"),
        utilityType: "electricity",
      });
    expect(
      electricityParticipants.some((participant) =>
        String(participant.userId?._id || participant.userId) === String(tenant._id)),
    ).toBe(false);

    // The resolver filter is billing-only; transfer history remains available
    // for audit and still records the exact zero-length boundary.
    const retainedMiddle = await BedHistory.findById(middle._id).lean();
    expect(retainedMiddle).toBeTruthy();
    expect(new Date(retainedMiddle.effectiveStartDate).getTime()).toBe(
      new Date(retainedMiddle.effectiveEndDate).getTime(),
    );
  });
});
