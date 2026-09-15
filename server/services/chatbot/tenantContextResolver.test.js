import mongoose from "mongoose";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFindOne = jest.fn();
const reservationFindOne = jest.fn();
const billFind = jest.fn();
const stayFindOne = jest.fn();
const maintenanceFind = jest.fn();
const conversationFind = jest.fn();
const buildAnnouncementTenantContext = jest.fn();
const canTenantViewAnnouncement = jest.fn();
const resolveTenantCanonicalContract = jest.fn();
const toMobileBill = jest.fn();
const toTenantContractView = jest.fn();

function queryResult(value) {
  const query = {
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    populate: jest.fn(() => query),
    limit: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(value)),
  };
  return query;
}

await jest.unstable_mockModule("../../models/User.js", () => ({
  default: { findOne: userFindOne },
}));
await jest.unstable_mockModule("../../models/Reservation.js", () => ({
  default: { findOne: reservationFindOne },
}));
await jest.unstable_mockModule("../../models/Bill.js", () => ({
  default: { find: billFind },
}));
await jest.unstable_mockModule("../../models/Stay.js", () => ({
  default: { findOne: stayFindOne },
}));
await jest.unstable_mockModule("../../models/MaintenanceRequest.js", () => ({
  default: { find: maintenanceFind },
}));
await jest.unstable_mockModule("../../models/ChatConversation.js", () => ({
  default: { find: conversationFind },
}));
await jest.unstable_mockModule("../../mobile/services/announcementAudience.service.js", () => ({
  default: {
    PRESENT_STAY_STATUSES: ["active", "ending_soon", "expired_occupancy_continuing"],
    buildTenantContext: buildAnnouncementTenantContext,
    canTenantViewAnnouncement,
  },
}));
await jest.unstable_mockModule("../mobileBillingBridge.js", () => ({
  toMobileBill,
}));
await jest.unstable_mockModule("../tenantContractSelectionService.js", () => ({
  resolveTenantCanonicalContract,
}));
await jest.unstable_mockModule("../tenantContractViewService.js", () => ({
  toTenantContractView,
}));

const {
  buildNeutralContext,
  resolveTenantAIContext,
} = await import("./tenantContextResolver.js");

describe("canonical Lily tenant context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("active occupancy overrides stale move-in/profile state and all domain snapshots use canonical owners", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const attackerSuppliedTenantId = new mongoose.Types.ObjectId();
    const now = new Date("2026-08-17T08:00:00Z");
    const user = {
      _id: tenantId,
      user_id: "tenant-firebase-id",
      firstName: "Ava",
      lastName: "Guest",
      email: "ava@example.com",
      branch: "guadalupe",
    };
    const activeStay = {
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      branch: "gil-puyat",
      status: "active",
      leaseStartDate: new Date("2026-08-13T00:00:00Z"),
      bedCode: "A-L",
      roomId: { _id: new mongoose.Types.ObjectId(), roomNumber: "GP-202", branch: "gil-puyat" },
    };
    const reservation = {
      userId: tenantId,
      status: "moveIn",
      moveInDate: new Date("2026-08-13T00:00:00Z"),
      roomId: { roomNumber: "GP-202", branch: "gil-puyat" },
      selectedBed: { id: "stale-bed" },
    };
    const currentBill = {
      _id: "current-bill",
      status: "pending",
      isArchived: false,
      billType: "monthly",
      billingCycleStart: new Date("2026-08-01T00:00:00Z"),
      billingCycleEnd: new Date("2026-09-01T00:00:00Z"),
      billingMonth: new Date("2026-08-01T00:00:00Z"),
      charges: {},
    };
    const futureDraft = {
      _id: "future-draft",
      status: "draft",
      isArchived: false,
      billType: "monthly",
      billingCycleStart: new Date("2026-09-01T00:00:00Z"),
      billingCycleEnd: new Date("2026-10-01T00:00:00Z"),
      dueDate: new Date("2026-09-23T00:00:00Z"),
    };
    const contract = { _id: "contract-1", status: "generated" };
    const conversations = [{
      _id: "conversation-1",
      category: "maintenance_concern",
      priority: "high",
      status: "resolved",
      lastMessage: "Repair completed.",
    }];
    const announcements = [
      { _id: "global", title: "Global", targetBranch: "both" },
      { _id: "gil", title: "Gil Notice", targetBranch: "gil-puyat" },
      { _id: "gua", title: "Guadalupe Notice", targetBranch: "guadalupe" },
    ];

    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(activeStay));
    reservationFindOne.mockReturnValue(queryResult(reservation));
    billFind.mockReturnValue(queryResult([futureDraft, currentBill]));
    maintenanceFind.mockReturnValue(queryResult([]));
    conversationFind.mockReturnValue(queryResult(conversations));
    buildAnnouncementTenantContext.mockResolvedValue({
      authenticated: true,
      mongoId: tenantId,
      userId: user.user_id,
      branch: "gil-puyat",
      branchSource: "stay",
    });
    canTenantViewAnnouncement.mockImplementation(({ announcement, tenantContext }) => (
      announcement.targetBranch === "both"
      || announcement.targetBranch === tenantContext.branch
    ));
    resolveTenantCanonicalContract.mockResolvedValue(contract);
    toTenantContractView.mockReturnValue({
      id: "contract-1",
      contractNumber: "CTR-1",
      status: "generated",
      displayStatus: "Prepared Contract Available",
      leaseStartDate: new Date("2026-08-13T00:00:00Z"),
      leaseEndDate: new Date("2027-08-13T00:00:00Z"),
      daysRemaining: 361,
      approvedMonthlyRate: 5400,
      securityDepositAmount: 5400,
      roomNumber: "GP-202",
      bedLabel: "A-L",
      roomType: "quadruple-sharing",
      tenantDocument: { available: true, version: 2, label: "Prepared Contract" },
    });
    toMobileBill.mockImplementation((bill) => ({
      billing_id: String(bill._id),
      billing_period: "August 2026",
      total: 7200,
      remaining_amount: 7200,
      paid_amount: 0,
      rent: 5400,
      electricity: 1800,
      water: 0,
      status: "unpaid",
      status_label: "Unpaid",
      due_date: new Date("2026-08-23T00:00:00Z"),
      release_date: new Date("2026-08-16T00:00:00Z"),
      utility_deadlines: { electricity: { billReleaseDate: new Date("2026-08-16T00:00:00Z") } },
    }));

    const announcementCursor = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn(async () => announcements),
    };
    const db = {
      collection: jest.fn((name) => {
        if (name === "announcements") return { find: jest.fn(() => announcementCursor) };
        throw new Error(`unexpected collection: ${name}`);
      }),
    };

    const context = await resolveTenantAIContext(attackerSuppliedTenantId, user, { db, now });

    expect(context).toMatchObject({
      branch: "Gil Puyat",
      branchRaw: "gil-puyat",
      branchSource: "stay",
      roomNumber: "GP-202",
      bedPosition: "A-L",
      tenancy: {
        status: "active",
        isCurrentResident: true,
        scheduledMoveInDate: null,
      },
      currentBill: {
        billId: "current-bill",
        status: "unpaid",
        utilityReleased: true,
      },
      contract: {
        contractId: "contract-1",
        tenantDocument: { available: true, version: 2 },
      },
      inquiries: [{
        conversationId: "conversation-1",
        status: "resolved",
      }],
    });
    expect(context.recentAnnouncements.map((item) => item.title)).toEqual([
      "Global",
      "Gil Notice",
    ]);
    expect(toMobileBill).toHaveBeenCalledWith(currentBill);
    expect(toMobileBill).not.toHaveBeenCalledWith(futureDraft);
    expect(billFind).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ userId: tenantId }, { tenantId }],
      status: { $ne: "draft" },
      isArchived: false,
    }));
    expect(resolveTenantCanonicalContract).toHaveBeenCalledWith(
      tenantId,
      { includeEarlyStages: true },
    );
    const userQuery = userFindOne.mock.calls[0][0];
    expect(userQuery.$or).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: user.user_id }),
    ]));
    expect(String(userQuery.$or.find((clause) => clause._id)?._id)).toBe(String(tenantId));
    expect(stayFindOne).toHaveBeenCalledWith(expect.objectContaining({ tenantId }));
    expect(reservationFindOne).toHaveBeenCalledWith(expect.objectContaining({ userId: tenantId }));
    expect(billFind).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ userId: tenantId }, { tenantId }],
    }));
    expect(maintenanceFind).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([expect.objectContaining({ userId: tenantId })]),
    }));
    expect(conversationFind).toHaveBeenCalledWith({ tenantId });
    for (const mock of [userFindOne, stayFindOne, reservationFindOne, billFind, maintenanceFind, conversationFind]) {
      expect(JSON.stringify(mock.mock.calls)).not.toContain(String(attackerSuppliedTenantId));
    }
  });

  test("loads only the canonical domains needed for the request", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = {
      _id: tenantId,
      user_id: "tenant-domain-test",
      firstName: "Domain",
      lastName: "Test",
    };
    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(null));
    reservationFindOne.mockReturnValue(queryResult(null));
    billFind.mockReturnValue(queryResult([]));
    buildAnnouncementTenantContext.mockResolvedValue({ authenticated: true, mongoId: tenantId });

    const db = { collection: jest.fn() };
    await resolveTenantAIContext(tenantId, user, { db, domains: ["billing"] });

    expect(billFind).toHaveBeenCalled();
    expect(resolveTenantCanonicalContract).not.toHaveBeenCalled();
    expect(maintenanceFind).not.toHaveBeenCalled();
    expect(conversationFind).not.toHaveBeenCalled();
    expect(db.collection).not.toHaveBeenCalledWith("announcements");
  });

  test("moved-in tenant with moveIn reservation and null Stay is correctly identified as active tenant", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = {
      _id: tenantId,
      user_id: "tenant-moved-in",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
      firstName: "Maria",
      lastName: "Santos",
    };
    const reservation = {
      userId: tenantId,
      status: "moveIn",
      branch: "gil-puyat",
      roomNumber: "GP-301",
      selectedBed: { position: "Bed A" },
      confirmedMoveInDate: new Date("2026-08-01T00:00:00Z"),
    };

    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(null));
    reservationFindOne.mockReturnValue(queryResult(reservation));
    billFind.mockReturnValue(queryResult([]));
    buildAnnouncementTenantContext.mockResolvedValue({ authenticated: true, mongoId: tenantId, branch: "gil-puyat" });

    const context = await resolveTenantAIContext(tenantId, user, { db: null });

    expect(context.isApplicant).toBe(false);
    expect(context.userRole).toBe("tenant");
    expect(context.tenancy.isCurrentResident).toBe(true);
    expect(context.tenancy.status).toBe("active");
    expect(context.roomNumber).toBe("GP-301");
    expect(context.bedPosition).toBe("Bed A");
    expect(context.branch).toBe("Gil Puyat");
  });

  test("applicant with reserved status and no active stay is correctly identified as applicant", async () => {
    const applicantId = new mongoose.Types.ObjectId();
    const user = {
      _id: applicantId,
      user_id: "applicant-1",
      role: "applicant",
      tenantStatus: "applicant",
      firstName: "John",
      lastName: "Doe",
    };
    const reservation = {
      userId: applicantId,
      status: "reserved",
      branch: "gil-puyat",
      roomNumber: "GP-102",
      selectedBed: { position: "Bed B" },
      moveInDate: new Date("2026-09-01T00:00:00Z"),
    };

    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(null));
    reservationFindOne.mockReturnValue(queryResult(reservation));
    billFind.mockReturnValue(queryResult([]));
    buildAnnouncementTenantContext.mockResolvedValue({ authenticated: true, mongoId: applicantId });

    const context = await resolveTenantAIContext(applicantId, user, { db: null });

    expect(context.isApplicant).toBe(true);
    expect(context.userRole).toBe("applicant");
    expect(context.tenancy.isCurrentResident).toBe(false);
    expect(context.tenancy.status).toBe("reserved");
  });

  test("resolves billing summary, unpaid bills with penalties, and active unpaid bill when penalty exists", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = {
      _id: tenantId,
      user_id: "tenant-penalty-user",
      role: "tenant",
      tenantStatus: "active",
      firstName: "Maria",
      lastName: "Clara",
      email: "maria@example.com",
    };

    const paidCycleBill = {
      _id: "paid-cycle-bill",
      userId: tenantId,
      status: "paid",
      isArchived: false,
      billType: "monthly",
      remainingAmount: 0,
      totalAmount: 6000,
      charges: { rent: 6000, penalty: 0 },
    };

    const unpaidPenaltyBill = {
      _id: "unpaid-penalty-bill",
      userId: tenantId,
      status: "pending",
      isArchived: false,
      billType: "penalty",
      remainingAmount: 50000,
      totalAmount: 50000,
      charges: { penalty: 50000 },
      penaltyDetails: { description: "Late payment fee" },
    };

    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(null));
    reservationFindOne.mockReturnValue(queryResult(null));
    billFind.mockReturnValue(queryResult([paidCycleBill, unpaidPenaltyBill]));
    buildAnnouncementTenantContext.mockResolvedValue({
      authenticated: true,
      mongoId: tenantId,
      branch: "gil-puyat",
    });
    toMobileBill.mockImplementation((bill) => ({
      billing_id: String(bill._id),
      billing_period: "September 2026",
      total: bill.totalAmount,
      remaining_amount: bill.remainingAmount,
      paid_amount: (bill.totalAmount || 0) - (bill.remainingAmount || 0),
      rent: bill.charges?.rent || 0,
      electricity: 0,
      water: 0,
      status: bill.status,
      status_label: bill.status === "paid" ? "Paid" : "Pending",
      due_date: new Date("2026-09-20T00:00:00Z"),
      release_date: new Date("2026-09-15T00:00:00Z"),
    }));

    const context = await resolveTenantAIContext(tenantId, user, {
      db: null,
      domains: ["billing"],
    });

    expect(context.billingSummary.totalOutstandingBalance).toBe(50000);
    expect(context.billingSummary.totalPenaltyDue).toBe(50000);
    expect(context.unpaidBills).toHaveLength(1);
    expect(context.unpaidBills[0].penaltyAmount).toBe(50000);
    expect(context.unpaidBills[0].billId).toBe("unpaid-penalty-bill");
    expect(context.activeUnpaidBill).toBeDefined();
    expect(context.activeUnpaidBill.billId).toBe("unpaid-penalty-bill");
    expect(context.hasPendingBill).toBe(true);
  });

  test("neutral fallback never fabricates a branch, room, bed, bill, or move-in date", () => {
    expect(buildNeutralContext({ firstName: "Ava" })).toMatchObject({
      tenantName: "Ava",
      branch: "Lilycrest Residence",
      branchRaw: null,
      roomNumber: null,
      bedPosition: null,
      currentBill: null,
      contract: null,
      tenancy: {
        status: "unknown",
        isCurrentResident: false,
        scheduledMoveInDate: null,
      },
    });
  });
});
