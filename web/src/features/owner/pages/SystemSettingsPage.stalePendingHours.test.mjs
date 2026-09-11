import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("SystemSettingsPage supports fractional stalePendingHours down to 0.25h", () => {
  const filePath = new URL("./SystemSettingsPage.jsx", import.meta.url);
  assert.ok(fs.existsSync(filePath), "SystemSettingsPage.jsx must exist");
  const content = fs.readFileSync(filePath, "utf8");

  // 1. stalePendingHours must not be in WHOLE_NUMBER_KEYS
  const wholeNumberBlockMatch = content.match(/const WHOLE_NUMBER_KEYS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(wholeNumberBlockMatch, "Must find WHOLE_NUMBER_KEYS set");
  assert.ok(
    !wholeNumberBlockMatch[1].includes('"stalePendingHours"'),
    "stalePendingHours must not be restricted to whole numbers",
  );

  // 2. FIELD_LIMITS.stalePendingHours min must be 0.25 (15 minutes)
  assert.match(
    content,
    /stalePendingHours:\s*\{\s*min:\s*0\.25,\s*max:\s*720/,
    "FIELD_LIMITS.stalePendingHours must allow minimum 0.25h",
  );
});
