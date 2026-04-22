import React from "react";
import { Navigate, Route } from "react-router-dom";
import ProtectedRoute from "../../shared/components/ProtectedRoute";
import TenantLayout from "../../shared/layouts/TenantLayout";
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
      <Route path="/applicant" element={<Navigate to="/applicant/profile" replace />} />
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
        path="/applicant"
        element={
          <ProtectedRoute requiredRole="applicant">
            <RouteShell name="TenantLayout">
              <TenantLayout />
            </RouteShell>
          </ProtectedRoute>
        }
      >
        <Route
          path="reservation"
          element={
            <RouteShell name="ReservationFlow">
              <ReservationFlowPage />
            </RouteShell>
          }
        />
        <Route
          path="profile"
          element={
            <RouteShell name="Profile">
              <ProfilePage />
            </RouteShell>
          }
        />
        <Route
          path="contracts"
          element={
            <RouteShell name="Contracts">
              <ContractsPage />
            </RouteShell>
          }
        />
        <Route
          path="billing"
          element={
            <RouteShell name="Billing">
              <TenantBillingPage />
            </RouteShell>
          }
        />
        <Route
          path="maintenance"
          element={
            <RouteShell name="Maintenance">
              <TenantMaintenancePage />
            </RouteShell>
          }
        />
        <Route
          path="announcements"
          element={
            <RouteShell name="Announcements">
              <TenantAnnouncementsPage />
            </RouteShell>
          }
        />
      </Route>
    </>
  );
}
