import React, { Suspense } from "react";
import "./App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import ScrollToTop from "./shared/components/ScrollToTop";
import { FirebaseAuthProvider } from "./shared/hooks/FirebaseAuthContext";
import { AuthProvider, useAuth } from "./shared/hooks/useAuth";
import { ThemeProvider } from "./features/public/context/ThemeContext";
import GlobalLoading from "./shared/components/GlobalLoading";
import RouteErrorBoundary from "./shared/components/RouteErrorBoundary";
import { useEffect } from "react";

// Guards (kept as static imports — small files, needed immediately)
import RequireAdmin from "./shared/guards/RequireAdmin";
import RequireNonAdmin from "./shared/guards/RequireNonAdmin";
import RequireSuperAdmin from "./shared/guards/RequireSuperAdmin";
import ProtectedRoute from "./shared/components/ProtectedRoute";

// ============================================================================
// LAZY-LOADED PAGES (code-split for better performance)
// ============================================================================

// Public Pages
const LandingPage = React.lazy(
  () => import("./features/public/pages/LandingPage"),
);
const PrivacyPolicyPage = React.lazy(
  () => import("./features/public/pages/PrivacyPolicyPage"),
);
const TermsOfServicePage = React.lazy(
  () => import("./features/public/pages/TermsOfServicePage"),
);
const NotFoundPage = React.lazy(
  () => import("./features/public/pages/NotFoundPage"),
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
const SuperAdminDashboard = React.lazy(
  () => import("./features/super-admin/pages/SuperAdminDashboard"),
);
const BranchManagementPage = React.lazy(
  () => import("./features/super-admin/pages/BranchManagementPage"),
);
const RolePermissionsPage = React.lazy(
  () => import("./features/super-admin/pages/RolePermissionsPage"),
);
const SystemSettingsPage = React.lazy(
  () => import("./features/super-admin/pages/SystemSettingsPage"),
);

// Applicant / Tenant Pages
const SignIn = React.lazy(() => import("./features/tenant/pages/SignIn.jsx"));
const SignUp = React.lazy(() => import("./features/public/pages/SignUp.jsx"));
const ForgotPassword = React.lazy(
  () => import("./features/tenant/pages/ForgotPassword.jsx"),
);
const VerifyEmail = React.lazy(
  () => import("./features/public/pages/VerifyEmail.jsx"),
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
              <ProtectedRoute requiredRole="applicant" requireAuth={false}>
                <RouteErrorBoundary name="LandingPage">
                  <LandingPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/privacy-policy"
            element={
              <RouteErrorBoundary name="PrivacyPolicy">
                <PrivacyPolicyPage />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/terms-of-service"
            element={
              <RouteErrorBoundary name="TermsOfService">
                <TermsOfServicePage />
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

            {/* ── Super Admin only routes (inside /admin layout) ── */}
            <Route
              path="branches"
              element={
                <RequireSuperAdmin>
                  <RouteErrorBoundary name="Branches">
                    <BranchManagementPage />
                  </RouteErrorBoundary>
                </RequireSuperAdmin>
              }
            />
            <Route
              path="roles"
              element={
                <RequireSuperAdmin>
                  <RouteErrorBoundary name="Roles">
                    <RolePermissionsPage />
                  </RouteErrorBoundary>
                </RequireSuperAdmin>
              }
            />
            <Route
              path="settings"
              element={
                <RequireSuperAdmin>
                  <RouteErrorBoundary name="Settings">
                    <SystemSettingsPage />
                  </RouteErrorBoundary>
                </RequireSuperAdmin>
              }
            />
          </Route>

          {/* ============================================================ */}
          {/* LEGACY SUPER ADMIN REDIRECTS — preserve old bookmarks         */}
          {/* ============================================================ */}
          <Route path="/super-admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/super-admin/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/super-admin/users" element={<Navigate to="/admin/users" replace />} />
          <Route path="/super-admin/tenants" element={<Navigate to="/admin/tenants" replace />} />
          <Route path="/super-admin/activity-logs" element={<Navigate to="/admin/audit-logs" replace />} />
          <Route path="/super-admin/branches" element={<Navigate to="/admin/branches" replace />} />
          <Route path="/super-admin/roles" element={<Navigate to="/admin/roles" replace />} />
          <Route path="/super-admin/settings" element={<Navigate to="/admin/settings" replace />} />
          <Route
            path="/verify-email"
            element={
              <RouteErrorBoundary name="VerifyEmail">
                <VerifyEmail />
              </RouteErrorBoundary>
            }
          />

          {/* ============================================================ */}
          {/* APPLICANT / TENANT — require applicant or tenant auth        */}
          {/* Applicants: browse, reserve, upload payment, check status    */}
          {/* Tenants: also billing, maintenance, announcements, contracts */}
          {/* ============================================================ */}
          {/* /applicant/dashboard removed — redirect to profile */}
          <Route
            path="/applicant/dashboard"
            element={
              <ProtectedRoute requiredRole="applicant">
                <Navigate to="/applicant/profile" replace />
              </ProtectedRoute>
            }
          />
          {/* /applicant/rooms — alias for check-availability */}
          <Route
            path="/applicant/rooms"
            element={
              <ProtectedRoute requiredRole="applicant">
                <Navigate to="/applicant/check-availability" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applicant/check-availability"
            element={
              <ProtectedRoute requiredRole="applicant" requireAuth={false}>
                <RouteErrorBoundary name="CheckAvailability">
                  <CheckAvailabilityPage />
                </RouteErrorBoundary>
              </ProtectedRoute>
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
          {/* 404 — catch-all for unmatched routes                        */}
          {/* ============================================================ */}
          <Route
            path="*"
            element={
              <RouteErrorBoundary name="NotFound">
                <NotFoundPage />
              </RouteErrorBoundary>
            }
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
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </FirebaseAuthProvider>
  );
}

export default App;
