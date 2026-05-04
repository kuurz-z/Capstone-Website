/**
 * =============================================================================
 * REQUIRE NON-ADMIN GUARD
 * =============================================================================
 *
 * Route protection component that blocks admin users and logged-in users
 * from auth-only pages (signin/signup/forgot password).
 *
 * SESSION LOCK BEHAVIOR:
 * - Branch admins and owners are BLOCKED from accessing auth pages
 * - Authenticated regular users are BLOCKED from accessing auth pages
 * - Admins are redirected to /admin/dashboard
 * - Regular users are redirected to /check-availability
 *
 * Usage:
 *   <Route path="/tenant/signin" element={<RequireNonAdmin><TenantSignIn /></RequireNonAdmin>} />
 *   <Route path="/" element={<RequireNonAdmin><LandingPage /></RequireNonAdmin>} />
 *
 * Behavior:
 * - Unauthenticated users: Allowed access
 * - Branch admin/owner users: Redirected to /admin/dashboard
 * - Authenticated regular users: Redirected to /check-availability
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import GlobalLoading from "../components/GlobalLoading";

/**
 * Guard component that blocks admin users from accessing public/tenant pages
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Route content to protect
 * @returns {React.ReactElement} Children if non-admin, redirect if admin
 */
const RequireNonAdmin = ({ children }) => {
  const { isAuthenticated, loading, isAdmin, getDefaultRoute } = useAuth();

  if (loading) {
    return <GlobalLoading />;
  }

  // If already authenticated, redirect based on role (they don't need auth pages)
  // EXCEPTION: Skip redirect while social signup is checking for duplicate accounts
  if (isAuthenticated && !sessionStorage.getItem("socialAuthInProgress") && !sessionStorage.getItem("resendInProgress")) {
    const redirectPath = isAdmin()
      ? "/admin/dashboard"
      : getDefaultRoute();
    return <Navigate to={redirectPath} replace />;
    // Applicant or tenant — redirect to browse rooms
  }

  // Allow unauthenticated users
  return children;
};

export default RequireNonAdmin;
