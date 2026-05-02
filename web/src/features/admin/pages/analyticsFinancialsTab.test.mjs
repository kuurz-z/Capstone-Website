import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("financial analytics lets DataTable handle overdue room pagination", async () => {
  const source = await readFile(
    path.join(__dirname, "AnalyticsFinancialsTab.jsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /pagedRooms/);
  assert.match(source, /data=\{overdueRooms\}/);
  assert.match(source, /total: overdueRoomsPagination\.total/);
  assert.match(source, /serverPagination/);
});
