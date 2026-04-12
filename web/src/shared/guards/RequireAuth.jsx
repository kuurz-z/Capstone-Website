/**
 * =============================================================================
 * REQUIRE AUTH GUARD
 * =============================================================================
 *
 * Route protection component that requires user authentication.
 * Redirects unauthenticated users to the sign-in page.
 *
 * Usage:
 *   <Route path="/protected" element={<RequireAuth><ProtectedPage /></RequireAuth>} />
 *
 * Note: This only checks if user is authenticated, not their role.
 * For role-specific guards, use RequireAdmin or RequireOwner.
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Guard component that requires authentication
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected content
 * @returns {React.ReactElement} Children if authenticated, redirect otherwise
 */
const RequireAuth = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return null;
  }

  // Redirect to sign-in if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default RequireAuth;
