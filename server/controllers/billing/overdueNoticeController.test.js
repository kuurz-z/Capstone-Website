import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";

const mockNoticeSave = jest.fn();
let mockNoticeDoc = null;
const mockBillSave = jest.fn();
let mockBillDoc = null;
const mockReviewSave = jest.fn();
let mockReviewDoc = null;

const mockFindBills = jest.fn();
const mockFindOneBill = jest.fn();
const mockFindByIdBill = jest.fn();

const mockFindNotices = jest.fn();
const mockFindOneNotice = jest.fn();

const mockFindReviews = jest.fn();
const mockFindOneReview = jest.fn();
const mockFindByIdReview = jest.fn();
const mockBillingNotice = jest.fn();
const mockFindUsers = jest.fn();

// Controller unit tests isolate the transaction boundary; its conflicting
// lifecycle behavior is exercised against a replica set in transfer tests.
await jest.unstable_mockModule("../../services/tenancyConflictTransaction.js", () => ({
  createExclusiveTenancyRecord: async (_reservationId, create) => create(null),
}));

await jest.unstable_mockModule("../../models/index.js", () => {
  class MockOverdueNotice {
    constructor(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.delivery = {
        email: { status: "not_attempted" },
        notification: { status: "not_attempted" },
      };
      this.save = mockNoticeSave.mockResolvedValue(this);
    }
    static find = mockFindNotices;
    static findOne = mockFindOneNotice;
  }

  class MockTerminationReview {
    constructor(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = mockReviewSave.mockResolvedValue(this);
    }
    static find = mockFindReviews;
    static findOne = mockFindOneReview;
    static findById = mockFindByIdReview;
  }

  class MockBill {
    constructor(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = mockBillSave.mockResolvedValue(this);
    }
    static find = mockFindBills;
    static findOne = mockFindOneBill;
    static findById = mockFindByIdBill;
  }

  return {
    OverdueNotice: MockOverdueNotice,
    TerminationReview: MockTerminationReview,
    Bill: MockBill,
    Reservation: {
      find: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
      findById: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) }),
    },
    Room: {
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
    },
    User: {
      find: mockFindUsers,
      findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) }),
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          role: "admin",
          branch: "gil-puyat",
          firstName: "Admin",
          lastName: "Staff",
          email: "admin@lilycrest.com",
        }),
      }),
    },
    UtilityPeriod: {
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    },
    UtilityReading: {},
    TenantViolation: {},
    Notification: {},
    Payment: {},
    Contract: {},
    Stay: {},
    AuditLog: {},
    ROOM_BRANCHES: ["gil-puyat", "guadalupe"],
  };
});


await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

await jest.unstable_mockModule("../../utils/billingAudit.js", () => ({
  logBillingAudit: jest.fn().mockResolvedValue(true),
}));

await jest.unstable_mockModule("../../config/email.js", () => ({
  sendBillGeneratedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendOverdueNoticeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPaymentApprovedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPaymentReminderEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPaymentRejectedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendUtilityChargeAvailableEmail: jest.fn().mockResolvedValue({ success: true }),
}));

await jest.unstable_mockModule("../../services/notifications/notificationService.js", () => {
  const notifyObj = {
    billingNotice: mockBillingNotice,
  };
  return {
    default: notifyObj,
    notify: notifyObj,
    createNotification: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() }),
  };
});

await jest.unstable_mockModule("./_helpers.js", () => ({
  getAdminInfo: jest.fn().mockResolvedValue({ isOwner: true, branch: "gil-puyat", _id: new mongoose.Types.ObjectId() }),
  resolveAdminUserId: jest.fn().mockImplementation((req, admin) => admin?._id || req?.user?._id || new mongoose.Types.ObjectId()),
}));

const mockMoveOutStayWorkflow = jest.fn().mockResolvedValue({ reservation: {} });
await jest.unstable_mockModule("../../utils/tenantActionService.js", () => ({
  moveOutStayWorkflow: mockMoveOutStayWorkflow,
}));

const {
  getOverdueNoticesAction,
  sendOverdueNoticeAction,
  batchSendOverdueNoticesAction,
  updateTerminationDecisionAction,
  executeApprovedTermination,
} = await import("./overdueNoticeController.js");

describe("OverdueNoticeController Tests", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBillingNotice.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    mockFindUsers.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

    req = {
      user: {
        _id: new mongoose.Types.ObjectId(),
        uid: "test-admin-uid",
        role: "admin",
        branch: "gil-puyat",
      },
      branchFilter: "gil-puyat",
      params: {},
      body: {},
      query: {},
    };


    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe("getOverdueNoticesAction", () => {
    test("returns formatted overdue notice list with summary statistics", async () => {
      const mockBill = {
        _id: new mongoose.Types.ObjectId(),
        branch: "gil-puyat",
        userId: { _id: new mongoose.Types.ObjectId(), firstName: "John", lastName: "Doe" },
        roomId: { name: "Room 101" },
        remainingAmount: 5000,
        totalAmount: 5000,
        charges: { rent: 4500, penalty: 500 },
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: "overdue",
        overdueNoticeCount: 1,
      };

      mockFindBills.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockBill]),
      });

      mockFindNotices.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId(),
            billId: mockBill._id,
            noticeNumber: 1,
            totalAmountAtIssuance: 5000,
            daysOverdueAtIssuance: 5,
            deliveryStatus: "sent",
            issuedAt: new Date(),
          },
        ]),
      });

      await getOverdueNoticesAction(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].tenantName).toBe("John Doe");
      expect(response.data[0].noticeStage).toBe("notice_1");
      expect(response.stats.totalExposure).toBe(5000);
      expect(response.stats.notice1ActiveCount).toBe(1);
    });

    test("resolves tenant details from reservationId.userId when bill.userId is null", async () => {
      const tenantId = new mongoose.Types.ObjectId();
      const mockBill = {
        _id: new mongoose.Types.ObjectId(),
        branch: "gil-puyat",
        userId: null,
        reservationId: {
          roomId: { name: "Room 203" },
          userId: {
            _id: tenantId,
            firstName: "Juan",
            lastName: "Dela Cruz",
            email: "juan@example.com",
            phone: "09123456789",
          },
        },
        roomId: null,
        remainingAmount: 6250,
        totalAmount: 6250,
        charges: { rent: 1600, penalty: 4650 },
        dueDate: new Date(Date.now() - 93 * 24 * 60 * 60 * 1000),
        status: "overdue",
        overdueNoticeCount: 0,
      };

      mockFindBills.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockBill]),
      });

      mockFindNotices.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await getOverdueNoticesAction(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data[0].tenantName).toBe("Juan Dela Cruz");
      expect(response.data[0].tenantEmail).toBe("juan@example.com");
      expect(response.data[0].tenantPhone).toBe("09123456789");
      expect(response.data[0].tenantId).toEqual(tenantId);
    });

    test("resolves unpopulated legacy userId via secondary batch lookup when bill is detached from reservation", async () => {
      const legacyUserId = new mongoose.Types.ObjectId();
      const mockBill = {
        _id: new mongoose.Types.ObjectId(),
        branch: "gil-puyat",
        userId: legacyUserId, // Raw ObjectId without populated fields
        reservationId: null,
        roomId: null,
        remainingAmount: 4500,
        totalAmount: 4500,
        charges: { rent: 4500, penalty: 0 },
        dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        status: "overdue",
        overdueNoticeCount: 0,
      };

      mockFindBills.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockBill]),
      });

      mockFindNotices.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      mockFindUsers.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: legacyUserId,
            firstName: "Maria",
            lastName: "Santos",
            email: "maria.santos@example.com",
            phone: "09171234567",
          },
        ]),
      });

      await getOverdueNoticesAction(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data[0].tenantName).toBe("Maria Santos");
      expect(response.data[0].tenantEmail).toBe("maria.santos@example.com");
      expect(response.data[0].tenantPhone).toBe("09171234567");
      expect(response.data[0].tenantId).toEqual(legacyUserId);
    });
  });

  describe("sendOverdueNoticeAction", () => {
    test("rejects notice dispatch if bill is under active dispute", async () => {
      const billId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_1" };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
      });
      // Resolve mock bill
      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue({
              _id: billId,
              branch: "gil-puyat",
              status: "overdue",
              remainingAmount: 5000,
              disputeState: "disputed",
              userId: { _id: new mongoose.Types.ObjectId(), email: "test@example.com" },
            }),
          }),
        }),
      });

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining("active administrative dispute"),
        }),
      );
    });

    test("enforces sequential notice progression (blocks N2 before N1)", async () => {
      const billId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_2" };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue({
              _id: billId,
              branch: "gil-puyat",
              status: "overdue",
              remainingAmount: 5000,
              disputeState: "none",
              overdueNoticeCount: 0, // No notices sent yet
              userId: { _id: new mongoose.Types.ObjectId(), email: "test@example.com" },
            }),
          }),
        }),
      });

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining("Sequential progression is required"),
        }),
      );
    });

    test("successfully dispatches Notice 1 with snapshot and email delivery", async () => {
      const billId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_1", noticeMessage: "Please pay promptly." };

      const billDoc = {
        _id: billId,
        branch: "gil-puyat",
        status: "overdue",
        remainingAmount: 4500,
        totalAmount: 4500,
        charges: { rent: 4500, penalty: 0 },
        disputeState: "none",
        overdueNoticeCount: 0,
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        userId: { _id: new mongoose.Types.ObjectId(), firstName: "Maria", lastName: "Clara", email: "maria@example.com" },
        save: mockBillSave.mockResolvedValue(true),
      };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(billDoc),
          }),
        }),
      });

      mockFindOneNotice.mockResolvedValue(null);

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.overdueNoticeCount).toBe(1);
      expect(mockBillingNotice).toHaveBeenCalledWith(
        billDoc.userId._id,
        expect.objectContaining({
          notificationType: "bill_due_reminder",
          billId,
          eventId: expect.any(mongoose.Types.ObjectId),
          pushType: "overdue_notice",
        }),
      );
      expect(mockNoticeSave.mock.invocationCallOrder[0]).toBeLessThan(
        mockBillingNotice.mock.invocationCallOrder[0],
      );
    });

    test("auto-escalates to TerminationReview when Notice 3 Final is dispatched", async () => {
      const billId = new mongoose.Types.ObjectId();
      const reservationId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_3" };

      const billDoc = {
        _id: billId,
        reservationId,
        branch: "gil-puyat",
        status: "overdue",
        remainingAmount: 8500,
        totalAmount: 8500,
        charges: { rent: 7500, penalty: 1000 },
        disputeState: "none",
        overdueNoticeCount: 2, // Notice 2 already sent
        dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        userId: { _id: new mongoose.Types.ObjectId(), firstName: "Crisostomo", lastName: "Ibarra", email: "ibarra@example.com" },
        save: mockBillSave.mockResolvedValue(true),
      };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(billDoc),
          }),
        }),
      });

      mockFindOneNotice.mockResolvedValue(null);
      mockFindOneReview.mockResolvedValue(null); // No active review yet

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.escalatedToReviewId).toBeDefined();
    });

    test("rejects notice dispatch if no valid tenant account is linked to bill or reservation", async () => {
      const billId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_1" };

      const billDoc = {
        _id: billId,
        branch: "gil-puyat",
        status: "overdue",
        remainingAmount: 5000,
        totalAmount: 5000,
        charges: { rent: 4500, penalty: 500 },
        disputeState: "none",
        overdueNoticeCount: 0,
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        userId: null,
        reservationId: null,
        save: mockBillSave.mockResolvedValue(true),
      };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(billDoc),
          }),
        }),
      });

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining("No active tenant account is linked"),
        }),
      );
    });

    test("successfully resolves tenant from reservationId.userId when bill.userId is null", async () => {
      const billId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();
      const resvId = new mongoose.Types.ObjectId();
      req.params.billId = billId;
      req.body = { noticeType: "notice_1", noticeMessage: "Please settle." };

      const billDoc = {
        _id: billId,
        branch: "gil-puyat",
        status: "overdue",
        remainingAmount: 6250,
        totalAmount: 6250,
        charges: { rent: 1600, penalty: 4650 },
        disputeState: "none",
        overdueNoticeCount: 0,
        dueDate: new Date(Date.now() - 93 * 24 * 60 * 60 * 1000),
        userId: null, // bill.userId is null (like in the screenshot)
        reservationId: {
          _id: resvId,
          userId: {
            _id: tenantId,
            firstName: "Juan",
            lastName: "Dela Cruz",
            email: "juan@example.com",
            phone: "09123456789",
          },
        },
        save: mockBillSave.mockResolvedValue(true),
      };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(billDoc),
          }),
        }),
      });

      mockFindOneNotice.mockResolvedValue(null);

      await sendOverdueNoticeAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.overdueNoticeCount).toBe(1);
      expect(mockBillingNotice).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          notificationType: "bill_due_reminder",
          billId,
          pushType: "overdue_notice",
        }),
      );
    });
  });

  describe("updateTerminationDecisionAction", () => {
    test("requires non-empty outcomeDetail before adjudicating", async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.body = { outcome: "payment_plan_approved", outcomeDetail: "" };

      await updateTerminationDecisionAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining("outcomeDetail"),
        }),
      );
    });

    test("successfully adjudicates payment plan with installments calculation", async () => {
      const reviewId = new mongoose.Types.ObjectId();
      req.params.id = reviewId;
      req.body = {
        outcome: "payment_plan_approved",
        outcomeDetail: "Approved 3-month payment arrangement.",
        paymentPlan: {
          totalAmount: 9000,
          numberOfInstallments: 3,
          installmentAmount: 3000,
          firstPaymentDue: new Date("2026-09-01"),
        },
      };

      const reviewDoc = {
        _id: reviewId,
        branch: "gil-puyat",
        tenantId: new mongoose.Types.ObjectId(),
        totalOutstandingAtOpen: 9000,
        status: "open",
        save: mockReviewSave.mockResolvedValue(true),
      };

      mockFindByIdReview.mockResolvedValue(reviewDoc);

      await updateTerminationDecisionAction(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(reviewDoc.decision.outcome).toBe("payment_plan_approved");
      expect(reviewDoc.paymentPlan.installments).toHaveLength(3);
    });
    test("blocks non-owner from issuing termination/eviction notice", async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.body = { outcome: "pre_termination_notice", outcomeDetail: "Violated multiple rules" };
      req.user.role = "branch_admin";

      const { getAdminInfo } = await import("./_helpers.js");
      getAdminInfo.mockResolvedValueOnce({ isOwner: false, branch: "gil-puyat", _id: new mongoose.Types.ObjectId() });

      await updateTerminationDecisionAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("Only Dorm Owners") })
      );
    });

    test("allows owner to issue termination/eviction notice", async () => {
      const reviewId = new mongoose.Types.ObjectId();
      req.params.id = reviewId;
      req.body = { outcome: "termination_approved", outcomeDetail: "Decision is final." };
      req.user.role = "owner";

      const { getAdminInfo } = await import("./_helpers.js");
      getAdminInfo.mockResolvedValueOnce({ isOwner: true, branch: "gil-puyat", _id: new mongoose.Types.ObjectId() });

      const reviewDoc = {
        _id: reviewId,
        branch: "gil-puyat",
        tenantId: new mongoose.Types.ObjectId(),
        status: "open",
        save: mockReviewSave.mockResolvedValue(true),
      };
      mockFindByIdReview.mockResolvedValue(reviewDoc);

      await updateTerminationDecisionAction(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(reviewDoc.decision.outcome).toBe("termination_approved");
    });
  });

  describe("batchSendOverdueNoticesAction", () => {
    test("successfully processes batch when tenant has no email address without schema failure", async () => {
      const billId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();
      req.body = { billIds: [billId], noticeNumber: 1, noticeMessage: "Please pay." };

      const billDoc = {
        _id: billId,
        branch: "gil-puyat",
        status: "overdue",
        remainingAmount: 4500,
        totalAmount: 4500,
        charges: { rent: 4500, penalty: 0 },
        disputeState: "none",
        overdueNoticeCount: 0,
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        userId: { _id: tenantId, firstName: "Jose", lastName: "Rizal", email: "" },
        save: mockBillSave.mockResolvedValue(true),
      };

      mockFindByIdBill.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(billDoc),
          }),
        }),
      });

      await batchSendOverdueNoticesAction(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            total: 1,
            successCount: 1,
            failureCount: 0,
          }),
        })
      );
      expect(mockNoticeSave).toHaveBeenCalled();
      expect(mockBillSave).toHaveBeenCalled();
      expect(billDoc.overdueNoticeCount).toBe(1);
    });
  });
});
