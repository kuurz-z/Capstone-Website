import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const createFindChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    select: jest.fn(() => chain),
    lean: jest.fn(async () => result),
  };

  return chain;
};

const userModel = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};
const reservationModel = {
  find: jest.fn(),
  findOne: jest.fn(),
};
const billModel = {
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
};
const setCustomUserClaims = jest.fn();
const getAuth = jest.fn(() => ({ setCustomUserClaims }));

await jest.unstable_mockModule("../models/index.js", () => ({
  User: userModel,
  Reservation: reservationModel,
  Room: {},
  Bill: billModel,
}));

await jest.unstable_mockModule("dayjs", () => ({ default: jest.fn() }));
await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth,
}));
await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { logModification: jest.fn(), logError: jest.fn() },
}));
await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
  AppError: class AppError extends Error {},
}));
await jest.unstable_mockModule("../middleware/permissions.js", () => ({
  DEFAULT_PERMISSIONS: {},
  ALL_PERMISSIONS: [
    "manageReservations",
    "manageTenants",
    "manageBilling",
    "manageRooms",
    "manageMaintenance",
    "manageAnnouncements",
    "viewReports",
    "manageUsers",
  ],
}));

const { getUsers, getUserStats, updateUser, updatePermissions } = await import("./usersController.js");

const createResponse = () => {
  const res = {
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
  };

  return res;
};

const mockNoActiveStay = () => {
  reservationModel.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    }),
  });
};

describe("usersController", () => {
  beforeEach(() => {
    userModel.find.mockReset();
    userModel.countDocuments.mockReset();
    userModel.aggregate.mockReset();
    userModel.findOne.mockReset();
    userModel.findById.mockReset();
    userModel.findByIdAndUpdate.mockReset();
    reservationModel.find.mockReset();
    reservationModel.findOne.mockReset();
    billModel.countDocuments.mockReset();
    billModel.deleteMany.mockReset();
    setCustomUserClaims.mockReset();
    getAuth.mockClear();
  });

  test("getUsers applies server search, lean projection, and pagination metadata", async () => {
    const users = [{ _id: "u1", username: "jsmith", accountStatus: "active" }];
    userModel.find.mockReturnValue(createFindChain(users));
    userModel.countDocuments.mockResolvedValue(1);
    reservationModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

    const req = {
      query: {
        search: "smith",
        page: "2",
        limit: "10",
        sort: "createdAt",
        order: "desc",
      },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await getUsers(req, res, next);

    expect(userModel.find).toHaveBeenCalledTimes(1);
    expect(userModel.find.mock.calls[0][0]).toMatchObject({
      isArchived: false,
      branch: "gil-puyat",
    });
    expect(userModel.find.mock.calls[0][0].$or).toHaveLength(4);
    expect(userModel.find.mock.calls[0][0].$or[0].username).toBeInstanceOf(
      RegExp,
    );
    expect(userModel.find.mock.calls[0][0].$or[0].username.test("smith")).toBe(
      true,
    );
    expect(userModel.find.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining("accountStatus"),
    );
    expect(userModel.find.mock.results[0].value.lean).toHaveBeenCalledTimes(1);
    expect(userModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: false, branch: "gil-puyat" }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toEqual([
      expect.objectContaining({
        _id: "u1",
        hasActiveStay: false,
        hasLifecycleReservation: false,
      }),
    ]);
    expect(res.body.pagination).toMatchObject({
      currentPage: 2,
      totalPages: 1,
      totalItems: 1,
      total: 1,
      itemsPerPage: 10,
      hasNextPage: false,
      hasPrevPage: true,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("getUserStats returns account status counts from one aggregate result", async () => {
    userModel.aggregate.mockResolvedValue([
      {
        totals: [{ total: 8, activeCount: 5, verifiedCount: 3 }],
        byRole: [{ _id: "tenant", count: 6 }],
        byAccountStatus: [
          { _id: "active", count: 5 },
          { _id: "suspended", count: 2 },
          { _id: "banned", count: 1 },
        ],
        byBranch: [{ _id: "gil-puyat", count: 8 }],
      },
    ]);

    const req = { branchFilter: "gil-puyat", isOwner: true };
    const res = createResponse();
    const next = jest.fn();

    await getUserStats(req, res, next);

    expect(userModel.aggregate).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      total: 8,
      activeCount: 5,
      verifiedCount: 3,
      byRole: { applicant: 0, tenant: 6, branch_admin: 0, owner: 0 },
      byAccountStatus: {
        active: 5,
        suspended: 2,
        banned: 1,
        pending_verification: 0,
      },
      byBranch: { "gil-puyat": 8 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("updateUser rejects manual tenant status edits for lifecycle-managed accounts", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      role: "applicant",
      tenantStatus: "applicant",
      toObject: () => ({ role: "applicant", tenantStatus: "applicant" }),
    });
    mockNoActiveStay();

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { tenantStatus: "evicted" },
      branchFilter: null,
      isOwner: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await updateUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("ROLE_LIFECYCLE_MANAGED");
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("updatePermissions normalizes duplicates and order", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const targetUser = {
      role: "branch_admin",
      permissions: [],
      save,
      toObject: () => ({ role: "branch_admin", permissions: ["manageBilling", "manageRooms"] }),
    };
    userModel.findById.mockResolvedValue(targetUser);

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { permissions: ["manageRooms", "manageBilling", "manageRooms", " "] },
    };
    const res = createResponse();
    const next = jest.fn();

    await updatePermissions(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(targetUser.permissions).toEqual(["manageBilling", "manageRooms"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test("updateUser blocks applicant to tenant manual role promotion", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-tenant-1",
      role: "applicant",
      tenantStatus: "applicant",
      toObject: () => ({ role: "applicant", tenantStatus: "applicant" }),
    });
    mockNoActiveStay();

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { role: "tenant" },
      branchFilter: null,
      isOwner: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await updateUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("ROLE_LIFECYCLE_MANAGED");
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("updateUser blocks tenant to applicant downgrade when active stay exists", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-tenant-2",
      role: "tenant",
      tenantStatus: "active",
      toObject: () => ({ role: "tenant", tenantStatus: "active" }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "reservation-1", status: "moveIn" }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { role: "applicant" },
      branchFilter: null,
      isOwner: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await updateUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("ACTIVE_STAY_ROLE_CHANGE_BLOCKED");
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("updateUser still allows owner admin role transitions", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-admin-1",
      role: "branch_admin",
      tenantStatus: "applicant",
      toObject: () => ({ role: "branch_admin", tenantStatus: "applicant" }),
    });
    mockNoActiveStay();
    userModel.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        firebaseUid: "firebase-admin-1",
        role: "applicant",
        tenantStatus: "applicant",
        permissions: [],
        toObject: () => ({ role: "applicant", tenantStatus: "applicant", permissions: [] }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { role: "applicant" },
      branchFilter: null,
      isOwner: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await updateUser(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      expect.objectContaining({
        role: "applicant",
        tenantStatus: "applicant",
        permissions: [],
      }),
      expect.any(Object),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
