/**
 * Cross-room-type room transfer coverage. A room transfer MAY change room
 * type (Private <-> Double <-> Quadruple); the destination Contract,
 * pricing, template and bed handling all key off the DESTINATION Room.type,
 * and source-bed release vs. destination-bed occupancy are decided
 * INDEPENDENTLY from each room's own type.
 *
 * The full 3x3 matrix is exercised:
 *   private -> private / double / quadruple
 *   double  -> private / double / quadruple
 *   quad    -> private / double / quadruple
 *
 * Per case this verifies: source bed release, destination bed requirement +
 * occupancy, Stay room/bed, Reservation room/bed, replacement Contract room
 * type/bed/rate, predecessor -> replaced/non-current, successor Draft ->
 * current + tenantVisible, exactly one current Contract, exactly one active
 * Stay, BedHistory close/open, destination structured pricing, higher- and
 * lower-rate settlement, unchanged billing anchor, no duplicate settlement
 * Bill. Plus targeted rejection / rollback cases.
 *
 * PDF generation is mocked (storage I/O, not transaction-safe); everything
 * else runs for real against a single-node replica set.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockValidate = jest.fn(async () => ({
  valid: true,
  missingFields: [],
  errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));

const mockGenerate = jest.fn(async ({ contractId, actorId, session = null }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("../services/contractService.js");
  const contract = await Contract.findById(contractId).session(session);
  const version = 1;
  contract.preparedDocuments = contract.preparedDocuments || [];
  contract.preparedDocuments.push({
    documentType: "prepared", version, storageProvider: "local",
    storageKey: `test/prepared_v${version}.pdf`, fileName: `prepared_v${version}.pdf`,
    fileHash: `preparedhash-${contract._id}-v${version}`, fileSize: 2048, pageCount: 4,
    templateId: "generic", templateVersion: "1", coordinateVersion: "1",
    generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  contract.generatedFileHash = `preparedhash-${contract._id}-v${version}`;
  contract.generatedVersion = version;
  contract.publicationStatus = "ready_for_resident";
  contract.tenantVisible = true;
  if (contract.status === "ready_for_generation") {
    await transitionContract(contract, "generated", actorId, "Prepared Contract PDF generated (test)", session);
  } else {
    await contract.save(session ? { session } : undefined);
  }
  return { contract, document: contract.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});

await jest.unstable_mockModule("../services/contractPdfService.js", () => ({
  generatePreparedContractPdf: mockGenerate,
}));
const realContractService = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const {
  Contract,
  Reservation,
  Room,
  User,
  Stay,
  BedHistory,
  Bill,
  BusinessSettings,
  UtilityPeriod,
} = await import("../models/index.js");

jest.setTimeout(180_000);

// Long-term (6mo, threshold 6) rates from DEFAULT_REGULAR_RATES with the
// discount settings seeded below:
//   private   : 15000 * (1 - 10/100) = 13500   (privateDiscountPercent 10)
//   double    :  9000 * (1 - 10/100) =  8100   (doubleDiscountPercent 10)
//   quadruple :  6000 * (1 - 10/100) =  5400   (quadrupleDiscountPercent 10)
const EXPECTED_RATE = {
  private: 13500,
  "double-sharing": 8100,
  "quadruple-sharing": 5400,
};
const CAPACITY = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const TRANSFER_DATE = "2026-08-15T00:00:00.000Z"; // 14 source days of a 31-day cycle

describe("transferStayWorkflow — cross-room-type transfers", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, args: ["--wiredTigerCacheSizeGB", "0.5"] },
    });
    await mongoose.connect(mongo.getUri(), {
      dbName: "transfer_cross_type",
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
    jest.useFakeTimers({ now: new Date("2026-08-15T10:00:00.000+08:00"), doNotFake: ["nextTick", "setImmediate", "setInterval", "setTimeout", "clearInterval", "clearTimeout", "queueMicrotask"] });
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

  function bedsFor(type, prefix) {
    if (!NEEDS_BED.has(type)) return [];
    const n = CAPACITY[type];
    return Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-b${i + 1}`, position: i % 2 === 0 ? "lower" : "upper", status: "available",
    }));
  }

  async function seed({ sourceType, destType }) {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Cross", lastName: "Type", role: "tenant", tenantStatus: "active",
    });

    const srcBeds = bedsFor(sourceType, "src");
    if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
    const roomA = await Room.create({
      name: `Src ${sourceType}`, roomNumber: "301", branch: "gil-puyat",
      type: sourceType, capacity: CAPACITY[sourceType], currentOccupancy: 1,
      price: EXPECTED_RATE[sourceType], beds: srcBeds,
    });
    const roomB = await Room.create({
      name: `Dst ${destType}`, roomNumber: "409", branch: "gil-puyat",
      type: destType, capacity: CAPACITY[destType], currentOccupancy: 0,
      price: EXPECTED_RATE[destType], beds: bedsFor(destType, "dst"),
    });

    // Real bed id for a shared source; the room-scoped sentinel for a
    // private source (Stay.bedId is a required String — the transfer code
    // writes the same sentinel).
    const sourceRealBedId = NEEDS_BED.has(sourceType) ? "src-b1" : "";
    const sourceStayBedId = sourceRealBedId || `room-${roomA._id}`;
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: sourceType,
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: EXPECTED_RATE[sourceType],
      selectedBed: { id: sourceRealBedId },
      moveInDate: MOVE_IN,
      securityDepositHeld: EXPECTED_RATE[sourceType],
    });
    if (srcBeds.length) {
      roomA.beds[0].occupiedBy.reservationId = reservation._id;
      await roomA.save();
    }

    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: roomA.branch,
      roomId: roomA._id, bedId: sourceStayBedId,
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"),
      monthlyRent: EXPECTED_RATE[sourceType], status: "active",
    });

    // Move-in only creates a BedHistory row for shared rooms today; mirror that.
    let bedHistory = null;
    if (NEEDS_BED.has(sourceType)) {
      bedHistory = await BedHistory.create({
        bedId: sourceRealBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
        stayId: stay._id, branch: roomA.branch, moveInDate: MOVE_IN, status: "active",
      });
    }

    const actorId = new mongoose.Types.ObjectId();
    const numberA = await generateContractNumber(roomA.branch, new Date());
    const predecessor = await Contract.create({
      ...numberA, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
      reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: roomA.branch,
      propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
      roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: EXPECTED_RATE[sourceType],
      leaseStartDate: MOVE_IN, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });

    return { tenant, roomA, roomB, reservation, stay, bedHistory, predecessor, actorId, sourceRealBedId };
  }

  const MATRIX = [
    ["private", "private"],
    ["private", "double-sharing"],
    ["private", "quadruple-sharing"],
    ["double-sharing", "private"],
    ["double-sharing", "double-sharing"],
    ["double-sharing", "quadruple-sharing"],
    ["quadruple-sharing", "private"],
    ["quadruple-sharing", "double-sharing"],
    ["quadruple-sharing", "quadruple-sharing"],
  ];

  test.each(MATRIX)("%s -> %s: full lifecycle, bed handling, pricing, settlement", async (sourceType, destType) => {
    const { tenant, roomA, roomB, reservation, stay, bedHistory, predecessor, actorId, sourceRealBedId } =
      await seed({ sourceType, destType });

    const destBedId = NEEDS_BED.has(destType) ? "dst-b1" : undefined;

    const result = await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomB._id,
        ...(destBedId ? { targetBedId: destBedId } : {}),
        effectiveTransferDate: TRANSFER_DATE,
      },
      actorId,
    });

    // ── Contract cutover ──────────────────────────────────────────────────
    expect(result.contractCutover.predecessorStatus).toBe("replaced");
    expect(result.contractCutover.successorStatus).toBe("generated");

    const [reloadedStay, reloadedRoomA, reloadedRoomB, reloadedPredecessor, reloadedReservation, successor, transferBill, currentContracts, activeStays, activeBedHistories] =
      await Promise.all([
        Stay.findById(stay._id),
        Room.findById(roomA._id),
        Room.findById(roomB._id),
        Contract.findById(predecessor._id),
        Reservation.findById(reservation._id),
        Contract.findOne({ replacesContractId: predecessor._id, contractPurpose: { $in: ["amendment", "replacement"] } }),
        Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" }),
        Contract.countDocuments({ tenantId: tenant._id, isCurrent: true }),
        Stay.countDocuments({ tenantId: tenant._id, status: "active" }),
        BedHistory.find({ stayId: stay._id, status: "active" }),
      ]);

    // ── Source bed release ────────────────────────────────────────────────
    if (NEEDS_BED.has(sourceType)) {
      expect(reloadedRoomA.beds.find((b) => b.id === sourceRealBedId).status).toBe("available");
    } else {
      expect(reloadedRoomA.beds).toHaveLength(0);
    }
    expect(reloadedRoomA.currentOccupancy).toBe(0);

    // ── Destination bed requirement + occupancy ───────────────────────────
    if (NEEDS_BED.has(destType)) {
      expect(reloadedRoomB.beds.find((b) => b.id === destBedId).status).toBe("occupied");
      expect(reloadedStay.bedId).toBe(destBedId);
      expect(String(reloadedReservation.selectedBed.id)).toBe(destBedId);
      expect(successor.bedId).toBe(destBedId);
    } else {
      // Private destination: no per-bed record. Stay.bedId is a required
      // String -> the canonical room-scoped sentinel. Reservation.selectedBed
      // and Contract.bedId follow the "" private convention (not required).
      expect(reloadedRoomB.beds).toHaveLength(0);
      expect(reloadedStay.bedId).toBe(`room-${roomB._id}`);
      expect(String(reloadedReservation.selectedBed.id || "")).toBe("");
      expect(successor.bedId || "").toBe("");
    }
    expect(reloadedRoomB.currentOccupancy).toBe(1);

    // ── Stay room ─────────────────────────────────────────────────────────
    expect(String(reloadedStay.roomId)).toBe(String(roomB._id));
    // ── Reservation room ─────────────────────────────────────────────────
    expect(String(reloadedReservation.roomId)).toBe(String(roomB._id));

    // ── Replacement Contract: DESTINATION room type / rate ────────────────
    expect(successor.roomType).toBe(destType);
    expect(String(successor.roomId)).toBe(String(roomB._id));
    expect(successor.approvedMonthlyRate).toBe(EXPECTED_RATE[destType]);
    expect(successor.status).toBe("generated");
    expect(successor.isCurrent).toBe(true);
    expect(successor.tenantVisible).toBe(true);
    expect(successor.finalDocument == null).toBe(true);

    // Future rent bills the destination rate.
    expect(reloadedReservation.monthlyRent).toBe(EXPECTED_RATE[destType]);

    // ── Predecessor: historical, non-current ─────────────────────────────
    expect(reloadedPredecessor.status).toBe("replaced");
    expect(reloadedPredecessor.isCurrent).toBe(false);
    expect(String(reloadedPredecessor.supersededByContractId)).toBe(String(successor._id));

    // ── Exactly one current Contract / active Stay ───────────────────────
    expect(currentContracts).toBe(1);
    expect(activeStays).toBe(1);

    // ── BedHistory close/open ───────────────────────────────────────────
    if (bedHistory) {
      const closed = await BedHistory.findById(bedHistory._id);
      expect(closed.status).toBe("transferred");
      expect(closed.moveOutDate).toBeTruthy();
    }
    expect(activeBedHistories).toHaveLength(1);
    expect(String(activeBedHistories[0].roomId)).toBe(String(roomB._id));
    expect(activeBedHistories[0].bedId).toBe(
      NEEDS_BED.has(destType) ? destBedId : `room-${roomB._id}`,
    );

    // ── Settlement: actual-days, destination approved rate, anchor kept ──
    expect(transferBill).toBeTruthy();
    expect(transferBill.proRataDays).toBe(14);
    expect(transferBill.transferSnapshot.totalCoverageDays).toBe(31);
    expect(transferBill.transferSnapshot.destinationDays).toBe(17);
    expect(transferBill.transferSnapshot.sourceApprovedRate).toBe(EXPECTED_RATE[sourceType]);
    expect(transferBill.transferSnapshot.destinationApprovedRate).toBe(EXPECTED_RATE[destType]);
    // source consumed value + unused credit reconciles to the prepaid source rent
    expect(
      transferBill.transferSnapshot.proRataRent + transferBill.transferSnapshot.unusedPrepaidCredit,
    ).toBeCloseTo(EXPECTED_RATE[sourceType], 2);

    if (EXPECTED_RATE[destType] > EXPECTED_RATE[sourceType]) {
      // Higher-rate destination -> additional amount due, no excess credit.
      expect(transferBill.charges.rent).toBeGreaterThan(0);
      expect(transferBill.transferSnapshot.excessCredit).toBe(0);
    } else if (EXPECTED_RATE[destType] < EXPECTED_RATE[sourceType]) {
      // Lower-rate destination -> may produce excess credit, never negative rent.
      expect(transferBill.charges.rent).toBeGreaterThanOrEqual(0);
      expect(transferBill.transferSnapshot.additionalAmountDue).toBeGreaterThanOrEqual(0);
    }

    // Billing anchor (move-in date) unchanged.
    expect(new Date(reloadedReservation.moveInDate).toISOString()).toBe(MOVE_IN.toISOString());

    // No duplicate settlement Bill.
    const settlementBills = await Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(settlementBills).toHaveLength(1);
  });

  // ── Targeted rejection / edge cases ────────────────────────────────────

  test("Private -> Double with NO bed supplied is rejected", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "private", destType: "double-sharing" });
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: roomB._id, effectiveTransferDate: TRANSFER_DATE },
      actorId,
    })).rejects.toMatchObject({ code: "MISSING_TRANSFER_FIELDS" });
  });

  test("Double -> Private with a STALE bed id supplied ignores it and completes", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "double-sharing", destType: "private" });
    const result = await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomB._id,
        targetBedId: "some-old-bed-from-the-double", // not on the private room
        effectiveTransferDate: TRANSFER_DATE,
      },
      actorId,
    });
    expect(result.contractCutover.successorStatus).toBe("generated");
    const stay = await Stay.findOne({ reservationId: reservation._id, status: "active" });
    expect(stay.bedId).toBe(`room-${roomB._id}`); // private sentinel, stale bed ignored
    const room = await Room.findById(roomB._id);
    expect(room.currentOccupancy).toBe(1);
  });

  test("cross-type transfer with a destination bed that belongs to another room is rejected", async () => {
    const { reservation, roomA, roomB, actorId } = await seed({ sourceType: "private", destType: "quadruple-sharing" });
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomB._id,
        targetBedId: "src-b1", // a bed id shaped like the SOURCE room's beds
        effectiveTransferDate: TRANSFER_DATE,
      },
      actorId,
    })).rejects.toMatchObject({ code: "TARGET_BED_NOT_FOUND" });
    // nothing moved
    const reloadedRoomA = await Room.findById(roomA._id);
    expect(reloadedRoomA.currentOccupancy).toBe(1);
  });

  test("cross-type transfer to an unavailable destination bed is rejected", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "private", destType: "double-sharing" });
    await Room.updateOne(
      { _id: roomB._id, "beds.id": "dst-b1" },
      { $set: { "beds.$.status": "occupied", "beds.$.occupiedBy": { userId: new mongoose.Types.ObjectId() } } },
    );
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: roomB._id, targetBedId: "dst-b1", effectiveTransferDate: TRANSFER_DATE },
      actorId,
    })).rejects.toMatchObject({ code: "BED_NOT_AVAILABLE" });
  });

  test("cross-type transfer to a full destination room is rejected", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "quadruple-sharing", destType: "private" });
    await Room.updateOne({ _id: roomB._id }, { $set: { currentOccupancy: 1 } }); // private capacity 1
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: roomB._id, effectiveTransferDate: TRANSFER_DATE },
      actorId,
    })).rejects.toMatchObject({ code: "DESTINATION_ROOM_FULL" });
  });

  // NOTE: cross-type transactional rollback (cutover failure -> every
  // physical mutation reverted) is covered in
  // tenantActionService.transferCutoverRollback.integration.test.js, which
  // module-mocks activateRoomTransferSuccessorDraft with a Double -> Private
  // fixture. It cannot be done here because re-mocking mid-file requires
  // jest.resetModules(), which tears down the shared mongoose connection.
});
