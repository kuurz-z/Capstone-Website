/**
 * ============================================================================
 * ROOM TRANSFER — LAZY STAY ACTIVATION FOR A LEGITIMATELY MOVED-IN TENANT
 * ============================================================================
 * Production QA (Aug 2026): an admin had uploaded the tenant's wet-signed
 * final Contract, but Room Transfer still failed with
 *   "The tenant's current lease Contract is not active — room transfer cannot
 *    proceed."
 * and/or
 *   "No active stay found for transfer."
 *
 * Root cause: NOTHING creates a Stay row at move-in. The Stay is only ever
 * materialized lazily by `ensureActiveStay`, which historically ran ONLY
 * inside a write transaction (transferStayWorkflow Stage B / renewStayWorkflow).
 * The pre-transaction validation (`resolveValidatedRoomTransferIntent`, Stage
 * A) only *read* the Stay, so a moved-in tenant whose FIRST lifecycle action
 * was a room transfer was rejected before the transaction that would have
 * created the Stay ever ran. And with no Stay in place,
 * `resolveAuthoritativeCurrentContract` (which ranks contract candidates
 * against the current Stay) could also fail to surface the wet-signed
 * predecessor, producing the "Contract is not active" variant.
 *
 * Fix: the committing paths (transferStayWorkflow Stage A, scheduleRoomTransfer)
 * pass `materializeStay:true` to `resolveValidatedRoomTransferIntent`, which
 * then runs the SAME canonical `ensureActiveStay` up front. This does NOT
 * bypass the active-stay requirement — it runs the identical create-if-eligible
 * logic and still enforces `CURRENT_STAY_STATUSES`. When the Stay genuinely
 * cannot be derived (reservation missing moveInDate / leaseDuration) an
 * explicit `STAY_NOT_ACTIVATABLE` lifecycle error is raised instead of the
 * generic message.
 *
 * Proven here:
 *   1. moved-in tenant, wet-signed final Contract (status "published"),
 *      NO Stay row  ->  transferStayWorkflow succeeds, creates exactly ONE
 *      Stay (reservation-linked), transfers the tenant, and does NOT create a
 *      duplicate Contract or reset the lease dates.
 *   2. read-only `prepareRoomTransferAddendum` stays side-effect-free: it does
 *      NOT create a Stay (only the committing paths do).
 *   3. reservation with no moveInDate  ->  explicit STAY_NOT_ACTIVATABLE (409),
 *      NOT a generic NO_ACTIVE_STAY, and still no Stay created.
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

const { transferStayWorkflow: rawTransferStayWorkflow, prepareRoomTransferAddendum } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { resolveCurrentStayForReservation } = await import("../services/tenantContractSelectionService.js");
const { Contract, Reservation, Room, User, Stay, Bill, BusinessSettings, TenantCredit } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100 };
const CAP = { private: 1, "double-sharing": 2 };
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");
const TRANSFER = "2026-08-15T00:00:00.000Z";

/**
 * Seed a legitimately moved-in tenant with a wet-signed final Contract
 * (status "published" — exactly what contractSigningService.uploadSignedContract
 * leaves after an admin uploads the wet-signed scan) but NO Stay row, which is
 * the real production state for a tenant who has never had a lifecycle action.
 */
async function seedMovedInNoStay({ withMoveInDate = true } = {}) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "NoStay", lastName: "Tenant", role: "tenant", tenantStatus: "active",
  });
  const roomA = await Room.create({
    name: "Room 301", roomNumber: "301", branch: "gil-puyat",
    type: "private", capacity: CAP.private, currentOccupancy: 1, price: RATE.private, beds: [],
  });
  const reservation = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: withMoveInDate ? 12 : 0,
    reservationFeeAmount: 2000, preferredRoomType: "private",
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: RATE.private, monthlyRent: RATE.private,
    selectedBed: { id: "" },
    ...(withMoveInDate ? { moveInDate: MOVE_IN } : {}),
    securityDepositHeld: RATE.private,
  });
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber("gil-puyat", new Date());
  const wetSigned = await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, roomId: roomA._id, branch: "gil-puyat",
    propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
    roomType: "private", leaseType: "long_term", approvedMonthlyRate: RATE.private,
    securityDepositAmount: RATE.private,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
    // "published" is what an admin wet-signed upload leaves the Contract in
    // (contractSigningService: "Stops at published, never forces active").
    status: "published", isCurrent: true, isCanonical: true,
    publicationStatus: "published", tenantVisible: true, publishedAt: new Date(), publishedBy: actorId,
    finalDocument: {
      version: 1, storageKey: "orig/final_v1.pdf", fileName: "final_v1.pdf",
      fileHash: "wetsignedhash", fileSize: 4096, mimeType: "application/pdf", pageCount: 8,
      sourceType: "admin_scan", sourceVersion: 1, sourceUploadedAt: new Date(),
      publishedAt: new Date(), publishedBy: actorId, tenantVisible: true,
    },
    statusHistory: [{ status: "published", changedBy: actorId, reason: "wet-signed upload auto-finalized" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, roomA, reservation, wetSigned, actorId };
}

function bedsFor(type, prefix) {
  if (type === "private") return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function emptyRoom(type, roomNumber) {
  return Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type],
    beds: bedsFor(type, `r${roomNumber}`),
  });
}

describe("Room transfer — lazy Stay activation for a moved-in tenant with no Stay row", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "transfer_missing_stay" });
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-08-15T10:00:00.000+08:00"), doNotFake: ["nextTick","setImmediate","setInterval","setTimeout","clearInterval","clearTimeout","queueMicrotask"] });
    await Promise.all([
      Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
      Contract.deleteMany({}), Stay.deleteMany({}),
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

  test("transferStayWorkflow into a shared destination materializes the missing Stay and completes without duplicating the Contract or resetting lease dates", async () => {
    const { reservation, wetSigned, actorId } = await seedMovedInNoStay();
    const roomB = await emptyRoom("double-sharing", "402");

    // Precondition: the real production state — moved in, wet-signed final
    // Contract, but zero Stay rows.
    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect(await resolveCurrentStayForReservation(reservation._id)).toBeNull();

    const contractCountBefore = await Contract.countDocuments({ tenantId: wetSigned.tenantId });

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        targetRoomId: roomB._id,
        targetBedId: "r402-b1",
        effectiveTransferDate: TRANSFER,
        forceOverride: true,
      },
      actorId,
    });

    // Exactly one Stay, materialized up front in Stage A, now in the
    // destination room, active, with the ORIGINAL lease dates preserved.
    const stays = await Stay.find({ reservationId: reservation._id });
    expect(stays).toHaveLength(1);
    expect(String(stays[0].roomId)).toBe(String(roomB._id));
    expect(["active", "ending_soon"]).toContain(stays[0].status);
    expect(new Date(stays[0].leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(stays[0].leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());

    // The wet-signed predecessor Contract's own lease dates are untouched, and
    // no duplicate lease Contract was spawned by the activation.
    const predAfter = await Contract.findById(wetSigned._id);
    expect(new Date(predAfter.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(predAfter.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    const initialContracts = await Contract.find({
      tenantId: wetSigned.tenantId, contractPurpose: "initial",
    });
    expect(initialContracts).toHaveLength(1);
    // Only the transfer Addendum may be added on top of the original.
    const contractCountAfter = await Contract.countDocuments({ tenantId: wetSigned.tenantId });
    expect(contractCountAfter).toBeLessThanOrEqual(contractCountBefore + 1);
  });

  test("transferStayWorkflow into a private destination completes end-to-end for a moved-in tenant with no Stay row", async () => {
    const { reservation, wetSigned, actorId } = await seedMovedInNoStay();
    const roomB = await emptyRoom("private", "402");

    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);

    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        targetRoomId: roomB._id,
        effectiveTransferDate: TRANSFER,
        forceOverride: true,
      },
      actorId,
    });

    // Exactly one Stay, now in the destination room.
    const stays = await Stay.find({ reservationId: reservation._id });
    expect(stays).toHaveLength(1);
    expect(String(stays[0].roomId)).toBe(String(roomB._id));
    expect(["active", "ending_soon"]).toContain(stays[0].status);
    // Lease dates preserved across the transfer.
    expect(new Date(stays[0].leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(stays[0].leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());

    // Original lease Contract lineage: one "initial", plus the transfer
    // amendment; original lease dates unchanged.
    const predAfter = await Contract.findById(wetSigned._id);
    expect(new Date(predAfter.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(predAfter.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    const initials = await Contract.find({ tenantId: wetSigned.tenantId, contractPurpose: "initial" });
    expect(initials).toHaveLength(1);
    const amendments = await Contract.find({ tenantId: wetSigned.tenantId, contractPurpose: "amendment" });
    expect(amendments.length).toBeGreaterThanOrEqual(1);
  });

  test("read-only prepareRoomTransferAddendum does NOT create a Stay (only the committing paths do)", async () => {
    const { reservation } = await seedMovedInNoStay();
    const roomB = await emptyRoom("private", "402");

    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);

    await prepareRoomTransferAddendum({
      reservationId: reservation._id,
      payload: { targetRoomId: roomB._id, effectiveTransferDate: TRANSFER },
      actorId: new mongoose.Types.ObjectId(),
    }).catch(() => null);

    // Side-effect-free: the preview path never materializes a Stay.
    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);
  });

  test("a reservation with no move-in anchor raises an explicit STAY_NOT_ACTIVATABLE, not a generic NO_ACTIVE_STAY, and creates no Stay", async () => {
    const { reservation } = await seedMovedInNoStay({ withMoveInDate: false });
    const roomB = await emptyRoom("private", "402");

    const err = await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        targetRoomId: roomB._id,
        effectiveTransferDate: TRANSFER,
        forceOverride: true,
      },
      actorId: new mongoose.Types.ObjectId(),
    }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("STAY_NOT_ACTIVATABLE");
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/move-in date or lease duration/i);
    // No partial artifact.
    expect(await Stay.countDocuments({ reservationId: reservation._id })).toBe(0);
  });
});
