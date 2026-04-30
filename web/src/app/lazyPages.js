import React from "react";

export const LandingPage = React.lazy(
  () => import("../features/public/pages/LandingPage"),
);
export const PrivacyPolicyPage = React.lazy(
  () => import("../features/public/pages/PrivacyPolicyPage"),
);
export const TermsOfServicePage = React.lazy(
  () => import("../features/public/pages/TermsOfServicePage"),
);
export const NotFoundPage = React.lazy(
  () => import("../features/public/pages/NotFoundPage"),
);
export const SignUp = React.lazy(
  () => import("../features/public/pages/SignUp.jsx"),
);
export const VerifyEmail = React.lazy(
  () => import("../features/public/pages/VerifyEmail.jsx"),
);
export const AuthAction = React.lazy(
  () => import("../features/tenant/pages/AuthAction.jsx"),
);

export const SignIn = React.lazy(
  () => import("../features/tenant/pages/SignIn.jsx"),
);
export const ForgotPassword = React.lazy(
  () => import("../features/tenant/pages/ForgotPassword.jsx"),
);
export const ResetPassword = React.lazy(
  () => import("../features/tenant/pages/ResetPassword.jsx"),
);
export const CheckAvailabilityPage = React.lazy(
  () => import("../features/tenant/pages/CheckAvailabilityPage"),
);
export const ReservationFlowPage = React.lazy(
  () => import("../features/tenant/pages/ReservationFlowPage"),
);
export const ProfilePage = React.lazy(
  () => import("../features/tenant/pages/ProfilePage"),
);
export const ContractsPage = React.lazy(
  () => import("../features/tenant/pages/ContractsPage"),
);
export const TenantBillingPage = React.lazy(
  () => import("../features/tenant/pages/BillingPage"),
);
export const TenantMaintenancePage = React.lazy(
  () => import("../features/tenant/pages/MaintenanceWorkspacePage"),
);
export const TenantAnnouncementsPage = React.lazy(
  () => import("../features/tenant/pages/AnnouncementsPage"),
);

export const AdminLayout = React.lazy(
  () => import("../features/admin/components/AdminLayout"),
);
export const AdminDashboardPage = React.lazy(
  () => import("../features/admin/pages/Dashboard"),
);
export const ReservationsPage = React.lazy(
  () => import("../features/admin/pages/ReservationsPage"),
);
export const RoomAvailabilityPage = React.lazy(
  () => import("../features/admin/pages/RoomAvailabilityPage"),
);
export const TenantsWorkspacePage = React.lazy(
  () => import("../features/admin/pages/TenantsWorkspacePage"),
);
export const AuditLogsPage = React.lazy(
  () => import("../features/admin/pages/AuditLogsPage"),
);
export const UserManagementPage = React.lazy(
  () => import("../features/admin/pages/UserManagementPage"),
);
export const AdminBillingPage = React.lazy(
  () => import("../features/admin/pages/AdminBillingPage"),
);
export const AdminAnnouncementsPage = React.lazy(
  () => import("../features/admin/pages/AdminAnnouncementsPage"),
);
export const AdminChatPage = React.lazy(
  () => import("../features/admin/pages/AdminChatPage.jsx"),
);
export const InquiriesPage = React.lazy(
  () => import("../features/admin/pages/InquiriesPage"),
);
export const DigitalTwinPage = React.lazy(
  () => import("../features/admin/pages/DigitalTwinPage"),
);
export const MaintenancePage = React.lazy(
  () => import("../features/admin/pages/AdminMaintenancePage.jsx"),
);
export const AnalyticsPage = React.lazy(
  () => import("../features/admin/pages/AnalyticsPage.jsx"),
);
export const AnalyticsDetailsPage = React.lazy(
  () => import("../features/admin/pages/AnalyticsDetailsPage.jsx"),
);
export const BranchManagementPage = React.lazy(
  () => import("../features/super-admin/pages/BranchManagementPage"),
);
export const RolePermissionsPage = React.lazy(
  () => import("../features/super-admin/pages/RolePermissionsPage"),
);
export const SystemSettingsPage = React.lazy(
  () => import("../features/super-admin/pages/SystemSettingsPage"),
);
export const AdminNotificationsPage = React.lazy(
  () => import("../features/admin/pages/AdminNotificationsPage"),
);
