/**
 * =============================================================================
 * REQUIRE SUPER ADMIN GUARD
 * =============================================================================
 *
 * Route protection component that requires super admin role specifically.
 * More restrictive than RequireAdmin - only allows 'superAdmin' role.
 *
 * Usage:
 *   <Route path="/super-admin/*" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
 *
 * Allowed Roles: 'superAdmin' only
 * Redirects to: /admin/login (if not super admin)
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Guard component that requires super admin role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected super admin content
 * @returns {React.ReactElement} Children if super admin, redirect otherwise
 */
const RequireSuperAdmin = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return null;
  }

  // Redirect if not authenticated or not super admin
  if (!isAuthenticated || user?.role !== "superAdmin") {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default RequireSuperAdmin;
