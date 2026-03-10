/**
 * =============================================================================
 * ADMIN APP — Standalone Admin Panel (Port 3001)
 * =============================================================================
 *
 * This is a separate React app that ONLY contains admin routes.
 * It runs on port 3001 with its own Firebase auth session,
 * allowing admins and users to be logged in simultaneously.
 *
 * Shares all hooks, components, and API layer with the main app.
 * =============================================================================
 */

import React, { Suspense } from "react";
import "./App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import ScrollToTop from "./shared/components/ScrollToTop";
import { FirebaseAuthProvider } from "./shared/hooks/FirebaseAuthContext";
import { AuthProvider, useAuth } from "./shared/hooks/useAuth";
import GlobalLoading from "./shared/components/GlobalLoading";
import RouteErrorBoundary from "./shared/components/RouteErrorBoundary";
import { useEffect } from "react";

// Guards
import RequireAdmin from "./shared/guards/RequireAdmin";

// ============================================================================
// LAZY-LOADED ADMIN PAGES
// ============================================================================

const AdminLayout = React.lazy(
  () => import("./features/admin/components/AdminLayout"),
);
const AdminDashboardPage = React.lazy(
  () => import("./features/admin/pages/Dashboard"),
);
const ReservationsPage = React.lazy(
  () => import("./features/admin/pages/ReservationsPage"),
);
const RoomAvailabilityPage = React.lazy(
  () => import("./features/admin/pages/RoomAvailabilityPage"),
);
const TenantsPage = React.lazy(
  () => import("./features/admin/pages/TenantsPage"),
);
const AuditLogsPage = React.lazy(
  () => import("./features/admin/pages/AuditLogsPage"),
);
const UserManagementPage = React.lazy(
  () => import("./features/admin/pages/UserManagementPage"),
);
const AdminBillingPage = React.lazy(
  () => import("./features/admin/pages/AdminBillingPage"),
);
const MaintenancePage = React.lazy(
  () => import("./features/tenant/pages/MaintenancePage"),
);

// Admin Sign-In (reuses the existing SignIn component)
const SignIn = React.lazy(() => import("./features/tenant/pages/SignIn.jsx"));

/**
 * Admin App Content — admin-only routes
 */
function AdminAppContent() {
  const { globalLoading, setGlobalLoading } = useAuth();
  const location = useLocation();

  // Stop global loader after navigation
  useEffect(() => {
    if (!globalLoading) return;

    const timer = setTimeout(() => {
      setGlobalLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [location.pathname, globalLoading, setGlobalLoading]);

  return (
    <>
      <ScrollToTop />
      {globalLoading && <GlobalLoading />}

      <Suspense fallback={<GlobalLoading />}>
        <Routes>
          {/* Sign-In page — entry point for admin login */}
          <Route
            path="/signin"
            element={
              <RouteErrorBoundary name="AdminSignIn">
                <SignIn />
              </RouteErrorBoundary>
            }
          />

          {/* Admin routes — require admin auth */}
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <RouteErrorBoundary name="AdminLayout">
                  <AdminLayout />
                </RouteErrorBoundary>
              </RequireAdmin>
            }
          >
            <Route
              path="dashboard"
              element={
                <RouteErrorBoundary name="AdminDashboard">
                  <AdminDashboardPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="reservations"
              element={
                <RouteErrorBoundary name="Reservations">
                  <ReservationsPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="room-availability"
              element={
                <RouteErrorBoundary name="RoomAvailability">
                  <RoomAvailabilityPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="tenants"
              element={
                <RouteErrorBoundary name="Tenants">
                  <TenantsPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="audit-logs"
              element={
                <RouteErrorBoundary name="AuditLogs">
                  <AuditLogsPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="users"
              element={
                <RouteErrorBoundary name="UserManagement">
                  <UserManagementPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="billing"
              element={
                <RouteErrorBoundary name="AdminBilling">
                  <AdminBillingPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="maintenance"
              element={
                <RouteErrorBoundary name="AdminMaintenance">
                  <MaintenancePage />
                </RouteErrorBoundary>
              }
            />
          </Route>

          {/* Default: redirect to sign-in */}
          <Route path="*" element={<Navigate to="/signin" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

/**
 * Root Admin App component
 */
function AdminApp() {
  return (
    <FirebaseAuthProvider>
      <AuthProvider>
        <AdminAppContent />
      </AuthProvider>
    </FirebaseAuthProvider>
  );
}

export default AdminApp;
