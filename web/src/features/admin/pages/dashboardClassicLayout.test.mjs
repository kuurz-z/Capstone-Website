import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "../../../..");

async function read(relativePath) {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

test("admin dashboard route points back to the classic dashboard component", async () => {
  const lazyPages = await read("src/app/lazyPages.js");

  assert.match(lazyPages, /import\("\.\.\/features\/admin\/pages\/Dashboard"\)/);
  assert.doesNotMatch(lazyPages, /DashboardOperations/);
});

test("dashboard no longer redirects owners to a separate owner dashboard", async () => {
  const dashboard = await read("src/features/admin/pages/Dashboard.jsx");

  assert.doesNotMatch(dashboard, /SuperAdminDashboard/);
  assert.doesNotMatch(dashboard, /user\?\.role === "owner"/);
});

test("classic dashboard structure keeps inquiries, reservation status, and recent reservations panels", async () => {
  const dashboard = await read("src/features/admin/pages/Dashboard.jsx");

  assert.match(dashboard, /title="Recent Inquiries"/);
  assert.match(dashboard, /title="Reservation Status"/);
  assert.match(dashboard, /title="Recent Reservations"/);
  assert.match(dashboard, /showHeading=\{false\}/);
});
