/**
 * ============================================================================
 * AUDIT LOGGER UTILITY
 * ============================================================================
 *
 * Utility module for creating audit log entries throughout the application.
 * Provides convenient methods for logging different types of activities.
 *
 * Usage:
 *   import auditLogger from "../utils/auditLogger.js";
 *
 *   // Log a login event
 *   await auditLogger.logLogin(req, user, true);
 *
 *   // Log a data modification
 *   await auditLogger.logModification(req, "reservation", reservationId, oldData, newData);
 *
 *   // Log a deletion
 *   await auditLogger.logDeletion(req, "user", userId, deletedData);
 *
 *   // Log an error
 *   await auditLogger.logError(req, error, "Failed to process reservation");
 *
 * ============================================================================
 */

import AuditLog from "../models/AuditLog.js";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract client IP from request
 * @param {Object} req - Express request object
 * @returns {String} Client IP address
 */
const getClientIP = (req) => {
  if (!req) return "unknown";
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

/**
 * Get user agent from request
 * @param {Object} req - Express request object
 * @returns {String} User agent string
 */
const getUserAgent = (req) => {
  if (!req) return "unknown";
  return req.headers?.["user-agent"] || "unknown";
};

/**
 * Get user info from request
 * @param {Object} req - Express request object
 * @returns {Object} User info object
 */
const getUserInfo = (req) => {
  return {
    email: req?.user?.email || "anonymous",
    userId: req?.user?.mongoId || null,
    role:
      req?.user?.role || req?.user?.branch_admin
        ? "branch_admin"
        : req?.user?.owner
          ? "owner"
          : "applicant",
    branch: req?.user?.branch || "",
  };
};

// ============================================================================
// AUDIT LOGGER CLASS
// ============================================================================

class AuditLogger {
  /**
   * Log a login/logout event
   * @param {Object} req - Express request object
   * @param {Object|String} user - User object or email
   * @param {Boolean} success - Whether login was successful
   * @param {String} action - Custom action description (optional)
   */
  async logLogin(req, user, success = true, action = null) {
    try {
      const email = typeof user === "string" ? user : user?.email || "unknown";
      const userRole = typeof user === "object" ? user?.role : "unknown";
      const branch = typeof user === "object" ? user?.branch : null;

      // Determine details based on action or success status
      let details;
      if (action) {
        details = action;
      } else if (success) {
        details = `Login from ${getUserAgent(req)}`;
      } else {
        details = "Invalid credentials or authentication failed";
      }

      await AuditLog.log({
        type: "login",
        action:
          action ||
          (success ? "User login successful" : "Failed login attempt"),
        severity: success ? "info" : "warning",
        user: email,
        userId: typeof user === "object" ? user?._id : null,
        userRole,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch,
        details,
      });
    } catch (error) {
      console.error("Failed to log login event:", error);
    }
  }

  /**
   * Log a logout event
   * @param {Object} req - Express request object
   * @param {Object|String} user - User object or email
   */
  async logLogout(req, user) {
    try {
      const userInfo = getUserInfo(req);
      const email =
        typeof user === "string" ? user : user?.email || userInfo.email;
      const userRole = typeof user === "object" ? user?.role : userInfo.role;
      const branch = typeof user === "object" ? user?.branch : userInfo.branch;


      const result = await AuditLog.log({
        type: "login",
        action: "User logout",
        severity: "info",
        user: email,
        userId: typeof user === "object" ? user?._id : userInfo.userId,
        userRole,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch,
        details: `${userRole || "user"} logged out`,
      });
    } catch (error) {
      console.error("❌ [AuditLogger] Failed to log logout event:", error);
    }
  }

  /**
   * Log a registration event
   * @param {Object} req - Express request object
   * @param {Object|String} user - User object or email
   * @param {Boolean} success - Whether registration was successful
   * @param {String} details - Additional details about the registration
   */
  async logRegistration(req, user, success = true, details = null) {
    try {
      const email = typeof user === "string" ? user : user?.email || "unknown";
      const userRole = typeof user === "object" ? user?.role : "user";
      const branch = typeof user === "object" ? user?.branch : null;
      const userId = typeof user === "object" ? user?._id : null;
      const username = typeof user === "object" ? user?.username : null;

      await AuditLog.log({
        type: "registration",
        action: success
          ? "User Registration Successful"
          : "Registration Failed",
        severity: success ? "info" : "warning",
        user: email,
        userId,
        userRole,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch,
        entityType: "user",
        entityId: userId ? String(userId) : null,
        details:
          details ||
          (success
            ? `New user registered: ${email}${username ? ` (${username})` : ""}`
            : `Registration attempt failed for ${email}`),
      });
    } catch (error) {
      console.error("Failed to log registration event:", error);
    }
  }

  /**
   * Log a data modification (create or update)
   * @param {Object} req - Express request object
   * @param {String} entityType - Type of entity (user, room, reservation, inquiry)
   * @param {String} entityId - ID of the entity
   * @param {Object} oldData - Previous data (null for creates)
   * @param {Object} newData - New data
   * @param {String} action - Custom action description (optional)
   */
  async logModification(
    req,
    entityType,
    entityId,
    oldData = null,
    newData = null,
    action = null,
  ) {
    try {
      const userInfo = getUserInfo(req);
      const isCreate = !oldData;

      // Determine changed fields
      let changedFields = [];
      if (oldData && newData) {
        changedFields = Object.keys(newData).filter(
          (key) =>
            JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]),
        );
      }

      await AuditLog.log({
        type: "data_modification",
        action:
          action ||
          (isCreate ? `Created ${entityType}` : `Updated ${entityType}`),
        severity:
          entityType === "user" && changedFields.includes("role")
            ? "high"
            : "info",
        user: userInfo.email,
        userId: userInfo.userId,
        userRole: userInfo.role,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch: userInfo.branch,
        entityType,
        entityId: String(entityId),
        details: isCreate
          ? `Created new ${entityType} record`
          : `Modified fields: ${changedFields.join(", ") || "unknown"}`,
        metadata: {
          isCreate,
          changedFields,
          before: oldData ? this.sanitizeData(oldData) : null,
          after: newData ? this.sanitizeData(newData) : null,
        },
      });
    } catch (error) {
      console.error("Failed to log modification event:", error);
    }
  }

  /**
   * Log a data deletion
   * @param {Object} req - Express request object
   * @param {String} entityType - Type of entity (user, room, reservation, inquiry)
   * @param {String} entityId - ID of the entity
   * @param {Object} deletedData - Data that was deleted
   * @param {String} reason - Reason for deletion (optional)
   */
  async logDeletion(
    req,
    entityType,
    entityId,
    deletedData = null,
    reason = null,
  ) {
    try {
      const userInfo = getUserInfo(req);

      await AuditLog.log({
        type: "data_deletion",
        action: `Deleted ${entityType}`,
        severity: "critical",
        user: userInfo.email,
        userId: userInfo.userId,
        userRole: userInfo.role,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch: userInfo.branch,
        entityType,
        entityId: String(entityId),
        details: reason || `Permanently deleted ${entityType} record`,
        metadata: {
          deletedRecord: deletedData ? this.sanitizeData(deletedData) : null,
          reason,
        },
      });
    } catch (error) {
      console.error("Failed to log deletion event:", error);
    }
  }

  /**
   * Log an error
   * @param {Object} req - Express request object
   * @param {Error} error - Error object
   * @param {String} context - Context description
   */
  async logError(req, error, context = null) {
    try {
      const userInfo = getUserInfo(req);

      await AuditLog.log({
        type: "error",
        action: context || "Application error",
        severity: "critical",
        user: userInfo.email,
        userId: userInfo.userId,
        userRole: userInfo.role,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch: userInfo.branch,
        entityType: "system",
        details: error?.message || String(error),
        metadata: {
          errorName: error?.name,
          errorStack: error?.stack,
          path: req?.path,
          method: req?.method,
          body: req?.body ? this.sanitizeData(req.body) : null,
        },
      });
    } catch (logError) {
      console.error("Failed to log error event:", logError);
    }
  }

  /**
   * Log a custom event
   * @param {Object} options - Log options
   */
  async log(options) {
    try {
      const {
        req,
        type,
        action,
        severity = "info",
        entityType,
        entityId,
        details,
        metadata,
      } = options;

      const userInfo = getUserInfo(req);

      await AuditLog.log({
        type,
        action,
        severity,
        user: userInfo.email,
        userId: userInfo.userId,
        userRole: userInfo.role,
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        branch: userInfo.branch,
        entityType,
        entityId: entityId ? String(entityId) : undefined,
        details,
        metadata,
      });
    } catch (error) {
      console.error("Failed to log custom event:", error);
    }
  }

  /**
   * Sanitize data by removing sensitive fields
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeData(data) {
    if (!data) return null;

    const sensitiveFields = [
      "password",
      "token",
      "secret",
      "firebaseUid",
      "idToken",
    ];
    const sanitized = { ...data };

    // Handle Mongoose documents
    if (sanitized.toObject) {
      return this.sanitizeData(sanitized.toObject());
    }

    // Remove sensitive fields
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    // Convert ObjectId to string
    if (sanitized._id) {
      sanitized._id = String(sanitized._id);
    }

    return sanitized;
  }
}

// Export singleton instance
const auditLogger = new AuditLogger();
export default auditLogger;
