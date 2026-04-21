import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const auditLogModel = {
  getLogs: jest.fn(),
  getStats: jest.fn(),
  findOne: jest.fn(),
  getFailedLogins: jest.fn(),
  cleanupOldLogs: jest.fn(),
  log: jest.fn(),
};

const sendSuccess = jest.fn();

class MockAppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

await jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: auditLogModel,
}));

await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess,
  AppError: MockAppError,
}));

const {
  cleanupAuditLogs,
  exportAuditLogs,
  getAuditLogById,
  getAuditLogs,
} = await import("./auditController.js");

describe("auditController", () => {
  beforeEach(() => {
    auditLogModel.getLogs.mockReset();
    auditLogModel.getStats.mockReset();
    auditLogModel.findOne.mockReset();
    auditLogModel.getFailedLogins.mockReset();
    auditLogModel.cleanupOldLogs.mockReset();
    auditLogModel.log.mockReset();
    sendSuccess.mockReset();
  });

  test("getAuditLogs preserves pagination meta and branch-admin scope", async () => {
    auditLogModel.getLogs.mockResolvedValue({
      logs: [{ logId: "LOG-1" }],
      pagination: { total: 14, limit: 10, offset: 10, hasMore: false },
    });

    const req = {
      query: {
        type: "login",
        severity: "warning",
        role: "branch_admin",
        user: "admin@example.com",
        branch: "guadalupe",
        startDate: "2026-04-01T00:00:00.000Z",
        endDate: "2026-04-20T23:59:59.999Z",
        search: "failed",
        limit: "10",
        offset: "10",
      },
      branchFilter: "gil-puyat",
    };
    const res = {};
    const next = jest.fn();

    await getAuditLogs(req, res, next);

    expect(auditLogModel.getLogs).toHaveBeenCalledWith(
      {
        type: "login",
        severity: "warning",
        user: "admin@example.com",
        role: "branch_admin",
        branch: "gil-puyat",
        startDate: "2026-04-01T00:00:00.000Z",
        endDate: "2026-04-20T23:59:59.999Z",
        search: "failed",
      },
      { limit: 10, offset: 10 },
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      [{ logId: "LOG-1" }],
      200,
      { pagination: { total: 14, limit: 10, offset: 10, hasMore: false } },
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("getAuditLogById stays branch-scoped for branch admins", async () => {
    const lean = jest.fn().mockResolvedValue({ logId: "LOG-2", branch: "gil-puyat" });
    auditLogModel.findOne.mockReturnValue({ lean });

    const req = {
      params: { id: "LOG-2" },
      branchFilter: "gil-puyat",
    };
    const res = {};
    const next = jest.fn();

    await getAuditLogById(req, res, next);

    expect(auditLogModel.findOne).toHaveBeenCalledWith({
      logId: "LOG-2",
      branch: "gil-puyat",
    });
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      { logId: "LOG-2", branch: "gil-puyat" },
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("exportAuditLogs keeps branch-admin exports branch-scoped", async () => {
    auditLogModel.getLogs.mockResolvedValue({
      logs: [{ logId: "LOG-3" }],
      pagination: { total: 1, limit: 10000, offset: 0, hasMore: false },
    });

    const res = {
      setHeader: jest.fn(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await exportAuditLogs(
      {
        body: {
          filters: {
            branch: "guadalupe",
            search: "cleanup",
          },
        },
        branchFilter: "gil-puyat",
        user: { email: "admin@example.com" },
      },
      res,
      next,
    );

    expect(auditLogModel.getLogs).toHaveBeenCalledWith(
      {
        branch: "gil-puyat",
        search: "cleanup",
      },
      { limit: 10000, offset: 0 },
    );
    expect(res.setHeader).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        exportedBy: "admin@example.com",
        totalRecords: 1,
        logs: [{ logId: "LOG-3" }],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("cleanupAuditLogs rejects retention windows below 30 days", async () => {
    const next = jest.fn();

    await cleanupAuditLogs(
      {
        query: { daysToKeep: "14" },
      },
      {},
      next,
    );

    expect(auditLogModel.cleanupOldLogs).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INVALID_RETENTION",
        statusCode: 400,
      }),
    );
  });
});
