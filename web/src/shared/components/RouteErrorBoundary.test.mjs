import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const errorBoundaryPath = path.resolve(__dirname, "RouteErrorBoundary.jsx");

test("RouteErrorBoundary handleRetry triggers page reload or clean recovery instead of silent state-only reset", () => {
  const content = fs.readFileSync(errorBoundaryPath, "utf-8");
  
  // Verify that handleRetry always calls window.location.reload()
  assert.match(
    content,
    /handleRetry\s*=\s*\(\)\s*=>\s*\{[\s\S]*?window\.location\.reload\(\)[\s\S]*?\};/,
    "handleRetry must reload the page on retry to refresh state and session"
  );

  // Verify visual loading state is set so user sees 'Reloading...'
  assert.match(
    content,
    /isRetrying/i,
    "RouteErrorBoundary must track isRetrying state for visual feedback"
  );

  assert.match(
    content,
    /Reloading\.\.\./,
    "Button must show 'Reloading...' feedback while reload is underway"
  );
});
