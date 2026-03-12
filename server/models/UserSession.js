/**
 * ============================================================================
 * USER SESSION MODEL
 * ============================================================================
 *
 * Tracks user login sessions for security monitoring.
 *
 * FEATURES:
 * - Track device, IP, and login times
 * - Detect suspicious activity (multiple concurrent sessions)
 * - Allow admin to force-logout sessions
 *
 * AUTO-CLEANUP:
 * - Inactive sessions are auto-deleted after 30 days via TTL index
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const userSessionSchema = new mongoose.Schema(
  {
    // --- Session Identity ---
    sessionId: {
      type: String,
      required: true,
      unique: true,
      default: () => `SES-${uuidv4()}`,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // --- Device & Network ---
    device: {
      type: String,
      default: "Unknown",
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },

    // --- Timestamps ---
    loginTime: {
      type: Date,
      default: Date.now,
    },
    logoutTime: {
      type: Date,
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    // --- Status ---
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

userSessionSchema.index({ userId: 1, isActive: 1 });
userSessionSchema.index({ userId: 1, loginTime: -1 });

// TTL: auto-delete inactive sessions after 30 days
userSessionSchema.index(
  { logoutTime: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { isActive: false } },
);

// ============================================================================
// METHODS
// ============================================================================

/**
 * End this session
 */
userSessionSchema.methods.endSession = async function () {
  this.isActive = false;
  this.logoutTime = new Date();
  return this.save();
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Create a new session
 */
userSessionSchema.statics.createSession = async function (userId, req) {
  const session = new this({
    userId,
    device: req.headers["x-device-name"] || parseDevice(req.headers["user-agent"]),
    ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
    userAgent: req.headers["user-agent"],
  });
  return session.save();
};

/**
 * Get active sessions for a user
 */
userSessionSchema.statics.getActiveSessions = function (userId) {
  return this.find({ userId, isActive: true }).sort({ loginTime: -1 });
};

/**
 * Force-logout all sessions for a user
 */
userSessionSchema.statics.forceLogoutAll = async function (userId) {
  return this.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false, logoutTime: new Date() } },
  );
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

const UserSession = mongoose.model("UserSession", userSessionSchema);

export default UserSession;
