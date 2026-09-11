import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fileContent = fs.readFileSync(
  new URL("./PaymentVerifyingModal.jsx", import.meta.url),
  "utf8"
);

test("PaymentVerifyingModal renders 3 transparent verification steps with reassurance fallback", () => {
  assert.match(fileContent, /function PaymentVerifyingModal/, "Must export PaymentVerifyingModal");
  assert.match(fileContent, /Contacting PayMongo/i, "Must show PayMongo gateway step");
  assert.match(fileContent, /Confirming payment status/i, "Must show status confirmation step");
  assert.match(fileContent, /Updating your account records/i, "Must show ledger update step");
  assert.match(fileContent, /Please do not close/i, "Must warn applicant not to close window");
});
