import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const roomFind = jest.fn();
const reservationCountDocuments = jest.fn();
const reservationFind = jest.fn();
const inquiryCountDocuments = jest.fn();
const inquiryFind = jest.fn();
const maintenanceCountDocuments = jest.fn();
const maintenanceFind = jest.fn();
const userCountDocuments = jest.fn();
const billAggregate = jest.fn();
const billFind = jest.fn();
const auditCountDocuments = jest.fn();
const auditFind = jest.fn();
const loginLogCountDocuments = jest.fn();
const loginLogFind = jest.fn();
const userSessionCountDocuments = jest.fn();
const getUserBranchInfo = jest.fn();
const getBranchOccupancyStats = jest.fn();
const sendSuccess = jest.fn();

const createLeanChain = (result) => {
  const chain = {
    select: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn(async () => result),
  };
  return chain;
};

await jest.unstable_mockModule("../models/index.js", () => ({
  AuditLog: {
    countDocuments: auditCountDocuments,
    find: auditFind,
  },
  Bill: {
    aggregate: billAggregate,
    find: billFind,
  },
  Inquiry: {
    countDocuments: inquiryCountDocuments,
    find: inquiryFind,
  },
  LoginLog: {
    countDocuments: loginLogCountDocuments,
    find: loginLogFind,
  },
  MaintenanceRequest: {
    countDocuments: maintenanceCountDocuments,
    find: maintenanceFind,
  },
  Reservation: {
    countDocuments: reservationCountDocuments,
    find: reservationFind,
  },
  Room: {
    find: roomFind,
  },
  User: {
    countDocuments: userCountDocuments,
  },
  UserSession: {
    countDocuments: userSessionCountDocuments,
  },
}));

await jest.unstable_mockModule("../middleware/branchAccess.js", () => ({
  getUserBranchInfo,
}));

await jest.unstable_mockModule("../utils/occupancyManager.js", () => ({
  getBranchOccupancyStats,
}));

await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  sendSuccess,
  AppError: class AppError extends Error {
    constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.isOperational = true;
    }
  },
}));

const {
  getAuditSummary,
  getAnalyticsInsights,
  getBillingReport,
  getDashboardAnalytics,
  getFinancialsReport,
  getOccupancyForecast,
  getOccupancyReport,
  getOperationsReport,
  getSystemPerformance,
} = await import("./analyticsController.js");

describe("analyticsController", () => {
  beforeEach(() => {
    roomFind.mockReset();
    reservationCountDocuments.mockReset();
    reservationFind.mockReset();
    inquiryCountDocuments.mockReset();
    inquiryFind.mockReset();
    maintenanceCountDocuments.mockReset();
    maintenanceFind.mockReset();
    userCountDocuments.mockReset();
    billAggregate.mockReset();
    auditCountDocuments.mockReset();
    billFind.mockReset();
    loginLogCountDocuments.mockReset();
    auditFind.mockReset();
    loginLogFind.mockReset();
    userSessionCountDocuments.mockReset();
    getUserBranchInfo.mockReset();
    getBranchOccupancyStats.mockReset();
    sendSuccess.mockReset();
  });

  test("forces branch admins into their assigned branch scope for dashboard analytics", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "branch_admin",
      branch: "gil-puyat",
      isOwner: false,
    });
    getBranchOccupancyStats.mockResolvedValue({
      branch: "gil-puyat",
      totalRooms: 4,
      totalCapacity: 20,
      totalOccupancy: 15,
      overallOccupancyRate: "75%",
    });
    roomFind.mockReturnValue(createLeanChain([{ _id: "room-1" }]));
    userCountDocuments.mockResolvedValue(12);
    maintenanceCountDocuments.mockResolvedValue(3);
    inquiryCountDocuments
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    billFind
      .mockReturnValueOnce(createLeanChain([]))
      .mockReturnValueOnce(createLeanChain([]));
    billAggregate
      .mockResolvedValueOnce([{ total: 42000 }])
      .mockResolvedValueOnce([{ total: 42000 }]);
    reservationCountDocuments
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    reservationFind.mockReturnValue(
      createLeanChain([
        {
          _id: "reservation-1",
          userId: { firstName: "Ana", lastName: "Dela Cruz" },
          roomId: { name: "Room A", branch: "gil-puyat", type: "private" },
          status: "reserved",
          createdAt: "2026-04-10T08:00:00.000Z",
          targetMoveInDate: null,
        },
      ]),
    );
    inquiryFind.mockReturnValue(
      createLeanChain([
        {
          _id: "inquiry-1",
          name: "Mark",
          email: "mark@example.com",
          branch: "gil-puyat",
          status: "pending",
          createdAt: "2026-04-11T08:00:00.000Z",
        },
      ]),
    );

    const req = { user: { uid: "firebase-admin-1" }, query: {} };
    const res = { req };

    await getDashboardAnalytics(req, res, jest.fn());

    expect(getBranchOccupancyStats).toHaveBeenCalledWith(
      "gil-puyat",
      { includeUserDetails: false },
    );
    expect(roomFind).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: { $in: ["gil-puyat"] },
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({
          role: "branch_admin",
          branch: "gil-puyat",
        }),
        kpis: expect.objectContaining({
          occupancyRate: 75,
          revenueCollected: 42000,
          activeTickets: 3,
          inquiries: 5,
        }),
      }),
    );
  });

  test("allows owners to aggregate all branches and emits branch comparison rows", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    getBranchOccupancyStats
      .mockResolvedValueOnce({
        branch: "all",
        totalRooms: 8,
        totalCapacity: 40,
        totalOccupancy: 30,
        overallOccupancyRate: "75%",
      })
      .mockResolvedValueOnce({
        branch: "gil-puyat",
        totalRooms: 4,
        totalCapacity: 20,
        totalOccupancy: 16,
        overallOccupancyRate: "80%",
      })
      .mockResolvedValueOnce({
        branch: "guadalupe",
        totalRooms: 4,
        totalCapacity: 20,
        totalOccupancy: 14,
        overallOccupancyRate: "70%",
      });
    roomFind.mockReturnValue(createLeanChain([{ _id: "room-1" }, { _id: "room-2" }]));
    userCountDocuments.mockResolvedValue(20);
    maintenanceCountDocuments
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    inquiryCountDocuments
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    billFind
      .mockReturnValueOnce(createLeanChain([]))
      .mockReturnValueOnce(createLeanChain([]));
    billAggregate
      .mockResolvedValueOnce([{ total: 81000 }])
      .mockResolvedValueOnce([{ total: 45000 }])
      .mockResolvedValueOnce([{ total: 36000 }]);
    reservationCountDocuments
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    reservationFind.mockReturnValue(createLeanChain([]));
    inquiryFind.mockReturnValue(createLeanChain([]));

    const req = { user: { uid: "firebase-owner-1" }, query: {} };
    const res = { req };

    await getDashboardAnalytics(req, res, jest.fn());

    expect(getBranchOccupancyStats).toHaveBeenCalledWith(
      null,
      { includeUserDetails: false },
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({
          role: "owner",
          branch: "all",
          branchesIncluded: ["gil-puyat", "guadalupe"],
        }),
        branchComparison: expect.arrayContaining([
          expect.objectContaining({ branch: "gil-puyat", occupancyRate: 80, overdueAmount: 0 }),
          expect.objectContaining({ branch: "guadalupe", occupancyRate: 70, overdueAmount: 0 }),
        ]),
      }),
    );
  });

  test("builds an occupancy report with forced branch scope for branch admins", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "branch_admin",
      branch: "guadalupe",
      isOwner: false,
    });
    roomFind
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "room-1",
            name: "Room One",
            roomNumber: "101",
            branch: "guadalupe",
            type: "private",
            floor: 1,
            capacity: 1,
            currentOccupancy: 1,
            available: true,
            beds: [{ status: "occupied" }],
          },
        ]),
      );
    reservationFind.mockReturnValue(createLeanChain([]));

    const req = { user: { uid: "firebase-admin-2" }, query: { branch: "gil-puyat", range: "30d" } };
    const res = { req };

    await getOccupancyReport(req, res, jest.fn());

    expect(roomFind).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: { $in: ["guadalupe"] },
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({ branch: "guadalupe" }),
        kpis: expect.objectContaining({
          totalRooms: 1,
          occupiedBeds: 1,
          occupancyRate: 100,
        }),
        tables: expect.objectContaining({
          inventory: expect.objectContaining({
            rows: expect.arrayContaining([
              expect.objectContaining({ roomNumber: "101", roomTypeLabel: "Private" }),
            ]),
            pagination: expect.objectContaining({ total: 1 }),
          }),
        }),
      }),
    );
  });

  test("paginates and sorts occupancy table rows from query parameters", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "branch_admin",
      branch: "gil-puyat",
      isOwner: false,
    });
    roomFind.mockReturnValueOnce(
      createLeanChain([
        {
          _id: "room-101",
          name: "Room 101",
          roomNumber: "101",
          branch: "gil-puyat",
          type: "private",
          capacity: 1,
          currentOccupancy: 1,
          beds: [],
        },
        {
          _id: "room-103",
          name: "Room 103",
          roomNumber: "103",
          branch: "gil-puyat",
          type: "private",
          capacity: 1,
          currentOccupancy: 0,
          beds: [],
        },
      ]),
    );
    reservationFind.mockReturnValue(createLeanChain([]));

    const req = {
      user: { uid: "firebase-admin-table" },
      query: {
        range: "30d",
        tableLimit: "1",
        tableOffset: "1",
        tableSort: "roomNumber",
        tableDirection: "desc",
      },
    };
    const res = { req };

    await getOccupancyReport(req, res, jest.fn());

    const [, payload] = sendSuccess.mock.calls.at(-1);
    expect(payload.tables.inventory).toEqual(
      expect.objectContaining({
        rows: [expect.objectContaining({ roomNumber: "101" })],
        pagination: expect.objectContaining({
          total: 2,
          limit: 1,
          offset: 1,
          sort: "roomNumber",
          direction: "desc",
          hasMore: false,
        }),
      }),
    );
  });

  test("returns billing report tables for the owner-selected branch", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    billFind
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-1",
            userId: { firstName: "Aira", lastName: "Lopez" },
            roomId: { name: "Room B" },
            branch: "guadalupe",
            status: "paid",
            billingMonth: "2026-03-01T00:00:00.000Z",
            dueDate: "2026-03-05T00:00:00.000Z",
            totalAmount: 12000,
            paidAmount: 12000,
            paymentDate: "2026-03-03T00:00:00.000Z",
            remainingAmount: 0,
          },
        ]),
      )
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-2",
            userId: { firstName: "Mika", lastName: "Cruz" },
            roomId: { roomNumber: "202" },
            branch: "guadalupe",
            status: "overdue",
            billingMonth: "2026-02-01T00:00:00.000Z",
            dueDate: "2026-02-10T00:00:00.000Z",
            totalAmount: 13500,
            paidAmount: 3000,
            remainingAmount: 10500,
          },
        ]),
      );

    const req = { user: { uid: "firebase-owner-2" }, query: { branch: "guadalupe", range: "3m" } };
    const res = { req };

    await getBillingReport(req, res, jest.fn());

    expect(billFind).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        branch: { $in: ["guadalupe"] },
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({ branch: "guadalupe" }),
        tables: expect.objectContaining({
          overdueAccounts: expect.objectContaining({
            rows: expect.arrayContaining([
              expect.objectContaining({
                tenantName: "Mika Cruz",
                balance: 10500,
              }),
            ]),
            pagination: expect.objectContaining({ total: 1 }),
          }),
        }),
      }),
    );
  });

  test("returns operations report payload with reservation and maintenance series", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "branch_admin",
      branch: "gil-puyat",
      isOwner: false,
    });
    roomFind.mockReturnValue(createLeanChain([{ _id: "room-1", branch: "gil-puyat", type: "private" }]));
    reservationFind.mockReturnValue(
      createLeanChain([
        {
          _id: "reservation-2",
          reservationCode: "RES-001",
          userId: { firstName: "Ana", lastName: "Reyes" },
          roomId: { name: "Room A", branch: "gil-puyat" },
          status: "reserved",
          createdAt: "2026-04-01T08:00:00.000Z",
          moveInDate: "2026-04-05T08:00:00.000Z",
        },
      ]),
    );
    inquiryFind.mockReturnValue(
      createLeanChain([
        {
          _id: "inquiry-1",
          createdAt: "2026-04-02T09:00:00.000Z",
          branch: "gil-puyat",
        },
      ]),
    );
    maintenanceFind
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "maint-1",
            request_id: "maint_1",
            request_type: "electrical",
            urgency: "high",
            status: "in_progress",
            branch: "gil-puyat",
            created_at: "2026-04-03T08:00:00.000Z",
            resolved_at: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "maint-2",
            request_id: "maint_2",
            request_type: "plumbing",
            urgency: "normal",
            status: "resolved",
            branch: "gil-puyat",
            created_at: "2026-04-01T08:00:00.000Z",
            resolved_at: "2026-04-02T08:00:00.000Z",
          },
        ]),
      );

    const req = { user: { uid: "firebase-admin-3" }, query: { range: "30d" } };
    const res = { req };

    await getOperationsReport(req, res, jest.fn());

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({ branch: "gil-puyat" }),
        kpis: expect.objectContaining({
          reservations: 1,
          inquiries: 1,
          maintenanceRequests: 1,
        }),
        series: expect.objectContaining({
          reservationsByPeriod: expect.any(Array),
          maintenanceByType: expect.arrayContaining([
            expect.objectContaining({ type: "electrical", count: 1 }),
          ]),
        }),
      }),
    );
  });

  test("returns owner financial analytics with branch comparison data", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    billFind
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-a",
            branch: "gil-puyat",
            totalAmount: 12000,
            paidAmount: 12000,
            billingMonth: "2026-03-01T00:00:00.000Z",
            paymentDate: "2026-03-03T00:00:00.000Z",
            roomId: { name: "Room 101", _id: "room-a" },
          },
          {
            _id: "bill-b",
            branch: "guadalupe",
            totalAmount: 9000,
            paidAmount: 6000,
            billingMonth: "2026-03-01T00:00:00.000Z",
            paymentDate: "2026-03-05T00:00:00.000Z",
            roomId: { name: "Room 201", _id: "room-b" },
          },
        ]),
      )
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-c",
            branch: "guadalupe",
            status: "overdue",
            totalAmount: 9000,
            paidAmount: 6000,
            remainingAmount: 3000,
            dueDate: "2026-03-10T00:00:00.000Z",
            roomId: { name: "Room 201", _id: "room-b" },
          },
        ]),
      );

    const req = { user: { uid: "owner-3", owner: true }, query: { range: "3m" } };
    const res = { req };

    await getFinancialsReport(req, res, jest.fn());

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        kpis: expect.objectContaining({
          collectedRevenue: 18000,
          outstandingBalance: 3000,
        }),
        series: expect.objectContaining({
          branchComparison: expect.arrayContaining([
            expect.objectContaining({ branch: "gil-puyat", collectedRevenue: 12000 }),
            expect.objectContaining({ branch: "guadalupe", overdueAmount: 3000 }),
          ]),
        }),
      }),
    );
  });

  test("returns owner audit summary with suspicious IP rows", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    auditFind.mockReturnValue(
      createLeanChain([
        {
          logId: "LOG-1",
          branch: "gil-puyat",
          type: "error",
          action: "Permission override approved",
          severity: "critical",
          user: "owner@example.com",
          timestamp: "2026-04-10T08:00:00.000Z",
          details: "override performed",
        },
        {
          logId: "LOG-2",
          branch: "guadalupe",
          type: "login",
          action: "Multiple failed logins detected",
          severity: "warning",
          user: "user@example.com",
          timestamp: "2026-04-10T09:00:00.000Z",
          details: "warning",
        },
      ]),
    );
    loginLogFind.mockReturnValue(
      createLeanChain([
        {
          email: "attacker@example.com",
          ipAddress: "203.0.113.10",
          createdAt: "2026-04-10T07:00:00.000Z",
          success: false,
        },
        {
          email: "attacker@example.com",
          ipAddress: "203.0.113.10",
          createdAt: "2026-04-10T07:10:00.000Z",
          success: false,
        },
        {
          email: "attacker@example.com",
          ipAddress: "203.0.113.10",
          createdAt: "2026-04-10T07:20:00.000Z",
          success: false,
        },
      ]),
    );

    const req = { user: { uid: "owner-4", owner: true }, query: { range: "30d" } };
    const res = { req };

    await getAuditSummary(req, res, jest.fn());

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        kpis: expect.objectContaining({
          failedLogins: 3,
          suspiciousIpCount: 1,
          accessOverrides: 1,
          criticalEvents: 1,
        }),
        tables: expect.objectContaining({
          suspiciousIps: expect.arrayContaining([
            expect.objectContaining({ ipAddress: "203.0.113.10", attempts: 3 }),
          ]),
          recentSecurityEvents: expect.objectContaining({
            rows: expect.any(Array),
            pagination: expect.objectContaining({ total: 2 }),
          }),
        }),
      }),
    );
  });

  test("returns owner system performance metrics", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    userSessionCountDocuments.mockResolvedValue(7);
    loginLogCountDocuments.mockResolvedValue(3);
    auditCountDocuments.mockResolvedValue(2);

    const req = { user: { uid: "owner-performance" }, query: {} };
    const res = { req };

    await getSystemPerformance(req, res, jest.fn());

    expect(userSessionCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        scope: expect.objectContaining({
          role: "owner",
        }),
        kpis: expect.objectContaining({
          activeSessions: 7,
          failedLogins24h: 3,
          highSeverityAudit24h: 2,
          serviceStatus: expect.any(String),
          databaseStatus: expect.any(String),
        }),
        checks: expect.objectContaining({
          api: expect.objectContaining({ status: "ok" }),
          database: expect.objectContaining({ readyState: expect.any(Number) }),
        }),
      }),
    );
  });

  test("builds AI insights from a sanitized billing snapshot", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    billFind
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-a",
            branch: "gil-puyat",
            status: "paid",
            totalAmount: 10000,
            paidAmount: 8000,
            remainingAmount: 2000,
            billingMonth: "2026-03-01T00:00:00.000Z",
            paymentDate: "2026-03-12T00:00:00.000Z",
            dueDate: "2026-03-10T00:00:00.000Z",
            userId: { firstName: "Ana", lastName: "Dela Cruz", email: "ana@example.com" },
            roomId: { name: "Room 101", branch: "gil-puyat" },
          },
        ]),
      )
      .mockReturnValueOnce(
        createLeanChain([
          {
            _id: "bill-b",
            branch: "gil-puyat",
            status: "overdue",
            totalAmount: 9000,
            paidAmount: 4000,
            remainingAmount: 5000,
            dueDate: "2026-03-05T00:00:00.000Z",
            userId: { firstName: "Mia", lastName: "Santos", email: "mia@example.com" },
            roomId: { name: "Room 102", branch: "gil-puyat" },
          },
        ]),
      );

    const req = {
      user: { uid: "owner-ai-1", owner: true },
      query: {},
      body: {
        reportType: "billing",
        range: "3m",
        question: "Why is cash collection slowing?",
      },
    };
    const res = { req };

    const next = jest.fn();
    await getAnalyticsInsights(req, res, next);

    expect(next).not.toHaveBeenCalled();

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        snapshotMeta: expect.objectContaining({
          reportType: "billing",
          provider: "heuristic-fallback",
          usedFallback: true,
        }),
        insight: expect.objectContaining({
          headline: expect.any(String),
          summary: expect.stringContaining("You asked"),
          keyFindings: expect.any(Array),
          recommendedActions: expect.any(Array),
          disclaimer: expect.stringContaining("AI summary"),
        }),
      }),
    );

    const [, payload] = sendSuccess.mock.calls.at(-1);
    expect(JSON.stringify(payload.snapshotMeta)).not.toContain("ana@example.com");
    expect(JSON.stringify(payload.snapshotMeta)).not.toContain("mia@example.com");
  });

  test("returns deterministic occupancy forecast when enough history exists", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "branch_admin",
      branch: "gil-puyat",
      isOwner: false,
    });
    roomFind.mockReturnValue(
      createLeanChain([
        { _id: "room-1", branch: "gil-puyat", type: "private", capacity: 2 },
      ]),
    );
    reservationFind.mockReturnValue(
      createLeanChain([
        {
          _id: "res-1",
          roomId: { _id: "room-1", branch: "gil-puyat", type: "private" },
          status: "reserved",
          createdAt: "2025-11-01T08:00:00.000Z",
          moveInDate: "2025-11-05T08:00:00.000Z",
          moveOutDate: "2025-12-20T08:00:00.000Z",
        },
        {
          _id: "res-2",
          roomId: { _id: "room-1", branch: "gil-puyat", type: "private" },
          status: "moveIn",
          createdAt: "2025-12-01T08:00:00.000Z",
          moveInDate: "2025-12-05T08:00:00.000Z",
          moveOutDate: "2026-01-20T08:00:00.000Z",
        },
        {
          _id: "res-3",
          roomId: { _id: "room-1", branch: "gil-puyat", type: "private" },
          status: "moveIn",
          createdAt: "2026-01-01T08:00:00.000Z",
          moveInDate: "2026-01-05T08:00:00.000Z",
          moveOutDate: "2026-02-20T08:00:00.000Z",
        },
        {
          _id: "res-4",
          roomId: { _id: "room-1", branch: "gil-puyat", type: "private" },
          status: "moveIn",
          createdAt: "2026-02-01T08:00:00.000Z",
          moveInDate: "2026-02-05T08:00:00.000Z",
          moveOutDate: "2026-03-20T08:00:00.000Z",
        },
      ]),
    );

    const req = { user: { uid: "firebase-admin-forecast" }, query: { months: "3" } };
    const res = { req };

    await getOccupancyForecast(req, res, jest.fn());

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        forecast: expect.objectContaining({
          sufficientHistory: true,
          projected: expect.arrayContaining([
            expect.objectContaining({
              projectedOccupancyRate: expect.any(Number),
              baselineRate: expect.any(Number),
            }),
          ]),
        }),
      }),
    );
  });

  test("returns insufficient history state for occupancy forecast when history is too thin", async () => {
    getUserBranchInfo.mockResolvedValue({
      role: "owner",
      branch: "gil-puyat",
      isOwner: true,
    });
    roomFind.mockReturnValue(
      createLeanChain([
        { _id: "room-1", branch: "gil-puyat", type: "private", capacity: 2 },
      ]),
    );
    reservationFind.mockReturnValue(
      createLeanChain([
        {
          _id: "res-x",
          roomId: { _id: "room-1", branch: "gil-puyat", type: "private" },
          status: "reserved",
          createdAt: "2026-03-01T08:00:00.000Z",
          moveInDate: "2026-03-05T08:00:00.000Z",
        },
      ]),
    );

    const req = { user: { uid: "firebase-owner-forecast", owner: true }, query: { months: "3", branch: "all" } };
    const res = { req };

    await getOccupancyForecast(req, res, jest.fn());

    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        forecast: expect.objectContaining({
          sufficientHistory: false,
          requiredHistoryMonths: 4,
          projected: [],
        }),
      }),
    );
  });
});
