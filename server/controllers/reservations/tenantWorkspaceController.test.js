import { describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";

const mockAdminUser = {
  _id: new mongoose.Types.ObjectId(),
  firebaseUid: "admin-uid-123",
  role: "owner",
  branch: "gil-puyat",
  firstName: "Admin",
  lastName: "User",
  save: jest.fn().mockResolvedValue(true),
};

const mockTenantUser = {
  _id: new mongoose.Types.ObjectId(),
  firebaseUid: "tenant-uid-456",
  role: "tenant",
  tenantStatus: "active",
  branch: "gil-puyat",
  firstName: "Juan",
  lastName: "Dela Cruz",
  email: "juan@example.com",
  phone: "09171234567",
  save: jest.fn().mockResolvedValue(true),
};

const mockReservationId = new mongoose.Types.ObjectId();
const mockTenantId = new mongoose.Types.ObjectId();
const mockRoomId = new mongoose.Types.ObjectId();

const mockReservation = {
  _id: mockReservationId,
  status: "moveIn",
  moveInDate: new Date("2026-01-01"),
  moveOutDate: new Date("2026-07-01"),
  targetMoveInDate: new Date("2026-01-01"),
  userId: {
    _id: mockTenantId,
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.com",
    phone: "09171234567",
    role: "tenant",
    tenantStatus: "active",
  },
  roomId: {
    _id: mockRoomId,
    name: "Room 101",
    roomNumber: "101",
    branch: "gil-puyat",
    type: "quad",
  },
  selectedBed: {
    id: "bed-1",
    bedNumber: "Bed A",
  },
  stayDurationMonths: 6,
  paymentStatus: "paid",
  monthlyRent: 5000,
};

const mockViolation = {
  _id: new mongoose.Types.ObjectId(),
  reservationId: mockReservationId,
  tenantId: mockTenantId,
  violationType: "noise",
  status: "confirmed",
  penaltyApplied: 500,
  dateOfIncident: new Date(),
  createdAt: new Date(),
};

const mockBill = {
  _id: new mongoose.Types.ObjectId(),
  reservationId: mockReservationId,
  billType: "rent",
  status: "paid",
  totalAmount: 5000,
  amountPaid: 5000,
  balance: 0,
  isArchived: false,
};

const mockStay = {
  _id: new mongoose.Types.ObjectId(),
  reservationId: mockReservationId,
  tenantId: mockTenantId,
  roomId: mockRoomId,
  bedId: "bed-1",
  status: "active",
  leaseStartDate: new Date("2026-01-01"),
  leaseEndDate: new Date("2026-07-01"),
};

const mockContract = {
  _id: new mongoose.Types.ObjectId(),
  reservationId: mockReservationId,
  tenantId: mockTenantId,
  status: "active",
  version: 1,
};

const mockBedHistory = {
  _id: new mongoose.Types.ObjectId(),
  reservationId: mockReservationId,
  tenantId: mockTenantId,
  roomId: mockRoomId,
  moveInDate: new Date("2026-01-01"),
};

const mockRoom = {
  _id: mockRoomId,
  branch: "gil-puyat",
  beds: [
    { _id: "bed-1", status: "occupied" },
    { _id: "bed-2", status: "available" },
  ],
  isArchived: false,
};

await jest.unstable_mockModule("../../models/index.js", () => ({
  Reservation: {
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockReservation]),
    })),
    findById: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockReservation),
    })),
    findOne: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockReservation),
    })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
  User: {
    findOne: jest.fn(({ firebaseUid } = {}) => {
      if (firebaseUid === "admin-uid-123") return Promise.resolve(mockAdminUser);
      return Promise.resolve(mockTenantUser);
    }),
    findById: jest.fn((id) => {
      if (String(id) === String(mockAdminUser._id)) return Promise.resolve(mockAdminUser);
      return Promise.resolve(mockTenantUser);
    }),
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockTenantUser]),
    })),
  },
  Room: {
    find: jest.fn(() => ({
      distinct: jest.fn().mockResolvedValue([mockRoomId]),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockRoom]),
    })),
    findById: jest.fn().mockResolvedValue(mockRoom),
  },
  Bill: {
    find: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue([mockBill]),
    })),
  },
  BedHistory: {
    find: jest.fn(() => ({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockBedHistory]),
    })),
  },
  Stay: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockStay]),
    })),
  },
  Contract: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockContract]),
    })),
  },
  ContractAcknowledgement: {
    countDocuments: jest.fn(() => ({ session: jest.fn().mockResolvedValue(0) })),
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    create: jest.fn(),
  },
  TenantViolation: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockViolation]),
    })),
  },
  UtilityReading: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    })),
    findOne: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    })),
  },
  UtilityPeriod: {
    findOne: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    })),
  },
  // tenantActionService (reached via _helpers) now imports UtilityFinalization
  // (round-3). The workspace endpoints never touch it — an empty stub suffices.
  UtilityFinalization: {
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
  Payment: {},
  TenantCredit: { find: jest.fn(() => ({ sort: jest.fn().mockReturnThis(), session: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })), findOne: jest.fn(() => ({ session: jest.fn().mockResolvedValue(null) })), create: jest.fn() },
  AuditLog: { create: jest.fn() },
  VisitAvailability: { findOne: jest.fn(), create: jest.fn() },
  VisitAvailabilityHistory: { create: jest.fn().mockResolvedValue({}) },
  VisitConflictLog: { create: jest.fn().mockResolvedValue({}) },
  LeaseRenewal: {},
  ContractCounter: {},
  BedCheckoutLock: {},
  Inquiry: {},
  MeterReading: {},
  BillingPeriod: {},
  BillingResult: {},
  Announcement: {},
  MaintenanceRequest: {},
  Notification: {},
  LoginLog: {},
  UserSession: {},
  AcknowledgmentAccount: {},
  BusinessSettings: {},
  Appliance: {},
  ChatConversation: {},
  ChatMessage: {},
  WaterBillingRecord: {},
  BackupConfig: {},
  BackupRecord: {},
  ServiceProvider: {},
  OverdueNotice: {},
  TerminationReview: {},
  BillingDispute: {},
  MoveOutClearance: {},
  PaymongoWebhookEvent: {},
  // The detail endpoint resolves the Room Transfer History
  // (getRoomTransferHistoryForReservation -> ScheduledRoomTransfer.find).
  // No schedules for this fixture tenant -> empty history.
  ScheduledRoomTransfer: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    })),
    findOne: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    })),
  },
  ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
  INQUIRY_BRANCHES: ["gil-puyat", "guadalupe", "general"],
  ROOM_BRANCH_LABELS: {},
  isValidRoomBranch: () => true,
  isValidInquiryBranch: () => true,
  USER_ROLES: [],
  TENANT_STATUSES: [],
  INQUIRY_STATUSES: [],
  RESERVATION_STATUSES: [],
  INQUIRY_TAGS: [],
}));

await jest.unstable_mockModule("../../config/firebase.js", () => ({
  getAuth: () => ({
    setCustomUserClaims: jest.fn().mockResolvedValue(true),
    getUser: jest.fn().mockResolvedValue({ customClaims: {} }),
  }),
}));

const { buildWorkspaceEntries } = await import("./_helpers.js");
const { getTenantWorkspace, getTenantWorkspaceById, markTenantWorkspaceAsViewed } = await import(
  "./tenantWorkspaceController.js"
);

describe("Tenant Workspace Controller & Helpers", () => {
  it("buildWorkspaceEntries should properly populate entries without throwing ReferenceError for violations", async () => {
    const entries = await buildWorkspaceEntries([mockReservation], new Date());
    expect(entries).toBeDefined();
    expect(entries.length).toBe(1);
    expect(entries[0].tenantName).toBe("Juan Dela Cruz");
    expect(entries[0].room).toBe("Room 101");
    expect(Array.isArray(entries[0].warningFlags)).toBe(true);
    // Verify violation flag is included
    const violationFlag = entries[0].warningFlags.find(
      (f) => f.category === "violation"
    );
    expect(violationFlag).toBeDefined();
    expect(violationFlag.title).toContain("Active Violation");
  });

  it("getTenantWorkspace should return 200 with tenants list and stats", async () => {
    const req = {
      user: { uid: "admin-uid-123" },
      query: { branch: "gil-puyat" },
      id: "req-1",
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getTenantWorkspace(req, res);

    expect(res.json).toHaveBeenCalled();
    const responsePayload = res.json.mock.calls[0][0];
    expect(responsePayload.success).toBe(true);
    expect(responsePayload.data.tenants).toBeDefined();
    expect(responsePayload.data.stats).toBeDefined();
    expect(responsePayload.data.tenants.length).toBe(1);
  });

  it("getTenantWorkspaceById should return 200 with single tenant detail", async () => {
    const req = {
      user: { uid: "admin-uid-123" },
      params: { reservationId: String(mockReservationId) },
      id: "req-2",
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getTenantWorkspaceById(req, res);

    expect(res.json).toHaveBeenCalled();
    const responsePayload = res.json.mock.calls[0][0];
    expect(responsePayload.success).toBe(true);
    expect(responsePayload.data.tenantName).toBe("Juan Dela Cruz");
  });

  it("markTenantWorkspaceAsViewed should return 200 and stamp viewed timestamp", async () => {
    const req = {
      user: { uid: "admin-uid-123" },
      params: { reservationId: String(mockReservationId) },
      id: "req-3",
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await markTenantWorkspaceAsViewed(req, res);

    expect(res.json).toHaveBeenCalled();
    const responsePayload = res.json.mock.calls[0][0];
    expect(responsePayload.success).toBe(true);
    expect(responsePayload.data.lastAdminViewedAt).toBeDefined();
  });
});
