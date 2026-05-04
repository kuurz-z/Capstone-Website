import React from "react";
import { Navigate, Route } from "react-router-dom";
import ProtectedRoute from "../../shared/components/ProtectedRoute";
import { RouteShell } from "./RouteShell";
import {
  AdminLayout,
  AdminDashboardPage,
  ReservationsPage,
  RoomAvailabilityPage,
  TenantsWorkspacePage,
  AuditLogsPage,
  UserManagementPage,
  AdminBillingPage,
  AdminAnnouncementsPage,
  AdminChatPage,
  MaintenancePage,
  InquiriesPage,
  AnalyticsPage,
  AnalyticsDetailsPage,
  BranchManagementPage,
  RolePermissionsPage,
  SystemSettingsPage,
  AdminNotificationsPage,
} from "../lazyPages";
import {
  ANALYTICS_DETAILS_PATH,
  LEGACY_ANALYTICS_REDIRECTS,
} from "../../features/admin/pages/analyticsNavigation.mjs";

export function AdminRoutes() {
  return (
    <Route
      path="/admin"
      element={
        <ProtectedRoute requiredRole="branch_admin">
          <RouteShell name="AdminLayout">
            <AdminLayout />
          </RouteShell>
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="/admin/dashboard" replace />} />
      <Route
        path="dashboard"
        element={
          <RouteShell name="AdminDashboard">
            <AdminDashboardPage />
          </RouteShell>
        }
      />
      <Route
        path="reservations"
        element={
          <RouteShell name="Reservations">
            <ReservationsPage />
          </RouteShell>
        }
      />
      <Route
        path="room-availability"
        element={
          <RouteShell name="RoomAvailability">
            <RoomAvailabilityPage />
          </RouteShell>
        }
      />
      <Route
        path="tenants"
        element={
          <RouteShell name="Tenants">
            <TenantsWorkspacePage />
          </RouteShell>
        }
      />
      <Route
        path="audit-logs"
        element={
          <RouteShell name="AuditLogs">
            <AuditLogsPage />
          </RouteShell>
        }
      />
      <Route
        path="users"
        element={
          <RouteShell name="UserManagement">
            <UserManagementPage />
          </RouteShell>
        }
      />
      <Route
        path="billing"
        element={
          <RouteShell name="AdminBilling">
            <AdminBillingPage />
          </RouteShell>
        }
      />
      <Route
        path="announcements"
        element={
          <RouteShell name="AdminAnnouncements">
            <AdminAnnouncementsPage />
          </RouteShell>
        }
      />
      <Route
        path="chat"
        element={
          <RouteShell name="AdminChat">
            <AdminChatPage />
          </RouteShell>
        }
      />
      <Route
        path="maintenance"
        element={
          <RouteShell name="AdminMaintenance">
            <MaintenancePage />
          </RouteShell>
        }
      />
      <Route
        path="analytics"
        element={
          <RouteShell name="Analytics">
            <AnalyticsPage />
          </RouteShell>
        }
      />
      <Route
        path="analytics/details"
        element={
          <RouteShell name="AnalyticsDetails">
            <AnalyticsDetailsPage />
          </RouteShell>
        }
      />
      <Route
        path="inquiries"
        element={
          <RouteShell name="Inquiries">
            <InquiriesPage />
          </RouteShell>
        }
      />
      <Route
        path="notifications"
        element={
          <RouteShell name="AdminNotifications">
            <AdminNotificationsPage />
          </RouteShell>
        }
      />
      <Route
        path="reports/occupancy"
        element={<Navigate to={LEGACY_ANALYTICS_REDIRECTS.occupancy} replace />}
      />
      <Route
        path="reports/billing"
        element={<Navigate to={LEGACY_ANALYTICS_REDIRECTS.billing} replace />}
      />
      <Route
        path="reports/operations"
        element={<Navigate to={LEGACY_ANALYTICS_REDIRECTS.operations} replace />}
      />
      <Route
        path="room-configuration"
        element={<Navigate to="/admin/room-availability?tab=rooms" replace />}
      />
      <Route
        path="occupancy"
        element={
          <Navigate to="/admin/room-availability?tab=occupancy" replace />
        }
      />
      <Route
        path="digital-twin"
        element={
          <Navigate to="/admin/room-availability?tab=occupancy" replace />
        }
      />
      <Route
        path="financial"
        element={<Navigate to={LEGACY_ANALYTICS_REDIRECTS.financials} replace />}
      />
      <Route
        path="financials"
        element={<Navigate to={LEGACY_ANALYTICS_REDIRECTS.financials} replace />}
      />
      <Route
        path="analytics/reports"
        element={<Navigate to={ANALYTICS_DETAILS_PATH} replace />}
      />
      <Route
        path="branches"
        element={
          <ProtectedRoute requiredRole="owner">
            <RouteShell name="Branches">
              <BranchManagementPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="settings"
        element={
          <ProtectedRoute requiredRole="owner">
            <RouteShell name="Settings">
              <SystemSettingsPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="roles"
        element={
          <ProtectedRoute requiredRole="owner">
            <RouteShell name="Roles">
              <RolePermissionsPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
    </Route>
  );
}
