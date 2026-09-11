import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";

const mockReservationFindOne = jest.fn();
const mockUserFindOne = jest.fn();

await jest.unstable_mockModule("../../models/index.js", () => ({
  Reservation: {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: mockReservationFindOne,
    countDocuments: jest.fn(),
  },
  User: {
    find: jest.fn(),
    findOne: mockUserFindOne,
  },
  Room: { find: jest.fn(), findById: jest.fn() },
  VisitAvailability: { findOne: jest.fn(), create: jest.fn() },
  VisitAvailabilityHistory: { create: jest.fn().mockResolvedValue({}) },
  VisitConflictLog: { create: jest.fn().mockResolvedValue({}) },
  Bill: {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
  },
  Payment: {},
  TenantCredit: { find: jest.fn(() => ({ sort: jest.fn().mockReturnThis(), session: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })), findOne: jest.fn(() => ({ session: jest.fn().mockResolvedValue(null) })), create: jest.fn() },
  AuditLog: { create: jest.fn() },
  UtilityReading: { findOne: jest.fn() },
  UtilityPeriod: { findOne: jest.fn() },
  UtilityFinalization: {
    find: jest.fn(() => ({ session: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  ScheduledRoomTransfer: { findOne: jest.fn(), updateOne: jest.fn() },
  BedHistory: {},
  Stay: {},
  Contract: {},
  ContractAcknowledgement: {
    countDocuments: jest.fn(() => ({ session: jest.fn().mockResolvedValue(0) })),
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    create: jest.fn(),
  },
  ContractCounter: {},
  BedCheckoutLock: {},
  Inquiry: {},
  MeterReading: {},
  BillingPeriod: {},
  BillingResult: {},
  Announcement: {},
  MaintenanceRequest: {},
  Notification: {},
  LoginLog: {},
  UserSession: {},
  AcknowledgmentAccount: {},
  BusinessSettings: {},
  Appliance: {},
  LeaseRenewal: {},
  ChatConversation: {},
  ChatMessage: {},
  WaterBillingRecord: {},
  BackupConfig: {},
  BackupRecord: {},
  ServiceProvider: {},
  OverdueNotice: {},
  TerminationReview: {},
  BillingDispute: {},
  TenantViolation: {},
  PaymongoWebhookEvent: {},
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
  INQUIRY_BRANCHES: ["gil-puyat", "guadalupe", "general"],
  ROOM_BRANCH_LABELS: {},
  isValidRoomBranch: () => true,
  isValidInquiryBranch: () => true,
  USER_ROLES: [],
  TENANT_STATUSES: [],
  INQUIRY_STATUSES: [],
  RESERVATION_STATUSES: [],
  INQUIRY_TAGS: [],
}));

const { AppError } = await import("../../middleware/errorHandler.js");
const { touchReservationActivity } = await import("./reservationLifecycleController.js");

describe("touchReservationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when reservationId is not a valid ObjectId", async () => {
    const req = {
      params: { reservationId: "not-a-valid-id" },
      user: { uid: "firebase_user_1" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await touchReservationActivity(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/invalid/i) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("throws AppError(404, USER_NOT_FOUND) when authenticated user is not found in database", async () => {
    const validReservationId = new mongoose.Types.ObjectId().toString();
    const req = {
      params: { reservationId: validReservationId },
      user: { uid: "nonexistent_uid" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    mockUserFindOne.mockResolvedValueOnce(null);

    await touchReservationActivity(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("USER_NOT_FOUND");
    expect(err.message).toBe("User not found");
    expect(res.status).not.toHaveBeenCalled();
  });

  test("throws AppError(404, RESERVATION_NOT_FOUND) when reservation does not exist", async () => {
    const validReservationId = new mongoose.Types.ObjectId().toString();
    const mockUserId = new mongoose.Types.ObjectId();
    const req = {
      params: { reservationId: validReservationId },
      user: { uid: "uid_user_no_reservation" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    mockUserFindOne.mockResolvedValueOnce({
      _id: mockUserId,
      firebaseUid: "uid_user_no_reservation",
    });
    mockReservationFindOne.mockResolvedValueOnce(null);

    await touchReservationActivity(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("RESERVATION_NOT_FOUND");
    expect(err.message).toBe("Reservation not found");
    expect(res.status).not.toHaveBeenCalled();
  });

  test("throws AppError(400, HEARTBEAT_NOT_APPLICABLE) when reservation status is not pending", async () => {
    const validReservationId = new mongoose.Types.ObjectId().toString();
    const mockUserId = new mongoose.Types.ObjectId();
    const req = {
      params: { id: validReservationId },
      user: { uid: "uid_user_confirmed_res" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    mockUserFindOne.mockResolvedValueOnce({
      _id: mockUserId,
      firebaseUid: "uid_user_confirmed_res",
    });
    mockReservationFindOne.mockResolvedValueOnce({
      _id: validReservationId,
      userId: mockUserId,
      status: "confirmed",
    });

    await touchReservationActivity(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("HEARTBEAT_NOT_APPLICABLE");
    expect(err.message).toBe("Heartbeat only applies to pending reservations.");
    expect(res.status).not.toHaveBeenCalled();
  });

  test("updates updatedAt, saves reservation, and returns standardized envelope with top-level aliases for pending reservation", async () => {
    const validReservationId = new mongoose.Types.ObjectId().toString();
    const mockUserId = new mongoose.Types.ObjectId();
    const initialUpdatedAt = new Date(Date.now() - 120000); // 2 minutes ago
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockReservation = {
      _id: validReservationId,
      userId: mockUserId,
      status: "pending",
      updatedAt: initialUpdatedAt,
      save: mockSave,
    };

    const req = {
      params: { reservationId: validReservationId },
      user: { uid: "uid_user_pending_res" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    mockUserFindOne.mockResolvedValueOnce({
      _id: mockUserId,
      firebaseUid: "uid_user_pending_res",
    });
    mockReservationFindOne.mockResolvedValueOnce(mockReservation);

    await touchReservationActivity(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockReservation.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    expect(res.status).toHaveBeenCalledWith(200);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      success: true,
      code: "RESERVATION_HEARTBEAT_RECORDED",
      data: {
        code: "RESERVATION_HEARTBEAT_RECORDED",
        renewedAt: mockReservation.updatedAt,
        expiresAt: expect.any(Date),
      },
      renewedAt: mockReservation.updatedAt,
      expiresAt: expect.any(Date),
    });

    // Verify expiration is exactly 30 minutes in the future relative to renewedAt
    const timeDifferenceMs = payload.data.expiresAt.getTime() - payload.data.renewedAt.getTime();
    expect(timeDifferenceMs).toBe(30 * 60 * 1000);
    expect(payload.expiresAt).toEqual(payload.data.expiresAt);
    expect(payload.renewedAt).toEqual(payload.data.renewedAt);
  });
});
