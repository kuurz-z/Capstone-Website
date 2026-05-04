# Utility Billing Phases

Verified against the repository on April 2, 2026.

This roadmap tracks billing work as delivery phases. Completed phases reflect what is already in the repository. Planned phases are the remaining hardening work.

## Phase 1: Billing Foundations

Status: `Completed`

Scope:

- Establish `Bill` as the consolidated tenant invoice.
- Add utility-aware business settings.
- Add branch billing overrides for appliance-fee policy.

Delivered:

- `BusinessSettings` includes default electricity rate, default water rate, penalty rate, and `branchOverrides`.
- Branch billing settings are editable through settings endpoints.
- Room availability responses expose branch-driven appliance-fee behavior.

Acceptance state:

- Utility defaults are configurable.
- Appliance-fee policy is no longer hardcoded to a branch name.

## Phase 2: Electricity Lifecycle

Status: `Completed`

Scope:

- Persist electricity billing periods, readings, and computed results.
- Generate tenant draft bills from room-based electricity usage.

Delivered:

- `BillingPeriod`, `MeterReading`, and `BillingResult` support the electricity workflow.
- Electricity periods can be opened, updated, closed, revised, and deleted.
- Closing a period computes tenant shares and creates draft bills.
- The next period auto-opens from the closing reading.

Acceptance state:

- Branch admins can complete the electricity billing cycle from the API and admin UI.

## Phase 3: Water Lifecycle and Sync

Status: `Completed`

Scope:

- Persist room water cycles independently from electricity periods.
- Merge finalized water charges into tenant draft bills.

Delivered:

- `WaterBillingRecord` supports draft and finalized records.
- Water usage, amount computation, tenant share generation, and draft-bill sync are implemented.
- Water finalization either syncs immediately or waits for the matching electricity close.

Acceptance state:

- Water can be billed independently but still ends up in the same tenant bill.

## Phase 4: Tenant Billing Visibility

Status: `Completed`

Scope:

- Let tenants inspect utility breakdowns after bills are sent.

Delivered:

- Tenant electricity summary and breakdown endpoints.
- Tenant water history and water breakdown-by-bill endpoints.
- Tenant billing page shows both electricity and water breakdown cards when data exists.

Acceptance state:

- Tenants can inspect their own sent bill details without seeing draft or cross-tenant data.

## Phase 5: Billing Audit and Admin Tooling

Status: `Completed`

Scope:

- Record billing-sensitive admin activity.
- Improve admin operations for review, export, and batch actions.

Delivered:

- Billing audit entries for period close, revise, send, delete, water finalize, water override, and exports.
- Electricity batch close endpoint with best-effort partial-failure behavior.
- Electricity and water export endpoints for CSV-oriented admin downloads.
- Admin billing tabs expose export actions; electricity also exposes batch close.

Acceptance state:

- Admin actions leave an audit trail.
- Admins can export billing rows and bulk-close open electricity periods from the UI.

## Phase 6: Verification and Hardening

Status: `Planned`

Scope:

- Reduce duplicated controller logic.
- Increase confidence in end-to-end billing behavior.

Planned tasks:

1. Route the single electricity close path through the shared close helper.
2. Add controller tests for batch close, export rows, and audit side effects.
3. Add integration coverage for electricity close plus finalized-water sync.
4. Validate tenant visibility rules for draft vs sent bills.

Acceptance criteria:

- No duplicated close logic remains in the electricity controller.
- Billing regressions are covered by repeatable automated tests.

## Phase 7: Extended Reporting

Status: `Deferred`

Scope:

- Richer reporting beyond the current CSV workflow.

Deferred items:

1. XLSX export support.
2. Saved export presets and richer UI filters.
3. Scheduled report delivery.

Acceptance criteria:

- Only pursue this phase if operations need reporting beyond the current CSV export flow.
