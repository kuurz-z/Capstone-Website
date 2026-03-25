/**
 * =============================================================================
 * REQUIRE ADMIN GUARD
 * =============================================================================
 *
 * Route protection component that requires admin or super admin role.
 * Checks both Firebase authentication and backend user role.
 *
 * Usage:
 *   <Route path="/admin/*" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
 *
 * Allowed Roles: 'admin', 'superAdmin'
 * Redirects to: /tenant/signin (if not authenticated or not admin)
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFirebaseAuth } from "../hooks/FirebaseAuthContext";

/**
 * Guard component that requires admin or super admin role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected admin content
 * @returns {React.ReactElement} Children if admin, redirect otherwise
 */
const RequireAdmin = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const { user: firebaseUser, loading: firebaseLoading } = useFirebaseAuth();

  // Show loading while either auth system is checking
  if (loading || firebaseLoading) {
    return null;
  }

  // Check Firebase authentication first - redirect to sign-in if not authenticated
  if (!firebaseUser) {
    return <Navigate to="/signin" replace />;
  }

  // Check backend authentication and admin role
  const isAdmin = user?.role === "branch_admin" || user?.role === "owner";
  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default RequireAdmin;
