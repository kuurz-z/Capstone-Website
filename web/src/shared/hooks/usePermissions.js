/**
 * =============================================================================
 * USE PERMISSIONS HOOK
 * =============================================================================
 *
 * Provides a `can(permission)` function that checks if the current user
 * has a specific permission. Owners bypass all checks.
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

  const isOwner = user?.role === "owner";
  const permissions = user?.permissions || [];

  const can = useMemo(() => {
    // Owners bypass all checks — they have full access
    if (isOwner) {
      return () => true;
    }
    // Regular admins check their permissions array
    return (permission) => permissions.includes(permission);
  }, [isOwner, permissions]);

  return { can, isOwner, permissions };
}
