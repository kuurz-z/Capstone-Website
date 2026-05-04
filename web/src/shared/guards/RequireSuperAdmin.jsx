/**
 * =============================================================================
 * LEGACY OWNER GUARD
 * =============================================================================
 *
 * Legacy route protection component that now maps to the canonical `owner` role.
 * More restrictive than RequireAdmin - only allows `owner`.
 *
 * Usage:
 *   <Route path="/admin/settings" element={<RequireSuperAdmin><OwnerPage /></RequireSuperAdmin>} />
 *
 * Allowed Roles: 'owner' only
 * Redirects to: /signin (if not owner)
 * =============================================================================
 */

import React from "react";
import RequireOwner from "./RequireOwner";

/**
 * Guard component that requires owner role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected owner content
 * @returns {React.ReactElement} Children if owner, redirect otherwise
 */
const RequireSuperAdmin = ({ children }) => {
  return <RequireOwner>{children}</RequireOwner>;
};

export default RequireSuperAdmin;
