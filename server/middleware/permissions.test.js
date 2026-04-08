import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const lean = jest.fn();
const select = jest.fn(() => ({ lean }));
const findOne = jest.fn(() => ({ select }));

await jest.unstable_mockModule("../models/index.js", () => ({
  User: { findOne },
}));

const {
  requireAnyPermission,
  requirePermission,
} = await import("./permissions.js");

const createRes = () => ({
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

describe("permissions middleware", () => {
  beforeEach(() => {
    findOne.mockReset();
    findOne.mockImplementation(() => ({ select }));
    select.mockClear();
    lean.mockReset();
  });

  test("owner bypasses permission checks", async () => {
    const middleware = requirePermission("manageBilling");
    const req = { isOwner: true, user: { uid: "owner-1", owner: true } };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(findOne).not.toHaveBeenCalled();
  });

  test("branch admin without explicit permissions is denied", async () => {
    lean.mockResolvedValue({ role: "branch_admin", permissions: undefined });
    const middleware = requirePermission("viewReports");
    const req = { user: { uid: "admin-1" } };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(findOne).toHaveBeenCalledWith({ firebaseUid: "admin-1" });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PERMISSIONS_NOT_CONFIGURED");
  });

  test("branch admin without required explicit permission is denied", async () => {
    lean.mockResolvedValue({
      role: "branch_admin",
      permissions: ["manageReservations"],
    });
    const middleware = requirePermission("manageBilling");
    const req = { user: { uid: "admin-2" } };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PERMISSION_DENIED");
  });

  test("requireAnyPermission passes when at least one permission matches", async () => {
    lean.mockResolvedValue({
      role: "branch_admin",
      permissions: ["manageUsers"],
    });
    const middleware = requireAnyPermission(["viewReports", "manageUsers"]);
    const req = { user: { uid: "admin-3" } };
    const res = createRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.body).toBeNull();
  });
});
