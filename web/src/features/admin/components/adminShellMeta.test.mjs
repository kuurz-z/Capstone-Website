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

test("analytics overview copy removes owner-only wording while keeping owner tabs distinct", () => {
  const overviewMeta = getPageMeta("/admin/analytics", "?tab=overview");
  const financialsMeta = getPageMeta("/admin/analytics", "?tab=financials");

  assert.doesNotMatch(overviewMeta.description, /owner-only oversight/i);
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

  assert.equal(branchAdminItems.some((item) => item.to === "/admin/branches"), false);
  assert.equal(ownerItems.some((item) => item.to === "/admin/branches"), true);
  assert.equal(ownerItems.some((item) => item.to === "/admin/settings"), true);
});
