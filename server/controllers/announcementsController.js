/**
 * ============================================================================
 * ANNOUNCEMENTS CONTROLLER
 * ============================================================================
 *
 * Handles announcements with branch-specific targeting and engagement tracking.
 * Supports acknowledgment flow and engagement metrics for AI features.
 *
 * ============================================================================
 */

import { Announcement, AcknowledgmentAccount, User } from "../models/index.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";

/**
 * Get announcements for logged-in user's branch
 * @route GET /api/announcements?limit=50&category=reminder
 * @access Private
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const { branch } = req.user;
    const { limit = 50, category } = req.query;

    const query = {
      $or: [{ targetBranch: "both" }, { targetBranch: branch }],
      isArchived: false,
    };

    if (category) {
      query.category = category;
    }

    const announcements = await Announcement.find(query)
      .sort({ isPinned: -1, publishedAt: -1 })
      .limit(Math.min(parseInt(limit), 100));

    sendSuccess(res, {
      count: announcements.length,
      announcements: announcements.map((a) => ({
        id: a._id,
        title: a.title,
        content: a.content,
        category: a.category,
        date: a.publishedAt,
        requiresAck: a.requiresAcknowledgment,
        isPinned: a.isPinned,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get unacknowledged announcements for current user
 * @route GET /api/announcements/unacknowledged
 * @access Private
 */
export const getUnacknowledged = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { branch } = req.user;

    const unacknowledged = await Announcement.getUnacknowledgedForUser(
      userId,
      branch,
    );

    sendSuccess(res, {
      count: unacknowledged.length,
      announcements: unacknowledged.map((a) => ({
        id: a._id,
        title: a.title,
        content: a.content,
        category: a.category,
        date: a.publishedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark announcement as read
 * @route POST /api/announcements/:announcementId/read
 * @access Private
 */
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { announcementId } = req.params;

    // Find or create acknowledgment account
    let ackAccount = await AcknowledgmentAccount.findOne({
      userId,
      announcementId,
    });

    if (!ackAccount) {
      ackAccount = new AcknowledgmentAccount({
        userId,
        announcementId,
      });
    }

    await ackAccount.markAsRead();

    // Increment view count on announcement
    const announcement = await Announcement.findById(announcementId);
    if (announcement) {
      await announcement.incrementViewCount();
    }

    sendSuccess(res, { readAt: ackAccount.readAt });
  } catch (error) {
    next(error);
  }
};

/**
 * Acknowledge announcement
 * @route POST /api/announcements/:announcementId/acknowledge
 * @access Private
 */
export const acknowledgeAnnouncement = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { announcementId } = req.params;

    // Find or create acknowledgment account
    let ackAccount = await AcknowledgmentAccount.findOne({
      userId,
      announcementId,
    });

    if (!ackAccount) {
      ackAccount = new AcknowledgmentAccount({
        userId,
        announcementId,
      });
    }

    await ackAccount.acknowledge();

    // Increment acknowledgment count on announcement
    const announcement = await Announcement.findById(announcementId);
    if (announcement) {
      await announcement.incrementAcknowledgmentCount();
    }

    sendSuccess(res, { acknowledgedAt: ackAccount.acknowledgedAt });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's engagement stats (for AI personalization)
 * @route GET /api/announcements/user/engagement-stats
 * @access Private
 */
export const getUserEngagementStats = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { days = 30 } = req.query;

    const stats = await AcknowledgmentAccount.getUserEngagementStats(
      userId,
      parseInt(days),
    );

    sendSuccess(res, stats[0] || {});
  } catch (error) {
    next(error);
  }
};

/**
 * Create new announcement (Admin only)
 * @route POST /api/announcements
 * @access Private (Admin only)
 */
export const createAnnouncement = async (req, res, next) => {
  try {
    const publishedBy = req.user.uid;
    const {
      title,
      content,
      category,
      targetBranch,
      requiresAcknowledgment,
      visibility,
    } = req.body;

    // Validate inputs
    if (!title || !content || !category) {
      throw new AppError(
        "Missing required fields: title, content, category",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    const announcement = new Announcement({
      title,
      content,
      category,
      targetBranch: targetBranch || "both",
      publishedBy,
      requiresAcknowledgment: requiresAcknowledgment || false,
      visibility: visibility || "public",
    });

    await announcement.save();

    // Create acknowledgment accounts for all relevant users
    if (requiresAcknowledgment) {
      const query = {
        role: { $in: ["tenant", "user"] },
      };

      if (targetBranch && targetBranch !== "both") {
        query.branch = targetBranch;
      }

      const relevantUsers = await User.find(query).select("_id");
      const userIds = relevantUsers.map((u) => u._id);

      if (userIds.length > 0) {
        await AcknowledgmentAccount.createForAnnouncement(
          announcement._id,
          userIds,
        );
      }
    }

    sendSuccess(res, { announcement: announcement.toObject() }, 201);
  } catch (error) {
    next(error);
  }
};

export default {
  getAnnouncements,
  getUnacknowledged,
  markAsRead,
  acknowledgeAnnouncement,
  getUserEngagementStats,
  createAnnouncement,
};
