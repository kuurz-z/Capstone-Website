import React from "react";
import { Navigate, Route } from "react-router-dom";
import ProtectedRoute from "../../shared/components/ProtectedRoute";
import { RouteShell } from "./RouteShell";
import {
  CheckAvailabilityPage,
  ReservationFlowPage,
  ProfilePage,
  ContractsPage,
  TenantBillingPage,
  TenantMaintenancePage,
  TenantAnnouncementsPage,
} from "../lazyPages";

export function TenantRoutes() {
  return (
    <>
      <Route
        path="/applicant"
        element={<Navigate to="/applicant/profile" replace />}
      />
      <Route
        path="/applicant/dashboard"
        element={
          <ProtectedRoute requiredRole="applicant">
            <Navigate to="/applicant/profile" replace />
          </ProtectedRoute>
        }
      />
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
            <RouteShell name="CheckAvailability">
              <CheckAvailabilityPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applicant/reservation"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="ReservationFlow">
              <ReservationFlowPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applicant/profile"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="Profile">
              <ProfilePage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applicant/contracts"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="Contracts">
              <ContractsPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />

      {/* Legacy standalone routes → redirect to profile with tab */}
      <Route
        path="/applicant/billing"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="Billing">
              <TenantBillingPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applicant/maintenance"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="Maintenance">
              <TenantMaintenancePage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applicant/announcements"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="Announcements">
              <TenantAnnouncementsPage />
            </RouteShell>
          </ProtectedRoute>
        }
      />
    </>
  );
}
