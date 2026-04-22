# Tenant Billing Checkout Rollout

This checklist covers the current monthly-billing payment flow after the Phase 1 to 7 fixes.

Monthly tenant billing now uses PayMongo online checkout as the primary payment path.
Legacy proof verification remains readable for already-submitted proof records, but new monthly-bill proof uploads are disabled.

## Scope

- Tenant monthly bills: PayMongo checkout
- Tenant post-payment return: `/applicant/billing`
- Canonical bill settlement: shared backend settlement helper
- Payment ledger visibility: `/api/payments/history` and `/api/payments/bill/:billId/payments`
- Offline branch-assisted payments: admin manual settlement only

## Required Environment

Server startup validation checks these groups in [startupValidation.js](../server/config/startupValidation.js):

- MongoDB: `MONGODB_URI`
- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_CLIENT_CERT_URL`
- PayMongo: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`
- Email: `EMAIL_USER`, `EMAIL_PASSWORD`
- Frontend/CORS: `FRONTEND_URL` or `CORS_ORIGINS`

Recommended local values:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
PAYMONGO_SECRET_KEY=...
PAYMONGO_WEBHOOK_SECRET=...
```

Notes:

- `FRONTEND_URL` should match the actual tenant frontend origin used for checkout return URLs.
- In production, missing required config fails startup.
- In development, missing config logs warnings, but checkout/webhook validation will still fail if PayMongo keys are absent.

## Webhook Requirements

PayMongo webhook endpoint:

- `POST /api/webhooks/paymongo`

Important implementation details:

- The route uses `express.raw({ type: "application/json" })` in [webhookRoutes.js](../server/routes/webhookRoutes.js).
- It is registered before global `express.json()` in [server.js](../server/server.js).
- `PAYMONGO_WEBHOOK_SECRET` must match the webhook signing secret configured in PayMongo.

For local verification:

1. Start the backend on `http://localhost:5000`.
2. Expose the backend publicly with your tunnel of choice.
3. Register the public webhook URL as `<public-url>/api/webhooks/paymongo`.
4. Copy the matching signing secret into `PAYMONGO_WEBHOOK_SECRET`.

## Local Validation Steps

1. Start the backend:

```bash
cd server
npm run dev
```

2. Start the frontend:

```bash
cd web
npm run dev
```

3. Confirm the tenant billing route loads:

- Open `/applicant/billing`

4. Ensure the tenant has at least one unpaid non-draft bill.

5. Start checkout from the Billing page:

- Rent path: `Pay Oldest Rent Statement`
- Utilities path: `Pay Oldest Utility Statement`

6. Complete the sandbox payment in PayMongo.

7. Verify redirect behavior:

- Browser returns to `/applicant/billing?payment=success&session_id=...`
- Billing page clears the query string after status verification

8. Verify backend settlement:

- Bill status becomes `paid` or the correct reduced balance if partial settlement is used
- `paymongoPaymentId` is stored on the bill
- Payment ledger entry exists in `/api/payments/history`
- Payment ledger entry exists in `/api/payments/bill/:billId/payments`

9. Verify side effects:

- Tenant billing page refreshes to the new balance
- Receipt/approval email sends if email env is configured
- Duplicate polling or duplicate webhook delivery does not create duplicate settlement

## Staging Validation Steps

1. Deploy backend with valid production-like env values.
2. Deploy frontend with the final tenant origin.
3. Set `FRONTEND_URL` to the deployed frontend origin.
4. Register the staging PayMongo webhook to the staging backend URL.
5. Use sandbox PayMongo credentials only.
6. Run one end-to-end tenant payment from an unpaid bill.
7. Re-open the same session URL or trigger status polling again to confirm idempotency.
8. Re-send the same webhook event if your staging workflow supports it and confirm no duplicate ledger or email side effects.

## Verification Commands

Focused lifecycle suite:

```bash
cd server
npm test -- --runInBand server/utils/paymentLedger.test.js server/utils/billSettlement.test.js server/controllers/paymentController.test.js server/controllers/webhookController.test.js server/controllers/billingController.test.js server/routes/paymentRoutes.test.js server/utils/tenantWorkspace.test.js
```

Frontend build:

```bash
cd web
npm run build
```

Dry-run billing flow reference:

```bash
cd server
node scripts/simulate_billing_flow.mjs
```

## What To Check In Data

For a successful monthly payment, verify:

- Bill:
  - `status`
  - `paidAmount`
  - `remainingAmount`
  - `paymentMethod`
  - `paymongoSessionId`
  - `paymongoPaymentId`
- Payment ledger:
  - `tenantId`
  - `billId`
  - `amount`
  - `method`
  - `source`
  - `externalPaymentId`
  - `processedAt`
- Tenant UI:
  - dashboard totals
  - bill detail state
  - payment history visibility

## Known Operational Requirements

- The webhook endpoint must be publicly reachable by PayMongo.
- `FRONTEND_URL` must be correct or post-payment redirect lands on the wrong origin.
- Email credentials are needed if you want receipt and reminder verification as part of rollout.
- Legacy payment-proof records may still appear in admin review screens, but they are no longer the standard monthly-billing path.
- Branch staff should use admin manual settlement only for assisted offline payments, not as the normal tenant flow.
