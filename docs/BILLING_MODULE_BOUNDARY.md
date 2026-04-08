# Billing Module Boundary

Module 4 is implemented as four route groups with one ownership model.

## Canonical Route Ownership

- `billingRoutes`
  Owns bills, payment-proof verification, penalties, publish readiness, invoice publishing, reporting, and exports.
- `paymentRoutes`
  Owns PayMongo checkout sessions and payment history only.
- `utilityBillingRoutes`
  Owns utility periods, readings, computed results, revisions, and send/close workflows.
- `financialRoutes`
  Owns the owner-only executive financial overview.

## Operational Rules

- Billing calculations stay rule-based.
- Utility billing can prepare draft results, but final tenant invoice publishing stays under `billingRoutes`.
- Branch admins operate only within their branch unless an owner-only route explicitly says otherwise.
- `resolveAdminAccessContext` is the shared admin context source for billing and utility billing controllers.

## Unsupported Legacy Paths

- Legacy room-bill generation paths are retired and should not be used by frontend code or new backend work.
- Debug billing triggers are not part of Module 4.

## Frontend Mapping

- Billing management screens should call `/api/billing` for bill administration, readiness, publishing, reporting, and export.
- Online checkout and payment-history flows should call `/api/payments`.
- Utility period, reading, and result workflows should call `/api/utilities`.
- Cross-branch executive finance screens should call `/api/financial`.
