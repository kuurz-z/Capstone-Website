import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./RoomTransferRequestPanel.jsx", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../../../../shared/api/tenantTransferApi.js", import.meta.url), "utf8");
const hookSource = fs.readFileSync(new URL("../../../../shared/hooks/queries/useTenantTransfers.js", import.meta.url), "utf8");
const socketSource = fs.readFileSync(new URL("../../../../shared/hooks/useSocketClient.js", import.meta.url), "utf8");
const profileSource = fs.readFileSync(new URL("../../pages/ProfilePage.jsx", import.meta.url), "utf8");
const sidebarSource = fs.readFileSync(new URL("../../../../shared/components/Sidebar.jsx", import.meta.url), "utf8");

test("tenant web room-transfer UI covers canonical states and required disclaimer", () => {
  for (const text of [
    "lifecycle.statusLabel",
    "scheduled",
    "declined",
    "cancelled",
    "Room preference and transfer date are subject to Admin confirmation.",
    "Please coordinate with the Administration Office for changes to a scheduled room transfer.",
  ]) assert.ok(source.includes(text), `missing ${text}`);
});

test("tenant web distinguishes loading/error/unknown from requestable and retries 409 conflicts", () => {
  for (const text of ["isLoading", "isError", "Room transfer status unavailable", "Retry"]) {
    assert.ok(source.includes(text), `missing ${text}`);
  }
  assert.match(hookSource, /response\?\.status === 409/);
  assert.match(hookSource, /refetchQueries/);
  assert.match(socketSource, /hasConnectedOnceRef[\s\S]*roomTransfer/);
});

test("tenant web uses the authenticated safe preference projection and Manila schedule formatting", () => {
  assert.match(apiSource, /tenant\/room-transfer-preferences/);
  assert.match(source, /room\.roomId/);
  assert.doesNotMatch(source, /useRooms/);
  assert.match(source, /timeZone: "Asia\/Manila"/);
  assert.match(source, /year: "numeric"/);
  assert.match(profileSource, /activeTab === "stays"/);
  assert.match(profileSource, /location\.search/);
  assert.match(sidebarSource, /label: "Activity & History"/);
});

test("tenant web sends intent fields only and exposes pending cancellation route", () => {
  for (const field of ["preferredRoomType", "preferredTransferDate", "reason", "note"]) assert.ok(source.includes(field));
  for (const forbidden of ["targetBedId", "meterReading", "settlementBill", "addendumContract"]) assert.equal(source.includes(forbidden), false);
  assert.match(apiSource, /room-transfer-request\/current/);
  assert.match(apiSource, /room-transfer-requests\/\$\{requestId\}\/cancel/);
});
