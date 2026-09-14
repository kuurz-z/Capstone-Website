/**
 * Integration test for Phase 5B: renewal-offer pricing must match the same
 * canonical room-type + duration pricing that the renewal successor
 * Contract will later snapshot (contractService.js
 * createSuccessorContractForRenewal). Exercises the real controllers
 * (createRenewalOffer, respondToRenewalOffer) and tenantActionService
 * (renewStayWorkflow) against a real in-memory MongoDB.
 *
 * Business reference (Gil Puyat):
 *   Quadruple long 6000->5400 (10%)   short 7000->6300 (10%)
 *   Double    long 9000->7200 (20%)   short 10000->8000 (20%)
 *   Private   long 15000->13500 (10%) short 16000->14400 (10%)
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

describe("renewal offer pricing (createRenewalOffer / respondToRenewalOffer)", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "renewal_offer_pricing_integration" });
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

  async function seed({ roomType, roomPrice }) {
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
      moveInDate: new Date("2026-01-01T00:00:00.000Z"), monthlyRent: roomPrice,
      selectedBed: { id: "bed-1" },
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1",
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2026-04-01T00:00:00.000Z"),
      monthlyRent: roomPrice, status: "active",
    });
    return { admin, tenant, room, reservation, stay };
  }

  const req = (admin, params, body) => ({
    id: "renewal-offer-pricing-test",
    params, body,
    branchFilter: undefined,
    user: { uid: admin.firebaseUid },
  });

  const CASES = [
    { name: "Quadruple Short", roomType: "quadruple-sharing", roomPrice: 7000, months: 3, regular: 7000, final: 6300 },
    { name: "Quadruple Long", roomType: "quadruple-sharing", roomPrice: 6000, months: 6, regular: 6000, final: 5400 },
    { name: "Double Short", roomType: "double-sharing", roomPrice: 10000, months: 3, regular: 10000, final: 8000 },
    { name: "Double Long", roomType: "double-sharing", roomPrice: 9000, months: 6, regular: 9000, final: 7200 },
    { name: "Private Short", roomType: "private", roomPrice: 16000, months: 3, regular: 16000, final: 14400 },
    { name: "Private Long", roomType: "private", roomPrice: 15000, months: 6, regular: 15000, final: 13500 },
  ];

  test.each(CASES)("$name: offer stores canonical regular $regular / final $final", async ({ roomType, roomPrice, months, regular, final }) => {
    const { admin, reservation } = await seed({ roomType, roomPrice });
    const res = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.offer.proposedRent).toBe(final);
    expect(res.body.offer.regularMonthlyRate).toBe(regular);
    expect(res.body.offer.pricingSource).toBe("canonical_resolver");
  });

  test("short-term current room renewing to long-term: offer resolves 5400, not the current 6300 rent", async () => {
    const { admin, reservation } = await seed({ roomType: "quadruple-sharing", roomPrice: 6300 });
    const res = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months: 6 }), res);
    expect(res.body.offer.proposedRent).toBe(5400);
  });

  test("Room.monthlyPrice does not override the canonical approved renewal rate", async () => {
    const { admin, reservation, room } = await seed({ roomType: "quadruple-sharing", roomPrice: 7000 });
    // Room's raw price does not match any canonical short-term(6300)/long-term(5400) figure.
    await Room.updateOne({ _id: room._id }, { $set: { price: 7000 } });
    const res = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months: 6 }), res);
    expect(res.body.offer.proposedRent).toBe(5400);
  });

  test("Reservation.monthlyRent does not override the canonical approved renewal rate", async () => {
    const { admin, reservation } = await seed({ roomType: "quadruple-sharing", roomPrice: 6300 });
    await Reservation.updateOne({ _id: reservation._id }, { $set: { monthlyRent: 6300 } });
    const res = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months: 6 }), res);
    expect(res.body.offer.proposedRent).toBe(5400);
  });

  test("offer/Contract/Stay parity: accepted proposedRent flows unchanged into the new Stay's monthlyRent and links via renewalOfferId", async () => {
    const { admin, tenant, reservation } = await seed({ roomType: "quadruple-sharing", roomPrice: 6000 });
    const offerRes = response();
    await createRenewalOffer(req(admin, { reservationId: String(reservation._id) }, { months: 6 }), offerRes);
    const offer = offerRes.body.offer;
    expect(offer.proposedRent).toBe(5400);

    const acceptReq = {
      id: "accept-test",
      params: { reservationId: String(reservation._id), offerId: offer.offerId },
      body: { action: "accept" },
      user: { uid: tenant.firebaseUid },
    };
    const acceptRes = response();
    await respondToRenewalOffer(acceptReq, acceptRes);

    expect(acceptRes.statusCode).toBeLessThan(400);
    const newStay = await Stay.findOne({ reservationId: reservation._id, previousStayId: { $ne: null } });
    expect(newStay).toBeTruthy();
    expect(newStay.monthlyRent).toBe(5400);
    expect(newStay.renewalOfferId).toBe(offer.offerId);

    const reloadedReservation = await Reservation.findById(reservation._id);
    const acceptedOffer = reloadedReservation.renewalOffers.find((o) => o.offerId === offer.offerId);
    expect(acceptedOffer.status).toBe("accepted");
    expect(acceptedOffer.proposedRent).toBe(5400);
  });
});
