import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./AnnouncementsTab.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../styles/tenant-announcements.css", import.meta.url), "utf8");

test("AnnouncementsTab renders a compact mobile dropdown select with counts and hides on sm+", () => {
  // Mobile dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter cards row has hidden sm:flex
  assert.match(tabSource, /className="[^"]*hidden\s+sm:flex[^"]*tenant-announcements-filter-cards/);
});

test("AnnouncementsTab adheres to strict terminology: Tenant Acknowledgment Required, NEVER Resident", () => {
  assert.match(tabSource, /Tenant Acknowledgment Required/);
  assert.doesNotMatch(tabSource, /Resident Acknowledgment Required/);
});

test("tenant-announcements.css provides high-contrast dark mode styling for active filter cards", () => {
  assert.match(cssSource, /html\[data-theme="dark"\]\s+\.tenant-announcements-filter-card--active|\.dark\s+\.tenant-announcements-filter-card--active/);
});
