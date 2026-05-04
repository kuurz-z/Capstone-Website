import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const createLeanChain = (result) => ({
  lean: jest.fn(async () => result),
});

const createSelectableChain = (result) => ({
  select: jest.fn(() => createLeanChain(result)),
  lean: jest.fn(async () => result),
});

const createFindChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn(async () => result),
  };
  return chain;
};

const announcementFind = jest.fn();
const announcementFindOne = jest.fn();
const userFindOne = jest.fn();
const userFind = jest.fn();
const acknowledgmentFind = jest.fn();
const acknowledgmentFindOne = jest.fn();
const acknowledgmentCreateForAnnouncement = jest.fn();
const acknowledgmentStats = jest.fn();
const fetchAnnouncementRecipients = jest.fn();
const upsertAnnouncementAcknowledgmentAudience = jest.fn();
const dispatchAnnouncementNotifications = jest.fn();
const sendSuccess = jest.fn();
const logModification = jest.fn();
const logError = jest.fn();

const Announcement = jest.fn(function Announcement(data) {
  this._id = data._id || "announcement-1";
  this.title = data.title;
  this.content = data.content;
  this.category = data.category;
  this.targetBranch = data.targetBranch;
  this.publishedBy = data.publishedBy;
  this.requiresAcknowledgment = data.requiresAcknowledgment;
  this.visibility = data.visibility;
  this.publicationStatus = data.publicationStatus || "published";
  this.publishedAt = data.publishedAt || new Date("2026-04-09T08:00:00Z");
  this.startsAt = data.startsAt || new Date("2026-04-09T08:00:00Z");
  this.isPinned = Boolean(data.isPinned);
  this.isArchived = Boolean(data.isArchived);
  this.save = jest.fn(async () => this);
  this.toObject = () => ({
    _id: this._id,
    title: this.title,
    content: this.content,
    category: this.category,
    targetBranch: this.targetBranch,
    publishedBy: this.publishedBy,
    requiresAcknowledgment: this.requiresAcknowledgment,
    visibility: this.visibility,
    publicationStatus: this.publicationStatus,
    publishedAt: this.publishedAt,
    startsAt: this.startsAt,
    isPinned: this.isPinned,
    isArchived: this.isArchived,
  });
});

Announcement.find = announcementFind;
Announcement.findOne = announcementFindOne;

const AcknowledgmentAccount = jest.fn(function AcknowledgmentAccount(data) {
  this.userId = data.userId;
  this.announcementId = data.announcementId;
  this.isRead = false;
  this.isAcknowledged = false;
  this.readAt = null;
  this.acknowledgedAt = null;
  this.markAsRead = jest.fn(async () => {
    this.isRead = true;
    this.readAt = new Date("2026-04-09T09:00:00Z");
    return this;
  });
  this.acknowledge = jest.fn(async () => {
    this.isRead = true;
    this.isAcknowledged = true;
    this.readAt = new Date("2026-04-09T09:00:00Z");
    this.acknowledgedAt = new Date("2026-04-09T09:05:00Z");
    return this;
  });
});

AcknowledgmentAccount.find = acknowledgmentFind;
AcknowledgmentAccount.findOne = acknowledgmentFindOne;
AcknowledgmentAccount.createForAnnouncement = acknowledgmentCreateForAnnouncement;
AcknowledgmentAccount.getUserEngagementStats = acknowledgmentStats;

await jest.unstable_mockModule("../models/index.js", () => ({
  Announcement,
  AcknowledgmentAccount,
  User: {
    findOne: userFindOne,
    find: userFind,
  },
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

await jest.unstable_mockModule("../utils/sanitize.js", () => ({
  clean: (value) => value,
}));

await jest.unstable_mockModule("../utils/auditLogger.js", () => ({
  default: {
    logModification,
    logError,
  },
}));

await jest.unstable_mockModule("../utils/announcementDispatch.js", () => ({
  buildRecipientQuery: (targetBranch) => ({
    role: "tenant",
    isArchived: false,
    accountStatus: "active",
    branch:
      targetBranch === "both"
        ? { $in: ["gil-puyat", "guadalupe"] }
        : targetBranch,
  }),
  fetchAnnouncementRecipients,
  upsertAnnouncementAcknowledgmentAudience,
  dispatchAnnouncementNotifications,
  isAnnouncementLive: (announcement) =>
    ["scheduled", "published"].includes(announcement.publicationStatus) &&
    (!announcement.startsAt || announcement.startsAt <= new Date()) &&
    (!announcement.endsAt || announcement.endsAt > new Date()) &&
    !announcement.isArchived,
}));

const {
  createAnnouncement,
  getAnnouncements,
  markAsRead,
} = await import("./announcementsController.js");

describe("announcementsController", () => {
  beforeEach(() => {
    Announcement.mockClear();
    AcknowledgmentAccount.mockClear();
    announcementFind.mockReset();
    announcementFindOne.mockReset();
    userFindOne.mockReset();
    userFind.mockReset();
    acknowledgmentFind.mockReset();
    acknowledgmentFindOne.mockReset();
    acknowledgmentCreateForAnnouncement.mockReset();
    acknowledgmentStats.mockReset();
    fetchAnnouncementRecipients.mockReset();
    upsertAnnouncementAcknowledgmentAudience.mockReset();
    dispatchAnnouncementNotifications.mockReset();
    sendSuccess.mockReset();
    logModification.mockReset();
    logError.mockReset();
  });

  test("branch admins publish only to their own branch tenants", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "admin-1",
        role: "branch_admin",
        branch: "gil-puyat",
        firstName: "Branch",
        lastName: "Admin",
      }),
    );
    fetchAnnouncementRecipients.mockResolvedValue([
      { _id: "tenant-1" },
      { _id: "tenant-2" },
    ]);
    upsertAnnouncementAcknowledgmentAudience.mockResolvedValue([
      { _id: "tenant-1" },
      { _id: "tenant-2" },
    ]);
    dispatchAnnouncementNotifications.mockResolvedValue({
      notificationCount: 2,
    });

    const req = {
      user: { uid: "firebase-admin-1" },
      body: {
        title: "Water outage",
        content: "Temporary outage",
        category: "alert",
        targetBranch: "both",
        requiresAcknowledgment: true,
      },
    };
    const res = { req };
    const next = jest.fn();

    await createAnnouncement(req, res, next);

    expect(Announcement).toHaveBeenCalledWith(
      expect.objectContaining({
        targetBranch: "gil-puyat",
        visibility: "tenants-only",
      }),
    );
    expect(fetchAnnouncementRecipients).toHaveBeenCalledWith("gil-puyat");
    expect(dispatchAnnouncementNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "announcement-1" }),
      { recipients: [{ _id: "tenant-1" }, { _id: "tenant-2" }] },
    );
    expect(logModification).toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        recipientCount: 2,
        notificationCount: 2,
      }),
      201,
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("owners can publish across both branches", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "owner-1",
        role: "owner",
        branch: "gil-puyat",
      }),
    );
    fetchAnnouncementRecipients.mockResolvedValue([]);
    dispatchAnnouncementNotifications.mockResolvedValue({
      notificationCount: 0,
    });

    const req = {
      user: { uid: "firebase-owner-1" },
      body: {
        title: "New policy",
        content: "Please review the updated policy.",
        category: "policy",
        targetBranch: "both",
        requiresAcknowledgment: false,
        startsAt: "2026-04-01T08:00:00.000Z",
      },
    };
    const res = { req };

    await createAnnouncement(req, res, jest.fn());

    expect(Announcement).toHaveBeenCalledWith(
      expect.objectContaining({
        targetBranch: "both",
      }),
    );
    expect(fetchAnnouncementRecipients).toHaveBeenCalledWith("both");
  });

  test("future scheduled announcements do not dispatch immediately", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "owner-2",
        role: "owner",
        branch: "gil-puyat",
      }),
    );
    dispatchAnnouncementNotifications.mockResolvedValue({
      notificationCount: 0,
      dispatched: false,
      skippedReason: "not-live",
    });

    const req = {
      user: { uid: "firebase-owner-2" },
      body: {
        title: "Future notice",
        content: "Starts later.",
        category: "general",
        targetBranch: "both",
        publicationStatus: "scheduled",
        startsAt: "2099-01-01T08:00:00.000Z",
        requiresAcknowledgment: false,
      },
    };
    const res = { req };

    await createAnnouncement(req, res, jest.fn());

    expect(fetchAnnouncementRecipients).not.toHaveBeenCalled();
    expect(dispatchAnnouncementNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "announcement-1" }),
      { recipients: [] },
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        notificationCount: 0,
      }),
      201,
    );
  });

  test("future scheduled acknowledgments are seeded before dispatch time", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "owner-3",
        role: "owner",
        branch: "gil-puyat",
      }),
    );
    fetchAnnouncementRecipients.mockResolvedValue([{ _id: "tenant-5" }]);
    upsertAnnouncementAcknowledgmentAudience.mockResolvedValue([
      { _id: "tenant-5" },
    ]);
    dispatchAnnouncementNotifications.mockResolvedValue({
      notificationCount: 0,
      dispatched: false,
      skippedReason: "not-live",
    });

    const req = {
      user: { uid: "firebase-owner-3" },
      body: {
        title: "Policy draft",
        content: "Review later.",
        category: "policy",
        targetBranch: "both",
        publicationStatus: "scheduled",
        startsAt: "2099-01-01T08:00:00.000Z",
        requiresAcknowledgment: true,
      },
    };
    const res = { req };

    await createAnnouncement(req, res, jest.fn());

    expect(upsertAnnouncementAcknowledgmentAudience).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "announcement-1" }),
      [{ _id: "tenant-5" }],
    );
    expect(dispatchAnnouncementNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "announcement-1" }),
      { recipients: [{ _id: "tenant-5" }] },
    );
  });

  test("getAnnouncements merges read and acknowledgment state using mongo user ids", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "tenant-mongo-1",
        role: "tenant",
        branch: "gil-puyat",
      }),
    );
    announcementFind.mockReturnValue(
      createFindChain([
        {
          _id: "announcement-1",
          title: "Water outage",
          content: "Temporary outage",
          category: "alert",
          publishedAt: "2026-04-09T08:00:00Z",
          requiresAcknowledgment: true,
          isPinned: false,
        },
        {
          _id: "announcement-2",
          title: "House rules",
          content: "Quiet hours reminder",
          category: "policy",
          publishedAt: "2026-04-09T10:00:00Z",
          requiresAcknowledgment: false,
          isPinned: true,
        },
      ]),
    );
    acknowledgmentFind.mockReturnValue(
      createSelectableChain([
        {
          announcementId: "announcement-1",
          isRead: true,
          isAcknowledged: true,
          acknowledgedAt: "2026-04-09T11:00:00Z",
        },
      ]),
    );

    const req = {
      user: { uid: "firebase-tenant-1" },
      query: { limit: "50" },
    };
    const res = { req };
    const next = jest.fn();

    await getAnnouncements(req, res, next);

    expect(acknowledgmentFind).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "tenant-mongo-1",
      }),
    );
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        count: 2,
        announcements: [
          expect.objectContaining({
            id: "announcement-1",
            unread: false,
            acknowledged: true,
          }),
          expect.objectContaining({
            id: "announcement-2",
            unread: true,
            acknowledged: false,
          }),
        ],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("markAsRead resolves Firebase uid to mongo user id before tracking read state", async () => {
    userFindOne.mockReturnValue(
      createSelectableChain({
        _id: "tenant-mongo-9",
        role: "tenant",
        branch: "gil-puyat",
      }),
    );
    const incrementViewCount = jest.fn();
    announcementFindOne.mockResolvedValue({
      _id: "announcement-9",
      incrementViewCount,
    });
    acknowledgmentFindOne.mockResolvedValue(null);

    const req = {
      user: { uid: "firebase-tenant-9" },
      params: { announcementId: "announcement-9" },
    };
    const res = { req };
    const next = jest.fn();

    await markAsRead(req, res, next);

    expect(acknowledgmentFindOne).toHaveBeenCalledWith({
      userId: "tenant-mongo-9",
      announcementId: "announcement-9",
    });
    expect(AcknowledgmentAccount).toHaveBeenCalledWith({
      userId: "tenant-mongo-9",
      announcementId: "announcement-9",
    });
    expect(incrementViewCount).toHaveBeenCalledTimes(1);
    expect(sendSuccess).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        readAt: expect.any(Date),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
