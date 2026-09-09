import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./NotificationsTab.jsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../pages/NotificationsPage.jsx", import.meta.url), "utf8");

test("NotificationsTab renders a compact mobile dropdown select and desktop pill bar", () => {
  // Mobile dropdown select is present with sm:hidden
  assert.match(tabSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter pill bar is hidden on mobile and visible on sm+
  assert.match(tabSource, /className="[^"]*hidden\s+sm:flex[^"]*notif-filter-scroll/);

  // Mobile layout wraps or stacks header cleanly to prevent crushing
  assert.match(tabSource, /flex-col\s+sm:flex-row/);
});

test("NotificationsTab provides high-contrast active filter styling in dark mode", () => {
  // Uses responsive/dark mode classes or tokens rather than dark navy on dark
  assert.match(tabSource, /dark:bg-slate-100/);
  assert.match(tabSource, /dark:text-slate-900/);
});

test("NotificationsPage includes mobile filter dropdown and responsive header", () => {
  // Mobile filter dropdown present in page view
  assert.match(pageSource, /<select[\s\S]*?className="[^"]*sm:hidden/);

  // Desktop filter row preserves responsive visibility
  assert.match(pageSource, /className="[^"]*hidden\s+sm:flex/);
});
