# Lilycrest Billing System Plan

Verified against the repository on April 2, 2026.

This document is the canonical billing spec for the current codebase. It separates implemented behavior from planned follow-up work so billing decisions are not mixed with roadmap items.

## Status Labels

- `Implemented`: present in the repository now.
- `Planned`: agreed direction, not fully complete.
- `Deferred`: intentionally not part of the current implementation.

## System Summary

`Implemented`

The billing system has three connected layers:

1. Electricity billing is room-based and period-based.
2. Water billing is room-based and cycle-based.
3. Tenant invoices are consolidated in `Bill`, where electricity, water, rent, appliance fees, penalties, and manual adjustments end up on one record.

Electricity and water are computed separately, but both merge into the same tenant bill before bills are sent.

## Locked Decisions

`Implemented`

- `BusinessSettings` stores default electricity and water rates.
- Admin forms are prefilled from settings, but the submitted rate is still written explicitly into each billing period or water record.
- Historical rates stay locked on the period or record after close/finalize.
- Tenant water breakdown is exposed through token-only `/api/water` tenant routes.
- Branch appliance-fee behavior is settings-driven through `BusinessSettings.branchOverrides`, not hardcoded branch checks.
- Billing-sensitive actions write audit log entries with `entityType: "billing"`.
- Electricity export and water export currently return structured rows that the web app turns into CSV downloads. XLSX is not implemented.

## Current Data Model

`Implemented`

Core billing documents:

- `BillingPeriod`: room, branch, start/end dates, start/end readings, `ratePerKwh`, status, close metadata, revision metadata.
- `MeterReading`: room, branch, reading, date, event type, optional tenant link, optional billing-period link, recorder, active-tenant snapshot.
- `BillingResult`: room-period computation output, including segments and tenant summaries.
- `WaterBillingRecord`: room water cycle, readings, usage, rate, computed/final amount, override metadata, status, tenant shares.
- `Bill`: tenant-facing consolidated invoice with charge buckets for electricity, water, rent, appliance fees, corkage, penalty, and discount.
- `BusinessSettings`: reservation fee, penalty rate, default utility rates, and per-branch billing overrides.
- `AuditLog`: includes billing audit entries for close, revise, send, delete, finalize, override, and export events.

## Current Billing Flow

`Implemented`

Electricity lifecycle:

1. Admin records meter readings or opens a billing period for a room.
2. Admin closes the period with a final reading.
3. The billing engine computes segments and tenant shares.
4. Draft `Bill` records are created or updated for each tenant.
5. If a matching finalized water record exists, water is merged into those draft bills.
6. The next electricity period is auto-opened from the closing reading.
7. Admin reviews drafts, optionally adjusts them, then sends them to tenants.

Water lifecycle:

1. Admin creates or edits a water billing draft for a room.
2. The system computes usage and suggested amount from readings and `ratePerUnit`.
3. Admin may override the final room amount before finalize.
4. Finalize computes tenant shares.
5. If matching electricity draft bills already exist, water charges are merged immediately.
6. If not, the finalized record waits and sync happens when the electricity period closes later.

Tenant visibility:

- Draft bills stay hidden.
- Once bills are sent, tenants can view the consolidated bill.
- Tenants can open electricity breakdown by bill ID.
- Tenants can open water breakdown by bill ID.

## Current API Surface

`Implemented`

Electricity tenant endpoints:

- `GET /api/electricity/my-bills`
- `GET /api/electricity/my-bills/:periodId`
- `GET /api/electricity/my-bills/by-bill/:billId`

Electricity admin endpoints:

- `GET /api/electricity/rooms`
- `GET /api/electricity/export`
- `POST /api/electricity/readings`
- `GET /api/electricity/readings/:roomId`
- `GET /api/electricity/readings/:roomId/latest`
- `DELETE /api/electricity/readings/:id`
- `POST /api/electricity/periods`
- `GET /api/electricity/periods/:roomId`
- `PATCH /api/electricity/periods/:id`
- `PATCH /api/electricity/periods/:id/close`
- `POST /api/electricity/batch-close`
- `DELETE /api/electricity/periods/:id`
- `GET /api/electricity/results/:periodId`
- `POST /api/electricity/results/:periodId/revise`
- `GET /api/electricity/periods/:periodId/draft-bills`
- `PATCH /api/electricity/periods/:periodId/send-bills`
- `PATCH /api/electricity/bills/:billId/adjust`
- `GET /api/electricity/bills/:billId/pdf`
- `POST /api/electricity/bills/:billId/regenerate-pdf`

Water tenant endpoints:

- `GET /api/water/my-records`
- `GET /api/water/my-records/by-bill/:billId`

Water admin endpoints:

- `GET /api/water/export`
- `GET /api/water/rooms`
- `GET /api/water/records/:roomId/latest`
- `GET /api/water/records/:roomId`
- `POST /api/water/records`
- `PATCH /api/water/records/:id`
- `PATCH /api/water/records/:id/finalize`

Settings endpoints relevant to billing:

- `GET /api/settings/business`
- `PATCH /api/settings/business`
- `PATCH /api/settings/branch/:branch`

## Current Admin UI

`Implemented`

Billing management now uses separate Electricity and Water tabs:

- Electricity tab supports room filtering, billing-period creation, close flow, draft review, manual bill adjustment, result revision, send-bills, CSV export, and batch close of open periods.
- Water tab supports eligible-room filtering, draft/finalize flow, inline rate changes for draft records, and CSV export.
- Super Admin settings supports default utility rates and per-branch appliance-fee overrides.

## Current Automation

`Implemented`

- Overdue status marking is scheduled.
- Penalty computation is scheduled.
- Payment reminders are scheduled.
- Contract-expiration reminders are scheduled.
- Electricity close auto-opens the next period.

## Current Limitations

`Implemented`

- Export is CSV-oriented through JSON row endpoints plus client-side download; XLSX is deferred.
- Utility-specific automated test coverage is still partial.
- Batch close is best-effort but still depends on admins entering valid closing readings.
- The older electricity close handler and the shared batch-close helper both exist; behavior is aligned, but this area should be consolidated during the next hardening pass.

## Follow-Up Roadmap

`Planned`

- Consolidate the single-close path onto the shared close helper to remove duplicated electricity close logic.
- Expand backend and UI verification for batch close, exports, and water-electricity sync edge cases.
- Add richer export filters if operations need room/date/status filtering in the UI.
- Add broader controller and integration test coverage around billing flows.

## Access Control

`Implemented`

Admin billing routes use:

`verifyToken -> verifyAdmin -> filterByBranch`

Tenant billing routes use:

`verifyToken`

Tenant handlers additionally verify bill ownership before returning breakdown data.
