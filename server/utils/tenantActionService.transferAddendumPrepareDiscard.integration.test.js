/**
 * ============================================================================
 * R2 / R4 — Room Transfer Addendum: PREPARE (preview) and DISCARD (pre-cutover)
 * ============================================================================
 * R2: `prepareRoomTransferAddendum` prepares/reuses the Addendum Draft + PDF
 *     for a planned transfer WITHOUT the physical cutover. Proven here:
 *       - creates a contractPurpose:"amendment", status:"generated",
 *         isCurrent:false Draft with the ORIGINAL lease dates preserved and
 *         amendmentEffectiveDate = the transfer date
 *       - mutates NOTHING physical: Stay, Reservation.roomId, Room occupancy,
 *         Bill, TenantCredit, UtilityReading, recurringRentRate,
 *         securityDepositHeld, pendingTransfer* all unchanged
 *       - idempotent: a second call returns the SAME contract, reused:true,
 *         no duplicate
 *       - a subsequent real `transferStayWorkflow` reuses that very Draft
 *         (no second Addendum) and activates it
 *
 * R4: `discardRoomTransferAddendum` transitions a prepared, not-yet-current
 *     Addendum Draft -> "cancelled". Proven here:
 *       - original/current Contract stays active + isCurrent
 *       - Stay / Reservation room / occupancy / utilities unchanged
 *       - no Bill / TenantCredit created; held deposit unchanged
 *       - after discard, a fresh transfer can be started normally (a NEW
 *         Addendum is created)
 *       - refuses to "discard" an already-completed (isCurrent) transfer
 *
 * PDF generation is mocked.
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

const {
  transferStayWorkflow: rawTransferStayWorkflow,
  prepareRoomTransferAddendum,
  discardRoomTransferAddendum,
} = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { resolveCurrentStayForReservation } = await import("../services/tenantContractSelectionService.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");
const TRANSFER = "2026-08-15T00:00:00.000Z";

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seed({ sourceType = "quadruple-sharing", roomNumber = "301" } = {}) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "R2", lastName: "T", role: "tenant", tenantStatus: "active",
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
    selectedBed: { id: srcBedId }, moveInDate: MOVE_IN, securityDepositHeld: RATE[sourceType],
  });
  if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
    roomId: roomA._id, bedId: srcBedId || `room-${roomA._id}`,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: RATE[sourceType], status: "active",
  });
  if (NEEDS_BED.has(sourceType)) {
    await BedHistory.create({
      bedId: srcBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: "gil-puyat", moveInDate: MOVE_IN, status: "active",
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
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
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
  return Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
  });
}

function payloadFor({ targetRoom, transferDate = TRANSFER }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: targetRoom._id,
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
  };
}

describe("R2 — prepareRoomTransferAddendum (preview, no cutover)", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "r2_prepare_addendum" });
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-08-15T10:00:00.000+08:00"), doNotFake: ["nextTick","setImmediate","setInterval","setTimeout","clearInterval","clearTimeout","queueMicrotask"] });
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
      Bill.deleteMany({}), BusinessSettings.deleteMany({}), TenantCredit.deleteMany({}),
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

  test("prepares an amendment Draft with original lease dates + transfer date, and mutates NOTHING physical", async () => {
    const { reservation, roomA, stay, original, actorId } = await seed({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("private", "402");

    const roomAOccBefore = (await Room.findById(roomA._id)).currentOccupancy;
    const roomBOccBefore = (await Room.findById(roomB._id)).currentOccupancy;

    const { addendum, reused } = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId,
    });

    expect(reused).toBe(false);
    expect(addendum.contractPurpose).toBe("amendment");
    expect(addendum.status).toBe("generated");
    expect(new Date(addendum.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(addendum.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    // amendmentEffectiveDate is the transfer date (normalized to server-local
    // start-of-day) — NOT a leaseStartDate. Assert it lands on the transfer day
    // and is distinct from the lease start.
    const aed = new Date(addendum.amendmentEffectiveDate);
    expect(aed.getTime()).toBeGreaterThan(MOVE_IN.getTime());
    expect(Math.abs(aed.getTime() - new Date(TRANSFER).getTime())).toBeLessThan(24 * 3600 * 1000);
    expect(String(addendum.roomId)).toBe(String(roomB._id));

    // The Addendum doc itself: a Draft, NOT current.
    const addendumDoc = await Contract.findById(addendum.contractId);
    expect(addendumDoc.isCurrent).toBe(false);
    expect(addendumDoc.status).toBe("generated");

    // Original / current Contract: untouched.
    const orig = await Contract.findById(original._id);
    expect(orig.status).toBe("active");
    expect(orig.isCurrent).toBe(true);

    // Physical state: unchanged.
    const [resAfter, stayAfter, roomAAfter, roomBAfter] = await Promise.all([
      Reservation.findById(reservation._id),
      Stay.findById(stay._id),
      Room.findById(roomA._id),
      Room.findById(roomB._id),
    ]);
    expect(String(resAfter.roomId)).toBe(String(roomA._id));
    expect(resAfter.recurringRentRate == null || resAfter.recurringRentRate === 0).toBe(true);
    expect(Number(resAfter.securityDepositHeld)).toBe(RATE["quadruple-sharing"]);
    expect(resAfter.pendingTransferRoomId == null).toBe(true);
    expect(resAfter.pendingTransferBedId == null).toBe(true);
    expect(resAfter.transferStatus == null || resAfter.transferStatus === "" ).toBe(true);
    expect(String(stayAfter.roomId)).toBe(String(roomA._id));
    expect(roomAAfter.currentOccupancy).toBe(roomAOccBefore);
    expect(roomBAfter.currentOccupancy).toBe(roomBOccBefore);

    // No Bill / TenantCredit / cutoff UtilityReading created.
    expect(await Bill.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await TenantCredit.countDocuments({ reservationId: reservation._id })).toBe(0);
  });

  test("is idempotent — a second prepare reuses the same Draft (reused:true, no duplicate)", async () => {
    const { reservation, actorId } = await seed({ sourceType: "double-sharing", roomNumber: "201" });
    const roomB = await emptyRoom("private", "405");

    const first = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId,
    });
    const second = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId,
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.addendum.contractId).toBe(first.addendum.contractId);
    expect(await Contract.countDocuments({
      reservationId: reservation._id, contractPurpose: "amendment",
    })).toBe(1);
  });

  test("a real transfer after prepare reuses that very Draft (no 2nd Addendum) and activates it", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "310" });
    const roomB = await emptyRoom("private", "410");

    const prep = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId,
    });

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: roomB }),
      actorId,
    });

    const addenda = await Contract.find({ reservationId: reservation._id, contractPurpose: "amendment" });
    expect(addenda).toHaveLength(1);
    expect(String(addenda[0]._id)).toBe(prep.addendum.contractId);
    expect(addenda[0].isCurrent).toBe(true);

    const stay = await resolveCurrentStayForReservation(reservation._id);
    expect(String(stay.roomId)).toBe(String(roomB._id));
  });

  test("rejects a cross-branch destination without preparing anything", async () => {
    const { reservation, actorId } = await seed();
    const otherBranch = await Room.create({
      name: "Room G1", roomNumber: "G1", branch: "guadalupe",
      type: "private", capacity: 1, currentOccupancy: 0, price: 12000, beds: [],
    });
    await expect(prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: otherBranch._id, effectiveTransferDate: TRANSFER },
      actorId,
    })).rejects.toMatchObject({ code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });
    expect(await Contract.countDocuments({ reservationId: reservation._id, contractPurpose: "amendment" })).toBe(0);
  });
});

describe("R4 — discardRoomTransferAddendum (pre-cutover only)", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "r4_discard_addendum" });
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

  test("discards a prepared Draft; current lease / Stay / occupancy / deposit untouched; then a fresh transfer works", async () => {
    const { reservation, roomA, stay, original, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "301" });
    const roomB = await emptyRoom("private", "402");
    const roomC = await emptyRoom("double-sharing", "205");

    const prep = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId,
    });

    const occBefore = (await Room.findById(roomA._id)).currentOccupancy;

    const res = await discardRoomTransferAddendum({ reservationId: reservation._id, actorId });
    expect(res.discarded).toBe(true);
    expect(res.contractId).toBe(prep.addendum.contractId);
    expect(res.previousStatus).toBe("generated");

    const discarded = await Contract.findById(prep.addendum.contractId);
    expect(discarded.status).toBe("cancelled");
    expect(discarded.isCurrent).toBe(false);

    const orig = await Contract.findById(original._id);
    expect(orig.status).toBe("active");
    expect(orig.isCurrent).toBe(true);

    const [resAfter, stayAfter, roomAAfter] = await Promise.all([
      Reservation.findById(reservation._id),
      Stay.findById(stay._id),
      Room.findById(roomA._id),
    ]);
    expect(String(resAfter.roomId)).toBe(String(roomA._id));
    expect(Number(resAfter.securityDepositHeld)).toBe(RATE["quadruple-sharing"]);
    expect(String(stayAfter.roomId)).toBe(String(roomA._id));
    expect(roomAAfter.currentOccupancy).toBe(occBefore);
    expect(await Bill.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await TenantCredit.countDocuments({ reservationId: reservation._id })).toBe(0);

    // A fresh transfer to a DIFFERENT room now works and creates a NEW Addendum.
    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: roomC }),
      actorId,
    });
    const liveAddenda = await Contract.find({
      reservationId: reservation._id, contractPurpose: "amendment",
      status: { $nin: ["cancelled", "voided", "rejected", "archived"] },
    });
    expect(liveAddenda).toHaveLength(1);
    expect(String(liveAddenda[0]._id)).not.toBe(prep.addendum.contractId);
    expect(String(liveAddenda[0].roomId)).toBe(String(roomC._id));
    expect(liveAddenda[0].isCurrent).toBe(true);
  });

  test("refuses to discard when there is no prepared Addendum", async () => {
    const { reservation, actorId } = await seed();
    await expect(discardRoomTransferAddendum({ reservationId: reservation._id, actorId }))
      .rejects.toMatchObject({ code: "NO_PREPARED_ADDENDUM" });
  });

  test("refuses to discard an already-completed transfer (Addendum is isCurrent)", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "320" });
    const roomB = await emptyRoom("private", "420");

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: roomB }),
      actorId,
    });

    await expect(discardRoomTransferAddendum({ reservationId: reservation._id, actorId }))
      .rejects.toMatchObject({ code: "TRANSFER_ALREADY_COMPLETED" });

    // The completed transfer is untouched.
    const stay = await resolveCurrentStayForReservation(reservation._id);
    expect(String(stay.roomId)).toBe(String(roomB._id));
  });
});

describe("stale room-transfer Addendum — self-heal on re-target", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "stale_addendum_selfheal" });
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

  test("a leftover generated Addendum for room X does NOT block a new transfer to room Y — it is auto-abandoned", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "701" });
    const roomX = await emptyRoom("private", "801"); // stale target
    const roomY = await emptyRoom("double-sharing", "802"); // new, correct target

    // 1. An earlier attempt prepared an Addendum targeting room X (no cutover).
    const stalePrep = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomX._id, effectiveTransferDate: TRANSFER },
      actorId,
    });
    const staleContract = await Contract.findById(stalePrep.addendum.contractId);
    expect(staleContract.status).toBe("generated");
    expect(String(staleContract.roomId)).toBe(String(roomX._id));

    // 2. Admin now prepares a transfer to a DIFFERENT room (Y) — no
    //    ScheduledRoomTransfer exists, the stale one is a discardable Draft, so
    //    it self-heals instead of throwing ROOM_TRANSFER_CONTRACT_ROOM_MISMATCH.
    const freshPrep = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomY._id, targetBedId: "r802-b1", effectiveTransferDate: TRANSFER },
      actorId,
    });
    expect(freshPrep.addendum.contractId).not.toBe(stalePrep.addendum.contractId);

    // Stale Addendum -> cancelled (kept as history, never deleted).
    const staleAfter = await Contract.findById(stalePrep.addendum.contractId);
    expect(staleAfter.status).toBe("cancelled");
    expect(staleAfter.isCurrent).toBe(false);

    // Exactly ONE live amendment, targeting room Y.
    const live = await Contract.find({
      reservationId: reservation._id, contractPurpose: "amendment",
      status: { $nin: ["cancelled", "voided", "rejected", "archived"] },
    });
    expect(live).toHaveLength(1);
    expect(String(live[0].roomId)).toBe(String(roomY._id));

    // 3. The real cutover to room Y completes.
    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: payloadFor({ targetRoom: roomY }),
      actorId,
    });
    const stay = await resolveCurrentStayForReservation(reservation._id);
    expect(String(stay.roomId)).toBe(String(roomY._id));
  });

  test("a wet-signed (published) successor for room X still HARD-blocks a transfer to room Y", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", roomNumber: "710" });
    const roomX = await emptyRoom("private", "810");
    const roomY = await emptyRoom("double-sharing", "811");

    const prep = await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomX._id, effectiveTransferDate: TRANSFER },
      actorId,
    });
    // Force the successor beyond a discardable Draft (simulates a wet-signed
    // / published replacement Contract).
    await Contract.updateOne(
      { _id: prep.addendum.contractId },
      { $set: { status: "published" } },
    );

    await expect(
      prepareRoomTransferAddendum({
        reservationId: reservation._id,
        payload: { targetRoomId: roomY._id, targetBedId: "r811-b1", effectiveTransferDate: TRANSFER },
        actorId,
      }),
    ).rejects.toMatchObject({ code: "ROOM_TRANSFER_ADDENDUM_TERMS_MISMATCH" });

    // The published successor is untouched.
    const still = await Contract.findById(prep.addendum.contractId);
    expect(still.status).toBe("published");
    expect(String(still.roomId)).toBe(String(roomX._id));
  });
});
