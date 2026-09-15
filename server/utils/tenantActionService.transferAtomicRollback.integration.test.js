/**
 * ============================================================================
 * PHASE 7 — ATOMIC CUTOVER: EVERY DOMAIN ROLLS BACK TOGETHER
 * ============================================================================
 * transferCutoverRollback.integration.test.js already proves the PHYSICAL
 * mutations (Stay room/bed, Room occupancy x2, BedHistory, settlement Bill
 * count) revert on a forced Contract-cutover failure.
 *
 * This file proves the CROSS-DOMAIN financial/utility state reverts with them
 * in the SAME rollback — for a Private -> Quadruple transfer where a
 * successful run WOULD create a rent TenantCredit, source/destination
 * electricity cutoff readings, a security-deposit ledger entry, and a
 * destination recurring rate. After the forced failure, NONE of them exist.
 *
 * activateRoomTransferSuccessorDraft is module-mocked to throw AFTER all
 * physical + financial writes are staged in the transaction.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

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

const mockValidate = jest.fn(async () => ({
  valid: true, missingFields: [], errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));
const realContractService = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const mockActivateDraft = jest.fn(async () => {
  throw Object.assign(new Error("forced cutover failure"), { code: "FORCED_TEST_FAILURE", statusCode: 500 });
});
await jest.unstable_mockModule("../services/contractRoomTransferActivationService.js", () => ({
  activateRoomTransferSuccessor: jest.fn(),
  activateRoomTransferSuccessorDraft: mockActivateDraft,
  resolveRoomTransferSuccessor: async ({ predecessorContractId, session = null }) => {
    const { Contract } = await import("../models/index.js");
    const { ABANDONED_TRANSFER_SUCCESSOR_STATUSES } = await import("../services/contractService.js");
    const rows = await Contract.find({
      replacesContractId: predecessorContractId, contractPurpose: { $in: ["amendment", "replacement"] },
      status: { $nin: [...ABANDONED_TRANSFER_SUCCESSOR_STATUSES] },
    }).session(session);
    if (rows.length !== 1) throw Object.assign(new Error("unexpected successor count"), { code: "TEST_SETUP_ERROR" });
    return rows[0];
  },
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit, UtilityReading } =
  await import("../models/index.js");

jest.setTimeout(180_000);

const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const LEASE_END = new Date("2027-01-31T00:00:00.000Z");
const TRANSFER_DATE = "2026-08-15T00:00:00.000Z";

describe("Phase 7 — forced cutover failure reverts every domain together", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "phase7_rollback" });
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-08-15T10:00:00.000+08:00"), doNotFake: ["nextTick", "setImmediate", "setInterval", "setTimeout", "clearInterval", "clearTimeout", "queueMicrotask"] });
    mockActivateDraft.mockClear();
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
      Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
      UtilityReading.deleteMany({}),
    ]);
    await BusinessSettings.create({
      key: "global",
      officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
      isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    });
  });

  afterEach(() => { jest.useRealTimers(); });

  test("Private(13500) -> Quadruple(5400): rollback leaves NO credit, NO cutoff readings, NO deposit ledger entry, NO destination rate, tenant fully in the source room", async () => {
    const tenant = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
      username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "P7", lastName: "RB", role: "tenant", tenantStatus: "active",
    });
    const roomA = await Room.create({
      name: "RA", roomNumber: "301", branch: "gil-puyat", type: "private",
      capacity: 1, currentOccupancy: 1, price: 13500, beds: [],
    });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6, reservationFeeAmount: 2000,
      preferredRoomType: "private", agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: 13500, monthlyRent: 13500, selectedBed: { id: "" }, moveInDate: MOVE_IN, securityDepositHeld: 13500,
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat", roomId: roomA._id,
      bedId: `room-${roomA._id}`, leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: 13500, status: "active",
    });
    const actorId = new mongoose.Types.ObjectId();
    const num = await generateContractNumber("gil-puyat", new Date());
    const predecessor = await Contract.create({
      ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
      reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: "gil-puyat",
      propertyName: "Lilycrest", propertyAddress: "123", roomNumber: "301", roomType: "private",
      leaseType: "long_term", approvedMonthlyRate: 13500, securityDepositAmount: 13500,
      leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 6, status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }], createdBy: actorId, updatedBy: actorId,
    });
    const roomB = await Room.create({
      name: "RB", roomNumber: "402", branch: "gil-puyat", type: "quadruple-sharing", capacity: 4,
      currentOccupancy: 0, price: 5400,
      beds: [
        { id: "rb-b1", position: "lower", status: "available" },
        { id: "rb-b2", position: "upper", status: "available" },
        { id: "rb-b3", position: "lower", status: "available" },
        { id: "rb-b4", position: "upper", status: "available" },
      ],
    });
    // source electricity baseline so the estimate path is reachable
    await UtilityReading.create({
      utilityType: "electricity", roomId: roomA._id, branch: "gil-puyat",
      reading: 1000, date: MOVE_IN, eventType: "periodStart", recordedBy: actorId, activeTenantIds: [],
    });

    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "rb-b1",
        effectiveTransferDate: TRANSFER_DATE, forceOverride: true,
        sourceRoomMeterReading: 1200, targetRoomMeterReading: 5000,
      },
      actorId,
    })).rejects.toMatchObject({ code: "FORCED_TEST_FAILURE" });

    expect(mockActivateDraft).toHaveBeenCalledTimes(1); // the failure was reached AFTER staging

    const [rRes, rStay, rRoomA, rRoomB, rPred, rSucc, bills, credits, readings, transferredBH, activeBH, currentStayCount] =
      await Promise.all([
        Reservation.findById(reservation._id),
        Stay.findById(stay._id),
        Room.findById(roomA._id),
        Room.findById(roomB._id),
        Contract.findById(predecessor._id),
        Contract.findOne({ replacesContractId: predecessor._id, contractPurpose: { $in: ["amendment", "replacement"] } }),
        Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
        TenantCredit.find({ userId: tenant._id }),
        UtilityReading.find({ reservationId: reservation._id, utilityType: "electricity", eventType: { $in: ["moveIn", "moveOut"] } }),
        BedHistory.find({ reservationId: reservation._id, status: "transferred" }),
        BedHistory.find({ reservationId: reservation._id, status: "active" }),
        Stay.countDocuments({ reservationId: reservation._id, status: { $in: ["active", "ending_soon"] } }),
      ]);

    // ── OCCUPANCY: entirely source ─────────────────────────────────────
    expect(String(rRes.roomId)).toBe(String(roomA._id));
    expect(String(rStay.roomId)).toBe(String(roomA._id));
    expect(rStay.bedId).toBe(`room-${roomA._id}`);
    expect(rRoomA.currentOccupancy).toBe(1);
    expect(rRoomB.currentOccupancy).toBe(0);
    expect(rRoomB.beds.find((b) => b.id === "rb-b1").status).toBe("available");
    expect(currentStayCount).toBe(1);

    // ── RENT: no destination rate applied ─────────────────────────────
    expect(rRes.recurringRentRate == null).toBe(true);
    expect(rStay.monthlyRent).toBe(13500); // source rate, unchanged

    // ── FINANCIAL: nothing created ───────────────────────────────────
    expect(bills).toHaveLength(0);
    expect(credits).toHaveLength(0);
    const transferLedger = (rRes.securityDepositLedger || [])
      .filter((e) => e.transferReference && String(e.transferReference) === String(predecessor._id));
    expect(transferLedger).toHaveLength(0);
    expect(rRes.securityDepositHeld).toBe(13500); // unchanged

    // ── UTILITIES: no persisted cutoff readings ──────────────────────
    expect(readings).toHaveLength(0);

    // ── HISTORY: no BedHistory transition ───────────────────────────
    expect(transferredBH).toHaveLength(0);
    expect(activeBH.every((b) => String(b.roomId) === String(roomA._id))).toBe(true);

    // ── CONTRACT: predecessor still current; successor Draft still not current
    expect(rPred.status).toBe("active");
    expect(rPred.isCurrent).toBe(true);
    expect(rSucc.status).toBe("generated");
    expect(rSucc.isCurrent).toBe(false);
    // predecessor lease dates untouched
    expect(new Date(rPred.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(rPred.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
  });
});
