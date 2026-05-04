/**
 * =============================================================================
 * REQUIRE ADMIN GUARD
 * =============================================================================
 *
 * Route protection component that requires branch admin or owner role.
 * Checks both Firebase authentication and backend user role.
 *
 * Usage:
 *   <Route path="/admin/*" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
 *
 * Allowed Roles: 'branch_admin', 'owner'
 * Redirects to: /signin (if not authenticated or not admin)
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFirebaseAuth } from "../hooks/FirebaseAuthContext";
import GlobalLoading from "../components/GlobalLoading";

/**
 * Guard component that requires branch admin or owner role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected admin content
 * @returns {React.ReactElement} Children if admin, redirect otherwise
 */
const RequireAdmin = ({ children }) => {
  const { isAuthenticated, loading, isAdmin, getDefaultRoute } = useAuth();
  const { user: firebaseUser, loading: firebaseLoading } = useFirebaseAuth();

  if (loading || firebaseLoading) {
    return <GlobalLoading />;
  }

  if (!firebaseUser) {
    return <Navigate to="/signin" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (!isAdmin()) {
    return <Navigate to={getDefaultRoute()} replace />;
  }

  return children;
};

export default RequireAdmin;
