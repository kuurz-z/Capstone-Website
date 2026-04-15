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
import {
  buildRecipientQuery,
  dispatchAnnouncementNotifications,
  fetchAnnouncementRecipients,
  isAnnouncementLive,
  upsertAnnouncementAcknowledgmentAudience,
} from "../utils/announcementDispatch.js";

const TENANT_VISIBLE_VISIBILITY = ["public", "tenants-only"];
const ADMIN_VISIBLE_PUBLICATION_STATUSES = new Set([
  "draft",
  "scheduled",
  "published",
  "superseded",
]);
const LIVE_PUBLICATION_STATUSES = ["scheduled", "published"];

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

const toOptionalText = (value) => {
  if (value == null) return null;
  const sanitized = clean(String(value)).trim();
  return sanitized ? sanitized : null;
};

const parseOptionalDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      `Invalid ${fieldName} value`,
      400,
      "INVALID_ANNOUNCEMENT_DATE",
      { field: fieldName },
    );
  }

  return parsed;
};

const normalizeContentType = (value, fallbackCategory = null) => {
  const normalized = String(
    value || (fallbackCategory === "policy" ? "policy" : "announcement"),
  )
    .trim()
    .toLowerCase();

  if (!["announcement", "policy"].includes(normalized)) {
    throw new AppError(
      "Invalid announcement contentType",
      400,
      "INVALID_ANNOUNCEMENT_TYPE",
    );
  }

  return normalized;
};

const normalizePublicationStatus = (value, startsAt) => {
  const normalized = String(value || "").trim().toLowerCase();
  const now = new Date();

  if (!normalized) {
    return startsAt && startsAt > now ? "scheduled" : "published";
  }

  if (!ADMIN_VISIBLE_PUBLICATION_STATUSES.has(normalized)) {
    throw new AppError(
      "Invalid publication status",
      400,
      "INVALID_PUBLICATION_STATUS",
    );
  }

  if (normalized === "superseded") {
    return "published";
  }

  if (normalized === "scheduled" && startsAt && startsAt <= now) {
    return "published";
  }

  return normalized;
};

const getDerivedPublicationState = (announcement) => {
  const now = new Date();
  if (announcement.isArchived) return "archived";
  if (announcement.publicationStatus === "draft") return "draft";
  if (announcement.publicationStatus === "superseded") return "superseded";
  if (announcement.endsAt && announcement.endsAt <= now) return "expired";
  if (announcement.startsAt && announcement.startsAt > now) return "scheduled";
  return "published";
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
    publicationStatus: { $in: LIVE_PUBLICATION_STATUSES },
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
  contentType: announcement.contentType || "announcement",
  publicationStatus: getDerivedPublicationState(announcement),
  date: announcement.publishedAt || announcement.startsAt || announcement.createdAt,
  startsAt: announcement.startsAt || null,
  endsAt: announcement.endsAt || null,
  effectiveDate: announcement.effectiveDate || null,
  version: announcement.version || 1,
  policyKey: announcement.policyKey || null,
  requiresAck: Boolean(announcement.requiresAcknowledgment),
  isPinned: Boolean(announcement.isPinned),
  unread: !engagement?.isRead,
  acknowledged: Boolean(engagement?.isAcknowledged),
  acknowledgedAt: engagement?.acknowledgedAt || null,
});

const serializeAdminAnnouncement = (announcement, stats = {}) => {
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
    contentType: announcement.contentType || "announcement",
    targetBranch: announcement.targetBranch,
    requiresAcknowledgment: Boolean(announcement.requiresAcknowledgment),
    publishedAt: announcement.publishedAt,
    startsAt: announcement.startsAt || null,
    endsAt: announcement.endsAt || null,
    publicationStatus: getDerivedPublicationState(announcement),
    effectiveDate: announcement.effectiveDate || null,
    policyKey: announcement.policyKey || null,
    version: announcement.version || 1,
    previousVersionId: announcement.previousVersionId
      ? String(announcement.previousVersionId)
      : null,
    supersededById: announcement.supersededById
      ? String(announcement.supersededById)
      : null,
    notificationDispatchedAt: announcement.notificationDispatchedAt || null,
    isPinned: Boolean(announcement.isPinned),
    viewCount: announcement.viewCount || 0,
    acknowledgmentCount: announcement.acknowledgmentCount || 0,
    recipientCount: stats.recipientCount || 0,
    acknowledgmentCompletionPercent: stats.recipientCount
      ? Math.round(
          ((announcement.acknowledgmentCount || 0) / stats.recipientCount) * 100,
        )
      : 0,
    publishedBy:
      publisher && typeof publisher === "object"
        ? String(publisher._id || "")
        : String(announcement.publishedBy || ""),
    publishedByName,
  };
};

const assertAdminAnnouncementScope = (user, announcement) => {
  if (user.role === "owner") {
    return;
  }

  if (!user.branch) {
    throw new AppError(
      "Branch admin is missing a branch assignment",
      400,
      "ADMIN_BRANCH_NOT_CONFIGURED",
    );
  }

  if (announcement.targetBranch !== user.branch) {
    throw new AppError(
      "Not authorized to manage announcements outside your branch",
      403,
      "FORBIDDEN",
    );
  }
};

const populateAnnouncementAudience = async (announcements) => {
  const targetBranches = [...new Set(announcements.map((entry) => entry.targetBranch))];
  const audienceCounts = new Map();

  await Promise.all(
    targetBranches.map(async (targetBranch) => {
      const recipientCount = await User.countDocuments(buildRecipientQuery(targetBranch));
      audienceCounts.set(targetBranch, recipientCount);
    }),
  );

  return audienceCounts;
};

const syncPolicyVersionLinks = async (announcement) => {
  if (announcement.contentType !== "policy" || !announcement.policyKey) {
    announcement.previousVersionId = null;
    return;
  }

  if ((announcement.version || 1) <= 1) {
    announcement.previousVersionId = null;
    return;
  }

  const previousPolicy = await Announcement.findOne({
    _id: { $ne: announcement._id },
    contentType: "policy",
    policyKey: announcement.policyKey,
    targetBranch: announcement.targetBranch,
    version: { $lt: announcement.version || 1 },
    isArchived: false,
  }).sort({ version: -1 });

  announcement.previousVersionId = previousPolicy?._id || null;

  if (!previousPolicy || announcement.publicationStatus === "draft") {
    return;
  }

  previousPolicy.supersededById = announcement._id;
  if ((announcement.effectiveDate || announcement.startsAt || null) > new Date()) {
    previousPolicy.endsAt = announcement.effectiveDate || announcement.startsAt;
  } else {
    previousPolicy.publicationStatus = "superseded";
    previousPolicy.endsAt =
      announcement.effectiveDate || announcement.startsAt || previousPolicy.endsAt;
  }
  await previousPolicy.save();
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
      .sort({ isPinned: -1, startsAt: -1, createdAt: -1 })
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
      .sort({ isPinned: -1, startsAt: -1, createdAt: -1 })
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
      query.targetBranch = dbUser.branch;
    }

    const announcements = await Announcement.find(query)
      .sort({ startsAt: -1, createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 20, 100))
      .populate("publishedBy", "firstName lastName email")
      .lean();
    const audienceCounts = await populateAnnouncementAudience(announcements);

    sendSuccess(res, {
      count: announcements.length,
      announcements: announcements.map((announcement) =>
        serializeAdminAnnouncement(announcement, {
          recipientCount: audienceCounts.get(announcement.targetBranch) || 0,
        }),
      ),
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
      "_id role branch firstName lastName email",
    );
    const title = toOptionalText(req.body.title);
    const content = toOptionalText(req.body.content);
    const category = req.body.category;
    const requiresAcknowledgment = Boolean(req.body.requiresAcknowledgment);
    const startsAt = parseOptionalDate(req.body.startsAt, "startsAt") || new Date();
    const endsAt = parseOptionalDate(req.body.endsAt, "endsAt");
    const effectiveDate = parseOptionalDate(req.body.effectiveDate, "effectiveDate");
    const publicationStatus = normalizePublicationStatus(
      req.body.publicationStatus,
      startsAt,
    );
    const contentType = normalizeContentType(req.body.contentType, category);

    if (!title || !content || !category) {
      throw new AppError(
        "Missing required fields: title, content, category",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }
    if (endsAt && startsAt && endsAt <= startsAt) {
      throw new AppError(
        "Announcement end date must be after start date.",
        400,
        "INVALID_ANNOUNCEMENT_DATE_RANGE",
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
      contentType,
      targetBranch,
      publishedBy: dbUser._id,
      requiresAcknowledgment,
      visibility: "tenants-only",
      publicationStatus,
      publishedAt: publicationStatus === "published" ? new Date() : null,
      startsAt,
      endsAt,
      effectiveDate:
        contentType === "policy" ? effectiveDate || startsAt : null,
      policyKey:
        contentType === "policy"
          ? toOptionalText(req.body.policyKey) ||
            String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
          : null,
      version:
        contentType === "policy"
          ? Math.max(1, Number.parseInt(req.body.version, 10) || 1)
          : 1,
      isPinned: Boolean(req.body.isPinned),
      isArchived: false,
    });

    await syncPolicyVersionLinks(announcement);
    await announcement.save();

    const recipients =
      announcement.requiresAcknowledgment || isAnnouncementLive(announcement)
        ? await fetchAnnouncementRecipients(targetBranch)
        : [];

    if (
      requiresAcknowledgment &&
      recipients.length > 0 &&
      !isAnnouncementLive(announcement)
    ) {
      await upsertAnnouncementAcknowledgmentAudience(announcement, recipients);
    }

    const dispatchResult = await dispatchAnnouncementNotifications(
      announcement,
      { recipients },
    );

    const plainAnnouncement = announcement.toObject();
    await auditLogger.logModification(
      req,
      "announcement",
      announcement._id,
      null,
      plainAnnouncement,
      `${contentType === "policy" ? "Saved policy" : "Saved announcement"} for ${
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
          contentType: plainAnnouncement.contentType,
          targetBranch: plainAnnouncement.targetBranch,
          requiresAcknowledgment: plainAnnouncement.requiresAcknowledgment,
          publishedAt: plainAnnouncement.publishedAt,
          startsAt: plainAnnouncement.startsAt,
          endsAt: plainAnnouncement.endsAt,
          publicationStatus: getDerivedPublicationState(plainAnnouncement),
          effectiveDate: plainAnnouncement.effectiveDate || null,
          policyKey: plainAnnouncement.policyKey || null,
          version: plainAnnouncement.version || 1,
          notificationDispatchedAt:
            plainAnnouncement.notificationDispatchedAt || null,
          publishedBy: String(plainAnnouncement.publishedBy),
        },
        recipientCount: recipients.length,
        notificationCount: dispatchResult.notificationCount,
      },
      201,
    );
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to publish announcement");
    next(error);
  }
};

/**
 * Update an existing announcement.
 * @route PUT /api/announcements/:id
 */
export const updateAnnouncement = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(
      req.user.uid,
      "_id role branch firstName lastName email"
    );
    const { id } = req.params;
    
    const announcement = await Announcement.findById(id);
    if (!announcement) {
      throw new AppError("Announcement not found", 404, "NOT_FOUND");
    }

    assertAdminAnnouncementScope(dbUser, announcement);

    if (req.body.title !== undefined) {
      announcement.title = toOptionalText(req.body.title) || announcement.title;
    }
    if (req.body.content !== undefined) {
      announcement.content = toOptionalText(req.body.content) || announcement.content;
    }
    if (req.body.category) announcement.category = req.body.category;
    if (req.body.contentType !== undefined) {
      announcement.contentType = normalizeContentType(
        req.body.contentType,
        announcement.category,
      );
    } else {
      announcement.contentType = normalizeContentType(
        announcement.contentType,
        announcement.category,
      );
    }
    if (req.body.targetBranch && dbUser.role === "owner") {
      announcement.targetBranch = req.body.targetBranch;
    }
    if (req.body.requiresAcknowledgment !== undefined) {
      announcement.requiresAcknowledgment = Boolean(req.body.requiresAcknowledgment);
    }
    if (req.body.isPinned !== undefined) {
      announcement.isPinned = Boolean(req.body.isPinned);
    }
    if (req.body.startsAt !== undefined) {
      announcement.startsAt =
        parseOptionalDate(req.body.startsAt, "startsAt") || announcement.startsAt;
    }
    if (req.body.endsAt !== undefined) {
      announcement.endsAt = parseOptionalDate(req.body.endsAt, "endsAt");
    }
    if (req.body.publicationStatus !== undefined || req.body.startsAt !== undefined) {
      announcement.publicationStatus = normalizePublicationStatus(
        req.body.publicationStatus || announcement.publicationStatus,
        announcement.startsAt,
      );
      announcement.publishedAt =
        announcement.publicationStatus === "published"
          ? announcement.publishedAt || new Date()
          : null;
    }
    if (announcement.endsAt && announcement.startsAt && announcement.endsAt <= announcement.startsAt) {
      throw new AppError(
        "Announcement end date must be after start date.",
        400,
        "INVALID_ANNOUNCEMENT_DATE_RANGE",
      );
    }

    if (announcement.contentType === "policy") {
      if (req.body.policyKey !== undefined) {
        announcement.policyKey =
          toOptionalText(req.body.policyKey) || announcement.policyKey;
      }
      if (req.body.version !== undefined) {
        announcement.version = Math.max(
          1,
          Number.parseInt(req.body.version, 10) || announcement.version || 1,
        );
      }
      if (req.body.effectiveDate !== undefined) {
        announcement.effectiveDate =
          parseOptionalDate(req.body.effectiveDate, "effectiveDate") ||
          announcement.effectiveDate;
      }
    } else {
      announcement.policyKey = null;
      announcement.version = 1;
      announcement.effectiveDate = null;
      announcement.previousVersionId = null;
      announcement.supersededById = null;
    }

    await syncPolicyVersionLinks(announcement);
    await announcement.save();
    const recipients =
      announcement.requiresAcknowledgment || isAnnouncementLive(announcement)
        ? await fetchAnnouncementRecipients(announcement.targetBranch)
        : [];

    if (
      announcement.requiresAcknowledgment &&
      recipients.length > 0 &&
      !isAnnouncementLive(announcement)
    ) {
      await upsertAnnouncementAcknowledgmentAudience(announcement, recipients);
    }

    await dispatchAnnouncementNotifications(announcement, { recipients });

    await auditLogger.logModification(
      req,
      "announcement",
      announcement._id,
      null,
      announcement.toObject(),
      `Updated announcement: ${announcement.title}`,
    );

    sendSuccess(res, {
      announcement: serializeAdminAnnouncement(announcement.toObject(), {
        recipientCount: recipients.length,
      }),
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update announcement");
    next(error);
  }
};

/**
 * Delete an announcement.
 * @route DELETE /api/announcements/:id
 */
export const deleteAnnouncement = async (req, res, next) => {
  try {
    const dbUser = await getDbUserOrThrow(req.user.uid, "_id role branch");
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      throw new AppError("Announcement not found", 404, "NOT_FOUND");
    }

    assertAdminAnnouncementScope(dbUser, announcement);

    announcement.isArchived = true;
    await announcement.save();

    await auditLogger.logModification(
      req,
      "announcement",
      announcement._id,
      null,
      announcement.toObject(),
      `Archived announcement: ${announcement.title}`,
    );

    sendSuccess(res, { message: "Announcement archived successfully" });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to delete announcement");
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
  updateAnnouncement,
  deleteAnnouncement,
};
