import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const userFind = jest.fn();
const announcementFind = jest.fn();
const acknowledgmentCreateForAnnouncement = jest.fn();
const createNotification = jest.fn();
const emitToUser = jest.fn();

const createSelectableChain = (result) => ({
  select: jest.fn(() => ({
    lean: jest.fn(async () => result),
  })),
});

const createSortChain = (result) => ({
  sort: jest.fn(async () => result),
});

await jest.unstable_mockModule("../models/index.js", () => ({
  Announcement: {
    find: announcementFind,
  },
  AcknowledgmentAccount: {
    createForAnnouncement: acknowledgmentCreateForAnnouncement,
  },
  User: {
    find: userFind,
  },
}));

await jest.unstable_mockModule("./notificationService.js", () => ({
  createNotification,
}));

await jest.unstable_mockModule("./socket.js", () => ({
  emitToUser,
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  dispatchAnnouncementNotifications,
  dispatchDueScheduledAnnouncements,
} = await import("./announcementDispatch.js");

describe("announcementDispatch", () => {
  beforeEach(() => {
    userFind.mockReset();
    announcementFind.mockReset();
    acknowledgmentCreateForAnnouncement.mockReset();
    createNotification.mockReset();
    emitToUser.mockReset();
  });

  test("dispatchAnnouncementNotifications creates notifications once and marks dispatch state", async () => {
    const announcement = {
      _id: "announcement-1",
      title: "Water outage",
      content: "Temporary outage in the building.",
      targetBranch: "gil-puyat",
      publicationStatus: "scheduled",
      startsAt: new Date("2026-04-01T08:00:00.000Z"),
      endsAt: null,
      isArchived: false,
      requiresAcknowledgment: true,
      notificationDispatchedAt: null,
      notificationDispatchAttemptCount: 0,
      save: jest.fn(async function save() {
        return this;
      }),
    };
    const recipients = [{ _id: "tenant-1" }, { _id: "tenant-2" }];

    createNotification
      .mockResolvedValueOnce({
        _id: "notification-1",
        userId: "tenant-1",
        isRead: false,
        toObject: () => ({
          _id: "notification-1",
          userId: "tenant-1",
          isRead: false,
        }),
      })
      .mockResolvedValueOnce({
        _id: "notification-2",
        userId: "tenant-2",
        isRead: false,
        toObject: () => ({
          _id: "notification-2",
          userId: "tenant-2",
          isRead: false,
        }),
      });

    const result = await dispatchAnnouncementNotifications(announcement, {
      recipients,
    });

    expect(acknowledgmentCreateForAnnouncement).toHaveBeenCalledWith(
      "announcement-1",
      ["tenant-1", "tenant-2"],
    );
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(emitToUser).toHaveBeenCalledTimes(2);
    expect(announcement.notificationDispatchedAt).toEqual(expect.any(Date));
    expect(announcement.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        notificationCount: 2,
        dispatched: true,
      }),
    );
  });

  test("dispatchAnnouncementNotifications skips announcements already dispatched", async () => {
    const announcement = {
      _id: "announcement-2",
      title: "Rules",
      content: "Policy reminder",
      targetBranch: "gil-puyat",
      publicationStatus: "published",
      startsAt: new Date("2026-04-01T08:00:00.000Z"),
      endsAt: null,
      isArchived: false,
      requiresAcknowledgment: false,
      notificationDispatchedAt: new Date("2026-04-01T08:01:00.000Z"),
    };

    const result = await dispatchAnnouncementNotifications(announcement, {
      recipients: [{ _id: "tenant-1" }],
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        dispatched: false,
        skippedReason: "already-dispatched",
      }),
    );
  });

  test("dispatchDueScheduledAnnouncements catches up due scheduled notices", async () => {
    const dueAnnouncement = {
      _id: "announcement-3",
      title: "Catch up notice",
      content: "Sent after restart.",
      targetBranch: "both",
      publicationStatus: "scheduled",
      startsAt: new Date("2026-04-01T08:00:00.000Z"),
      endsAt: null,
      isArchived: false,
      requiresAcknowledgment: false,
      notificationDispatchedAt: null,
      notificationDispatchAttemptCount: 0,
      save: jest.fn(async function save() {
        return this;
      }),
    };

    announcementFind.mockReturnValue(createSortChain([dueAnnouncement]));
    userFind.mockReturnValue(createSelectableChain([{ _id: "tenant-1" }]));
    createNotification.mockResolvedValue({
      _id: "notification-3",
      userId: "tenant-1",
      isRead: false,
      toObject: () => ({
        _id: "notification-3",
        userId: "tenant-1",
        isRead: false,
      }),
    });

    const result = await dispatchDueScheduledAnnouncements(
      new Date("2026-04-01T08:05:00.000Z"),
    );

    expect(announcementFind).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationDispatchedAt: null,
        startsAt: { $lte: new Date("2026-04-01T08:05:00.000Z") },
      }),
    );
    expect(result).toEqual({
      dueCount: 1,
      dispatchedCount: 1,
    });
  });
});
