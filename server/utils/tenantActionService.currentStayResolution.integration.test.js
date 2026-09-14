/**
 * PR 2 — Canonical Lease Resolution regression test.
 *
 * Root cause: "is this Stay currently in effect" was defined two different
 * ways across the codebase — tenantContractSelectionService.js (the
 * tenant-facing selector) treated active+ending_soon as current, while
 * ensureActiveStay/renewStayWorkflow/transferStayWorkflow matched only the
 * exact "active" status. Once a Stay legitimately transitions to
 * "ending_soon" (its lease is nearing its end date — not an anomaly), the
 * renewal/transfer/move-out paths stopped recognizing it as the tenant's
 * existing Stay and would either reject the action (NO_ACTIVE_STAY) or, via
 * ensureActiveStay's create-if-missing fallback, create a SECOND Stay for
 * the same reservation — the exact mechanism that produced duplicate
 * lease/contract lifecycles.
 *
 * This proves the two paths now agree: renewStayWorkflow accepts an
 * "ending_soon" Stay as the tenant's current lease, extends THAT Stay's
 * lineage (previousStayId points at it), and never creates a duplicate.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { renewStayWorkflow } from "./tenantActionService.js";
import { resolveCurrentStayForReservation } from "../services/tenantContractSelectionService.js";
import { Reservation, Room, Stay, User } from "../models/index.js";

jest.setTimeout(60_000);

describe("current-stay resolution unifies active + ending_soon across renewal", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "current_stay_resolution" });
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
      Stay.deleteMany({}),
    ]);
  });

  async function seed(stayStatus) {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Test", lastName: "Tenant", role: "tenant", tenantStatus: "active",
    });
    const room = await Room.create({
      name: "Room 301", roomNumber: "301", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 6000,
    });
    const leaseStart = new Date("2025-12-01T00:00:00.000Z");
    const leaseEnd = new Date("2026-01-31T00:00:00.000Z");
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 2,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6000,
      monthlyRent: 6000, moveInDate: leaseStart,
      selectedBed: { id: "bed-1" },
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate: leaseStart, leaseEndDate: leaseEnd,
      monthlyRent: 6000, status: stayStatus,
    });
    return { tenant, room, reservation, stay };
  }

  test("resolveCurrentStayForReservation finds an ending_soon Stay (not just active)", async () => {
    const { reservation, stay } = await seed("ending_soon");
    const resolved = await resolveCurrentStayForReservation(reservation._id);
    expect(String(resolved?._id)).toBe(String(stay._id));
  });

  test("renewStayWorkflow extends an ending_soon Stay instead of rejecting it or duplicating it", async () => {
    const { reservation, stay } = await seed("ending_soon");

    const result = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: new Date("2026-02-01T00:00:00.000Z"),
        newLeaseEndDate: new Date("2026-07-31T00:00:00.000Z"),
        monthlyRent: 6300,
      },
      actorId: reservation.userId,
    });

    expect(result.stay.status).toBe("active");
    expect(String(result.stay.previousStayId)).toBe(String(stay._id));

    // The predecessor Stay was transitioned (renewed), not left dangling as
    // a second independently-active record.
    const predecessor = await Stay.findById(stay._id);
    expect(predecessor.status).toBe("renewed");

    // Exactly one Stay now reports as the reservation's current lease —
    // never two competing "current" Stay documents for the same reservation.
    const allStaysForReservation = await Stay.find({ reservationId: reservation._id });
    expect(allStaysForReservation).toHaveLength(2); // predecessor (renewed) + successor (active)
    const currentOnes = allStaysForReservation.filter((s) => ["active", "ending_soon"].includes(s.status));
    expect(currentOnes).toHaveLength(1);
    expect(String(currentOnes[0]._id)).toBe(String(result.stay._id));
  });

  test("resolveValidatedRoomTransferIntent self-heals a missing Stay when an active Contract exists", async () => {
    const { resolveValidatedRoomTransferIntent } = await import("./tenantActionService.js");
    const { Contract } = await import("../models/index.js");

    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Transfer", lastName: "Tenant", role: "tenant", tenantStatus: "active",
    });
    const roomA = await Room.create({
      name: "Room 201", roomNumber: "201", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 5400,
      beds: [
        { id: "r201-b1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "r201-b2", position: "upper", status: "available" },
      ],
    });
    const roomB = await Room.create({
      name: "Room 222", roomNumber: "222", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 5400,
      beds: [
        { id: "r222-b1", position: "lower", status: "available" },
        { id: "r222-b2", position: "upper", status: "available" },
      ],
    });
    const leaseStart = new Date("2026-08-29T00:00:00.000Z");
    const leaseEnd = new Date("2027-07-01T00:00:00.000Z");
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: roomA._id, status: "moveIn", leaseDuration: 10,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 5400,
      monthlyRent: 5400, moveInDate: leaseStart,
      selectedBed: { id: "r201-b1" },
    });
    const actorId = new mongoose.Types.ObjectId();
    // Note: NO Stay record was seeded here!
    await Contract.create({
      contractNumber: "GP-2026-9999",
      contractYear: 2026,
      contractSequence: 9999,
      contractPurpose: "initial",
      leaseType: "long_term",
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      roomId: roomA._id,
      branch: "gil-puyat",
      roomNumber: "201",
      roomType: "quadruple-sharing",
      bedNumber: "r201-b1",
      bedId: "r201-b1",
      leaseStartDate: leaseStart,
      leaseEndDate: leaseEnd,
      leaseDurationMonths: 10,
      monthlyRent: 5400,
      approvedMonthlyRate: 5400,
      status: "active",
      isCurrent: true,
      isCanonical: true,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const intent = await resolveValidatedRoomTransferIntent({
      reservationId: reservation._id,
      payload: {
        targetRoomId: roomB._id,
        targetBedId: "r222-b1",
        effectiveTransferDate: leaseStart,
      },
    });

    expect(intent.activeStay).toBeDefined();
    expect(intent.activeStay.status).toBe("active");
    expect(String(intent.activeStay.roomId)).toBe(String(roomA._id));
    expect(intent.activeStay.leaseStartDate).toEqual(leaseStart);
    expect(intent.activeStay.leaseEndDate).toEqual(leaseEnd);

    // Verify it was persisted to MongoDB so subsequent operations find it
    const persistedStay = await resolveCurrentStayForReservation(reservation._id);
    expect(persistedStay).not.toBeNull();
    expect(String(persistedStay._id)).toBe(String(intent.activeStay._id));
  });
});
