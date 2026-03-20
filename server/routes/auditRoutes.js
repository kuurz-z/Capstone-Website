/**
 * ============================================================================
 * AUDIT LOG ROUTES
 * ============================================================================
 *
 * API routes for audit logging system.
 *
 * Routes:
 * - GET /api/audit-logs - Get all logs (filtered)
 * - GET /api/audit-logs/stats - Get statistics
 * - GET /api/audit-logs/:id - Get specific log
 * - POST /api/audit-logs - Create new log entry
 * - POST /api/audit-logs/export - Export logs
 * - GET /api/audit-logs/security/failed-logins - Get failed login attempts
 * - DELETE /api/audit-logs/cleanup - Cleanup old logs (SuperAdmin only)
 *
 * ============================================================================
 */

import express from "express";
import {
  verifyToken,
  verifyAdmin,
  verifySuperAdmin,
} from "../middleware/auth.js";
import { filterByBranch } from "../middleware/branchAccess.js";
import {
  getAuditLogs,
  getAuditStats,
  getAuditLogById,
  createAuditLog,
  exportAuditLogs,
  getFailedLogins,
  cleanupAuditLogs,
} from "../controllers/auditController.js";

const router = express.Router();

// ============================================================================
// ROUTES
// ============================================================================

/**
 * @route   GET /api/audit-logs
 * @desc    Get all audit logs with optional filters
 * @access  Admin, SuperAdmin
 * @query   type, severity, user, branch, startDate, endDate, search, limit, offset
 */
router.get("/", verifyToken, verifyAdmin, filterByBranch, getAuditLogs);

/**
 * @route   GET /api/audit-logs/stats
 * @desc    Get audit log statistics
 * @access  Admin, SuperAdmin
 */
router.get("/stats", verifyToken, verifyAdmin, filterByBranch, getAuditStats);

/**
 * @route   GET /api/audit-logs/security/failed-logins
 * @desc    Get recent failed login attempts
 * @access  Admin, SuperAdmin
 */
router.get(
  "/security/failed-logins",
  verifyToken,
  verifyAdmin,
  getFailedLogins,
);

/**
 * @route   GET /api/audit-logs/:id
 * @desc    Get specific audit log entry
 * @access  Admin, SuperAdmin
 */
router.get("/:id", verifyToken, verifyAdmin, getAuditLogById);

/**
 * @route   POST /api/audit-logs
 * @desc    Create new audit log entry
 * @access  System (internal use) - but protected for security
 */
router.post("/", verifyToken, createAuditLog);

/**
 * @route   POST /api/audit-logs/export
 * @desc    Export audit logs (filtered)
 * @access  Admin, SuperAdmin
 */
router.post("/export", verifyToken, verifyAdmin, exportAuditLogs);

/**
 * @route   DELETE /api/audit-logs/cleanup
 * @desc    Archive/delete old audit logs
 * @access  SuperAdmin only
 */
router.delete("/cleanup", verifyToken, verifySuperAdmin, cleanupAuditLogs);

export default router;
