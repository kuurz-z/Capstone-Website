/**
 * Integration test for createSuccessorContractForRenewal's PRICING
 * resolution (server/services/contractService.js) — proves the renewal
 * successor Contract snapshots the room-type + new-lease-duration correct
 * approved rate from the authoritative discount table, never the raw
 * newStay.monthlyRent (client-forwarded, duration/tier-unaware), the old
 * Contract's stale rate, or the Room's raw master price.
 *
 * Business reference (Gil Puyat), verified against
 * contractPricingResolver.js's DEFAULT_REGULAR_RATES + BusinessSettings
 * discount defaults:
 *   Quadruple  long 6000->5400 (10%)   short 7000->6300 (10%)
 *   Double     long 9000->7200 (20%)   short 10000->8000 (20%)
 *   Private    long 15000->13500 (10%) short 16000->14400 (10%)
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { createSuccessorContractForRenewal, generateContractNumber, transitionContract } from "./contractService.js";
import { Contract, Reservation, Room, User, Stay, BusinessSettings } from "../models/index.js";

jest.setTimeout(120_000);

describe("createSuccessorContractForRenewal — approved pricing resolution", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "renewal_pricing_integration" });
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      User.deleteMany({}),
      Contract.deleteMany({}),
      Stay.deleteMany({}),
      BusinessSettings.deleteMany({}),
    ]);
    await BusinessSettings.create({
      key: "global",
      isDiscountEnabled: true,
      longTermLeaseMinMonths: 6,
      quadrupleDiscountPercent: 10,
      doubleDiscountPercent: 20,
      privateDiscountPercent: 10,
    });
  });

  async function seedTenantRoomReservation({ roomType, roomPrice }) {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Test", lastName: "Tenant", role: "tenant",
    });
    const room = await Room.create({
      name: "Room 301", roomNumber: "301", branch: "gil-puyat",
      type: roomType, capacity: roomType === "private" ? 1 : (roomType === "double-sharing" ? 2 : 4),
      price: roomPrice,
    });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 3,
      reservationFeeAmount: 2000, preferredRoomType: roomType,
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: roomPrice,
      moveInDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1",
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-04-01T00:00:00.000Z"),
      monthlyRent: roomPrice, status: "active",
    });
    return { tenant, room, reservation, stay };
  }

  async function createOldContract({ tenant, room, reservation, stay, roomType, leaseDurationMonths, approvedMonthlyRate, actorId }) {
    const number = await generateContractNumber(room.branch, new Date());
    return Contract.create({
      ...number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      stayId: stay._id,
      roomId: room._id,
      branch: room.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Test St.",
      roomNumber: room.roomNumber,
      roomType,
      leaseType: leaseDurationMonths >= 6 ? "long_term" : "short_term",
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date(Date.UTC(2026, leaseDurationMonths, 1)),
      leaseDurationMonths,
      approvedMonthlyRate,
      status: "active",
      isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async function makeNewStay({ reservation, room, leaseStartDate, leaseEndDate, monthlyRent }) {
    return Stay.create({
      tenantId: reservation.userId, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate, leaseEndDate, monthlyRent, status: "active",
    });
  }

  const CASES = [
    { name: "Quadruple Short Term (3mo)", roomType: "quadruple-sharing", roomPrice: 7000, months: 3, regular: 7000, final: 6300 },
    { name: "Quadruple Long Term (6mo)", roomType: "quadruple-sharing", roomPrice: 6000, months: 6, regular: 6000, final: 5400 },
    { name: "Double Short Term (3mo)", roomType: "double-sharing", roomPrice: 10000, months: 3, regular: 10000, final: 8000 },
    { name: "Double Long Term (6mo)", roomType: "double-sharing", roomPrice: 9000, months: 6, regular: 9000, final: 7200 },
    { name: "Private Short Term (3mo)", roomType: "private", roomPrice: 16000, months: 3, regular: 16000, final: 14400 },
    { name: "Private Long Term (6mo)", roomType: "private", roomPrice: 15000, months: 6, regular: 15000, final: 13500 },
  ];

  test.each(CASES)(
    "$name: successor Contract snapshots regular $regular / final $final from the room-type+duration table",
    async ({ roomType, roomPrice, months, regular, final }) => {
      const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType, roomPrice });
      const actorId = new mongoose.Types.ObjectId();
      const oldContract = await createOldContract({
        tenant, room, reservation, stay, roomType, leaseDurationMonths: 1, approvedMonthlyRate: 99999, actorId,
      });
      const leaseStartDate = new Date("2026-04-01T00:00:00.000Z");
      const leaseEndDate = new Date(Date.UTC(2026, 3 + months, 1));
      const newStay = await makeNewStay({ reservation, room, leaseStartDate, leaseEndDate, monthlyRent: undefined });

      const successor = await createSuccessorContractForRenewal({
        reservationId: reservation._id,
        oldContract,
        newStay,
        actorId,
      });

      expect(successor.regularMonthlyRate).toBe(regular);
      expect(successor.approvedMonthlyRate).toBe(final);
    },
  );

  test("short-term (3mo) predecessor renewing to long-term (6mo): Quadruple resolves 5400, not the old 6300", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6300 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 3, approvedMonthlyRate: 6300, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"), // 6 months
      monthlyRent: 6300, // stale — copied from the old (short-term) Contract, must NOT be trusted
    });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(successor.approvedMonthlyRate).toBe(5400);
  });

  test("long-term predecessor renewing to short-term (3mo): Quadruple resolves 6300, not the old 5400", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 5400 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 6, approvedMonthlyRate: 5400, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-07-01T00:00:00.000Z"), // 3 months
      monthlyRent: 5400, // stale — copied from the old (long-term) Contract
    });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(successor.approvedMonthlyRate).toBe(6300);
  });

  test("current Reservation.monthlyRent must not override the approved future renewal rate", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6300 });
    await Reservation.updateOne({ _id: reservation._id }, { $set: { monthlyRent: 6300 } });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 3, approvedMonthlyRate: 6300, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"), // 6 months -> long-term
      monthlyRent: undefined,
    });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(successor.approvedMonthlyRate).toBe(5400);
  });

  test("Room master price change after approval does not alter the already-created successor Contract", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"), // 6 months -> long-term
      monthlyRent: undefined,
    });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(successor.approvedMonthlyRate).toBe(5400);

    await Room.updateOne({ _id: room._id }, { $set: { price: 9999 } });

    const reloaded = await Contract.findById(successor._id);
    expect(reloaded.approvedMonthlyRate).toBe(5400);
  });

  // ── Accepted-offer pricing freeze ─────────────────────────────────────────

  async function addAcceptedOffer(reservation, { months, proposedRent, regularMonthlyRate, discountPercentage, pricingTier }) {
    const offerId = `OFFER-${new mongoose.Types.ObjectId()}`;
    await Reservation.updateOne(
      { _id: reservation._id },
      {
        $push: {
          renewalOffers: {
            offerId, months, proposedRent, regularMonthlyRate, discountPercentage, pricingTier,
            pricingSource: "canonical_resolver", status: "accepted",
            createdAt: new Date(), respondedAt: new Date(),
          },
        },
      },
    );
    return offerId;
  }

  test("accepted offer's frozen canonical pricing is used, and survives a later BusinessSettings change", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const offerId = await addAcceptedOffer(reservation, {
      months: 6, proposedRent: 5400, regularMonthlyRate: 6000, discountPercentage: 10, pricingTier: "long_term",
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"),
      monthlyRent: 5400,
    });
    newStay.renewalOfferId = offerId;
    await newStay.save();

    // Discount policy changes AFTER the offer was accepted — the frozen
    // offer pricing must win over a fresh live re-resolution.
    await BusinessSettings.updateOne({ key: "global" }, { $set: { quadrupleDiscountPercent: 25 } });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(successor.approvedMonthlyRate).toBe(5400);
    expect(successor.regularMonthlyRate).toBe(6000);
    expect(successor.discountPercentage).toBe(10);
  });

  // ── Successor idempotency ─────────────────────────────────────────────────

  test("calling createSuccessorContractForRenewal twice for the same predecessor returns the same successor — no duplicate", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"),
      monthlyRent: undefined,
    });

    const first = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    const second = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });

    expect(String(second._id)).toBe(String(first._id));
    const count = await Contract.countDocuments({ replacesContractId: oldContract._id, contractPurpose: "renewal" });
    expect(count).toBe(1);
  });

  test("retry AFTER the successor reaches active status still returns the same successor, not a third Contract", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"),
      monthlyRent: undefined,
    });

    const successor = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    // Simulate the successor progressing all the way to active (wet-signed,
    // finalized, activated) — an accidental retry of successor generation
    // (e.g. a retried background trigger) must still find and reuse it.
    successor.status = "active";
    successor.isCurrent = true;
    await successor.save();

    const retried = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(String(retried._id)).toBe(String(successor._id));

    const count = await Contract.countDocuments({ replacesContractId: oldContract._id, contractPurpose: "renewal" });
    expect(count).toBe(1);
  });

  test("a predecessor whose only prior successor was cancelled is allowed a fresh legitimate successor", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"),
      monthlyRent: undefined,
    });

    const cancelled = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    await transitionContract(cancelled, "cancelled", actorId, "Renewal cancelled");

    const fresh = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    expect(String(fresh._id)).not.toBe(String(cancelled._id));

    const count = await Contract.countDocuments({ replacesContractId: oldContract._id, contractPurpose: "renewal" });
    expect(count).toBe(2);
  });

  test("multiple legitimate (non-abandoned) successors for the same predecessor is reported as a conflict, not silently resolved", async () => {
    const { tenant, room, reservation, stay } = await seedTenantRoomReservation({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const actorId = new mongoose.Types.ObjectId();
    const oldContract = await createOldContract({
      tenant, room, reservation, stay, roomType: "quadruple-sharing", leaseDurationMonths: 1, approvedMonthlyRate: 7000, actorId,
    });
    const newStay = await makeNewStay({
      reservation, room,
      leaseStartDate: new Date("2026-04-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-10-01T00:00:00.000Z"),
      monthlyRent: undefined,
    });

    const first = await createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId });
    // Simulate corrupted data: a second legitimate (non-abandoned) successor
    // created out-of-band, bypassing the idempotency guard.
    const number = await generateContractNumber(room.branch, new Date());
    await Contract.create({
      ...number, contractPurpose: "renewal", replacesContractId: oldContract._id, parentContractId: oldContract._id,
      tenantId: tenant._id, applicationId: reservation._id, reservationId: reservation._id, stayId: newStay._id,
      roomId: room._id, branch: room.branch, propertyName: "Lilycrest Dormitory", propertyAddress: "123 Test St.",
      roomNumber: room.roomNumber, roomType: "quadruple-sharing", leaseType: "long_term",
      leaseStartDate: newStay.leaseStartDate, leaseEndDate: newStay.leaseEndDate, leaseDurationMonths: 6,
      approvedMonthlyRate: 5400, status: "draft", isCurrent: false,
      statusHistory: [{ status: "draft", changedBy: actorId, reason: "corrupted duplicate" }],
      createdBy: actorId, updatedBy: actorId,
    });

    await expect(
      createSuccessorContractForRenewal({ reservationId: reservation._id, oldContract, newStay, actorId }),
    ).rejects.toMatchObject({ code: "MULTIPLE_RENEWAL_SUCCESSORS" });
    expect(first).toBeTruthy();
  });
});
