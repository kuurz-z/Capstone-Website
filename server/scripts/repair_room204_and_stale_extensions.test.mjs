import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  reconcileRoom204,
  cleanupMovedOutExtensionRecords,
  repairRoom204AndStaleExtensions,
} from "./repair_room204_and_stale_extensions.mjs";

import {
  Contract,
  Reservation,
  Room,
  Stay,
  StayExtensionRequest,
  User,
} from "../models/index.js";

jest.setTimeout(60_000);

describe("repair_room204_and_stale_extensions", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "repair_room204_test" });
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      Contract.deleteMany({}),
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      Stay.deleteMany({}),
      StayExtensionRequest.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  const createTestUser = (overrides = {}) => {
    const id = new mongoose.Types.ObjectId();
    const rand = Math.floor(Math.random() * 1e6);
    return User.create({
      _id: id,
      firebaseUid: `fb-${id}-${rand}`,
      username: `user_${id.toString().slice(-6)}_${rand}`,
      email: `user_${id.toString().slice(-6)}_${rand}@example.com`,
      firstName: "Test",
      lastName: "User",
      role: "tenant",
      tenantStatus: "active",
      ...overrides,
    });
  };

  const createTestReservation = (overrides = {}) => {
    return Reservation.create({
      roomId: new mongoose.Types.ObjectId(),
      totalPrice: 10000,
      monthlyRent: 10000,
      leaseDurationMonths: 6,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-06-30"),
      branch: "gil-puyat",
      status: "moveIn",
      ...overrides,
    });
  };

  describe("Room 204 Bed Reconciliation", () => {
    test("frees stale beds for moved-out/inactive occupants while preserving active occupants", async () => {
      // 1. Create Room 204
      const room204Id = new mongoose.Types.ObjectId();

      // 2. Create active tenant
      const activeUser = await createTestUser({
        firstName: "Active",
        lastName: "Tenant",
        tenantStatus: "active",
      });

      // 3. Create moved-out tenant
      const movedOutUser = await createTestUser({
        firstName: "MovedOut",
        lastName: "Tenant",
        role: "applicant",
        tenantStatus: "moved_out",
      });

      // 4. Create active reservation
      const activeRes = await createTestReservation({
        userId: activeUser._id,
        roomId: room204Id,
        status: "moveIn",
      });

      // 5. Create moved-out reservation
      const movedOutRes = await createTestReservation({
        userId: movedOutUser._id,
        roomId: room204Id,
        status: "moveOut",
      });

      // 6. Create stays
      await Stay.create({
        tenantId: activeUser._id,
        reservationId: activeRes._id,
        branch: "gil-puyat",
        roomId: room204Id,
        bedId: "bed-1",
        leaseStartDate: new Date("2026-01-01"),
        leaseEndDate: new Date("2026-12-31"),
        monthlyRent: 8000,
        status: "active",
      });

      await Stay.create({
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        branch: "gil-puyat",
        roomId: room204Id,
        bedId: "bed-2",
        leaseStartDate: new Date("2025-01-01"),
        leaseEndDate: new Date("2025-12-31"),
        monthlyRent: 8000,
        status: "completed",
        endedAt: new Date("2025-12-31"),
        endReason: "tenant_moved_out",
      });

      // 7. Create Room 204 with 4 beds:
      // Bed 1: active tenant (should stay occupied)
      // Bed 2: moved-out tenant (should be freed to available)
      // Bed 3: expired locked bed (should be freed to available)
      // Bed 4: available bed (should remain available)
      const room204 = await Room.create({
        _id: room204Id,
        name: "Room 204",
        roomNumber: "204",
        branch: "gil-puyat",
        type: "quadruple-sharing",
        capacity: 4,
        currentOccupancy: 3,
        available: false,
        price: 8000,
        beds: [
          {
            id: "bed-1",
            position: "lower",
            bunkBlock: "A",
            status: "occupied",
            occupiedBy: {
              userId: activeUser._id,
              reservationId: activeRes._id,
              occupiedSince: new Date("2026-01-01"),
            },
          },
          {
            id: "bed-2",
            position: "upper",
            bunkBlock: "A",
            status: "occupied",
            occupiedBy: {
              userId: movedOutUser._id,
              reservationId: movedOutRes._id,
              occupiedSince: new Date("2025-01-01"),
            },
          },
          {
            id: "bed-3",
            position: "lower",
            bunkBlock: "B",
            status: "locked",
            lockedBy: movedOutUser._id,
            lockExpiresAt: new Date(Date.now() - 3600 * 1000), // expired
          },
          {
            id: "bed-4",
            position: "upper",
            bunkBlock: "B",
            status: "available",
            occupiedBy: { userId: null, reservationId: null, occupiedSince: null },
          },
        ],
      });

      const logs = [];
      const result = await reconcileRoom204({ dryRun: false, log: (msg) => logs.push(msg) });

      expect(result.bedsFreed).toBe(2);
      expect(result.roomsUpdated).toBe(1);

      const reloaded = await Room.findById(room204._id).lean();
      expect(reloaded.currentOccupancy).toBe(1);
      expect(reloaded.available).toBe(true);

      const [b1, b2, b3, b4] = reloaded.beds;
      // Bed 1 remains active
      expect(b1.status).toBe("occupied");
      expect(String(b1.occupiedBy.userId)).toBe(String(activeUser._id));

      // Bed 2 is freed
      expect(b2.status).toBe("available");
      expect(b2.occupiedBy.userId).toBeNull();
      expect(b2.occupiedBy.reservationId).toBeNull();

      // Bed 3 is unlocked
      expect(b3.status).toBe("available");
      expect(b3.lockedBy).toBeNull();
      expect(b3.lockExpiresAt).toBeNull();

      // Bed 4 stays available
      expect(b4.status).toBe("available");
    });
  });

  describe("Moved-Out Extension & Renewal Records Cleanup", () => {
    test("cancels unfulfilled renewal contracts, upcoming stays, and extension requests for moved-out reservations", async () => {
      const room = await Room.create({
        name: "Room 101",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 10000,
      });

      const movedOutUser = await createTestUser({
        firstName: "Past",
        lastName: "Tenant",
        role: "applicant",
        tenantStatus: "moved_out",
      });

      const movedOutRes = await createTestReservation({
        userId: movedOutUser._id,
        roomId: room._id,
        status: "moveOut",
      });

      const activeUser = await createTestUser({
        firstName: "Current",
        lastName: "Tenant",
        role: "tenant",
        tenantStatus: "active",
      });

      const activeRes = await createTestReservation({
        userId: activeUser._id,
        roomId: room._id,
        status: "moveIn",
      });

      // 1. Contracts for moved-out reservation
      const draftRenewal = await Contract.create({
        contractNumber: "LIL-GP-2026-90001",
        contractYear: 2026,
        contractSequence: 90001,
        contractPurpose: "renewal",
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        roomId: room._id,
        branch: "gil-puyat",
        roomType: "private",
        leaseType: "long_term",
        propertyName: "Lilycrest Gil Puyat",
        propertyAddress: "Gil Puyat Ave",
        roomNumber: "101",
        status: "draft",
        isCurrent: true,
        createdBy: movedOutUser._id,
        updatedBy: movedOutUser._id,
      });

      const publishedRenewal = await Contract.create({
        contractNumber: "LIL-GP-2026-90002",
        contractYear: 2026,
        contractSequence: 90002,
        contractPurpose: "renewal",
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        roomId: room._id,
        branch: "gil-puyat",
        roomType: "private",
        leaseType: "long_term",
        propertyName: "Lilycrest Gil Puyat",
        propertyAddress: "Gil Puyat Ave",
        roomNumber: "101",
        status: "published",
        isCurrent: true,
        createdBy: movedOutUser._id,
        updatedBy: movedOutUser._id,
      });

      // 2. Upcoming stay for moved-out reservation
      const upcomingStay = await Stay.create({
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        branch: "gil-puyat",
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2027-01-01"),
        leaseEndDate: new Date("2027-12-31"),
        monthlyRent: 10000,
        status: "upcoming",
      });

      // 3. Extension requests for moved-out reservation
      const pendingExtReq = await StayExtensionRequest.create({
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        stayId: upcomingStay._id,
        contractId: draftRenewal._id,
        roomId: room._id,
        branch: "gil-puyat",
        currentStartDate: new Date("2026-01-01"),
        currentEndDate: new Date("2026-12-31"),
        requestedEndDate: new Date("2027-06-30"),
        months: 6,
        monthlyRent: 10000,
        status: "pending",
      });

      // 4. Active reservation records (should NOT be modified)
      const activeContract = await Contract.create({
        contractNumber: "LIL-GP-2026-90003",
        contractYear: 2026,
        contractSequence: 90003,
        contractPurpose: "renewal",
        tenantId: activeUser._id,
        reservationId: activeRes._id,
        roomId: room._id,
        branch: "gil-puyat",
        roomType: "private",
        leaseType: "long_term",
        propertyName: "Lilycrest Gil Puyat",
        propertyAddress: "Gil Puyat Ave",
        roomNumber: "101",
        status: "published",
        isCurrent: true,
        createdBy: activeUser._id,
        updatedBy: activeUser._id,
      });

      const activeUpcomingStay = await Stay.create({
        tenantId: activeUser._id,
        reservationId: activeRes._id,
        branch: "gil-puyat",
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2027-01-01"),
        leaseEndDate: new Date("2027-12-31"),
        monthlyRent: 10000,
        status: "upcoming",
      });

      const logs = [];
      const result = await cleanupMovedOutExtensionRecords({
        dryRun: false,
        log: (msg) => logs.push(msg),
      });

      expect(result.movedOutReservationsChecked).toBe(1);
      expect(result.contractsCancelled).toBe(2);
      expect(result.staysCancelled).toBe(1);
      expect(result.extensionRequestsCancelled).toBe(1);

      // Check cancelled contracts
      const reloadedDraft = await Contract.findById(draftRenewal._id).lean();
      expect(reloadedDraft.status).toBe("cancelled");
      expect(reloadedDraft.isCurrent).toBe(false);
      expect(reloadedDraft.statusHistory.slice(-1)[0]).toMatchObject({
        status: "cancelled",
        reason: "predecessor_moved_out",
      });

      const reloadedPublished = await Contract.findById(publishedRenewal._id).lean();
      expect(reloadedPublished.status).toBe("cancelled");
      expect(reloadedPublished.isCurrent).toBe(false);

      // Check cancelled stay
      const reloadedStay = await Stay.findById(upcomingStay._id).lean();
      expect(reloadedStay.status).toBe("cancelled");
      expect(reloadedStay.endReason).toBe("tenant_moved_out");

      // Check cancelled extension request
      const reloadedReq = await StayExtensionRequest.findById(pendingExtReq._id).lean();
      expect(reloadedReq.status).toBe("cancelled");
      expect(reloadedReq.adminNote).toBe("Cancelled via move-out repair.");

      // Check active reservation records remain untouched
      const reloadedActiveContract = await Contract.findById(activeContract._id).lean();
      expect(reloadedActiveContract.status).toBe("published");
      expect(reloadedActiveContract.isCurrent).toBe(true);

      const reloadedActiveStay = await Stay.findById(activeUpcomingStay._id).lean();
      expect(reloadedActiveStay.status).toBe("upcoming");
    });

    test("dry-run mode produces reports without mutating database documents", async () => {
      const room = await Room.create({
        name: "Room 204",
        roomNumber: "204",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 10000,
        currentOccupancy: 1,
        beds: [
          {
            id: "bed-1",
            position: "single",
            status: "occupied",
            occupiedBy: { userId: new mongoose.Types.ObjectId() },
          },
        ],
      });

      const movedOutUser = await createTestUser({
        firstName: "Dry",
        lastName: "Run",
        role: "applicant",
        tenantStatus: "moved_out",
      });

      const movedOutRes = await createTestReservation({
        userId: movedOutUser._id,
        roomId: room._id,
        status: "moveOut",
      });

      // Point bed 1 to movedOutUser
      room.beds[0].occupiedBy = { userId: movedOutUser._id, reservationId: movedOutRes._id };
      await room.save();

      const contract = await Contract.create({
        contractNumber: "LIL-GP-2026-90099",
        contractYear: 2026,
        contractSequence: 90099,
        contractPurpose: "renewal",
        tenantId: movedOutUser._id,
        reservationId: movedOutRes._id,
        roomId: room._id,
        branch: "gil-puyat",
        roomType: "private",
        leaseType: "long_term",
        propertyName: "Lilycrest Gil Puyat",
        propertyAddress: "Gil Puyat Ave",
        roomNumber: "204",
        status: "draft",
        isCurrent: true,
        createdBy: movedOutUser._id,
        updatedBy: movedOutUser._id,
      });

      const result = await repairRoom204AndStaleExtensions({
        dryRun: true,
        log: () => {},
      });

      expect(result.dryRun).toBe(true);
      expect(result.room204.bedsFreed).toBe(1);
      expect(result.extensions.contractsCancelled).toBe(1);

      // Verify no changes were committed
      const reloadedRoom = await Room.findById(room._id).lean();
      expect(reloadedRoom.beds[0].status).toBe("occupied");
      expect(reloadedRoom.currentOccupancy).toBe(1);

      const reloadedContract = await Contract.findById(contract._id).lean();
      expect(reloadedContract.status).toBe("draft");
      expect(reloadedContract.isCurrent).toBe(true);
    });
  });
});
