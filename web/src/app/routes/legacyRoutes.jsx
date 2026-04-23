import React from "react";
import { Navigate, Route, useLocation } from "react-router-dom";

function LegacyBillingRedirect() {
  const location = useLocation();

  return (
    <Navigate
      to={{
        pathname: "/applicant/billing",
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
}

export function LegacyRoutes() {
  return (
    <>
      <Route path="/admin/login" element={<Navigate to="/signin" replace />} />
      <Route path="/billing" element={<LegacyBillingRedirect />} />
      <Route
        path="/tenant/forgot-password"
        element={<Navigate to="/forgot-password" replace />}
      />
      <Route
        path="/super-admin"
        element={<Navigate to="/admin/dashboard" replace />}
      />
      <Route
        path="/super-admin/users"
        element={<Navigate to="/admin/users" replace />}
      />
      <Route
        path="/super-admin/tenants"
        element={<Navigate to="/admin/tenants" replace />}
      />
      <Route
        path="/super-admin/activity-logs"
        element={<Navigate to="/admin/audit-logs" replace />}
      />
      <Route
        path="/super-admin/branches"
        element={<Navigate to="/admin/branches" replace />}
      />
      <Route
        path="/super-admin/roles"
        element={<Navigate to="/admin/roles" replace />}
      />
      <Route
        path="/super-admin/settings"
        element={<Navigate to="/admin/settings" replace />}
      />
    </>
  );
}
