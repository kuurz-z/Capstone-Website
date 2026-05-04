# Billing UI/UX Improvements

This document describes the planned improvements to the Electricity and Water billing admin interface (`AdminBillingPage`). It covers the motivation, the exact behaviour changes, and the complete list of files to modify.

Rebuilt: April 1, 2026. Reflects decisions made in the implementation planning session.

---

## Background

The billing module was initially built to be functional. The core workflows (open period → record readings → close period → review drafts → send bills) work correctly. However, several usability gaps emerged during real admin use:

- If an incorrect rate is entered when opening a billing period, the only fix is to delete the entire period — destroying all readings and draft bills along with it.
- After closing a period, the draft bills panel is hidden behind an icon button that admins don't notice.
- The actions column in the billing period table uses unlabeled icon buttons that are unclear without hovering for tooltips.
- The billing period status (Open / Closed / Revised) is communicated by text pills with no visual hierarchy.
- There is no at-a-glance summary of the current billing state for a room.

---

## Decision Log

| Decision | Choice |
|---|---|
| Rate edit reason/note required? | No — silent save is fine |
| Draft bills on View click: expand below or replace content? | Replace current content |
| Water tab gets rate-edit treatment too? | Yes |

---

## Improvement 1 — Editable Rate on Open / Draft Records

### Electricity Tab

The **Rate** column in the Billing Periods table is currently static text for all period statuses. The fix adds an inline ✏ edit only for `open` periods (closed and revised periods stay locked for historical integrity).

**Behaviour:**
1. An `open` period row shows `₱16.5 ✏` in the Rate cell.
2. Clicking ✏ turns the cell into a `<input type="number">` with a ✓ Save and ✗ Cancel button.
3. Saving calls a new `PATCH /api/electricity/periods/:id` endpoint and updates the rate silently.
4. Closed or revised periods show the rate as plain text only — no edit icon.

**New backend endpoint:**

```
PATCH /api/electricity/periods/:id
Body: { ratePerKwh: number }
Rules:
  - Reject with 400 if period.status !== "open"
  - Reject with 403 if admin branch doesn't match
  - Update period.ratePerKwh and save
  - Return updated period
```

**Files:**

| File | Change |
|---|---|
| `server/routes/electricityRoutes.js` | Add `router.patch("/periods/:id", ...)` |
| `server/controllers/electricityBillingController.js` | Add `updateBillingPeriod` handler |
| `web/src/shared/api/electricityApi.js` | Add `updatePeriod(periodId, data)` |
| `web/src/shared/hooks/queries/useElectricity.js` | Add `useUpdatePeriod()` mutation |
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `editingRateId` + `editingRateValue` state; render inline edit on open rows |

### Water Tab

The **Rate** column in the Water Billing History table gets the same treatment for `draft` records. Finalized records stay locked to preserve historical data.

**Behaviour:**
1. A `draft` record row shows the rate with a ✏ icon.
2. Clicking ✏ turns the cell into an inline number input.
3. Saving calls the existing `PATCH /api/water/:id` (update record) endpoint — no new backend endpoint needed.

**Files:**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/WaterBillingTab.jsx` | Add `editingRateId` + `editingRateValue` state; render inline edit on draft rows in history table |

---

## Improvement 2 — Open Period Status Banner

### Problem

There is no immediate visual summary of the room's billing state. Admins must scan the table to determine whether a period is active.

### Behaviour

A status banner is rendered between the room header and the Billing Periods table. It adapts to two states:

**Active period:**
```
🟡 Active Billing Period
   Started Mar 15, 2026  ·  Start: 1200 kWh  ·  Rate: ₱16.5/kWh
   [✏ Edit Rate]    [✓ Enter Final Reading]
```

**No active period:**
```
🟢 No Active Period
   Last closed: Apr 15, 2026
   [+ New Billing Period]
```

- The banner buttons are wired to the same handlers as the existing header buttons (no logic duplication).
- "Edit Rate" in the banner also triggers the inline rate edit in the table row.

**Files:**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `<PeriodStatusBanner>` sub-component (inline, same file) |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add `.eb-status-banner`, `.eb-status-banner--open`, `.eb-status-banner--empty` |

---

## Improvement 3 — Better Actions Column

### Problem

For closed or revised periods, the Actions column renders four stacked icon-only buttons: View, Re-run (⟳), Drafts (✉), Delete (🗑). Their purpose is unclear without hovering.

### Behaviour

**Open period rows:** Only show ✏ (rate edit, from Improvement 1) and 🗑 (delete). No View, Re-run, or Drafts — there is no result yet.

**Closed / revised period rows:** Replace the four icons with two targets:

```
Before:  [👁] [⟳] [✉] [🗑]
After:   [View Result ▾]  [🗑]
              └── Re-run Calculation
              └── View / Send Draft Bills
```

The dropdown closes on outside click.

**Files:**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `openDropdownId` state; replace icon buttons with `<ActionDropdown>` sub-component |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add `.eb-dropdown`, `.eb-dropdown__menu`, `.eb-dropdown__item` |

---

## Improvement 4 — View Replaces Content (Period Detail Mode)

### Problem

Clicking View on a closed period loads the billing result detail panel but leaves the draft bills hidden behind a separate icon click. The flow is not self-guiding.

### Behaviour

Clicking **View Result** on any closed/revised period replaces the billing periods table with a full **Period Detail View**:

```
[ ← Back to Periods ]

Period: Mar 15 – Apr 15, 2026
Rate: ₱16.5   Total: 480 kWh   Room Cost: ₱7,920

[ Segment Breakdown section — existing result data ]

[ Draft Bills section — existing draft bills panel ]
  └── Tenant A: ₱1,200
  └── Tenant B: ₱960
  [✓ Send 2 Bills]
```

- The Back link resets `viewMode` to `"list"`, clears `selectedPeriodId` and `draftPeriodId`.
- The draft bills panel is now the primary destination, not a secondary panel.

**Files:**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Add `viewMode: "list" \| "period-detail"` state; render `<PeriodDetailView>` when in detail mode |
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Add `.eb-period-detail`, `.eb-detail-header`, `.eb-back-link` |

---

## Improvement 5 — Status Pill Visual Upgrade

### Problem

All three status pills (`Open`, `Closed`, `Revised`) use similar low-contrast styling. There is no visual urgency for active billing.

### Behaviour

| Status | Style |
|---|---|
| `open` | Amber background, dark amber text, pulsing dot via `@keyframes` |
| `closed` | Green background, dark green text |
| `revised` | Blue background, dark blue text |

**Files:**

| File | Change |
|---|---|
| `web/src/features/admin/components/billing/ElectricityBillingTab.css` | Update `.eb-status-pill--open`, `.eb-status-pill--closed`, `.eb-status-pill--revised`; add `@keyframes pulse-dot` |

---

## Execution Order

### Phase 1 — Backend

1. Add `PATCH /api/electricity/periods/:id` route to `electricityRoutes.js`
2. Add `updateBillingPeriod` controller handler to `electricityBillingController.js`
3. Add `updatePeriod(periodId, data)` to `electricityApi.js`
4. Add `useUpdatePeriod()` mutation to `useElectricity.js`

### Phase 2 — CSS (isolated, no logic risk)

5. Status pill styles + `@keyframes` in `ElectricityBillingTab.css`
6. Status banner styles
7. Dropdown menu styles
8. Period detail view styles

### Phase 3 — Electricity UI

9. Apply new pill CSS classes to status cells
10. Inline rate edit on open period rows (Improvement 1)
11. `<PeriodStatusBanner />` component (Improvement 2)
12. `<ActionDropdown />` component (Improvement 3)
13. `viewMode` state + `<PeriodDetailView />` component (Improvement 4)

### Phase 4 — Water UI

14. Inline rate edit on draft record rows in `WaterBillingTab.jsx` (Improvement 1 — water)

---

## Verification Checklist

- [ ] Open a period, click ✏ on the rate cell → inline input appears, save updates the row
- [ ] Closed/revised period rate cell shows no ✏ icon
- [ ] `PATCH /api/electricity/periods/:id` returns 400 if period is not open
- [ ] Period status banner shows correct data for open/no-period states
- [ ] Clicking "Edit Rate" in banner triggers inline edit on the table row
- [ ] Closed period Actions column shows dropdown instead of 4 icons
- [ ] Dropdown closes on outside click
- [ ] Clicking View Result replaces table with Period Detail View
- [ ] Back link restores the table and clears selection
- [ ] Draft bills panel appears inside Period Detail View automatically
- [ ] Status pill: Open = amber + pulsing, Closed = green, Revised = blue
- [ ] Water tab draft record rate cell shows ✏, finalized records do not
- [ ] Editing water rate calls existing update endpoint, not a new one
