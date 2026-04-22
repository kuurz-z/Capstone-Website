import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(fileName) {
  return readFile(path.join(__dirname, fileName), "utf8");
}

test("analytics summary keeps a KPI-plus-chart overview structure", async () => {
  const source = await readSource("AnalyticsPage.jsx");

  assert.match(source, /className="analytics-summary-focus flex flex-col gap-6"/);
  assert.match(source, /className="analytics-summary-layout"/);
  assert.match(source, /className="analytics-summary-overview__header"/);
  assert.match(source, /className="analytics-summary-sections__header"/);
  assert.match(source, /className="analytics-summary-section-header__title"/);
  assert.match(source, /data-summary-overview="true"/);
  assert.match(source, /data-summary-overview-block=\{sectionKey\}/);
  assert.match(source, /sectionKey="occupancy"/);
  assert.match(source, /sectionKey="billing"/);
  assert.match(source, /sectionKey="operations"/);
  assert.match(source, /data-summary-focus-section="occupancy"/);
  assert.match(source, /data-summary-focus-section="billing"/);
  assert.match(source, /data-summary-focus-section="operations"/);
  assert.match(source, /data-summary-focus-sections="true"/);
});

test("analytics summary no longer renders the legacy stacked summary section helper", async () => {
  const source = await readSource("AnalyticsPage.jsx");

  assert.doesNotMatch(source, /function SummarySection\s*\(/);
  assert.doesNotMatch(source, /function SummarySignalGrid/);
  assert.doesNotMatch(source, /function SummaryOverviewSignal/);
  assert.doesNotMatch(source, /function OwnerShortcutLink/);
  assert.doesNotMatch(source, /<SummarySection\s/);
  assert.doesNotMatch(source, /analytics-summary-focus__mobile-nav/);
  assert.doesNotMatch(source, /deckRef/);
  assert.doesNotMatch(source, /activeDeckIndex/);
  assert.doesNotMatch(source, /data-summary-owner-shortcuts="true"/);
});

test("analytics summary opts into compact toolbar mode", async () => {
  const source = await readSource("AnalyticsPage.jsx");
  const toolbarSource = await readSource(
    path.join("..", "components", "shared", "AnalyticsToolbar.jsx"),
  );

  assert.match(source, /<AnalyticsToolbar[\s\S]*compact/);
  assert.match(toolbarSource, /compact = false/);
  assert.match(toolbarSource, /const sectionClassName = compact/);
});

test("analytics summary uses default page scrolling instead of an inner chart scroller", async () => {
  const styles = await readSource(path.join("..", "styles", "admin-reports.css"));
  const layoutStyles = await readSource(path.join("..", "styles", "admin-layout.css"));
  const layoutSource = await readSource(
    path.join("..", "components", "AdminLayout.jsx"),
  );

  assert.match(
    styles,
    /\.analytics-summary-layout__body\s*\{[\s\S]*align-items:\s*stretch;/,
  );
  assert.doesNotMatch(
    styles,
    /\.analytics-summary-layout__main\s*>\s*\.analytics-summary-focus\s*\{[\s\S]*overflow-y:\s*auto;/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(min-width: 1025px\)\s*\{[\s\S]*\.analytics-summary-overview\s*\{[\s\S]*min-height:\s*100%;/,
  );
  assert.doesNotMatch(layoutStyles, /\.admin-content--viewport-locked\s*\{/);
  assert.doesNotMatch(layoutSource, /admin-content--viewport-locked/);
  assert.doesNotMatch(layoutSource, /admin-layout--analytics-summary/);
});
