import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flowPageContent = fs.readFileSync(
  new URL("./ReservationFlowPage.jsx", import.meta.url),
  "utf8"
);
const useReservationFlowContent = fs.readFileSync(
  new URL("../hooks/useReservationFlow.js", import.meta.url),
  "utf8"
);
const checkAvailabilityContent = fs.readFileSync(
  new URL("./CheckAvailabilityPage.jsx", import.meta.url),
  "utf8"
);
const dashboardContent = fs.readFileSync(
  new URL("../components/ReservationDashboard.jsx", import.meta.url),
  "utf8"
);
const checkoutBannerContent = fs.readFileSync(
  new URL("../components/CheckoutLockBanner.jsx", import.meta.url),
  "utf8"
);

test("ReservationFlowPage imports and displays PaymentVerifyingModal on payment return", () => {
  assert.match(
    flowPageContent,
    /PaymentVerifyingModal/,
    "ReservationFlowPage must import PaymentVerifyingModal"
  );
  assert.match(
    flowPageContent,
    /<PaymentVerifyingModal[^>]*show=\{[^}]*\}|<PaymentVerifyingModal[^>]*show/i,
    "ReservationFlowPage must render PaymentVerifyingModal during payment return"
  );
});

test("useReservationFlow enriches payment success toast with reference number and receipt confirmation", () => {
  assert.match(
    useReservationFlowContent,
    /referenceNumber/i,
    "useReservationFlow must reference referenceNumber from payment status result"
  );
  assert.match(
    useReservationFlowContent,
    /receipt.*email|email.*receipt/i,
    "useReservationFlow must reassure tenant that receipt was emailed"
  );
});

test("CheckAvailabilityPage handles BED_UNAVAILABLE with discreet message", () => {
  assert.match(
    checkAvailabilityContent,
    /BED_UNAVAILABLE/,
    "CheckAvailabilityPage must explicitly handle BED_UNAVAILABLE"
  );
  assert.match(
    checkAvailabilityContent,
    /This bed is currently unavailable/i,
    "CheckAvailabilityPage must display 'This bed is currently unavailable' message"
  );
  assert.doesNotMatch(
    checkAvailabilityContent,
    /selected by other applicant/i,
    "CheckAvailabilityPage must NEVER say 'selected by other applicant'"
  );
});

test("ReservationDashboard passes paymentExpiresAt to CheckoutLockBanner", () => {
  assert.match(
    dashboardContent,
    /paymentExpiresAt/,
    "ReservationDashboard must pass paymentExpiresAt to CheckoutLockBanner"
  );
  assert.match(
    checkoutBannerContent,
    /expiresAt/,
    "CheckoutLockBanner must support expiresAt prop"
  );
});
