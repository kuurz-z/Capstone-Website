import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import GlobalLoading from "./GlobalLoading";
import { USER_ROLES } from "../utils/constants";

/**
 * Protected Route Component
 *
 * Protects routes based on authentication and role requirements.
 * Uses Firebase custom claims from the ID token for role verification.
 *
 * SESSION LOCK BEHAVIOR:
 * - Admin users can ONLY access admin routes
 * - Regular users can ONLY access tenant routes
 * - Strict role separation enforced
 *
 * REDIRECT BEHAVIOR:
 * - Unauthenticated on user routes: redirect to "/" (public landing page)
 * - Unauthenticated on admin routes: redirect to "/signin" with notification
 * - Admin trying to access user routes: redirect to "/admin/dashboard"
 * - User trying to access admin routes: redirect to "/signin"
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} props.requiredRole - Required role: 'branch_admin', 'owner', or 'applicant'
 * @param {boolean} props.requireAuth - Whether authentication is required (default: true)
 *
 * @returns {React.ReactNode} Protected content or redirect
 */
const ProtectedRoute = ({ children, requiredRole, requireAuth = true }) => {
  const {
    isAuthenticated,
    loading,
    isAdmin,
    isOwner,
    getDefaultRoute,
  } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return <GlobalLoading />;
  }

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    const redirectPath = requiredRole === "applicant" ? "/" : "/signin";

    return <Navigate to={redirectPath} replace />;
  }

  // Check role requirements using custom claims from ID token
  if (requiredRole) {
    if (requiredRole === USER_ROLES.BRANCH_ADMIN) {
      if (!isAdmin()) {
        return <Navigate to={getDefaultRoute()} replace />;
      }
    } else if (requiredRole === USER_ROLES.OWNER) {
      if (!isOwner()) {
        return <Navigate to={getDefaultRoute()} replace />;
      }
    } else if (requiredRole === USER_ROLES.APPLICANT) {
      if (isAdmin()) {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }
  }

  return children;
};

export default ProtectedRoute;
