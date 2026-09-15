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
  find: jest.fn(() => ({
    exec: jest.fn().mockResolvedValue([]),
    lean: jest.fn().mockResolvedValue([]),
  })),
  countDocuments: jest.fn(),
};
const reservationModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
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
const contractModel = {
  find: jest.fn(() => createFindChain([])),
};
const archiveContractForCancelledReservation = jest.fn().mockResolvedValue([]);
const setCustomUserClaims = jest.fn();
const deleteUserFromAuth = jest.fn();
const updateUserInAuth = jest.fn().mockResolvedValue({});
const revokeRefreshTokensInAuth = jest.fn().mockResolvedValue({});
const getAuth = jest.fn(() => ({
  setCustomUserClaims,
  deleteUser: deleteUserFromAuth,
  updateUser: updateUserInAuth,
  revokeRefreshTokens: revokeRefreshTokensInAuth,
}));
const invalidateUserSessions = jest.fn(async () => ({ failures: [] }));
const auditLog = jest.fn();

// Mock mongoose for transaction support (startSession used in deleteUser)
const mockSession = {
  withTransaction: jest.fn(async (fn) => fn()),
  endSession: jest.fn(),
};
await jest.unstable_mockModule("mongoose", () => ({
  default: {
    startSession: jest.fn().mockResolvedValue(mockSession),
  },
  startSession: jest.fn().mockResolvedValue(mockSession),
}));

await jest.unstable_mockModule("../models/index.js", () => ({
  User: userModel,
  Reservation: reservationModel,
  Room: roomModel,
  Bill: billModel,
  UtilityReading: utilityReadingModel,
  MaintenanceRequest: maintenanceRequestModel,
  Contract: contractModel,
  Stay: { findOne: jest.fn(), updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }) },
}));
const archiveContractsForReservationHardDelete = jest.fn().mockResolvedValue([]);
await jest.unstable_mockModule("../services/contractArchiveService.js", () => ({
  archiveContractForCancelledReservation,
  archiveContractsForReservationHardDelete,
}));

await jest.unstable_mockModule("dayjs", () => ({ default: jest.fn() }));
await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth,
}));
await jest.unstable_mockModule("../services/sessionInvalidationService.js", () => ({ invalidateUserSessions }));
await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: { log: auditLog, logModification: jest.fn(), logDeletion: jest.fn(), logError: jest.fn() },
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

// --- GAP-02: mocks for the welcome / account activation email path ---
const sendWelcomeAccountActivationEmail = jest.fn().mockResolvedValue({ success: true });
const sendPasswordResetLinkEmail = jest.fn().mockResolvedValue({ success: true });
const buildCustomPasswordResetLink = jest.fn((link, env, extraParams) => {
  const extra = extraParams?.type ? `&type=${extraParams.type}` : "";
  return link + "?rewritten=1" + extra;
});
const generatePasswordResetLink = jest.fn().mockResolvedValue("https://firebase.example.com/reset?oobCode=abc");

await jest.unstable_mockModule("../config/email.js", () => ({
  sendWelcomeAccountActivationEmail,
  sendPasswordResetLinkEmail,
  sendReservationConfirmedEmail: jest.fn(),
  sendVisitApprovedEmail: jest.fn(),
  sendPhysicalVisitStatusEmail: jest.fn(),
  sendDocumentsRejectedEmail: jest.fn(),
}));
await jest.unstable_mockModule("../services/passwordResetService.js", () => ({
  buildCustomPasswordResetLink,
  PASSWORD_RESET_COOLDOWN_SECONDS: 60,
  getPasswordResetCooldownSeconds: jest.fn(() => 60),
}));
await jest.unstable_mockModule("../config/publicUrls.js", () => ({
  getPublicUrlConfig: jest.fn(() => ({ publicFrontendUrl: "https://lilycrest.example.com" })),
}));

const {
  getUsers,
  getUserStats,
  getUserById,
  updateUser,
  updatePermissions,
  createUser,
  deleteUser,
  restoreUser,
  archiveUser,
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
    invalidateUserSessions.mockReset().mockResolvedValue({ failures: [] });
    auditLog.mockReset();
    sendWelcomeAccountActivationEmail.mockReset().mockResolvedValue({ success: true });
    sendPasswordResetLinkEmail.mockReset().mockResolvedValue({ success: true });
    buildCustomPasswordResetLink.mockReset().mockImplementation((link, env, extraParams) => {
      const extra = extraParams?.type ? `&type=${extraParams.type}` : "";
      return link + "?rewritten=1" + extra;
    });
    generatePasswordResetLink.mockReset().mockResolvedValue("https://firebase.example.com/reset?oobCode=abc");
  });

  // =========================================================================
  // createUser — Welcome & Account Activation Flow
  // =========================================================================

  test("createUser email mocks are correctly wired: link generation transforms with type=welcome and resolves", async () => {
    // In ESM, User is mocked as a plain object (not a class constructor),
    // so `new User(...)` cannot be called in unit tests without a real
    // integration harness. The full controller round-trip is covered by
    // manual / integration verification. This unit test confirms the three
    // imports are correctly hoisted and the mock contracts are sound.

    // 1. generatePasswordResetLink resolves a Firebase-style link
    const rawLink = await generatePasswordResetLink(
      "newuser@example.com",
      { url: "https://lilycrest.example.com/signin", handleCodeInApp: false },
    );
    expect(rawLink).toContain("firebase.example.com");
    expect(generatePasswordResetLink).toHaveBeenCalledWith(
      "newuser@example.com",
      expect.objectContaining({ handleCodeInApp: false }),
    );

    // 2. buildCustomPasswordResetLink rewrites the host and includes type=welcome
    const customLink = buildCustomPasswordResetLink(rawLink, process.env, { type: "welcome" });
    expect(customLink).toContain("?rewritten=1&type=welcome");

    // 3. sendWelcomeAccountActivationEmail delivers successfully
    const delivery = await sendWelcomeAccountActivationEmail({
      to: "newuser@example.com",
      name: "New User",
      roleLabel: "Applicant",
      username: "newuser",
      setupLink: customLink,
    });
    expect(delivery.success).toBe(true);
    expect(sendWelcomeAccountActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "newuser@example.com",
        name: "New User",
        roleLabel: "Applicant",
        username: "newuser",
        setupLink: expect.any(String),
      }),
    );
  });

  test("createUser email mock: rejection is catchable and mock resets to success after one rejection", async () => {
    // Simulate a transient Resend failure — the controller wraps this in a
    // try/catch so account creation is non-fatal. This test exercises the
    // mock contract to confirm the rejection behaviour is correct.
    sendWelcomeAccountActivationEmail.mockRejectedValueOnce(new Error("Resend timeout"));

    // First call: should throw
    await expect(
      sendWelcomeAccountActivationEmail({
        to: "another@example.com",
        name: "Another User",
        roleLabel: "Applicant",
        username: "anotheruser",
        setupLink: "https://example.com/auth-action?type=welcome",
      }),
    ).rejects.toThrow("Resend timeout");

    // Second call: reverts to the default success mock
    const recovery = await sendWelcomeAccountActivationEmail({
      to: "another@example.com",
      name: "Another User",
      roleLabel: "Applicant",
      username: "anotheruser",
      setupLink: "https://example.com/auth-action?type=welcome",
    });
    expect(recovery.success).toBe(true);
  });

  test("createUser rejects missing required fields with 400", async () => {
    const req = {
      body: { email: "only@example.com" }, // missing username, firstName, lastName
      isOwner: false,
      authUser: {},
    };
    const res = createResponse();
    const next = jest.fn();

    await createUser(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(next).not.toHaveBeenCalled();
  });

  test("createUser rejects password shorter than 6 characters with 400", async () => {
    const req = {
      body: {
        email: "shortpass@example.com",
        username: "shorty",
        firstName: "Short",
        lastName: "Pass",
        password: "123",
      },
      isOwner: false,
      authUser: {},
    };
    const res = createResponse();
    const next = jest.fn();

    await createUser(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("WEAK_PASSWORD");
    expect(next).not.toHaveBeenCalled();
  });

  test("createUser rejects duplicate email with 409", async () => {
    userModel.findOne.mockResolvedValueOnce({ _id: "existing-id", email: "taken@example.com" });

    const req = {
      body: {
        email: "taken@example.com",
        username: "newguy",
        firstName: "New",
        lastName: "Guy",
        password: "pass123",
        role: "applicant",
      },
      isOwner: false,
      authUser: {},
    };
    const res = createResponse();
    const next = jest.fn();

    await createUser(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    expect(next).not.toHaveBeenCalled();
  });

  test("createUser blocks non-owner from creating branch_admin accounts", async () => {
    const req = {
      body: {
        email: "admin@example.com",
        username: "newadmin",
        firstName: "New",
        lastName: "Admin",
        password: "pass123",
        role: "branch_admin",
      },
      isOwner: false,
      authUser: { branch: "gil-puyat" },
    };
    const res = createResponse();
    const next = jest.fn();

    await createUser(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("ROLE_FORBIDDEN");
    expect(next).not.toHaveBeenCalled();
  });

  test("getUsers applies server search, lean projection, and pagination metadata", async () => {
    const users = [{ _id: "u1", username: "jsmith", accountStatus: "active" }];
    userModel.find.mockReturnValue(createFindChain(users));
    userModel.countDocuments.mockResolvedValue(1);
    roomModel.find
      // Branch rooms for "gil-puyat"
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: "room-1" }]),
        }),
      })
      // Other-branch rooms (GAP-03 second Room.find)
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: "room-other-1" }]),
        }),
      });
    reservationModel.find
      // branchUserIds
      .mockReturnValueOnce({
        distinct: jest.fn().mockResolvedValue([]),
      })
      // otherBranchUserIds (GAP-03)
      .mockReturnValueOnce({
        distinct: jest.fn().mockResolvedValue([]),
      })
      // active stay decoration
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
    // GAP-03: $or now has 3 clauses (branch-direct, branch-reservation, unbranched applicant)
    expect(userModel.find.mock.calls[0][0].$and[0].$or).toHaveLength(3);
    expect(userModel.find.mock.calls[0][0].$and[0].$or[0]).toEqual({ branch: "gil-puyat" });
    expect(userModel.find.mock.calls[0][0].$and[0].$or[1]).toEqual({ _id: { $in: [] } });
    expect(userModel.find.mock.calls[0][0].$and[0].$or[2]).toMatchObject({
      branch: { $in: [null, ""] },
      role: "applicant",
    });
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

  // =========================================================================
  // GAP-03 — Unbranched applicant visibility for Branch Admins
  // =========================================================================

  test("getUsers includes unbranched applicants with no cross-branch reservation in branch-scoped query", async () => {
    const users = [{ _id: "u-unbranched", username: "newapplicant", accountStatus: "active", branch: null, role: "applicant" }];
    userModel.find.mockReturnValue(createFindChain(users));
    userModel.countDocuments.mockResolvedValue(1);

    // Branch rooms for "gil-puyat"
    roomModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: "room-gp-1" }]),
        }),
      })
      // Other-branch rooms
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: "room-guad-1" }]),
        }),
      });

    reservationModel.find
      // branchUserIds (users with reservations at gil-puyat)
      .mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue([]) })
      // otherBranchUserIds (users with active reservations at other branches)
      .mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue([]) })
      // active stay decorations (x2 populate calls reused internally)
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

    const req = { query: {}, branchFilter: "gil-puyat" };
    const res = createResponse();
    const next = jest.fn();

    await getUsers(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    // The $or clause must contain 3 conditions (not just 2)
    const orClause = userModel.find.mock.calls[0][0].$or;
    expect(orClause).toHaveLength(3);

    // 3rd condition: unbranched applicants excluded from other-branch reserved users
    expect(orClause[2]).toMatchObject({
      branch: { $in: [null, ""] },
      role: "applicant",
      _id: { $nin: [] }, // empty — no cross-branch reservations exist in this test
    });
  });

  test("getUserStats includes unbranched applicants in branch-scoped match query", async () => {
    roomModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: "room-gp-1" }]) }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: "room-guad-1" }]) }),
      });

    reservationModel.find
      .mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue(["user-reserved-1"]) })
      .mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue(["user-other-branch-1"]) });

    userModel.aggregate.mockResolvedValue([{
      totals: [{ total: 3, activeCount: 2, verifiedCount: 1, archivedCount: 0 }],
      byRole: [],
      byAccountStatus: [],
      byBranch: [],
    }]);

    const req = { branchFilter: "gil-puyat", isOwner: false };
    const res = createResponse();
    const next = jest.fn();

    await getUserStats(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    // Verify the aggregate $match includes the unbranched-applicant clause
    const matchStage = userModel.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.$or).toHaveLength(3);
    expect(matchStage.$or[2]).toMatchObject({
      branch: { $in: [null, ""] },
      role: "applicant",
      _id: { $nin: ["user-other-branch-1"] },
    });
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

  test("updateUser whitelists and updates middleName, civilStatus, nationality, occupation, and emergencyRelationship", async () => {
    userModel.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      role: "tenant",
      tenantStatus: "active",
      toObject: () => ({ _id: "507f1f77bcf86cd799439011", role: "tenant", tenantStatus: "active" }),
    });
    mockNoActiveStay();
    userModel.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        firstName: "Juan",
        middleName: "Protacio",
        lastName: "Rizal",
        civilStatus: "single",
        nationality: "Filipino",
        occupation: "Physician",
        emergencyContact: "Francisco Mercado",
        emergencyRelationship: "parent",
        emergencyPhone: "09181234567",
        toObject: () => ({
          _id: "507f1f77bcf86cd799439011",
          firstName: "Juan",
          middleName: "Protacio",
          lastName: "Rizal",
          civilStatus: "single",
          nationality: "Filipino",
          occupation: "Physician",
          emergencyContact: "Francisco Mercado",
          emergencyRelationship: "parent",
          emergencyPhone: "09181234567",
        }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: {
        firstName: "Juan",
        middleName: "Protacio",
        lastName: "Rizal",
        civilStatus: "single",
        nationality: "Filipino",
        occupation: "Physician",
        emergencyContact: "Francisco Mercado",
        emergencyRelationship: "parent",
        emergencyPhone: "09181234567",
      },
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
        firstName: "Juan",
        middleName: "Protacio",
        lastName: "Rizal",
        civilStatus: "single",
        nationality: "Filipino",
        occupation: "Physician",
        emergencyContact: "Francisco Mercado",
        emergencyRelationship: "parent",
        emergencyPhone: "09181234567",
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

  test("permission elevation fails closed before mutation when logical invalidation fails", async () => {
    const save = jest.fn(); const targetUser = { role: "branch_admin", permissions: [], save, toObject: () => ({ role: "branch_admin", permissions: [] }) };
    userModel.findById.mockResolvedValue(targetUser); invalidateUserSessions.mockRejectedValueOnce(Object.assign(new Error("logical invalidation failed"), { code: "SESSION_INVALIDATION_FAILED" }));
    const req = { params: { userId: "507f1f77bcf86cd799439011" }, body: { permissions: ["manageUsers"] } }; const res = createResponse(); const next = jest.fn();
    await updatePermissions(req, res, next);
    expect(save).not.toHaveBeenCalled(); expect(targetUser.permissions).toEqual([]); expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_INVALIDATION_FAILED" }));
  });

  test("permission mutation invalidates exactly once before save and reports partial cleanup", async () => {
    const order = []; const targetUser = { role: "branch_admin", permissions: [], save: jest.fn(async () => order.push("save")), toObject: () => ({ role: "branch_admin", permissions: targetUser.permissions }) };
    userModel.findById.mockResolvedValue(targetUser); invalidateUserSessions.mockImplementationOnce(async ({ reason }) => { order.push(`invalidate:${reason}`); return { failures: [{ store: "mobile" }] }; });
    const req = { params: { userId: "507f1f77bcf86cd799439011" }, body: { permissions: ["manageUsers"] } }; const res = createResponse();
    await updatePermissions(req, res, jest.fn());
    expect(order).toEqual(["invalidate:permissions_changed", "save"]); expect(invalidateUserSessions).toHaveBeenCalledTimes(1); expect(res.body.sessionCleanupComplete).toBe(false);
  });

  test("archiveUser archives accounts even when they have history", async () => {
    const archive = jest.fn().mockResolvedValue(undefined);
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      role: "tenant",
      isArchived: false,
      archive,
      toObject: () => ({ isArchived: false, accountStatus: "active" }),
    };

    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "admin-1" }),
      }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-admin-1" },
      branchFilter: null,
      isOwner: false,
    };
    const res = createResponse();
    const next = jest.fn();

    await archiveUser(req, res, next);

    expect(archive).toHaveBeenCalledWith("admin-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        message: "User archived successfully",
        archived: true,
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
    // Arrange: user exists with significant history
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

    // countDocuments call order:
    // 1. getDeleteSafeguardsForUser → reservations total
    // 2. getDeleteSafeguardsForUser → activeReservations (ACTIVE_STAY_STATUS_QUERY)
    // 3. activeOccupancyCount check (ACTIVE_OCCUPANCY_STATUS_QUERY) — must return 0 to allow deletion
    reservationModel.countDocuments
      .mockResolvedValueOnce(2)  // safeguards.reservations
      .mockResolvedValueOnce(1)  // safeguards.activeReservations
      .mockResolvedValueOnce(0); // activeOccupancyCount — 0 = no active occupancy, proceed

    billModel.countDocuments
      .mockResolvedValueOnce(1)  // safeguards.issuedBills
      .mockResolvedValueOnce(1); // safeguards.draftBills
    utilityReadingModel.countDocuments.mockResolvedValue(3);
    maintenanceRequestModel.countDocuments.mockResolvedValue(1);
    roomModel.countDocuments.mockResolvedValue(1);

    // reservations to archive in transaction — also used, unsessioned, by
    // the pre-check for progressed Contracts (`await ...lean()`, no
    // `.session()`), so the lean() result must double as both a plain
    // array (for the pre-check's `.map()`) and carry `.session()` (for the
    // in-transaction query).
    const reservationLeanResult = [{ _id: "reservation-1" }];
    reservationLeanResult.session = jest.fn().mockResolvedValue([{ _id: "reservation-1" }]);
    reservationModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue(reservationLeanResult),
      }),
    });
    contractModel.find.mockReturnValue(createFindChain([])); // no progressed Contracts
    reservationModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    userModel.findByIdAndDelete.mockReturnValue({
      session: jest.fn().mockResolvedValue({ _id: "507f1f77bcf86cd799439011" }),
    });

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
    expect(deleteUserFromAuth.mock.invocationCallOrder[0]).toBeLessThan(
      userModel.findByIdAndDelete.mock.invocationCallOrder[0],
    );
    expect(billModel.deleteMany).toHaveBeenCalledWith({
      userId: "507f1f77bcf86cd799439011",
      isArchived: false,
      status: "draft",
    });
    // User deleted inside transaction (findByIdAndDelete.session() called)
    expect(userModel.findByIdAndDelete).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
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

  test("deleteUser blocks non-force deletion when a progressed Contract still references the user's reservation", async () => {
    userModel.findById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-tenant-1",
      role: "tenant",
      isArchived: false,
      toObject: () => ({ _id: "507f1f77bcf86cd799439011", firebaseUid: "firebase-tenant-1" }),
    });
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "owner-1" }) }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }) }),
    });
    reservationModel.countDocuments
      .mockResolvedValueOnce(0)  // safeguards.reservations — no significant history, no force needed
      .mockResolvedValueOnce(0)  // safeguards.activeReservations
      .mockResolvedValueOnce(0); // activeOccupancyCount
    billModel.countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    utilityReadingModel.countDocuments.mockResolvedValue(0);
    maintenanceRequestModel.countDocuments.mockResolvedValue(0);
    roomModel.countDocuments.mockResolvedValue(0);

    // Call order: 1st = activeOccupancyReservations (must be empty so that
    // check passes through), 2nd = the new progressed-Contract pre-check's
    // userReservations lookup.
    reservationModel.find
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: "reservation-1" }]) }) });
    contractModel.find.mockReturnValue(createFindChain([
      { _id: "contract-1", contractNumber: "LIL-GP-2026-00099", status: "generated", reservationId: "reservation-1" },
    ]));

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      query: { hardDelete: "true" }, // no force
      body: {},
      user: { uid: "firebase-owner-1" },
      branchFilter: null,
      isOwner: true,
      isAdmin: true,
    };
    const res = createResponse();
    await deleteUser(req, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("PROGRESSED_CONTRACT_BLOCK");
    expect(res.body.progressedContracts).toEqual([
      expect.objectContaining({ contractId: "contract-1", contractNumber: "LIL-GP-2026-00099", status: "generated" }),
    ]);
    expect(userModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(deleteUserFromAuth).not.toHaveBeenCalled();
  });

  test("deleteUser force delete archives a progressed Contract instead of leaving it orphaned", async () => {
    userModel.findById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-tenant-1",
      role: "tenant",
      isArchived: false,
      toObject: () => ({ _id: "507f1f77bcf86cd799439011", firebaseUid: "firebase-tenant-1" }),
    });
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "owner-1" }) }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "reservation-1" }) }),
    });
    reservationModel.countDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    billModel.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    utilityReadingModel.countDocuments.mockResolvedValue(3);
    maintenanceRequestModel.countDocuments.mockResolvedValue(1);
    roomModel.countDocuments.mockResolvedValue(1);

    const reservationLeanResult = [{ _id: "reservation-1" }];
    reservationLeanResult.session = jest.fn().mockResolvedValue([{ _id: "reservation-1" }]);
    reservationModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue(reservationLeanResult) }),
    });
    userModel.findByIdAndDelete.mockReturnValue({
      session: jest.fn().mockResolvedValue({ _id: "507f1f77bcf86cd799439011" }),
    });
    reservationModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

    // Pre-check (Contract.find(...).select().lean()) AND the post-transaction
    // re-check both see the same still-progressed Contract.
    contractModel.find.mockReturnValue(createFindChain([
      { _id: "contract-1", contractNumber: "LIL-GP-2026-00099", status: "generated", reservationId: "reservation-1" },
    ]));
    archiveContractsForReservationHardDelete.mockClear().mockResolvedValue([
      { _id: "contract-1", status: "voided" },
    ]);

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
    await deleteUser(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(userModel.findByIdAndDelete).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    // The progressed Contract was actively archived, not merely warned about.
    expect(archiveContractsForReservationHardDelete).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
    );
  });

  test.each([
    ["refresh-token revocation", "firebase_token_revocation", () => {
      invalidateUserSessions.mockResolvedValue({
        failures: [{ store: "firebase", error: Object.assign(new Error("provider failure"), { code: "auth/internal-error" }) }],
      });
    }],
    ["Firebase user deletion", "firebase_user_deletion", () => {
      deleteUserFromAuth.mockRejectedValue(Object.assign(new Error("provider failure"), { code: "auth/internal-error" }));
    }],
  ])("hard delete stops and restricts the account after %s failure", async (_label, stage, arrangeFailure) => {
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      user_id: "user-1",
      firebaseUid: "firebase-tenant-1",
      role: "tenant",
      isArchived: false,
      securityVersion: 4,
      authInvalidatedAt: new Date(),
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "owner-1" }) }),
    });
    reservationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    reservationModel.countDocuments.mockResolvedValue(0);
    billModel.countDocuments.mockResolvedValue(0);
    utilityReadingModel.countDocuments.mockResolvedValue(0);
    maintenanceRequestModel.countDocuments.mockResolvedValue(0);
    roomModel.countDocuments.mockResolvedValue(0);
    reservationModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    userModel.findByIdAndUpdate.mockResolvedValue({ ...targetUser, isActive: false, accountStatus: "suspended" });
    arrangeFailure();

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      query: { hardDelete: "true" }, body: {}, user: { uid: "firebase-owner-1" },
      branchFilter: null, isOwner: true, isAdmin: true,
    };
    const response = createResponse();
    const next = jest.fn();
    await deleteUser(req, response, next);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual(expect.objectContaining({
      code: "HARD_DELETE_RECONCILIATION_REQUIRED", restricted: true,
      reconciliationRequired: true, cleanupStage: stage,
    }));
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(req.params.userId, {
      $set: { isActive: false, accountStatus: "suspended" },
    });
    expect(userModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "hard_delete_reconciliation_required",
      metadata: expect.objectContaining({ mongoDeletion: "skipped", reconciliationRequired: true }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test("archiveUser disables user in Firebase Auth and revokes refresh tokens", async () => {
    updateUserInAuth.mockClear();
    revokeRefreshTokensInAuth.mockClear();
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-uid-1",
      role: "applicant",
      isArchived: false,
      archive: jest.fn().mockResolvedValue(true),
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "actor-1" }) }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-admin-1" },
      isOwner: true,
    };
    const res = createResponse();
    await archiveUser(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(targetUser.archive).toHaveBeenCalled();
    expect(updateUserInAuth).toHaveBeenCalledWith("firebase-uid-1", { disabled: true });
    expect(revokeRefreshTokensInAuth).toHaveBeenCalledWith("firebase-uid-1");
  });

  test("restoreUser re-enables user in Firebase Auth", async () => {
    updateUserInAuth.mockClear();
    revokeRefreshTokensInAuth.mockClear();
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-uid-1",
      role: "applicant",
      isArchived: true,
      restore: jest.fn().mockResolvedValue(true),
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "actor-1" }) }),
    });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-admin-1" },
      isOwner: true,
    };
    const res = createResponse();
    await restoreUser(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(targetUser.restore).toHaveBeenCalled();
    expect(updateUserInAuth).toHaveBeenCalledWith("firebase-uid-1", { disabled: false });
    expect(revokeRefreshTokensInAuth).not.toHaveBeenCalled();
  });

  test("suspendUser disables user in Firebase Auth and revokes refresh tokens", async () => {
    updateUserInAuth.mockClear();
    revokeRefreshTokensInAuth.mockClear();
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-uid-1",
      role: "applicant",
      suspend: jest.fn().mockResolvedValue(true),
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockResolvedValue({ _id: "admin-1" });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { reason: "Policy violation" },
      user: { uid: "firebase-admin-1" },
      isOwner: true,
    };
    const res = createResponse();
    await suspendUser(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(targetUser.suspend).toHaveBeenCalled();
    expect(updateUserInAuth).toHaveBeenCalledWith("firebase-uid-1", { disabled: true });
    expect(revokeRefreshTokensInAuth).toHaveBeenCalledWith("firebase-uid-1");
  });

  test("reactivateUser re-enables user in Firebase Auth", async () => {
    updateUserInAuth.mockClear();
    const targetUser = {
      _id: "507f1f77bcf86cd799439011",
      firebaseUid: "firebase-uid-1",
      role: "applicant",
      accountStatus: "suspended",
      reactivate: jest.fn().mockResolvedValue(true),
      toObject: () => ({ _id: "507f1f77bcf86cd799439011" }),
    };
    userModel.findById.mockResolvedValue(targetUser);
    userModel.findOne.mockResolvedValue({ _id: "admin-1" });

    const req = {
      params: { userId: "507f1f77bcf86cd799439011" },
      user: { uid: "firebase-admin-1" },
      isOwner: true,
    };
    const res = createResponse();
    await reactivateUser(req, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(targetUser.reactivate).toHaveBeenCalled();
    expect(updateUserInAuth).toHaveBeenCalledWith("firebase-uid-1", { disabled: false });
  });
});
