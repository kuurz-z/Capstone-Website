/**
 * =============================================================================
 * REQUIRE NON-ADMIN GUARD
 * =============================================================================
 *
 * Route protection component that blocks admin users and logged-in users
 * from auth-only pages (signin/signup/forgot password).
 *
 * SESSION LOCK BEHAVIOR:
 * - Admin and super admin users are BLOCKED from accessing auth pages
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
 * - Admin/Super admin users: Redirected to /admin/dashboard
 * - Authenticated regular users: Redirected to /check-availability
 * =============================================================================
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Guard component that blocks admin users from accessing public/tenant pages
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Route content to protect
 * @returns {React.ReactElement} Children if non-admin, redirect if admin
 */
const RequireNonAdmin = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  // Wait for auth to load
  if (loading) {
    return null;
  }

  // If already authenticated, redirect based on role (they don't need auth pages)
  if (isAuthenticated && user) {
    const isAdmin = user.role === "admin" || user.role === "superAdmin";
    if (isAdmin) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    // Applicant or tenant — redirect to browse rooms
    return <Navigate to="/applicant/check-availability" replace />;
  }

  // Allow unauthenticated users
  return children;
};

export default RequireNonAdmin;
