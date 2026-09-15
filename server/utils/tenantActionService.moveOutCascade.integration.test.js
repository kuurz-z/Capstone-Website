import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { moveOutStayWorkflow } from "./tenantActionService.js";
import {
  resolveAuthoritativeCurrentContract,
} from "../services/tenantContractSelectionService.js";
import {
  Bill,
  BedHistory,
  Contract,
  Reservation,
  Room,
  Stay,
  User,
  UtilityReading,
  UtilityPeriod,
} from "../models/index.js";
import StayExtensionRequest from "../models/StayExtensionRequest.js";
import { createOpenUtilityPeriodWithBoundary } from "../services/billing/utilityPeriodLifecycleService.js";

jest.setTimeout(60_000);

describe("moveOutStayWorkflow cascade cancellations and bed release", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "moveout_cascade_sync" });
    await UtilityPeriod.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      Bill.deleteMany({}),
      BedHistory.deleteMany({}),
      Contract.deleteMany({}),
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      Stay.deleteMany({}),
      StayExtensionRequest.deleteMany({}),
      User.deleteMany({}),
      UtilityReading.deleteMany({}),
      UtilityPeriod.deleteMany({}),
    ]);
  });

  const leaseStart = new Date("2026-01-01T00:00:00.000Z");
  const leaseEnd = new Date("2026-12-31T00:00:00.000Z");

  async function seed() {
    const oid = () => new mongoose.Types.ObjectId();
    const admin = await User.create({
      firebaseUid: `firebase-admin-${oid()}`,
      email: `admin-${oid()}@example.test`,
      username: `admin_${oid().toString().slice(-10)}`,
      firstName: "Admin",
      lastName: "User",
      role: "branch_admin",
      branch: "gil-puyat",
    });
    const tenant = await User.create({
      firebaseUid: `firebase-${oid()}`,
      email: `tenant-${oid()}@example.test`,
      username: `tenant_${oid().toString().slice(-10)}`,
      firstName: "Test",
      lastName: "Tenant",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });
    const room = await Room.create({
      name: "Room 402",
      roomNumber: "402",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6300,
      beds: [
        { id: "bed-1", position: "lower", status: "occupied", occupiedBy: { userId: tenant._id } },
        { id: "bed-2", position: "upper", status: "available" },
      ],
      currentOccupancy: 1,
    });
    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      leaseDuration: 12,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      monthlyRent: 6300,
      moveInDate: leaseStart,
      selectedBed: { id: "bed-1", position: "lower" },
    });
    await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: leaseStart,
      startReading: 1000,
      ratePerUnit: 16,
      actorId: admin._id,
    });
    const stay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: "gil-puyat",
      roomId: room._id,
      bedId: "lower", // bedId recorded as position name
      leaseStartDate: leaseStart,
      leaseEndDate: leaseEnd,
      monthlyRent: 6300,
      status: "active",
    });
    await BedHistory.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: "gil-puyat",
      roomId: room._id,
      bedId: "lower",
      moveInDate: leaseStart,
      status: "active",
    });
    const currentContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      contractNumber: `LIL-GP-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      contractYear: 2026,
      contractSequence: Math.floor(Math.random() * 90000) + 10000,
      contractPurpose: "initial",
      roomType: "quadruple-sharing",
      leaseType: "long_term",
      propertyName: "LilyCrest Residences",
      propertyAddress: "123 Gil Puyat Ave, Makati",
      roomNumber: "402",
      leaseStartDate: leaseStart,
      leaseEndDate: leaseEnd,
      status: "active",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "published",
      finalStorageKey: "contracts/final/seed.pdf",
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Dangling unfulfilled renewal contract (e.g. generated / draft)
    const renewalContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: "gil-puyat",
      contractNumber: `LIL-GP-2027-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      contractYear: 2027,
      contractSequence: Math.floor(Math.random() * 90000) + 10000,
      contractPurpose: "renewal",
      replacesContractId: currentContract._id,
      roomType: "quadruple-sharing",
      leaseType: "long_term",
      propertyName: "LilyCrest Residences",
      propertyAddress: "123 Gil Puyat Ave, Makati",
      roomNumber: "402",
      leaseStartDate: new Date("2027-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2027-12-31T00:00:00.000Z"),
      status: "generated",
      isCurrent: false,
      tenantVisible: true,
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Upcoming future Stay
    const upcomingStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: "gil-puyat",
      roomId: room._id,
      bedId: "bed-1",
      leaseStartDate: new Date("2027-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2027-12-31T00:00:00.000Z"),
      monthlyRent: 6300,
      status: "upcoming",
    });

    // Pending StayExtensionRequest
    const extRequest = await StayExtensionRequest.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      stayId: stay._id,
      contractId: currentContract._id,
      roomId: room._id,
      branch: "gil-puyat",
      currentStartDate: leaseStart,
      currentEndDate: leaseEnd,
      requestedEndDate: new Date("2027-06-30T00:00:00.000Z"),
      months: 6,
      monthlyRent: 6300,
      status: "pending",
    });

    reservation.pendingExtensionRequestId = extRequest._id;
    await reservation.save();

    return {
      admin,
      tenant,
      room,
      reservation,
      stay,
      currentContract,
      renewalContract,
      upcomingStay,
      extRequest,
    };
  }

  const movePayload = (overrides = {}) => ({
    confirm: true,
    moveOutDate: "2026-12-31",
    finalUtilityReading: 1234,
    finalNotes: "Move out with cascade check",
    ...overrides,
  });

  test("moveOutStayWorkflow cascade-cancels renewal contracts, upcoming stays, extension requests, and vacates bed with position bedId", async () => {
    const {
      admin,
      tenant,
      room,
      reservation,
      currentContract,
      renewalContract,
      upcomingStay,
      extRequest,
    } = await seed();

    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: movePayload(),
      actorId: admin._id,
    });

    // 1. Current contract transitions to expired and non-current
    const reloadedCurrentContract = await Contract.findById(currentContract._id).lean();
    expect(reloadedCurrentContract.status).toBe("expired");
    expect(reloadedCurrentContract.isCurrent).toBe(false);

    // 2. Generated/draft renewal contract transitions to cancelled
    const reloadedRenewalContract = await Contract.findById(renewalContract._id).lean();
    expect(reloadedRenewalContract.status).toBe("cancelled");
    expect(reloadedRenewalContract.isCurrent).toBe(false);

    // 3. Upcoming stay transitions to cancelled
    const reloadedUpcomingStay = await Stay.findById(upcomingStay._id).lean();
    expect(reloadedUpcomingStay.status).toBe("cancelled");
    expect(reloadedUpcomingStay.endReason).toBe("tenant_moved_out");

    // 4. StayExtensionRequest transitions to cancelled
    const reloadedExtRequest = await StayExtensionRequest.findById(extRequest._id).lean();
    expect(reloadedExtRequest.status).toBe("cancelled");
    expect(reloadedExtRequest.adminNote).toContain("Cancelled automatically due to tenant move-out");

    // 5. Reservation pendingExtensionRequestId is cleared
    const reloadedReservation = await Reservation.findById(reservation._id).lean();
    expect(reloadedReservation.pendingExtensionRequestId).toBeFalsy();

    // 6. Room bed is vacated even when bedId was "lower"
    const reloadedRoom = await Room.findById(room._id).lean();
    expect(reloadedRoom.currentOccupancy).toBe(0);
    const bed1 = reloadedRoom.beds.find((b) => b.id === "bed-1");
    expect(bed1.status).toBe("available");
    expect(bed1.occupiedBy?.userId).toBeFalsy();
  });
});
