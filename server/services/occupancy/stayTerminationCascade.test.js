import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import StayModel, { STAY_STATUSES } from "../../models/Stay.js";

describe("Stay Termination Cascade on Deletion", () => {
  describe("STAY_STATUSES Canonical Enum Invariants", () => {
    test("canonical STAY_STATUSES contains 'terminated' and 'cancelled'", () => {
      expect(STAY_STATUSES).toContain("terminated");
      expect(STAY_STATUSES).toContain("cancelled");
    });
  });

  describe("occupancyManager.releaseOrphanedBeds cascade", () => {
    let mockStayUpdateMany;
    let mockRoomFind;
    let mockRoomSave;
    let mockEmitRoomUpdate;
    let releaseOrphanedBeds;

    beforeEach(async () => {
      jest.resetModules();

      mockStayUpdateMany = jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
      mockRoomSave = jest.fn().mockResolvedValue(true);
      mockEmitRoomUpdate = jest.fn();

      const mockRoom = {
        _id: new mongoose.Types.ObjectId(),
        currentOccupancy: 1,
        available: 1,
        capacity: 2,
        beds: [
          {
            bedId: "bed-1",
            status: "occupied",
            lockedBy: null,
            occupiedBy: {
              userId: null,
              reservationId: null,
              occupiedSince: new Date(),
            },
          },
        ],
        updateAvailability: jest.fn(),
        save: mockRoomSave,
      };

      mockRoomFind = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockRoom]),
      });

      await jest.unstable_mockModule("../../models/index.js", () => ({
        Stay: {
          updateMany: mockStayUpdateMany,
        },
        Room: {
          find: mockRoomFind,
        },
        Reservation: {},
      }));

      await jest.unstable_mockModule("../../utils/socket.js", () => ({
        emitRoomUpdate: mockEmitRoomUpdate,
      }));

      const occupancyManagerModule = await import("./occupancyManager.js");
      releaseOrphanedBeds = occupancyManagerModule.releaseOrphanedBeds;
    });

    test("sets status to 'terminated' (not 'cancelled') when releasing beds for deleted users", async () => {
      const userId = new mongoose.Types.ObjectId();

      await releaseOrphanedBeds([userId.toString()], []);

      expect(mockStayUpdateMany).toHaveBeenCalledTimes(1);
      const [filter, update] = mockStayUpdateMany.mock.calls[0];

      // Filter verification
      expect(filter.status).toEqual({
        $in: ["active", "ending_soon", "expired_occupancy_continuing"],
      });
      expect(filter.$or).toBeDefined();
      expect(filter.$or).toContainEqual({ tenantId: { $in: expect.arrayContaining([userId]) } });

      // Update payload verification
      expect(update.$set.status).toBe("terminated");
      expect(update.$set.status).not.toBe("cancelled");
      expect(update.$set.endReason).toBe("Tenant account or reservation deleted");
      expect(update.$set.endedAt).toBeInstanceOf(Date);
    });

    test("sets status to 'terminated' when releasing beds for deleted reservations", async () => {
      const reservationId = new mongoose.Types.ObjectId();

      await releaseOrphanedBeds([], [reservationId.toString()]);

      expect(mockStayUpdateMany).toHaveBeenCalledTimes(1);
      const [filter, update] = mockStayUpdateMany.mock.calls[0];

      expect(filter.$or).toContainEqual({
        reservationId: { $in: expect.arrayContaining([reservationId]) },
      });
      expect(update.$set.status).toBe("terminated");
      expect(update.$set.status).not.toBe("cancelled");
      expect(update.$set.endReason).toBe("Tenant account or reservation deleted");
      expect(update.$set.endedAt).toBeInstanceOf(Date);
    });

    test("handles combined user and reservation deletion cascade cleanly with 'terminated'", async () => {
      const userId = new mongoose.Types.ObjectId();
      const resId = new mongoose.Types.ObjectId();

      await releaseOrphanedBeds([userId], [resId]);

      expect(mockStayUpdateMany).toHaveBeenCalledTimes(1);
      const [filter, update] = mockStayUpdateMany.mock.calls[0];

      expect(filter.$or).toHaveLength(2);
      expect(update.$set.status).toBe("terminated");
      expect(update.$set.status).not.toBe("cancelled");
    });

    test("does not call Stay.updateMany when userIds and reservationIds are empty", async () => {
      const result = await releaseOrphanedBeds([], []);

      expect(result).toEqual({ roomsUpdated: 0, bedsReleased: 0 });
      expect(mockStayUpdateMany).not.toHaveBeenCalled();
    });

    test("handles Stay.updateMany rejection gracefully without throwing", async () => {
      mockStayUpdateMany.mockRejectedValueOnce(new Error("MongoDB connection timeout"));

      const userId = new mongoose.Types.ObjectId();
      await expect(releaseOrphanedBeds([userId], [])).resolves.not.toThrow();
    });
  });

  describe("usersController.deleteUser cascade stay termination", () => {
    let mockStayUpdateMany;
    let mockUserModel;
    let mockReservationModel;
    let deleteUser;

    beforeEach(async () => {
      jest.resetModules();

      mockStayUpdateMany = jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

      const targetUserId = "507f1f77bcf86cd799439011";
      const targetUser = {
        _id: targetUserId,
        user_id: "user-1",
        firebaseUid: "firebase-uid-1",
        role: "tenant",
        isArchived: false,
        toObject: () => ({ _id: targetUserId }),
      };

      mockUserModel = {
        findById: jest.fn().mockResolvedValue(targetUser),
        findByIdAndDelete: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(targetUser),
        }),
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "owner-1" }) }),
        }),
      };

      const reservationLeanResult = [{ _id: "reservation-101" }];
      reservationLeanResult.session = jest.fn().mockResolvedValue(reservationLeanResult);

      mockReservationModel = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue(reservationLeanResult),
          }),
        }),
        countDocuments: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      const mockSession = {
        withTransaction: jest.fn(async (fn) => fn()),
        endSession: jest.fn(),
      };

      await jest.unstable_mockModule("mongoose", () => ({
        default: {
          startSession: jest.fn().mockResolvedValue(mockSession),
          Types: mongoose.Types,
        },
        startSession: jest.fn().mockResolvedValue(mockSession),
        Types: mongoose.Types,
      }));

      await jest.unstable_mockModule("../../models/index.js", () => ({
        User: mockUserModel,
        Reservation: mockReservationModel,
        Room: { countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn() },
        Bill: { countDocuments: jest.fn().mockResolvedValue(0) },
        UtilityReading: { countDocuments: jest.fn().mockResolvedValue(0) },
        MaintenanceRequest: { countDocuments: jest.fn().mockResolvedValue(0) },
        Contract: {
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        },
        Stay: {
          updateMany: mockStayUpdateMany,
          findOne: jest.fn(),
        },
      }));

      await jest.unstable_mockModule("../../services/occupancy/occupancyManager.js", () => ({
        releaseOrphanedBeds: jest.fn().mockResolvedValue({ roomsUpdated: 0, bedsReleased: 0 }),
      }));

      await jest.unstable_mockModule("../../services/contractArchiveService.js", () => ({
        archiveContractForCancelledReservation: jest.fn().mockResolvedValue([]),
        archiveContractsForReservationHardDelete: jest.fn().mockResolvedValue([]),
      }));

      await jest.unstable_mockModule("../../services/sessionInvalidationService.js", () => ({
        invalidateUserSessions: jest.fn().mockResolvedValue({ failures: [] }),
      }));

      await jest.unstable_mockModule("../../config/firebase.js", () => ({
        getAuth: jest.fn(() => ({
          deleteUser: jest.fn().mockResolvedValue({}),
          revokeRefreshTokens: jest.fn().mockResolvedValue({}),
        })),
      }));

      await jest.unstable_mockModule("../../middleware/logger.js", () => ({
        default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      }));

      await jest.unstable_mockModule("../../utils/auditLogger.js", () => ({
        default: { log: jest.fn(), logModification: jest.fn(), logDeletion: jest.fn(), logError: jest.fn() },
      }));

      await jest.unstable_mockModule("../../middleware/errorHandler.js", () => ({
        sendSuccess: jest.fn((res, status, payload) => {
          res.statusCode = status || 200;
          res.body = payload;
          return res;
        }),
        sendError: jest.fn((res, status, message) => {
          res.statusCode = status || 500;
          res.body = { error: message };
          return res;
        }),
        AppError: class AppError extends Error {
          constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
          }
        },
      }));

      const usersControllerModule = await import("../../controllers/usersController.js");
      deleteUser = usersControllerModule.deleteUser;
    });

    test("sets status to 'terminated' with endReason 'Tenant account deleted' upon hard-delete", async () => {
      const req = {
        params: { userId: "507f1f77bcf86cd799439011" },
        query: { hardDelete: "true", force: "true" },
        body: { confirmationText: "DELETE" },
        user: { uid: "firebase-owner-1" },
        branchFilter: null,
        isOwner: true,
        isAdmin: true,
      };
      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
      };

      await deleteUser(req, res, jest.fn());

      expect(res.statusCode).toBe(200);
      expect(mockStayUpdateMany).toHaveBeenCalledTimes(1);

      const [filter, update] = mockStayUpdateMany.mock.calls[0];

      // Verify filter
      expect(filter.status).toEqual({
        $in: ["active", "ending_soon", "expired_occupancy_continuing"],
      });
      expect(filter.$or).toEqual([
        { tenantId: "507f1f77bcf86cd799439011" },
        { reservationId: { $in: ["reservation-101"] } },
      ]);

      // Verify update fields
      expect(update.$set.status).toBe("terminated");
      expect(update.$set.status).not.toBe("cancelled");
      expect(update.$set.endReason).toBe("Tenant account deleted");
      expect(update.$set.endedAt).toBeInstanceOf(Date);
    });
  });
});
