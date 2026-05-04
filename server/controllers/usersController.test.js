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
  findByIdAndDelete: jest.fn(),
};
const roomModel = {
  find: jest.fn(),
  countDocuments: jest.fn(),
};
const reservationModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
};
const billModel = {
  countDocuments: jest.fn(),
  deleteMany: jest.fn(),
};
const utilityReadingModel = {
  countDocuments: jest.fn(),
};
const maintenanceRequestModel = {
  countDocuments: jest.fn(),
};
const setCustomUserClaims = jest.fn();
const deleteUserFromAuth = jest.fn();
const getAuth = jest.fn(() => ({
  setCustomUserClaims,
  deleteUser: deleteUserFromAuth,
}));

await jest.unstable_mockModule("../models/index.js", () => ({
  User: userModel,
  Reservation: reservationModel,
  Room: roomModel,
  Bill: billModel,
  UtilityReading: utilityReadingModel,
  MaintenanceRequest: maintenanceRequestModel,
}));

await jest.unstable_mockModule("dayjs", () => ({ default: jest.fn() }));
await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth,
}));
await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { logModification: jest.fn(), logDeletion: jest.fn(), logError: jest.fn() },
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

const {
  getUsers,
  getUserStats,
  getUserById,
  updateUser,
  updatePermissions,
  deleteUser,
  restoreUser,
  suspendUser,
  reactivateUser,
} = await import("./usersController.js");

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

const createPopulateChain = (result) => {
  const chain = {
    select: jest.fn(() => chain),
    populate: jest.fn(),
  };

  chain.populate
    .mockImplementationOnce(() => chain)
    .mockImplementationOnce(() => Promise.resolve(result));

  return chain;
};

describe("usersController", () => {
  beforeEach(() => {
    userModel.find.mockReset();
    userModel.countDocuments.mockReset();
    userModel.aggregate.mockReset();
    userModel.findOne.mockReset();
    userModel.findById.mockReset();
    userModel.findByIdAndUpdate.mockReset();
    userModel.findByIdAndDelete.mockReset();
    roomModel.find.mockReset();
    roomModel.countDocuments.mockReset();
    reservationModel.find.mockReset();
    reservationModel.findOne.mockReset();
    reservationModel.countDocuments.mockReset();
    reservationModel.deleteMany.mockReset();
    billModel.countDocuments.mockReset();
    billModel.deleteMany.mockReset();
    utilityReadingModel.countDocuments.mockReset();
    maintenanceRequestModel.countDocuments.mockReset();
    setCustomUserClaims.mockReset();
    deleteUserFromAuth.mockReset();
    getAuth.mockClear();
  });

  test("getUsers applies server search, lean projection, and pagination metadata", async () => {
    const users = [{ _id: "u1", username: "jsmith", accountStatus: "active" }];
    userModel.find.mockReturnValue(createFindChain(users));
    userModel.countDocuments.mockResolvedValue(1);
    roomModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "room-1" }]),
      }),
    });
    reservationModel.find
      .mockReturnValueOnce({
        distinct: jest.fn().mockResolvedValue([]),
      })
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
    expect(roomModel.find).toHaveBeenCalledWith({ branch: "gil-puyat" });
    expect(userModel.find.mock.calls[0][0]).toMatchObject({
      isArchived: false,
      $and: expect.any(Array),
    });
    expect(userModel.find.mock.calls[0][0].$and).toHaveLength(2);
    expect(userModel.find.mock.calls[0][0].$and[0].$or).toEqual([
      { branch: "gil-puyat" },
      { _id: { $in: [] } },
    ]);
    expect(userModel.find.mock.calls[0][0].$and[1].$or).toHaveLength(4);
    expect(
      userModel.find.mock.calls[0][0].$and[1].$or[0].username,
    ).toBeInstanceOf(RegExp);
    expect(
      userModel.find.mock.calls[0][0].$and[1].$or[0].username.test("smith"),
    ).toBe(true);
    expect(userModel.find.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining("accountStatus"),
    );
    expect(userModel.find.mock.results[0].value.lean).toHaveBeenCalledTimes(1);
    expect(userModel.countDocuments).toHaveBeenCalledWith(
      userModel.find.mock.calls[0][0],
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
    roomModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "room-1" }]),
      }),
    });
    reservationModel.find.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["user-1"]),
    });
    userModel.aggregate.mockResolvedValue([
      {
        totals: [{ total: 8, activeCount: 5, verifiedCount: 3, archivedCount: 0 }],
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

    expect(roomModel.find).toHaveBeenCalledWith({ branch: "gil-puyat" });
    expect(userModel.aggregate).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      total: 8,
      activeCount: 5,
      verifiedCount: 3,
      archivedCount: 0,
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

  test("getUserById allows branch-scoped lookup through linked reservations", async () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      branch: "guadalupe",
      email: "tenant@example.com",
    };
    userModel.findById.mockReturnValue(createPopulateChain(user));
    roomModel.find.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["room-1"]),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      branchFilter: "gil-puyat",
    };
    const res = createResponse();
    const next = jest.fn();

    await getUserById(req, res, next);

    expect(userModel.findById).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    expect(roomModel.find).toHaveBeenCalledWith({ branch: "gil-puyat" });
    expect(reservationModel.findOne).toHaveBeenCalledWith({
      userId: "507f1f77bcf86cd799439011",
      roomId: { $in: ["room-1"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(user);
    expect(next).not.toHaveBeenCalled();
  });

  test("suspendUser denies branch admins outside their branch scope", async () => {
    const save = jest.fn();
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      branch: "guadalupe",
      role: "tenant",
      save,
      suspend: jest.fn(),
      toObject: () => ({ branch: "guadalupe", role: "tenant" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    roomModel.find.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["room-1"]),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { reason: "Policy review" },
      branchFilter: "gil-puyat",
      isOwner: false,
    };
    const res = createResponse();
    const next = jest.fn();

    await suspendUser(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
    expect(targetUser.suspend).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("reactivateUser denies branch admins outside their branch scope", async () => {
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      branch: "guadalupe",
      role: "tenant",
      accountStatus: "suspended",
      reactivate: jest.fn(),
      toObject: () => ({ branch: "guadalupe", role: "tenant" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    roomModel.find.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(["room-1"]),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      branchFilter: "gil-puyat",
      isOwner: false,
    };
    const res = createResponse();
    const next = jest.fn();

    await reactivateUser(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
    expect(targetUser.reactivate).not.toHaveBeenCalled();
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

  test("restoreUser reactivates archived accounts", async () => {
    const restore = jest.fn().mockResolvedValue(undefined);
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      isArchived: true,
      restore,
      toObject: () => ({ isArchived: true, accountStatus: "banned" }),
    };

    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "owner-1" }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-owner-1" },
    };
    const res = createResponse();
    const next = jest.fn();

    await restoreUser(req, res, next);

    expect(restore).toHaveBeenCalledWith("owner-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        message: "User restored successfully",
        user: targetUser,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("deleteUser blocks default deletion when significant history exists", async () => {
    const ban = jest.fn().mockResolvedValue(undefined);
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      role: "tenant",
      isArchived: false,
      ban,
      toObject: () => ({ _id: "507f1f77bcf86cd799439011", accountStatus: "active" }),
    };

    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "owner-1" }),
      }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }),
      }),
    });
    reservationModel.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    billModel.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    utilityReadingModel.countDocuments.mockResolvedValue(2);
    maintenanceRequestModel.countDocuments.mockResolvedValue(1);
    roomModel.countDocuments.mockResolvedValue(1);

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      query: {},
      user: { uid: "firebase-owner-1" },
      branchFilter: null,
      isOwner: true,
      isAdmin: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await deleteUser(req, res, next);

    expect(ban).toHaveBeenCalledWith(
      "owner-1",
      expect.stringContaining("significant history"),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        blocked: true,
        blockedBecauseOfHistory: true,
        hardDelete: false,
      }),
    );
    expect(userModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("deleteUser rejects force delete without DELETE confirmation", async () => {
    userModel.findById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      role: "tenant",
      isArchived: false,
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      query: { hardDelete: "true", force: "true" },
      body: { confirmationText: "delete" },
      user: { uid: "firebase-owner-1" },
      branchFilter: null,
      isOwner: true,
      isAdmin: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await deleteUser(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("FORCE_DELETE_CONFIRMATION_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  test("deleteUser allows owner force delete with significant history", async () => {
    userModel.findById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-tenant-1",
      role: "tenant",
      isArchived: false,
      toObject: () => ({ _id: "507f1f77bcf86cd799439011", firebaseUid: "firebase-tenant-1" }),
    });
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "owner-1" }),
      }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }),
      }),
    });
    reservationModel.countDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    billModel.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    utilityReadingModel.countDocuments.mockResolvedValue(3);
    maintenanceRequestModel.countDocuments.mockResolvedValue(1);
    roomModel.countDocuments.mockResolvedValue(1);

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      query: { hardDelete: "true", force: "true" },
      body: { confirmationText: "DELETE" },
      user: { uid: "firebase-owner-1" },
      branchFilter: null,
      isOwner: true,
      isAdmin: true,
    };
    const res = createResponse();
    const next = jest.fn();

    await deleteUser(req, res, next);

    expect(deleteUserFromAuth).toHaveBeenCalledWith("firebase-tenant-1");
    expect(billModel.deleteMany).toHaveBeenCalledWith({
      userId: "507f1f77bcf86cd799439011",
      isArchived: false,
      status: "draft",
    });
    expect(userModel.findByIdAndDelete).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        hardDelete: true,
        forceDeleted: true,
        deletedAccountLabel: "Deleted account",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
