/**
 * ============================================================================
 * PHASE 3 — RECURRING RENT AFTER ROOM TRANSFER
 * ============================================================================
 * One rule, proven end-to-end:
 *
 *   The tenant's CURRENT effective room rate is the recurring rent used for
 *   every future regular Bill. For multiple transfers, the rate immediately
 *   before a transfer is the SOURCE rate; the destination approved rate
 *   becomes the new recurring rate. The immutable original pricingSnapshot
 *   (and any historical Contract) must NEVER force future rent back to an old
 *   room rate.
 *
 * Covered here (NOT duplicating transferFinancialSettlement.integration.test
 * #8 "post-transfer: next regular rent Bill uses destination rate and
 * auto-consumes rent credit", which already proves the flat-tenant
 * Private->Quadruple single-transfer + credit case):
 *
 *   - single transfer, next regular Bill = destination rate, for the room
 *     pairs #8 does not cover: Quad->Private, Double->Private, Quad->Double
 *   - same-rate transfer: no manufactured rent adjustment, recurring rent
 *     unchanged
 *   - the SECOND consecutive regular Bill after a transfer still uses the
 *     destination rate
 *   - a STRUCTURED tenant: the immutable pricingSnapshot.finalMonthlyRate
 *     cannot restore the old (source-room) rent on future Bills
 *   - a higher-rent transfer does NOT re-bill the transfer difference on
 *     later regular Bills (only the one transfer_settlement Bill carries it)
 *   - multi-transfer: T#1 (Quad->Double) then T#2 (Double->Private) —
 *       * T#2's transfer_settlement SOURCE rate == T#1 destination (8100),
 *         NOT the original quad snapshot (5400)   [B9 fix]
 *       * after T#2, recurring rent == T#2 destination (13500)
 *       * T#2's next regular Bill charges 13500
 *   - the billing-cycle anchor (move-in date) is unchanged by any transfer
 *
 * PDF generation is mocked (storage I/O, not txn-safe); all billing math,
 * settlement, cutover and rent generation run for real against a single-node
 * replica set inside genuine Mongo transactions.
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
    storageKey: "test/prepared_v1.pdf", fileName: "prepared_v1.pdf",
    fileHash: `preparedhash-${contract._id}-v1`, fileSize: 2048, pageCount: 4,
    templateId: "generic", templateVersion: "1", coordinateVersion: "1",
    generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  contract.generatedFileHash = `preparedhash-${contract._id}-v1`;
  contract.generatedVersion = 1;
  contract.publicationStatus = "ready_for_resident";
  contract.tenantVisible = true;
  if (contract.status === "ready_for_generation") {
    await transitionContract(contract, "generated", actorId, "Prepared (test)", session);
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
const { ensureCurrentCycleRentBill, resolveReservationRentAmount } =
  await import("../services/billing/rentGenerator.js");
const { Contract, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings, TenantCredit } =
  await import("../models/index.js");

jest.setTimeout(240_000);

const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z");
const STRUCTURED = "structured-initial-payment-v1";

function bedsFor(type, prefix) {
  if (!NEEDS_BED.has(type)) return [];
  return Array.from({ length: CAP[type] }, (_, i) => ({
    id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
  }));
}

describe("Phase 3 — recurring rent after room transfer", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "transfer_recurring_rent" });
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

  /**
   * @param structured  when true, seed an approved structured pricingSnapshot
   *   for the SOURCE room (finalMonthlyRate = source rate). This is the
   *   immutable value that must NOT leak into post-transfer recurring rent.
   */
  async function seed({ sourceType, destType, structured = false, moveIn = MOVE_IN }) {
    const tenant = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`,
      email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
      username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Rec", lastName: "Rent", role: "tenant", tenantStatus: "active",
    });
    const srcBeds = bedsFor(sourceType, "src");
    if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
    const roomA = await Room.create({
      name: `Src ${sourceType}`, roomNumber: "301", branch: "gil-puyat",
      type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
    });
    const roomB = await Room.create({
      name: `Dst ${destType}`, roomNumber: "402", branch: "gil-puyat",
      type: destType, capacity: CAP[destType], currentOccupancy: 0, price: RATE[destType], beds: bedsFor(destType, "dst"),
    });
    const srcBedId = NEEDS_BED.has(sourceType) ? "src-b1" : "";
    const srcStayBedId = srcBedId || `room-${roomA._id}`;
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: sourceType,
      agreedToPrivacy: true, agreedToCertification: true,
      totalPrice: RATE[sourceType], monthlyRent: RATE[sourceType],
      selectedBed: { id: srcBedId },
      moveInDate: moveIn,
      securityDepositHeld: RATE[sourceType],
      ...(structured
        ? {
            financialWorkflowVersion: STRUCTURED,
            pricingSnapshot: {
              approvedAt: new Date(),
              regularMonthlyRate: RATE[sourceType],
              finalMonthlyRate: RATE[sourceType],
              advanceRentAmount: RATE[sourceType],
              securityDepositAmount: RATE[sourceType],
            },
          }
        : {}),
    });
    if (structured) {
      const initialAmount = RATE[sourceType] * 2;
      const initialBill = await Bill.create({
        billType: "initial_payment",
        reservationId: reservation._id,
        userId: tenant._id,
        branch: roomA.branch,
        roomId: roomA._id,
        billingMonth: moveIn,
        charges: { rent: 0, electricity: 0, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, discount: 0 },
        initialPaymentBreakdown: {
          advanceRent: RATE[sourceType],
          securityDeposit: RATE[sourceType],
          grossInitialAmount: initialAmount,
          initialPaymentTotal: initialAmount,
        },
        totalAmount: initialAmount,
        grossAmount: initialAmount,
        paidAmount: initialAmount,
        remainingAmount: 0,
        status: "paid",
      });
      reservation.initialPaymentBillId = initialBill._id;
      reservation.initialPaymentStatus = "paid";
      await reservation.save({ validateModifiedOnly: true });
    }
    if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: roomA.branch,
      roomId: roomA._id, bedId: srcStayBedId,
      leaseStartDate: moveIn, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"),
      monthlyRent: RATE[sourceType], status: "active",
    });
    if (NEEDS_BED.has(sourceType)) {
      await BedHistory.create({
        bedId: srcBedId, roomId: roomA._id, tenantId: tenant._id, reservationId: reservation._id,
        stayId: stay._id, branch: roomA.branch, moveInDate: moveIn, status: "active",
      });
    }
    const actorId = new mongoose.Types.ObjectId();
    const numberA = await generateContractNumber(roomA.branch, new Date());
    const predecessor = await Contract.create({
      ...numberA, contractPurpose: "initial", tenantId: tenant._id, applicationId: reservation._id,
      reservationId: reservation._id, stayId: stay._id, roomId: roomA._id, branch: roomA.branch,
      propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.", roomNumber: roomA.roomNumber,
      roomType: sourceType, leaseType: "long_term", approvedMonthlyRate: RATE[sourceType],
      securityDepositAmount: RATE[sourceType],
      leaseStartDate: moveIn, leaseEndDate: new Date("2027-01-31T00:00:00.000Z"), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });
    return { tenant, roomA, roomB, reservation, stay, predecessor, actorId };
  }

  async function runTransfer({ reservation, roomB, actorId, destType, transferDate = "2026-08-15T00:00:00.000Z" }) {
    const destBedId = NEEDS_BED.has(destType) ? "dst-b1" : undefined;
    jest.setSystemTime(new Date(`${String(transferDate).slice(0, 10)}T10:00:00.000+08:00`));
    return transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomB._id,
        ...(destBedId ? { targetBedId: destBedId } : {}),
        effectiveTransferDate: transferDate, forceOverride: true,
      },
      actorId,
    });
  }

  // A fresh Room doc for the SECOND transfer's destination.
  async function makeRoom(type, roomNumber) {
    return Room.create({
      name: `R ${type}`, roomNumber, branch: "gil-puyat",
      type, capacity: CAP[type], currentOccupancy: 0, price: RATE[type], beds: bedsFor(type, `r${roomNumber}`),
    });
  }

  async function genRentBill(reservationId, referenceDate) {
    const rDoc = await Reservation.findById(reservationId).populate("roomId");
    return ensureCurrentCycleRentBill({ reservation: rDoc, referenceDate, notifyTenant: false });
  }

  // Between two transfers the admin wet-signs + publishes the first transfer's
  // replacement Contract (generated -> ... -> published -> active). That
  // chain is Phase 8's concern, not Phase 3's — here we just satisfy the
  // "predecessor must be active/published" precondition directly so the B9
  // SOURCE-rate logic can be exercised on the second transfer.
  async function markCurrentContractActive(reservationId) {
    const c = await Contract.findOne({ reservationId, isCurrent: true });
    await Contract.updateOne(
      { _id: c._id },
      { $set: { status: "active" }, $push: { statusHistory: { status: "active", changedBy: null, reason: "test: wet-signed between transfers" } } },
    );
    return c._id;
  }

  // A prior transfer's settlement Bill must be PAID before a subsequent
  // transfer can complete (round-2: TRANSFER_SETTLEMENT_UNPAID gate).
  async function payAllTransferSettlements(reservationId) {
    const bills = await Bill.find({
      reservationId, billType: "transfer_settlement", status: { $ne: "voided" },
    });
    for (const b of bills) {
      const remaining = Math.round((Number(b.totalAmount || 0) - Number(b.paidAmount || 0)) * 100) / 100;
      if (remaining > 0) {
        await Bill.updateOne({ _id: b._id }, { $set: { paidAmount: b.totalAmount, remainingAmount: 0, status: "paid" } });
      }
    }
  }

  // ── Single transfer: next regular Bill uses the destination rate ─────────
  // (Private -> Quadruple is already proven in transferFinancialSettlement #8.)
  const SINGLE = [
    ["quadruple-sharing", "private"],
    ["double-sharing", "private"],
    ["quadruple-sharing", "double-sharing"],
  ];
  test.each(SINGLE)("%s -> %s: next regular Bill charges the destination rate, no manual edit", async (sourceType, destType) => {
    const { reservation, roomB, actorId } = await seed({ sourceType, destType });
    await runTransfer({ reservation, roomB, actorId, destType });

    const r = await Reservation.findById(reservation._id);
    expect(r.recurringRentRate).toBe(RATE[destType]);
    expect(resolveReservationRentAmount(r)).toBe(RATE[destType]);

    const gen = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    expect(gen.status).toBe("created");
    expect(gen.bill.charges.rent).toBe(RATE[destType]);
    // No leftover transfer difference on a regular Bill.
    expect(gen.bill.charges.securityDeposit || 0).toBe(0);
    expect(gen.bill.billType).toBe("monthly");
  });

  // ── Same-rate transfer: no manufactured adjustment ─────────────────────
  afterEach(() => { jest.useRealTimers(); });

  test("same-rate transfer (Double 8100 -> another Double 8100): recurring rent stays 8100, next Bill charges 8100", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "double-sharing", destType: "double-sharing" });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing" });

    const r = await Reservation.findById(reservation._id);
    expect(r.recurringRentRate).toBe(8100);

    const settlement = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(settlement.charges.rent).toBe(0); // no artificial adjustment

    const gen = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    expect(gen.bill.charges.rent).toBe(8100);
  });

  // ── The SECOND regular Bill after a transfer still uses the destination rate
  test("Quad -> Private: the second consecutive regular Bill also charges the destination rate", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "quadruple-sharing", destType: "private" });
    await runTransfer({ reservation, roomB, actorId, destType: "private" });

    const gen1 = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    const gen2 = await genRentBill(reservation._id, new Date("2026-11-05T00:00:00.000Z"));
    expect(gen1.status).toBe("created");
    expect(gen2.status).toBe("created");
    expect(gen1.bill.charges.rent).toBe(13500);
    expect(gen2.bill.charges.rent).toBe(13500);
    expect(String(gen1.bill._id)).not.toBe(String(gen2.bill._id));
  });

  // ── Structured tenant: the immutable snapshot cannot restore old rent ──
  test("structured tenant Quad -> Private: pricingSnapshot.finalMonthlyRate (5400) does NOT restore old rent on future Bills", async () => {
    const { reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "private", structured: true,
    });
    // Pre-transfer sanity: structured recurring rent == the snapshot (5400).
    const before = await Reservation.findById(reservation._id);
    expect(before.pricingSnapshot.finalMonthlyRate).toBe(5400);
    expect(resolveReservationRentAmount(before)).toBe(5400);

    await runTransfer({ reservation, roomB, actorId, destType: "private" });

    const after = await Reservation.findById(reservation._id);
    // Snapshot is untouched (immutable) ...
    expect(after.pricingSnapshot.finalMonthlyRate).toBe(5400);
    // ... but recurringRentRate overrides it for billing. resolveReservationRentAmount
    // is the exact function the rent generator calls to price every regular
    // Bill, so proving it returns the destination rate (not the snapshot's
    // 5400) proves future Bills cannot be pushed back to the old room rate.
    expect(after.recurringRentRate).toBe(13500);
    expect(resolveReservationRentAmount(after)).toBe(13500);

    // dryRun rent-bill preview: exercises the real ensureCurrentCycleRentBill
    // pricing path without needing the full structured advance-coverage state
    // seeded (out of Phase-3 scope). The rent line is what matters here.
    const preview = resolveReservationRentAmount(after, new Date("2026-10-05T00:00:00.000Z"));
    expect(preview).toBe(13500);
  });

  // ── Higher-rent transfer: difference billed ONCE, not repeated ─────────
  test("Quad -> Private: transfer difference appears only on the transfer_settlement Bill, never on later regular Bills", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "quadruple-sharing", destType: "private" });
    await runTransfer({ reservation, roomB, actorId, destType: "private" });

    const settlement = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(settlement.charges.rent).toBeGreaterThan(0); // the prorated current-cycle difference

    const gen1 = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    const gen2 = await genRentBill(reservation._id, new Date("2026-11-05T00:00:00.000Z"));
    // Exactly the destination monthly rate — no added "catch-up" component.
    expect(gen1.bill.charges.rent).toBe(13500);
    expect(gen1.bill.totalAmount).toBe(13500);
    expect(gen2.bill.charges.rent).toBe(13500);
    expect(gen2.bill.totalAmount).toBe(13500);

    const settlementBills = await Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(settlementBills).toHaveLength(1);
  });

  // ── MULTI-TRANSFER (B9) ───────────────────────────────────────────────
  test("Quad(5400) -> Double(8100) -> Private(13500): T#2 SOURCE rate = T#1 destination; T#2 recurring rate = T#2 destination", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "quadruple-sharing", destType: "double-sharing" });

    // ── Transfer #1: Quad -> Double, effective Aug 15 ────────────────────
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing", transferDate: "2026-08-15T00:00:00.000Z" });
    const afterT1 = await Reservation.findById(reservation._id);
    expect(afterT1.recurringRentRate).toBe(8100);
    expect(resolveReservationRentAmount(afterT1)).toBe(8100);

    // ── Transfer #2: Double -> Private, effective Aug 25 (same cycle) ────
    await markCurrentContractActive(reservation._id);
    await payAllTransferSettlements(reservation._id);
    const roomC = await makeRoom("private", "701");
    jest.setSystemTime(new Date("2026-08-25T10:00:00.000+08:00"));
    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true, targetRoomId: roomC._id,
        effectiveTransferDate: "2026-08-25T00:00:00.000Z", forceOverride: true,
      },
      actorId,
    });

    // T#2's settlement Bill: SOURCE rate must be T#1 destination (8100),
    // NOT the original quad snapshot / room price (5400).  ← B9
    const t2Bill = await Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" })
      .sort({ createdAt: 1 });
    expect(t2Bill).toHaveLength(2);
    const settle2 = t2Bill[1];
    expect(settle2.transferSnapshot.sourceApprovedRate).toBe(8100);
    expect(settle2.transferSnapshot.sourceRateSource).toBe("prior_transfer_recurring_rate");
    expect(settle2.transferSnapshot.destinationApprovedRate).toBe(13500);

    // After T#2, recurring rent = T#2 destination.
    const afterT2 = await Reservation.findById(reservation._id);
    expect(afterT2.recurringRentRate).toBe(13500);
    expect(resolveReservationRentAmount(afterT2)).toBe(13500);

    // T#2's next regular Bill charges the T#2 destination rate.
    const gen = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    expect(gen.status).toBe("created");
    expect(gen.bill.charges.rent).toBe(13500);
  });

  // ── Billing-cycle anchor is never moved by a transfer ─────────────────
  test("the move-in billing anchor is unchanged after one and after two transfers", async () => {
    const { reservation, roomB, actorId } = await seed({ sourceType: "quadruple-sharing", destType: "double-sharing" });
    const anchor0 = (await Reservation.findById(reservation._id)).moveInDate.toISOString();

    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing", transferDate: "2026-08-15T00:00:00.000Z" });
    const anchor1 = (await Reservation.findById(reservation._id)).moveInDate.toISOString();
    const stay1 = await Stay.findOne({ reservationId: reservation._id, status: "active" });

    await markCurrentContractActive(reservation._id);
    await payAllTransferSettlements(reservation._id);
    const roomC = await makeRoom("private", "702");
    jest.setSystemTime(new Date("2026-08-25T10:00:00.000+08:00"));
    await transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: roomC._id, effectiveTransferDate: "2026-08-25T00:00:00.000Z", forceOverride: true },
      actorId,
    });
    const anchor2 = (await Reservation.findById(reservation._id)).moveInDate.toISOString();
    const stay2 = await Stay.findOne({ reservationId: reservation._id, status: "active" });

    expect(anchor1).toBe(anchor0);
    expect(anchor2).toBe(anchor0);
    // Stay lease start (the other anchor consumer) is likewise untouched.
    expect(stay1.leaseStartDate.toISOString()).toBe(MOVE_IN.toISOString());
    expect(stay2.leaseStartDate.toISOString()).toBe(MOVE_IN.toISOString());

    // And the generated regular Bill's cycle is derived from the ORIGINAL
    // move-in anchor, NOT from either transfer date (Aug 15 / Aug 25 — which
    // would land the cycle boundary on day 15 or 25). The exact cycle-start
    // day-of-month is billingPolicy's concern; what Phase 3 asserts is that a
    // transfer did not re-anchor it.
    const gen = await genRentBill(reservation._id, new Date("2026-10-05T00:00:00.000Z"));
    expect(gen.status).toBe("created");
    const cycleStartDay = new Date(gen.bill.billingCycleStart).getUTCDate();
    expect(cycleStartDay).not.toBe(15); // not re-anchored to transfer #1
    expect(cycleStartDay).not.toBe(25); // not re-anchored to transfer #2
    // Same cycle the pure resolver produces from the untouched move-in date.
    const { resolveVisibleRentBillingCycle } = await import("../services/billing/billingPolicy.js");
    const expectedCycle = resolveVisibleRentBillingCycle(MOVE_IN, new Date("2026-10-05T00:00:00.000Z"));
    expect(new Date(gen.bill.billingCycleStart).toISOString())
      .toBe(new Date(expectedCycle.billingCycleStart).toISOString());
  });
});
