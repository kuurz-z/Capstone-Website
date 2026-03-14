/**
 * ============================================================================
 * LOGIN LOG MODEL
 * ============================================================================
 *
 * Tracks login/logout events for security auditing.
 *
 * PURPOSE:
 * - Audit trail for all authentication events (login, logout, failed attempts)
 * - Separate from UserSession (which tracks active sessions)
 * - LoginLog = event log, UserSession = session state
 *
 * AUTO-CLEANUP:
 * - Logs are auto-deleted after 90 days via TTL index
 *
 * ============================================================================
 */

import mongoose from "mongoose";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const loginLogSchema = new mongoose.Schema(
  {
    // --- User Reference ---
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: {
      type: String,
      default: null,
    },

    // --- Event Details ---
    action: {
      type: String,
      enum: ["login", "logout", "login_failed"],
      required: true,
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
      default: true,
    },
    failureReason: {
      type: String,
      default: null,
      // e.g. "User not found", "Account inactive", "Email not verified"
    },

    // --- Device & Network ---
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    device: {
      type: String,
      default: "Unknown",
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

loginLogSchema.index({ userId: 1, createdAt: -1 });
loginLogSchema.index({ action: 1, createdAt: -1 });

// TTL: auto-delete logs after 90 days
loginLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

// ============================================================================
// STATICS
// ============================================================================

/**
 * Log a login/logout event (fire-and-forget)
 * @param {Object} params - { userId, email, action, success, failureReason, req }
 */
loginLogSchema.statics.logEvent = async function ({
  userId = null,
  email = null,
  action,
  success = true,
  failureReason = null,
  req = null,
}) {
  try {
    await this.create({
      userId,
      email,
      action,
      success,
      failureReason,
      ipAddress: req
        ? req.ip || req.headers?.["x-forwarded-for"] || req.connection?.remoteAddress
        : null,
      userAgent: req ? req.headers?.["user-agent"] : null,
      device: req ? parseDevice(req.headers?.["user-agent"]) : "Unknown",
    });
  } catch (err) {
    // Fire-and-forget — don't break auth flow
    console.error("⚠️ LoginLog write failed (non-fatal):", err.message);
  }
};

/**
 * Get recent login history for a user
 * @param {ObjectId} userId
 * @param {number} limit
 */
loginLogSchema.statics.getRecentByUser = function (userId, limit = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Get recent failed login attempts (for security monitoring)
 * @param {number} limit
 */
loginLogSchema.statics.getRecentFailures = function (limit = 50) {
  return this.find({ success: false })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ============================================================================
// HELPERS
// ============================================================================

function parseDevice(userAgent) {
  if (!userAgent) return "Unknown";
  if (userAgent.includes("Mobile")) return "Mobile";
  if (userAgent.includes("Tablet")) return "Tablet";
  return "Desktop";
}

// ============================================================================
// EXPORT
// ============================================================================

const LoginLog = mongoose.model("LoginLog", loginLogSchema);

export default LoginLog;
