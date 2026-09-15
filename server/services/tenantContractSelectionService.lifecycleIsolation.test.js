import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  attachContractLineage,
  resolveTenantCanonicalContract,
  resolveTenantUpcomingContract,
} from "./tenantContractSelectionService.js";
import { generateContractNumber } from "./contractService.js";
import { Contract, Reservation, Room, User, Stay } from "../models/index.js";
import { getMyCurrentContract } from "../controllers/contractController.js";

jest.setTimeout(60_000);

const res = () => ({
  statusCode: 200,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

describe("tenant contract selection - lifecycle & tenancy isolation", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri(), { dbName: "contract_lifecycle_isolation" });
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Reservation.deleteMany({}),
      Room.deleteMany({}),
      User.deleteMany({}),
      Contract.deleteMany({}),
      Stay.deleteMany({}),
    ]);
  });

  async function seedTenant() {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Returning",
      lastName: "Tenant",
      role: "tenant",
      tenantStatus: "active",
    });
    const room = await Room.create({
      name: "Room 101",
      roomNumber: "101",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6000,
    });
    return { tenant, room };
  }

  async function createContractHelper({ tenant, room, reservation, stay, actorId, overrides = {} }) {
    const number = await generateContractNumber(room.branch, new Date());
    return Contract.create({
      ...number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      stayId: stay?._id || null,
      roomId: room._id,
      branch: room.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Gil Puyat Ave",
      roomNumber: room.roomNumber,
      roomType: "quadruple-sharing",
      leaseType: "short_term",
      status: "active",
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "published",
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId,
      updatedBy: actorId,
      ...overrides,
    });
  }

  describe("resolveTenantUpcomingContract isolation", () => {
    test("returns null when tenant has no active stay and no canonical contract", async () => {
      const { tenant, room } = await seedTenant();
      const actorId = new mongoose.Types.ObjectId();

      // Old past reservation & stay (completed / moved out)
      const pastReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveOut",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2024-01-01"),
      });

      const pastStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-01-01"),
        leaseEndDate: new Date("2024-07-01"),
        monthlyRent: 6000,
        status: "completed",
      });

      // An old upcoming stay/contract from that past tenancy that was never activated
      const oldUpcomingStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-07-02"),
        leaseEndDate: new Date("2024-10-02"),
        monthlyRent: 6000,
        status: "upcoming",
        previousStayId: pastStay._id,
      });

      await createContractHelper({
        tenant,
        room,
        reservation: pastReservation,
        stay: oldUpcomingStay,
        actorId,
        overrides: {
          contractPurpose: "renewal",
          stayId: oldUpcomingStay._id,
          status: "generated",
          isCurrent: false,
          leaseStartDate: new Date("2024-07-02"),
        },
      });

      const upcoming = await resolveTenantUpcomingContract(tenant._id);
      expect(upcoming).toBeNull();
    });

    test("returns null when an upcoming stay exists from past tenancy and is not chained to current active stay", async () => {
      const { tenant, room } = await seedTenant();
      const actorId = new mongoose.Types.ObjectId();

      // Past tenancy (moved out)
      const pastReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveOut",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2024-01-01"),
      });

      const pastStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-01-01"),
        leaseEndDate: new Date("2024-07-01"),
        monthlyRent: 6000,
        status: "completed",
      });

      const staleUpcomingStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-07-02"),
        leaseEndDate: new Date("2024-10-02"),
        monthlyRent: 6000,
        status: "upcoming",
        previousStayId: pastStay._id, // chained to pastStay, NOT current activeStay
      });

      await createContractHelper({
        tenant,
        room,
        reservation: pastReservation,
        stay: staleUpcomingStay,
        actorId,
        overrides: {
          contractPurpose: "renewal",
          stayId: staleUpcomingStay._id,
          status: "generated",
          isCurrent: false,
          leaseStartDate: new Date("2024-07-02"),
        },
      });

      // New current tenancy (returning tenant with new reservation)
      const currentReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveIn",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2026-01-01"),
      });

      const currentStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: currentReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-2",
        leaseStartDate: new Date("2026-01-01"),
        leaseEndDate: new Date("2026-07-01"),
        monthlyRent: 6000,
        status: "active",
      });

      const currentContract = await createContractHelper({
        tenant,
        room,
        reservation: currentReservation,
        stay: currentStay,
        actorId,
        overrides: {
          contractPurpose: "initial",
          status: "active",
          isCurrent: true,
          leaseStartDate: new Date("2026-01-01"),
          leaseEndDate: new Date("2026-07-01"),
        },
      });

      const canonical = await resolveTenantCanonicalContract(tenant._id);
      expect(String(canonical._id)).toBe(String(currentContract._id));

      const upcoming = await resolveTenantUpcomingContract(tenant._id);
      // Stale upcoming renewal from 2024 tenancy must NOT be returned!
      expect(upcoming).toBeNull();
    });

    test("resolves upcoming contract when correctly chained to current active stay", async () => {
      const { tenant, room } = await seedTenant();
      const actorId = new mongoose.Types.ObjectId();

      const currentReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveIn",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2026-01-01"),
      });

      const currentStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: currentReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2026-01-01"),
        leaseEndDate: new Date("2026-07-01"),
        monthlyRent: 6000,
        status: "active",
      });

      const currentContract = await createContractHelper({
        tenant,
        room,
        reservation: currentReservation,
        stay: currentStay,
        actorId,
        overrides: {
          contractPurpose: "initial",
          status: "active",
          isCurrent: true,
          leaseStartDate: new Date("2026-01-01"),
          leaseEndDate: new Date("2026-07-01"),
        },
      });

      const validUpcomingStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: currentReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2026-07-02"),
        leaseEndDate: new Date("2026-10-02"),
        monthlyRent: 6000,
        status: "upcoming",
        previousStayId: currentStay._id, // properly chained
      });

      const validUpcomingContract = await createContractHelper({
        tenant,
        room,
        reservation: currentReservation,
        stay: validUpcomingStay,
        actorId,
        overrides: {
          contractPurpose: "renewal",
          replacesContractId: currentContract._id,
          stayId: validUpcomingStay._id,
          status: "generated",
          isCurrent: false,
          leaseStartDate: new Date("2026-07-02"),
          leaseEndDate: new Date("2026-10-02"),
        },
      });

      const upcoming = await resolveTenantUpcomingContract(tenant._id);
      expect(upcoming).toBeTruthy();
      expect(String(upcoming._id)).toBe(String(validUpcomingContract._id));
    });
  });

  describe("attachContractLineage grouping by reservation / tenancy lifecycle", () => {
    test("starts new reservation tenancy at Term #1: Initial Stay for returning tenant", () => {
      const tenantId = new mongoose.Types.ObjectId();
      const res1Id = new mongoose.Types.ObjectId();
      const res2Id = new mongoose.Types.ObjectId();

      const contracts = [
        // Tenancy 1 (Reservation 1)
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId,
          reservationId: res1Id,
          contractPurpose: "initial",
          leaseStartDate: "2024-01-01",
          createdAt: "2023-12-15",
          leaseDurationMonths: 6,
          status: "expired",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId,
          reservationId: res1Id,
          contractPurpose: "renewal",
          leaseStartDate: "2024-07-02",
          createdAt: "2024-06-15",
          leaseDurationMonths: 3,
          status: "expired",
        },
        // Tenancy 2 (Reservation 2: Returning tenant 1.5 years later)
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId,
          reservationId: res2Id,
          contractPurpose: "initial",
          leaseStartDate: "2026-01-01",
          createdAt: "2025-12-15",
          leaseDurationMonths: 6,
          status: "expired",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId,
          reservationId: res2Id,
          contractPurpose: "renewal",
          leaseStartDate: "2026-07-02",
          createdAt: "2026-06-15",
          leaseDurationMonths: 3,
          status: "active",
        },
      ];

      const withLineage = attachContractLineage(contracts);
      expect(withLineage).toHaveLength(4);

      const c0 = withLineage.find((c) => String(c._id) === String(contracts[0]._id));
      const c1 = withLineage.find((c) => String(c._id) === String(contracts[1]._id));
      const c2 = withLineage.find((c) => String(c._id) === String(contracts[2]._id));
      const c3 = withLineage.find((c) => String(c._id) === String(contracts[3]._id));

      // Tenancy 1 contracts
      expect(c0.termNumber).toBe(1);
      expect(c0.termLabel).toBe("Term #1: Initial Stay");

      expect(c1.termNumber).toBe(2);
      expect(c1.termLabel).toBe("Term #2: Stay Extension");

      // Tenancy 2 contracts (Must restart at Term #1!)
      expect(c2.termNumber).toBe(1);
      expect(c2.termLabel).toBe("Term #1: Initial Stay");

      expect(c3.termNumber).toBe(2);
      expect(c3.termLabel).toBe("Term #2: Stay Extension");
    });
  });

  describe("contractController - getMyCurrentContract lifecycle isolation", () => {
    test("does not expose stale upcoming contract from past tenancy", async () => {
      const { tenant, room } = await seedTenant();
      const actorId = new mongoose.Types.ObjectId();

      // Past completed reservation
      const pastReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveOut",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2024-01-01"),
      });

      const pastStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-01-01"),
        leaseEndDate: new Date("2024-07-01"),
        monthlyRent: 6000,
        status: "completed",
      });

      const staleUpcomingStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: pastReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-1",
        leaseStartDate: new Date("2024-07-02"),
        leaseEndDate: new Date("2024-10-02"),
        monthlyRent: 6000,
        status: "upcoming",
        previousStayId: pastStay._id,
      });

      await createContractHelper({
        tenant,
        room,
        reservation: pastReservation,
        stay: staleUpcomingStay,
        actorId,
        overrides: {
          contractPurpose: "renewal",
          stayId: staleUpcomingStay._id,
          status: "generated",
          isCurrent: false,
          leaseStartDate: new Date("2024-07-02"),
        },
      });

      // Current active reservation (Returning tenant)
      const currentReservation = await Reservation.create({
        userId: tenant._id,
        roomId: room._id,
        status: "moveIn",
        leaseDuration: 6,
        reservationFeeAmount: 2000,
        agreedToPrivacy: true,
        agreedToCertification: true,
        totalPrice: 6000,
        moveInDate: new Date("2026-01-01"),
      });

      const currentStay = await Stay.create({
        tenantId: tenant._id,
        reservationId: currentReservation._id,
        branch: room.branch,
        roomId: room._id,
        bedId: "bed-2",
        leaseStartDate: new Date("2026-01-01"),
        leaseEndDate: new Date("2026-07-01"),
        monthlyRent: 6000,
        status: "active",
      });

      const currentContract = await createContractHelper({
        tenant,
        room,
        reservation: currentReservation,
        stay: currentStay,
        actorId,
        overrides: {
          contractPurpose: "initial",
          status: "published",
          isCurrent: true,
          leaseStartDate: new Date("2026-01-01"),
          leaseEndDate: new Date("2026-07-01"),
        },
      });

      const r = res();
      await getMyCurrentContract(
        { user: { uid: tenant.firebaseUid }, id: "req-lifecycle-iso" },
        r,
      );

      expect(r.statusCode).toBe(200);
      expect(r.body.contractAvailable).toBe(true);
      expect(r.body.contract.id).toBe(String(currentContract._id));
      expect(r.body.contract.termNumber).toBe(1);
      expect(r.body.contract.termLabel).toBe("Term #1: Initial Stay");
      // Stale upcoming renewal from 2024 MUST be null in the response!
      expect(r.body.upcoming).toBeNull();
    });
  });
});
