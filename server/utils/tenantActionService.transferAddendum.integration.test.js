/**
 * ============================================================================
 * PHASE 8 — ROOM TRANSFER ADDENDUM (Contract/document side)
 * ============================================================================
 * A Room Transfer is now an AMENDMENT to the tenant's CONTINUING lease, not a
 * replacement lease. It creates a Room Transfer Addendum
 * (contractPurpose:"amendment") that:
 *   - carries the ORIGINAL lease term verbatim (leaseStartDate / leaseEndDate
 *     / leaseDurationMonths) — the lease is NEVER reset
 *   - records the transfer date SEPARATELY as amendmentEffectiveDate
 *   - snapshots the destination room / bed / rate / required deposit in
 *     amendmentFields
 *   - links parentContractId -> the ROOT lease Contract
 *   - is a tenant-visible generated Draft, isCurrent:false, until the
 *     transfer cutover makes it isCurrent:true (status stays "generated")
 *
 * Proven here:
 *   - original lease Contract remains immutable (status, room snapshot, dates)
 *   - leaseStartDate / leaseEndDate unchanged on both the addendum and the
 *     Stay
 *   - amendmentEffectiveDate == transfer date, and is NOT a leaseStartDate
 *   - destination rate reflected as a changed term
 *   - required (addendum) vs held (reservation.securityDepositHeld) deposit
 *     are not confused
 *   - a FAILED transfer does not make an addendum current/effective
 *   - a SECOND transfer creates Addendum #2 while Addendum #1 is still a
 *     generated Draft (no new lease term, no blocking)
 *   - multiple transfers preserve Original -> Addendum #1 -> Addendum #2
 *   - legacy replacement Contracts still resolve as room-transfer successors
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

const { transferStayWorkflow: rawTransferStayWorkflow } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { resolveAuthoritativeCurrentContract, resolveTenantContractHistory } =
  await import("../services/tenantContractSelectionService.js");
const { resolveRoomTransferSuccessor } = await import("../services/contractRoomTransferActivationService.js");
const { resolveCurrentStayForReservation } = await import("../services/tenantContractSelectionService.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");
const TRANSFER_1 = "2026-08-15T00:00:00.000Z";
const TRANSFER_2 = "2026-10-10T00:00:00.000Z";

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seed({ sourceType, roomNumber = "301" }) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "P8", lastName: "T", role: "tenant", tenantStatus: "active",
  });
  const srcBeds = bedsFor(sourceType, `r${roomNumber}`);
  if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
  const roomA = await Room.create({
    name: `Room ${roomNumber}`, roomNumber, branch: "gil-puyat",
    type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
  });
  const srcBedId = NEEDS_BED.has(sourceType) ? `r${roomNumber}-b1` : "";
  const srcStayBedId = srcBedId || `room-${roomA._id}`;
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
    roomId: roomA._id, bedId: srcStayBedId,
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
  // The ORIGINAL lease — wet-signed / notarized (immutable legal record).
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

function payloadFor({ targetRoom, transferDate }) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  return {
    confirm: true, targetRoomId: targetRoom._id,
    ...(destBedId ? { targetBedId: destBedId } : {}),
    effectiveTransferDate: transferDate, forceOverride: true,
  };
}

// Mark the tenant's current room-transfer addendum as wet-signed/active
// (the Phase-8 acknowledgement/signing flow's end state) so we can prove a
// second transfer works WITHOUT it, then also that it works WITH it.

async function paySettlements(reservationId) {
  const { Bill } = await import("../models/index.js");
  for (const b of await Bill.find({ reservationId, billType: "transfer_settlement", status: { $ne: "voided" } })) {
    if (Number(b.totalAmount) - Number(b.paidAmount || 0) > 0) {
      await Bill.updateOne({ _id: b._id }, { $set: { paidAmount: b.totalAmount, remainingAmount: 0, status: "paid" } });
    }
  }
}

async function wetSignCurrentAddendum(reservationId) {
  const c = await Contract.findOne({ reservationId, isCurrent: true });
  await Contract.updateOne({ _id: c._id }, {
    $set: { status: "active" },
    $push: { statusHistory: { status: "active", changedBy: null, reason: "test: addendum wet-signed" } },
  });
}

describe("Phase 8 — Room Transfer Addendum", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "phase8_addendum" });
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

  // ── 1. Original Contract immutable; addendum carries original lease term ──
  afterEach(() => { jest.useRealTimers(); });

  test("Quad -> Private: original notarized Contract untouched; addendum keeps the original lease dates + records the transfer date separately", async () => {
    const { tenant, reservation, stay, original, actorId } = await seed({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("private", "402");

    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomB, transferDate: TRANSFER_1 }), actorId });

    const [reloadedOriginal, addendum, currentStay] = await Promise.all([
      Contract.findById(original._id),
      Contract.findOne({ replacesContractId: original._id, contractPurpose: "amendment" }),
      resolveCurrentStayForReservation(reservation._id),
    ]);

    // Original: completely immutable.
    expect(reloadedOriginal.status).toBe("replaced");        // lineage flip only
    expect(reloadedOriginal.isCurrent).toBe(false);
    expect(reloadedOriginal.contractPurpose).toBe("initial");
    expect(String(reloadedOriginal.roomId)).toBe(String(stay.roomId)); // still the OLD room
    expect(reloadedOriginal.approvedMonthlyRate).toBe(5400);           // OLD rate
    expect(new Date(reloadedOriginal.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(reloadedOriginal.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    expect(reloadedOriginal.finalDocument.fileHash).toBe("originalfinalhash"); // PDF untouched

    // Addendum: continuing lease term, transfer date separate.
    expect(addendum).toBeTruthy();
    expect(addendum.contractPurpose).toBe("amendment");
    expect(new Date(addendum.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());      // NOT reset
    expect(new Date(addendum.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    expect(addendum.leaseDurationMonths).toBe(12);
    expect(new Date(addendum.amendmentEffectiveDate).getDate()).toBe(15);                  // transfer day
    expect(String(addendum.parentContractId)).toBe(String(original._id));                     // -> root lease
    expect(String(addendum.replacesContractId)).toBe(String(original._id));
    expect(addendum.isCurrent).toBe(true);
    expect(addendum.status).toBe("generated");                                                // Draft, not active
    expect(addendum.tenantVisible).toBe(true);

    // Changed term: destination room + rate.
    expect(String(addendum.roomId)).toBe(String(roomB._id));
    expect(addendum.roomType).toBe("private");
    expect(addendum.approvedMonthlyRate).toBe(13500);
    expect(addendum.amendmentFields).toEqual(expect.arrayContaining(["roomId", "approvedMonthlyRate", "securityDepositAmount"]));
    expect(addendum.amendmentReason).toMatch(/original lease.*remain in effect/i);

    // The Stay's lease dates are likewise unchanged.
    expect(new Date(currentStay.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(currentStay.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());

    // Required (addendum) vs held (reservation) deposit not confused.
    const r = await Reservation.findById(reservation._id);
    expect(addendum.securityDepositAmount).toBe(13500);      // REQUIRED after transfer
    expect(r.securityDepositHeld).toBe(5400);                // actually HELD — unchanged until paid
  });

  // ── 2. Current contract resolution: one continuing lease ──────────────
  test("resolveAuthoritativeCurrentContract returns the addendum as the one continuing lease; history keeps the original", async () => {
    const { tenant, reservation, original, actorId } = await seed({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("private", "402");
    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomB, transferDate: TRANSFER_1 }), actorId });

    const current = await resolveAuthoritativeCurrentContract({ reservationId: reservation._id, includeEarlyStages: true });
    expect(current).toBeTruthy();
    expect(current.contractPurpose).toBe("amendment");
    expect(String(current.replacesContractId)).toBe(String(original._id));
    // Lease dates on the "current lease" surface are the ORIGINAL ones.
    expect(new Date(current.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(current.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());

    const history = await resolveTenantContractHistory(tenant._id);
    expect(history.map((c) => String(c._id))).toContain(String(original._id));   // original preserved
    expect(history.every((c) => String(c._id) !== String(current._id))).toBe(true); // current excluded from history
  });

  // ── 3. Failed transfer does not make an addendum current/effective ────
  test("failed transfer (cross-branch): no addendum is current; original remains the active lease", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "double-sharing" });
    const gd = await Room.create({
      name: "GD", roomNumber: "999", branch: "guadalupe",
      type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
      beds: bedsFor("quadruple-sharing", "gd"),
    });
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: gd._id, targetBedId: "gd-b1", effectiveTransferDate: TRANSFER_1, forceOverride: true },
      actorId,
    })).rejects.toMatchObject({ code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });

    const [reloadedOriginal, anyAmendment] = await Promise.all([
      Contract.findById(original._id),
      Contract.findOne({ replacesContractId: original._id, contractPurpose: "amendment", isCurrent: true }),
    ]);
    expect(reloadedOriginal.status).toBe("active");
    expect(reloadedOriginal.isCurrent).toBe(true);
    expect(anyAmendment).toBeNull();   // no current addendum
  });

  // ── 4. Second transfer without wet-signing Addendum #1 ────────────────
  test("A -> B -> C: Addendum #2 is created while Addendum #1 is still a generated Draft — no new lease term, no blocking", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("double-sharing", "402");
    const roomC = await emptyRoom("private", "503");

    // Transfer #1 -> Addendum #1 (generated, isCurrent, NOT wet-signed).
    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomB, transferDate: TRANSFER_1 }), actorId });
    const add1 = await Contract.findOne({ reservationId: reservation._id, isCurrent: true });
    expect(add1.contractPurpose).toBe("amendment");
    expect(add1.status).toBe("generated");           // wet-signing still pending

    // Transfer #2 must NOT be blocked by add1's unfinished signing.
    await paySettlements(reservation._id); // round-2: prior settlement must be paid
    jest.setSystemTime(new Date(`${String(TRANSFER_2).slice(0, 10)}T10:00:00.000+08:00`));
    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomC, transferDate: TRANSFER_2 }), actorId });

    const [reloadedAdd1, add2, chain] = await Promise.all([
      Contract.findById(add1._id),
      Contract.findOne({ reservationId: reservation._id, isCurrent: true }),
      Contract.find({ tenantId: reservation.userId }).sort({ createdAt: 1 }),
    ]);

    expect(reloadedAdd1.status).toBe("replaced");    // Addendum #1 superseded by #2
    expect(reloadedAdd1.isCurrent).toBe(false);
    expect(add2.contractPurpose).toBe("amendment");
    expect(String(add2._id)).not.toBe(String(add1._id));
    expect(add2.isCurrent).toBe(true);
    expect(add2.status).toBe("generated");

    // Lease term NEVER changed across the two addenda.
    expect(new Date(add2.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
    expect(new Date(add2.leaseEndDate).toISOString()).toBe(LEASE_END.toISOString());
    expect(add2.leaseDurationMonths).toBe(12);
    expect(new Date(add2.amendmentEffectiveDate).getDate()).toBe(10); // TRANSFER_2 day

    // History: Original -> Addendum #1 -> Addendum #2, all rooted at the original.
    expect(chain).toHaveLength(3);
    expect(chain[0].contractPurpose).toBe("initial");
    expect(chain[1].contractPurpose).toBe("amendment");
    expect(chain[2].contractPurpose).toBe("amendment");
    expect(String(chain[1].parentContractId)).toBe(String(original._id));
    expect(String(chain[2].parentContractId)).toBe(String(original._id));  // still the ROOT, not Addendum #1
    expect(String(chain[2].replacesContractId)).toBe(String(add1._id));    // supersedes Addendum #1

    // Current rent term = room C.
    expect(add2.approvedMonthlyRate).toBe(13500);
    expect(String(add2.roomId)).toBe(String(roomC._id));

    // Deposit: required (addendum) vs held (reservation) still distinct.
    const r = await Reservation.findById(reservation._id);
    expect(add2.securityDepositAmount).toBe(13500);   // room C required
    expect(r.securityDepositHeld).toBe(5400);         // still the move-in cash (no payment yet)
  });

  // ── 5. Second transfer ALSO works when Addendum #1 has been wet-signed ──
  test("A -> B (wet-signed) -> C: a signed Addendum #1 is a valid predecessor for Addendum #2", async () => {
    const { reservation, actorId } = await seed({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("double-sharing", "402");
    const roomC = await emptyRoom("private", "503");

    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomB, transferDate: TRANSFER_1 }), actorId });
    await wetSignCurrentAddendum(reservation._id);
    await paySettlements(reservation._id); // round-2: prior settlement must be paid
    jest.setSystemTime(new Date(`${String(TRANSFER_2).slice(0, 10)}T10:00:00.000+08:00`));
    await transferStayWorkflow({ reservationId: reservation._id, payload: payloadFor({ targetRoom: roomC, transferDate: TRANSFER_2 }), actorId });

    const add2 = await Contract.findOne({ reservationId: reservation._id, isCurrent: true });
    expect(add2.contractPurpose).toBe("amendment");
    expect(String(add2.roomId)).toBe(String(roomC._id));
    expect(new Date(add2.leaseStartDate).toISOString()).toBe(MOVE_IN.toISOString());
  });

  // ── 6. Legacy replacement Contracts still resolve as successors ───────
  test("a legacy contractPurpose:'replacement' successor is still recognised by resolveRoomTransferSuccessor", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "double-sharing" });
    const roomB = await emptyRoom("private", "402");
    const num = await generateContractNumber("gil-puyat", new Date());
    const legacy = await Contract.create({
      ...num, contractPurpose: "replacement", transferType: "room_change",
      parentContractId: original._id, replacesContractId: original._id,
      tenantId: reservation.userId, applicationId: reservation._id, reservationId: reservation._id,
      stayId: original.stayId, roomId: roomB._id, branch: "gil-puyat",
      propertyName: "Lilycrest", propertyAddress: "123", roomNumber: "402", roomType: "private",
      leaseType: "long_term", approvedMonthlyRate: 13500, securityDepositAmount: 13500,
      leaseStartDate: new Date("2026-08-15T00:00:00.000Z"), // legacy: was the transfer date
      leaseEndDate: LEASE_END, leaseDurationMonths: 5,
      status: "generated", isCurrent: false, tenantVisible: true,
      statusHistory: [{ status: "generated", changedBy: actorId, reason: "legacy seed" }],
      createdBy: actorId, updatedBy: actorId,
    });

    const resolved = await resolveRoomTransferSuccessor({ predecessorContractId: original._id });
    expect(String(resolved._id)).toBe(String(legacy._id));
    expect(resolved.contractPurpose).toBe("replacement"); // still readable as a legacy successor
  });
});
