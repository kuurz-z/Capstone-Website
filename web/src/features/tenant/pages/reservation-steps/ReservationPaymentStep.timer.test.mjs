import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fileContent = fs.readFileSync(
  new URL("./ReservationPaymentStep.jsx", import.meta.url),
  "utf8"
);

test("ReservationPaymentStep integrates PaymentTimerBanner and expiry protection", () => {
  assert.match(fileContent, /PaymentTimerBanner/, "Must import and render PaymentTimerBanner");
  assert.match(fileContent, /paymentExpiresAt/, "Must pass paymentExpiresAt to timer");
  assert.match(fileContent, /isTimerExpired/, "Must manage timer expiration state");
});
