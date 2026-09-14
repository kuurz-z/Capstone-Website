/**
 * PR 1 — Renewal Atomicity concurrency regression tests.
 *
 * Reproduces the races identified in the contract/renewal audit:
 *   - two concurrent Accept requests on the same offer must extend the
 *     lease exactly once (createRenewalOffer/respondToRenewalOffer used to
 *     be a non-atomic read-check-then-save pair);
 *   - two concurrent offer-creation requests must leave exactly one
 *     pending offer.
 *
 * Uses a real (single-node) replica set via MongoMemoryReplSet since the
 * fix relies on MongoDB's single-document atomic update guarantees and on
 * renewStayWorkflow's own transaction.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

jest.setTimeout(120_000);

await jest.unstable_mockModule("../../utils/auditLogger.js", () => ({
  default: {
    log: jest.fn(),
    logError: jest.fn(),
    logModification: jest.fn(),
  },
}));
await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
await jest.unstable_mockModule("../../utils/notificationService.js", () => ({
  notify: { general: jest.fn().mockResolvedValue(undefined) },
}));
await jest.unstable_mockModule("../../utils/occupancyManager.js", () => ({
  updateOccupancyOnReservationChange: jest.fn(),
}));

const { createRenewalOffer, respondToRenewalOffer } = await import("./tenancyActionsController.js");
const { Reservation, Room, User, Stay, BedHistory, BusinessSettings } = await import("../../models/index.js");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe("renewal offer concurrency (createRenewalOffer / respondToRenewalOffer)", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "renewal_concurrency_integration" });
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
      BedHistory.deleteMany({}),
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

  async function seed() {
    const admin = await User.create({
      firebaseUid: `admin-${new mongoose.Types.ObjectId()}`,
      email: `admin-${new mongoose.Types.ObjectId()}@example.test`,
      username: `admin_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Admin", lastName: "User", role: "branch_admin",
    });
    const tenant = await User.create({
      firebaseUid: `tenant-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Test", lastName: "Tenant", role: "tenant", tenantStatus: "active",
    });
    const room = await Room.create({
      name: "Room 301", roomNumber: "301", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 6000,
    });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 3,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6000,
      moveInDate: new Date("2026-01-01T00:00:00.000Z"), monthlyRent: 6000,
      selectedBed: { id: "bed-1" },
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1",
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-04-01T00:00:00.000Z"),
      monthlyRent: 6000, status: "active",
    });
    return { admin, tenant, room, reservation, stay };
  }

  const req = (user, params, body) => ({
    id: `renewal-concurrency-${Math.random()}`,
    params, body,
    branchFilter: undefined,
    user: { uid: user.firebaseUid },
  });

  test("two concurrent offer-creation requests leave exactly one pending offer", async () => {
    const { admin, reservation } = await seed();
    const params = { reservationId: String(reservation._id) };
    const body = { months: 6 };

    const resA = response();
    const resB = response();
    await Promise.all([
      createRenewalOffer(req(admin, params, body), resA),
      createRenewalOffer(req(admin, params, body), resB),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const reloaded = await Reservation.findById(reservation._id);
    const pending = (reloaded.renewalOffers || []).filter((o) => o.status === "pending");
    expect(pending).toHaveLength(1);
    expect(reloaded.renewalOffers).toHaveLength(1);
  });

  test("two concurrent Accept requests extend the lease exactly once", async () => {
    const { admin, tenant, reservation } = await seed();

    const offerRes = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months: 6 }), offerRes);
    const offer = offerRes.body.offer;

    const acceptParams = { reservationId: String(reservation._id), offerId: offer.offerId };
    const acceptBody = { action: "accept" };

    const resA = response();
    const resB = response();
    await Promise.all([
      respondToRenewalOffer(req(tenant, acceptParams, acceptBody), resA),
      respondToRenewalOffer(req(tenant, acceptParams, acceptBody), resB),
    ]);

    // Exactly one request performed the real extension (2xx, no
    // alreadyProcessed flag); the other must be a safe idempotent no-op
    // (2xx with alreadyProcessed:true) — neither may error, and neither
    // pair-permutation may both report a fresh extension.
    const results = [resA, resB];
    const fresh = results.filter((r) => r.statusCode < 300 && !r.body?.alreadyProcessed);
    const idempotent = results.filter((r) => r.statusCode === 200 && r.body?.alreadyProcessed === true);

    expect(fresh).toHaveLength(1);
    expect(idempotent).toHaveLength(1);

    // Exactly one successor Stay (renewal record) was created.
    const renewedStays = await Stay.find({ reservationId: reservation._id, previousStayId: { $ne: null } });
    expect(renewedStays).toHaveLength(1);
    expect(renewedStays[0].status).toBe("active");

    // Exactly one prior Stay was marked renewed (not two independent ones).
    const renewedPrevious = await Stay.find({ reservationId: reservation._id, status: "renewed" });
    expect(renewedPrevious).toHaveLength(1);

    // The offer itself ends in a single, consistent accepted state.
    const reloaded = await Reservation.findById(reservation._id);
    const acceptedOffer = reloaded.renewalOffers.find((o) => o.offerId === offer.offerId);
    expect(acceptedOffer.status).toBe("accepted");

    // Reservation now points at the single new Stay, not a stale/duplicate one.
    expect(String(reloaded.currentStayId)).toBe(String(renewedStays[0]._id));
  });
});
