import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tenantSidebarJsx = fs.readFileSync(path.join(here, "Sidebar.jsx"), "utf8");
const tenantSidebarCss = fs.readFileSync(path.join(here, "Sidebar.css"), "utf8");

const adminSidebarJsx = fs.readFileSync(
  path.join(here, "../../features/admin/components/AdminSidebar.jsx"),
  "utf8"
);
const adminSidebarCss = fs.readFileSync(
  path.join(here, "../../features/admin/styles/admin-sidebar.css"),
  "utf8"
);
const adminLayoutCss = fs.readFileSync(
  path.join(here, "../../features/admin/styles/admin-layout.css"),
  "utf8"
);

test("Tenant sidebar CSS places mobile sidebar strictly above the backdrop overlay (z-index hierarchy)", () => {
  // Mobile overlay must be at z-index 990
  assert.match(
    tenantSidebarCss,
    /\.sidebar-overlay\s*\{[^}]*z-index:\s*990;/,
    "Tenant .sidebar-overlay must have z-index: 990"
  );

  // Mobile sidebar must be elevated to z-index 1000 in media query
  assert.match(
    tenantSidebarCss,
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.sidebar\s*\{[\s\S]*?z-index:\s*1000;/,
    "Tenant .sidebar on mobile must have z-index: 1000 (above overlay at 990)"
  );
});

test("Tenant sidebar CSS uses snappy 280ms transition and smooth backdrop fade", () => {
  assert.match(
    tenantSidebarCss,
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.sidebar\s*\{[\s\S]*?transition:[\s\S]*?0\.28s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/,
    "Tenant .sidebar on mobile must use snappy 0.28s transition"
  );

  assert.match(
    tenantSidebarCss,
    /\.sidebar-overlay\s*\{[^}]*transition:[\s\S]*?opacity 0\.25s/,
    "Tenant .sidebar-overlay must have smooth opacity transition"
  );
});

test("Tenant sidebar JSX supports Escape key dismissal and logo link tap-to-close on mobile", () => {
  // Escape key support
  assert.match(
    tenantSidebarJsx,
    /e\.key\s*===\s*"Escape"/,
    "Tenant sidebar must listen for Escape key to close on mobile"
  );

  // Logo tap to close on mobile
  assert.match(
    tenantSidebarJsx,
    /<Link[^>]*className="sidebar-brand"[^>]*onClick=/,
    "Tenant sidebar brand link must close sidebar on mobile"
  );
});

test("Admin sidebar and layout CSS defines properly layered mobile overlay and elevated sidebar", () => {
  // Admin overlay must be defined in admin-layout.css with z-index 990
  assert.match(
    adminLayoutCss,
    /\.admin-sidebar-overlay\s*\{[^}]*z-index:\s*990;/,
    "Admin .admin-sidebar-overlay must have z-index: 990"
  );
  assert.match(
    adminLayoutCss,
    /\.admin-sidebar-overlay\s*\{[^}]*backdrop-filter:\s*blur\(4px\);/,
    "Admin .admin-sidebar-overlay must include backdrop blur"
  );

  // Admin sidebar on mobile must be elevated to z-index 1000
  assert.match(
    adminSidebarCss,
    /@media\s*\(max-width:\s*768px\)[\s\S]*?\.admin-sidebar\s*\{[\s\S]*?z-index:\s*1000;/,
    "Admin .admin-sidebar on mobile must have z-index: 1000"
  );
});

test("Admin sidebar JSX supports Escape key dismissal and brand logo tap-to-close on mobile", () => {
  assert.match(
    adminSidebarJsx,
    /e\.key\s*===\s*"Escape"/,
    "Admin sidebar must listen for Escape key to close on mobile"
  );

  assert.match(
    adminSidebarJsx,
    /<Link[^>]*className="admin-sidebar-brand"[^>]*onClick=/,
    "Admin sidebar brand link must close sidebar when open"
  );
});
