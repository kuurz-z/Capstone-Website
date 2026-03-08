import React, { useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { showNotification } from "../utils/notification";
import GlobalLoading from "./GlobalLoading";

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
 * - Unauthenticated on user routes: redirect to "/" (landing page) with notification
 * - Unauthenticated on admin routes: redirect to "/signin" with notification
 * - Admin trying to access user routes: redirect to "/admin/dashboard"
 * - User trying to access admin routes: redirect to "/signin"
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} props.requiredRole - Required role: 'admin', 'superAdmin', or 'applicant'
 * @param {boolean} props.requireAuth - Whether authentication is required (default: true)
 *
 * @returns {React.ReactNode} Protected content or redirect
 */
const ProtectedRoute = ({ children, requiredRole, requireAuth = true }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const notificationShown = useRef(false);

  // Show loading spinner while checking authentication
  if (loading) {
    return <GlobalLoading />;
  }

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    // Show notification to prompt login (only once)
    if (!notificationShown.current) {
      notificationShown.current = true;
      showNotification(
        "Sign in to discover available rooms and reserve your space",
        "info",
        3500,
      );
    }

    // User routes redirect to landing page "/"
    // Admin routes redirect to sign-in page "/signin"
    const redirectPath = requiredRole === "applicant" ? "/" : "/signin";
    return <Navigate to={redirectPath} replace />;
  }

  // Check role requirements using custom claims from ID token
  if (requiredRole) {
    // For admin routes, check if user has admin or superAdmin custom claims
    if (requiredRole === "admin") {
      if (
        !user?.role ||
        (user.role !== "admin" && user.role !== "superAdmin")
      ) {
        return <Navigate to="/signin" replace />;
      }
    }
    // For super admin routes, check for superAdmin role
    else if (requiredRole === "superAdmin") {
      if (!user?.role || user.role !== "superAdmin") {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }
    // For applicant routes, BLOCK admin/super admin users (session lock)
    else if (requiredRole === "applicant") {
      const isAdmin = user?.role === "admin" || user?.role === "superAdmin";
      if (isAdmin) {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }
  }

  return children;
};

export default ProtectedRoute;
