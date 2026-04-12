# ⚡ Electricity Billing — How It Works

> A complete, plain-language walkthrough of how electricity is billed for tenants in Lilycrest DMS.
> Generated: 2026-04-01

---

## Big Picture Overview

```
Admin Opens Period → Meter Readings Recorded → Admin Closes Period
       ↓
  Billing Engine Runs → Draft Bills Generated → Water Sync
       ↓
  Admin Reviews & Adjusts → Bills Sent to Tenants
```

The system bills **per room**, splitting electricity costs fairly among all tenants who occupied the room during that billing period.

---

## Phase 1 — Admin Opens a Billing Period

**What it is:** A billing period is a time window (e.g., March 1–March 31) during which the system tracks a room's electricity usage.

**Endpoint:** `POST /api/electricity/periods`

**What admin must provide:**

| Field | Description |
|---|---|
| `roomId` | Which room to bill |
| `startDate` | When the period begins |
| `startReading` | The meter value at period start (e.g., `1200 kWh`) |
| `ratePerKwh` | Admin-entered electricity rate (e.g., `₱12.00/kWh`) — **mandatory, no defaults** |

### ✅ Validations at this step

- Room must exist and belong to admin's branch
- `ratePerKwh` must be provided and `> 0` (admin **must** manually enter the current month's rate)
- A room **cannot have two open periods at the same time** — system returns `409 Conflict` if one already exists

**What happens behind the scenes:**
1. A `BillingPeriod` document is created in MongoDB with `status: "open"`
2. The `startReading` is simultaneously saved as the first `MeterReading` entry
3. The reading is linked back to the new period

---

## Phase 2 — Meter Readings Are Recorded

Meter readings capture **events** during the billing period. Each reading records the meter value at a specific moment.

**Endpoint:** `POST /api/electricity/readings`

### Event Types

| Event Type | When Used |
|---|---|
| `regular-billing` | Normal periodic reading (start/end of period) |
| `move-in` | Tenant moves into the room → requires `tenantId` |
| `move-out` | Tenant moves out of the room → requires `tenantId` |

### ✅ Validations at this step

- `roomId`, `reading`, `date`, `eventType` are all required
- For `move-in` / `move-out` events, `tenantId` is also required
- **FR-MR-03: New reading must be ≥ last recorded reading** — a meter can never go backwards

  ```
  if (reading < lastReading.reading) → 400 Error
  "Meter readings must be non-decreasing"
  ```

- Admin must belong to the same branch as the room

**What gets saved per reading:**
- The numeric meter value
- The date/event type
- A snapshot of all **currently moved-in tenants** (`activeTenantIds`) at that moment

---

## Phase 3 — Admin Closes the Period & Billing Engine Runs

This is the **core computation step**. Admin provides the final meter reading, and the system calculates how much electricity each tenant owes.

**Endpoint:** `PATCH /api/electricity/periods/:id/close`

**Admin provides:** `endReading` (e.g., `1350 kWh`) and optionally `endDate`

### ✅ Validations at this step

- Period must be in `"open"` status
- `endReading` must be ≥ `startReading`

---

### 🧮 The Billing Engine (`server/utils/billingEngine.js`)

This is the heart of the system. It's a **pure, stateless function** — no database calls, just math.

#### Step 1 — Sort Readings

Readings are sorted by date. On the **same day**, move-outs are processed before move-ins to prevent double-counting.

```
Priority: move-out (0) → regular-billing (1) → move-in (2)
```

#### Step 2 — Build Segments

A **segment** is the electricity consumed between two consecutive readings. Think of it as a "slice" of time.

```
Example:
  Reading 1 (Mar 1):  1200 kWh  ← period start
  Reading 2 (Mar 15): 1280 kWh  ← mid-period
  Reading 3 (Mar 31): 1350 kWh  ← period end

→ Segment A: Mar 1–15  = 80 kWh consumed (2 tenants in room)
→ Segment B: Mar 15–31 = 70 kWh consumed (1 tenant, other moved out)
```

For each segment, the system determines **which tenants were active**:

> A tenant is active in a segment if:
> - Their `moveInReading ≤ segmentStartReading`
> - AND they haven't moved out yet (`moveOutReading` is null, OR `moveOutReading > segmentStartReading`)

#### Step 3 — Compute Segment Shares (The Math)

```
SC_n = MR_n − MR_(n-1)        → Segment Consumption (kWh)
SS_n = SC_n ÷ AT_n             → Each tenant's share of that segment
TTC  = Σ SS                    → Tenant's Total Consumption across all segments
TB   = TTC × ER                → Tenant Bill (₱)
```

**Example with numbers:**

```
Segment A: 80 kWh ÷ 2 tenants = 40 kWh each
Segment B: 70 kWh ÷ 1 tenant  = 70 kWh each (only 1 tenant left)

Tenant A (stayed whole period): 40 + 70 = 110 kWh × ₱12 = ₱1,320.00
Tenant B (left mid-period):     40 kWh × ₱12             = ₱480.00
```

> **Rounding Rule:** All intermediate values are **truncated to 4 decimal places**
> using `Math.floor(x * 10000) / 10000` — no rounding up.
> Final bill amounts are rounded to 2 decimal places.

#### Step 4 — Validate Allocation

The engine self-checks its work:

```
Σ(all tenant kWh allocated) should equal totalRoomKwh ± 0.01 tolerance

If passes → verified: true
If fails  → verified: false (admin can still proceed, but result is flagged)
```

---

## Phase 4 — Draft Bills Are Generated

After computation, the system creates a `Bill` document for each tenant with `status: "draft"`.

**Draft bills are hidden from tenants** — they can't see them yet.

Each bill contains:

```json
{
  "charges": {
    "electricity": 1320.00,
    "rent": 0,
    "water": 0,
    "applianceFees": 0,
    "corkageFees": 0,
    "penalty": 0,
    "discount": 0
  },
  "grossAmount": 1320.00,
  "totalAmount": 1320.00,
  "status": "draft",
  "dueDate": null
}
```

> **Duplicate protection:** Before creating a bill, the system checks if one already
> exists for the same tenant + billing month. If it does, it skips creation.

---

## Phase 5 — Water Sync (Auto-merge)

If a finalized `WaterBillingRecord` exists for the same room and overlapping cycle,
the system **automatically writes the water charge** into each tenant's draft bill:

```
bill.charges.water = tenant's share of water amount
```

This means tenants receive **one combined bill** with both electricity and water line items.

> If water hasn't been finalized yet when the admin tries to send bills, the system **blocks** it:
>
> ```
> "Finalize the water billing for Room X before sending bills."
> ```

---

## Phase 6 — Admin Reviews, Adjusts & Sends Bills

### Review Draft Bills

Admin views all draft bills for a period:

```
GET /api/electricity/periods/:periodId/draft-bills
```

### Optional: Adjust a Draft Bill

Admin can manually edit any charge field:

```
PATCH /api/electricity/bills/:billId/adjust
```

- Can change: `electricity`, `water`, `rent`, `applianceFees`, `corkageFees`, `penalty`, `discount`
- Bill is flagged as `isManuallyAdjusted: true`
- **Only draft bills can be adjusted** (400 error if not draft)

### Send Bills

```
PATCH /api/electricity/periods/:periodId/send-bills
```

When triggered, for **each draft bill**:

1. **Issue date** = next working day after the period's reading date
2. **Due date** = issue date + 7 days
3. **Reservation credit** is applied if the tenant has an unconsumed security deposit
4. Bill status flips: `"draft"` → `"pending"`
5. **Email notification** is sent to the tenant (amount + due date)
6. The **next billing period auto-opens** from the closing date with the same rate

### ✅ Validations at send time

- Period must not be `"open"` (must be closed or revised first)
- Water must be finalized for applicable room types
- If no draft bills exist → returns success with `sent: 0`

---

## How Revisions Work

If the admin entered a wrong reading or needs to correct something:

```
POST /api/electricity/results/:periodId/revise
```

- Re-fetches all readings within the original period date range
- Re-runs the full billing engine from scratch
- Overwrites the existing `BillingResult`
- Period status becomes `"revised"`
- A `revisionNote` can be attached for audit trail

> Only **closed** periods can be revised (not open ones).

---

## Data Models at a Glance

```
BillingPeriod
  ├── roomId, branch
  ├── startDate, endDate
  ├── startReading, endReading
  ├── ratePerKwh (locked at creation)
  └── status: open | closed | revised

MeterReading
  ├── roomId, branch
  ├── reading (numeric value)
  ├── date, eventType (regular-billing | move-in | move-out)
  ├── tenantId (for move events)
  ├── activeTenantIds[] (snapshot)
  └── billingPeriodId (linked to open period)

BillingResult
  ├── billingPeriodId
  ├── totalRoomKwh, totalRoomCost
  ├── verified (boolean)
  ├── segments[] (each segment's readings, kWh, tenant share)
  └── tenantSummaries[] (per-tenant kWh total + billAmount + billId)

Bill
  ├── userId (tenant), reservationId, roomId, branch
  ├── charges: { electricity, water, rent, applianceFees, penalty, discount }
  ├── grossAmount, totalAmount, remainingAmount, paidAmount
  ├── status: draft | pending | paid | overdue
  ├── dueDate, issuedAt, sentAt
  └── isManuallyAdjusted (boolean)

WaterBillingRecord
  ├── roomId, branch
  ├── cycleStart, cycleEnd
  ├── previousReading, currentReading, usage
  ├── ratePerUnit, computedAmount, finalAmount
  └── status: draft | finalized
```

---

## Access Control Summary

| Role | Access |
|---|---|
| **Branch Admin** | Full billing access for their branch only |
| **Super Admin (owner)** | Full billing access across all branches |
| **Tenant** | Can only view their own bills and electricity breakdown **after bills are sent** |

**Middleware chain for all admin endpoints:**
```
verifyToken → verifyAdmin → filterByBranch → handler
```

---

## Complete Lifecycle State Machine

```
[Start]
   │
   ▼
[OPEN] ──────────────────────────────────┐
   │ Admin provides endReading            │
   │ Engine runs, drafts created          │
   ▼                                      │
[CLOSED]                                  │
   │ Admin re-runs computation            │
   ├──────────────────► [REVISED]         │
   │                        │             │
   │                        │ Admin sends │
   ▼                        ▼             │
Bills sent → status: "pending" on Bills   │
   │                                      │
   └──► Next BillingPeriod auto-opens ────┘
```

---

## File Reference

| File | Role |
|---|---|
| `server/controllers/electricityBillingController.js` | All API handlers (1369 lines) |
| `server/utils/billingEngine.js` | Pure computation engine — segment math |
| `server/utils/billingPolicy.js` | Due dates, bill syncing, cycle helpers |
| `server/utils/waterBilling.js` | Water sync logic |
| `server/models/BillingPeriod.js` | Period schema |
| `server/models/MeterReading.js` | Reading schema |
| `server/models/BillingResult.js` | Computed output schema |
| `server/models/Bill.js` | Tenant-facing bill schema |
| `server/routes/electricityRoutes.js` | Route definitions |
| `web/src/features/admin/components/billing/ElectricityBillingTab.jsx` | Admin UI |
| `web/src/features/tenant/pages/BillingPage.jsx` | Tenant billing view |
