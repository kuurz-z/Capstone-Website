/**
 * =============================================================================
 * REQUIRE OWNER GUARD
 * =============================================================================
 *
 * Route protection component that requires owner role specifically.
 * More restrictive than RequireAdmin - only allows 'owner' role.
 *
 * Usage:
 *   <Route path="/super-admin/*" element={<RequireOwner><OwnerDashboard /></RequireOwner>} />
 *
 * Allowed Roles: 'owner' only
 * Redirects to: /signin (if not owner)
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Guard component that requires owner role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected owner content
 * @returns {React.ReactElement} Children if owner, redirect otherwise
 */
const RequireOwner = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return null;
  }

  // Redirect if not authenticated or not owner
  if (!isAuthenticated || user?.role !== "owner") {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default RequireOwner;
