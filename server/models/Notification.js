/**
 * ============================================================================
 * NOTIFICATION MODEL
 * ============================================================================
 *
 * Central notification system for in-app user notifications.
 *
 * TRIGGERS:
 * - Reservation confirmation / cancellation
 * - Visit approval / rejection
 * - Payment verification (approved / rejected)
 * - Bill generation / due reminders
 * - Grace period warnings
 * - Move-in reminders
 * - Account status changes
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const notificationSchema = new mongoose.Schema(
  {
    // --- Target User ---
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // --- Notification Content ---
    type: {
      type: String,
      required: true,
      enum: [
        "reservation_confirmed",
        "reservation_cancelled",
        "reservation_expired",
        "reservation_noshow",
        "visit_approved",
        "visit_rejected",
        "payment_approved",
        "payment_rejected",
        "bill_generated",
        "bill_due_reminder",
        "penalty_applied",
        "contract_expiring",
        "grace_period_warning",
        "move_in_reminder",
        "account_suspended",
        "account_reactivated",
        "maintenance_update",
        "announcement",
        "sla_breach",
        "chat_unresponded",
        "general",
      ],
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },

    // --- Read Status ---
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },

    // --- Optional Link ---
    actionUrl: {
      type: String,
      default: null,
    },

    // --- Optional Entity Reference ---
    entityType: {
      type: String,
      enum: ["reservation", "bill", "room", "user", "maintenance", "chat", ""],
      default: "",
    },
    entityId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

// TTL: auto-delete read notifications after 90 days
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { isRead: true } },
);

// ============================================================================
// METHODS
// ============================================================================

notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Get notifications for a user (paginated)
 */
notificationSchema.statics.getForUser = async function (userId, options = {}) {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    this.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.countDocuments(filter),
    this.countDocuments({ userId, isRead: false }),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Mark all notifications as read for a user
 */
notificationSchema.statics.markAllAsRead = async function (userId) {
  return this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
};

// ============================================================================
// EXPORT
// ============================================================================

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
