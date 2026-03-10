import React, { Suspense } from "react";
import "./App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import ScrollToTop from "./shared/components/ScrollToTop";
import { FirebaseAuthProvider } from "./shared/hooks/FirebaseAuthContext";
import { AuthProvider, useAuth } from "./shared/hooks/useAuth";
import GlobalLoading from "./shared/components/GlobalLoading";
import RouteErrorBoundary from "./shared/components/RouteErrorBoundary";
import { useEffect } from "react";

// Guards (kept as static imports — small files, needed immediately)
import RequireAdmin from "./shared/guards/RequireAdmin";
import RequireNonAdmin from "./shared/guards/RequireNonAdmin";
import ProtectedRoute from "./shared/components/ProtectedRoute";

// ============================================================================
// LAZY-LOADED PAGES (code-split for better performance)
// ============================================================================

// Public Pages
const LandingPage = React.lazy(
  () => import("./features/public/pages/LandingPage"),
);

// Admin Pages
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

// Applicant / Tenant Pages
const SignIn = React.lazy(() => import("./features/tenant/pages/SignIn.jsx"));
const SignUp = React.lazy(() => import("./features/public/pages/SignUp.jsx"));
const ForgotPassword = React.lazy(
  () => import("./features/tenant/pages/ForgotPassword.jsx"),
);
// DashboardPage removed — applicant profile serves as the main page
const CheckAvailabilityPage = React.lazy(
  () => import("./features/tenant/pages/CheckAvailabilityPage"),
);
const ReservationFlowPage = React.lazy(
  () => import("./features/tenant/pages/ReservationFlowPage"),
);
const ProfilePage = React.lazy(
  () => import("./features/tenant/pages/ProfilePage"),
);
const BillingPage = React.lazy(
  () => import("./features/tenant/pages/BillingPage"),
);
const MaintenancePage = React.lazy(
  () => import("./features/tenant/pages/MaintenancePage"),
);
const AnnouncementsPage = React.lazy(
  () => import("./features/tenant/pages/AnnouncementsPage"),
);

const ContractsPage = React.lazy(
  () => import("./features/tenant/pages/ContractsPage"),
);

/**
 * Inner App component that uses auth context
 * Must be rendered inside AuthProvider to access useAuth hook
 */
function AppContent() {
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
          {/* ============================================================ */}
          {/* PUBLIC — accessible to everyone                              */}
          {/* ============================================================ */}
          <Route
            path="/"
            element={
              <RouteErrorBoundary name="LandingPage">
                <LandingPage />
              </RouteErrorBoundary>
            }
          />

          {/* ============================================================ */}
          {/* AUTH — unified sign in / sign up / forgot password            */}
          {/* All roles (applicant, tenant, admin, superAdmin) login here   */}
          {/* ============================================================ */}
          <Route
            path="/signin"
            element={
              <RequireNonAdmin>
                <RouteErrorBoundary name="SignIn">
                  <SignIn />
                </RouteErrorBoundary>
              </RequireNonAdmin>
            }
          />
          <Route
            path="/signup"
            element={
              <RequireNonAdmin>
                <RouteErrorBoundary name="SignUp">
                  <SignUp />
                </RouteErrorBoundary>
              </RequireNonAdmin>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <RequireNonAdmin>
                <RouteErrorBoundary name="ForgotPassword">
                  <ForgotPassword />
                </RouteErrorBoundary>
              </RequireNonAdmin>
            }
          />

          {/* Backward compat: old paths redirect to new */}
          <Route
            path="/admin/login"
            element={<Navigate to="/signin" replace />}
          />
          <Route
            path="/tenant/forgot-password"
            element={<Navigate to="/forgot-password" replace />}
          />

          {/* ============================================================ */}
          {/* ADMIN — require admin auth, shared layout, nested routes    */}
          {/* ============================================================ */}
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

          {/* ============================================================ */}
          {/* APPLICANT / TENANT — require applicant or tenant auth        */}
          {/* Applicants: browse, reserve, upload payment, check status    */}
          {/* Tenants: also billing, maintenance, announcements, contracts */}
          {/* ============================================================ */}
          {/* /applicant/dashboard removed — redirect to profile */}
          <Route
            path="/applicant/dashboard"
            element={<Navigate to="/applicant/profile" replace />}
          />
          {/* /applicant/rooms — alias for check-availability */}
          <Route
            path="/applicant/rooms"
            element={<Navigate to="/applicant/check-availability" replace />}
          />
          <Route
            path="/applicant/check-availability"
            element={
              <RouteErrorBoundary name="CheckAvailability">
                <CheckAvailabilityPage />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/applicant/reservation"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="ReservationFlow">
                  <ReservationFlowPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applicant/profile"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="Profile">
                  <ProfilePage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/applicant/announcements"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="Announcements">
                  <AnnouncementsPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applicant/contracts"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="Contracts">
                  <ContractsPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applicant/billing"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="Billing">
                  <BillingPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applicant/maintenance"
            element={
              <ProtectedRoute requiredRole="applicant">
                <RouteErrorBoundary name="Maintenance">
                  <MaintenancePage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* ============================================================ */}
          {/* BACKWARD COMPAT — old /tenant/* and /check-availability       */}
          {/* ============================================================ */}
          <Route
            path="/check-availability"
            element={<Navigate to="/applicant/check-availability" replace />}
          />
          <Route
            path="/tenant/dashboard"
            element={<Navigate to="/applicant/profile" replace />}
          />
          <Route
            path="/tenant/check-availability"
            element={<Navigate to="/applicant/check-availability" replace />}
          />
          <Route
            path="/tenant/reservation-flow"
            element={<Navigate to="/applicant/reservation" replace />}
          />
          <Route
            path="/tenant/reservation"
            element={<Navigate to="/applicant/reservation" replace />}
          />
          <Route
            path="/tenant/profile"
            element={<Navigate to="/applicant/profile" replace />}
          />
          <Route
            path="/tenant/billing"
            element={<Navigate to="/applicant/billing" replace />}
          />
          <Route
            path="/tenant/maintenance"
            element={<Navigate to="/applicant/maintenance" replace />}
          />
          <Route
            path="/tenant/announcements"
            element={<Navigate to="/applicant/announcements" replace />}
          />

          <Route
            path="/tenant/contracts"
            element={<Navigate to="/applicant/contracts" replace />}
          />
        </Routes>
      </Suspense>
    </>
  );
}

/**
 * Root App component
 * Wraps AppContent with auth providers so useAuth hook works correctly
 */
function App() {
  return (
    <FirebaseAuthProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </FirebaseAuthProvider>
  );
}

export default App;
