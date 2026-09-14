/**
 * transferTenant + reschedule + complete controller branch decisions.
 *
 * SCHEDULING (transferTenant):
 *   effectiveTransferDate missing / past  -> 400 TRANSFER_DATE_INVALID
 *   effectiveTransferDate today or future -> 201, scheduleRoomTransfer called,
 *                                            transferStayWorkflow NEVER called
 *   (there is no office-hours restriction — any date/time is allowed; only a
 *    genuinely past date is rejected, inside scheduleRoomTransfer.)
 *
 * RESCHEDULE (rescheduleRoomTransferAction): PATCH -> rescheduleRoomTransfer.
 * COMPLETE  (completeRoomTransferAction):    POST  -> completeRoomTransfer,
 *   200 on executed, 202 on awaiting_settlement, meter readings forwarded.
 *
 * The controller NEVER calls transferStayWorkflow directly — the admin-driven
 * completeRoomTransfer service owns that (its own suites cover the cutover).
 */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryReplSet } from "mongodb-memory-server";

jest.setTimeout(240_000);

await jest.unstable_mockModule("../../utils/auditLogger.js", () => ({
  default: { log: jest.fn(), logError: jest.fn(), logModification: jest.fn() },
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

const transferStayWorkflowMock = jest.fn(async () => ({ reservation: {}, stay: {}, billingSnapshot: null }));
const scheduleRoomTransferMock = jest.fn(async ({ payload }) => ({
  scheduledTransfer: {
    _id: new mongoose.Types.ObjectId(),
    effectiveTransferDate: new Date(payload.effectiveTransferDate),
    effectiveTransferTimeMinutes: payload.effectiveTransferTimeMinutes ?? 540,
    toObject() { return { _id: this._id, effectiveTransferDate: this.effectiveTransferDate }; },
  },
}));
const rescheduleRoomTransferMock = jest.fn(async ({ payload }) => ({
  scheduledTransfer: {
    _id: new mongoose.Types.ObjectId(),
    effectiveTransferDate: new Date(payload.effectiveTransferDate),
    effectiveTransferTimeMinutes: payload.effectiveTransferTimeMinutes ?? 600,
  },
}));
const completeRoomTransferMock = jest.fn();

const realService = await import("../../utils/tenantActionService.js");
await jest.unstable_mockModule("../../utils/tenantActionService.js", () => ({
  ...realService,
  transferStayWorkflow: transferStayWorkflowMock,
}));
const realSched = await import("../../services/scheduledRoomTransferService.js");
await jest.unstable_mockModule("../../services/scheduledRoomTransferService.js", () => ({
  ...realSched,
  scheduleRoomTransfer: scheduleRoomTransferMock,
  rescheduleRoomTransfer: rescheduleRoomTransferMock,
  completeRoomTransfer: completeRoomTransferMock,
}));
const realSchedView = await import("../../services/scheduledRoomTransferView.js");
await jest.unstable_mockModule("../../services/scheduledRoomTransferView.js", () => ({
  ...realSchedView,
  serializeScheduledRoomTransfer: jest.fn(async (d) => ({ id: String(d?._id || ""), effectiveTransferDate: d?.effectiveTransferDate })),
  getOpenScheduledRoomTransferForReservation: jest.fn().mockResolvedValue(null),
}));

const { transferTenant, rescheduleRoomTransferAction, completeRoomTransferAction } =
  await import("./tenancyActionsController.js");
const { getManilaToday } = await import("../../utils/dateUtils.js");
const { Reservation, Room, User } = await import("../../models/index.js");
const { assertWaterNeighbors } = await import("../../services/billing/waterChronology.js");

const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
function dateStr(offsetDays) {
  return getManilaToday().add(offsetDays, "day").format("YYYY-MM-DD");
}

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "sched_transfer_branch" });
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 120_000);
beforeEach(async () => {
  await Promise.all([Reservation.deleteMany({}), Room.deleteMany({}), User.deleteMany({})]);
  transferStayWorkflowMock.mockClear();
  scheduleRoomTransferMock.mockClear();
  rescheduleRoomTransferMock.mockClear();
  completeRoomTransferMock.mockReset();
});

async function seedMovedIn() {
  const user = await User.create({
    firebaseUid: `fb-${new mongoose.Types.ObjectId()}`, email: `t-${new mongoose.Types.ObjectId()}@ex.test`,
    username: `t_${new mongoose.Types.ObjectId().toString().slice(-10)}`,
    firstName: "C", lastName: "T", role: "tenant", tenantStatus: "active",
  });
  const room = await Room.create({
    name: "Room 301", roomNumber: "301", branch: "gil-puyat",
    type: "quadruple-sharing", capacity: 4, currentOccupancy: 1, price: 5400, beds: [],
  });
  const reservation = await Reservation.create({
    userId: user._id, roomId: room._id, status: "moveIn", leaseDuration: 12,
    agreedToPrivacy: true, agreedToCertification: true,
    totalPrice: 5400, monthlyRent: 5400, moveInDate: new Date("2026-01-01"),
  });
  return { user, room, reservation };
}
function req({ reservationId, body }) {
  return {
    params: { reservationId: String(reservationId) },
    body,
    user: { uid: "admin-uid" },
    branchFilter: null,
    id: "req-1",
  };
}

describe("transferTenant — scheduling branch", () => {
  test("MISSING effective date -> 400 TRANSFER_DATE_INVALID, neither path called", async () => {
    const { reservation } = await seedMovedIn();
    const res = response();
    await transferTenant(req({
      reservationId: reservation._id,
      body: { targetRoomId: String(new mongoose.Types.ObjectId()), confirm: true },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("TRANSFER_DATE_INVALID");
    expect(transferStayWorkflowMock).not.toHaveBeenCalled();
    expect(scheduleRoomTransferMock).not.toHaveBeenCalled();
  });

  test("PAST effective date -> 400 TRANSFER_DATE_INVALID", async () => {
    const { reservation } = await seedMovedIn();
    const res = response();
    await transferTenant(req({
      reservationId: reservation._id,
      body: { targetRoomId: String(new mongoose.Types.ObjectId()), effectiveTransferDate: dateStr(-3), confirm: true },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("TRANSFER_DATE_INVALID");
    expect(scheduleRoomTransferMock).not.toHaveBeenCalled();
  });

  test("TODAY (same-day) effective date -> 201, scheduleRoomTransfer called (office-hours enforced in the service), cutover engine NOT called", async () => {
    const { reservation } = await seedMovedIn();
    const res = response();
    await transferTenant(req({
      reservationId: reservation._id,
      body: {
        targetRoomId: String(new mongoose.Types.ObjectId()), targetBedId: "b1",
        effectiveTransferDate: dateStr(0), effectiveTransferTime: "14:00", confirm: true,
      },
    }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/scheduled/i);
    expect(scheduleRoomTransferMock).toHaveBeenCalledTimes(1);
    // The time is forwarded to the service.
    expect(scheduleRoomTransferMock.mock.calls[0][0].payload.effectiveTransferTimeMinutes).toBe("14:00");
    expect(transferStayWorkflowMock).not.toHaveBeenCalled();
  });

  test("FUTURE effective date -> 201, scheduleRoomTransfer called", async () => {
    const { reservation } = await seedMovedIn();
    const res = response();
    await transferTenant(req({
      reservationId: reservation._id,
      body: { targetRoomId: String(new mongoose.Types.ObjectId()), targetBedId: "b1", effectiveTransferDate: dateStr(7), confirm: true },
    }), res);
    expect(res.statusCode).toBe(201);
    expect(scheduleRoomTransferMock).toHaveBeenCalledTimes(1);
    expect(transferStayWorkflowMock).not.toHaveBeenCalled();
  });

  test("scheduling service throws a coded error -> that status/code is surfaced (e.g. PAST_TRANSFER_DATE)", async () => {
    const { reservation } = await seedMovedIn();
    scheduleRoomTransferMock.mockRejectedValueOnce(
      Object.assign(new Error("past date"), { statusCode: 400, code: "PAST_TRANSFER_DATE" }),
    );
    const res = response();
    await transferTenant(req({
      reservationId: reservation._id,
      body: { targetRoomId: String(new mongoose.Types.ObjectId()), effectiveTransferDate: dateStr(0), effectiveTransferTime: "22:00", confirm: true },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("PAST_TRANSFER_DATE");
    expect(transferStayWorkflowMock).not.toHaveBeenCalled();
  });
});

describe("rescheduleRoomTransferAction (PATCH)", () => {
  test("delegates to rescheduleRoomTransfer with date + time; 200", async () => {
    const { reservation } = await seedMovedIn();
    const res = response();
    await rescheduleRoomTransferAction(req({
      reservationId: reservation._id,
      body: { effectiveTransferDate: dateStr(3), effectiveTransferTime: "10:00", reason: "tenant asked" },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(rescheduleRoomTransferMock).toHaveBeenCalledTimes(1);
    const call = rescheduleRoomTransferMock.mock.calls[0][0];
    expect(call.payload.effectiveTransferTimeMinutes).toBe("10:00");
  });
});

describe("completeRoomTransferAction (POST)", () => {
  test("a service chronology rejection retains its 422 code and message", async () => {
    const { reservation } = await seedMovedIn();
    completeRoomTransferMock.mockImplementationOnce(({ payload }) => {
      assertWaterNeighbors({ previous: { reading: 150 }, reading: payload.sourceWaterReading, date: new Date() });
    });
    const res = response();
    await completeRoomTransferAction(req({
      reservationId: reservation._id,
      body: { sourceWaterReading: 123.45, targetWaterReading: 200 },
    }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      code: "WATER_READING_CONFLICT",
      error: "Water reading must remain between the previous and following valid observations.",
    });
  });

  test("outcome executed -> 200; all four water/electricity readings forwarded unchanged", async () => {
    const { reservation } = await seedMovedIn();
    completeRoomTransferMock.mockResolvedValueOnce({
      outcome: "executed", message: "Room transfer completed.",
      scheduledTransfer: { _id: new mongoose.Types.ObjectId() },
    });
    const res = response();
    await completeRoomTransferAction(req({
      reservationId: reservation._id,
      body: {
        sourceWaterReading: 123.45, targetWaterReading: 200,
        sourceRoomMeterReading: 1310, targetRoomMeterReading: 500,
        __consumeScheduledHold: true,
      },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe("executed");
    const call = completeRoomTransferMock.mock.calls[0][0];
    expect(call.payload.sourceWaterReading).toBe(123.45);
    expect(call.payload.targetWaterReading).toBe(200);
    expect(call.payload.sourceRoomMeterReading).toBe(1310);
    expect(call.payload.targetRoomMeterReading).toBe(500);
    expect(call.payload).not.toHaveProperty("__consumeScheduledHold");
  });

  test("outcome awaiting_settlement -> 202 with the Bill", async () => {
    const { reservation } = await seedMovedIn();
    completeRoomTransferMock.mockResolvedValueOnce({
      outcome: "awaiting_settlement", reason: "TRANSFER_BALANCE_UNPAID",
      message: "Settle the Room Transfer balance…",
      bill: { _id: new mongoose.Types.ObjectId(), totalAmount: 4860, paidAmount: 0, remainingAmount: 4860, status: "pending" },
      scheduledTransfer: { _id: new mongoose.Types.ObjectId() },
    });
    const res = response();
    await completeRoomTransferAction(req({ reservationId: reservation._id, body: {} }), res);
    expect(res.statusCode).toBe(202);
    expect(res.body.outcome).toBe("awaiting_settlement");
    expect(res.body.bill).toMatchObject({ totalAmount: 4860, paidAmount: 0 });
  });

  test("TRANSFER_SETTLEMENT_UNPAID coded error -> 409 with outstandingBalance", async () => {
    const { reservation } = await seedMovedIn();
    completeRoomTransferMock.mockRejectedValueOnce(
      Object.assign(new Error("settlement unpaid"), {
        statusCode: 409, code: "TRANSFER_SETTLEMENT_UNPAID", outstandingBalance: 1234.5,
      }),
    );
    const res = response();
    await completeRoomTransferAction(req({ reservationId: reservation._id, body: {} }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("TRANSFER_SETTLEMENT_UNPAID");
    expect(res.body.outstandingBalance).toBe(1234.5);
  });
});
