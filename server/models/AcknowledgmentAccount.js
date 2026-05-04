/**
 * ============================================================================
 * ACKNOWLEDGMENT ACCOUNT MODEL
 * ============================================================================
 *
 * Tracks which users have acknowledged specific announcements.
 * Supports multi-branch environments and engagement analytics.
 *
 * BRANCH ISOLATION:
 * - Implicit through announcements (announcements have targetBranch)
 * - Can query acknowledgments filtered by user's branch
 *
 * FOR AI FEATURES:
 * - Engagement patterns for notification optimization
 * - User behavior tracking for personalization
 * - Response time analysis for timing optimization
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const acknowledgmentAccountSchema = new mongoose.Schema(
  {
    // --- User & Announcement ---
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    announcementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Announcement",
      required: true,
      index: true,
    },

    // --- Acknowledgment Status ---
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isAcknowledged: {
      type: Boolean,
      default: false,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },

    // --- Metadata ---
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES FOR PERFORMANCE
// ============================================================================

// Unique constraint: one record per user per announcement
acknowledgmentAccountSchema.index(
  { userId: 1, announcementId: 1 },
  { unique: true },
);

// For finding unacknowledged announcements
acknowledgmentAccountSchema.index({ userId: 1, isAcknowledged: 1 });
acknowledgmentAccountSchema.index({ userId: 1, isRead: 1 });

// For engagement analytics
acknowledgmentAccountSchema.index({ announcementId: 1, isAcknowledged: 1 });
acknowledgmentAccountSchema.index({ createdAt: -1, isAcknowledged: 1 });

// ============================================================================
// INSTANCE METHODS
// ============================================================================

acknowledgmentAccountSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

acknowledgmentAccountSchema.methods.acknowledge = function () {
  this.isAcknowledged = true;
  this.acknowledgedAt = new Date();
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
  return this.save();
};

acknowledgmentAccountSchema.methods.getReadLatencyMs = function () {
  if (!this.readAt) return null;
  return this.readAt - this.createdAt;
};

acknowledgmentAccountSchema.methods.getAcknowledgmentLatencyMs = function () {
  if (!this.acknowledgedAt) return null;
  return this.acknowledgedAt - this.createdAt;
};

// ============================================================================
// STATIC METHODS
// ============================================================================

// Get unacknowledged announcements for a user
acknowledgmentAccountSchema.statics.getUnacknowledgedForUser = function (
  userId,
) {
  return this.find({
    userId,
    isAcknowledged: false,
  })
    .populate("announcementId")
    .sort({ createdAt: -1 });
};

// Get unread announcements for a user
acknowledgmentAccountSchema.statics.getUnreadForUser = function (userId) {
  return this.find({
    userId,
    isRead: false,
  })
    .populate("announcementId")
    .sort({ createdAt: -1 });
};

// Bulk create acknowledgment accounts for new announcement
acknowledgmentAccountSchema.statics.createForAnnouncement = async function (
  announcementId,
  userIds,
) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  const records = userIds.map((userId) => ({
    userId,
    announcementId,
  }));

  try {
    return await this.insertMany(records, { ordered: false });
  } catch (error) {
    if (error?.code === 11000 || Array.isArray(error?.writeErrors)) {
      return [];
    }
    throw error;
  }
};

// Get engagement metrics for an announcement
acknowledgmentAccountSchema.statics.getEngagementMetrics = async function (
  announcementId,
) {
  return this.aggregate([
    { $match: { announcementId } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        readCount: {
          $sum: { $cond: ["$isRead", 1, 0] },
        },
        acknowledgedCount: {
          $sum: { $cond: ["$isAcknowledged", 1, 0] },
        },
        avgReadLatency: {
          $avg: {
            $cond: ["$readAt", { $subtract: ["$readAt", "$createdAt"] }, null],
          },
        },
      },
    },
  ]);
};

// Get user engagement stats (for AI personalization)
acknowledgmentAccountSchema.statics.getUserEngagementStats = async function (
  userId,
  days = 30,
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalAnnouncements: { $sum: 1 },
        readCount: {
          $sum: { $cond: ["$isRead", 1, 0] },
        },
        acknowledgedCount: {
          $sum: { $cond: ["$isAcknowledged", 1, 0] },
        },
        avgReadLatency: {
          $avg: {
            $cond: ["$readAt", { $subtract: ["$readAt", "$createdAt"] }, null],
          },
        },
      },
    },
  ]);
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

export default mongoose.model(
  "AcknowledgmentAccount",
  acknowledgmentAccountSchema,
);
