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

  assert.match(summaryMeta.description, /chart-first summary page/i);
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
  const branchAdminItems = getVisibleNavItems({ isOwner: false, can: () => true });
  const ownerItems = getVisibleNavItems({ isOwner: true, can: () => true });

  assert.equal(branchAdminItems.some((item) => item.to === "/admin/roles"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/branches"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/settings"), false);
  assert.equal(branchAdminItems.some((item) => item.to === "/admin/audit-logs"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/roles"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/branches"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/settings"), true);
});

test("system navigation labels and ordering match the phase 1 IA", () => {
  const ownerItems = getVisibleNavItems({ isOwner: true, can: () => true })
    .filter((item) => item.group === "system")
    .map((item) => ({ to: item.to, text: item.text }));

  assert.deepEqual(ownerItems, [
    { to: "/admin/users", text: "Accounts" },
    { to: "/admin/roles", text: "Roles & Permissions" },
    { to: "/admin/audit-logs", text: "Audit & Security" },
    { to: "/admin/branches", text: "Branches" },
    { to: "/admin/settings", text: "Policies & Settings" },
  ]);
});

test("system topbar copy uses the phase 1 labels", () => {
  assert.deepEqual(getPageMeta("/admin/audit-logs"), {
    title: "Audit & Security",
    description:
      "Review audit events, trace administrative changes, and inspect security-relevant activity.",
  });

  assert.deepEqual(getPageMeta("/admin/roles"), {
    title: "Roles & Permissions",
    description:
      "Adjust branch admin capabilities carefully so access stays predictable and auditable.",
  });

  assert.deepEqual(getPageMeta("/admin/settings"), {
    title: "Policies & Settings",
    description:
      "Control platform policies, defaults, safeguards, and shared operational behavior.",
  });
});
