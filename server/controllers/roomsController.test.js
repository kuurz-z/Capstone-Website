import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const roomSave = jest.fn();
const roomArchive = jest.fn();
const roomFindOne = jest.fn();
const roomFind = jest.fn();
const reservationCountDocuments = jest.fn();
const billingPeriodCountDocuments = jest.fn();
const utilityPeriodCountDocuments = jest.fn();
const maintenanceCountDocuments = jest.fn();
const reservationFind = jest.fn();
const sendSuccess = jest.fn();
const logModification = jest.fn();
const logError = jest.fn();
const deriveRoomOccupancyState = jest.fn();
const getBusinessSettings = jest.fn();
const getBranchSettings = jest.fn(() => ({}));

const Room = jest.fn(function Room(data) {
  Object.assign(this, data);
  this._id = this._id || "507f1f77bcf86cd799439011";
  this.save = roomSave;
  this.toObject = () => ({ ...data, _id: this._id });
});

Room.findOne = roomFindOne;
Room.find = roomFind;

await jest.unstable_mockModule("../models/index.js", () => ({
  Room,
  Reservation: {
    countDocuments: reservationCountDocuments,
    find: reservationFind,
  },
  BillingPeriod: { countDocuments: billingPeriodCountDocuments },
  UtilityPeriod: { countDocuments: utilityPeriodCountDocuments },
  MaintenanceRequest: { countDocuments: maintenanceCountDocuments },
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
}));

await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { logModification, logError },
}));
await jest.unstable_mockModule("../utils/businessSettings.js", () => ({
  getBusinessSettings,
  getBranchSettings,
}));
await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  deriveRoomOccupancyState,
}));
await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess,
  AppError: class AppError extends Error {
    constructor(message, statusCode, code, details) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  },
}));
await jest.unstable_mockModule("../utils/lifecycleNaming.js", () => ({
  ACTIVE_OCCUPANCY_STATUS_QUERY: ["reserved", "moveIn"],
  reservationStatusesForQuery: (...statuses) => statuses.flat(),
}));

const {
  createRoom,
  updateRoom,
  getOccupancyConsistency,
  deleteRoom,
} = await import("./roomsController.js");

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

describe("roomsController", () => {
  beforeEach(() => {
    Room.mockClear();
    roomSave.mockReset();
    roomArchive.mockReset();
    roomFindOne.mockReset();
    roomFind.mockReset();
    reservationFind.mockReset();
    reservationCountDocuments.mockReset();
    billingPeriodCountDocuments.mockReset();
    utilityPeriodCountDocuments.mockReset();
    maintenanceCountDocuments.mockReset();
    sendSuccess.mockReset();
    logModification.mockReset();
    logError.mockReset();
    deriveRoomOccupancyState.mockReset();
    getBusinessSettings.mockReset();
  });

  test("createRoom rejects system-owned occupancy fields", async () => {
    const req = {
      body: {
        name: "GP-101",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 5000,
        currentOccupancy: 1,
      },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await createRoom(req, res, next);

    expect(Room).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("ROOM_SYSTEM_FIELDS_FORBIDDEN");
  });

  test("createRoom gives private rooms one single bed by default", async () => {
    roomFindOne.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      })),
    });
    roomSave.mockResolvedValue();

    const req = {
      body: {
        name: "GP Private 101",
        roomNumber: "101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
        price: 12000,
      },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await createRoom(req, res, next);

    expect(Room).toHaveBeenCalledWith(
      expect.objectContaining({
        beds: [{ id: "bed-1", position: "single", status: "available" }],
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ message: "Room created successfully" }),
      201,
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("updateRoom rejects generic bed writes", async () => {
    roomFindOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      branch: "gil-puyat",
      roomNumber: "101",
      toObject: () => ({ branch: "gil-puyat", roomNumber: "101" }),
      save: roomSave,
    });

    const req = {
      params: { roomId: "507f1f77bcf86cd799439011" },
      branchFilter: "gil-puyat",
      body: {
        beds: [{ id: "bed-1", status: "maintenance" }],
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateRoom(req, res, next);

    expect(roomSave).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("ROOM_SYSTEM_FIELDS_FORBIDDEN");
  });

  test("getOccupancyConsistency reports drift without mutating rooms", async () => {
    roomFind.mockReturnValue({
      select: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([
            {
              _id: "room_1",
              name: "GP-101",
              roomNumber: "101",
              branch: "gil-puyat",
              capacity: 2,
              currentOccupancy: 0,
              available: true,
              beds: [
                { id: "bed-1", status: "available" },
                { id: "bed-2", status: "available" },
              ],
            },
          ]),
        })),
      })),
    });
    reservationFind.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "res_1",
            roomId: "room_1",
            userId: "user_1",
            selectedBed: { id: "bed-1" },
            status: "reserved",
          },
        ]),
      })),
    });
    deriveRoomOccupancyState.mockReturnValue({
      currentOccupancy: 1,
      available: false,
    });

    const req = { query: {}, branchFilter: "gil-puyat" };
    const res = createResponse();
    const next = jest.fn();

    await getOccupancyConsistency(req, res, next);

    expect(sendSuccess).toHaveBeenCalledTimes(1);
    const [, payload] = sendSuccess.mock.calls[0];
    expect(payload.summary.inconsistentRooms).toBe(1);
    expect(payload.rooms[0].issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "CURRENT_OCCUPANCY_MISMATCH",
        "ROOM_AVAILABILITY_MISMATCH",
        "RESERVED_BED_MISMATCH",
      ]),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("deleteRoom blocks archiving when unresolved maintenance exists", async () => {
    roomFindOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      name: "GP-101",
      branch: "gil-puyat",
      toObject: () => ({ name: "GP-101", branch: "gil-puyat" }),
      archive: roomArchive,
    });
    reservationCountDocuments.mockResolvedValue(0);
    billingPeriodCountDocuments.mockResolvedValue(0);
    utilityPeriodCountDocuments.mockResolvedValue(0);
    maintenanceCountDocuments.mockResolvedValue(2);

    const req = {
      params: { roomId: "507f1f77bcf86cd799439011" },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await deleteRoom(req, res, next);

    expect(roomArchive).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("ROOM_ARCHIVE_BLOCKED");
    expect(next.mock.calls[0][0].details.openMaintenanceCount).toBe(2);
  });
});
