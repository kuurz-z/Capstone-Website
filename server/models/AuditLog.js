/**
 * ============================================================================
 * AUDIT LOG MODEL
 * ============================================================================
 *
 * Stores comprehensive audit trail for all system activities.
 *
 * ACTIVITY TYPES:
 * - login: User login/logout events
 * - registration: User registration events
 * - data_modification: Creates and updates to data
 * - data_deletion: Deletion operations
 * - error: System errors and failures
 *
 * SEVERITY LEVELS:
 * - info: Normal operations
 * - warning: Potential issues (failed logins, etc.)
 * - high: Important operations (permission changes)
 * - critical: Critical operations (deletions, errors)
 *
 * RETENTION:
 * - Logs should be retained for minimum 1 year
 * - Archive old logs after 90 days
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const auditLogSchema = new mongoose.Schema(
  {
    // --- Log Identification ---
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // --- Timestamp ---
    timestamp: {
      type: Date,
      default: Date.now,
    },

    // --- Activity Type ---
    type: {
      type: String,
      required: true,
      enum: [
        "login",
        "registration",
        "data_modification",
        "data_deletion",
        "error",
      ],
      index: true,
    },

    // --- Action Description ---
    action: {
      type: String,
      required: true,
    },

    // --- Severity Level ---
    severity: {
      type: String,
      required: true,
      enum: ["info", "warning", "high", "critical"],
      index: true,
    },

    // --- User Information ---
    user: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userRole: {
      type: String,
    },

    // --- Network Information ---
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },

    // --- Branch Information ---
    branch: {
      type: String,
      enum: ["gil-puyat", "guadalupe", "general", ""],
      index: true,
    },

    // --- Additional Details ---
    details: {
      type: String,
    },

    // --- Structured Metadata ---
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    // --- Entity Reference (for data operations) ---
    entityType: {
      type: String,
      enum: [
        "user",
        "room",
        "reservation",
        "inquiry",
        "billing",
        "announcement",
        "system",
        "",
      ],
    },
    entityId: {
      type: String,
    },
  },
  {
    timestamps: false, // We use our own timestamp field
    collection: "auditLogs",
  },
);

// ============================================================================
// INDEXES
// ============================================================================

// Compound indexes for common queries
auditLogSchema.index({ timestamp: -1, type: 1 });
auditLogSchema.index({ timestamp: -1, severity: 1 });
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ branch: 1, timestamp: -1 });

// TTL index — auto-delete non-critical logs after 365 days
// Critical logs are retained indefinitely (excluded via partialFilterExpression)
auditLogSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 365 * 24 * 60 * 60,
    partialFilterExpression: { severity: { $ne: "critical" } },
  },
);

// ============================================================================
// STATIC METHODS
// ============================================================================

/**
 * Create a new audit log entry
 * @param {Object} logData - The log data
 * @returns {Promise<AuditLog>} The created log entry
 */
auditLogSchema.statics.log = async function (logData) {
  const logId = `LOG-${uuidv4()}`;
  const entry = new this({
    logId,
    timestamp: new Date(),
    ...logData,
  });
  return await entry.save();
};

/**
 * Get logs with filters and pagination
 * @param {Object} filters - Query filters
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Logs and pagination info
 */
auditLogSchema.statics.getLogs = async function (filters = {}, options = {}) {
  const { type, severity, user, role, branch, startDate, endDate, search } =
    filters;

  const {
    limit = 100,
    offset = 0,
    sortBy = "timestamp",
    sortOrder = -1,
  } = options;

  // Build query
  const query = {};

  if (type && type !== "all") {
    query.type = type;
  }

  if (severity && severity !== "all") {
    query.severity = severity;
  }

  if (user) {
    query.user = { $regex: user, $options: "i" };
  }

  if (role && role !== "all") {
    query.userRole = role;
  }

  if (branch && branch !== "all") {
    query.branch = branch;
  }

  if (startDate) {
    query.timestamp = { ...query.timestamp, $gte: new Date(startDate) };
  }

  if (endDate) {
    query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
  }

  if (search) {
    query.$or = [
      { action: { $regex: search, $options: "i" } },
      { user: { $regex: search, $options: "i" } },
      { details: { $regex: search, $options: "i" } },
    ];
  }

  // Execute query
  const total = await this.countDocuments(query);
  const logs = await this.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(offset)
    .limit(limit)
    .lean();

  return {
    logs,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  };
};

/**
 * Get audit log statistics
 * @param {String} branch - Optional branch filter
 * @returns {Promise<Object>} Statistics object
 */
auditLogSchema.statics.getStats = async function (branch = null) {
  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0));

  const baseQuery = branch ? { branch } : {};

  const [total, critical, today, deletions, byType, bySeverity] =
    await Promise.all([
      this.countDocuments(baseQuery),
      this.countDocuments({ ...baseQuery, severity: "critical" }),
      this.countDocuments({ ...baseQuery, timestamp: { $gte: todayStart } }),
      this.countDocuments({ ...baseQuery, type: "data_deletion" }),
      this.aggregate([
        { $match: baseQuery },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      this.aggregate([
        { $match: baseQuery },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]),
    ]);

  // Convert aggregation results to objects
  const typeStats = byType.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const severityStats = bySeverity.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  return {
    total,
    critical,
    today,
    deletions,
    byType: {
      login: typeStats.login || 0,
      data_modification: typeStats.data_modification || 0,
      data_deletion: typeStats.data_deletion || 0,
      error: typeStats.error || 0,
    },
    bySeverity: {
      info: severityStats.info || 0,
      warning: severityStats.warning || 0,
      high: severityStats.high || 0,
      critical: severityStats.critical || 0,
    },
  };
};

/**
 * Get failed login attempts for security monitoring
 * @param {Number} hours - Hours to look back (default 24)
 * @returns {Promise<Object>} Failed login data
 */
auditLogSchema.statics.getFailedLogins = async function (hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  const failedLogins = await this.find({
    type: "login",
    severity: "warning",
    timestamp: { $gte: cutoffTime },
  })
    .sort({ timestamp: -1 })
    .lean();

  // Group by IP to detect brute force attempts
  const byIP = failedLogins.reduce((acc, log) => {
    const ip = log.ip || "unknown";
    if (!acc[ip]) {
      acc[ip] = [];
    }
    acc[ip].push(log);
    return acc;
  }, {});

  const suspiciousIPs = Object.entries(byIP)
    .filter(([ip, attempts]) => attempts.length >= 3)
    .map(([ip, attempts]) => ({
      ip,
      attemptCount: attempts.length,
      lastAttempt: attempts[0].timestamp,
      targetedUsers: [...new Set(attempts.map((a) => a.user))],
    }));

  return {
    totalFailedLogins: failedLogins.length,
    suspiciousIPs,
    recentAttempts: failedLogins.slice(0, 20),
  };
};

/**
 * Delete old logs (for cleanup)
 * @param {Number} daysToKeep - Number of days to keep
 * @returns {Promise<Object>} Deletion result
 */
auditLogSchema.statics.cleanupOldLogs = async function (daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
    // Don't delete critical logs
    severity: { $ne: "critical" },
  });

  return {
    deletedCount: result.deletedCount,
    cutoffDate,
  };
};

// ============================================================================
// MODEL EXPORT
// ============================================================================

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
