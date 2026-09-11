import test from "node:test";
import assert from "node:assert/strict";
import { getPageMeta } from "./adminShellMeta.mjs";
import { getSidebarBrandMeta, getVisibleNavItems } from "./sidebarConfig.mjs";

test("dashboard copy stays operations-focused", () => {
  const meta = getPageMeta("/admin/dashboard");

  assert.equal(meta.title, "Dashboard");
  assert.match(meta.description, /operations view/i);
  assert.doesNotMatch(meta.description, /owner-only oversight/i);
});

test("analytics summary and detail copy stay distinct", () => {
  const summaryMeta = getPageMeta("/admin/analytics");
  const financialsMeta = getPageMeta(
    "/admin/analytics/details",
    "?tab=financials",
  );

  assert.match(summaryMeta.description, /consolidated analytics overview/i);
  assert.match(financialsMeta.description, /owner financial performance/i);
});

test("sidebar branding stays workspace-first for both branch admins and owners", () => {
  assert.deepEqual(getSidebarBrandMeta(false), {
    title: "Lilycrest",
    subtitle: "Operations Workspace",
    roleLabel: "Branch Admin",
  });

  assert.deepEqual(getSidebarBrandMeta(true), {
    title: "Lilycrest",
    subtitle: "Operations Workspace",
    roleLabel: "Owner",
  });
});

test("owners keep owner-only routes while branch admins stay on shared workspace items", () => {
  const branchAdminItems = getVisibleNavItems({ isOwner: false, can: () => false });
  const ownerItems = getVisibleNavItems({ isOwner: true, can: () => true });

  assert.equal(branchAdminItems.some((item) => item.to === "/admin/branches"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/settings"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/users"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/audit-logs"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/analytics"), false);
  assert.equal(ownerItems.some((item) => item.to === "/admin/branches"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/settings"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/users"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/audit-logs"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/analytics"), true);
});

test("system navigation labels and ordering match the consolidated IA", () => {
  const ownerItems = getVisibleNavItems({ isOwner: true, can: () => true })
    .filter((item) => item.group === "system")
    .map((item) => ({ to: item.to, text: item.text }));

  assert.deepEqual(ownerItems, [
    { to: "/admin/users", text: "Accounts & Access" },
    { to: "/admin/branches", text: "Branches" },
    { to: "/admin/audit-logs", text: "Audit & Security" },
    { to: "/admin/settings", text: "Settings & Policies" },
  ]);
});

test("system topbar copy uses the consolidated labels", () => {
  const userMeta = getPageMeta("/admin/users");
  assert.equal(userMeta.title, "Accounts & Access");
  assert.equal(
    userMeta.description,
    "Manage user accounts, credentials, and configure granular branch admin access permissions.",
  );

  const auditMeta = getPageMeta("/admin/audit-logs");
  assert.equal(auditMeta.title, "Audit & Security");
  assert.equal(
    auditMeta.description,
    "Review audit events, trace administrative changes, and inspect security-relevant activity.",
  );

  const settingsMeta = getPageMeta("/admin/settings");
  assert.equal(settingsMeta.title, "Settings & Policies");
  assert.equal(
    settingsMeta.description,
    "Control platform policies, defaults, branch overrides, and manage database backup and recovery.",
  );
});



test("base pages stop at page name without extra sub-tab names in breadcrumbs", () => {
  const roomMeta = getPageMeta("/admin/room-availability");
  assert.deepEqual(roomMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Room Management" },
  ]);

  const tenantsMeta = getPageMeta("/admin/tenants");
  assert.deepEqual(tenantsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Tenants" },
  ]);

  const analyticsMeta = getPageMeta("/admin/analytics");
  assert.deepEqual(analyticsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Analytics" },
  ]);

  const billingMeta = getPageMeta("/admin/billing");
  assert.deepEqual(billingMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Billing" },
  ]);

  const usersMeta = getPageMeta("/admin/users");
  assert.deepEqual(usersMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Accounts & Access" },
  ]);

  const reservationsMeta = getPageMeta("/admin/reservations");
  assert.deepEqual(reservationsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Reservations" },
  ]);

  const inquiriesMeta = getPageMeta("/admin/inquiries");
  assert.deepEqual(inquiriesMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Inquiries & Leads" },
  ]);

  const auditMeta = getPageMeta("/admin/audit-logs");
  assert.deepEqual(auditMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Audit & Security" },
  ]);

  const maintenanceMeta = getPageMeta("/admin/maintenance");
  assert.deepEqual(maintenanceMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Maintenance" },
  ]);

  const announcementsMeta = getPageMeta("/admin/announcements");
  assert.deepEqual(announcementsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Announcements" },
  ]);

  const notifsMeta = getPageMeta("/admin/notifications");
  assert.deepEqual(notifsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Notifications" },
  ]);

  const settingsMeta = getPageMeta("/admin/settings");
  assert.deepEqual(settingsMeta.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Settings & Policies" },
  ]);
});

test("dynamic 3-level breadcrumbs are generated ONLY when an explicit sub-tab is active", () => {
  const analyticsOccupancy = getPageMeta("/admin/analytics", "?tab=occupancy");
  assert.deepEqual(analyticsOccupancy.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Analytics", href: "/admin/analytics" },
    { label: "Occupancy" },
  ]);

  const billingWater = getPageMeta("/admin/billing", "?tab=water");
  assert.deepEqual(billingWater.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Billing", href: "/admin/billing" },
    { label: "Water" },
  ]);

  const userRoles = getPageMeta("/admin/users", "?tab=roles");
  assert.deepEqual(userRoles.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Accounts & Access", href: "/admin/users" },
    { label: "Roles & Permissions" },
  ]);

  const reservationVisits = getPageMeta("/admin/reservations", "?tab=visits");
  assert.deepEqual(reservationVisits.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Reservations", href: "/admin/reservations" },
    { label: "Visit Schedules" },
  ]);

  const auditSignals = getPageMeta("/admin/audit-logs", "?tab=signals");
  assert.deepEqual(auditSignals.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Audit & Security", href: "/admin/audit-logs" },
    { label: "Security Signals" },
  ]);

  const maintenanceAnalytics = getPageMeta("/admin/maintenance", "?tab=analytics");
  assert.deepEqual(maintenanceAnalytics.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Maintenance", href: "/admin/maintenance" },
    { label: "Analytics" },
  ]);

  const settingsBackups = getPageMeta("/admin/settings", "?tab=backups");
  assert.deepEqual(settingsBackups.breadcrumbs, [
    { label: "Admin", href: "/admin/dashboard" },
    { label: "Settings & Policies", href: "/admin/settings" },
    { label: "Database Backup" },
  ]);
});


