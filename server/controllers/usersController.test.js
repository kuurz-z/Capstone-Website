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
};

await jest.unstable_mockModule("../models/index.js", () => ({
  User: userModel,
  Reservation: {},
  Room: {},
}));

await jest.unstable_mockModule("dayjs", () => ({ default: jest.fn() }));
await jest.unstable_mockModule("../config/firebase.js", () => ({
  getAuth: jest.fn(),
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
  ALL_PERMISSIONS: [],
}));

const { getUsers, getUserStats } = await import("./usersController.js");

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

describe("usersController", () => {
  beforeEach(() => {
    userModel.find.mockReset();
    userModel.countDocuments.mockReset();
    userModel.aggregate.mockReset();
  });

  test("getUsers applies server search, lean projection, and pagination metadata", async () => {
    const users = [{ _id: "u1", username: "jsmith", accountStatus: "active" }];
    userModel.find.mockReturnValue(createFindChain(users));
    userModel.countDocuments.mockResolvedValue(1);

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
    expect(res.body.users).toBe(users);
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

    const req = { branchFilter: "gil-puyat", isSuperAdmin: true };
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
});
