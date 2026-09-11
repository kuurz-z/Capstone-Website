import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fileContent = fs.readFileSync(
  new URL("./PaymentTimerBanner.jsx", import.meta.url),
  "utf8"
);

test("PaymentTimerBanner adheres to DMS standards and supports warning/expiry states", () => {
  assert.match(fileContent, /function PaymentTimerBanner/, "Must export PaymentTimerBanner component");
  assert.match(fileContent, /formattedTime/, "Must format time into MM:SS");
  assert.match(fileContent, /isWarning/, "Must evaluate warning threshold under 5 minutes");
  assert.match(fileContent, /onRefresh/, "Must provide refresh callback on expiration");
  assert.doesNotMatch(fileContent, /bg-gradient/, "Must strictly avoid background gradients");
});
