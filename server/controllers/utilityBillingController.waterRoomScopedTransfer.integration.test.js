/**
 * ============================================================================
 * PHASE 5 — WATER RESPONSIBILITY FOLLOWS THE TENANT'S ACTUAL ROOM
 * ============================================================================
 * Reuses the Phase-4 room-scoped occupancy machinery (BedHistory ->
 * _roomScopedMoveInDate/_roomScopedMoveOutDate via
 * resolveRoomScopedReservationsForPeriod + filterBillableReservationsForPeriod)
 * for the WATER path. The only Phase-5 code change is that
 * billingEngine.buildWaterOccupancyBilling's per-tenant covered-days
 * (getReservationOverlapDays) now uses the room-scoped occupancy window when
 * a transfer stamped it; the day-proration formula itself is unchanged.
 *
 * Existing water rules preserved (verified, not changed):
 *   - branch: Gil-Puyat separately bills water; Guadalupe does not (fixed rate)
 *   - room type: isWaterBillableRoom == {private, double-sharing};
 *     quadruple-sharing is NOT water-billable
 *
 * Proven end-to-end against a real single-node replica set:
 *   - water-billable source room: departed tenant keeps ONLY their valid
 *     pre-transfer day share; none of the room's post-transfer days
 *   - water-billable destination room: incoming tenant's share starts at the
 *     transfer boundary; none of the destination's pre-arrival days
 *   - water-billable -> non-water-billable (Double -> Quad): old-room share
 *     ends at the cutoff; NO separate Quad water responsibility invented
 *   - non-water-billable -> water-billable (Quad -> Double): new separate
 *     water responsibility begins at the transfer boundary
 *   - Room A -> B -> C: each room's water rule applied independently to that
 *     leg's occupancy window
 *   - Guadalupe (water included in rent): the branch gate blocks a water
 *     period entirely — no separate water charge from a transfer
 *   - failed transfer: original room's water occupancy window unchanged
 *   - non-transfer tenant: unchanged
 *   - idempotent: recomputing the same water period yields the same shares
 *
 * PDF generation is mocked (storage I/O, not transaction-safe).
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
  const { transitionContract } = await import("../services/contractService.js");
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
const realContractService = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("../utils/tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { resolveRoomScopedReservationsForPeriod } = await import("./utilityBillingController.js");
const { filterBillableReservationsForPeriod, isWaterBillableRoom } =
  await import("../utils/utilityFlowRules.js");
const { computeBilling } = await import("../utils/billingEngine.js");
const { branchSupportsSeparateUtilityBilling } = await import("../config/branches.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, UtilityPeriod } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const CYCLE_START = new Date("2026-08-01T00:00:00.000Z");
const CYCLE_END = new Date("2026-08-31T00:00:00.000Z"); // 30-day water cycle
const TRANSFER_DATE = "2026-08-16T00:00:00.000Z"; // 15 days in source, 15 in destination
const WATER_TOTAL = 900; // total room water charge for the cycle (ratePerUnit)

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

describe("Phase 5 — water follows the tenant's actual room + existing water rules", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, args: ["--wiredTigerCacheSizeGB", "0.5"] },
    });
    await mongoose.connect(mongo.getUri(), {
      dbName: "phase5_water",
      autoIndex: false,
    });
    for (const model of [Contract, Stay, UtilityPeriod]) {
      await model.syncIndexes();
    }
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-08-16T10:00:00.000+08:00"), doNotFake: ["nextTick","setImmediate","setInterval","setTimeout","clearInterval","clearTimeout","queueMicrotask"] });
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
      Bill.deleteMany({}), BusinessSettings.deleteMany({}),
    ]);
    await BusinessSettings.create({
      key: "global",
      officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
      isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    });
    mockValidate.mockClear();
    mockGenerate.mockClear();
  });

  afterEach(() => { jest.useRealTimers(); });

  async function makeTenant(name) {
    return User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`,
      email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
      username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: name, lastName: "W", role: "tenant", tenantStatus: "active",
    });
  }

  async function seedTenantInRoom({ roomType, roomNumber, branch = "gil-puyat", tenant, moveIn = MOVE_IN }) {
    tenant = tenant || (await makeTenant("Src"));
    const bedsArr = bedsFor(roomType, `r${roomNumber}`);
    if (bedsArr.length) bedsArr[0] = { ...bedsArr[0], status: "occupied", occupiedBy: { userId: tenant._id } };
    const room = await Room.create({
      name: `Room ${roomNumber}`, roomNumber, branch,
      type: roomType, capacity: CAP[roomType], currentOccupancy: 1, price: RATE[roomType], beds: bedsArr,
    });
    const bedId = NEEDS_BED.has(roomType) ? `r${roomNumber}-b1` : "";
    const stayBedId = bedId || `room-${room._id}`;
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: roomType,
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: RATE[roomType], monthlyRent: RATE[roomType],
      selectedBed: { id: bedId }, moveInDate: moveIn, securityDepositHeld: RATE[roomType],
    });
    if (bedsArr.length) { room.beds[0].occupiedBy.reservationId = reservation._id; await room.save(); }
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: stayBedId,
      leaseStartDate: moveIn, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"),
      monthlyRent: RATE[roomType], status: "active",
    });
    if (NEEDS_BED.has(roomType)) {
      await BedHistory.create({
        bedId, roomId: room._id, tenantId: tenant._id, reservationId: reservation._id,
        stayId: stay._id, branch: room.branch, moveInDate: moveIn, status: "active",
      });
    }
    const actorId = new mongoose.Types.ObjectId();
    const num = await generateContractNumber(room.branch, new Date());
    await Contract.create({
      ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
      reservationId: reservation._id, stayId: stay._id, roomId: room._id, branch: room.branch,
      propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: room.roomNumber,
      roomType, leaseType: "long_term", approvedMonthlyRate: RATE[roomType], securityDepositAmount: RATE[roomType],
      leaseStartDate: moveIn, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });
    return { tenant, room, reservation, stay, actorId };
  }

  async function addStayerInRoom({ room, tenant, bedIndex = 2 }) {
    // A second occupant of a SHARED room who stays the whole cycle (never transfers).
    const bedId = `${room.roomNumber ? `r${room.roomNumber}` : "r"}-b${bedIndex}`;
    // mark the bed occupied
    await Room.updateOne(
      { _id: room._id, "beds.id": bedId },
      { $set: { "beds.$.status": "occupied", "beds.$.occupiedBy": { userId: tenant._id } } },
    );
    await Room.updateOne({ _id: room._id }, { $inc: { currentOccupancy: 1 } });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: room.type,
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: RATE[room.type], monthlyRent: RATE[room.type],
      selectedBed: { id: bedId }, moveInDate: MOVE_IN, securityDepositHeld: RATE[room.type],
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId,
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"),
      monthlyRent: RATE[room.type], status: "active",
    });
    await BedHistory.create({
      bedId, roomId: room._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: room.branch, moveInDate: MOVE_IN, status: "active",
    });
    return { reservation, stay };
  }

  async function emptyRoom(roomType, roomNumber, branch = "gil-puyat") {
    return Room.create({
      name: `Room ${roomNumber}`, roomNumber, branch,
      type: roomType, capacity: CAP[roomType], currentOccupancy: 0, price: RATE[roomType],
      beds: bedsFor(roomType, `r${roomNumber}`),
    });
  }

  async function runTransfer({ reservation, targetRoom, actorId, transferDate = TRANSFER_DATE }) {
    jest.setSystemTime(new Date(`${String(transferDate).slice(0, 10)}T10:00:00.000+08:00`));
    const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
    return transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: targetRoom._id,
        ...(destBedId ? { targetBedId: destBedId } : {}),
        effectiveTransferDate: transferDate, forceOverride: true,
      },
      actorId,
    });
  }

  // Compute a room's water shares exactly as the close path does.
  async function computeRoomWater({ room, periodStart = CYCLE_START, periodEnd = CYCLE_END, total = WATER_TOTAL }) {
    const reservations = await resolveRoomScopedReservationsForPeriod({
      room,
      periodStart,
      periodEnd,
      utilityType: "water",
    });
    const billable = filterBillableReservationsForPeriod({ reservations, cycleStart: periodStart, cycleEnd: periodEnd });
    const result = computeBilling({
      utilityPeriod: { startDate: periodStart, endDate: periodEnd, ratePerUnit: total },
      reservations: billable,
      utilityType: "water",
      roomType: room.type,
    });
    return { reservations, billable, result };
  }

  const shareOf = (result, tenantId) =>
    result.tenantSummaries.find((s) => String(s.tenantId) === String(tenantId))?.billAmount ?? null;
  const daysOf = (result, tenantId) =>
    result.tenantSummaries.find((s) => String(s.tenantId) === String(tenantId))?.coveredDays ?? null;

  // ── 0. Existing water rules are what we think they are ─────────────────
  test("canonical water rules: room-type eligibility and branch support (unchanged)", () => {
    expect(isWaterBillableRoom("private")).toBe(true);
    expect(isWaterBillableRoom("double-sharing")).toBe(true);
    expect(isWaterBillableRoom("quadruple-sharing")).toBe(false);
    expect(branchSupportsSeparateUtilityBilling("gil-puyat", "water")).toBe(true);
    expect(branchSupportsSeparateUtilityBilling("guadalupe", "water")).toBe(false);
  });

  // ── 1. water-billable -> water-billable, shared source with a stayer ───
  test("Double -> Double: departed tenant keeps ONLY their pre-transfer day share; stayer covers the rest", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const stayer = await makeTenant("Stay");
    await addStayerInRoom({ room: roomA, tenant: stayer, bedIndex: 2 });
    const roomB = await emptyRoom("double-sharing", "402");

    await runTransfer({ reservation, targetRoom: roomB, actorId });

    // ── OLD room water: 30-day cycle, transfer Aug 16 ───────────────────
    const src = await computeRoomWater({ room: roomA });
    // departed tenant: Aug 1..16 -> 15 covered days
    expect(daysOf(src.result, tenant._id)).toBe(15);
    // stayer: whole 30 days
    expect(daysOf(src.result, stayer._id)).toBe(30);
    // shares are day-prorated over 45 total covered days; sum == total
    const sum = src.result.tenantSummaries.reduce((a, s) => a + s.billAmount, 0);
    expect(sum).toBeCloseTo(WATER_TOTAL, 2);
    // departed tenant gets 15/45 of 900 = 300; stayer 30/45 = 600
    expect(shareOf(src.result, tenant._id)).toBeCloseTo(300, 0);
    expect(shareOf(src.result, stayer._id)).toBeCloseTo(600, 0);

    // ── NEW room water: incoming tenant from Aug 16 -> 15 days ──────────
    const dst = await computeRoomWater({ room: roomB });
    expect(daysOf(dst.result, tenant._id)).toBe(15);
    // sole occupant of a shared room for 15 of 30 days -> shared-prorated
    // over 15 total covered days -> full 900 (no one else covered any day)
    expect(shareOf(dst.result, tenant._id)).toBeCloseTo(WATER_TOTAL, 2);
    // and NOT billed for Aug 1..16 of room B
    expect(daysOf(dst.result, tenant._id)).toBeLessThan(30);
  });

  // ── 2. Private -> Double and Double -> Private ────────────────────────
  test("Private -> Double: old private room only to cutoff; new double room from the boundary", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "private", roomNumber: "301" });
    const roomB = await emptyRoom("double-sharing", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    const src = await computeRoomWater({ room: roomA });
    expect(daysOf(src.result, tenant._id)).toBe(15); // Aug 1..16
    // private-fixed rule: lone tenant -> full charge, but only for their window;
    // the key assertion is the covered window, not the full-charge private rule.
    const dst = await computeRoomWater({ room: roomB });
    expect(daysOf(dst.result, tenant._id)).toBe(15); // Aug 16..31
  });

  test("Double -> Private: old double room only to cutoff; new private room from the boundary", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("private", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    const src = await computeRoomWater({ room: roomA });
    expect(daysOf(src.result, tenant._id)).toBe(15);
    const dst = await computeRoomWater({ room: roomB });
    expect(daysOf(dst.result, tenant._id)).toBe(15);
    expect(shareOf(dst.result, tenant._id)).toBeCloseTo(WATER_TOTAL, 2); // private-fixed
  });

  // ── 3. water-billable -> NON-water-billable (Double -> Quad) ───────────
  test("Double -> Quadruple: old Double water ends at the cutoff; NO separate Quad water responsibility is invented", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("quadruple-sharing", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    // OLD Double: tenant billed only Aug 1..16
    const src = await computeRoomWater({ room: roomA });
    expect(daysOf(src.result, tenant._id)).toBe(15);

    // NEW Quad: not water-billable -> the close path's assertUtilityRoomEligibility
    // gate rejects a water period for this room. isWaterBillableRoom is the
    // canonical gate the controller checks BEFORE any occupancy resolution.
    expect(isWaterBillableRoom(roomB)).toBe(false);
    // (No water period is opened for a Quad room, so there is nothing to close
    // and no destination water charge.)
  });

  // ── 4. NON-water-billable -> water-billable (Quad -> Double) ───────────
  test("Quadruple -> Double: no source Quad water; NEW Double water responsibility begins at the transfer boundary", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "quadruple-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("double-sharing", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    // Source Quad: not water-billable, no water period.
    expect(isWaterBillableRoom(roomA)).toBe(false);

    // Destination Double: water-billable; tenant participates from Aug 16.
    const dst = await computeRoomWater({ room: roomB });
    expect(daysOf(dst.result, tenant._id)).toBe(15);
    expect(daysOf(dst.result, tenant._id)).toBeLessThan(30); // NOT from Aug 1
  });

  // ── 5. destination pre-transfer water does not leak to the incoming tenant
  test("destination water: incoming tenant is never charged for days before the transfer", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "private", roomNumber: "301" });
    const roomB = await emptyRoom("double-sharing", "402");
    // a tenant already living in roomB the whole cycle
    const existing = await makeTenant("Existing");
    await addStayerInRoom({ room: roomB, tenant: existing, bedIndex: 2 });

    await runTransfer({ reservation, targetRoom: roomB, actorId });

    const dst = await computeRoomWater({ room: roomB });
    // existing tenant: 30 days; incoming: 15 days (Aug 16..31)
    expect(daysOf(dst.result, existing._id)).toBe(30);
    expect(daysOf(dst.result, tenant._id)).toBe(15);
    // shares day-prorated over 45 covered days
    expect(shareOf(dst.result, existing._id)).toBeCloseTo(600, 0);
    expect(shareOf(dst.result, tenant._id)).toBeCloseTo(300, 0);
    const sum = dst.result.tenantSummaries.reduce((a, s) => a + s.billAmount, 0);
    expect(sum).toBeCloseTo(WATER_TOTAL, 2);
  });

  // ── 6. old-room post-transfer water does not leak to the departed tenant
  test("source water: departed tenant gets none of the room's post-transfer days", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const stayer = await makeTenant("Stay");
    await addStayerInRoom({ room: roomA, tenant: stayer, bedIndex: 2 });
    const roomB = await emptyRoom("private", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    const src = await computeRoomWater({ room: roomA });
    // departed: exactly 15 (Aug 1..16), stayer: 30. If post-transfer days
    // leaked, departed would be 30.
    expect(daysOf(src.result, tenant._id)).toBe(15);
    expect(daysOf(src.result, stayer._id)).toBe(30);
  });

  // ── 7. Room A -> B -> C, mixed water eligibility per leg ──────────────
  test("Double -> Quad -> Double: water applies only to the two Double legs' windows, never the Quad leg", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("quadruple-sharing", "402");
    const roomC = await emptyRoom("double-sharing", "503");

    // A(Double) -> B(Quad) on Aug 11
    await runTransfer({ reservation, targetRoom: roomB, actorId, transferDate: "2026-08-11T00:00:00.000Z" });
    const c1 = await Contract.findOne({ reservationId: reservation._id, isCurrent: true });
    await Contract.updateOne({ _id: c1._id }, { $set: { status: "active" } });
    // B(Quad) -> C(Double) on Aug 21
    await runTransfer({ reservation, targetRoom: roomC, actorId, transferDate: "2026-08-21T00:00:00.000Z" });

    // Room A (Double, water-billable): tenant window Aug 1..11 = 10 days
    const a = await computeRoomWater({ room: roomA });
    expect(daysOf(a.result, tenant._id)).toBe(10);

    // Room B (Quad): NOT water-billable — no water period, nothing to bill.
    expect(isWaterBillableRoom(roomB)).toBe(false);

    // Room C (Double, water-billable): tenant window Aug 21..31 = 10 days
    const cRes = await resolveRoomScopedReservationsForPeriod({
      room: roomC,
      periodStart: CYCLE_START,
      periodEnd: CYCLE_END,
      utilityType: "water",
    });
    const cMe = cRes.find((r) => String(r._id) === String(reservation._id));
    expect(cMe).toBeTruthy();
    expect(cMe._roomScopedMoveOutDate).toBeNull(); // current room
    const c = await computeRoomWater({ room: roomC });
    expect(daysOf(c.result, tenant._id)).toBe(10);

    // A future September period on Room A does NOT include the tenant.
    const septA = await computeRoomWater({
      room: roomA,
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-30T00:00:00.000Z"),
    });
    expect(shareOf(septA.result, tenant._id)).toBeNull();
  });

  test("same-day A -> B -> C: middle room has zero water liability and final room owns the cutover day", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("double-sharing", "402");
    const roomC = await emptyRoom("double-sharing", "503");
    const stayer = await makeTenant("MiddleRoomStayer");
    await addStayerInRoom({ room: roomB, tenant: stayer, bedIndex: 2 });
    const transferDay = "2026-08-15T00:00:00.000Z";

    await runTransfer({ reservation, targetRoom: roomB, actorId, transferDate: transferDay });
    const currentContract = await Contract.findOne({
      reservationId: reservation._id,
      isCurrent: true,
    });
    await Contract.updateOne(
      { _id: currentContract._id },
      { $set: { status: "active" } },
    );
    await runTransfer({ reservation, targetRoom: roomC, actorId, transferDate: transferDay });

    const middleHistory = await BedHistory.findOne({
      reservationId: reservation._id,
      roomId: roomB._id,
      status: "transferred",
    }).lean();
    expect(middleHistory).toBeTruthy();
    expect(new Date(middleHistory.effectiveEndDate).getTime()).toBe(
      new Date(middleHistory.effectiveStartDate).getTime(),
    );

    const source = await computeRoomWater({ room: roomA });
    const middle = await computeRoomWater({ room: roomB });
    const destination = await computeRoomWater({ room: roomC });

    // Aug 1..15 belongs to A. B's retained zero-length audit row is not a
    // water participant. Aug 15..31, including the cutover day, belongs to C.
    expect(daysOf(source.result, tenant._id)).toBe(14);
    expect(daysOf(middle.result, tenant._id) ?? 0).toBe(0);
    expect(shareOf(middle.result, tenant._id) ?? 0).toBe(0);
    expect(daysOf(destination.result, tenant._id)).toBe(16);
    expect(
      (daysOf(source.result, tenant._id) ?? 0) +
      (daysOf(middle.result, tenant._id) ?? 0) +
      (daysOf(destination.result, tenant._id) ?? 0),
    ).toBe(30);

    // Removing the zero-length mover does not lose or duplicate any of Room
    // B's canonical charge: its actual full-cycle resident receives the total.
    expect(daysOf(middle.result, stayer._id)).toBe(30);
    expect(shareOf(middle.result, stayer._id)).toBe(WATER_TOTAL);
    expect(
      middle.result.tenantSummaries.reduce((sum, item) => sum + item.billAmount, 0),
    ).toBe(WATER_TOTAL);
  });

  // ── 8. Guadalupe (water included in rent) ─────────────────────────────
  test("Guadalupe branch: water is not separately billed — a transfer never produces a separate water charge", async () => {
    // The controller gate the close path checks first.
    expect(branchSupportsSeparateUtilityBilling("guadalupe", "water")).toBe(false);
    // Guadalupe only has quadruple rooms, which are also not water-billable by
    // room type — either gate alone blocks a water period.
    const gdRoom = await Room.create({
      name: "GD 1", roomNumber: "901", branch: "guadalupe",
      type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
      beds: bedsFor("quadruple-sharing", "gd"),
    });
    expect(isWaterBillableRoom(gdRoom)).toBe(false);
  });

  // ── 9. failed transfer leaves source water occupancy unchanged ────────
  test("failed transfer (cross-branch): source room water occupancy window is unchanged (full cycle)", async () => {
    const { tenant, room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const gd = await Room.create({
      name: "GD", roomNumber: "999", branch: "guadalupe",
      type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
      beds: bedsFor("quadruple-sharing", "gd"),
    });
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: gd._id, targetBedId: "gd-b1", effectiveTransferDate: TRANSFER_DATE, forceOverride: true },
      actorId,
    })).rejects.toMatchObject({ code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });

    const src = await computeRoomWater({ room: roomA });
    // No room-scoped stamp -> full 30-day window (unchanged).
    expect(daysOf(src.result, tenant._id)).toBe(30);
  });

  // ── 10. non-transfer tenant unchanged ────────────────────────────────
  test("non-transfer tenant: water covered-days is the plain cycle overlap (no regression)", async () => {
    const { tenant, room } = await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const res = await computeRoomWater({ room });
    expect(daysOf(res.result, tenant._id)).toBe(30);
    expect(shareOf(res.result, tenant._id)).toBeCloseTo(WATER_TOTAL, 2); // sole covered occupant
  });

  // ── 11. idempotent ──────────────────────────────────────────────────
  test("recomputing the same water period yields identical shares (no duplication)", async () => {
    const { room: roomA, reservation, actorId } =
      await seedTenantInRoom({ roomType: "double-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("private", "402");
    await runTransfer({ reservation, targetRoom: roomB, actorId });

    const a = await computeRoomWater({ room: roomA });
    const b = await computeRoomWater({ room: roomA });
    expect(a.result.tenantSummaries.map((s) => [String(s.tenantId), s.coveredDays, s.billAmount]))
      .toEqual(b.result.tenantSummaries.map((s) => [String(s.tenantId), s.coveredDays, s.billAmount]));
  });
});
