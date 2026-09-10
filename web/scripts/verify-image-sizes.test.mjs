import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../src/assets/images");

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
      results.push({ path: fullPath, name: file.name, size: fs.statSync(fullPath).size });
    }
  }
  return results;
}

test("All bundled image assets are under 2.5MB", () => {
  const images = getFiles(ASSETS_DIR);
  const oversized = images.filter((img) => img.size > 2.5 * 1024 * 1024);
  assert.equal(
    oversized.length,
    0,
    `Found oversized images (>2.5MB): ${JSON.stringify(
      oversized.map((i) => ({ name: i.name, sizeMB: (i.size / (1024 * 1024)).toFixed(2) })),
      null,
      2
    )}`
  );
});
