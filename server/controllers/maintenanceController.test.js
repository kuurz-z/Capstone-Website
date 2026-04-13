import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const maintenanceFind = jest.fn();
const maintenanceFindOne = jest.fn();
const userFind = jest.fn();
const userFindOne = jest.fn();
const reservationFindOne = jest.fn();
const sendSuccess = jest.fn();
const maintenanceUpdated = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  MaintenanceRequest: {
    find: maintenanceFind,
    findOne: maintenanceFindOne,
  },
  Reservation: {
    findOne: reservationFindOne,
  },
  User: {
    find: userFind,
    findOne: userFindOne,
  },
}));
await jest.unstable_mockModule("../utils/sanitize.js", () => ({
  clean: (value) => value,
}));
await jest.unstable_mockModule("../utils/notificationService.js", () => ({
  notify: {
    maintenanceUpdated,
  },
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
  CURRENT_RESIDENT_STATUS_QUERY: ["reserved", "moveIn"],
  hasReservationStatus: jest.fn(),
}));

const {
  getAdminAll,
  reopenMyRequest,
  updateAdminRequestStatus,
} = await import("./maintenanceController.js");

const buildLeanQuery = (result) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(result),
  })),
  lean: jest.fn().mockResolvedValue(result),
});

const buildListQuery = (result) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(result),
  })),
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(result),
    })),
  })),
});

const buildRequestDoc = (overrides = {}) => {
  const doc = {
    _id: "507f1f77bcf86cd799439011",
    request_id: "maint_a1b2c3d4e5f6",
    user_id: "user_95f39d5b4ea4",
    request_type: "plumbing",
    description: "Faucet leaking in bathroom.",
    urgency: "high",
    status: "pending",
    assigned_to: null,
    notes: null,
    attachments: [],
    reopen_note: null,
    reopen_history: [],
    created_at: new Date("2026-04-08T10:30:00.000Z"),
    updated_at: new Date("2026-04-08T10:30:00.000Z"),
    cancelled_at: null,
    reopened_at: null,
    resolved_at: null,
    branch: "gil-puyat",
    roomId: "room_1",
    reservationId: "reservation_1",
    isArchived: false,
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return {
        _id: this._id,
        request_id: this.request_id,
        user_id: this.user_id,
        request_type: this.request_type,
        description: this.description,
        urgency: this.urgency,
        status: this.status,
        assigned_to: this.assigned_to,
        notes: this.notes,
        attachments: this.attachments,
        reopen_note: this.reopen_note,
        reopen_history: this.reopen_history,
        created_at: this.created_at,
        updated_at: this.updated_at,
        cancelled_at: this.cancelled_at,
        reopened_at: this.reopened_at,
        resolved_at: this.resolved_at,
        branch: this.branch,
        roomId: this.roomId,
        reservationId: this.reservationId,
      };
    },
    ...overrides,
  };

  return doc;
};

describe("maintenanceController", () => {
  beforeEach(() => {
    maintenanceFind.mockReset();
    maintenanceFindOne.mockReset();
    userFind.mockReset();
    userFindOne.mockReset();
    reservationFindOne.mockReset();
    sendSuccess.mockReset();
    maintenanceUpdated.mockReset();
  });

  test("getAdminAll applies branch and contract filters", async () => {
    const storedRequest = buildRequestDoc();
    maintenanceFind.mockReturnValue(buildListQuery([storedRequest]));
    userFind.mockReturnValue(
      buildListQuery([
        {
          user_id: "user_95f39d5b4ea4",
          firstName: "Lily",
          lastName: "Tenant",
          email: "lily@example.com",
          phone: "0917",
          branch: "gil-puyat",
          role: "tenant",
        },
      ]),
    );

    const req = {
      query: {
        status: "pending",
        request_type: "plumbing",
        urgency: "high",
        date_from: "2026-04-01",
        date_to: "2026-04-13",
        limit: "20",
      },
      branchFilter: "gil-puyat",
      isOwner: false,
    };
    const res = {};
    const next = jest.fn();

    await getAdminAll(req, res, next);

    expect(maintenanceFind).toHaveBeenCalledWith(
      expect.objectContaining({
        isArchived: false,
        branch: "gil-puyat",
        status: "pending",
        request_type: "plumbing",
        urgency: "high",
        created_at: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      }),
    );
    expect(sendSuccess).toHaveBeenCalledTimes(1);
    expect(sendSuccess.mock.calls[0][1].requests[0].tenant.full_name).toBe("Lily Tenant");
    expect(next).not.toHaveBeenCalled();
  });

  test("updateAdminRequestStatus updates a request and notifies the tenant on status change", async () => {
    const requestDoc = buildRequestDoc();
    maintenanceFindOne.mockResolvedValue(requestDoc);
    userFindOne.mockReturnValue(
      buildLeanQuery({
        _id: "mongo_user_1",
        user_id: "user_95f39d5b4ea4",
        firstName: "Lily",
        lastName: "Tenant",
        email: "lily@example.com",
        phone: "0917",
        branch: "gil-puyat",
        role: "tenant",
      }),
    );

    const req = {
      params: { requestId: requestDoc.request_id },
      body: {
        status: "viewed",
        notes: "Plumber scheduled for tomorrow",
        assigned_to: "Juan (Maintenance)",
      },
      branchFilter: "gil-puyat",
      isOwner: false,
    };
    const res = {};
    const next = jest.fn();

    await updateAdminRequestStatus(req, res, next);

    expect(requestDoc.status).toBe("viewed");
    expect(requestDoc.notes).toBe("Plumber scheduled for tomorrow");
    expect(requestDoc.assigned_to).toBe("Juan (Maintenance)");
    expect(requestDoc.save).toHaveBeenCalledTimes(1);
    expect(maintenanceUpdated).toHaveBeenCalledWith(
      "mongo_user_1",
      "plumbing",
      "viewed",
      requestDoc.request_id,
    );
    expect(sendSuccess).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test("updateAdminRequestStatus rejects invalid transitions", async () => {
    const requestDoc = buildRequestDoc({ status: "pending" });
    maintenanceFindOne.mockResolvedValue(requestDoc);

    const req = {
      params: { requestId: requestDoc.request_id },
      body: { status: "completed" },
      branchFilter: "gil-puyat",
      isOwner: false,
    };
    const res = {};
    const next = jest.fn();

    await updateAdminRequestStatus(req, res, next);

    expect(requestDoc.save).not.toHaveBeenCalled();
    expect(maintenanceUpdated).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe("INVALID_STATUS_TRANSITION");
  });

  test("reopenMyRequest returns resolved work to pending and records reopen history", async () => {
    const requestDoc = buildRequestDoc({
      status: "completed",
      resolved_at: new Date("2026-04-10T08:00:00.000Z"),
    });
    maintenanceFindOne.mockResolvedValue(requestDoc);
    userFindOne.mockReturnValue(
      buildLeanQuery({
        _id: "mongo_user_1",
        user_id: "user_95f39d5b4ea4",
        firstName: "Lily",
        lastName: "Tenant",
        email: "lily@example.com",
        phone: "0917",
        branch: "gil-puyat",
        role: "tenant",
      }),
    );

    const req = {
      user: { uid: "firebase_uid_1" },
      params: { requestId: requestDoc.request_id },
      body: { note: "Still leaking" },
    };
    const res = {};
    const next = jest.fn();

    await reopenMyRequest(req, res, next);

    expect(requestDoc.status).toBe("pending");
    expect(requestDoc.reopen_note).toBe("Still leaking");
    expect(requestDoc.reopen_history).toHaveLength(1);
    expect(requestDoc.reopen_history[0]).toEqual(
      expect.objectContaining({
        previous_status: "completed",
        note: "Still leaking",
      }),
    );
    expect(requestDoc.resolved_at).toBeNull();
    expect(requestDoc.save).toHaveBeenCalledTimes(1);
    expect(sendSuccess).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
