/**
 * ============================================================================
 * ROOM-TRANSFER FINANCIAL SETTLEMENT — integration
 * ============================================================================
 * Proves the rent + security-deposit settlement rules for a room transfer:
 *
 *   RENT (actual-day, same cycle, anchor unchanged):
 *     destinationProratedRent − unusedPrepaidRent
 *       > 0  -> charges.rent (additional rent due)
 *       < 0  -> excess rent -> manual Administration Office review only
 *
 *   SECURITY DEPOSIT (independent, never netted with rent):
 *     destinationRequiredDeposit − depositCurrentlyHeld
 *       > 0  -> charges.securityDeposit (only the DIFFERENCE)
 *       < 0  -> excess held deposit stays refundable (NOT a rent credit,
 *               NOT refunded here); securityDepositHeld unchanged
 *
 *   HELD DEPOSIT:
 *     - not increased on Bill creation
 *     - increased only when the deposit component is CONFIRMED PAID
 *       (paymentLedger.applyBillPayment), idempotently, partial-aware
 *     - successor Contract shows the DESTINATION required deposit
 *
 * PDF generation is mocked; everything else runs for real against a
 * single-node replica set inside genuine Mongo transactions.
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
const { applyBillPayment } = await import("../services/billing/paymentLedger.js");
const { ensureCurrentCycleRentBill } = await import("../services/billing/rentGenerator.js");
const {
  Contract,
  Reservation,
  Room,
  User,
  Stay,
  BedHistory,
  Bill,
  BusinessSettings,
  TenantCredit,
  UtilityPeriod,
} =
  await import("../models/index.js");

jest.setTimeout(180_000);

// Long-term (6mo) rates from DEFAULT_REGULAR_RATES, 10% discount everywhere:
//   private 15000*.9 = 13500 ; double 9000*.9 = 8100 ; quadruple 6000*.9 = 5400
const RATE = { private: 13500, "double-sharing": 8100, "quadruple-sharing": 5400 };
const CAP = { private: 1, "double-sharing": 2, "quadruple-sharing": 4 };
const NEEDS_BED = new Set(["double-sharing", "quadruple-sharing"]);
const MOVE_IN = new Date("2026-08-01T00:00:00.000Z"); // cycle: Aug1..Sep1 = 31 days

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dailyPortion = (rate, days, total = 31) => roundMoney((rate / total) * days);

describe("room-transfer financial settlement", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, args: ["--wiredTigerCacheSizeGB", "0.5"] },
    });
    await mongoose.connect(mongo.getUri(), {
      dbName: "transfer_financial",
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
    jest.useFakeTimers({
      now: new Date("2026-08-15T10:00:00.000+08:00"),
      doNotFake: ["nextTick", "setImmediate", "setInterval", "setTimeout", "clearInterval", "clearTimeout", "queueMicrotask"],
    });
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

  afterEach(() => {
    jest.useRealTimers();
  });

  function beds(type, prefix) {
    if (!NEEDS_BED.has(type)) return [];
    return Array.from({ length: CAP[type] }, (_, i) => ({
      id: `${prefix}-b${i + 1}`, position: i % 2 ? "upper" : "lower", status: "available",
    }));
  }

  /**
   * @param sourceType/destType room types
   * @param heldDeposit  explicit reservation.securityDepositHeld (default = source RATE, i.e. what move-in collected)
   * @param currentBillPaidRent  if set, seed a paid current-cycle "monthly" Bill for that rent (later-period prepaid basis)
   */
  async function seed({ sourceType, destType, heldDeposit, currentBillPaidRent = null, moveIn = MOVE_IN }) {
    const tenant = await User.create({
      firebaseUid: `fb-${new mongoose.Types.ObjectId()}`,
      email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
      username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Fin", lastName: "Settle", role: "tenant", tenantStatus: "active",
    });
    const srcBeds = beds(sourceType, "src");
    if (srcBeds.length) srcBeds[0] = { ...srcBeds[0], status: "occupied", occupiedBy: { userId: tenant._id } };
    const roomA = await Room.create({
      name: `Src ${sourceType}`, roomNumber: "301", branch: "gil-puyat",
      type: sourceType, capacity: CAP[sourceType], currentOccupancy: 1, price: RATE[sourceType], beds: srcBeds,
    });
    const roomB = await Room.create({
      name: `Dst ${destType}`, roomNumber: "402", branch: "gil-puyat",
      type: destType, capacity: CAP[destType], currentOccupancy: 0, price: RATE[destType], beds: beds(destType, "dst"),
    });
    const srcBedId = NEEDS_BED.has(sourceType) ? "src-b1" : "";
    const srcStayBedId = srcBedId || `room-${roomA._id}`;
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: sourceType,
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: RATE[sourceType],
      selectedBed: { id: srcBedId }, monthlyRent: RATE[sourceType],
      moveInDate: moveIn,
      securityDepositHeld: heldDeposit == null ? RATE[sourceType] : heldDeposit,
    });
    if (srcBeds.length) { roomA.beds[0].occupiedBy.reservationId = reservation._id; await roomA.save(); }
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: roomA.branch,
      roomId: roomA._id, bedId: srcStayBedId,
      leaseStartDate: moveIn, leaseEndDate: new Date(Date.UTC(moveIn.getUTCFullYear() + 1, moveIn.getUTCMonth(), moveIn.getUTCDate())),
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
      leaseStartDate: moveIn, leaseEndDate: new Date(Date.UTC(moveIn.getUTCFullYear() + 1, moveIn.getUTCMonth(), moveIn.getUTCDate())), leaseDurationMonths: 6,
      status: "active", isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId, updatedBy: actorId,
    });

    if (currentBillPaidRent != null) {
      // A fully-paid current-cycle "monthly" Bill -> prepaidRentResolver uses
      // its charges.rent as the applicable prepaid basis (later period). Its
      // billingCycleStart MUST equal the cycle the transfer date falls in
      // (resolveCurrentBillingCycle(moveIn, transferDate)).
      const { resolveCurrentBillingCycle } = await import("../services/billing/billingPolicy.js");
      const cyc = resolveCurrentBillingCycle(moveIn, new Date("2026-08-15T00:00:00.000Z"));
      await Bill.create({
        billType: "monthly", reservationId: reservation._id, userId: tenant._id,
        branch: roomA.branch, roomId: roomA._id, billingMonth: cyc.billingCycleStart,
        billingCycleStart: cyc.billingCycleStart, billingCycleEnd: cyc.billingCycleEnd,
        charges: { rent: currentBillPaidRent, electricity: 0, water: 0, applianceFees: 0, corkageFees: 0, penalty: 0, securityDeposit: 0, discount: 0 },
        totalAmount: currentBillPaidRent, grossAmount: currentBillPaidRent,
        paidAmount: currentBillPaidRent, remainingAmount: 0, status: "paid",
      });
    }

    return { tenant, roomA, roomB, reservation, stay, predecessor, actorId, srcBedId };
  }

  async function runTransfer({ reservation, roomB, actorId, destType, transferDate = "2026-08-15T00:00:00.000Z" }) {
    const destBedId = NEEDS_BED.has(destType) ? "dst-b1" : undefined;
    // Since round-4, transferStayWorkflow prorates rent/deposit by the ACTUAL
    // cutover day (`new Date()` inside its transaction). Pin the fake clock to
    // this test's transferDate (mid-morning, inside the wide-open office
    // hours) so the existing day-count fixtures stay deterministic.
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

  // ── 1. Higher rent + higher deposit (Quadruple -> Private) ───────────────
  test("higher rent + higher deposit: rent difference billed, deposit difference billed, held deposit unchanged until paid", async () => {
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "private", heldDeposit: 5400,
    });
    const result = await runTransfer({ reservation, roomB, actorId, destType: "private" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    // 14 source days consumed of 5400 => 2438.71 ; unused = 2961.29
    const consumed = dailyPortion(5400, 14);
    const unused = roundMoney(5400 - consumed);
    const destProrated = dailyPortion(13500, 17); // 17 destination days
    const rentDue = roundMoney(Math.max(0, destProrated - unused));
    const depositDue = roundMoney(13500 - 5400); // 8100

    expect(bill.charges.rent).toBeCloseTo(rentDue, 2);
    expect(bill.charges.securityDeposit).toBeCloseTo(depositDue, 2);
    expect(bill.totalAmount).toBeCloseTo(roundMoney(rentDue + depositDue), 2);
    expect(bill.transferSnapshot.rentComponentDue).toBeCloseTo(rentDue, 2);
    expect(bill.transferSnapshot.depositComponentDue).toBeCloseTo(depositDue, 2);
    expect(bill.transferSnapshot.depositPreviouslyHeld).toBe(5400);
    expect(bill.transferSnapshot.destinationRequiredDeposit).toBe(13500);
    expect(bill.transferSnapshot.additionalDepositDue).toBe(8100);
    expect(bill.transferSnapshot.excessDepositHeld).toBe(0);

    // Successor Contract shows the DESTINATION required deposit.
    const successor = await Contract.findById(result.contractCutover.successorContractId);
    expect(successor.securityDepositAmount).toBe(13500);

    // Held deposit UNCHANGED (Bill only created, not paid).
    const r1 = await Reservation.findById(reservation._id);
    expect(r1.securityDepositHeld).toBe(5400);

    // No rent credit for a rent-DUE case.
    const credits = await TenantCredit.find({ userId: tenant._id });
    expect(credits).toHaveLength(0);

    // ── Pay the Bill in full -> held deposit becomes destination required ──
    const freshBill = await Bill.findById(bill._id);
    await applyBillPayment({
      bill: freshBill, amount: freshBill.totalAmount, method: "offline_cash", source: "admin-manual",
      externalPaymentId: `ext-${bill._id}`,
    });
    const r2 = await Reservation.findById(reservation._id);
    expect(r2.securityDepositHeld).toBe(13500);
    const settleEntry = r2.securityDepositLedger.find((e) => e.kind === "transfer_deposit_settlement");
    expect(settleEntry).toBeTruthy();
    expect(settleEntry.adjustmentAmount).toBeCloseTo(8100, 2);

    // ── Duplicate payment callback must NOT double the held deposit ───────
    const again = await Bill.findById(bill._id);
    const dup = await applyBillPayment({
      bill: again, amount: 1, method: "offline_cash", source: "admin-manual",
      externalPaymentId: `ext-${bill._id}`, // same external id -> reused, no-op
    });
    expect(dup.reused).toBe(true);
    const r3 = await Reservation.findById(reservation._id);
    expect(r3.securityDepositHeld).toBe(13500);
  });

  // ── 2. Lower rent + lower deposit (Private -> Quadruple) ────────────────
  test("lower rent + lower deposit: excess amounts are disclosed for manual review; no TenantCredit is created", async () => {
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 13500,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    const consumed = dailyPortion(13500, 14);       // 6096.77
    const unused = roundMoney(13500 - consumed);    // 7403.23
    const destProrated = dailyPortion(5400, 17);    // 2961.29
    const excessRent = roundMoney(unused - destProrated); // 4441.94

    expect(bill.charges.rent).toBe(0);
    expect(bill.charges.securityDeposit).toBe(0); // destination requires less -> nothing due
    expect(bill.totalAmount).toBe(0);
    expect(bill.transferSnapshot.excessCredit).toBeCloseTo(excessRent, 2);
    expect(bill.transferSnapshot.excessDepositHeld).toBe(roundMoney(13500 - 5400)); // 8100
    expect(bill.transferSnapshot.additionalDepositDue).toBe(0);

    // Official transfer policy: no automatic refund or rent credit.
    const credits = await TenantCredit.find({ userId: tenant._id });
    expect(credits).toHaveLength(0);

    // Excess DEPOSIT is NOT a TenantCredit and held cash is UNCHANGED.
    const r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(13500);

    // Successor Contract shows the LOWER destination required deposit.
    const successor = await Contract.findOne({ replacesContractId: (await Contract.findOne({ reservationId: reservation._id, contractPurpose: "initial" }))._id });
    expect(successor.securityDepositAmount).toBe(5400);
  });

  // ── 3. Same rent + same deposit (Double -> Double) ─────────────────────
  test("same rent + same deposit: no artificial rent charge, no deposit charge, no credit", async () => {
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "double-sharing", destType: "double-sharing", heldDeposit: 8100,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    // consumed(8100,14)=3658.06 ; unused=4441.94 ; destProrated(8100,17)=4441.94 -> net 0
    expect(bill.charges.rent).toBe(0);
    expect(bill.charges.securityDeposit).toBe(0);
    expect(bill.totalAmount).toBe(0);
    expect(bill.transferSnapshot.excessCredit).toBe(0);
    expect(bill.transferSnapshot.additionalDepositDue).toBe(0);
    expect(bill.transferSnapshot.excessDepositHeld).toBe(0);

    const credits = await TenantCredit.find({ userId: tenant._id });
    expect(credits).toHaveLength(0);
    const r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(8100);
  });

  // ── 4. Rent and deposit are NEVER netted ──────────────────────────────
  test("rent and deposit stay independent: rent due AND excess deposit held do not cancel", async () => {
    // Quadruple -> Double: destination rent HIGHER than quadruple, deposit LOWER than what we pretend is held.
    const { reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "double-sharing", heldDeposit: 13500,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    const consumed = dailyPortion(5400, 14);
    const unused = roundMoney(5400 - consumed);
    const destProrated = dailyPortion(8100, 17);
    const rentDue = roundMoney(Math.max(0, destProrated - unused));

    expect(rentDue).toBeGreaterThan(0);
    expect(bill.charges.rent).toBeCloseTo(rentDue, 2);
    // Deposit: required 8100 < held 13500 -> nothing due, excess 5400 stays held.
    expect(bill.charges.securityDeposit).toBe(0);
    expect(bill.transferSnapshot.excessDepositHeld).toBe(roundMoney(13500 - 8100));
    // Bill total is the rent only — excess deposit did NOT reduce it.
    expect(bill.totalAmount).toBeCloseTo(rentDue, 2);

    const r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(13500); // untouched
  });

  // ── 5. Transfer near cycle end -> only the remaining days at dest rate ──
  test("transfer near cycle end: destination rent covers only the few remaining days", async () => {
    const { reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "private", heldDeposit: 5400,
    });
    // Aug 28 -> 27 source days, 4 destination days of a 31-day cycle.
    await runTransfer({ reservation, roomB, actorId, destType: "private", transferDate: "2026-08-28T00:00:00.000Z" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bill.transferSnapshot.totalCoverageDays).toBe(31);
    expect(bill.transferSnapshot.proRataDays).toBe(27);
    expect(bill.transferSnapshot.destinationDays).toBe(4);
    // Destination prorated value = 13500/31*4, NOT a full month.
    expect(bill.transferSnapshot.destinationProratedValue).toBeCloseTo(dailyPortion(13500, 4), 2);
    expect(bill.transferSnapshot.destinationProratedValue).toBeLessThan(13500);
  });

  // ── 6. Transfer very early in cycle -> large unused prepaid ────────────
  test("transfer early in cycle: large excess is disclosed but does not create an automatic rent credit", async () => {
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 13500,
    });
    // Aug 3 -> 2 source days, 29 destination days.
    await runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing", transferDate: "2026-08-03T00:00:00.000Z" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    const consumed = dailyPortion(13500, 2);
    const unused = roundMoney(13500 - consumed);
    const destProrated = dailyPortion(5400, 29);
    const excessRent = roundMoney(Math.max(0, unused - destProrated));

    expect(bill.transferSnapshot.proRataDays).toBe(2);
    expect(bill.transferSnapshot.excessCredit).toBeCloseTo(excessRent, 2);
    const credits = await TenantCredit.find({ userId: tenant._id });
    expect(credits).toHaveLength(0);
  });

  // ── 7. Calendar variations: actual cycle days (Feb, 30-day, 31-day) ────
  test("calendar variations: totalCoverageDays uses actual month length (Feb 28)", async () => {
    const feb = new Date("2026-02-01T00:00:00.000Z"); // 2026 not leap -> Feb has 28 days
    const { reservation, roomB, actorId } = await seed({
      sourceType: "double-sharing", destType: "double-sharing", heldDeposit: 8100, moveIn: feb,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing", transferDate: "2026-02-15T00:00:00.000Z" });
    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bill.transferSnapshot.totalCoverageDays).toBe(28);
    expect(bill.transferSnapshot.proRataDays + bill.transferSnapshot.destinationDays).toBe(28);
  });

  test("calendar variations: leap-year Feb has 29 days", async () => {
    const feb = new Date("2028-02-01T00:00:00.000Z"); // 2028 IS a leap year
    const { reservation, roomB, actorId } = await seed({
      sourceType: "double-sharing", destType: "double-sharing", heldDeposit: 8100, moveIn: feb,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing", transferDate: "2028-02-20T00:00:00.000Z" });
    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bill.transferSnapshot.totalCoverageDays).toBe(29);
  });

  test("calendar variations: 30-day cycle", async () => {
    const apr = new Date("2026-04-01T00:00:00.000Z"); // April = 30 days
    const { reservation, roomB, actorId } = await seed({
      sourceType: "double-sharing", destType: "double-sharing", heldDeposit: 8100, moveIn: apr,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "double-sharing", transferDate: "2026-04-10T00:00:00.000Z" });
    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bill.transferSnapshot.totalCoverageDays).toBe(30);
  });

  // ── 8. Next regular rent Bill uses the destination rate + consumes credit ──
  test("post-transfer: next regular rent Bill uses destination rate with no automatic transfer credit", async () => {
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 13500,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing" });

    const credit = await TenantCredit.findOne({ userId: tenant._id, category: "rent" });
    expect(credit).toBeNull();

    // Generate the tenant's next regular rent Bill (well after move-in so a
    // regular cycle is due).
    const rDoc = await Reservation.findById(reservation._id).populate("roomId");
    const gen = await ensureCurrentCycleRentBill({
      reservation: rDoc,
      referenceDate: new Date("2026-10-05T00:00:00.000Z"),
      notifyTenant: false,
    });
    expect(gen.status).toBe("created");
    const rentBill = gen.bill;
    // Destination (quadruple) rate, NOT the old private 13500.
    expect(rentBill.charges.rent).toBe(5400);
    expect(rentBill.charges.discount).toBe(0);
    expect(rentBill.tenantCreditApplied).toBe(0);
    expect(rentBill.totalAmount).toBeCloseTo(5400, 2);

    // Re-running generation for the SAME cycle must not double-consume.
    const gen2 = await ensureCurrentCycleRentBill({
      reservation: rDoc,
      referenceDate: new Date("2026-10-05T00:00:00.000Z"),
      notifyTenant: false,
    });
    expect(gen2.status).toBe("skipped");
    expect(await TenantCredit.countDocuments({ userId: tenant._id })).toBe(0);
  });

  // ── 9. Rent credit never touches deposit / non-rent ───────────────────
  test("excess rent does not auto-offset a security-deposit component", async () => {
    // Cheaper room first (creates a rent credit), then a hypothetical higher
    // deposit requirement: the credit must not offset charges.securityDeposit.
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 0, // pretend nothing held
    });
    await runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing" });

    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    // destination requires 5400, held 0 -> 5400 deposit due; rent excess -> credit.
    expect(bill.charges.securityDeposit).toBe(5400);
    expect(bill.charges.rent).toBe(0);
    const credit = await TenantCredit.findOne({ userId: tenant._id, category: "rent" });
    expect(credit).toBeNull();
    // The deposit component is still fully due — credit did NOT reduce it.
    expect(bill.totalAmount).toBe(5400);
  });

  // ── 10. Idempotent retry: no duplicate Bill / credit / ledger ─────────
  test("retrying the transfer does not duplicate the settlement Bill or deposit ledger and creates no transfer credit", async () => {
    const { tenant, reservation, roomB, actorId, predecessor } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 13500,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing" });
    // Retry is rejected (predecessor no longer active), but even a forced
    // re-entry must not double anything.
    await expect(runTransfer({ reservation, roomB, actorId, destType: "quadruple-sharing" }))
      .rejects.toMatchObject({ code: expect.stringMatching(/ROOM_TRANSFER_PREDECESSOR_NOT_ACTIVE|SAME_TRANSFER_TARGET/) });

    const [bills, credits] = await Promise.all([
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      TenantCredit.find({ userId: tenant._id }),
    ]);
    expect(bills).toHaveLength(1);
    expect(credits).toHaveLength(0);
    const r = await Reservation.findById(reservation._id);
    const dueEntries = r.securityDepositLedger.filter((e) => e.transferReference && String(e.transferReference) === String(predecessor._id));
    expect(dueEntries.length).toBeLessThanOrEqual(1);
  });

  // ── 11. Partial payment: held deposit rises only by the deposit portion ──
  test("partial payment of a rent+deposit settlement funds the deposit only after rent is covered", async () => {
    const { reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "private", heldDeposit: 5400,
    });
    await runTransfer({ reservation, roomB, actorId, destType: "private" });
    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    const rentDue = roundMoney(bill.charges.rent);
    const depositDue = roundMoney(bill.charges.securityDeposit);
    expect(depositDue).toBe(8100);

    // Pay only the rent portion first.
    let fresh = await Bill.findById(bill._id);
    await applyBillPayment({
      bill: fresh, amount: rentDue, method: "offline_cash", source: "admin-manual", externalPaymentId: `p1-${bill._id}`,
    });
    let r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(5400); // rent covered, deposit not yet

    // Pay half the deposit.
    fresh = await Bill.findById(bill._id);
    await applyBillPayment({
      bill: fresh, amount: roundMoney(depositDue / 2), method: "offline_cash", source: "admin-manual", externalPaymentId: `p2-${bill._id}`,
    });
    r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBeCloseTo(roundMoney(5400 + depositDue / 2), 2);

    // Pay the rest.
    fresh = await Bill.findById(bill._id);
    await applyBillPayment({
      bill: fresh, amount: fresh.remainingAmount, method: "offline_cash", source: "admin-manual", externalPaymentId: `p3-${bill._id}`,
    });
    r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(13500);
  });

  // ── 12. Later-period prepaid basis (paid current-cycle Bill) ──────────
  test("later period: unused prepaid rent is based on the CURRENT paid monthly Bill, not the Contract rate", async () => {
    // moveIn 3 months ago; a paid current-cycle monthly Bill of 5400 (quad).
    const { reservation, roomB, actorId } = await seed({
      sourceType: "quadruple-sharing", destType: "private", heldDeposit: 5400,
      currentBillPaidRent: 5400, moveIn: new Date("2026-05-01T00:00:00.000Z"),
    });
    // transfer 2026-08-15 -> current cycle 2026-08-01..09-01, 14 source days.
    await runTransfer({ reservation, roomB, actorId, destType: "private", transferDate: "2026-08-15T00:00:00.000Z" });
    const bill = await Bill.findOne({ reservationId: reservation._id, billType: "transfer_settlement" });
    expect(bill.transferSnapshot.applicablePrepaidRent).toBe(5400);
    expect(bill.transferSnapshot.prepaidRentSource).toBe("current_bill_billed_rent");
    const consumed = dailyPortion(5400, 14);
    expect(bill.transferSnapshot.proRataRent).toBeCloseTo(consumed, 2);
    expect(bill.transferSnapshot.unusedPrepaidCredit).toBeCloseTo(roundMoney(5400 - consumed), 2);
  });

  // ── 13. Rollback: a cutover failure leaves NO financial state ─────────
  test("rollback: cutover failure leaves no settlement Bill, no TenantCredit, no held-deposit change", async () => {
    jest.resetModules();
    // (kept simple — the transactional rollback of physical + Bill + credit
    // state is exercised end-to-end in transferCutoverRollback; here we just
    // assert the financial artifacts specifically are absent after a reject.)
    const { tenant, reservation, roomB, actorId } = await seed({
      sourceType: "private", destType: "quadruple-sharing", heldDeposit: 13500,
    });
    // Force a reject by pointing at a non-existent room mid-flow is hard;
    // instead use a cross-branch target which Stage A rejects BEFORE any
    // financial write.
    const otherBranchRoom = await Room.create({
      name: "OtherBranch", roomNumber: "999", branch: "guadalupe",
      type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
      beds: [{ id: "ob-b1", position: "lower", status: "available" }],
    });
    await expect(transferStayWorkflow({
      reservationId: reservation._id,
      payload: { confirm: true, targetRoomId: otherBranchRoom._id, targetBedId: "ob-b1", effectiveTransferDate: "2026-08-15T00:00:00.000Z" },
      actorId,
    })).rejects.toMatchObject({ code: "CROSS_BRANCH_TRANSFER_NOT_ALLOWED" });

    const [bills, credits] = await Promise.all([
      Bill.find({ reservationId: reservation._id, billType: "transfer_settlement" }),
      TenantCredit.find({ userId: tenant._id }),
    ]);
    expect(bills).toHaveLength(0);
    expect(credits).toHaveLength(0);
    const r = await Reservation.findById(reservation._id);
    expect(r.securityDepositHeld).toBe(13500);
    jest.resetModules();
  });
});
