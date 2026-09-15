/**
 * ============================================================================
 * TRANSFER-DAY ELECTRICITY FINALIZATION — RECONCILIATION INVARIANT
 * ============================================================================
 *
 * Proves the Checkpoint-3-corrected design:
 *
 *  1. The transferring tenant's source-room electricity is FINALIZED on the
 *     transfer_settlement Bill (charges.electricity), computed by the SAME
 *     canonical computeBilling engine (no second formula).
 *
 *  2. The transferee STAYS a full participant in the normal period-close
 *     allocation (their moveOut UtilityReading bounds their segments). A
 *     UtilityFinalization row only SUPPRESSES the duplicate draft Bill.
 *
 *  3. RECONCILIATION INVARIANT:
 *       Σ(normal draft-bill electricity for the period)
 *         + Σ(UtilityFinalization.settledAmount for the period)
 *       === period.computedTotalCost      (± ₱1 Hamilton-cent tolerance)
 *
 *  4. WATER is NOT finalized on transfer day — charges.water stays 0; the
 *     transferee is billed at the normal water period close for their
 *     room-scoped occupancy days, with the room total = canonical.
 *
 *  5. cutoverAt is a real timestamp captured INSIDE the workflow transaction
 *     (not the scheduled date), so two same-day transfers get distinct
 *     UtilityReading.date values and detectDuplicateTimestamps stays happy.
 *
 * Numeric worked example (in "quad, ₱5/kWh, A B C D from period start"):
 *   period start reading 1000, D's fresh closing 1080, period close 1200
 *   segment 1000..1080 = 80 kWh × ₱5 = ₱400 → A=100 B=100 C=100 D=100
 *   segment 1080..1200 = 120 kWh × ₱5 = ₱600 → A=200 B=200 C=200
 *   close tenantSummaries: A=300 B=300 C=300 D=100
 *   D finalized ₱100 on transfer day → NO close Bill for D
 *   Σ(close bills A+B+C) + Σ(finalized D) = 900 + 100 = 1000 = period total ✅
 * ============================================================================
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
  const { Contract } = await import("../../models/index.js");
  const { transitionContract } = await import("../contractService.js");
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
await jest.unstable_mockModule("../contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realContractService = await import("../contractService.js");
await jest.unstable_mockModule("../contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { transferStayWorkflow } = await import("../../utils/tenantActionService.js");
const { generateContractNumber } = await import("../contractService.js");
const { getManilaDayjs } = await import("../../utils/dateUtils.js");
const {
  computeTransfereeSourceElectricityLiability,
  validateTransferDestinationOpeningReading,
} = await import("./transferUtilityFinalization.js");
const {
  Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  UtilityReading, UtilityPeriod, UtilityFinalization,
} = await import("../../models/index.js");

jest.setTimeout(240_000);

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const RATE_PER_KWH = 5;

async function permissiveOfficeHours() {
  await BusinessSettings.deleteMany({});
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440,
    officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
}

/** Quad room, occupants A B C D from the period start. Returns the seed graph. */
async function seedQuadRoom() {
  const branch = "gil-puyat";
  const mkTenant = async (tag) =>
    User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`,
      email: `${tag}-${new mongoose.Types.ObjectId()}@ex.test`,
      username: `${tag}_${new mongoose.Types.ObjectId().toString().slice(-8)}`,
      firstName: tag, lastName: "T", role: "tenant", tenantStatus: "active",
    });
  const [A, B, C, D] = await Promise.all([mkTenant("A"), mkTenant("B"), mkTenant("C"), mkTenant("D")]);

  const beds = ["b1", "b2", "b3", "b4"].map((id, i) => ({
    id: `src-${id}`, position: i % 2 ? "upper" : "lower", status: "occupied",
    occupiedBy: { userId: [A, B, C, D][i]._id },
  }));
  const roomA = await Room.create({
    name: "Room 301", roomNumber: "301", branch, type: "quadruple-sharing",
    capacity: 4, currentOccupancy: 4, price: 5400, beds,
  });

  const actorId = new mongoose.Types.ObjectId();
  const reservations = {};
  const stays = {};
  const contracts = {};
  const map = { A, B, C, D };
  let bi = 0;
  for (const [tag, user] of Object.entries(map)) {
    const bedId = `src-b${bi + 1}`;
    const res = await Reservation.create({
      userId: user._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: 5400, monthlyRent: 5400, selectedBed: { id: bedId }, moveInDate: MOVE_IN,
      securityDepositHeld: 5400,
    });
    roomA.beds[bi].occupiedBy.reservationId = res._id;
    const stay = await Stay.create({
      tenantId: user._id, reservationId: res._id, branch, roomId: roomA._id, bedId,
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"),
      monthlyRent: 5400, status: "active",
    });
    await BedHistory.create({
      bedId, roomId: roomA._id, tenantId: user._id, reservationId: res._id, stayId: stay._id,
      branch, moveInDate: MOVE_IN, effectiveStartDate: MOVE_IN, status: "active",
    });
    const num = await generateContractNumber(branch, new Date());
    const c = await Contract.create({
      ...num, contractPurpose: "initial", tenantId: user._id, applicationId: res._id,
      reservationId: res._id, stayId: stay._id, roomId: roomA._id, branch,
      propertyName: "Lilycrest", propertyAddress: "123 Test", roomNumber: "301",
      roomType: "quadruple-sharing", leaseType: "long_term", approvedMonthlyRate: 5400,
      securityDepositAmount: 5400, leaseStartDate: MOVE_IN,
      leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });
    reservations[tag] = res; stays[tag] = stay; contracts[tag] = c;
    bi += 1;
  }
  await roomA.save();

  // Open electricity period for room A: baseline 1000 kWh, ₱5/kWh.
  const period = await UtilityPeriod.create({
    utilityType: "electricity", roomId: roomA._id, branch,
    startDate: MOVE_IN, startReading: 1000, ratePerUnit: RATE_PER_KWH, status: "open",
  });
  await UtilityReading.create({
    utilityType: "electricity", roomId: roomA._id, branch, reading: 1000, date: MOVE_IN,
    eventType: "periodStart", readingStatus: "locked", recordedBy: actorId, utilityPeriodId: period._id,
  });

  // Empty private room 205 as the transfer destination (guadalupe? no — same
  // branch, sub-metered). Private so no dest bed reading needed via workflow,
  // but the branch IS sub-metered so completeRoomTransfer would still ask for
  // it — here we call transferStayWorkflow directly and pass one.
  const roomB = await Room.create({
    name: "Room 205", roomNumber: "205", branch, type: "quadruple-sharing",
    capacity: 4, currentOccupancy: 0, price: 5400,
    beds: ["b1", "b2", "b3", "b4"].map((id, i) => ({ id: `dst-${id}`, position: i % 2 ? "upper" : "lower", status: "available" })),
  });
  await UtilityPeriod.create({
    utilityType: "electricity", roomId: roomB._id, branch,
    startDate: MOVE_IN, startReading: 500, ratePerUnit: RATE_PER_KWH, status: "open",
  });

  return { roomA, roomB, reservations, stays, contracts, actorId, period, users: map };
}

describe("Transfer-day electricity finalization + reconciliation invariant", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "xfer_elec_final" });
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
      UtilityFinalization.deleteMany({}),
    ]);
    await permissiveOfficeHours();
    mockValidate.mockClear();
    mockGenerate.mockClear();
  });

  test("read-only slice: D's finalized amount = their canonical share of [1000, 1080]", async () => {
    const { roomA, reservations, users } = await seedQuadRoom();
    const liab = await computeTransfereeSourceElectricityLiability({
      reservation: { _id: reservations.D._id, userId: users.D._id },
      sourceRoom: roomA,
      cutoverDate: new Date("2026-08-16T14:00:00.000Z"),
      freshSourceClosingReading: 1080,
    });
    expect(liab.applicable).toBe(true);
    // 80 kWh × ₱5 = ₱400 across A,B,C,D → ₱100 for D.
    expect(liab.kwh).toBeCloseTo(20, 2); // D's share of 80 kWh
    expect(liab.amount).toBeCloseTo(100, 2);
    expect(liab.baselineReading).toBe(1000);
    expect(liab.closingReading).toBe(1080);
    expect(liab.waterNote).toMatch(/water/i);
  });

  test("room-scoped move-in reading, not period start, is D's opening boundary", async () => {
    const { roomA, reservations, users, actorId } = await seedQuadRoom();
    const enteredRoomAt = new Date("2026-08-10T09:00:00.000Z");
    await BedHistory.updateOne(
      { reservationId: reservations.D._id, roomId: roomA._id },
      { $set: { moveInDate: enteredRoomAt, effectiveStartDate: enteredRoomAt } },
    );
    await UtilityReading.create({
      utilityType: "electricity",
      roomId: roomA._id,
      branch: roomA.branch,
      reading: 1075,
      date: enteredRoomAt,
      eventType: "moveIn",
      tenantId: users.D._id,
      recordedBy: actorId,
      readingStatus: "recorded",
    });

    const liability = await computeTransfereeSourceElectricityLiability({
      reservation: { _id: reservations.D._id, userId: users.D._id },
      sourceRoom: roomA,
      cutoverDate: new Date("2026-08-16T14:00:00.000Z"),
      freshSourceClosingReading: 1150,
    });

    // D participates only in 1075..1150, shared with A/B/C.
    expect(liability.kwh).toBeCloseTo(18.75, 2);
    expect(liability.amount).toBeCloseTo(93.75, 2);
  });

  test("former source-room occupants remain in pre-departure sharing segments", async () => {
    const { roomA, roomB, reservations, users, actorId } = await seedQuadRoom();
    const leftAt = new Date("2026-08-08T10:00:00.000Z");
    await BedHistory.updateOne(
      { reservationId: reservations.C._id, roomId: roomA._id },
      { $set: { status: "transferred", moveOutDate: leftAt, effectiveEndDate: leftAt } },
    );
    await Reservation.updateOne(
      { _id: reservations.C._id },
      { $set: { roomId: roomB._id } },
    );
    await UtilityReading.create({
      utilityType: "electricity",
      roomId: roomA._id,
      branch: roomA.branch,
      reading: 1040,
      date: leftAt,
      eventType: "moveOut",
      tenantId: users.C._id,
      recordedBy: actorId,
      readingStatus: "recorded",
    });

    const liability = await computeTransfereeSourceElectricityLiability({
      reservation: { _id: reservations.D._id, userId: users.D._id },
      sourceRoom: roomA,
      cutoverDate: new Date("2026-08-16T14:00:00.000Z"),
      freshSourceClosingReading: 1080,
    });

    // 1000..1040 / 4 + 1040..1080 / 3 = 23.33 kWh for D.
    expect(liability.kwh).toBeCloseTo(23.33, 2);
    expect(liability.amount).toBeCloseTo(116.66, 2);
  });

  test("missing source period and regressing destination opening require review", async () => {
    const { roomA, roomB, reservations, users, actorId } = await seedQuadRoom();
    await UtilityPeriod.deleteMany({ roomId: roomA._id, utilityType: "electricity" });
    await expect(computeTransfereeSourceElectricityLiability({
      reservation: { _id: reservations.D._id, userId: users.D._id },
      sourceRoom: roomA,
      cutoverDate: new Date("2026-08-16T14:00:00.000Z"),
      freshSourceClosingReading: 1080,
    })).rejects.toMatchObject({
      code: "ROOM_TRANSFER_SOURCE_ELECTRICITY_PERIOD_MISSING",
      manualReviewRequired: true,
    });

    await UtilityReading.create({
      utilityType: "electricity",
      roomId: roomB._id,
      branch: roomB.branch,
      reading: 550,
      date: new Date("2026-08-15T12:00:00.000Z"),
      eventType: "regularBilling",
      recordedBy: actorId,
      readingStatus: "recorded",
    });
    await expect(validateTransferDestinationOpeningReading({
      destinationRoom: roomB,
      cutoverDate: new Date("2026-08-16T14:00:00.000Z"),
      freshDestinationOpeningReading: 540,
    })).rejects.toMatchObject({
      code: "ROOM_TRANSFER_DESTINATION_READING_REGRESSION",
      manualReviewRequired: true,
    });
  });

  test("destination lifecycle blockers are typed for missing, closed-only, review, and outside-cutover states", async () => {
    const { roomB } = await seedQuadRoom();
    const cutoverDate = new Date("2026-08-16T14:00:00.000Z");
    const destinationPeriod = await UtilityPeriod.findOne({ roomId: roomB._id, utilityType: "electricity" });

    await destinationPeriod.deleteOne();
    await expect(validateTransferDestinationOpeningReading({
      destinationRoom: roomB, cutoverDate, freshDestinationOpeningReading: 500,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_DESTINATION_ELECTRICITY_PERIOD_MISSING" });

    destinationPeriod._id = new mongoose.Types.ObjectId();
    destinationPeriod.isNew = true;
    destinationPeriod.status = "closed";
    destinationPeriod.endDate = new Date("2026-08-10T00:00:00.000+08:00");
    destinationPeriod.endReading = 500;
    await destinationPeriod.save();
    await expect(validateTransferDestinationOpeningReading({
      destinationRoom: roomB, cutoverDate, freshDestinationOpeningReading: 500,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_DESTINATION_ELECTRICITY_PERIOD_CLOSED_ONLY" });

    destinationPeriod.status = "manual_review_required";
    destinationPeriod.endDate = null;
    destinationPeriod.endReading = null;
    destinationPeriod.manualReviewReason = "test";
    await destinationPeriod.save();
    await expect(validateTransferDestinationOpeningReading({
      destinationRoom: roomB, cutoverDate, freshDestinationOpeningReading: 500,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_DESTINATION_ELECTRICITY_PERIOD_REVIEW_REQUIRED" });

    destinationPeriod.status = "open";
    destinationPeriod.startDate = new Date("2026-09-01T00:00:00.000+08:00");
    await destinationPeriod.save();
    await expect(validateTransferDestinationOpeningReading({
      destinationRoom: roomB, cutoverDate, freshDestinationOpeningReading: 500,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_DESTINATION_ELECTRICITY_PERIOD_OUTSIDE_CUTOVER" });
  });

  test("a never-initialized destination is initialized inside the transfer transaction", async () => {
    const { roomA, roomB, reservations, stays, contracts, actorId } = await seedQuadRoom();
    await UtilityPeriod.deleteMany({ roomId: roomB._id, utilityType: "electricity" });
    const payload = {
      confirm: true, targetRoomId: roomB._id, targetBedId: "dst-b1",
      effectiveTransferDate: "2026-08-16T00:00:00.000Z",
      sourceRoomMeterReading: 1080, targetRoomMeterReading: 500, reason: "retry test",
      __scheduledTransferId: new mongoose.Types.ObjectId(),
    };

    const result = await transferStayWorkflow({ reservationId: reservations.D._id, payload, actorId });
    expect(result.cutoverAt).toBeInstanceOf(Date);
    expect(String((await Reservation.findById(reservations.D._id).lean()).roomId)).toBe(String(roomB._id));
    const destinationPeriod = await UtilityPeriod.findOne({
      roomId: roomB._id,
      utilityType: "electricity",
      status: "open",
    }).lean();
    expect(destinationPeriod.startReading).toBe(500);
    expect(destinationPeriod.startDate.getTime()).toBe(result.cutoverAt.getTime());
    const destinationBoundaries = await UtilityReading.find({
      utilityPeriodId: destinationPeriod._id,
    }).lean();
    expect(destinationBoundaries.map((entry) => entry.eventType).sort()).toEqual(["moveIn", "periodStart"]);
    expect(destinationBoundaries.every((entry) => entry.reading === 500)).toBe(true);
  });

  test.each([
    ["closed", "ROOM_TRANSFER_SOURCE_ELECTRICITY_PERIOD_CLOSED_ONLY"],
    ["manual_review_required", "ROOM_TRANSFER_SOURCE_ELECTRICITY_PERIOD_REVIEW_REQUIRED"],
  ])("source %s state remains a hard transfer blocker", async (status, code) => {
    const { roomA, reservations, users } = await seedQuadRoom();
    const sourcePeriod = await UtilityPeriod.findOne({
      roomId: roomA._id,
      utilityType: "electricity",
    });
    sourcePeriod.status = status;
    if (status === "closed") {
      sourcePeriod.endDate = new Date();
      sourcePeriod.endReading = 1080;
    } else {
      sourcePeriod.manualReviewReason = "test source review";
    }
    await sourcePeriod.save();

    await expect(computeTransfereeSourceElectricityLiability({
      reservation: { _id: reservations.D._id, userId: users.D._id },
      sourceRoom: roomA,
      cutoverDate: new Date(),
      freshSourceClosingReading: 1080,
    })).rejects.toMatchObject({ code, manualReviewRequired: true });
    expect(await UtilityPeriod.countDocuments({ roomId: roomA._id, status: "open" })).toBe(0);
  });

  test("a clean closed-only vacant destination opens at the transfer reading and records vacancy overhead", async () => {
    const { roomB, reservations, actorId } = await seedQuadRoom();
    const closedAt = new Date(Date.now() - 3 * 86_400_000);
    const destinationHistory = await UtilityPeriod.findOne({
      roomId: roomB._id,
      utilityType: "electricity",
    });
    destinationHistory.status = "closed";
    destinationHistory.endDate = closedAt;
    destinationHistory.endReading = 1000;
    destinationHistory.closedAt = closedAt;
    destinationHistory.closedBy = actorId;
    await destinationHistory.save();
    await UtilityReading.create({
      utilityType: "electricity",
      roomId: roomB._id,
      branch: roomB.branch,
      reading: 1000,
      date: closedAt,
      eventType: "periodEnd",
      readingStatus: "locked",
      recordedBy: actorId,
      utilityPeriodId: destinationHistory._id,
    });

    const result = await transferStayWorkflow({
      reservationId: reservations.D._id,
      payload: {
        confirm: true,
        targetRoomId: roomB._id,
        targetBedId: "dst-b1",
        effectiveTransferDate: new Date().toISOString(),
        sourceRoomMeterReading: 1080,
        targetRoomMeterReading: 1020,
        reason: "closed vacant destination",
      },
      actorId,
    });

    const opened = await UtilityPeriod.findOne({
      roomId: roomB._id,
      utilityType: "electricity",
      status: "open",
    }).lean();
    expect(opened.startDate.getTime()).toBe(result.cutoverAt.getTime());
    expect(opened.startReading).toBe(1020);
    expect(opened.overheadSegments).toEqual([
      expect.objectContaining({
        readingFrom: 1000,
        readingTo: 1020,
        kwhConsumed: 20,
        cost: 320,
        reason: "VACANT_GAP_BEFORE_PERIOD",
      }),
    ]);
    const moveIn = await UtilityReading.findOne({
      utilityPeriodId: opened._id,
      eventType: "moveIn",
      tenantId: reservations.D.userId,
    }).lean();
    expect(moveIn.reading).toBe(1020);
  });

  test("failed destination initialization rolls back the entire transfer", async () => {
    const { roomA, roomB, reservations, users, actorId } = await seedQuadRoom();
    await UtilityPeriod.deleteMany({ roomId: roomB._id, utilityType: "electricity" });
    const before = {
      sourceOccupancy: roomA.currentOccupancy,
      destinationOccupancy: roomB.currentOccupancy,
    };
    const originalCreate = UtilityReading.create.bind(UtilityReading);
    const readingSpy = jest
      .spyOn(UtilityReading, "create")
      .mockImplementationOnce((...args) => originalCreate(...args))
      .mockImplementationOnce((...args) => originalCreate(...args))
      .mockRejectedValueOnce(new Error("simulated destination move-in boundary failure"));

    try {
      await expect(transferStayWorkflow({
        reservationId: reservations.D._id,
        payload: {
          confirm: true,
          targetRoomId: roomB._id,
          targetBedId: "dst-b1",
          effectiveTransferDate: "2026-08-16T00:00:00.000Z",
          sourceRoomMeterReading: 1080,
          targetRoomMeterReading: 500,
          reason: "rollback test",
          __scheduledTransferId: new mongoose.Types.ObjectId(),
        },
        actorId,
      })).rejects.toThrow("simulated destination move-in boundary failure");
    } finally {
      readingSpy.mockRestore();
    }

    const [reservation, source, destination] = await Promise.all([
      Reservation.findById(reservations.D._id).lean(),
      Room.findById(roomA._id).lean(),
      Room.findById(roomB._id).lean(),
    ]);
    expect(String(reservation.roomId)).toBe(String(roomA._id));
    expect(source.currentOccupancy).toBe(before.sourceOccupancy);
    expect(destination.currentOccupancy).toBe(before.destinationOccupancy);
    expect(await UtilityPeriod.countDocuments({ roomId: roomB._id })).toBe(0);
    expect(await UtilityReading.countDocuments({
      roomId: roomB._id,
      utilityType: "electricity",
    })).toBe(0);
    expect(await UtilityReading.countDocuments({
      roomId: roomA._id,
      utilityType: "electricity",
      tenantId: users.D._id,
      eventType: "moveOut",
    })).toBe(0);
  });

  test("direct negative transfer readings fail before physical-domain mutation", async () => {
    const { roomA, roomB, reservations, actorId } = await seedQuadRoom();
    const before = {
      reservationRoomId: String(reservations.D.roomId),
      sourceOccupancy: roomA.currentOccupancy,
      destinationOccupancy: roomB.currentOccupancy,
      readingCount: await UtilityReading.countDocuments(),
      historyCount: await BedHistory.countDocuments(),
    };
    await expect(transferStayWorkflow({
      reservationId: reservations.D._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "dst-b1",
        effectiveTransferDate: "2026-08-16T00:00:00.000Z",
        sourceRoomMeterReading: 1080, targetRoomMeterReading: -6,
      },
      actorId,
    })).rejects.toMatchObject({ statusCode: 400, code: "INVALID_PHYSICAL_METER_READING" });
    const [reservation, source, destination] = await Promise.all([
      Reservation.findById(reservations.D._id).lean(), Room.findById(roomA._id).lean(), Room.findById(roomB._id).lean(),
    ]);
    expect(String(reservation.roomId)).toBe(before.reservationRoomId);
    expect(source.currentOccupancy).toBe(before.sourceOccupancy);
    expect(destination.currentOccupancy).toBe(before.destinationOccupancy);
    expect(await UtilityReading.countDocuments()).toBe(before.readingCount);
    expect(await BedHistory.countDocuments()).toBe(before.historyCount);
  });

  test("cutover: transfer_settlement.charges.electricity is finalized; water stays 0; UtilityFinalization written; cutoverAt is a real timestamp", async () => {
    const { roomA, roomB, reservations, actorId } = await seedQuadRoom();

    const before = new Date();
    const result = await transferStayWorkflow({
      reservationId: reservations.D._id,
      payload: {
        confirm: true,
        targetRoomId: roomB._id,
        targetBedId: "dst-b1",
        effectiveTransferDate: "2026-08-16T00:00:00.000Z", // scheduled DAY
        sourceRoomMeterReading: 1080,
        targetRoomMeterReading: 500,
        reason: "test transfer",
      },
      actorId,
    });
    const after = new Date();

    // cutoverAt is a real "now" from inside the txn, NOT the scheduled 2026-08-16.
    expect(result.cutoverAt).toBeInstanceOf(Date);
    expect(result.cutoverAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.cutoverAt.getTime()).toBeLessThanOrEqual(after.getTime());
    // and NOT the scheduled calendar date
    expect(result.cutoverAt.toISOString().slice(0, 10)).not.toBe("2026-08-16");

    const settlementBill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(round(settlementBill.charges.electricity)).toBeCloseTo(100, 1);
    expect(settlementBill.charges.water).toBe(0);

    // The source moveOut UtilityReading is dated at cutoverAt (real timestamp).
    const moveOut = await UtilityReading.findOne({
      roomId: roomA._id, utilityType: "electricity", eventType: "moveOut",
      tenantId: reservations.D.userId,
    }).lean();
    expect(moveOut).toBeTruthy();
    expect(new Date(moveOut.date).getTime()).toBe(result.cutoverAt.getTime());
    expect(moveOut.reading).toBe(1080);

    // The destination moveIn UtilityReading is also dated at cutoverAt.
    const moveIn = await UtilityReading.findOne({
      roomId: roomB._id, utilityType: "electricity", eventType: "moveIn",
      tenantId: reservations.D.userId,
    }).lean();
    expect(moveIn).toBeTruthy();
    expect(new Date(moveIn.date).getTime()).toBe(result.cutoverAt.getTime());
    expect(moveIn.reading).toBe(500);

    // UtilityFinalization row exists, links to the settlement Bill.
    const fin = await UtilityFinalization.findOne({
      reservationId: reservations.D._id, utilityType: "electricity",
    }).lean();
    expect(fin).toBeTruthy();
    expect(round(fin.settledAmount)).toBeCloseTo(100, 1);
    expect(String(fin.settlementBillId)).toBe(String(settlementBill._id));
    expect(new Date(fin.throughDate).getTime()).toBe(result.cutoverAt.getTime());
    expect(fin.throughReading).toBe(1080);
  });

  test("period close: D stays in canonical allocation; NO duplicate Bill; RECONCILIATION INVARIANT holds", async () => {
    const { roomA, roomB, reservations, actorId } = await seedQuadRoom();

    const transferResult = await transferStayWorkflow({
      reservationId: reservations.D._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "dst-b1",
        effectiveTransferDate: "2026-08-16T00:00:00.000Z",
        sourceRoomMeterReading: 1080, targetRoomMeterReading: 500, reason: "t",
      },
      actorId,
    });

    // Now close room A's electricity period at 1200 kWh.
    const { default: express } = { default: null }; // not needed
    const controller = await import("../../controllers/utilityBillingController.js");
    // Drive closePeriodAndGenerateDrafts through the exported endpoint's core by
    // calling the internal helper via a minimal fake req/res is overkill — use
    // the public closeUtilityPeriod with a fake req/res.
    const period = await UtilityPeriod.findOne({ roomId: roomA._id, utilityType: "electricity", status: "open" });
    const admin = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `admin-${Date.now()}@ex.test`,
      username: `adm_${Date.now()}`, firstName: "Ad", lastName: "Min", role: "branch_admin",
      branch: "gil-puyat",
    });
    const req = {
      params: { utilityType: "electricity", id: String(period._id) },
      // Periods are half-open Manila calendar intervals. The real cutover is a
      // timestamp during its Manila day, so close at the following boundary;
      // closing at that day's 00:00 would correctly exclude the later cutover.
      body: {
        endReading: 1200,
        endDate: getManilaDayjs(transferResult.cutoverAt).add(1, "day").format("YYYY-MM-DD"),
      },
      user: { uid: admin.firebaseUid },
    };
    let closeResult;
    const res = {
      json: (p) => { closeResult = p; return res; },
      status: () => res,
    };
    await controller.closeUtilityPeriod(req, res, (e) => { if (e) throw e; });

    const closedPeriod = await UtilityPeriod.findById(period._id).lean();
    expect(closedPeriod.status).toBe("closed");

    // D still has a tenantSummary from the canonical allocation for [1000,1080].
    const dSummary = (closedPeriod.tenantSummaries || []).find(
      (s) => String(s.tenantId) === String(reservations.D.userId),
    );
    expect(dSummary).toBeTruthy();
    expect(round(dSummary.billAmount)).toBeCloseTo(100, 1); // D=100 in the close math
    expect(dSummary.settledOnTransfer).toBe(true);          // recognised as finalized

    // NO duplicate electricity draft Bill for D.
    const dBills = await Bill.find({
      userId: reservations.D.userId, billType: { $ne: "transfer_settlement" },
    }).lean();
    const dElectricityBill = dBills.find((b) => Number(b.charges?.electricity || 0) > 0);
    expect(dElectricityBill).toBeUndefined();

    // Co-occupants A, B, C each get a ₱300 electricity draft.
    const coCharges = [];
    for (const tag of ["A", "B", "C"]) {
      const bill = await Bill.findOne({
        userId: reservations[tag].userId, "charges.electricity": { $gt: 0 },
      }).lean();
      expect(bill).toBeTruthy();
      coCharges.push(round(bill.charges.electricity));
    }
    coCharges.forEach((c) => expect(c).toBeCloseTo(300, 1));

    // RECONCILIATION INVARIANT:
    //   Σ(draft bills A+B+C) + Σ(UtilityFinalization for period) === computedTotalCost
    const fins = await UtilityFinalization.find({ utilityPeriodId: period._id, utilityType: "electricity" }).lean();
    const finalizedTotal = fins.reduce((s, f) => s + Number(f.settledAmount || 0), 0);
    const draftTotal = coCharges.reduce((s, c) => s + c, 0);
    const canonical = Number(closedPeriod.computedTotalCost || 0);

    expect(canonical).toBeCloseTo(1000, 1); // 200 kWh × ₱5
    expect(round(draftTotal + finalizedTotal)).toBeCloseTo(canonical, 1);

    // The period records the reconciliation and is NOT flagged.
    expect(closedPeriod.transferFinalizationReconciliation).toBeTruthy();
    expect(closedPeriod.transferFinalizationReconciliation.flagged).toBe(false);
    expect(Math.abs(closedPeriod.transferFinalizationReconciliation.variance)).toBeLessThanOrEqual(1);

    void controller; void express; void closeResult;
  });

  test("failed period close rolls back periodEnd, bills, allocations, and status together", async () => {
    const { roomA, reservations, users } = await seedQuadRoom();
    const period = await UtilityPeriod.findOne({ roomId: roomA._id, utilityType: "electricity", status: "open" });
    await BedHistory.updateOne(
      { reservationId: reservations.D._id, roomId: roomA._id },
      { $set: { moveInDate: new Date("2026-08-10T09:00:00.000Z"), effectiveStartDate: new Date("2026-08-10T09:00:00.000Z") } },
    );
    const admin = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `rollback-${Date.now()}@ex.test`,
      username: `rb_${Date.now()}`, firstName: "Roll", lastName: "Back", role: "branch_admin", branch: "gil-puyat",
    });
    const controller = await import("../../controllers/utilityBillingController.js");
    let forwardedError;
    await controller.closeUtilityPeriod({
      params: { utilityType: "electricity", id: String(period._id) },
      body: { endReading: 1200, endDate: "2026-09-01" },
      user: { uid: admin.firebaseUid },
    }, { json: () => { throw new Error("close unexpectedly succeeded"); } }, (error) => { forwardedError = error; });

    expect(forwardedError).toBeTruthy();
    expect(forwardedError.message).toMatch(/move-in.*reading|reading.*move-in/i);
    const stored = await UtilityPeriod.findById(period._id).lean();
    expect(stored).toMatchObject({ status: "open", endDate: null, endReading: null, closedAt: null });
    expect(await UtilityReading.countDocuments({ utilityPeriodId: period._id, eventType: "periodEnd" })).toBe(0);
    expect(await Bill.countDocuments({ "charges.electricity": { $gt: 0 } })).toBe(0);
    expect((stored.tenantSummaries || [])).toHaveLength(0);
    expect(users.D).toBeTruthy();
  });

  test("guadalupe (fixed-rate): no electricity finalization; charges.electricity stays 0; no UtilityFinalization", async () => {
    // Guadalupe only supports quadruple-sharing. quad -> quad transfer.
    const branch = "guadalupe";
    const tenant = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `g-${Date.now()}@ex.test`,
      username: `g_${Date.now()}`, firstName: "G", lastName: "T", role: "tenant", tenantStatus: "active",
    });
    const roomA = await Room.create({
      name: "GQ-1", roomNumber: "GQ1", branch, type: "quadruple-sharing", capacity: 4, currentOccupancy: 1, price: 5400,
      beds: ["b1", "b2", "b3", "b4"].map((id, i) => ({
        id: `gqa-${id}`, position: i % 2 ? "upper" : "lower",
        status: i === 0 ? "occupied" : "available",
        ...(i === 0 ? { occupiedBy: { userId: tenant._id } } : {}),
      })),
    });
    const roomB = await Room.create({
      name: "GQ-2", roomNumber: "GQ2", branch, type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
      beds: ["b1", "b2", "b3", "b4"].map((id, i) => ({ id: `gqb-${id}`, position: i % 2 ? "upper" : "lower", status: "available" })),
    });
    const res = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: 5400, monthlyRent: 5400, selectedBed: { id: "gqa-b1" }, moveInDate: MOVE_IN,
      securityDepositHeld: 5400,
    });
    roomA.beds[0].occupiedBy.reservationId = res._id;
    await roomA.save();
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: res._id, branch, roomId: roomA._id, bedId: "gqa-b1",
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), monthlyRent: 5400, status: "active",
    });
    await BedHistory.create({
      bedId: "gqa-b1", roomId: roomA._id, tenantId: tenant._id, reservationId: res._id, stayId: stay._id,
      branch, moveInDate: MOVE_IN, effectiveStartDate: MOVE_IN, status: "active",
    });
    const actorId = new mongoose.Types.ObjectId();
    const num = await generateContractNumber(branch, new Date());
    await Contract.create({
      ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: res._id,
      reservationId: res._id, stayId: stay._id, roomId: roomA._id, branch,
      propertyName: "Lilycrest", propertyAddress: "x", roomNumber: "GQ1", roomType: "quadruple-sharing",
      leaseType: "long_term", approvedMonthlyRate: 5400, securityDepositAmount: 5400,
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });

    const result = await transferStayWorkflow({
      reservationId: res._id,
      payload: {
        confirm: true, targetRoomId: roomB._id, targetBedId: "gqb-b1",
        effectiveTransferDate: "2026-08-16T00:00:00.000Z",
        sourceRoomMeterReading: 9999, // supplied, but guadalupe is not sub-metered → ignored for finalization
        reason: "g transfer",
      },
      actorId,
    });

    const bill = await Bill.findById(result.billingSnapshot.transferBillId).lean();
    expect(bill.charges.electricity).toBe(0);
    expect(bill.charges.water).toBe(0);
    const fin = await UtilityFinalization.findOne({ reservationId: res._id }).lean();
    expect(fin).toBeNull();
  });
});
