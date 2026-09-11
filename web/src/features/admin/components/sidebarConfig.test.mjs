import test from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS, getVisibleNavItems } from "./sidebarConfig.mjs";

test("NAV_ITEMS includes Inquiries & Leads in the workspace group", () => {
  const inquiryItem = NAV_ITEMS.find((item) => item.to === "/admin/inquiries");

  assert.ok(inquiryItem, "Expected /admin/inquiries to be present in NAV_ITEMS");
  assert.equal(inquiryItem.text, "Inquiries & Leads");
  assert.equal(inquiryItem.group, "workspace");
  assert.ok(
    inquiryItem.priority > 2 && inquiryItem.priority < 3,
    "Expected priority between Reservations (2) and Room Management (3)",
  );
});

test("Inquiries & Leads is visible to both branch admins and owners", () => {
  const branchAdminItems = getVisibleNavItems({ isOwner: false, can: () => false });
  const ownerItems = getVisibleNavItems({ isOwner: true, can: () => true });

  const inAdminItems = branchAdminItems.some((item) => item.to === "/admin/inquiries");
  const inOwnerItems = ownerItems.some((item) => item.to === "/admin/inquiries");

  assert.equal(inAdminItems, true, "Expected /admin/inquiries to be visible to branch admins");
  assert.equal(inOwnerItems, true, "Expected /admin/inquiries to be visible to owners");
});
