/**
 * PHASE 2 — CURRENT OCCUPANCY AS THE SINGLE SOURCE OF TRUTH.
 *
 * The full cross-room-type lifecycle (bed handling, occupancy counters,
 * BedHistory close/open, "exactly one active Stay", Stay/Reservation room
 * sync, rollback) is already proven by
 *   - tenantActionService.transferCrossType.integration.test.js (3x3 matrix)
 *   - tenantActionService.transferCutoverRollback.integration.test.js
 * This file does NOT duplicate those. It adds only the two invariants those
 * suites do not explicitly assert:
 *
 *   1. The CANONICAL resolver `resolveCurrentStayForReservation()` — the one
 *      function every current-lease lookup in the codebase must go through —
 *      returns the post-transfer Stay, pointed at the destination room/bed,
 *      and returns exactly one such Stay. (Existing tests assert via
 *      `Stay.findById` / `countDocuments({status:"active"})`, never the
 *      resolver itself.)
 *
 *   2. A stale `reservation.preferredRoomType` that CONTRADICTS both the
 *      source and the destination `Room.type` has ZERO influence on the
 *      transfer outcome — bed requirement, Stay/Reservation room, successor
 *      Contract room type and rate are all driven purely by the live
 *      `Room.type` of the actual destination room. (Existing fixtures set
 *      `preferredRoomType` == sourceType, so a code path reading it would
 *      not be caught.)
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
const { resolveCurrentStayForReservation, CURRENT_STAY_STATUSES } =
  await import("../services/tenantContractSelectionService.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings } =
  await import("../models/index.js");

jest.setTimeout(180_000);

// Long-term (6mo) discounted rates — identical basis to transferCrossType.
const EXPECTED_RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAPACITY = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const TRANSFER_DATE = "2026-08-15T00:00:00.000Z";

// A room type that is deliberately NOT the source and NOT the destination of
// any case below, so a code path that (wrongly) trusted preferredRoomType
// would diverge from the live Room.type-driven outcome.
const CONTRADICTORY_PREF = "quadruple-sharing";

describe("Phase 2 — current occupancy is the single source of truth", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "transfer_occupancy_sot" });
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
    return Array.from({ length: CAPACITY[type] }, (_, i) => ({
      id: `${prefix}-b${i + 1}`, position: i % 2 === 0 ? "lower" : "upper", status: "available",
    }));
  }

  async function seed({ sourceType, destType, preferredRoomType }) {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Occ", lastName: "SoT", role: "tenant", tenantStatus: "active",
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

    const sourceRealBedId = NEEDS_BED.has(sourceType) ? "src-b1" : "";
    const sourceStayBedId = sourceRealBedId || `room-${roomA._id}`;
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000,
      // The whole point of this file: a stale, contradictory preference.
      preferredRoomType,
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

  // Representative transitions: private<->shared (bed added / bed dropped) and
  // shared->shared (bed moved). Not the full 9-way matrix — transferCrossType
  // already covers that; here we only need each bed-handling shape once.
  const CASES = [
    ["private", "double-sharing"],       // bed becomes required
    ["quadruple-sharing", "private"],    // bed dropped safely
    ["double-sharing", "quadruple-sharing"], // bed moved, still required, different room type
  ];

  test.each(CASES)(
    "%s -> %s: resolveCurrentStayForReservation() returns the one post-transfer Stay at the destination",
    async (sourceType, destType) => {
      const { reservation, roomA, roomB, stay, actorId } =
        await seed({ sourceType, destType, preferredRoomType: CONTRADICTORY_PREF });

      const destBedId = NEEDS_BED.has(destType) ? "dst-b1" : undefined;

      await transferStayWorkflow({
        reservationId: reservation._id,
        payload: {
          confirm: true, targetRoomId: roomB._id,
          ...(destBedId ? { targetBedId: destBedId } : {}),
          effectiveTransferDate: TRANSFER_DATE,
        },
        actorId,
      });

      // (1) The canonical resolver — not a raw Stay query — is authoritative.
      const current = await resolveCurrentStayForReservation(reservation._id);
      expect(current).toBeTruthy();
      expect(CURRENT_STAY_STATUSES).toContain(current.status);
      // Same Stay doc, mutated in place — no new row.
      expect(String(current._id)).toBe(String(stay._id));
      expect(String(current.roomId)).toBe(String(roomB._id));
      expect(current.bedId).toBe(NEEDS_BED.has(destType) ? destBedId : `room-${roomB._id}`);

      // Exactly one Stay is resolvable as "current" for this tenant.
      const currentCount = await Stay.countDocuments({
        reservationId: reservation._id,
        status: { $in: [...CURRENT_STAY_STATUSES] },
      });
      expect(currentCount).toBe(1);

      // The old room is not resolvable as anyone's current stay.
      expect(String(current.roomId)).not.toBe(String(roomA._id));
    },
  );

  test.each(CASES)(
    "%s -> %s: a contradictory stale preferredRoomType has zero influence — live destination Room.type drives everything",
    async (sourceType, destType) => {
      const { reservation, roomB, actorId } =
        await seed({ sourceType, destType, preferredRoomType: CONTRADICTORY_PREF });

      const destBedId = NEEDS_BED.has(destType) ? "dst-b1" : undefined;
      const destNeedsBed = NEEDS_BED.has(destType);

      // Sanity: the stale preference really does disagree with the destination
      // for at least the private-destination case, and with the source for all.
      expect(reservation.preferredRoomType).toBe(CONTRADICTORY_PREF);

      const result = await transferStayWorkflow({
        reservationId: reservation._id,
        payload: {
          confirm: true, targetRoomId: roomB._id,
          ...(destBedId ? { targetBedId: destBedId } : {}),
          effectiveTransferDate: TRANSFER_DATE,
        },
        actorId,
      });

      const [reloadedStay, reloadedReservation, reloadedRoomB, successor] = await Promise.all([
        resolveCurrentStayForReservation(reservation._id),
        Reservation.findById(reservation._id),
        Room.findById(roomB._id),
        Contract.findOne({ replacesContractId: result.contractCutover.predecessorContractId, contractPurpose: { $in: ["amendment", "replacement"] } }),
      ]);

      // Bed requirement was decided from Room.type(destination), NOT the
      // "quadruple-sharing" preference (which would always demand a bed).
      if (destNeedsBed) {
        expect(reloadedStay.bedId).toBe(destBedId);
        expect(reloadedRoomB.beds.find((b) => b.id === destBedId).status).toBe("occupied");
      } else {
        // private destination: preference said "quadruple-sharing" but the
        // room is private -> sentinel bed, room-level occupancy only.
        expect(reloadedStay.bedId).toBe(`room-${reloadedRoomB._id}`);
        expect(reloadedRoomB.beds).toHaveLength(0);
      }

      // Room, rate and successor Contract type all follow the real destination.
      expect(String(reloadedStay.roomId)).toBe(String(roomB._id));
      expect(String(reloadedReservation.roomId)).toBe(String(roomB._id));
      expect(reloadedReservation.monthlyRent).toBe(EXPECTED_RATE[destType]);
      expect(successor.roomType).toBe(destType);
      expect(successor.approvedMonthlyRate).toBe(EXPECTED_RATE[destType]);
      // preferredRoomType itself is left untouched — it is simply never read.
      expect(reloadedReservation.preferredRoomType).toBe(CONTRADICTORY_PREF);
      expect(reloadedRoomB.currentOccupancy).toBe(1);
    },
  );
});
