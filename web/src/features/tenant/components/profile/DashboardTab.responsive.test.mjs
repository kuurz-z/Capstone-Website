import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tabSource = readFileSync(new URL("./DashboardTab.jsx", import.meta.url), "utf8");
const profileCssSource = readFileSync(new URL("../../styles/profile-page.css", import.meta.url), "utf8");
const layoutCssSource = readFileSync(new URL("../../../../shared/layouts/TenantLayout.css", import.meta.url), "utf8");

test("DashboardTab uses responsive CSS grid class instead of rigid inline 768px check for layout", () => {
  assert.match(
    tabSource,
    /className="[^"]*dashboard-tab-grid[^"]*"/,
    "DashboardTab must use the .dashboard-tab-grid CSS class"
  );
  assert.doesNotMatch(
    tabSource,
    /gridTemplateColumns:\s*"1fr 290px"/,
    "DashboardTab must not hardcode rigid inline gridTemplateColumns 1fr 290px"
  );
});

test("profile-page.css configures responsive grid with minmax(0, 1fr) and portrait breakpoint stacking", () => {
  assert.match(
    profileCssSource,
    /\.dashboard-tab-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+290px;/,
    "Grid must define minmax(0, 1fr) to prevent child min-width blowout"
  );
  assert.match(
    profileCssSource,
    /@media\s*\([^)]*max-width:\s*1180px[^)]*\)\s*\{[\s\S]*?\.dashboard-tab-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
    "Grid must stack into single column at <= 1180px (portrait monitor / medium screen)"
  );
});

test("TenantLayout.css applies overflow safety and compact portrait padding", () => {
  assert.match(
    layoutCssSource,
    /\.tenant-content\s*\{[\s\S]*?overflow-x:\s*hidden;/,
    "Tenant content must have overflow-x: hidden to prevent horizontal scroll drift"
  );
  assert.match(
    layoutCssSource,
    /@media\s*\([^)]*max-width:\s*1180px[^)]*\)\s*\{[\s\S]*?\.tenant-content\s*\{[\s\S]*?padding:/,
    "Tenant content must have responsive compact padding for <= 1180px viewports"
  );
});
