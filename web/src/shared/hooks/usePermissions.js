/**
 * =============================================================================
 * USE PERMISSIONS HOOK
 * =============================================================================
 *
 * Provides a `can(permission)` function that checks if the current user
 * has a specific permission. SuperAdmins bypass all checks.
 *
 * Available permissions (from server/middleware/permissions.js):
 * - manageReservations
 * - manageTenants
 * - manageBilling
 * - manageRooms
 * - manageMaintenance
 * - manageAnnouncements
 * - viewReports
 * - manageUsers
 *
 * Usage:
 *   const { can } = usePermissions();
 *   if (can("manageBilling")) { ... }
 *
 * =============================================================================
 */

import { useMemo } from "react";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { user } = useAuth();

  const isSuperAdmin = user?.role === "superAdmin";
  const permissions = user?.permissions || [];

  const can = useMemo(() => {
    // SuperAdmins bypass all checks — they have full access
    if (isSuperAdmin) {
      return () => true;
    }
    // Regular admins check their permissions array
    return (permission) => permissions.includes(permission);
  }, [isSuperAdmin, permissions]);

  return { can, isSuperAdmin, permissions };
}
