/**
 * ============================================================================
 * PHASE 10 — RENEWAL + MOVE-OUT AFTER ROOM TRANSFER (end-to-end)
 * ============================================================================
 * A tenant is transferred (Quad -> Private, and A->B->C), then either
 * RENEWS or MOVES OUT. Everything downstream must use the CURRENT
 * operational state, never revive the original room.
 *
 * Proven:
 *   RENEWAL
 *     - renewStayWorkflow's new Stay is on the CURRENT (transferred) room/bed
 *     - the renewal successor Contract carries the current room + its
 *       canonical renewal rate (not the original room's)
 *     - renewal Contract lineage: Original -> Addendum -> Renewal, rooted at
 *       the original, renewal is contractPurpose:"renewal" (not "amendment")
 *     - depositAdjustment snapshot uses ACTUAL held cash, not a Contract
 *       field (unpaid transfer deposit is not counted as held)
 *     - A->B->C then renew: renewal uses Room C
 *   MOVE-OUT
 *     - moveOutStayWorkflow closes the CURRENT (transferred) room's Stay
 *     - the final electricity moveOut UtilityReading is on the CURRENT room
 *     - deposit settlement basis = reservation.securityDepositHeld (actual
 *       cash), never the destination REQUIRED deposit
 *     - excess held deposit (cheaper-room transfer) is fully part of the
 *       refund basis — not lost, not a TenantCredit
 *     - a required-but-unpaid transfer deposit is NOT added to the refund
 *       basis; it stays an outstanding Bill and is deducted
 *     - legacy securityDepositHeld === null falls back safely (1x rate), no
 *       guessed value written
 *     - A->B->C then move out: closes Room C
 *     - historical rooms / Contracts / Addenda / Bills are untouched
 *
 * PDF generation is mocked. Renewal activation is driven by the real
 * activateDueRenewalContracts against a published + finalDocument successor.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockValidate = jest.fn(async () => ({
  valid: true, missingFields: [], errors: [],
  generationData: { pricing: {} },
  template: { templateId: "generic", templateVersion: 1, legalContentVersion: 1 },
}));
const mockGenerate = jest.fn(async ({ contractId, actorId }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("../services/contractService.js");
  const contract = await Contract.findById(contractId);
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
    await transitionContract(contract, "generated", actorId, "prepared (test)");
  } else {
    await contract.save();
  }
  return { contract, document: contract.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("../services/contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realContractService = await import("../services/contractService.js");
await jest.unstable_mockModule("../services/contractService.js", () => ({
  ...realContractService,
  validateContractForGeneration: mockValidate,
}));

const { transferStayWorkflow: rawTransferStayWorkflow, renewStayWorkflow, moveOutStayWorkflow } = await import("./tenantActionService.js");
const { transferWithCanonicalUtilityFixture } = await import("../tests/canonicalUtilityLifecycleFixture.js");
const transferStayWorkflow = (input) => transferWithCanonicalUtilityFixture(rawTransferStayWorkflow, input);
const { generateContractNumber } = await import("../services/contractService.js");
const { activateDueRenewalContracts } = await import("../services/contractRenewalActivationService.js");
const { resolveReservationRentAmount } = await import("../services/billing/rentGenerator.js");
const { resolveCurrentStayForReservation } = await import("../services/tenantContractSelectionService.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit, UtilityReading } =
  await import("../models/index.js");

jest.setTimeout(300_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-01-01T00:00:00.000Z");
const LEASE_END = new Date("2026-12-31T00:00:00.000Z");

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

async function seed({ sourceType, roomNumber = "301", securityDepositHeld }) {
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "P10", lastName: "T", role: "tenant", tenantStatus: "active",
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
    selectedBed: { id: srcBedId }, moveInDate: MOVE_IN,
    ...(securityDepositHeld === null ? {} : { securityDepositHeld: securityDepositHeld ?? RATE[sourceType] }),
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
  const original = await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
    reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: "gil-puyat",
    propertyName: "Lilycrest", propertyAddress: "123", roomNumber: roomA.roomNumber,
    roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
    securityDepositAmount: RATE[sourceType],
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
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

async function doTransfer(reservation, targetRoom, actorId, transferDate) {
  const destBedId = NEEDS_BED.has(targetRoom.type) ? `r${targetRoom.roomNumber}-b1` : undefined;
  jest.setSystemTime(new Date(`${String(transferDate).slice(0, 10)}T10:00:00.000+08:00`));
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

async function wetSignCurrentContract(reservationId) {
  const c = await Contract.findOne({ reservationId, isCurrent: true });
  await Contract.updateOne({ _id: c._id }, { $set: { status: "active" }, $push: { statusHistory: { status: "active", changedBy: null, reason: "test wet-sign" } } });
  // A prior transfer's settlement Bill must be PAID before the next transfer
  // can complete (round-2: TRANSFER_SETTLEMENT_UNPAID gate).
  const { Bill } = await import("../models/index.js");
  const bills = await Bill.find({ reservationId, billType: "transfer_settlement", status: { $ne: "voided" } });
  for (const b of bills) {
    if (Math.round((Number(b.totalAmount || 0) - Number(b.paidAmount || 0)) * 100) / 100 > 0) {
      await Bill.updateOne({ _id: b._id }, { $set: { paidAmount: b.totalAmount, remainingAmount: 0, status: "paid" } });
    }
  }
}

const minimalFinalDocument = (actorId) => ({
  storageKey: "x/final.pdf", fileName: "final.pdf", fileHash: "h", fileSize: 1024,
  mimeType: "application/pdf", pageCount: 4, sourceType: "admin_scan", sourceVersion: 1,
  sourceUploadedAt: new Date(), publishedAt: new Date(), publishedBy: actorId, tenantVisible: true,
});

describe("Phase 10 — renewal + move-out after room transfer", () => {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "phase10" });
  }, 120_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);
  beforeEach(async () => {
    jest.useFakeTimers({
      now: new Date("2026-06-15T10:00:00.000+08:00"),
      doNotFake: ["nextTick", "setImmediate", "setInterval", "setTimeout", "clearInterval", "clearTimeout", "queueMicrotask"],
    });
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
    mockValidate.mockClear();
    mockGenerate.mockClear();
  });

  // ── RENEWAL ──────────────────────────────────────────────────────────
  afterEach(() => { jest.useRealTimers(); });

  test("Quad -> Private then renew: new Stay is on Private; renewal successor carries Private; lineage Original -> Addendum -> Renewal", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("private", "402");
    await doTransfer(reservation, roomB, actorId, "2026-06-15T00:00:00.000Z");
    const addendum = await Contract.findOne({ reservationId: reservation._id, isCurrent: true });
    expect(addendum.contractPurpose).toBe("amendment");
    expect(String(addendum.roomId)).toBe(String(roomB._id));

    // Renew (future-dated, after the current lease end).
    const res = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: "2027-01-01T00:00:00.000Z",
        newLeaseEndDate: "2027-12-31T00:00:00.000Z",
      },
      actorId,
    });

    // The new Stay is on the CURRENT (Private) room, NOT the old Quad.
    expect(String(res.stay.roomId)).toBe(String(roomB._id));
    // Private-room bed representation = the canonical sentinel (Stay.bedId is
    // a required String), carried over from the current Stay — never "".
    expect(res.stay.bedId).toBe(`room-${roomB._id}`);

    // The renewal successor Contract (auto-generated) carries Private + its
    // canonical renewal rate, and roots at the ORIGINAL lease.
    // (autoGenerateRenewalContract is fire-and-forget — poll briefly.)
    let renewal = null;
    for (let i = 0; i < 40 && !renewal; i++) {
      renewal = await Contract.findOne({ reservationId: reservation._id, contractPurpose: "renewal" });
      if (!renewal) await new Promise((r) => setTimeout(r, 50));
    }
    expect(renewal).toBeTruthy();
    expect(String(renewal.roomId)).toBe(String(roomB._id));     // CURRENT room
    expect(renewal.roomType).toBe("private");
    expect(renewal.approvedMonthlyRate).toBe(13500);            // Private long-term canonical rate, not Quad 5400
    expect(String(renewal.parentContractId)).toBe(String(original._id)); // rooted at ORIGINAL
    expect(renewal.contractPurpose).toBe("renewal");            // NOT "amendment"

    // The Addendum is still historical/untouched (its own room + effective date).
    const reloadedAddendum = await Contract.findById(addendum._id);
    expect(reloadedAddendum.contractPurpose).toBe("amendment");
    expect(String(reloadedAddendum.roomId)).toBe(String(roomB._id));
  });

  test("renewal deposit snapshot uses ACTUAL held cash, not a Contract field (unpaid transfer deposit not counted as held)", async () => {
    // Quad(5400) -> Private(13500): additional deposit 8100 billed, NOT paid.
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", securityDepositHeld: 5400 });
    const roomB = await emptyRoom("private", "402");
    await doTransfer(reservation, roomB, actorId, "2026-06-15T00:00:00.000Z");
    const r1 = await Reservation.findById(reservation._id);
    expect(r1.securityDepositHeld).toBe(5400); // unchanged — the 8100 was billed, not paid

    await renewStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, newLeaseStartDate: "2027-01-01T00:00:00.000Z", newLeaseEndDate: "2027-12-31T00:00:00.000Z" },
      actorId,
    });

    let renewal = null;
    for (let i = 0; i < 40 && !renewal; i++) {
      renewal = await Contract.findOne({ reservationId: reservation._id, contractPurpose: "renewal" });
      if (!renewal) await new Promise((r) => setTimeout(r, 50));
    }
    expect(renewal).toBeTruthy();
    // depositAdjustment.heldAmount = actual held (5400), NOT the Addendum's
    // required 13500. So the "additional due" it shows is against real cash.
    expect(renewal.depositAdjustment.heldAmount).toBe(5400);
    expect(renewal.depositAdjustment.requiredAmount).toBe(13500); // 1x Private renewal rate
    expect(renewal.depositAdjustment.adjustmentAmount).toBe(8100);
  });

  test("A(Quad) -> B(Double) -> C(Private) then renew: renewal uses Room C + Room C canonical rate", async () => {
    const { reservation, original, actorId } = await seed({ sourceType: "quadruple-sharing" });
    const roomB = await emptyRoom("double-sharing", "402");
    const roomC = await emptyRoom("private", "503");
    await doTransfer(reservation, roomB, actorId, "2026-04-10T00:00:00.000Z");
    await wetSignCurrentContract(reservation._id);
    await doTransfer(reservation, roomC, actorId, "2026-08-20T00:00:00.000Z");

    await renewStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, newLeaseStartDate: "2027-01-01T00:00:00.000Z", newLeaseEndDate: "2027-12-31T00:00:00.000Z" },
      actorId,
    });
    let renewal = null;
    for (let i = 0; i < 40 && !renewal; i++) {
      renewal = await Contract.findOne({ reservationId: reservation._id, contractPurpose: "renewal" });
      if (!renewal) await new Promise((r) => setTimeout(r, 50));
    }
    expect(renewal).toBeTruthy();
    expect(String(renewal.roomId)).toBe(String(roomC._id));
    expect(renewal.roomType).toBe("private");
    expect(renewal.approvedMonthlyRate).toBe(13500);
    expect(String(renewal.parentContractId)).toBe(String(original._id));
    const stay = await resolveCurrentStayForReservation(reservation._id);
    expect(String(stay.roomId)).toBe(String(roomC._id));
  });

  // ── MOVE-OUT ─────────────────────────────────────────────────────────
  test("Quad -> Private then move out: closes the Private Stay; final electricity cutoff is on the Private room", async () => {
    const { tenant, reservation, actorId, roomA } = await seed({ sourceType: "quadruple-sharing", securityDepositHeld: 5400 });
    const roomB = await emptyRoom("private", "402");
    await doTransfer(reservation, roomB, actorId, "2026-06-15T00:00:00.000Z");

    jest.setSystemTime(new Date("2026-10-16T10:00:00+08:00"));
    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, moveOutDate: "2026-09-30", finalWaterReading:100, finalUtilityReading: 1500, keyReturned: true, forceOverride: true },
      actorId,
    });

    const reloadedRes = await Reservation.findById(reservation._id);
    expect(reloadedRes.status).toBe("moveOut");
    expect(String(reloadedRes.roomId)).toBe(String(roomB._id)); // still the CURRENT room

    const closedStay = await Stay.findOne({ reservationId: reservation._id }).sort({ leaseStartDate: -1 });
    expect(["completed", "terminated"]).toContain(closedStay.status);
    expect(String(closedStay.roomId)).toBe(String(roomB._id));

    // Final electricity moveOut reading is on the CURRENT (Private) room.
    const finalReadings = await UtilityReading.find({
      tenantId: reservation.userId, utilityType: "electricity", eventType: "moveOut",
      date: { $gte: new Date("2026-09-01T00:00:00.000Z") },
    });
    expect(finalReadings.length).toBeGreaterThanOrEqual(1);
    expect(finalReadings.every((r) => String(r.roomId) === String(roomB._id))).toBe(true);
    expect(finalReadings.some((r) => String(r.roomId) === String(roomA._id))).toBe(false);

    // Deposit settlement basis = actual held (5400), NEVER the Private
    // required 13500 (which was billed but not paid).
    expect(reloadedRes.finalSettlementSummary.securityDeposit).toBe(5400);
  });

  test("cheaper-room transfer (Private 13500 -> Quad 5400) then move out: full 13500 held is the refund basis; the 8100 excess is not lost / not a credit", async () => {
    const { tenant, reservation, actorId } = await seed({ sourceType: "private", securityDepositHeld: 13500 });
    const roomB = await emptyRoom("quadruple-sharing", "402");
    await doTransfer(reservation, roomB, actorId, "2026-06-15T00:00:00.000Z");
    const r1 = await Reservation.findById(reservation._id);
    expect(r1.securityDepositHeld).toBe(13500); // excess stays held

    jest.setSystemTime(new Date("2026-10-16T10:00:00+08:00"));
    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, moveOutDate: "2026-09-30", finalWaterReading:100, finalUtilityReading: 900, keyReturned: true, forceOverride: true },
      actorId,
    });
    const reloadedRes = await Reservation.findById(reservation._id);
    // Refund basis = full actual held 13500 (Quad required is only 5400).
    expect(reloadedRes.finalSettlementSummary.securityDeposit).toBe(13500);
    // Not converted to a TenantCredit.
    const credits = await TenantCredit.find({ userId: tenant._id, category: "rent" });
    // (a cheaper-room transfer DOES create a rent credit for excess prepaid
    //  RENT — that's Phase 6 and unrelated to the DEPOSIT excess. The deposit
    //  excess must never appear as a credit.)
    expect(credits.every((c) => c.sourceType !== "deposit")).toBe(true);
  });

  test("legacy securityDepositHeld === null: transfer routes to manual review without fabricating held cash", async () => {
    const { reservation, actorId, roomA } = await seed({ sourceType: "quadruple-sharing", securityDepositHeld: null });
    const roomB = await emptyRoom("private", "402");
    await expect(doTransfer(reservation, roomB, actorId, "2026-06-15T00:00:00.000Z"))
      .rejects.toMatchObject({ code: "ROOM_TRANSFER_DEPOSIT_HELD_UNVERIFIED", manualReviewRequired: true });
    const reloadedRes = await Reservation.findById(reservation._id);
    expect(reloadedRes.securityDepositHeld == null).toBe(true);
    expect(String(reloadedRes.roomId)).toBe(String(roomA._id));
    expect((await Room.findById(roomB._id)).currentOccupancy).toBe(0);
  });

  test("A -> B -> C then move out: closes Room C; historical A/B BedHistory + Addenda untouched", async () => {
    const { reservation, actorId } = await seed({ sourceType: "quadruple-sharing", securityDepositHeld: 5400 });
    const roomB = await emptyRoom("double-sharing", "402");
    const roomC = await emptyRoom("private", "503");
    await doTransfer(reservation, roomB, actorId, "2026-04-10T00:00:00.000Z");
    await wetSignCurrentContract(reservation._id);
    await doTransfer(reservation, roomC, actorId, "2026-08-20T00:00:00.000Z");

    const addendaBefore = await Contract.find({ reservationId: reservation._id, contractPurpose: "amendment" }).sort({ createdAt: 1 });
    expect(addendaBefore).toHaveLength(2);
    const bhTransferredBefore = await BedHistory.find({ reservationId: reservation._id, status: "transferred" }).sort({ moveInDate: 1 });
    expect(bhTransferredBefore).toHaveLength(2);

    jest.setSystemTime(new Date("2026-10-16T10:00:00+08:00"));
    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, moveOutDate: "2026-10-15", finalWaterReading:100, finalUtilityReading: 2000, keyReturned: true, forceOverride: true },
      actorId,
    });

    const stay = await Stay.findOne({ reservationId: reservation._id }).sort({ leaseStartDate: -1 });
    expect(["completed", "terminated"]).toContain(stay.status);
    expect(String(stay.roomId)).toBe(String(roomC._id));

    // Historical A/B addenda + transfer BedHistory rows are byte-for-byte the same.
    const addendaAfter = await Contract.find({ reservationId: reservation._id, contractPurpose: "amendment" }).sort({ createdAt: 1 });
    expect(addendaAfter.map((c) => [String(c._id), String(c.roomId), c.amendmentEffectiveDate?.toISOString()]))
      .toEqual(addendaBefore.map((c) => [String(c._id), String(c.roomId), c.amendmentEffectiveDate?.toISOString()]));
    const bhTransferredAfter = await BedHistory.find({ reservationId: reservation._id, status: "transferred" }).sort({ moveInDate: 1 });
    expect(bhTransferredAfter.map((b) => [String(b._id), String(b.roomId), b.effectiveEndDate?.toISOString()]))
      .toEqual(bhTransferredBefore.map((b) => [String(b._id), String(b.roomId), b.effectiveEndDate?.toISOString()]));

    const waterClosing=await UtilityReading.findOne({roomId:roomC._id,utilityType:'water',eventType:'moveOut'});
    expect(waterClosing.reading).toBe(100);
    expect(waterClosing.date.getTime()).toBe(new Date((await Reservation.findById(reservation._id)).moveOutDate).getTime());
    // Final electricity cutoff is on Room C only.
    const finalReadings = await UtilityReading.find({
      tenantId: reservation.userId, utilityType: "electricity", eventType: "moveOut",
      date: { $gte: new Date("2026-10-01T00:00:00.000Z") },
    });
    expect(finalReadings.every((r) => String(r.roomId) === String(roomC._id))).toBe(true);
  });
});
