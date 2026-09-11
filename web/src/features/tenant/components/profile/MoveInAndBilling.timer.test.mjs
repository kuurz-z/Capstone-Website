import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moveInCardContent = fs.readFileSync(
  new URL("./MoveInSettlementCard.jsx", import.meta.url),
  "utf8"
);
const profilePageContent = fs.readFileSync(
  new URL("../../pages/ProfilePage.jsx", import.meta.url),
  "utf8"
);
const billingTabContent = fs.readFileSync(
  new URL("./BillingTab.jsx", import.meta.url),
  "utf8"
);

test("MoveInSettlementCard integrates PaymentTimerBanner in review modal", () => {
  assert.match(
    moveInCardContent,
    /PaymentTimerBanner/,
    "MoveInSettlementCard must import and render PaymentTimerBanner"
  );
});

test("ProfilePage shows PaymentVerifyingModal and enriched reference toast on move-in return", () => {
  assert.match(
    profilePageContent,
    /PaymentVerifyingModal/,
    "ProfilePage must import and render PaymentVerifyingModal"
  );
  assert.match(
    profilePageContent,
    /referenceNumber/i,
    "ProfilePage must include referenceNumber in move-in payment toast"
  );
  assert.match(
    profilePageContent,
    /receipt.*email|email.*receipt/i,
    "ProfilePage must inform tenant about receipt sent via email"
  );
});

test("BillingTab integrates PaymentTimerBanner in PreCheckoutModal", () => {
  assert.match(
    billingTabContent,
    /PaymentTimerBanner/,
    "BillingTab must import and render PaymentTimerBanner"
  );
});

test("BillingTab renders PaymentVerifyingModal and enriches success toast with reference number", () => {
  assert.match(
    billingTabContent,
    /PaymentVerifyingModal/,
    "BillingTab must import and render PaymentVerifyingModal"
  );
  assert.match(
    billingTabContent,
    /<PaymentVerifyingModal[^>]*show=\{[^}]*verifyingPayment/i,
    "BillingTab must render PaymentVerifyingModal when verifyingPayment is true"
  );
  assert.match(
    billingTabContent,
    /referenceNumber/i,
    "BillingTab must include referenceNumber in payment confirmation toast"
  );
});
