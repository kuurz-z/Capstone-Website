import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const card = fs.readFileSync(new URL("./TenantTransferRequestCard.jsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("../../TenantDetailModal.jsx", import.meta.url), "utf8");

test("Admin card reviews, declines, or proceeds through the existing scheduling dialog", () => {
  for (const text of ["Pending Review", "Proceed to Schedule", "Confirm decline", "Preferred room type", "Reason"]) {
    assert.ok(card.includes(text), `missing ${text}`);
  }
  assert.ok(detail.includes("tenantTransferRequestId"));
  assert.ok(detail.includes('type: "transfer"'));
  assert.match(card, /request\.canReview === false/);
});
