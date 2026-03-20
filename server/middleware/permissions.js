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
 * 1. SuperAdmins bypass all permission checks (full access)
 * 2. Regular admins must have the specific permission in their `permissions` array
 * 3. If the admin has no permissions array, they are denied by default
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

/**
 * All available permissions in the system
 */
export const ALL_PERMISSIONS = [
  "manageReservations",
  "manageTenants",
  "manageBilling",
  "manageRooms",
  "manageMaintenance",
  "manageAnnouncements",
  "viewReports",
  "manageUsers",
];

/**
 * Default permissions assigned by role
 */
export const DEFAULT_PERMISSIONS = {
  applicant: [],
  tenant: [],
  admin: [
    "manageReservations",
    "manageTenants",
    "manageBilling",
    "manageRooms",
    "manageMaintenance",
    "manageAnnouncements",
  ],
  superAdmin: [...ALL_PERMISSIONS],
};

/**
 * Human-readable labels for permissions
 */
export const PERMISSION_LABELS = {
  manageReservations: "Manage Reservations",
  manageTenants: "Manage Tenants",
  manageBilling: "Manage Billing",
  manageRooms: "Manage Rooms",
  manageMaintenance: "Manage Maintenance",
  manageAnnouncements: "Manage Announcements",
  viewReports: "View Reports",
  manageUsers: "Manage Users",
};

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
      // SuperAdmins bypass all permission checks
      if (req.isSuperAdmin) {
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

      // SuperAdmins always pass (fallback check)
      if (dbUser.role === "superAdmin") {
        req.isSuperAdmin = true;
        return next();
      }

      // Check the user's permissions array
      const userPermissions = dbUser.permissions || [];
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
      if (req.isSuperAdmin) return next();

      const dbUser = await User.findOne({ firebaseUid: req.user.uid })
        .select("permissions role")
        .lean();

      if (!dbUser) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      if (dbUser.role === "superAdmin") {
        req.isSuperAdmin = true;
        return next();
      }

      const userPermissions = dbUser.permissions || [];
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
