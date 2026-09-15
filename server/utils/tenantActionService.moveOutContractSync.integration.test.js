/**
 * Regression: moveOutStayWorkflow must formally CLOSE the tenant's current
 * Contract, not just their Stay.
 *
 * P2 (commit 1ce033e0) wired moveOutStayWorkflow to call
 * transitionContract(currentContract, "expired" | "terminated") on move-out,
 * but:
 *   - published->expired and active->expired were NOT legal edges in
 *     CONTRACT_TRANSITIONS (only expiring_soon->expired was), so a normal
 *     move-out of a tenant whose Contract sat at "active"/"published" — the
 *     common case — threw INVALID_CONTRACT_STATUS_TRANSITION (409); and
 *   - "expired" was not in terminalStatuses, so even where the edge was
 *     legal, transitionContract left isCurrent:true.
 * The P2 test mocked resolveAuthoritativeCurrentContract -> null, so this
 * path had zero real coverage.
 *
 * This test drives the REAL workflow against a REAL Contract at "published"
 * and at "active", and asserts the Contract ends terminal + non-current and
 * stops being the tenant's authoritative current Contract. Early exit
 * (reason:"terminated") is covered too.
 *
 * Uses a real single-node replica set because moveOutStayWorkflow runs
 * inside a genuine Mongo transaction.
 */
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
import { createOpenUtilityPeriodWithBoundary } from "../services/billing/utilityPeriodLifecycleService.js";

jest.setTimeout(60_000);

describe("moveOutStayWorkflow closes the tenant's current Contract", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "moveout_contract_sync" });
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
      User.deleteMany({}),
      UtilityReading.deleteMany({}),
      UtilityPeriod.deleteMany({}),
    ]);
  });

  const leaseStart = new Date("2026-01-01T00:00:00.000Z");
  const leaseEnd = new Date("2026-12-31T00:00:00.000Z");

  async function seed({ contractStatus }) {
    const oid = () => new mongoose.Types.ObjectId();
    const admin = await User.create({
      firebaseUid: `firebase-admin-${oid()}`,
      email: `admin-${oid()}@example.test`,
      username: `admin_${oid().toString().slice(-10)}`,
      firstName: "Admin", lastName: "User", role: "branch_admin", branch: "gil-puyat",
    });
    const tenant = await User.create({
      firebaseUid: `firebase-${oid()}`,
      email: `tenant-${oid()}@example.test`,
      username: `tenant_${oid().toString().slice(-10)}`,
      firstName: "Test", lastName: "Tenant", role: "tenant", tenantStatus: "active",
      branch: "gil-puyat",
    });
    const room = await Room.create({
      name: "Room 402", roomNumber: "402", branch: "gil-puyat",
      type: "quadruple-sharing", capacity: 4, price: 6300,
      beds: [{ id: "bed-1", position: "lower", status: "occupied" }],
      currentOccupancy: 1,
    });
    const reservation = await Reservation.create({
      userId: tenant._id, roomId: room._id, status: "moveIn", leaseDuration: 12,
      reservationFeeAmount: 2000, preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true, agreedToCertification: true, totalPrice: 6300,
      monthlyRent: 6300, moveInDate: leaseStart,
      selectedBed: { id: "bed-1" },
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
      tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
      roomId: room._id, bedId: "bed-1",
      leaseStartDate: leaseStart, leaseEndDate: leaseEnd,
      monthlyRent: 6300, status: "active",
    });
    await BedHistory.create({
      tenantId: tenant._id, reservationId: reservation._id, branch: "gil-puyat",
      roomId: room._id, bedId: "bed-1", moveInDate: leaseStart, status: "active",
    });
    const contract = await Contract.create({
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
      status: contractStatus,
      isCurrent: true,
      tenantVisible: true,
      publicationStatus: "published",
      finalStorageKey: "contracts/final/seed.pdf",
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    return { admin, tenant, room, reservation, stay, contract };
  }

  const movePayload = (overrides = {}) => ({
    confirm: true,
    moveOutDate: "2026-12-31",
    finalUtilityReading: 1234,
    finalNotes: "Standard move-out",
    ...overrides,
  });

  test("normal full-term move-out drives a PUBLISHED Contract to expired / non-current", async () => {
    const { admin, tenant, reservation, contract } = await seed({ contractStatus: "published" });

    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: movePayload(),
      actorId: admin._id,
    });

    const after = await Contract.findById(contract._id).lean();
    expect(after.status).toBe("expired");
    expect(after.isCurrent).toBe(false);
    expect(after.statusHistory.at(-1)).toMatchObject({
      status: "expired",
      reason: "normal_completion_move_out",
    });
    const period = await UtilityPeriod.findOne({ roomId: reservation.roomId }).lean();
    expect(period.status).toBe("closed");
    const moveOutReading = await UtilityReading.findOne({
      roomId: reservation.roomId,
      tenantId: tenant._id,
      eventType: "moveOut",
    }).lean();
    expect(String(moveOutReading.utilityPeriodId)).toBe(String(period._id));

    const stillCurrent = await resolveAuthoritativeCurrentContract({
      tenantId: tenant._id,
    });
    expect(stillCurrent).toBeNull();
  });

  test("normal full-term move-out drives an ACTIVE Contract to expired / non-current", async () => {
    const { admin, reservation, contract } = await seed({ contractStatus: "active" });

    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: movePayload(),
      actorId: admin._id,
    });

    const after = await Contract.findById(contract._id).lean();
    expect(after.status).toBe("expired");
    expect(after.isCurrent).toBe(false);
  });

  test("early exit (reason:terminated) drives the Contract to terminated / non-current", async () => {
    const { admin, reservation, contract } = await seed({ contractStatus: "active" });

    await moveOutStayWorkflow({
      reservationId: reservation._id,
      // Early: move out well before leaseEnd.
      payload: movePayload({ moveOutDate: "2026-06-30", reason: "terminated" }),
      actorId: admin._id,
    });

    const after = await Contract.findById(contract._id).lean();
    expect(after.status).toBe("terminated");
    expect(after.isCurrent).toBe(false);
    expect(after.statusHistory.at(-1)).toMatchObject({
      status: "terminated",
      reason: "early_termination_move_out",
    });
  });
});
