import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const reservationFindById = jest.fn();
const utilityReadingFindOne = jest.fn();
const ensureCurrentCycleRentBill = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  Reservation: { findById: reservationFindById },
  User: {},
  Room: {},
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

const { updateReservation } = await import("./reservationsController.js");

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
    utilityReadingFindOne.mockReset();
    ensureCurrentCycleRentBill.mockReset();
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
});
