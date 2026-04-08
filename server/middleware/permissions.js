/**
 * ============================================================================
 * PERMISSION MIDDLEWARE
 * ============================================================================
 *
 * Granular permission checks for admin routes.
 *
 * USAGE:
 *   router.post('/billing/generate', verifyToken, verifyAdmin, requirePermission('manageBilling'), handler)
 *
 * HOW IT WORKS:
 * 1. Owners bypass all permission checks (full access)
 * 2. Branch admins must have the specific permission in their `permissions` array
 * 3. Branch admins must already have explicit persisted permissions
 *
 * NOTE:
 * Persisted permissions are authoritative during live permission checks.
 * Branch-admin defaults are backfilled at startup and on role assignment so
 * the middleware no longer falls back to broad role defaults at runtime.
 *
 * AVAILABLE PERMISSIONS:
 * - manageReservations
 * - manageTenants
 * - manageBilling
 * - manageRooms
 * - manageMaintenance
 * - manageAnnouncements
 * - viewReports
 * - manageUsers
 *
 * ============================================================================
 */

import { User } from "../models/index.js";
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS,
  normalizePermissions,
} from "../config/accessControl.js";
export { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, PERMISSION_LABELS };

/**
 * Middleware factory: checks if the user has the required permission.
 * Must be used AFTER verifyToken + verifyAdmin.
 *
 * @param {string} permission - Required permission key
 * @returns {Function} Express middleware
 */
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Owners bypass all permission checks
      if (req.isOwner || req.user?.owner) {
        return next();
      }

      // Get user from DB to check permissions
      const dbUser = await User.findOne({ firebaseUid: req.user.uid })
        .select("permissions role")
        .lean();

      if (!dbUser) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Owners always pass (fallback check)
      if (dbUser.role === "owner") {
        req.isOwner = true;
        return next();
      }

      const userPermissions = normalizePermissions(dbUser.permissions);

      if (dbUser.role === "branch_admin" && userPermissions.length === 0) {
        return res.status(403).json({
          error: "Admin permissions are not configured for this account",
          code: "PERMISSIONS_NOT_CONFIGURED",
        });
      }

      if (userPermissions.includes(permission)) {
        return next();
      }

      return res.status(403).json({
        error: `Access denied. Missing permission: ${permission}`,
        code: "PERMISSION_DENIED",
        requiredPermission: permission,
      });
    } catch (error) {
      console.error("❌ Permission check error:", error.message);
      return res.status(500).json({
        error: "Permission check failed",
        code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};

/**
 * Middleware factory: checks if the user has ANY of the listed permissions.
 *
 * @param {string[]} permissions - Array of permission keys (user needs at least one)
 * @returns {Function} Express middleware
 */
export const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      if (req.isOwner || req.user?.owner) return next();

      const dbUser = await User.findOne({ firebaseUid: req.user.uid })
        .select("permissions role")
        .lean();

      if (!dbUser) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      if (dbUser.role === "owner") {
        req.isOwner = true;
        return next();
      }

      const userPermissions = normalizePermissions(dbUser.permissions);
      if (dbUser.role === "branch_admin" && userPermissions.length === 0) {
        return res.status(403).json({
          error: "Admin permissions are not configured for this account",
          code: "PERMISSIONS_NOT_CONFIGURED",
        });
      }
      const hasAny = permissions.some((p) => userPermissions.includes(p));

      if (hasAny) return next();

      return res.status(403).json({
        error: `Access denied. Requires one of: ${permissions.join(", ")}`,
        code: "PERMISSION_DENIED",
        requiredPermissions: permissions,
      });
    } catch (error) {
      console.error("❌ Permission check error:", error.message);
      return res.status(500).json({
        error: "Permission check failed",
        code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};
