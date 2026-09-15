import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";

const roomSave = jest.fn();
const roomFindOne = jest.fn();
const roomFind = jest.fn();
const reservationCountDocuments = jest.fn();
const stayCountDocuments = jest.fn();
const stayFind = jest.fn(() => ({
  select: () => ({
    populate: () => ({
      lean: () => Promise.resolve([]),
    }),
  }),
}));
const billingPeriodCountDocuments = jest.fn();
const utilityPeriodCountDocuments = jest.fn();
const maintenanceCountDocuments = jest.fn();
const reservationFind = jest.fn(() => ({
  select: () => ({
    populate: () => ({
      lean: () => Promise.resolve([]),
    }),
  }),
}));
const userFind = jest.fn(() => ({
  select: () => ({
    lean: () => Promise.resolve([]),
  }),
}));
const sendSuccess = jest.fn();
const logModification = jest.fn();
const logError = jest.fn();
const deriveRoomOccupancyState = jest.fn((room) => {
  const beds = room?.beds || [];
  const occupiedBeds = beds.filter((b) => b.status === "occupied" || b.status === "reserved").length;
  const availableBeds = beds.filter((b) => b.status === "available" || b.available === true).length;
  return { occupiedBeds, availableBeds, totalBeds: beds.length };
});
const recalculateRoomOccupancy = jest.fn();
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
Room.updateOne = jest.fn().mockResolvedValue({});

await jest.unstable_mockModule("../models/index.js", () => ({
  Room,
  Reservation: {
    countDocuments: reservationCountDocuments,
    find: reservationFind,
  },
  Stay: {
    countDocuments: stayCountDocuments,
    find: stayFind,
  },
  BedHistory: {
    recordMaintenanceStart: jest.fn(),
    recordMaintenanceEnd: jest.fn(),
  },
  BillingPeriod: { countDocuments: billingPeriodCountDocuments },
  UtilityPeriod: { countDocuments: utilityPeriodCountDocuments },
  MaintenanceRequest: { countDocuments: maintenanceCountDocuments },
  Bill: { find: jest.fn(), countDocuments: jest.fn() },
  Payment: { find: jest.fn(), countDocuments: jest.fn() },
  Contract: { find: jest.fn(), countDocuments: jest.fn() },
  ContractCounter: { findOneAndUpdate: jest.fn() },
  User: { find: userFind },
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
  recalculateRoomOccupancy,
  getDisplayStatusForReservation: (status) => (status === "moveIn" ? "occupied" : status === "reserved" ? "reserved" : "locked"),
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

const { isPopulatedUser, syncRealtimeBedStatuses } = await import("./roomsController.js");

describe("roomsController - isPopulatedUser & Bed User Sync Verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isPopulatedUser helper", () => {
    test("returns false for unpopulated types and non-user objects", () => {
      const rawObjectId = new mongoose.Types.ObjectId();
      expect(isPopulatedUser(rawObjectId)).toBe(false);
      expect(isPopulatedUser(null)).toBe(false);
      expect(isPopulatedUser(undefined)).toBe(false);
      expect(isPopulatedUser({})).toBe(false);
      expect(isPopulatedUser({ _id: rawObjectId })).toBe(false);
      expect(isPopulatedUser("507f1f77bcf86cd799439011")).toBe(false);
      expect(isPopulatedUser(12345)).toBe(false);
      expect(isPopulatedUser(true)).toBe(false);
    });

    test("returns true for objects with populated user fields", () => {
      expect(isPopulatedUser({ email: "tenant@example.com" })).toBe(true);
      expect(isPopulatedUser({ firstName: "Juan" })).toBe(true);
      expect(isPopulatedUser({ name: "Maria" })).toBe(true);
      expect(isPopulatedUser({ role: "tenant" })).toBe(true);
      expect(
        isPopulatedUser({
          _id: new mongoose.Types.ObjectId(),
          firstName: "Juan",
          lastName: "Dela Cruz",
          email: "juan@example.com",
          role: "tenant",
        })
      ).toBe(true);
    });
  });

  describe("syncRealtimeBedStatuses with unpopulated / populated tenant users", () => {
    test("falls back to userMap.get(stayTenantId) when stayDoc.tenantId is an unpopulated ObjectId", async () => {
      const tenantObjectId = new mongoose.Types.ObjectId();
      const tenantIdStr = String(tenantObjectId);

      const mockRoom = {
        _id: "507f1f77bcf86cd799439701",
        name: "GP-701",
        type: "single",
        branch: "gil-puyat",
        capacity: 1,
        beds: [
          { id: "bed-1", position: "lower", status: "available" },
        ],
      };

      const mockStays = [
        {
          _id: "stay-unpopulated-001",
          roomId: "507f1f77bcf86cd799439701",
          bedId: "lower",
          status: "active",
          tenantId: tenantObjectId, // raw unpopulated ObjectId
          leaseEndDate: new Date("2027-10-01"),
        },
      ];

      stayFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve(mockStays),
          }),
        }),
      });

      reservationFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      });

      userFind.mockReturnValueOnce({
        select: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: tenantObjectId,
                firstName: "Carlos",
                lastName: "Santana",
                email: "carlos@example.com",
                role: "tenant",
              },
            ]),
        }),
      });

      const [syncedRoom] = await syncRealtimeBedStatuses([mockRoom]);

      expect(syncedRoom.beds[0].status).toBe("occupied");
      expect(syncedRoom.beds[0].occupiedBy).toBeDefined();
      expect(syncedRoom.beds[0].occupiedBy.userId).toBe(tenantIdStr);
      expect(syncedRoom.beds[0].occupiedBy.firstName).toBe("Carlos");
      expect(syncedRoom.beds[0].occupiedBy.lastName).toBe("Santana");
      expect(syncedRoom.beds[0].occupiedBy.name).toBe("Carlos Santana");
      expect(syncedRoom.currentOccupancy).toBe(1);
    });

    test("ignores ghost stay where tenantId is an unpopulated ObjectId that does not exist in userMap (deleted tenant)", async () => {
      const ghostTenantObjectId = new mongoose.Types.ObjectId();

      const mockRoom = {
        _id: "507f1f77bcf86cd799439702",
        name: "GP-702",
        type: "single",
        branch: "gil-puyat",
        capacity: 1,
        beds: [
          { id: "bed-1", position: "lower", status: "available" },
        ],
      };

      const mockStays = [
        {
          _id: "stay-ghost-002",
          roomId: "507f1f77bcf86cd799439702",
          bedId: "lower",
          status: "active",
          tenantId: ghostTenantObjectId, // raw ObjectId of a deleted tenant
          leaseEndDate: new Date("2027-10-01"),
        },
      ];

      stayFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve(mockStays),
          }),
        }),
      });

      reservationFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      });

      // User.find returns empty array (user deleted / does not exist)
      userFind.mockReturnValueOnce({
        select: () => ({
          lean: () => Promise.resolve([]),
        }),
      });

      const [syncedRoom] = await syncRealtimeBedStatuses([mockRoom]);

      // Ghost stay is ignored; bed remains available
      expect(syncedRoom.beds[0].status).toBe("available");
      expect(syncedRoom.beds[0].available).toBe(true);
      expect(syncedRoom.currentOccupancy).toBe(0);
    });

    test("handles populated user object in stayDoc.tenantId directly", async () => {
      const tenantObjectId = new mongoose.Types.ObjectId();
      const mockRoom = {
        _id: "507f1f77bcf86cd799439703",
        name: "GP-703",
        type: "single",
        branch: "gil-puyat",
        capacity: 1,
        beds: [
          { id: "bed-1", position: "lower", status: "available" },
        ],
      };

      const mockStays = [
        {
          _id: "stay-populated-003",
          roomId: "507f1f77bcf86cd799439703",
          bedId: "lower",
          status: "active",
          tenantId: {
            _id: tenantObjectId,
            firstName: "Maria",
            lastName: "Clara",
            name: "Maria Clara",
            email: "maria@example.com",
            role: "tenant",
          },
          leaseEndDate: new Date("2027-11-01"),
        },
      ];

      stayFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve(mockStays),
          }),
        }),
      });

      reservationFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      });

      const [syncedRoom] = await syncRealtimeBedStatuses([mockRoom]);

      expect(syncedRoom.beds[0].status).toBe("occupied");
      expect(syncedRoom.beds[0].occupiedBy.userId).toBe(String(tenantObjectId));
      expect(syncedRoom.beds[0].occupiedBy.name).toBe("Maria Clara");
      expect(syncedRoom.beds[0].occupiedBy.email).toBe("maria@example.com");
      expect(syncedRoom.currentOccupancy).toBe(1);
    });

    test("resolves user from linked reservation when stayDoc has unpopulated tenantId but matching reservation exists", async () => {
      const reservationId = "res-linking-004";
      const tenantObjectId = new mongoose.Types.ObjectId();

      const mockRoom = {
        _id: "507f1f77bcf86cd799439704",
        name: "GP-704",
        type: "single",
        branch: "gil-puyat",
        capacity: 1,
        beds: [
          { id: "bed-1", position: "lower", status: "available" },
        ],
      };

      const mockReservations = [
        {
          _id: reservationId,
          roomId: "507f1f77bcf86cd799439704",
          status: "moveIn",
          userId: {
            _id: tenantObjectId,
            firstName: "Elena",
            lastName: "Reyes",
            name: "Elena Reyes",
            email: "elena@example.com",
            role: "tenant",
          },
        },
      ];

      const mockStays = [
        {
          _id: "stay-reslink-004",
          roomId: "507f1f77bcf86cd799439704",
          bedId: "lower",
          status: "active",
          reservationId,
          tenantId: tenantObjectId, // raw ObjectId
          leaseEndDate: new Date("2027-12-01"),
        },
      ];

      stayFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve(mockStays),
          }),
        }),
      });

      reservationFind.mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve(mockReservations),
          }),
        }),
      });

      const [syncedRoom] = await syncRealtimeBedStatuses([mockRoom]);

      expect(syncedRoom.beds[0].status).toBe("occupied");
      expect(syncedRoom.beds[0].occupiedBy.userId).toBe(String(tenantObjectId));
      expect(syncedRoom.beds[0].occupiedBy.name).toBe("Elena Reyes");
      expect(syncedRoom.beds[0].occupiedBy.email).toBe("elena@example.com");
      expect(syncedRoom.currentOccupancy).toBe(1);
    });
  });
});
