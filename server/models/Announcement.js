/**
 * ============================================================================
 * ANNOUNCEMENT MODEL
 * ============================================================================
 *
 * Stores system announcements with branch-specific targeting.
 * Supports acknowledgment tracking and multi-branch campaigns.
 *
 * BRANCH TARGETING:
 * - "both" = all branches
 * - "gil-puyat" = Gil Puyat branch only
 * - "guadalupe" = Guadalupe branch only
 *
 * FOR AI FEATURES:
 * - Engagement metrics for content analysis
 * - Read/acknowledge rates for optimization
 * - Category patterns for personalization
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const announcementSchema = new mongoose.Schema(
  {
    // --- Content ---
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["reminder", "maintenance", "policy", "event", "alert", "general"],
      required: true,
      index: true,
    },

    // --- Targeting & Visibility ---
    targetBranch: {
      type: String,
      enum: ["both", "gil-puyat", "guadalupe"],
      default: "both",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "tenants-only", "staff-only"],
      default: "public",
      index: true,
    },

    // --- Publication ---
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // --- Engagement Settings ---
    requiresAcknowledgment: {
      type: Boolean,
      default: false,
    },

    // --- Scheduling ---
    startsAt: {
      type: Date,
      default: Date.now,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },

    // --- Engagement Metrics (for AI) ---
    viewCount: {
      type: Number,
      default: 0,
    },
    acknowledgmentCount: {
      type: Number,
      default: 0,
    },

    // --- Metadata ---
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES FOR PERFORMANCE
// ============================================================================

// For filtering active announcements by branch
announcementSchema.index({ targetBranch: 1, isArchived: 1, publishedAt: -1 });
announcementSchema.index({ category: 1, targetBranch: 1, isArchived: 1 });

// For pinned announcements
announcementSchema.index({ isPinned: -1, publishedAt: -1 });

// For time-based queries (AI analysis)
announcementSchema.index({ publishedAt: -1, viewCount: -1 });
announcementSchema.index({ category: 1, publishedAt: -1 });

// ============================================================================
// INSTANCE METHODS
// ============================================================================

announcementSchema.methods.incrementViewCount = function () {
  this.viewCount += 1;
  return this.save();
};

announcementSchema.methods.incrementAcknowledgmentCount = function () {
  this.acknowledgmentCount += 1;
  return this.save();
};

announcementSchema.methods.isActive = function () {
  const now = new Date();
  return (
    this.startsAt <= now &&
    (!this.endsAt || this.endsAt > now) &&
    !this.isArchived
  );
};

// ============================================================================
// STATIC METHODS
// ============================================================================

// Find active announcements for a specific branch
announcementSchema.statics.findForBranch = function (branch, options = {}) {
  const now = new Date();
  const query = {
    $and: [
      { $or: [{ targetBranch: "both" }, { targetBranch: branch }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ],
    startsAt: { $lte: now },
    isArchived: false,
  };

  return this.find(query)
    .sort({ isPinned: -1, publishedAt: -1 })
    .limit(options.limit || 50);
};

// Get unacknowledged announcements for a user
announcementSchema.statics.getUnacknowledgedForUser = async function (
  userId,
  branch,
) {
  const AcknowledgmentAccount = mongoose.model("AcknowledgmentAccount");

  // Find all announcements requiring acknowledgment
  const announcements = await this.findForBranch(branch);
  const requiresAck = announcements.filter((a) => a.requiresAcknowledgment);

  // Get already acknowledged IDs
  const acknowledged = await AcknowledgmentAccount.find({
    userId,
    announcementId: { $in: requiresAck.map((a) => a._id) },
  }).distinct("announcementId");

  // Return unacknowledged
  return requiresAck.filter((a) => !acknowledged.includes(a._id.toString()));
};

// Get engagement stats by category (for AI analysis)
announcementSchema.statics.getEngagementStats = async function (branch) {
  return this.aggregate([
    {
      $match: {
        $or: [{ targetBranch: "both" }, { targetBranch: branch }],
        isArchived: false,
      },
    },
    {
      $group: {
        _id: "$category",
        avgViewCount: { $avg: "$viewCount" },
        avgAckCount: { $avg: "$acknowledgmentCount" },
        count: { $sum: 1 },
      },
    },
  ]);
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

export default mongoose.model("Announcement", announcementSchema);
