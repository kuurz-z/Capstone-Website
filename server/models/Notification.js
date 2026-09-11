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
    data: {type:mongoose.Schema.Types.Mixed, default:undefined},
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
        "reservation_cancellation_requested",
        "reservation_cancellation_rejected",
        "reservation_expired",
        "reservation_noshow",
        "visit_approved",
        "visit_rejected",
        "visit_requested",
        "visit_scheduled",
        "payment_approved",
        "payment_confirmed",
        "payment_rejected",
        "payment_proof_submitted",
        "application_submitted",
        "bill_generated",
        "bill_due_reminder",
        "penalty_applied",
        "contract_expiring",
        "contract_prepared",
        "contract_document_ready",
        "renewal_effective",
        "contract_incomplete",
        "contract_error",
        "contract_signed",
        "grace_period_warning",
        "move_in_reminder",
        "account_suspended",
        "account_reactivated",
        "maintenance_new",
        "maintenance_update",
        "inquiry_new",
        "chat_reply",
        "announcement",
        "sla_breach",
        "chat_unresponded",
        "tenant_violation",
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
      enum: ["reservation", "bill", "room", "user", "maintenance", "chat", "inquiry", "contract", "announcement", "violation", ""],
      default: "",
    },
    entityId: {
      type: String,
      default: null,
    },

    // Snapshot of the recipient lifecycle when the event was created. The
    // same account survives applicant -> tenant promotion, so current-role
    // filtering cannot safely infer historical visibility from userId alone.
    roleAtCreation: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // --- Idempotency ---
    // Deterministic key (e.g. "contract_document_ready:<contractId>:<variant>:<version>")
    // for notification events that can legitimately be triggered more than
    // once for the same underlying state (retries, redeploys, concurrent
    // requests, duplicate admin submissions) without that meaning a NEW
    // event actually happened. Optional: ordinary notifications omit this
    // field entirely so they are outside the partial unique index below.
    // A unique DB-level index (not an app-level check-then-insert) is what
    // actually makes this safe under concurrency — see
    // notificationService.js's createNotificationOnce().
    dedupeKey: {
      type: String,
      trim: true,
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
// Scope event identity to the recipient. A partial index is deliberate:
// sparse unique indexes still include documents where dedupeKey is present
// with an explicit null value, which would allow only one ordinary
// notification per tenant. This index includes only real string keys.
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  {
    unique: true,
    name: "notification_user_dedupe_unique",
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);

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

const mergeFilters = (...filters) => {
  const activeFilters = filters.filter(
    (filter) => filter && Object.keys(filter).length > 0,
  );

  if (activeFilters.length === 0) return {};
  if (activeFilters.length === 1) return activeFilters[0];
  return { $and: activeFilters };
};

const buildNotificationFilter = (userId, options = {}) => {
  const {
    unreadOnly = false,
    excludeTypes = [],
    visibilityFilter = {},
  } = options;
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;
  if (Array.isArray(excludeTypes) && excludeTypes.length > 0) {
    filter.type = { $nin: excludeTypes };
  }
  return mergeFilters(filter, visibilityFilter);
};

/**
 * Get notifications for a user (paginated)
 */
notificationSchema.statics.getForUser = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const filter = buildNotificationFilter(userId, options);
  const unreadFilter = buildNotificationFilter(userId, {
    ...options,
    unreadOnly: true,
  });

  const [notifications, total, unreadCount] = await Promise.all([
    this.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.countDocuments(filter),
    this.countDocuments(unreadFilter),
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
notificationSchema.statics.markAllAsRead = async function (userId, options = {}) {
  return this.updateMany(
    buildNotificationFilter(userId, { ...options, unreadOnly: true }),
    { $set: { isRead: true, readAt: new Date() } },
  );
};

// ============================================================================
// EXPORT
// ============================================================================

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
