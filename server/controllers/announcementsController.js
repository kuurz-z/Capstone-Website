/**
 * ============================================================================
 * ANNOUNCEMENTS CONTROLLER
 * ============================================================================
 */

import { Announcement, AcknowledgmentAccount, User } from "../models/index.js";
import { ROOM_BRANCHES, ROOM_BRANCH_LABELS } from "../config/branches.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";
import { clean } from "../utils/sanitize.js";
import auditLogger from "../utils/auditLogger.js";
import { createNotification } from "../utils/notificationService.js";
import { emitToUser } from "../utils/socket.js";

const TENANT_VISIBLE_VISIBILITY = ["public", "tenants-only"];
const ANNOUNCEMENT_NOTIFICATION_URL = "/applicant/announcements";

const getDbUserOrThrow = async (firebaseUid, select = "") => {
  let query = User.findOne({ firebaseUid });
  if (select) {
    query = query.select(select);
  }

  const user = await query.lean();
  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
};

const buildActiveAnnouncementQuery = (branch, options = {}) => {
  const { category, visibilities = TENANT_VISIBLE_VISIBILITY, requiresAcknowledgment = null } = options;
  const now = new Date();
  const query = {
    $and: [
      { $or: [{ targetBranch: "both" }, { targetBranch: branch }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ],
    startsAt: { $lte: now },
    isArchived: false,
  };

  if (category) {
    query.category = category;
  }

  if (Array.isArray(visibilities) && visibilities.length > 0) {
    query.visibility = { $in: visibilities };
  }

  if (typeof requiresAcknowledgment === "boolean") {
    query.requiresAcknowledgment = requiresAcknowledgment;
  }

  return query;
};

const serializeTenantAnnouncement = (announcement, engagement) => ({
  id: String(announcement._id),
  title: announcement.title,
  content: announcement.content,
  category: announcement.category,
  date: announcement.publishedAt,
  requiresAck: Boolean(announcement.requiresAcknowledgment),
  isPinned: Boolean(announcement.isPinned),
  unread: !engagement?.isRead,
  acknowledged: Boolean(engagement?.isAcknowledged),
  acknowledgedAt: engagement?.acknowledgedAt || null,
});

const serializeAdminAnnouncement = (announcement) => {
  const publisher = announcement.publishedBy;
  const publishedByName =
    publisher && typeof publisher === "object"
      ? `${publisher.firstName || ""} ${publisher.lastName || ""}`.trim() ||
        publisher.email ||
        "Unknown"
      : "Unknown";

  return {
    id: String(announcement._id),
    title: announcement.title,
    content: announcement.content,
    category: announcement.category,
    targetBranch: announcement.targetBranch,
    requiresAcknowledgment: Boolean(announcement.requiresAcknowledgment),
    publishedAt: announcement.publishedAt,
    publishedBy:
      publisher && typeof publisher === "object"
        ? String(publisher._id)
        : String(announcement.publishedBy),
    publishedByName,
  };
};

const buildNotificationPayload = (notification) => {
  const payload = notification?.toObject ? notification.toObject() : notification;
  return {
    ...payload,
    _id: String(payload._id),
    userId: String(payload.userId),
    isRead: Boolean(payload.isRead),
  };
};

const buildAnnouncementNotificationMessage = (content) => {
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

const resolveAnnouncementForTenant = async (user, announcementId) =>
  Announcement.findOne({
    _id: announcementId,
    ...buildActiveAnnouncementQuery(user.branch),
  });

/**
 * Get announcements for the current tenant.
 * @route GET /api/announcements
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const { limit = 50, category } = req.query;
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id branch role");

    if (dbUser.role !== "tenant" || !dbUser.branch) {
      sendSuccess(res, { count: 0, announcements: [] });
      return;
    }

    const announcements = await Announcement.find(
      buildActiveAnnouncementQuery(dbUser.branch, { category }),
    )
      .sort({ isPinned: -1, publishedAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 100))
      .lean();

    const announcementIds = announcements.map((announcement) => announcement._id);
    const engagements = announcementIds.length
      ? await AcknowledgmentAccount.find({
          userId: dbUser._id,
          announcementId: { $in: announcementIds },
        })
          .select("announcementId isRead isAcknowledged acknowledgedAt")
          .lean()
      : [];

    const engagementByAnnouncementId = new Map(
      engagements.map((record) => [String(record.announcementId), record]),
    );

    sendSuccess(res, {
      count: announcements.length,
      announcements: announcements.map((announcement) =>
        serializeTenantAnnouncement(
          announcement,
          engagementByAnnouncementId.get(String(announcement._id)),
        ),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get unacknowledged announcements for the current tenant.
 * @route GET /api/announcements/unacknowledged
 */
export const getUnacknowledged = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id branch role");

    if (dbUser.role !== "tenant" || !dbUser.branch) {
      sendSuccess(res, { count: 0, announcements: [] });
      return;
    }

    const announcements = await Announcement.find(
      buildActiveAnnouncementQuery(dbUser.branch, {
        requiresAcknowledgment: true,
      }),
    )
      .sort({ isPinned: -1, publishedAt: -1 })
      .limit(100)
      .lean();

    const announcementIds = announcements.map((announcement) => announcement._id);
    const acknowledgments = announcementIds.length
      ? await AcknowledgmentAccount.find({
          userId: dbUser._id,
          announcementId: { $in: announcementIds },
          isAcknowledged: true,
        })
          .select("announcementId")
          .lean()
      : [];

    const acknowledgedIds = new Set(
      acknowledgments.map((record) => String(record.announcementId)),
    );
    const unacknowledged = announcements.filter(
      (announcement) => !acknowledgedIds.has(String(announcement._id)),
    );

    sendSuccess(res, {
      count: unacknowledged.length,
      announcements: unacknowledged.map((announcement) =>
        serializeTenantAnnouncement(announcement),
      ),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a tenant announcement as read.
 * @route POST /api/announcements/:announcementId/read
 */
export const markAsRead = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id branch role");

    if (dbUser.role !== "tenant" || !dbUser.branch) {
      throw new AppError(
        "Announcement access is limited to tenant accounts",
        403,
        "ANNOUNCEMENT_ACCESS_DENIED",
      );
    }

    const { announcementId } = req.params;
    const announcement = await resolveAnnouncementForTenant(dbUser, announcementId);

    if (!announcement) {
      throw new AppError(
        "Announcement not found",
        404,
        "ANNOUNCEMENT_NOT_FOUND",
      );
    }

    let acknowledgment = await AcknowledgmentAccount.findOne({
      userId: dbUser._id,
      announcementId,
    });

    if (!acknowledgment) {
      acknowledgment = new AcknowledgmentAccount({
        userId: dbUser._id,
        announcementId,
      });
    }

    const wasRead = Boolean(acknowledgment.isRead);
    await acknowledgment.markAsRead();

    if (!wasRead) {
      await announcement.incrementViewCount();
    }

    sendSuccess(res, { readAt: acknowledgment.readAt });
  } catch (error) {
    next(error);
  }
};

/**
 * Acknowledge an announcement.
 * @route POST /api/announcements/:announcementId/acknowledge
 */
export const acknowledgeAnnouncement = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id branch role");

    if (dbUser.role !== "tenant" || !dbUser.branch) {
      throw new AppError(
        "Announcement access is limited to tenant accounts",
        403,
        "ANNOUNCEMENT_ACCESS_DENIED",
      );
    }

    const { announcementId } = req.params;
    const announcement = await resolveAnnouncementForTenant(dbUser, announcementId);

    if (!announcement) {
      throw new AppError(
        "Announcement not found",
        404,
        "ANNOUNCEMENT_NOT_FOUND",
      );
    }

    if (!announcement.requiresAcknowledgment) {
      throw new AppError(
        "This announcement does not require acknowledgment",
        400,
        "ACKNOWLEDGMENT_NOT_REQUIRED",
      );
    }

    let acknowledgment = await AcknowledgmentAccount.findOne({
      userId: dbUser._id,
      announcementId,
    });

    if (!acknowledgment) {
      acknowledgment = new AcknowledgmentAccount({
        userId: dbUser._id,
        announcementId,
      });
    }

    const alreadyAcknowledged = Boolean(acknowledgment.isAcknowledged);
    await acknowledgment.acknowledge();

    if (!alreadyAcknowledged) {
      await announcement.incrementAcknowledgmentCount();
    }

    sendSuccess(res, { acknowledgedAt: acknowledgment.acknowledgedAt });
  } catch (error) {
    next(error);
  }
};

/**
 * Get announcement engagement stats for the current user.
 * @route GET /api/announcements/user/engagement-stats
 */
export const getUserEngagementStats = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id");

    const stats = await AcknowledgmentAccount.getUserEngagementStats(
      dbUser._id,
      parseInt(days, 10) || 30,
    );

    sendSuccess(res, stats[0] || {});
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent announcements in the admin's accessible scope.
 * @route GET /api/announcements/admin
 */
export const getAdminAnnouncements = async (req, res, next) => {
  try {
    const { limit = 20, branch } = req.query;
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id role branch");
    const query = {
      isArchived: false,
      visibility: "tenants-only",
    };

    if (dbUser.role === "owner") {
      if (ROOM_BRANCHES.includes(branch)) {
        query.$or = [{ targetBranch: "both" }, { targetBranch: branch }];
      } else if (branch === "both") {
        query.targetBranch = "both";
      }
    } else {
      if (!dbUser.branch) {
        throw new AppError(
          "Branch admin is missing a branch assignment",
          400,
          "ADMIN_BRANCH_NOT_CONFIGURED",
        );
      }
      query.$or = [{ targetBranch: "both" }, { targetBranch: dbUser.branch }];
    }

    const announcements = await Announcement.find(query)
      .sort({ publishedAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 20, 100))
      .populate("publishedBy", "firstName lastName email")
      .lean();

    sendSuccess(res, {
      count: announcements.length,
      announcements: announcements.map(serializeAdminAnnouncement),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create and publish a new admin announcement.
 * @route POST /api/announcements
 */
export const createAnnouncement = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(
      req.user.uid,
      "_id role branch firstName lastName",
    );
    const title = clean(req.body.title).trim();
    const content = clean(req.body.content).trim();
    const category = req.body.category;
    const requiresAcknowledgment = Boolean(req.body.requiresAcknowledgment);

    if (!title || !content || !category) {
      throw new AppError(
        "Missing required fields: title, content, category",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    const targetBranch =
      dbUser.role === "owner"
        ? req.body.targetBranch || "both"
        : dbUser.branch;

    if (!targetBranch) {
      throw new AppError(
        "Branch admin is missing a branch assignment",
        400,
        "ADMIN_BRANCH_NOT_CONFIGURED",
      );
    }

    const announcement = new Announcement({
      title,
      content,
      category,
      targetBranch,
      publishedBy: dbUser._id,
      requiresAcknowledgment,
      visibility: "tenants-only",
      publishedAt: new Date(),
      startsAt: new Date(),
      isPinned: false,
      isArchived: false,
    });

    await announcement.save();

    const recipientQuery = {
      role: "tenant",
      isArchived: false,
      accountStatus: "active",
      branch:
        targetBranch === "both"
          ? { $in: ROOM_BRANCHES }
          : targetBranch,
    };

    const recipients = await User.find(recipientQuery)
      .select("_id")
      .lean();

    if (requiresAcknowledgment && recipients.length > 0) {
      await AcknowledgmentAccount.createForAnnouncement(
        announcement._id,
        recipients.map((recipient) => recipient._id),
      );
    }

    const notifications = await Promise.all(
      recipients.map(async (recipient) => {
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

    const plainAnnouncement = announcement.toObject();
    await auditLogger.logModification(
      req,
      "announcement",
      announcement._id,
      null,
      plainAnnouncement,
      `Published announcement for ${
        targetBranch === "both"
          ? "all branches"
          : ROOM_BRANCH_LABELS[targetBranch] || targetBranch
      }`,
    );

    sendSuccess(
      res,
      {
        announcement: {
          id: String(plainAnnouncement._id),
          title: plainAnnouncement.title,
          content: plainAnnouncement.content,
          category: plainAnnouncement.category,
          targetBranch: plainAnnouncement.targetBranch,
          requiresAcknowledgment: plainAnnouncement.requiresAcknowledgment,
          publishedAt: plainAnnouncement.publishedAt,
          publishedBy: String(plainAnnouncement.publishedBy),
        },
        recipientCount: recipients.length,
        notificationCount: notifications.filter(Boolean).length,
      },
      201,
    );
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to publish announcement");
    next(error);
  }
};

export default {
  getAnnouncements,
  getUnacknowledged,
  markAsRead,
  acknowledgeAnnouncement,
  getUserEngagementStats,
  getAdminAnnouncements,
  createAnnouncement,
};
