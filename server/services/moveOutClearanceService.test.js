/**
 * Integration test for moveOutClearanceService — wires the previously
 * vestigial MoveOutClearance model into the real move-out workflow as a
 * durable receipt (not a second financial calculator).
 *
 * Uses a real (single-node) replica set via MongoMemoryReplSet because
 * moveOutStayWorkflow runs inside a genuine Mongo transaction.
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  openMoveOutClearance,
  markInspectionComplete,
  completeMoveOutClearance,
} from "./moveOutClearanceService.js";
import {
  MoveOutClearance,
  Reservation,
  Room,
  User,
  Stay,
  Bill,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import { createOpenUtilityPeriodWithBoundary } from "./billing/utilityPeriodLifecycleService.js";

jest.setTimeout(120_000);

describe("moveOutClearanceService", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: "move_out_clearance" });
    await UtilityPeriod.syncIndexes();
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
      Bill.deleteMany({}),
      MoveOutClearance.deleteMany({}),
      UtilityPeriod.deleteMany({}),
      UtilityReading.deleteMany({}),
    ]);
  });

  async function seedActiveTenancy() {
    const actorId = new mongoose.Types.ObjectId();
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
      leaseDuration: 12,
      reservationFeeAmount: 2000,
      preferredRoomType: "quadruple-sharing",
      agreedToPrivacy: true,
      agreedToCertification: true,
      totalPrice: 6300,
      moveInDate: new Date("2026-01-01T00:00:00.000Z"),
      monthlyRent: 6300,
    });
    const stay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: room.branch,
      roomId: room._id,
      bedId: "bed-1",
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2027-01-01T00:00:00.000Z"),
      monthlyRent: 6300,
      status: "active",
      createdBy: actorId,
      updatedBy: actorId,
    });
    await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      startReading: 0,
      ratePerUnit: 16,
      actorId,
    });
    return { actorId, tenant, room, reservation, stay };
  }

  test("Start Move-Out is idempotent — calling twice returns the same clearance", async () => {
    const { tenant, reservation, actorId } = await seedActiveTenancy();

    const first = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2026-06-01T00:00:00.000Z"),
      actorId,
    });
    const second = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2026-06-01T00:00:00.000Z"),
      actorId,
    });

    expect(String(second._id)).toBe(String(first._id));
    const count = await MoveOutClearance.countDocuments({ reservationId: reservation._id });
    expect(count).toBe(1);
    expect(first.status).toBe("initiated");
  });

  test("Mark Inspected transitions initiated -> inspection_complete", async () => {
    const { tenant, reservation, actorId } = await seedActiveTenancy();
    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2026-06-01T00:00:00.000Z"),
      actorId,
    });

    const inspected = await markInspectionComplete({
      clearanceId: clearance._id,
      actorId,
      inspectionNotes: "No damage found.",
    });

    expect(inspected.status).toBe("inspection_complete");
    expect(inspected.inspectionCompletedAt).toBeTruthy();
    expect(inspected.inspectionCompletedBy).toBeTruthy();
  });

  test("Complete Move-Out delegates to moveOutStayWorkflow and records the outcome as a receipt", async () => {
    const { tenant, room, reservation, stay, actorId } = await seedActiveTenancy();
    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2027-01-01T00:00:00.000Z"),
      actorId,
    });
    await markInspectionComplete({ clearanceId: clearance._id, actorId });

    const { clearance: completed, reservation: updatedReservation, depositSettlement } =
      await completeMoveOutClearance({
        clearanceId: clearance._id,
        payload: {
          moveOutDate: "2027-01-01T00:00:00.000Z",
          finalUtilityReading: 1000,
        },
        actorId,
      });

    // Financial outcome must exactly match what moveOutStayWorkflow computed
    // — not a second, independently-calculated value.
    expect(depositSettlement.isEarlyVacancy).toBe(false);
    expect(completed.refundableBalance).toBe(depositSettlement.depositRefundAmount);
    expect(completed.depositOutcome).not.toBeNull();
    expect(["approved", "forfeited"]).toContain(completed.status);
    expect(completed.approvedBy).toBeTruthy();
    expect(completed.approvalReason).toBeTruthy();

    expect(updatedReservation.status).toBe("moveOut");

    // Stay and Room actually changed — this is not a parallel no-op record.
    const closedStay = await Stay.findById(stay._id);
    expect(closedStay.status).toBe("completed");
    const releasedRoom = await Room.findById(room._id);
    expect(releasedRoom.currentOccupancy).toBe(0);
  });

  test("Complete Move-Out on an early departure records a forfeited outcome matching isEarlyVacancy", async () => {
    const { tenant, reservation, actorId } = await seedActiveTenancy();
    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2026-06-01T00:00:00.000Z"),
      actorId,
    });

    const { clearance: completed, depositSettlement } = await completeMoveOutClearance({
      clearanceId: clearance._id,
      payload: {
        moveOutDate: "2026-06-01T00:00:00.000Z", // well before leaseEndDate 2027-01-01
        finalUtilityReading: 500,
      },
      actorId,
    });

    expect(depositSettlement.isEarlyVacancy).toBe(true);
    expect(completed.depositOutcome).toBe("forfeited");
    expect(completed.status).toBe("forfeited");
  });

  test("re-completing an already-completed clearance throws CLEARANCE_ALREADY_COMPLETE", async () => {
    const { tenant, reservation, actorId } = await seedActiveTenancy();
    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2027-01-01T00:00:00.000Z"),
      actorId,
    });

    await completeMoveOutClearance({
      clearanceId: clearance._id,
      payload: { moveOutDate: "2027-01-01T00:00:00.000Z", finalUtilityReading: 1000 },
      actorId,
    });

    await expect(
      completeMoveOutClearance({
        clearanceId: clearance._id,
        payload: { moveOutDate: "2027-01-01T00:00:00.000Z", finalUtilityReading: 1000 },
        actorId,
      }),
    ).rejects.toMatchObject({ code: "CLEARANCE_ALREADY_COMPLETE", statusCode: 409 });
  });

  test("marking inspection complete twice from an already-inspected status throws INVALID_CLEARANCE_STATUS", async () => {
    const { tenant, reservation, actorId } = await seedActiveTenancy();
    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2026-06-01T00:00:00.000Z"),
      actorId,
    });
    await markInspectionComplete({ clearanceId: clearance._id, actorId });

    await expect(
      markInspectionComplete({ clearanceId: clearance._id, actorId }),
    ).rejects.toMatchObject({ code: "INVALID_CLEARANCE_STATUS", statusCode: 409 });
  });

  test("moveOutStayWorkflow vacates bed by reservationId/fallback, isolates deposit without bill deduction, and auto-closes open utility period on full vacancy", async () => {
    const actorId = new mongoose.Types.ObjectId();
    const tenant = await User.create({
      firebaseUid: `firebase-${new mongoose.Types.ObjectId()}`,
      email: `tenant-${new mongoose.Types.ObjectId()}@example.test`,
      username: `tenant_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
      firstName: "Leander",
      lastName: "Ponce",
      role: "tenant",
    });
    const room = await Room.create({
      name: "GP - Room 204",
      roomNumber: "204",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 1,
      beds: [
        {
          id: "bed-slot-x",
          code: "BED-204-X",
          bedNumber: 1,
          position: "lower",
          status: "occupied",
          occupiedBy: {
            userId: tenant._id,
            reservationId: null,
            occupiedSince: new Date("2026-01-01"),
          },
        },
        { id: "bed-2", code: "BED-204-2", bedNumber: 2, position: "upper", status: "available" },
        { id: "bed-3", code: "BED-204-3", bedNumber: 3, position: "lower", status: "available" },
        { id: "bed-4", code: "BED-204-4", bedNumber: 4, position: "upper", status: "available" },
      ],
      price: 5400,
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
      totalPrice: 5400,
      monthlyRent: 5400,
      securityDepositHeld: 5400,
      moveInDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    const stay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: room.branch,
      roomId: room._id,
      bedId: "non-matching-bed-id", // mismatched bedId to test fallback matching
      leaseStartDate: new Date("2026-01-01T00:00:00.000Z"),
      leaseEndDate: new Date("2027-01-01T00:00:00.000Z"),
      monthlyRent: 5400,
      status: "active",
      createdBy: actorId,
      updatedBy: actorId,
    });

    // Create an unpaid rent bill for ₱5,400 to prove deposit isolation
    await Bill.create({
      userId: tenant._id,
      reservationId: reservation._id,
      roomId: room._id,
      branch: room.branch,
      billingMonth: "2026-12",
      type: "rent",
      title: "Unpaid Rent",
      amount: 5400,
      totalAmount: 5400,
      balance: 5400,
      status: "pending",
      paymentState: "unpaid",
      dueDate: new Date("2026-12-01T00:00:00.000Z"),
    });

    // Create an open utility period for electricity
    const openPeriod = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: new Date("2026-12-01T00:00:00.000Z"),
      startReading: 1200,
      ratePerUnit: 16,
      actorId,
    });

    const clearance = await openMoveOutClearance({
      reservationId: reservation._id,
      tenantId: tenant._id,
      intendedMoveOutDate: new Date("2027-01-01T00:00:00.000Z"),
      actorId,
    });
    await markInspectionComplete({ clearanceId: clearance._id, actorId });

    const { clearance: completed, reservation: updatedRes, depositSettlement } =
      await completeMoveOutClearance({
        clearanceId: clearance._id,
        payload: {
          moveOutDate: "2027-01-01T00:00:00.000Z",
          finalUtilityReading: 1350,
          forceOverride: true,
        },
        actorId,
      });

    // 1. Bed vacancy verified: all beds in room are now available
    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.currentOccupancy).toBe(0);
    expect(updatedRoom.beds.every((b) => b.status === "available")).toBe(true);

    // 2. Deposit isolation verified: full ₱5,400 deposit is refunded, NOT reduced by the ₱5,400 unpaid rent
    expect(depositSettlement.depositRefundAmount).toBe(5400);
    expect(updatedRes.depositRefundAmount).toBe(5400);
    expect(completed.refundableBalance).toBe(5400);
    expect(completed.totalDeductions).toBe(0);
    expect(completed.depositOutcome).toBe("fully_refundable");

    // 3. Open utility period auto-closed on full vacancy (currentOccupancy = 0)
    const closedPeriod = await UtilityPeriod.findById(openPeriod._id);
    expect(closedPeriod.status).toBe("closed");
    expect(closedPeriod.endReading).toBe(1350);
    expect(closedPeriod.closedAt).toBeTruthy();
  });
});
