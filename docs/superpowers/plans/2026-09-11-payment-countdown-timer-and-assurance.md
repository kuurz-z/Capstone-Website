# Payment Countdown Timers & Real-Time Payment Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full transparency and peace of mind during tenant payments by implementing synchronized 15-minute countdown timers, real-time step-by-step verification screens (replacing blank loaders), and automated email receipts with transaction reference notifications across Slot Reservation Fee, Move-In Settlement, and Monthly Billing, including discreet bed unavailable handling.

**Architecture:** 
- Shared, accessible countdown component (`PaymentTimerBanner.jsx`) tracking remaining seconds against backend expiration timestamps with amber warning (< 5m) and expired freeze states.
- Dedicated verification progress dialog (`PaymentVerifyingModal.jsx`) that informs users step-by-step while polling PayMongo on checkout return, with a reassuring 10-second timeout fallback.
- Backend payment controller (`paymentController.js`) enrichment returning detailed payment metadata (reference number, amount, payment method, paid timestamp) and ensuring idempotent dispatch of official email receipts.
- Discreet bed unavailable collision handling: If User B selects a bed that is no longer free, the system displays a clean, neutral notice: *"This bed is currently unavailable. Please select another bed or room."* with zero mention of other applicants.
- Seamless in-page badge updates (emerald "Paid" / "Settled") paired with informative toasts confirming reference numbers and email dispatch.

**Tech Stack:** React 19, Vite, Lucide Icons, Express.js, MongoDB/Mongoose, PayMongo REST API, Node.js Test Runner (`node --test`), Jest.

**Spec:** `/grill-me` alignment decisions:
1. Cover all 3 payment milestones: Slot Reservation Fee (Step 4), Move-In Settlement (Advance Rent + Security Deposit), and Monthly Billing.
2. Reservation Fee syncs to 15-minute `paymentExpiresAt`; Move-In & Billing use 15-minute active checkout session timer + due date urgency indicators.
3. Replace blank loaders on PayMongo return with a step-by-step verification progress modal.
4. Confirmed payments update in-page cleanly without intrusive popups, dispatching automated email receipts and toast notifications with transaction references.
5. At 00:00 timer expiry, freeze pay button with 1-click "Refresh Payment Session" action.
6. Discreet bed unavailable edge case: If a bed is claimed or locked, show a clean message stating *"This bed is currently unavailable. Please select another bed or room."* without mentioning other applicants.

## What to Expect from These Changes

### 1. Visual Outcomes
- **Step 4 Reservation Payment**: A clear countdown banner at the top of checkout displaying `Temporary Room Hold: 14:59 remaining`. Transitions to amber at under 5 minutes. When expired, pay button locks and displays `Refresh Payment Session`.
- **Discreet Bed Unavailable Notice**: If an applicant selects a bed that is locked or unavailable, the toast cleanly displays: *"This bed is currently unavailable. Please select another available bed or room."*
- **Move-In & Monthly Billing**: Checkout review dialogs display an active 15-minute session timer banner: `Checkout Session: 14:59 remaining`.
- **Payment Verification on Return**: Returning from GCash, Maya, or Card replaces the blank spinning wheel / gray skeletons with a clean modal showing 3 progressive steps: `Connecting with PayMongo...` → `Confirming payment status...` → `Updating account records...`.
- **Post-Payment Reassurance**: Status chips update to emerald `Paid` or `Settled`, with toast notification: *"Payment confirmed! Your official receipt and reference #[REF] have been sent to your registered email."*
- **Design System Invariants**: Solid HSL tokens, neutral 1px borders (`border-slate-200 dark:border-slate-700`), strictly zero background/text gradients, standalone semantic icons.

### 2. Functional & Workflow Outcomes
- `reservation.paymentExpiresAt` from MongoDB is strictly used for the countdown; no artificial client-side clocks.
- `ReservationDashboard.jsx`'s `CheckoutLockBanner` uses true `paymentExpiresAt` instead of hardcoded 1800s.
- Returning from PayMongo triggers both client polling and webhook settlement, ensuring the tenant receives an official receipt email.

## Global Constraints

- **Strictly No Gradients**: Solid flat colors with 1px neutral borders (`border-slate-200 dark:border-slate-700`).
- **Terminology Invariants**: Use "Tenant" (never "Resident"), "Rent" (never "Rental Fee"), "Intended Move-in Date".
- **Non-Destructive**: Preserve all existing payment validation rules, webhook handlers, and idempotency safeguards.
- **Testing**: Every task includes automated tests verified via `node --test` or `npm test`.

---

## File Structure & Responsibilities

| File Path | Responsibility |
| :--- | :--- |
| `server/controllers/paymentController.js` | Enriches `checkPaymentStatus` response with transaction metadata and triggers receipt email. |
| `server/controllers/paymentController.test.js` | Backend unit test verifying payment status response envelope and metadata. |
| `web/src/shared/components/PaymentTimerBanner.jsx` | Reusable, accessible 15-minute countdown banner with warning & expired states. |
| `web/src/shared/components/PaymentTimerBanner.test.mjs` | Unit tests for timer formatting, thresholds, and callback triggers. |
| `web/src/shared/components/PaymentVerifyingModal.jsx` | Transparent 3-step verification progress modal with 10s reassuring timeout fallback. |
| `web/src/shared/components/PaymentVerifyingModal.test.mjs` | Unit tests verifying modal steps, accessibility, and timeout fallback message. |
| `web/src/features/tenant/pages/reservation-steps/ReservationPaymentStep.jsx` | Integrates `PaymentTimerBanner`, disabling pay button on expiry with refresh action. |
| `web/src/features/tenant/pages/reservation-steps/ReservationPaymentStep.timer.test.mjs` | Unit test verifying timer integration and pay button disabled state. |
| `web/src/features/tenant/hooks/useReservationFlow.js` | Handles discreet bed unavailable toast, renders `PaymentVerifyingModal`, and enriches toast. |
| `web/src/features/tenant/components/ReservationDashboard.jsx` | Passes true `paymentExpiresAt` to `CheckoutLockBanner`. |
| `web/src/features/tenant/components/profile/MoveInSettlementCard.jsx` | Adds 15-minute countdown timer inside move-in review modal and verifying modal on return. |
| `web/src/features/tenant/components/profile/BillingTab.jsx` | Adds 15-minute countdown to statement checkout review and renders verifying modal on return. |

---

## Task Decomposition

### Task 1: Enrich Backend Payment Status Metadata & Receipt Assurance

**Files:**
- Modify: `server/controllers/paymentController.js:780-840`
- Test: `server/controllers/paymentController.test.js`

**Interfaces:**
- Consumes: `getCheckoutSession(sessionId)` from PayMongo SDK
- Produces: API response `{ success: true, data: { status, paid, amount, paymentMethod, referenceNumber, paidAt } }`

- [ ] **Step 1: Write the test verifying payment status response metadata**
- [ ] **Step 2: Run test to observe baseline behavior**
- [ ] **Step 3: Implement minimal controller enrichment**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 2: Create Reusable `PaymentTimerBanner` Component

**Files:**
- Create: `web/src/shared/components/PaymentTimerBanner.jsx`
- Test: `web/src/shared/components/PaymentTimerBanner.test.mjs`

**Interfaces:**
- Props: `expiresAt`, `initialSeconds`, `title`, `subtitle`, `onExpire`, `onRefresh`, `compact`
- Produces: Live accessible countdown banner with emerald/amber/rose status dots and 1-click refresh button.

- [ ] **Step 1: Write the failing unit test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `PaymentTimerBanner.jsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: Create Transparent `PaymentVerifyingModal` Component

**Files:**
- Create: `web/src/shared/components/PaymentVerifyingModal.jsx`
- Test: `web/src/shared/components/PaymentVerifyingModal.test.mjs`

**Interfaces:**
- Props: `show`, `step`, `title`, `onClose`
- Produces: Transparent progress dialog explaining verification in plain terms.

- [ ] **Step 1: Write the failing unit test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `PaymentVerifyingModal.jsx`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 4: Integrate Live Timer, Verification Modal & Discreet Bed Unavailable Notice into Reservation Flow

**Files:**
- Modify: `web/src/features/tenant/pages/reservation-steps/ReservationPaymentStep.jsx`
- Modify: `web/src/features/tenant/hooks/useReservationFlow.js`
- Modify: `web/src/features/tenant/components/ReservationDashboard.jsx`
- Test: `web/src/features/tenant/pages/reservation-steps/ReservationPaymentStep.timer.test.mjs`

**Interfaces:**
- Consumes: `PaymentTimerBanner`, `PaymentVerifyingModal`, `reservationData.paymentExpiresAt`
- Produces: Live 15-minute countdown, disabled pay button upon expiry with refresh handler, transparent verification modal, and discreet notification (*"This bed is currently unavailable. Please select another bed or room."*) when a bed is locked or unavailable.

- [ ] **Step 1: Write failing test verifying timer integration in Step 4**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `ReservationPaymentStep.jsx`**
- [ ] **Step 4: Update `useReservationFlow.js` and `ReservationDashboard.jsx` with discreet bed unavailable messaging**
- [ ] **Step 5: Run test to verify it passes**
- [ ] **Step 6: Commit changes**

---

### Task 5: Integrate Checkout Timers & Verifying Modal into Move-In Settlement & Monthly Billing

**Files:**
- Modify: `web/src/features/tenant/components/profile/MoveInSettlementCard.jsx`
- Modify: `web/src/features/tenant/components/profile/BillingTab.jsx`
- Test: `web/src/features/tenant/components/profile/MoveInSettlementCard.timer.test.mjs`
- Test: `web/src/features/tenant/components/profile/BillingTab.timer.test.mjs`

**Interfaces:**
- Consumes: `PaymentTimerBanner`, `PaymentVerifyingModal`
- Produces: 15-minute checkout countdown banners inside review dialogs and verification modals on redirect returns.

- [ ] **Step 1: Write failing tests for Move-In and Billing timer integrations**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Update `MoveInSettlementCard.jsx`**
- [ ] **Step 4: Update `BillingTab.jsx`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit changes**

---

### Task 6: End-to-End Build Verification & Manual QA Guide

**Files:**
- Verify: Full web client build (`npm run build`)
- Verify: Server test suite (`npm test`)

- [ ] **Step 1: Run client build verification**
- [ ] **Step 2: Run server test suite**
- [ ] **Step 3: Commit all documentation & walkthrough updates**
