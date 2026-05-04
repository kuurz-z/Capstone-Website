# Billing Screen Restructure Phase 1 Audit

Reviewed: April 1, 2026

## Purpose

This document completes Phase 1 of the billing screen restructure plan:

- confirm the current backend and client data already support the target screen sections
- map each planned section to its current source of truth
- identify only the additive API gaps that must be addressed before the later UI refactor phases

## Target Information Architecture

### Electricity

1. Monthly billing period
2. Move-in / move-out history with initial kWh
3. Monthly billing period history

### Water

1. Monthly billing period
2. Equal split summary for private/shared rooms

## Current Data Inventory

### Electricity

#### Rooms

Source:
- `GET /api/electricity/rooms`
- client hook: `useElectricityRooms()`

Current payload supports:
- room id
- room name / room number
- branch
- room-level status context for the billing dashboard

Use in restructure:
- room selector sidebar

#### Meter Readings

Source:
- `GET /api/electricity/readings/:roomId`
- client hook: `useMeterReadings(roomId)`

Current payload fields:
- `id`
- `reading`
- `date`
- `eventType`
- `tenant`
- `tenantId`
- `activeTenantCount`
- `recordedBy`
- `createdAt`

Important finding:
- `eventType` is already explicit and normalized in the backend model and controller.
- Allowed values are:
  - `move-in`
  - `move-out`
  - `regular-billing`

Use in restructure:
- Section 2 can be derived by filtering `eventType` to `move-in` and `move-out`
- Section 3 can be derived by filtering `eventType` to `regular-billing`

Conclusion:
- No new electricity readings endpoint is required for the section split.

#### Latest Reading

Source:
- `GET /api/electricity/readings/:roomId/latest`
- client hook: `useLatestReading(roomId)`

Current payload supports:
- latest reading value
- latest reading date
- latest reading event type

Use in restructure:
- supports open/new period defaults
- not a blocker for the 3-section layout

#### Billing Periods

Source:
- `GET /api/electricity/periods/:roomId`
- client hook: `useBillingPeriods(roomId)`

Current payload fields:
- `id`
- `startDate`
- `endDate`
- `startReading`
- `endReading`
- `ratePerKwh`
- `status`
- `revised`
- `closedAt`

Use in restructure:
- Section 1 list of monthly billing periods
- open/current period display
- historical closed/revised period list

Conclusion:
- Current periods payload is sufficient for Section 1 list rendering.

#### Billing Result

Source:
- `GET /api/electricity/results/:periodId`
- client hook: `useBillingResult(periodId)`

Current payload supports:
- result metadata
- `ratePerKwh`
- `totalRoomKwh`
- `totalRoomCost`
- `verified`
- `segments`
- `tenantSummaries`
- revision metadata

Use in restructure:
- Section 1 inline period detail
- segment breakdown
- tenant share summary
- verification state

Conclusion:
- No new result endpoint is required for inline period detail.

#### Draft Bills

Source:
- `GET /api/electricity/periods/:periodId/draft-bills`
- client hook: `useDraftBills(periodId)`

Use in restructure:
- Section 1 inline period detail
- draft bill review
- send bills flow

Conclusion:
- Current draft-bills endpoint is already aligned with inline detail mode.

### Water

#### Rooms

Source:
- `GET /api/water/rooms`
- client hook: `useWaterRooms()`

Current payload supports:
- room id
- room name / room number
- branch
- room type
- `isWaterEligible`
- `activeTenantCount`
- latest record summary

Use in restructure:
- eligible room selector
- active tenant count for equal split context

Conclusion:
- Current room payload is sufficient for room selection and top-level water eligibility.

#### Water Records

Source:
- `GET /api/water/records/:roomId`
- client hook: `useWaterRecords(roomId)`

Current payload fields:
- `id`
- `roomId`
- `branch`
- `cycleStart`
- `cycleEnd`
- `previousReading`
- `currentReading`
- `usage`
- `ratePerUnit`
- `computedAmount`
- `finalAmount`
- `isOverridden`
- `overrideReason`
- `status`
- `notes`
- `finalizedAt`
- `tenantShares`
- `createdAt`
- `updatedAt`

Use in restructure:
- Section 1 monthly billing period detail
- Section 2 equal split summary

Important finding:
- `tenantShares` already persists equal-share snapshots per covered reservation or bill.
- This supports rendering the equal split summary without introducing per-tenant manual allocation logic.

Conclusion:
- Current water record reads are sufficient for display.

## Section-to-Data Mapping

### Electricity Section 1: Monthly Billing Period

UI content:
- active/open period
- recent closed/revised periods
- inline detail for selected period

Mapped sources:
- period list: `useBillingPeriods(roomId)`
- inline detail result: `useBillingResult(periodId)`
- draft bills: `useDraftBills(periodId)`
- latest reading default support: `useLatestReading(roomId)`

Status:
- fully supported by current data

### Electricity Section 2: Move-In / Move-Out History

UI content:
- date
- tenant
- event type
- recorded kWh
- recorded by
- initial kWh context for tenant movement

Mapped source:
- `useMeterReadings(roomId)` filtered to:
  - `eventType === "move-in"`
  - `eventType === "move-out"`

Status:
- supported by current data

Note:
- the current payload exposes the movement reading itself and tenant identity.
- for the section label "initial starting kWh", the move-in reading value is the usable starting-kWh anchor already stored in the reading log.

### Electricity Section 3: Monthly Billing Period History

UI content:
- regular monthly reading history only

Mapped source:
- `useMeterReadings(roomId)` filtered to:
  - `eventType === "regular-billing"`

Status:
- supported by current data

Note:
- no separate backend endpoint is required unless we later want server-side paging or section-specific summaries.

### Water Section 1: Monthly Billing Period

UI content:
- initial date
- end date
- previous reading
- final cu.m
- price per cubic meter
- final room amount
- status

Mapped source:
- records list: `useWaterRecords(roomId)`

Status:
- supported for display
- partially unsupported for editing

Important gap:
- current create/update water endpoints do not accept editable `cycleStart` or `cycleEnd` from the client as free form inputs.
- `createWaterRecord` derives the cycle from `buildWaterCycle(...)`.
- `updateWaterRecord` preserves the existing record cycle.

Implication:
- if the final UI must allow admins to edit both initial and end dates directly in Section 1, Phase 5 needs an additive API change for water cycle date editing.
- if the UI only needs to display those dates while editing readings/rate/amount, no API change is needed.

### Water Section 2: Equal Split Summary

UI content:
- tenant list
- active tenant count
- room total
- equal per-tenant share
- attachment state to draft bills

Mapped sources:
- room active count: `useWaterRooms()`
- record-level split snapshot: `useWaterRecords(roomId)` via `tenantShares`
- finalized sync result at action time: `finalizeWaterRecord()` response

Status:
- supported for summary rendering

Important nuance:
- persisted `tenantShares` is enough to show the equal split and whether specific bill ids were attached.
- the backend does not currently persist a dedicated long-lived "sync reason" field after finalize.

Implication:
- if Section 2 only needs to show whether the amount has been attached to bills, current data is enough.
- if Section 2 needs a persistent explanatory state such as "waiting for matching electricity period", that will require an additive backend field later.

## Confirmed Non-Gaps

The following concerns are already covered by the current backend and do not require Phase 5 API work:

- electricity movement versus monthly reading classification
- electricity inline period detail data
- electricity draft bill review data
- water equal-share calculation model for private/shared rooms
- room eligibility for water billing

## Actual Gaps Identified

### Gap 1: Water cycle date editing

Current state:
- water records expose `cycleStart` and `cycleEnd`
- create/update does not let the client directly set them

Impact:
- blocks direct editing of monthly water period dates if that remains part of the final UI scope

Recommendation:
- keep this as a Phase 5 additive API task only if direct date editing is still required after the layout refactor

### Gap 2: Optional persistent water sync-state messaging

Current state:
- `tenantShares.billId` can show whether charges were attached to draft bills
- finalize response returns a sync reason transiently
- no persisted sync reason exists on the record itself

Impact:
- not a blocker for equal split summary
- only needed if the UI wants durable explanatory labels after reload

Recommendation:
- do not add this yet
- revisit only if the final Section 2 design needs more than attached/not-attached state

## Implementation Decision for Phase 2+

Phase 2 and beyond can proceed with these assumptions:

- electricity can be restructured into the 3 planned sections using current endpoints
- water can be restructured into the 2 planned sections using current endpoints
- no additive electricity API work is required for the section split itself
- water date editing is the only substantive API mismatch against the currently described Section 1 form

## Recommended Next Step

Proceed to Phase 2: shared billing primitives cleanup, then Phase 3 electricity layout restructuring.
