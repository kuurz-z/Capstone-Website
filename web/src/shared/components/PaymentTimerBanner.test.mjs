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
  assert.doesNotMatch(fileContent, /Refresh Session/, "Must not render refresh session button");
  assert.doesNotMatch(fileContent, /bg-gradient/, "Must strictly avoid background gradients");
  assert.match(fileContent, /bg-transparent/, "Default container must be transparent to avoid nested cards");
  assert.match(fileContent, /card\s*=\s*false/, "Default card prop must be false to avoid nested cards");
});

test("PaymentTimerBanner stabilizes interval timer with onExpireRef to prevent interval churn", () => {
  assert.match(fileContent, /const onExpireRef = useRef\(onExpire\);/, "Must store onExpire in ref");
  assert.match(fileContent, /onExpireRef\.current = onExpire;/, "Must sync ref with prop updates");
  assert.match(fileContent, /\}, \[targetTime\]\);/, "Must depend only on targetTime, omitting onExpire to prevent interval teardown");
  assert.match(fileContent, /onExpireRef\.current\(\)/, "Must call onExpireRef.current() on expiry");
});
