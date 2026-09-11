import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";

await jest.unstable_mockModule("../../config/email.js", () => ({
  sendInquiryResponseEmail: jest.fn(),
  sendReservationConfirmedEmail: jest.fn(),
  sendVisitApprovedEmail: jest.fn(),
  sendPhysicalVisitStatusEmail: jest.fn(),
  sendDocumentsRejectedEmail: jest.fn(),
  sendBillGeneratedEmail: jest.fn(),
  sendUtilityChargeAvailableEmail: jest.fn(),
  sendPaymentReminderEmail: jest.fn(),
  sendOverdueNoticeEmail: jest.fn(),
  sendPaymentApprovedEmail: jest.fn(),
  sendPaymentRejectedEmail: jest.fn(),
  sendPaymentReceiptEmail: jest.fn(),
  generateEmailVerificationEmail: jest.fn(),
  sendEmailVerificationLinkEmail: jest.fn(),
  generateLoginOtpEmail: jest.fn(),
  sendLoginOtpEmail: jest.fn(),
  normalizeOtpEmailResponse: jest.fn(),
  buildLoginOtpMessage: jest.fn(),
  classifyOtpEmailError: jest.fn(),
  default: {},
}));

await jest.unstable_mockModule("../../utils/socket.js", () => ({
  emitToUser: jest.fn(),
  emitToAdmins: jest.fn(),
  emitRoomUpdate: jest.fn(),
}));

await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

await jest.unstable_mockModule("../../utils/auditLogger.js", () => ({
  default: { log: jest.fn(), logError: jest.fn(), logModification: jest.fn() },
}));

await jest.unstable_mockModule("../../services/occupancy/occupancyManager.js", () => ({
  deriveRoomOccupancyState: jest.fn(),
  updateOccupancyOnReservationChange: jest.fn(),
  recalculateRoomOccupancy: jest.fn(),
  getRoomOccupancyStatus: jest.fn(),
  getBranchOccupancyStats: jest.fn(),
  releaseOrphanedBeds: jest.fn(),
  getDisplayStatusForReservation: jest.fn((status) => status),
  default: {},
}));

const { updateReservation, extendReservation } = await import("./reservationLifecycleController.js");
const { approveCancellationRequest } = await import("./cancellationController.js");
const { default: Reservation } = await import("../../models/Reservation.js");
const { default: Room } = await import("../../models/Room.js");
const { default: User } = await import("../../models/User.js");
const { default: BusinessSettings } = await import("../../models/BusinessSettings.js");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const requestFor = (reservationId, body, overrides = {}) => ({
  id: "cancellation-guard-test",
  params: { reservationId },
  body,
  user: { uid: "admin-firebase-uid" },
  authUser: { _id: new mongoose.Types.ObjectId() },
  branchFilter: undefined,
  ...overrides,
});

describe("Reservation Lifecycle Controller — Cancellation Guards", () => {
  let mongo;
  let adminUser;
  let tenantUser;
  let roomDoc;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "cancellation_guard_tests" });
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  }, 30_000);

  beforeEach(async () => {
    await Reservation.deleteMany({});
    await Room.deleteMany({});
    await User.deleteMany({});
    await BusinessSettings.deleteMany({});

    await BusinessSettings.create({
      key: "global",
      quadrupleDiscountPercent: 10,
      isDiscountEnabled: true,
      longTermLeaseMinMonths: 6,
    });

    adminUser = await User.create({
      firebaseUid: "admin-firebase-uid",
      username: "admin_user",
      email: "admin@lilycrest.test",
      role: "owner",
      firstName: "Admin",
      lastName: "Owner",
    });

    tenantUser = await User.create({
      firebaseUid: "tenant-firebase-uid",
      username: "tenant_user",
      email: "tenant@lilycrest.test",
      role: "applicant",
      firstName: "Tenant",
      lastName: "Test",
    });

    roomDoc = await Room.create({
      name: "Room 101",
      roomNumber: "101",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      price: 6000,
      beds: [
        { id: "bed-1", bedNumber: 1, position: "lower", status: "available" },
        { id: "bed-2", bedNumber: 2, position: "upper", status: "available" },
      ],
    });
  });

  test("updateReservation rejects move-in with 409 and PENDING_CANCELLATION_REQUEST_BLOCKS_MOVEIN when cancellation request is pending review", async () => {
    const reservation = await Reservation.create({
      userId: tenantUser._id,
      roomId: roomDoc._id,
      status: "reserved",
      paymentStatus: "paid",
      totalPrice: 6000,
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      moveInDate: new Date("2026-09-01T00:00:00.000Z"),
      cancellationRequested: true,
      cancellationStatus: "pending",
      cancellationReason: "Change of plans",
      cancellationRequestedAt: new Date(),
      cancellationRequestedBy: tenantUser._id,
      selectedBed: { id: "bed-1", bedNumber: 1, position: "lower" },
    });

    const req = requestFor(String(reservation._id), {
      status: "moveIn",
      meterReading: 120,
      actualMoveInDate: "2026-09-01",
    }, {
      authUser: adminUser,
    });
    const res = response();

    await updateReservation(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("PENDING_CANCELLATION_REQUEST_BLOCKS_MOVEIN");
    expect(res.body.error).toContain("Cannot move in tenant while a cancellation request is pending review");

    const unchanged = await Reservation.findById(reservation._id).lean();
    expect(unchanged.status).toBe("reserved");
  });

  test("extendReservation rejects reschedule with 409 and PENDING_CANCELLATION_REQUEST_BLOCKS_MOVEIN when cancellation request is pending review", async () => {
    const reservation = await Reservation.create({
      userId: tenantUser._id,
      roomId: roomDoc._id,
      status: "reserved",
      paymentStatus: "paid",
      totalPrice: 6000,
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      moveInDate: new Date("2026-09-01T00:00:00.000Z"),
      finalMoveInDate: new Date("2026-09-01T00:00:00.000Z"),
      cancellationRequested: true,
      cancellationStatus: "pending",
      cancellationReason: "Change of plans",
      cancellationRequestedAt: new Date(),
      cancellationRequestedBy: tenantUser._id,
      selectedBed: { id: "bed-1", bedNumber: 1, position: "lower" },
    });

    const req = requestFor(String(reservation._id), {
      newMoveInDate: "2026-09-10",
    }, {
      authUser: adminUser,
    });
    const res = response();

    await extendReservation(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("PENDING_CANCELLATION_REQUEST_BLOCKS_MOVEIN");
    expect(res.body.error).toContain("Cannot reschedule move-in while a cancellation request is pending review");

    const unchanged = await Reservation.findById(reservation._id).lean();
    expect(new Date(unchanged.moveInDate).toISOString()).toBe(new Date("2026-09-01T00:00:00.000Z").toISOString());
  });

  test("approveCancellationRequest rejects with 409 and TENANT_ALREADY_MOVED_IN when reservation is already moveIn", async () => {
    const reservation = await Reservation.create({
      userId: tenantUser._id,
      roomId: roomDoc._id,
      status: "moveIn",
      paymentStatus: "paid",
      totalPrice: 6000,
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      moveInDate: new Date("2026-08-01T00:00:00.000Z"),
      cancellationRequested: true,
      cancellationStatus: "pending",
      cancellationReason: "Wants to cancel after move in",
      cancellationRequestedAt: new Date(),
      cancellationRequestedBy: tenantUser._id,
      selectedBed: { id: "bed-1", bedNumber: 1, position: "lower" },
    });

    const req = requestFor(String(reservation._id), {
      note: "Admin note",
    }, {
      user: { uid: "admin-firebase-uid" },
      authUser: adminUser,
    });
    const res = response();

    await approveCancellationRequest(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("TENANT_ALREADY_MOVED_IN");
    expect(res.body.error).toContain("Cannot cancel a reservation for a tenant who has already moved in");

    const unchanged = await Reservation.findById(reservation._id).lean();
    expect(unchanged.status).toBe("moveIn");
    expect(unchanged.cancellationStatus).toBe("pending");
  });

  test("approveCancellationRequest approves paid reservation even when cancellationReason is null/empty, setting fallback reason", async () => {
    const reservation = await Reservation.create({
      userId: tenantUser._id,
      roomId: roomDoc._id,
      status: "reserved",
      paymentStatus: "paid",
      reservationFeePaymentStatus: "verified",
      totalPrice: 6000,
      leaseDuration: 6,
      reservationFeeAmount: 2000,
      moveInDate: new Date("2026-09-20T00:00:00.000Z"),
      cancellationRequested: true,
      cancellationStatus: "pending",
      cancellationReason: null,
      cancellationRequestedAt: new Date(),
      cancellationRequestedBy: tenantUser._id,
      selectedBed: { id: "bed-1", bedNumber: 1, position: "lower" },
    });

    const req = requestFor(String(reservation._id), {}, {
      user: { uid: "admin-firebase-uid" },
      authUser: adminUser,
    });
    const res = response();
    const next = jest.fn();

    await approveCancellationRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    const updated = await Reservation.findById(reservation._id).lean();
    expect(updated.status).toBe("cancelled");
    expect(updated.cancellationStatus).toBe("approved");
    expect(typeof updated.cancellationReason).toBe("string");
    expect(updated.cancellationReason.length).toBeGreaterThan(0);
  });
});

