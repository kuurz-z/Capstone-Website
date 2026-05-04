import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFindById = jest.fn();
const userFindOne = jest.fn();
const visitAvailabilityFindOne = jest.fn();
const visitAvailabilityCreate = jest.fn();
const utilityReadingFindOne = jest.fn();
const ensureCurrentCycleRentBill = jest.fn();
const moveOutStayWorkflow = jest.fn();
const notifyGeneral = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: { findById: reservationFindById },
  User: { findOne: userFindOne },
  Room: { find: jest.fn(), findById: jest.fn() },
  VisitAvailability: { findOne: visitAvailabilityFindOne, create: visitAvailabilityCreate },
  Bill: { countDocuments: jest.fn(), deleteMany: jest.fn() },
  UtilityReading: { findOne: utilityReadingFindOne },
  BedHistory: {},
  Stay: {},
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
}));

await jest.unstable_mockModule("../config/constants.js", () => ({
  BUSINESS: { DEPOSIT_AMOUNT: 2000 },
}));
await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { logError: jest.fn(), logModification: jest.fn() },
}));
await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  updateOccupancyOnReservationChange: jest.fn(),
}));
await jest.unstable_mockModule("../utils/tenantActionService.js", () => ({
  getTenantActionContext: jest.fn(),
  moveOutStayWorkflow,
  renewStayWorkflow: jest.fn(),
  transferStayWorkflow: jest.fn(),
}));
await jest.unstable_mockModule("../utils/rentGenerator.js", () => ({
  ensureCurrentCycleRentBill,
}));
await jest.unstable_mockModule("../utils/reservationHelpers.js", () => ({
  isValidObjectId: jest.fn(() => true),
  invalidIdResponse: jest.fn(),
  handleReservationError: jest.fn(),
  checkBranchAccess: jest.fn(() => null),
  validateMoveInDate: jest.fn(() => true),
  handleStatusTransition: jest.fn(),
  syncReservationUserLifecycle: jest.fn(),
  reconcileTenantUsersForScope: jest.fn(async () => []),
  buildUserUpdatePayload: jest.fn(() => ({})),
  getMoveInBlockers: jest.fn(() => []),
}));
await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => ({
  ACTIVE_OCCUPANCY_STATUS_QUERY: ["reserved", "moveIn"],
  ACTIVE_STAY_STATUS_QUERY: ["reserved", "moveIn"],
  CURRENT_RESIDENT_STATUS_QUERY: ["moveIn"],
  canTransitionReservationStatus: jest.fn((current, next) => {
    if (current === next) return true;
    return current === "pending" ? next === "visit_pending" : true;
  }),
  hasReservationStatus: jest.fn((status, expected) => {
    const values = Array.isArray(expected) ? expected : [expected];
    return values.includes(status);
  }),
  normalizeReservationPayload: jest.fn((payload) => payload),
  normalizeReservationStatus: jest.fn((status) => status),
  readMoveInDate: jest.fn(() => null),
  readMoveOutDate: jest.fn(() => null),
  reservationStatusesForQuery: jest.fn((...statuses) => statuses.flat()),
  serializeReservation: jest.fn((value) => value),
  serializeReservations: jest.fn((values) => values),
  utilityEventTypesForQuery: jest.fn((...types) => types.flat()),
}));
await jest.unstable_mockModule("../config/email.js", () => ({
  sendReservationConfirmedEmail: jest.fn(),
  sendVisitApprovedEmail: jest.fn(),
}));
await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
  AppError: class AppError extends Error {},
}));
await jest.unstable_mockModule("../utils/notificationService.js", () => ({
  notify: { general: notifyGeneral },
}));

const {
  moveOutReservation,
  updateReservation,
  updateVisitAvailabilityRules,
} = await import("./reservationsController.js");

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

describe("reservationsController.updateReservation access hardening", () => {
  beforeEach(() => {
    reservationFindById.mockReset();
    userFindOne.mockReset();
    utilityReadingFindOne.mockReset();
    visitAvailabilityFindOne.mockReset();
    visitAvailabilityCreate.mockReset();
    ensureCurrentCycleRentBill.mockReset();
    moveOutStayWorkflow.mockReset();
    notifyGeneral.mockReset();
    userFindOne.mockResolvedValue(null);
  });

  test("rejects invalid lifecycle jumps before mutating reservation", async () => {
    reservationFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        status: "pending",
        userId: "user-1",
        roomId: { _id: "room-1", branch: "gil-puyat" },
        toObject: () => ({
          status: "pending",
          userId: "user-1",
          roomId: { _id: "room-1", branch: "gil-puyat" },
        }),
      }),
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { status: "moveOut" },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await updateReservation(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("INVALID_RESERVATION_STATUS_TRANSITION");
    expect(next).not.toHaveBeenCalled();
  });

  test("move-out reads meterReading from request body before running workflow", async () => {
    const reservation = {
      _id: "507f1f77bcf86cd799439011",
      status: "moveIn",
      userId: { _id: "tenant-1", firstName: "Tala", lastName: "Tenant", email: "tala@example.com" },
      roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439011",
        status: "moveIn",
        userId: "tenant-1",
        roomId: { _id: "room-1", branch: "gil-puyat", name: "Room 1" },
      }),
    };
    const populatedQuery = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(reservation)),
    };
    reservationFindById.mockReturnValue(populatedQuery);
    moveOutStayWorkflow.mockResolvedValue({
      reservation,
      stay: { _id: "stay-1", status: "completed" },
      billingSummary: { outstandingBalance: 0 },
    });

    const req = {
      params: { reservationId: "507f1f77bcf86cd799439011" },
      body: { meterReading: 128, moveOutDate: "2026-05-02" },
      branchFilter: "gil-puyat",
      user: { uid: "admin-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await moveOutReservation(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(moveOutStayWorkflow).toHaveBeenCalledWith({
      reservationId: "507f1f77bcf86cd799439011",
      payload: req.body,
      actorId: null,
    });
    expect(res.body.message).toBe("Tenant moved out successfully");
    expect(next).not.toHaveBeenCalled();
  });

  test("branch admins cannot update another branch visit availability", async () => {
    userFindOne.mockResolvedValue({
      _id: "admin-1",
      role: "branch_admin",
      branch: "gil-puyat",
      email: "admin@example.com",
    });

    const req = {
      query: { branch: "guadalupe" },
      body: { enabledWeekdays: [1, 2, 3, 4, 5] },
      user: { uid: "admin-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateVisitAvailabilityRules(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BRANCH_ACCESS_DENIED");
    expect(visitAvailabilityFindOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("owners can update any branch visit availability", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    userFindOne.mockResolvedValue({
      _id: "owner-1",
      role: "owner",
      branch: null,
      email: "owner@example.com",
    });
    visitAvailabilityFindOne.mockResolvedValue({
      branch: "guadalupe",
      enabledWeekdays: [1, 2, 3, 4, 5],
      slots: [{ label: "09:00 AM", enabled: true, capacity: 5 }],
      blackoutDates: [],
      save,
    });

    const req = {
      query: { branch: "guadalupe" },
      body: { enabledWeekdays: [1, 3, 5] },
      user: { uid: "owner-uid" },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateVisitAvailabilityRules(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
