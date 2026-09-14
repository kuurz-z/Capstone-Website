/**
 * Phase 2B regression: renewStayWorkflow must NOT write the renewal's new
 * rate onto reservation.monthlyRent immediately at acceptance — that would
 * leak into current-period billing before the renewal actually takes
 * effect (rentGenerator.resolveReservationRentAmount reads
 * reservation.monthlyRent live, at bill-generation time, which can happen
 * up to RENT_GENERATION_LEAD_DAYS before a cycle even starts). The new
 * rate is applied exactly once, atomically, at the renewal's effective
 * date by contractRenewalActivationService (covered separately in
 * contractRenewalActivationService.integration.test.js).
 *
 * Uses a real (single-node) replica set via MongoMemoryReplSet because
 * renewStayWorkflow runs inside a genuine Mongo transaction.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { renewStayWorkflow } from "./tenantActionService.js";
import { Reservation, Room, Stay, User } from "../models/index.js";

jest.setTimeout(60_000);

describe("renewStayWorkflow does not prematurely change the Reservation billing rate", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "renewal_rate_timing" });
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

  test("accepting a renewal weeks before it takes effect leaves reservation.monthlyRent at the OLD rate", async () => {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Test", lastName: "Tenant", role: "tenant", tenantStatus: "active",
    });
    const room = await Room.create({
      name: "Room 301", roomNumber: "301", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 6300,
    });
    const leaseStart = new Date("2025-12-01T00:00:00.000Z");
    const leaseEnd = new Date("2026-01-31T00:00:00.000Z");
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 2,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6300,
      monthlyRent: 6300, moveInDate: leaseStart,
      selectedBed: { id: "bed-1" },
    });
    await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate: leaseStart, leaseEndDate: leaseEnd,
      monthlyRent: 6300, status: "active",
    });

    // Renewal accepted on Dec 15 (well ahead of the Feb 1 start), at a
    // higher rate — reproduces the task's exact example scenario.
    const result = await renewStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        newLeaseStartDate: new Date("2026-02-01T00:00:00.000Z"),
        newLeaseEndDate: new Date("2026-07-31T00:00:00.000Z"),
        monthlyRent: 6800,
      },
      actorId: tenant._id,
    });

    expect(result.stay.monthlyRent).toBe(6800); // new Stay legitimately describes the new terms
    expect(result.stay.status).toBe("active");

    const reloadedReservation = await Reservation.findById(reservation._id);
    // The billing source of truth must remain the OLD rate until the
    // renewal's actual effective date — never the renewal's rate the
    // moment it's merely accepted.
    expect(reloadedReservation.monthlyRent).toBe(6300);
  });
});
