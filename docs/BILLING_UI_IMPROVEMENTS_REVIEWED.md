# Billing UI/UX Improvements

This document describes the planned improvements to the Electricity and Water billing admin interface (`AdminBillingPage`). It reflects the current codebase behavior, including the existing electricity period lifecycle and the current water edit flow.

Reviewed: April 1, 2026.

---

## Background

The billing module is functionally working, but several usability gaps remain:

- If an incorrect rate is entered for the current electricity period, correction is awkward and destructive.
- After closing a period, the draft bills panel is hidden behind a small icon action.
- The billing period Actions column relies on unlabeled icon buttons.
- Billing status pills do not create enough visual hierarchy.
- There is no room-level summary of the current billing state.

### Current Electricity Lifecycle

The current implementation is not a purely manual open-then-close flow:

- Creating a new period from the UI currently opens and closes a period in one flow to generate draft bills.
- Closing an electricity period auto-opens the next period for the same room on the backend.
- Because of that, most rooms will usually have an `open` period after at least one successful billing cycle.

All UI changes below must respect that lifecycle. In practice, the editable `open` rate usually applies to the auto-opened carry-forward period.

---

## Decision Log

| Decision | Choice |
|---|---|
| Rate edit reason/note required? | No, silent save is fine |
| Draft bills on View click: expand below or replace content? | Replace current content |
| Water tab gets rate-edit treatment too? | Yes |
| Existing Water `Edit` button after inline rate edit exists? | Keep it; inline edit is for quick rate-only changes, full Edit remains for full-record changes |

---

## Improvement 1 - Editable Rate on Open / Draft Records

### Electricity Tab

The **Rate** column in the Billing Periods table is currently static text for all period statuses. Add inline edit only for `open` periods. `closed` and `revised` periods stay locked for historical integrity.

**Behavior**

1. An `open` period row shows `PHP 16.5` with an edit affordance.
2. Clicking edit turns the cell into a number input with Save and Cancel controls.
3. Saving calls a new `PATCH /api/electricity/periods/:id` endpoint.
4. Only one row can be in electricity rate-edit mode at a time.
5. Closed or revised periods remain read-only.

**Backend endpoint**

```txt
PATCH /api/electricity/periods/:id
Body: { ratePerKwh: number }
Rules:
  - Reject with 400 if period.status !== "open"
  - Reject with 403 if admin branch doesn't match
  - Reject with 400 if ratePerKwh <= 0
  - Update period.ratePerKwh and save
  - Return updated period
```

**Files**

| File | Change |
|---|---|
| `server/routes/electricityRoutes.js` | Add `router.patch("/periods/:id", ...)` |
| `server/controllers/electricityBillingController.js` | Add `updateBillingPeriod` handler |
| `web/src/shared/api/electricityApi.js` | Add `updatePeriod(periodId, data)` |
| `web/src/shared/hooks/queries/useElectricity.js` | Add `useUpdatePeriod()` mutation |
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add inline rate-edit state and rendering |

### Water Tab

The **Rate** column in the Water Billing History table gets the same treatment for `draft` records. Finalized records stay locked.

**Behavior**

1. A `draft` row shows the rate with an edit affordance.
2. Clicking edit turns the rate cell into an inline number input.
3. Saving calls the existing water update endpoint.
4. This inline edit is rate-only. The existing full `Edit` action remains for readings, final amount, override reason, and notes.
5. Only one row can be in water inline-rate-edit mode at a time.

**Files**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/WaterBillingTab.jsx` | Add inline rate-only edit state and rendering for draft rows |

---

## Improvement 2 - Open Period Status Banner

### Problem

There is no immediate visual summary of the room's electricity billing state. Admins must scan the table to determine whether a period is active and what action comes next.

### Behavior

Render a status banner between the room header and the Billing Periods table.

**Active period**

```txt
Active Billing Period
Started Mar 15, 2026 · Start: 1200 kWh · Rate: PHP 16.5/kWh
[Edit Rate] [Enter Final Reading]
```

**No active period**

```txt
No Active Period
Last closed: Apr 15, 2026
[New Billing Period]
```

**Notes**

- The banner must reflect the real lifecycle where rooms often have an auto-opened period after the previous close.
- The "No Active Period" state is still needed for first-time setup, recovery states, or auto-open failure.
- The banner buttons must reuse existing handlers rather than duplicate business logic.
- "Edit Rate" must activate the same inline edit state as the table row.

**Files**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `PeriodStatusBanner` subcomponent |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add banner styles |

---

## Improvement 3 - Better Actions Column

### Problem

For closed or revised periods, the Actions column currently relies on small icon-only controls for View, Re-run, Draft Bills, and Delete.

### Behavior

**Open period rows**

- Show edit-rate action and delete action only.
- Do not show View Result, Re-run, or Draft Bills because there is no finalized result yet.

**Closed / revised period rows**

- Replace the icon cluster with:
  - one labeled trigger: `View Result`
  - one delete action
- `View Result` opens a dropdown with:
  - `Open Period Detail`
  - `Re-run Calculation`
  - `View / Send Draft Bills`

The dropdown closes on outside click and when a menu action is selected.

**Files**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add dropdown state and replace icon-only actions |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add dropdown styles |

---

## Improvement 4 - View Replaces Content (Period Detail Mode)

### Problem

Clicking View on a closed period currently loads billing result detail separately from the draft bills panel. The review flow is split and easy to miss.

### Behavior

Clicking **Open Period Detail** on any closed or revised period replaces the Billing Periods table with a dedicated **Period Detail View**:

```txt
[Back to Periods]

Period: Mar 15 - Apr 15, 2026
Rate: PHP 16.5   Total: 480 kWh   Room Cost: PHP 7,920

[Segment Breakdown]
[Draft Bills]
  Tenant A: PHP 1,200
  Tenant B: PHP 960
  [Send 2 Bills]
```

**Notes**

- Back resets `viewMode` to `"list"` and clears `selectedPeriodId` and `draftPeriodId`.
- Opening period detail should immediately load both result data and draft bills for the same period.
- Draft bills become part of the primary detail view, not a separate secondary panel.

**Files**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `viewMode` state and `PeriodDetailView` rendering |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add detail-view styles |

---

## Improvement 5 - Status Pill Visual Upgrade

### Problem

All three status pills currently use similar low-contrast styling. The active billing state needs stronger emphasis.

### Behavior

| Status | Style |
|---|---|
| `open` | Amber background, dark amber text, pulsing dot |
| `closed` | Green background, dark green text |
| `revised` | Blue background, dark blue text |

**Files**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Update status pill styles and add `@keyframes pulse-dot` |

---

## Execution Order

### Phase 1 - Backend

1. Add `PATCH /api/electricity/periods/:id` route to `electricityRoutes.js`
2. Add `updateBillingPeriod` controller handler to `electricityBillingController.js`
3. Add `updatePeriod(periodId, data)` to `electricityApi.js`
4. Add `useUpdatePeriod()` mutation to `useElectricity.js`

### Phase 2 - CSS

5. Update status pill styles
6. Add status banner styles
7. Add dropdown styles
8. Add period detail styles

### Phase 3 - Electricity UI

9. Add inline rate edit for open periods
10. Add `PeriodStatusBanner`
11. Replace icon-only Actions with labeled dropdown actions
12. Add `viewMode` and `PeriodDetailView`
13. Ensure the banner and table actions share the same handlers and state

### Phase 4 - Water UI

14. Add inline rate-only edit on draft water history rows
15. Keep the existing full `Edit` action for full-record changes

---

## Verification Checklist

- [ ] Open-period electricity rate can be edited inline and saved
- [ ] Closed or revised period rates are not editable
- [ ] `PATCH /api/electricity/periods/:id` returns 400 if the period is not open
- [ ] `PATCH /api/electricity/periods/:id` returns 400 if the new rate is not positive
- [ ] Active-period banner shows correct start date, start reading, and current rate
- [ ] No-active-period banner renders correctly for first-time or recovery states
- [ ] Clicking "Edit Rate" in the banner activates the same inline edit state as the table row
- [ ] Closed or revised period Actions column no longer relies on icon-only controls
- [ ] Dropdown closes on outside click
- [ ] Opening period detail replaces the periods table view
- [ ] Back action restores list mode and clears detail selection
- [ ] Draft bills appear inside the period detail view automatically
- [ ] Open status pill uses stronger active styling than closed and revised
- [ ] Water draft record rate can be edited inline without entering full edit mode
- [ ] Finalized water records do not allow inline rate editing
- [ ] Existing water full `Edit` flow still works after inline rate edit is added
