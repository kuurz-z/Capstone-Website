import { Announcement, AcknowledgmentAccount, User } from "../models/index.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { createNotification } from "./notificationService.js";
import { emitToUser } from "./socket.js";
import { sendMobilePushAnnouncement } from "./mobilePushService.js";
import logger from "../middleware/logger.js";

export const ANNOUNCEMENT_NOTIFICATION_URL = "/applicant/announcements";

export const buildRecipientQuery = (targetBranch) => ({
  role: "tenant",
  isArchived: false,
  accountStatus: "active",
  branch: targetBranch === "both" ? { $in: ROOM_BRANCHES } : targetBranch,
});

export const isAnnouncementLive = (announcement, now = new Date()) =>
  !announcement?.isArchived &&
  ["scheduled", "published"].includes(announcement?.publicationStatus) &&
  (!announcement?.startsAt || announcement.startsAt <= now) &&
  (!announcement?.endsAt || announcement.endsAt > now);

export const buildAnnouncementNotificationMessage = (content) => {
  const normalized = String(content || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "A new announcement is available.";
  }

  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
};

export const buildNotificationPayload = (notification) => {
  const payload = notification?.toObject ? notification.toObject() : notification;
  return {
    ...payload,
    _id: String(payload._id),
    userId: String(payload.userId),
    isRead: Boolean(payload.isRead),
  };
};

export const fetchAnnouncementRecipients = async (targetBranch) =>
  User.find(buildRecipientQuery(targetBranch)).select("_id").lean();

export const upsertAnnouncementAcknowledgmentAudience = async (
  announcement,
  recipients = null,
) => {
  if (!announcement?.requiresAcknowledgment) {
    return recipients || [];
  }

  const resolvedRecipients =
    recipients || (await fetchAnnouncementRecipients(announcement.targetBranch));

  await AcknowledgmentAccount.createForAnnouncement(
    announcement._id,
    resolvedRecipients.map((recipient) => recipient._id),
  );

  return resolvedRecipients;
};

export const dispatchAnnouncementNotifications = async (
  announcement,
  options = {},
) => {
  const { recipients = null, markDispatched = true } = options;

  if (!announcement) {
    return {
      recipients: [],
      notifications: [],
      notificationCount: 0,
      dispatched: false,
      skippedReason: "missing-announcement",
    };
  }

  const resolvedRecipients =
    recipients || (await fetchAnnouncementRecipients(announcement.targetBranch));

  if (announcement.requiresAcknowledgment && resolvedRecipients.length > 0) {
    await upsertAnnouncementAcknowledgmentAudience(announcement, resolvedRecipients);
  }

  if (!isAnnouncementLive(announcement)) {
    return {
      recipients: resolvedRecipients,
      notifications: [],
      notificationCount: 0,
      dispatched: false,
      skippedReason: "not-live",
    };
  }

  if (announcement.notificationDispatchedAt) {
    return {
      recipients: resolvedRecipients,
      notifications: [],
      notificationCount: 0,
      dispatched: false,
      skippedReason: "already-dispatched",
    };
  }

  announcement.notificationDispatchAttemptCount =
    (announcement.notificationDispatchAttemptCount || 0) + 1;

  const notifications = await Promise.all(
    resolvedRecipients.map(async (recipient) => {
      const notification = await createNotification(
        recipient._id,
        "announcement",
        announcement.title,
        buildAnnouncementNotificationMessage(announcement.content),
        { actionUrl: ANNOUNCEMENT_NOTIFICATION_URL },
      );

      if (notification) {
        emitToUser(
          String(recipient._id),
          "notification:new",
          buildNotificationPayload(notification),
        );
      }

      return notification;
    }),
  );

  const notificationCount = notifications.filter(Boolean).length;

  if (markDispatched) {
    announcement.notificationDispatchedAt = new Date();
    announcement.notificationDispatchErrorAt = null;
    if (!announcement.publishedAt) {
      announcement.publishedAt = announcement.startsAt || announcement.notificationDispatchedAt;
    }
    await announcement.save();
  }

  // Fire mobile push notifications in background — does not block the HTTP response.
  // Targets the same recipient list already resolved for in-app notifications.
  setImmediate(async () => {
    try {
      const recipientIds = resolvedRecipients.map((r) => r._id);
      const pushCount = await sendMobilePushAnnouncement(announcement, recipientIds);
      if (pushCount > 0) {
        logger.info(
          { announcementId: String(announcement._id), pushCount },
          "Mobile push delivered for announcement",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Mobile push for announcement failed (non-fatal)");
    }
  });

  return {
    recipients: resolvedRecipients,
    notifications,
    notificationCount,
    dispatched: true,
    skippedReason: null,
  };
};

export const dispatchDueScheduledAnnouncements = async (now = new Date()) => {
  const dueAnnouncements = await Announcement.find({
    isArchived: false,
    publicationStatus: { $in: ["scheduled", "published"] },
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    notificationDispatchedAt: null,
  }).sort({ startsAt: 1, createdAt: 1 });

  let dispatchedCount = 0;

  for (const announcement of dueAnnouncements) {
    try {
      const result = await dispatchAnnouncementNotifications(announcement);
      if (result.dispatched) {
        dispatchedCount += 1;
      }
    } catch (error) {
      announcement.notificationDispatchErrorAt = new Date();
      await announcement.save();
      logger.error(
        {
          err: error,
          announcementId: String(announcement._id),
          title: announcement.title,
        },
        "Scheduled announcement dispatch failed",
      );
    }
  }

  return {
    dueCount: dueAnnouncements.length,
    dispatchedCount,
  };
};
