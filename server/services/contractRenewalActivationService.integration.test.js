/**
 * Integration test for contractRenewalActivationService.activateDueRenewalContracts.
 *
 * Uses a real (single-node) replica set via MongoMemoryReplSet because the
 * activation transitions run inside a genuine Mongo transaction
 * (mongoSession.withTransaction), which a standalone MongoMemoryServer
 * cannot support.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { activateDueRenewalContracts } from "./contractRenewalActivationService.js";
import { generateContractNumber } from "./contractService.js";
import { resolveReservationRentAmount } from "./billing/rentGenerator.js";
import { Contract, Reservation, Room, User, Stay, BedHistory } from "../models/index.js";

jest.setTimeout(120_000);

describe("contractRenewalActivationService.activateDueRenewalContracts", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "renewal_activation" });
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
      BedHistory.deleteMany({}),
    ]);
  });

  async function seedTenantRoomReservation() {
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Test",
      lastName: "Tenant",
      role: "tenant",
    });
    const room = await Room.create({
      name: "Room 301",
      roomNumber: "301",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6300,
    });
    const reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      status: "moveIn",
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      moveInDate: new Date("2026-02-01T00:00:00.000Z"),
    });
    return { tenant, room, reservation };
  }

  async function createContract({ tenant, room, reservation, actorId, overrides = {} }) {
    const number = await generateContractNumber(room.branch, new Date());
    return Contract.create({
      ...number,
      contractPurpose: "initial",
      tenantId: tenant._id,
      applicationId: reservation._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: room.branch,
      propertyName: "Lilycrest Dormitory",
      propertyAddress: "123 Test St.",
      roomNumber: room.roomNumber,
      roomType: "quadruple-sharing",
      leaseType: "long_term",
      status: "active",
      isCurrent: true,
      statusHistory: [{ status: "active", changedBy: actorId, reason: "seed" }],
      createdBy: actorId,
      updatedBy: actorId,
      ...overrides,
    });
  }

  const minimalFinalDocument = (actorId) => ({
    storageKey: "gil-puyat/2026/renewal/final_v1.pdf",
    fileName: "final_v1.pdf",
    fileHash: "hash1",
    fileSize: 1024,
    mimeType: "application/pdf",
    pageCount: 4,
    sourceType: "admin_scan",
    sourceVersion: 1,
    sourceUploadedAt: new Date(),
    publishedAt: new Date(),
    publishedBy: actorId,
    tenantVisible: true,
  });

  test("activates a due renewal successor, supersedes the predecessor, and switches the Reservation billing rate atomically", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    await Reservation.updateOne({ _id: reservation._id }, { $set: { monthlyRent: 6300 } });

    const oldContract = await createContract({
      tenant, room, reservation, actorId, overrides: { approvedMonthlyRate: 6300 },
    });
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        parentContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        leaseEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        approvedMonthlyRate: 6800,
        finalDocument: minimalFinalDocument(actorId),
        finalStorageKey: "gil-puyat/2026/renewal/final_v1.pdf",
        publishedAt: new Date(),
        tenantVisible: true,
      },
    });

    const [stay] = await Stay.create([{
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      leaseEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), monthlyRent: 6800,
      status: "active", createdBy: actorId, updatedBy: actorId,
    }]);
    const [bedHistory] = await BedHistory.create([{
      bedId: "bed-1", roomId: room._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: stay._id, branch: room.branch, moveInDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      status: "active",
    }]);

    const report = await activateDueRenewalContracts();

    expect(report.scanned).toBe(1);
    expect(report.activated).toBe(1);
    expect(report.errors).toBe(0);

    const [reloadedOld, reloadedSuccessor, reloadedReservation, reloadedStay, reloadedBedHistory] = await Promise.all([
      Contract.findById(oldContract._id),
      Contract.findById(successor._id),
      Reservation.findById(reservation._id),
      Stay.findById(stay._id),
      BedHistory.findById(bedHistory._id),
    ]);

    expect(reloadedSuccessor.status).toBe("active");
    expect(reloadedSuccessor.isCurrent).toBe(true);
    expect(reloadedOld.status).toBe("replaced");
    expect(reloadedOld.isCurrent).toBe(false);
    expect(String(reloadedOld.supersededByContractId)).toBe(String(successor._id));

    // The other half of the cutover: Reservation's billing rate switches
    // exactly at activation, sourced from the successor's approved rate.
    expect(reloadedReservation.monthlyRent).toBe(6800);

    // Same-room renewal — occupancy is never touched by activation.
    expect(reloadedStay.status).toBe("active");
    expect(String(reloadedStay.roomId)).toBe(String(room._id));
    expect(reloadedBedHistory.status).toBe("active");
  });

  test("PHASE 10 — a transferred tenant's renewal: the renewal-approved rate wins and the room-transfer recurringRentRate override is cleared", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    // Simulate the tenant having transferred rooms BEFORE renewing: the
    // transfer cutover set reservation.recurringRentRate to the destination
    // rate (13500) and reservation.monthlyRent = 13500. This override wins
    // over everything in resolveReservationRentAmount.
    await Reservation.updateOne(
      { _id: reservation._id },
      { $set: { monthlyRent: 13500, recurringRentRate: 13500 } },
    );

    // The transferred (current) room's Contract — its own approved rate 13500.
    const oldContract = await createContract({
      tenant, room, reservation, actorId, overrides: { approvedMonthlyRate: 13500 },
    });
    // Renewal successor — a NEW lease term with its own canonically-approved
    // rate that is DIFFERENT from the transfer rate (renewal-approved 14000).
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        parentContractId: oldContract.parentContractId || oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        leaseEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        approvedMonthlyRate: 14000,
        finalDocument: minimalFinalDocument(actorId),
        finalStorageKey: "gil-puyat/2026/renewal/final_v2.pdf",
        publishedAt: new Date(),
        tenantVisible: true,
      },
    });
    await Stay.create([{
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      leaseEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), monthlyRent: 14000,
      status: "active", createdBy: actorId, updatedBy: actorId,
    }]);
    await BedHistory.create([{
      bedId: "bed-1", roomId: room._id, tenantId: tenant._id, reservationId: reservation._id,
      stayId: null, branch: room.branch, moveInDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      status: "active",
    }]);

    const report = await activateDueRenewalContracts();
    expect(report.activated).toBe(1);
    expect(report.errors).toBe(0);

    const reloadedReservation = await Reservation.findById(reservation._id).lean();
    // monthlyRent switched to the renewal-approved rate ...
    expect(reloadedReservation.monthlyRent).toBe(14000);
    // ... and the room-transfer override is GONE (null/absent), so the
    // renewed rate is now the ONE authoritative current rate.
    expect(reloadedReservation.recurringRentRate == null).toBe(true);

    // The canonical rent resolver returns the renewed rate — the old
    // transfer rate (13500) can no longer override it.
    expect(resolveReservationRentAmount(reloadedReservation)).toBe(14000);
    expect(resolveReservationRentAmount(reloadedReservation)).not.toBe(13500);

    // Lineage: Original -> ... -> Renewal, renewal is its own purpose (not an addendum).
    const reloadedSuccessor = await Contract.findById(successor._id).lean();
    expect(reloadedSuccessor.contractPurpose).toBe("renewal");
    expect(reloadedSuccessor.isCurrent).toBe(true);
  });

  test("does not activate two successors that both reference the same predecessor — flags a conflict instead of guessing", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    const successorA = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });
    const successorB = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 12 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const report = await activateDueRenewalContracts();

    expect(report.activated).toBe(0);
    expect(report.conflicts).toBe(2);
    expect(report.records.filter((r) => r.outcome === "CONFLICT_MULTIPLE_SUCCESSORS")).toHaveLength(2);

    const [reloadedOld, reloadedA, reloadedB] = await Promise.all([
      Contract.findById(oldContract._id),
      Contract.findById(successorA._id),
      Contract.findById(successorB._id),
    ]);
    expect(reloadedOld.status).toBe("active");
    expect(reloadedA.status).toBe("published");
    expect(reloadedB.status).toBe("published");
  });

  test("does not activate a cancelled/voided/rejected renewal successor", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "cancelled",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const report = await activateDueRenewalContracts();
    expect(report.scanned).toBe(0);
    expect(report.activated).toBe(0);

    const reloadedOld = await Contract.findById(oldContract._id);
    expect(reloadedOld.status).toBe("active");
  });

  test("flags (but never activates) a due renewal whose successor has no final wet-signed document", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "awaiting_signatures",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        finalDocument: null,
      },
    });

    const report = await activateDueRenewalContracts();
    expect(report.activated).toBe(0);
    expect(report.blocked).toBe(1);
    expect(report.records.find((r) => r.contractId === String(successor._id))?.outcome)
      .toBe("BLOCKED_NOT_FINAL");

    const reloadedOld = await Contract.findById(oldContract._id);
    expect(reloadedOld.status).toBe("active");
    expect(reloadedOld.isCurrent).toBe(true);

    // Re-running does not re-activate or duplicate the flagged state.
    const second = await activateDueRenewalContracts();
    expect(second.blocked).toBe(1);
    expect(second.activated).toBe(0);
  });

  test("does not activate a successor whose leaseStartDate is still in the future", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const report = await activateDueRenewalContracts();
    expect(report.scanned).toBe(0);
    expect(report.activated).toBe(0);

    const reloadedOld = await Contract.findById(oldContract._id);
    expect(reloadedOld.status).toBe("active");
    expect(reloadedOld.isCurrent).toBe(true);
  });

  test("refuses to activate a renewal successor even when the predecessor Contract.status is stale at 'active' but the tenant has actually moved out (defense-in-depth, independent of the Contract-side write)", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    // Simulate the tenant having actually moved out WITHOUT the
    // Contract-side cancellation having run (the exact gap this
    // defense-in-depth check exists for) — predecessor Contract.status is
    // deliberately left stale at "active".
    await Reservation.updateOne({ _id: reservation._id }, { $set: { status: "moveOut" } });

    const report = await activateDueRenewalContracts();

    expect(report.scanned).toBe(1);
    expect(report.activated).toBe(0);
    expect(report.conflicts).toBe(1);

    const [reloadedOld, reloadedSuccessor] = await Promise.all([
      Contract.findById(oldContract._id),
      Contract.findById(successor._id),
    ]);
    // Neither side was touched — the predecessor stays exactly as it was
    // (still "active", still current), and the successor is left published,
    // not silently activated for a tenant who has already left.
    expect(reloadedOld.status).toBe("active");
    expect(reloadedOld.isCurrent).toBe(true);
    expect(reloadedSuccessor.status).toBe("published");
    expect(reloadedSuccessor.isCurrent).toBe(false);
  });

  test("refuses to activate a renewal successor when the predecessor's Stay is completed/terminated even though Reservation.status still reads moveIn", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    await Stay.create([{
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1", leaseStartDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      leaseEndDate: new Date(Date.now() - 24 * 60 * 60 * 1000), monthlyRent: 6300,
      status: "terminated", endedAt: new Date(), endReason: "terminated",
      createdBy: actorId, updatedBy: actorId,
    }]);

    const report = await activateDueRenewalContracts();

    expect(report.activated).toBe(0);
    expect(report.conflicts).toBe(1);
    const reloadedSuccessor = await Contract.findById(successor._id);
    expect(reloadedSuccessor.status).toBe("published");
    void oldContract;
  });

  test("re-running activation is idempotent — no duplicate transitions", async () => {
    const { tenant, room, reservation } = await seedTenantRoomReservation();
    const actorId = new mongoose.Types.ObjectId();

    const oldContract = await createContract({ tenant, room, reservation, actorId });
    const successor = await createContract({
      tenant, room, reservation, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: oldContract._id,
        status: "published",
        statusHistory: [{ status: "published", changedBy: actorId, reason: "seed" }],
        isCurrent: false,
        leaseStartDate: new Date(Date.now() - 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const first = await activateDueRenewalContracts();
    expect(first.activated).toBe(1);

    const second = await activateDueRenewalContracts();
    expect(second.scanned).toBe(0);
    expect(second.activated).toBe(0);

    const reloadedSuccessor = await Contract.findById(successor._id);
    expect(reloadedSuccessor.statusHistory.filter((h) => h.status === "active")).toHaveLength(1);
  });
});
