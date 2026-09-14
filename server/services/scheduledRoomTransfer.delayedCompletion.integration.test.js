/**
 * ============================================================================
 * completeRoomTransfer — DELAYED COMPLETION (scheduled earlier, completed now)
 * ============================================================================
 *
 * Round-4: a transfer scheduled for an earlier date but only completed today
 * settles as of TODAY, not the stale scheduled date.
 *
 *  3. Delayed completion that INCREASES the amount due -> the UNPAID
 *     transfer_settlement Bill is recomputed (unpaid-only reshape).
 *  4. Delayed completion after a PARTIAL payment whose recompute is higher ->
 *     ADDITIONAL_BALANCE_DUE (upward-only Bill resize; no cutover).
 *  5. scheduleHistory keeps the ORIGINAL scheduled date even though
 *     executedAt / cutoverAt land on the actual (later) completion day.
 *
 * The "delay" is simulated by back-dating the ScheduledRoomTransfer record's
 * effectiveTransferDate + stale previewSnapshot after scheduling (which itself
 * only accepts today/future) — this is exactly the "scheduled earlier,
 * completed now" state.
 * ============================================================================
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mockGenerate = jest.fn(async ({ contractId, actorId }) => {
  const { Contract } = await import("../models/index.js");
  const { transitionContract } = await import("./contractService.js");
  const c = await Contract.findById(contractId);
  c.preparedDocuments = c.preparedDocuments || [];
  c.preparedDocuments.push({
    documentType: "prepared", version: 1, storageProvider: "local", storageKey: "t/p.pdf",
    fileName: "p.pdf", fileHash: `h-${c._id}`, fileSize: 1, pageCount: 1, templateId: "g",
    templateVersion: "1", coordinateVersion: "1", generatedAt: new Date(), generatedBy: actorId, superseded: false,
  });
  c.generatedFileHash = `h-${c._id}`; c.generatedVersion = 1;
  c.publicationStatus = "ready_for_resident"; c.tenantVisible = true;
  if (c.status === "ready_for_generation") await transitionContract(c, "generated", actorId, "t");
  else await c.save();
  return { contract: c, document: c.preparedDocuments.at(-1), previousStatus: "ready_for_generation", isRegeneration: false };
});
await jest.unstable_mockModule("./contractPdfService.js", () => ({ generatePreparedContractPdf: mockGenerate }));
const realCS = await import("./contractService.js");
await jest.unstable_mockModule("./contractService.js", () => ({
  ...realCS,
  validateContractForGeneration: jest.fn(async () => ({
    valid: true, missingFields: [], errors: [], generationData: { pricing: {} },
    template: { templateId: "g", templateVersion: 1, legalContentVersion: 1 },
  })),
}));

const { scheduleRoomTransfer, completeRoomTransfer, rescheduleRoomTransfer } = await import("./scheduledRoomTransferService.js");
const { generateContractNumber } = await import("./contractService.js");
const { applyBillPayment } = await import("./billing/paymentLedger.js");
const { serializeScheduledRoomTransfer } = await import("./scheduledRoomTransferView.js");
const { getManilaToday } = await import("../utils/dateUtils.js");
const {
  Contract, MoveOutClearance, Reservation, Room, User, Stay, BedHistory, Bill, BusinessSettings,
  Payment, UtilityReading, UtilityPeriod, UtilityFinalization, ScheduledRoomTransfer,
} = await import("../models/index.js");

jest.setTimeout(240_000);
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const MOVE_IN = new Date("2020-01-01T00:00:00.000Z");
const LEASE_END = new Date("2035-12-31T00:00:00.000Z");

async function permissiveOfficeHours() {
  await BusinessSettings.deleteMany({});
  await BusinessSettings.create({
    key: "global",
    privateDiscountPercent: 10, doubleDiscountPercent: 10, quadrupleDiscountPercent: 10,
    isDiscountEnabled: true, longTermLeaseMinMonths: 6,
    officeHoursStartMinutes: 0, officeHoursEndMinutes: 1440, officeDaysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
}

async function seed() {
  await permissiveOfficeHours();
  // Guadalupe = fixed-rate (NOT sub-metered) — no meter-reading step, so these
  // tests isolate the rent/deposit SETTLEMENT DATE. Guadalupe only allows
  // quadruple-sharing, so quad -> quad. The settlement amount is driven by
  // securityDepositHeld vs the destination required deposit.
  const branch = "guadalupe";
  const tenant = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${Date.now()}@ex.test`,
    username: `t_${Date.now()}`, firstName: "D", lastName: "C", role: "tenant", tenantStatus: "active",
  });
  const roomA = await Room.create({
    name: "QA", roomNumber: "QA1", branch, type: "quadruple-sharing", capacity: 4, currentOccupancy: 1, price: 5400,
    beds: ["b1", "b2", "b3", "b4"].map((id, i) => ({
      id: `qa-${id}`, position: i % 2 ? "upper" : "lower",
      status: i === 0 ? "occupied" : "available",
      ...(i === 0 ? { occupiedBy: { userId: tenant._id } } : {}),
    })),
  });
  const roomB = await Room.create({
    name: "QB", roomNumber: "QB1", branch, type: "quadruple-sharing", capacity: 4, currentOccupancy: 0, price: 5400,
    beds: ["b1", "b2", "b3", "b4"].map((id, i) => ({ id: `qb-${id}`, position: i % 2 ? "upper" : "lower", status: "available" })),
  });
  const res = await Reservation.create({
    userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 12,
    reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: 5400, monthlyRent: 5400, selectedBed: { id: "qa-b1" }, moveInDate: MOVE_IN,
    // Deliberately LOW held deposit so an additional-deposit-due exists on
    // transfer (destination required ≈ 1x the ~₱4,860 discounted quad rate).
    securityDepositHeld: 1000,
  });
  roomA.beds[0].occupiedBy.reservationId = res._id;
  await roomA.save();
  const stay = await Stay.create({
    tenantId: tenant._id, reservationId: res._id, branch, roomId: roomA._id, bedId: "qa-b1",
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, monthlyRent: 5400, status: "active",
  });
  await BedHistory.create({
    bedId: "qa-b1", roomId: roomA._id, tenantId: tenant._id, reservationId: res._id, stayId: stay._id,
    branch, moveInDate: MOVE_IN, effectiveStartDate: MOVE_IN, status: "active",
  });
  const actorId = new mongoose.Types.ObjectId();
  const num = await generateContractNumber(branch, new Date());
  await Contract.create({
    ...num, contractPurpose: "initial", tenantId: tenant._id, applicationId: res._id,
    reservationId: res._id, stayId: stay._id, roomId: roomA._id, branch,
    propertyName: "L", propertyAddress: "x", roomNumber: "QA1", roomType: "quadruple-sharing",
    leaseType: "long_term", approvedMonthlyRate: 5400, securityDepositAmount: 1000,
    leaseStartDate: MOVE_IN, leaseEndDate: LEASE_END, leaseDurationMonths: 12,
    status: "active", isCurrent: true,
    statusHistory: [{ status: "active", changedBy: actorId, reason: "s" }],
    createdBy: actorId, updatedBy: actorId,
  });
  return { tenant, res, roomA, roomB, actorId };
}

/** Schedule for TODAY, then back-date the record to simulate "scheduled N days ago". */
async function scheduleThenBackdate({ res, roomB, actorId, daysAgo }) {
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const { scheduledTransfer } = await scheduleRoomTransfer({
    reservationId: res._id,
    payload: {
      confirm: true, targetRoomId: String(roomB._id),
      targetBedId: "qb-b1",
      effectiveTransferDate: today.toISOString(),
      effectiveTransferTimeMinutes: 540,
      reason: "delayed-completion test",
    },
    actorId: actorId,
  });
  const back = new Date();
  back.setDate(back.getDate() - daysAgo);
  back.setHours(0, 0, 0, 0);
  // Back-date the effective date (as if scheduled `daysAgo` ago and only now
  // being completed). Also back-date the prepared Addendum draft + its
  // scheduleHistory[0] entry so the "originally scheduled date" the test reads
  // truly precedes today.
  await ScheduledRoomTransfer.updateOne(
    { _id: scheduledTransfer._id },
    {
      $set: {
        effectiveTransferDate: back,
        "scheduleHistory.0.newDate": back,
      },
    },
  );
  if (scheduledTransfer.addendumContractId) {
    await Contract.updateOne(
      { _id: scheduledTransfer.addendumContractId },
      { $set: { amendmentEffectiveDate: back } },
    );
  }
  const originalDate = back;
  return { schedId: scheduledTransfer._id, originalDate };
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_delayed_completion" });
  await ScheduledRoomTransfer.syncIndexes();
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([
    Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({}),
    Contract.deleteMany({}), MoveOutClearance.deleteMany({}), Stay.deleteMany({}), BedHistory.deleteMany({}),
    Bill.deleteMany({}), BusinessSettings.deleteMany({}), Payment.deleteMany({}),
    UtilityReading.deleteMany({}), UtilityPeriod.deleteMany({}),
    UtilityFinalization.deleteMany({}), ScheduledRoomTransfer.deleteMany({}),
  ]);
  mockGenerate.mockClear();
});

describe("rescheduleRoomTransfer — no office-hours restriction", () => {
  test("reschedule to a FUTURE date + any time (e.g. 21:00 on a weekend) is accepted and appends schedule history", async () => {
    const { res, roomB, actorId } = await seed();
    const today = new Date(); today.setHours(9, 0, 0, 0);
    await scheduleRoomTransfer({
      reservationId: res._id,
      payload: {
        confirm: true, targetRoomId: String(roomB._id), targetBedId: "qb-b1",
        effectiveTransferDate: today.toISOString(), effectiveTransferTimeMinutes: 540,
        reason: "reschedule test",
      },
      actorId,
    });
    const future = new Date(); future.setDate(future.getDate() + 11); future.setHours(0, 0, 0, 0);
    const { scheduledTransfer } = await rescheduleRoomTransfer({
      reservationId: res._id,
      payload: { effectiveTransferDate: future.toISOString(), effectiveTransferTimeMinutes: 21 * 60, reason: "tenant asked" },
      actorId,
    });
    expect(scheduledTransfer.effectiveTransferTimeMinutes).toBe(21 * 60);
    const hist = scheduledTransfer.scheduleHistory.at(-1);
    expect(hist.kind).toBe("rescheduled");
  });

  test("reschedule to a PAST date is still rejected (PAST_TRANSFER_DATE)", async () => {
    const { res, roomB, actorId } = await seed();
    const today = new Date(); today.setHours(9, 0, 0, 0);
    await scheduleRoomTransfer({
      reservationId: res._id,
      payload: {
        confirm: true, targetRoomId: String(roomB._id), targetBedId: "qb-b1",
        effectiveTransferDate: today.toISOString(), effectiveTransferTimeMinutes: 540,
        reason: "reschedule past test",
      },
      actorId,
    });
    const past = new Date(); past.setDate(past.getDate() - 3); past.setHours(0, 0, 0, 0);
    await expect(rescheduleRoomTransfer({
      reservationId: res._id,
      payload: { effectiveTransferDate: past.toISOString(), effectiveTransferTimeMinutes: 10 * 60 },
      actorId,
    })).rejects.toMatchObject({ code: "PAST_TRANSFER_DATE" });
  });

  test("an acknowledged Room Transfer Addendum cannot be rescheduled or have acknowledgements deleted", async () => {
    const { res, roomB, actorId } = await seed();
    const today = new Date(); today.setHours(9, 0, 0, 0);
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: res._id,
      payload: {
        confirm: true,
        targetRoomId: String(roomB._id),
        targetBedId: "qb-b1",
        effectiveTransferDate: today.toISOString(),
        effectiveTransferTimeMinutes: 540,
      },
      actorId,
    });
    const { ContractAcknowledgement } = await import("../models/index.js");
    await ContractAcknowledgement.create({
      contractId: scheduledTransfer.addendumContractId,
      tenantId: (await Reservation.findById(res._id).lean()).userId,
      acknowledgedAt: new Date(),
      documentVersion: 1,
      documentFileHash: `ack-${scheduledTransfer.addendumContractId}`,
    });
    const future = new Date(); future.setDate(future.getDate() + 5);

    await expect(rescheduleRoomTransfer({
      reservationId: res._id,
      payload: { effectiveTransferDate: future.toISOString(), effectiveTransferTimeMinutes: 600 },
      actorId,
    })).rejects.toMatchObject({ code: "ROOM_TRANSFER_ADDENDUM_ACKNOWLEDGED" });
    expect(await ContractAcknowledgement.countDocuments({ contractId: scheduledTransfer.addendumContractId })).toBe(1);
    const unchanged = await ScheduledRoomTransfer.findById(scheduledTransfer._id).select("+executionToken").lean();
    expect(unchanged.executionToken).toBeNull();
    expect(unchanged.scheduleHistory).toHaveLength(1);
  });
});

describe("completeRoomTransfer — delayed completion settles as of TODAY", () => {
  test("same-day completion is allowed before the stored guidance minute", async () => {
    const { res, roomB, actorId } = await seed();
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: res._id,
      payload: {
        confirm: true,
        targetRoomId: String(roomB._id),
        targetBedId: "qb-b1",
        effectiveTransferDate: getManilaToday().format("YYYY-MM-DD"),
        effectiveTransferTimeMinutes: 23 * 60 + 59,
        reason: "same-day guidance-time test",
      },
      actorId,
    });

    const result = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(result.outcome).toBe("awaiting_settlement");
    expect(result.reason).toBe("TRANSFER_BALANCE_UNPAID");

    const stored = await ScheduledRoomTransfer.findById(scheduledTransfer._id).lean();
    expect(stored.effectiveTransferTimeMinutes).toBe(23 * 60 + 59);
    expect(stored.scheduleHistory[0].newTimeMinutes).toBe(23 * 60 + 59);
  });

  test("completion on an earlier calendar date remains blocked and preserves the hold", async () => {
    const { res, roomB, actorId } = await seed();
    const { scheduledTransfer } = await scheduleRoomTransfer({
      reservationId: res._id,
      payload: {
        confirm: true,
        targetRoomId: String(roomB._id),
        targetBedId: "qb-b1",
        effectiveTransferDate: getManilaToday().add(1, "day").format("YYYY-MM-DD"),
        effectiveTransferTimeMinutes: 0,
        reason: "future-date guard test",
      },
      actorId,
    });

    await expect(completeRoomTransfer({ reservationId: res._id, payload: {}, actorId }))
      .rejects.toMatchObject({ code: "TRANSFER_NOT_YET_DUE" });
    const stored = await ScheduledRoomTransfer.findById(scheduledTransfer._id).lean();
    expect(stored.status).toBe("scheduled");
    expect(stored.holdApplied).toBe(true);
  });

  test("a move-out clearance started after scheduling blocks completion and preserves the hold", async () => {
    const { res, roomB, tenant, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 2 });
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    await MoveOutClearance.collection.insertOne({
      reservationId: res._id,
      stayId: stay._id,
      tenantId: tenant._id,
      branch: "guadalupe",
      status: "initiated",
      intendedMoveOutDate: new Date(),
    });

    await expect(completeRoomTransfer({ reservationId: res._id, payload: {}, actorId }))
      .rejects.toMatchObject({ code: "ROOM_TRANSFER_MOVE_OUT_CONFLICT" });
    const schedule = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(schedule.status).toBe("scheduled");
    expect(schedule.holdApplied).toBe(true);
  });

  test("delayed completion: unpaid transfer_settlement Bill is (re)created/reshaped as of today; NOT the stale scheduled date", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 20 });

    // No Bill was created at scheduling time (round-2 decision).
    expect(await Bill.findOne({ reservationId: res._id, billType: "transfer_settlement" })).toBeNull();

    // Complete now -> awaiting_settlement with a Bill sized as of TODAY.
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    expect(r1.reason).toBe("TRANSFER_BALANCE_UNPAID");
    expect(r1.bill).toBeTruthy();

    const bill = await Bill.findById(r1.bill._id).lean();
    expect(bill.billType).toBe("transfer_settlement");
    // billingMonth is TODAY (the actual completion), not 20 days ago.
    const { formatManilaDate } = await import("../utils/dateUtils.js");
    expect(formatManilaDate(bill.billingMonth, "YYYY-MM-DD")).toBe(formatManilaDate(new Date(), "YYYY-MM-DD"));
    expect(Number(bill.totalAmount)).toBeGreaterThan(0);
    // Still fully unpaid.
    expect(Number(bill.paidAmount || 0)).toBe(0);

    // No cutover happened.
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(String(stay.roomId)).toBe(String((await Reservation.findById(res._id).lean()).roomId));
    const schedAfter = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(schedAfter.status).toBe("action_required");
    expect(schedAfter.executedAt).toBeFalsy();
  });

  test("delayed completion, then settle in full -> completes; executedAt is TODAY; scheduleHistory keeps the ORIGINAL scheduled date", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId, originalDate } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 15 });
    const { formatManilaDate } = await import("../utils/dateUtils.js");
    const originalDay = formatManilaDate(originalDate, "YYYY-MM-DD");

    // 1st completion -> awaiting settlement, Bill created.
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    const billId = r1.bill._id;

    // Pay it in full via the canonical path.
    const billDoc = await Bill.findById(billId);
    await applyBillPayment({
      bill: billDoc, amount: Number(billDoc.totalAmount), method: "offline_cash",
      source: "admin-manual", now: new Date(),
    });

    // 2nd completion -> executed.
    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("executed");

    const sched = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(sched.status).toBe("executed");
    // executedAt / cutoverAt land on the ACTUAL completion day (today).
    expect(formatManilaDate(sched.executedAt, "YYYY-MM-DD")).toBe(formatManilaDate(new Date(), "YYYY-MM-DD"));
    expect(formatManilaDate(sched.executedSettlement.cutoverAt, "YYYY-MM-DD")).toBe(formatManilaDate(new Date(), "YYYY-MM-DD"));

    // scheduleHistory[0] STILL records the original scheduled date — never mutated.
    expect(Array.isArray(sched.scheduleHistory)).toBe(true);
    expect(sched.scheduleHistory.length).toBeGreaterThanOrEqual(1);
    expect(formatManilaDate(sched.scheduleHistory[0].newDate, "YYYY-MM-DD")).toBe(originalDay);
    expect(sched.scheduleHistory[0].kind).toBe("scheduled");

    // The serialized view exposes the schedule history unchanged.
    const viewed = await serializeScheduledRoomTransfer(await ScheduledRoomTransfer.findById(schedId));
    expect(viewed.scheduleHistory[0].kind).toBe("scheduled");
    expect(formatManilaDate(viewed.scheduleHistory[0].newDate, "YYYY-MM-DD")).toBe(originalDay);

    // Physical cutover happened.
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(String(stay.roomId)).toBe(String(roomB._id));
  });

  test("two simultaneous Complete requests consume one hold and perform one physical cutover", async () => {
    const { res, roomA, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 2 });

    const awaiting = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    const billDoc = await Bill.findById(awaiting.bill._id);
    await applyBillPayment({
      bill: billDoc,
      amount: Number(billDoc.totalAmount),
      method: "offline_cash",
      source: "admin-manual",
      now: new Date(),
    });

    const attempts = await Promise.allSettled([
      completeRoomTransfer({ reservationId: res._id, payload: {}, actorId }),
      completeRoomTransfer({ reservationId: res._id, payload: {}, actorId: new mongoose.Types.ObjectId() }),
    ]);

    expect(attempts.some((x) => x.status === "fulfilled" && x.value.outcome === "executed")).toBe(true);
    const schedule = await ScheduledRoomTransfer.findById(schedId).select("+executionToken").lean();
    expect(schedule.status).toBe("executed");
    expect(schedule.holdApplied).toBe(false);
    expect(schedule.executionToken).toBeNull();

    const [source, destination, stay, histories, transferBills] = await Promise.all([
      Room.findById(roomA._id).lean(),
      Room.findById(roomB._id).lean(),
      Stay.findOne({ reservationId: res._id }).lean(),
      BedHistory.find({ reservationId: res._id }).lean(),
      Bill.find({ reservationId: res._id, billType: "transfer_settlement", status: { $ne: "voided" } }).lean(),
    ]);
    expect(source.currentOccupancy).toBe(0);
    expect(destination.currentOccupancy).toBe(1);
    expect(String(stay.roomId)).toBe(String(roomB._id));
    expect(histories.filter((h) => h.status === "active")).toHaveLength(1);
    expect(transferBills).toHaveLength(1);
  });

  test("delayed completion after a PARTIAL payment whose recompute is higher -> Bill increases, payment is preserved, remaining balance is explicit", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 10 });

    // 1st completion -> Bill created (awaiting settlement).
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    const billId = r1.bill._id;
    const billBefore = await Bill.findById(billId).lean();
    const originalTotal = Number(billBefore.totalAmount);
    const originalCharges = { ...billBefore.charges };

    // Pay a SMALL amount — below the rent component — so the payment ledger's
    // deposit-funding (allocation: rent/util first, then deposit) funds NOTHING
    // and does NOT raise securityDepositHeld. The Bill now carries a real
    // (partial) payment but no deposit-settlement ledger entry.
    const smallPayment = Math.max(1, round(Number(originalCharges.rent || 0) / 2) || 1);
    const billDoc = await Bill.findById(billId);
    await applyBillPayment({
      bill: billDoc, amount: smallPayment, method: "offline_cash",
      source: "admin-manual", now: new Date(),
    });

    // Now the recompute genuinely gets HIGHER: drop securityDepositHeld to 0 so
    // the additional-deposit-due grows. Because no deposit component was funded,
    // there is no depositHeldOverride to mask this on the re-attempt.
    await Reservation.updateOne({ _id: res._id }, { $set: { securityDepositHeld: 0 } });

    // 2nd completion -> the recomputed total (now includes a full destination
    // deposit) exceeds the partially-paid Bill total.
    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("action_required");
    expect(r2.reason).toBe("ADDITIONAL_BALANCE_DUE");

    // No cutover.
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(String(stay.roomId)).not.toBe(String(roomB._id));
    const sched = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(sched.status).toBe("action_required");
    expect(sched.executedAt).toBeFalsy();

    // Upward-only adjustment: preserve the payment/history but increase the
    // same transfer Bill so the remaining amount can be paid normally.
    const billAfter = await Bill.findById(billId).lean();
    expect(Number(billAfter.paidAmount)).toBe(smallPayment);
    expect(Number(billAfter.totalAmount)).toBeGreaterThan(originalTotal);
    expect(billAfter.charges.rent).toBe(originalCharges.rent);
    expect(billAfter.charges.securityDeposit).toBeGreaterThan(originalCharges.securityDeposit);
    expect(Number(billAfter.remainingAmount)).toBeCloseTo(
      Number(billAfter.totalAmount) - smallPayment,
      2,
    );
    expect(Number(billAfter.transferSnapshot.upwardAdjustmentFrom)).toBe(originalTotal);
    expect(Number(billAfter.transferSnapshot.upwardAdjustmentTo)).toBe(Number(billAfter.totalAmount));
    expect(r2.message).toContain(Number(billAfter.totalAmount).toFixed(2));
    expect(r2.message).toContain(smallPayment.toFixed(2));

    const audit = sched.financialAdjustmentHistory.at(-1);
    expect(audit.reason).toBe("ADDITIONAL_BALANCE_DUE");
    expect(String(audit.settlementBillId)).toBe(String(billId));
    expect(String(audit.tenantId)).toBe(String(res.userId));
    expect(String(audit.reservationId)).toBe(String(res._id));
    expect(String(audit.scheduledRoomTransferId)).toBe(String(schedId));
    expect(audit.amountPaid).toBe(smallPayment);
    expect(audit.previousRequiredAmount).toBe(originalTotal);
    expect(audit.recomputedRequiredAmount).toBe(Number(billAfter.totalAmount));
    expect(audit.difference).toBeCloseTo(Number(billAfter.totalAmount) - originalTotal, 2);
    expect(audit.recordedAt).toBeTruthy();
  });

  test("paid downward recompute -> FINANCIAL_ADJUSTMENT_REQUIRED, Bill/payment preserved, full manual-review audit", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 10 });
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");

    const billBefore = await Bill.findById(r1.bill._id).lean();
    const originalTotal = Number(billBefore.totalAmount);
    const originalCharges = { ...billBefore.charges };
    const paid = 500;
    await applyBillPayment({
      bill: await Bill.findById(billBefore._id), amount: paid,
      method: "offline_cash", source: "admin-manual", now: new Date(),
    });
    await Reservation.updateOne(
      { _id: res._id },
      { $set: { securityDepositHeld: 10000 } },
    );

    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("action_required");
    expect(r2.reason).toBe("FINANCIAL_ADJUSTMENT_REQUIRED");
    expect(r2.message).toMatch(/manual processing/i);
    expect(r2.message).toMatch(/Administration Office/i);
    expect(r2.message).toMatch(/2nd Floor/i);

    const billAfter = await Bill.findById(billBefore._id).lean();
    expect(billAfter.totalAmount).toBe(originalTotal);
    expect(billAfter.paidAmount).toBe(paid);
    expect(billAfter.charges.rent).toBe(originalCharges.rent);
    expect(billAfter.charges.securityDeposit).toBe(originalCharges.securityDeposit);

    const schedule = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(schedule.status).toBe("action_required");
    expect(schedule.lastError).toBe("FINANCIAL_ADJUSTMENT_REQUIRED");
    const audit = schedule.financialAdjustmentHistory.at(-1);
    expect(audit.reason).toBe("FINANCIAL_ADJUSTMENT_REQUIRED");
    expect(String(audit.settlementBillId)).toBe(String(billBefore._id));
    expect(String(audit.tenantId)).toBe(String(res.userId));
    expect(String(audit.reservationId)).toBe(String(res._id));
    expect(String(audit.scheduledRoomTransferId)).toBe(String(schedId));
    expect(audit.amountPaid).toBe(paid);
    expect(audit.previousRequiredAmount).toBe(originalTotal);
    expect(audit.recomputedRequiredAmount).toBeLessThan(originalTotal);
    expect(audit.difference).toBeCloseTo(
      originalTotal - audit.recomputedRequiredAmount,
      2,
    );
    expect(audit.recordedAt).toBeTruthy();
  });

  test("paid transfer whose reserved destination bed becomes invalid -> clear manual action_required with Bill/payment preserved", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 10 });
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    await applyBillPayment({
      bill: await Bill.findById(r1.bill._id), amount: 500,
      method: "offline_cash", source: "admin-manual", now: new Date(),
    });

    await Room.updateOne(
      { _id: roomB._id, "beds.id": "qb-b1" },
      { $set: { "beds.$.status": "available", "beds.$.occupiedBy": null } },
    );

    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("action_required");
    expect(r2.reason).toBe("PAID_TRANSFER_CANNOT_COMPLETE");
    expect(r2.cause).toBe("DESTINATION_UNAVAILABLE");
    expect(r2.message).toMatch(/Administration Office/i);
    expect(r2.message).toMatch(/2nd Floor/i);

    const [billAfter, schedule, payments, stay] = await Promise.all([
      Bill.findById(r1.bill._id).lean(),
      ScheduledRoomTransfer.findById(schedId).lean(),
      Payment.find({ billId: r1.bill._id }).lean(),
      Stay.findOne({ reservationId: res._id }).lean(),
    ]);
    expect(billAfter.paidAmount).toBe(500);
    expect(payments).toHaveLength(1);
    expect(schedule.status).toBe("action_required");
    expect(schedule.lastError).toBe("PAID_TRANSFER_CANNOT_COMPLETE: DESTINATION_UNAVAILABLE");
    expect(schedule.financialAdjustmentHistory.at(-1).reason).toBe(
      "PAID_TRANSFER_CANNOT_COMPLETE: DESTINATION_UNAVAILABLE",
    );
    expect(String(stay.roomId)).not.toBe(String(roomB._id));
  });
});

describe("Addendum effective date on LATE completion (audit item 3)", () => {
  test("successful delayed completion aligns the current Contract's amendmentEffectiveDate to the ACTUAL cutover day, not the scheduled date", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId, originalDate } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 18 });
    const { formatManilaDate } = await import("../utils/dateUtils.js");
    const originalDay = formatManilaDate(originalDate, "YYYY-MM-DD");
    const todayDay = formatManilaDate(new Date(), "YYYY-MM-DD");
    expect(originalDay).not.toBe(todayDay);

    // 1st completion -> Bill; settle it; 2nd -> executed.
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    const billDoc = await Bill.findById(r1.bill._id);
    await applyBillPayment({
      bill: billDoc, amount: Number(billDoc.totalAmount), method: "offline_cash",
      source: "admin-manual", now: new Date(),
    });
    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("executed");

    // The tenant's CURRENT Contract (the activated room-transfer successor) must
    // carry amendmentEffectiveDate = the ACTUAL cutover day.
    const current = await Contract.findOne({ reservationId: res._id, isCurrent: true }).lean();
    expect(current).toBeTruthy();
    expect(["amendment", "replacement"]).toContain(current.contractPurpose);
    expect(formatManilaDate(current.amendmentEffectiveDate, "YYYY-MM-DD")).toBe(todayDay);
    expect(formatManilaDate(current.amendmentEffectiveDate, "YYYY-MM-DD")).not.toBe(originalDay);

    // The schedule history still records the ORIGINAL scheduled date — the
    // planning record and the contract date do not silently disagree; each is
    // authoritative for its own purpose.
    const sched = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(formatManilaDate(sched.scheduleHistory[0].newDate, "YYYY-MM-DD")).toBe(originalDay);
  });

  test("if the Addendum draft was already ACKNOWLEDGED for the scheduled date, a later completion is BLOCKED (ADDENDUM_EFFECTIVE_DATE_LOCKED) — never silently re-dated", async () => {
    const { res, roomB, actorId } = await seed();
    const { schedId } = await scheduleThenBackdate({ res, roomB, actorId, daysAgo: 12 });

    // Simulate the tenant acknowledging the prepared Addendum draft (bound to
    // the scheduled date) BEFORE the transfer is completed.
    const { Contract, ContractAcknowledgement } = await import("../models/index.js");
    const draft = await Contract.findOne({
      reservationId: res._id,
      contractPurpose: { $in: ["amendment", "replacement"] },
      isCurrent: { $ne: true },
    }).lean();
    expect(draft).toBeTruthy();
    await ContractAcknowledgement.create({
      contractId: draft._id,
      tenantId: (await Reservation.findById(res._id).lean()).userId,
      acknowledgedAt: new Date(),
      documentVersion: 1,
      documentFileHash: `ack-${draft._id}`,
    });

    // 1st completion -> Bill; settle in full.
    const r1 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r1.outcome).toBe("awaiting_settlement");
    const billDoc = await Bill.findById(r1.bill._id);
    await applyBillPayment({
      bill: billDoc, amount: Number(billDoc.totalAmount), method: "offline_cash",
      source: "admin-manual", now: new Date(),
    });

    // 2nd completion -> blocked: the Addendum is locked to the scheduled date.
    const r2 = await completeRoomTransfer({ reservationId: res._id, payload: {}, actorId });
    expect(r2.outcome).toBe("action_required");
    expect(r2.reason).toBe("PAID_TRANSFER_CANNOT_COMPLETE");
    expect(r2.cause).toBe("ADDENDUM_EFFECTIVE_DATE_LOCKED");
    expect(r2.message).toMatch(/Administration Office/i);
    expect(r2.message).toMatch(/2nd Floor/i);

    // No cutover; the acknowledged document was NOT re-dated.
    const stay = await Stay.findOne({ reservationId: res._id }).lean();
    expect(String(stay.roomId)).not.toBe(String(roomB._id));
    const sched = await ScheduledRoomTransfer.findById(schedId).lean();
    expect(sched.status).toBe("action_required");
    const draftAfter = await Contract.findById(draft._id).lean();
    expect(draftAfter.amendmentEffectiveDate.toISOString()).toBe(draft.amendmentEffectiveDate.toISOString());
  });
});
