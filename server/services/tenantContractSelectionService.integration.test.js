/**
 * Direct integration coverage for resolveTenantUpcomingContract — flagged as
 * a coverage gap in the Phase 2A report. Proves the full current/upcoming/
 * history lifecycle end to end against a real database (unit tests for the
 * ranking logic itself already live in tenantContractSelectionService.test.js
 * using plain objects; this file proves the actual Mongo queries agree).
 *
 * Uses a real (single-node) replica set via MongoMemoryReplSet — the
 * cutover test in this file drives activateDueRenewalContracts, which runs
 * inside a genuine Mongo transaction (mongoSession.withTransaction), which a
 * standalone MongoMemoryServer cannot support.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  resolveTenantCanonicalContract,
  resolveTenantContractHistory,
  resolveTenantContractHistoryWithLineage,
  resolveTenantUpcomingContract,
} from "./tenantContractSelectionService.js";
import { generateContractNumber } from "./contractService.js";
import { activateDueRenewalContracts } from "./contractRenewalActivationService.js";
import { activateRoomTransferSuccessor } from "./contractRoomTransferActivationService.js";
import { Contract, Reservation, Room, User, Stay } from "../models/index.js";

jest.setTimeout(60_000);

describe("tenant current/upcoming/history contract resolution", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri(), { dbName: "contract_selection" });
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
      firstName: "Test",
      lastName: "Tenant",
      role: "tenant",
    });
    const room = await Room.create({
      name: "Room 301", roomNumber: "301", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 6300,
    });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 6,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6300,
      moveInDate: new Date("2026-02-01T00:00:00.000Z"),
    });
    const stay = await Stay.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: room.branch,
      roomId: room._id, bedId: "bed-1",
      leaseStartDate: new Date("2026-02-01T00:00:00.000Z"),
      leaseEndDate: new Date("2027-02-01T00:00:00.000Z"),
      monthlyRent: 6300, status: "active",
    });
    return { tenant, room, reservation, stay };
  }

  async function createContract({ tenant, room, reservation, stay, actorId, overrides = {} }) {
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
      roomType: "quadruple-sharing",
      leaseType: "long_term",
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

  test("before renewal: A is current, there is no upcoming contract", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });

    const current = await resolveTenantCanonicalContract(tenant._id);
    const upcoming = await resolveTenantUpcomingContract(tenant._id);

    expect(String(current._id)).toBe(String(contractA._id));
    expect(upcoming).toBeNull();
  });

  test("after successor generation (not yet final): A is current, B is upcoming", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });
    const contractB = await createContract({
      tenant, room, reservation, stay, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractA._id,
        status: "generated",
        isCurrent: false,
        tenantVisible: undefined,
        leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const current = await resolveTenantCanonicalContract(tenant._id);
    const upcoming = await resolveTenantUpcomingContract(tenant._id);

    expect(String(current._id)).toBe(String(contractA._id));
    expect(String(upcoming._id)).toBe(String(contractB._id));
  });

  test("after B is wet-signed final (FINAL + SCHEDULED): A still current, B still upcoming", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });
    const contractB = await createContract({
      tenant, room, reservation, stay, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractA._id,
        status: "published",
        isCurrent: false,
        approvedMonthlyRate: 6800,
        leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const current = await resolveTenantCanonicalContract(tenant._id);
    const upcoming = await resolveTenantUpcomingContract(tenant._id);

    expect(String(current._id)).toBe(String(contractA._id));
    expect(String(upcoming._id)).toBe(String(contractB._id));
  });

  test("after effective-date cutover: B is current, A is history, there is no longer an upcoming contract", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });
    const contractB = await createContract({
      tenant, room, reservation, stay, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractA._id,
        status: "published",
        isCurrent: false,
        approvedMonthlyRate: 6800,
        leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    await activateDueRenewalContracts();

    const current = await resolveTenantCanonicalContract(tenant._id);
    const upcoming = await resolveTenantUpcomingContract(tenant._id);
    const history = await resolveTenantContractHistory(tenant._id);

    expect(String(current._id)).toBe(String(contractB._id));
    expect(upcoming).toBeNull();
    expect(history.map((c) => String(c._id))).toContain(String(contractA._id));
  });

  test("another tenant cannot resolve this tenant's upcoming contract", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });
    await createContract({
      tenant, room, reservation, stay, actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractA._id,
        status: "published",
        isCurrent: false,
        leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const otherTenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `other-${new mongoose.Types.ObjectId()}@example.test`,
      username: `other_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Other", lastName: "Tenant", role: "tenant",
    });

    const upcomingForOther = await resolveTenantUpcomingContract(otherTenant._id);
    expect(upcomingForOther).toBeNull();
  });

  // Room transfer uses contractPurpose: "replacement" and a manually-invoked
  // cutover (activateRoomTransferSuccessor) rather than renewal's date-driven
  // sweep — this proves the SAME selection logic (fixed generically in
  // Phase 2B, not renewal-specific) correctly treats a transfer successor as
  // upcoming before cutover and current/history after, with no
  // transfer-specific selection code needed.
  test("room transfer: predecessor is current/successor is upcoming before cutover, then swap after activateRoomTransferSuccessor", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });
    const contractB = await createContract({
      tenant, room, reservation, stay, actorId,
      overrides: {
        contractPurpose: "replacement",
        replacesContractId: contractA._id,
        parentContractId: contractA._id,
        status: "published",
        isCurrent: false,
        approvedMonthlyRate: 14400,
        leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        finalDocument: minimalFinalDocument(actorId),
      },
    });

    const beforeCurrent = await resolveTenantCanonicalContract(tenant._id);
    const beforeUpcoming = await resolveTenantUpcomingContract(tenant._id);
    expect(String(beforeCurrent._id)).toBe(String(contractA._id));
    expect(String(beforeUpcoming._id)).toBe(String(contractB._id));

    await activateRoomTransferSuccessor({ successorContractId: contractB._id, actorId });

    const afterCurrent = await resolveTenantCanonicalContract(tenant._id);
    const afterUpcoming = await resolveTenantUpcomingContract(tenant._id);
    const afterHistory = await resolveTenantContractHistory(tenant._id);
    expect(String(afterCurrent._id)).toBe(String(contractB._id));
    expect(afterUpcoming).toBeNull();
    expect(afterHistory.map((c) => String(c._id))).toContain(String(contractA._id));
  });

  test("upcoming contract is resolved when linked to an upcoming renewal Stay", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();
    const contractA = await createContract({ tenant, room, reservation, stay, actorId });

    // Create an upcoming Stay representing a renewal
    const upcomingStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: room.branch,
      roomId: room._id,
      bedId: "bed-1",
      leaseStartDate: new Date("2027-02-02T00:00:00.000Z"),
      leaseEndDate: new Date("2027-05-02T00:00:00.000Z"),
      monthlyRent: 6300,
      status: "upcoming",
      previousStayId: stay._id,
    });

    const contractB = await createContract({
      tenant,
      room,
      reservation,
      stay: upcomingStay,
      actorId,
      overrides: {
        contractPurpose: "renewal",
        stayId: upcomingStay._id,
        replacesContractId: null, // linked via stayId rather than replacesContractId directly
        status: "generated",
        isCurrent: false,
        leaseStartDate: new Date("2027-02-02T00:00:00.000Z"),
        leaseEndDate: new Date("2027-05-02T00:00:00.000Z"),
      },
    });

    const current = await resolveTenantCanonicalContract(tenant._id);
    const upcoming = await resolveTenantUpcomingContract(tenant._id);

    expect(String(current._id)).toBe(String(contractA._id));
    expect(String(upcoming._id)).toBe(String(contractB._id));
  });

  test("resolveTenantContractHistory returns chronological term lineage with term labels and short-term flags", async () => {
    const { tenant, room, reservation, stay } = await seedTenant();
    const actorId = new mongoose.Types.ObjectId();

    // Contract A: Term 1 (expired initial stay, 6 months)
    const contractA = await createContract({
      tenant,
      room,
      reservation,
      stay,
      actorId,
      overrides: {
        contractPurpose: "initial",
        status: "expired",
        isCurrent: false,
        leaseStartDate: new Date("2025-08-01T00:00:00.000Z"),
        leaseEndDate: new Date("2026-02-01T00:00:00.000Z"),
        leaseDurationMonths: 6,
      },
    });

    // Contract B: Term 2 (expired stay extension, 3 months)
    const contractB = await createContract({
      tenant,
      room,
      reservation,
      stay,
      actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractA._id,
        status: "expired",
        isCurrent: false,
        leaseStartDate: new Date("2026-02-02T00:00:00.000Z"),
        leaseEndDate: new Date("2026-05-02T00:00:00.000Z"),
        leaseDurationMonths: 3,
      },
    });

    // Contract C: Term 3 (active current contract, 3 months)
    const contractC = await createContract({
      tenant,
      room,
      reservation,
      stay,
      actorId,
      overrides: {
        contractPurpose: "renewal",
        replacesContractId: contractB._id,
        status: "active",
        isCurrent: true,
        leaseStartDate: new Date("2026-05-03T00:00:00.000Z"),
        leaseEndDate: new Date("2026-08-03T00:00:00.000Z"),
        leaseDurationMonths: 3,
      },
    });

    const current = await resolveTenantCanonicalContract(tenant._id);
    expect(String(current._id)).toBe(String(contractC._id));

    const history = await resolveTenantContractHistory(tenant._id);
    expect(history).toHaveLength(2);

    const term1 = history.find((c) => String(c._id) === String(contractA._id));
    expect(term1.termNumber).toBe(1);
    expect(term1.termLabel).toBe("Term #1: Initial Stay");
    expect(term1.isShortTerm).toBe(false);
    expect(term1.leaseDurationMonths).toBe(6);

    const term2 = history.find((c) => String(c._id) === String(contractB._id));
    expect(term2.termNumber).toBe(2);
    expect(term2.termLabel).toBe("Term #2: Stay Extension");
    expect(term2.isShortTerm).toBe(true);
    expect(term2.leaseDurationMonths).toBe(3);
  });
});
