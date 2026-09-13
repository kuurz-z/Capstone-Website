import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

test("transfer wizard opens before its financial preview is available", async (t) => {
  const webRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const vite = await createServer({
    root: webRoot, configFile: path.join(webRoot, "vite.config.js"), logLevel: "error",
    cacheDir: path.join(os.tmpdir(), `lilycrest-transfer-render-${process.pid}`),
    server: { host: "127.0.0.1", port: 0, open: false },
    plugins: [{ name: "transfer-render-test", configureServer(server) {
      server.middlewares.use("/__transfer-render-test__", async (req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.originalUrl,
          '<div id="root"></div><script type="module" src="/src/test-fixtures/TransferTenantHarness.jsx"></script>'));
      });
    } }],
  });
  await vite.listen(); t.after(() => vite.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__transfer-render-test__`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByRole("heading", { name: /Transfer Tenant.*Transfer smoke test/ }).waitFor({ timeout: 90000 })
    .catch(() => assert.fail(`Transfer wizard did not render: ${errors.join(" | ")}`));
  assert.equal(await page.getByRole("button", { name: "Next", exact: true }).count(), 1);
  assert.deepEqual(errors, []);
});
