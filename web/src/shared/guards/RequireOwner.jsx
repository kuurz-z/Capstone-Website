/**
 * =============================================================================
 * REQUIRE OWNER GUARD
 * =============================================================================
 *
 * Route protection component that requires owner role specifically.
 * More restrictive than RequireAdmin - only allows 'owner' role.
 *
 * Usage:
 *   <Route path="/admin/settings" element={<RequireOwner><OwnerDashboard /></RequireOwner>} />
 *
 * Allowed Roles: 'owner' only
 * Redirects to: /signin (if not owner)
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import GlobalLoading from "../components/GlobalLoading";

/**
 * Guard component that requires owner role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected owner content
 * @returns {React.ReactElement} Children if owner, redirect otherwise
 */
const RequireOwner = ({ children }) => {
  const { isAuthenticated, loading, isAdmin, isOwner, getDefaultRoute } =
    useAuth();

  if (loading) {
    return <GlobalLoading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (!isOwner()) {
    const redirectPath = isAdmin() ? "/admin/dashboard" : getDefaultRoute();
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default RequireOwner;
