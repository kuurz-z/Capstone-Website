/**
 * ============================================================================
 * AUDIT LOG CONTROLLER
 * ============================================================================
 *
 * Handles all audit log API endpoints.
 * Provides functionality for:
 * - Retrieving logs with filters
 * - Getting statistics
 * - Exporting logs
 * - Security monitoring (failed logins)
 * - Log cleanup
 *
 * ============================================================================
 */

import AuditLog from "../models/AuditLog.js";
import {
  sendSuccess,
  AppError,
} from "../middleware/errorHandler.js";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract client IP from request
 * @param {Object} req - Express request object
 * @returns {String} Client IP address
 */
const getClientIP = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * GET /api/audit-logs
 * Get all audit logs with optional filters
 * @access Admin, SuperAdmin
 */
export const getAuditLogs = async (req, res, next) => {
  try {
    const {
      type, severity, user, role, branch,
      startDate, endDate, search, limit, offset,
    } = req.query;

    const filters = {
      type, severity, user, role,
      // If req.branchFilter is set (regular admin), it overrides the client-sent branch.
      // If req.branchFilter is null (super admin), use the client-sent branch param.
      branch: req.branchFilter !== undefined ? (req.branchFilter || branch) : branch,
      startDate, endDate, search,
    };

    // Remove undefined filters
    Object.keys(filters).forEach(
      (key) => filters[key] === undefined && delete filters[key],
    );

    const options = {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
    };

    const result = await AuditLog.getLogs(filters, options);

    sendSuccess(res, result.logs, 200, { pagination: result.pagination });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit-logs/stats
 * Get audit log statistics
 * @access Admin, SuperAdmin
 */
export const getAuditStats = async (req, res, next) => {
  try {
    // Regular admin: use their assigned branch. Super admin: use query param or all.
    const branch = req.branchFilter !== undefined
      ? (req.branchFilter || req.query.branch)
      : req.query.branch;
    const stats = await AuditLog.getStats(branch);
    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit-logs/:id
 * Get specific audit log entry
 * @access Admin, SuperAdmin
 */
export const getAuditLogById = async (req, res, next) => {
  try {
    const log = await AuditLog.findOne({ logId: req.params.id }).lean();
    if (!log) throw new AppError("Audit log not found", 404, "AUDIT_LOG_NOT_FOUND");
    sendSuccess(res, log);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/audit-logs
 * Create new audit log entry (internal use)
 * @access System
 */
export const createAuditLog = async (req, res, next) => {
  try {
    const {
      type, action, severity, user, details,
      metadata, entityType, entityId, branch,
    } = req.body;

    if (!type || !action || !severity) {
      throw new AppError(
        "Missing required fields: type, action, severity",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    const validTypes = ["login", "data_modification", "data_deletion", "error"];
    const validSeverities = ["info", "warning", "high", "critical"];

    if (!validTypes.includes(type)) {
      throw new AppError("Invalid type", 400, "INVALID_TYPE");
    }
    if (!validSeverities.includes(severity)) {
      throw new AppError("Invalid severity", 400, "INVALID_SEVERITY");
    }

    const logEntry = await AuditLog.log({
      type, action, severity,
      user: user || req.user?.email || "system",
      userId: req.user?.mongoId,
      userRole: req.user?.role,
      ip: getClientIP(req),
      userAgent: req.headers["user-agent"],
      details, metadata, entityType, entityId, branch,
    });

    sendSuccess(res, logEntry, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/audit-logs/export
 * Export audit logs (filtered)
 * @access Admin, SuperAdmin
 */
export const exportAuditLogs = async (req, res, next) => {
  try {
    const filters = req.body.filters || {};
    const result = await AuditLog.getLogs(filters, { limit: 10000, offset: 0 });

    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({
      exportDate: new Date().toISOString(),
      exportedBy: req.user?.email || "unknown",
      filters: filters,
      totalRecords: result.logs.length,
      logs: result.logs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit-logs/security/failed-logins
 * Get recent failed login attempts (security monitoring)
 * @access Admin, SuperAdmin
 */
export const getFailedLogins = async (req, res, next) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const data = await AuditLog.getFailedLogins(hours);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/audit-logs/cleanup
 * Archive/delete old audit logs
 * @access SuperAdmin only
 */
export const cleanupAuditLogs = async (req, res, next) => {
  try {
    const daysToKeep = parseInt(req.query.daysToKeep) || 90;

    if (daysToKeep < 30) {
      throw new AppError("Cannot delete logs newer than 30 days", 400, "INVALID_RETENTION");
    }

    const result = await AuditLog.cleanupOldLogs(daysToKeep);

    await AuditLog.log({
      type: "data_deletion",
      action: "Audit log cleanup performed",
      severity: "high",
      user: req.user?.email || "system",
      userId: req.user?.mongoId,
      userRole: req.user?.role,
      ip: getClientIP(req),
      details: `Deleted ${result.deletedCount} logs older than ${daysToKeep} days`,
      entityType: "system",
    });

    sendSuccess(res, { message: "Cleanup completed", ...result });
  } catch (error) {
    next(error);
  }
};
