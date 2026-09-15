# Fix Duplicate Rent Statement Row in All-Time Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate tenant statement rows when filtering by "All Time" in the Admin Rent Billing tab by exposing `reservationId` in the backend response contract and refining the frontend unbilled-tenant deduplication filter.

**Architecture:** 
1. Expose `reservationId` on the backend `formatBill` response DTO.
2. Update the frontend `RentBillingTab.jsx` deduplication algorithm in "All Time" mode to verify `reservationId`, `tenant.currentMonthBill`, and `tenant.billStatus === 'already_billed'`.
3. Add unit test coverage in `server/controllers/billing/billingHelpers.formatBill.test.js` to assert `formatBill` contract parity.

**Tech Stack:** Express.js, MongoDB/Mongoose, React 19, Vite, Jest.

---

## User Review Required

> [!IMPORTANT]
> This fix does **not** change or recalculate any billing numbers, balances, or database records. It strictly fixes the frontend table merging logic and ensures the backend supplies the `reservationId` so generated bills correctly match their active tenant reservations.

---

## What to Expect from These Changes

- **Visual Outcome**: When an Admin or Dorm Owner switches the Rent Billing timeframe filter from a specific month to **"All Time"**, each generated bill statement will appear exactly once. Active tenants who already have a paid, generated, or sent bill for their current cycle will no longer display a duplicate phantom "Pending Generation" row.
- **Functional Outcome**: Active tenants who legitimately have **not** had a rent bill generated yet will continue to display as "Upcoming" or "Pending Generation" with a functional "Force Generate" button.
- **Performance & Reliability**: Zero layout shift, instant filter toggling, and guaranteed ID alignment between backend MongoDB bill records and frontend table rows.

---

## Proposed Changes

### Backend Billing Helpers

#### [MODIFY] [`_helpers.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/billing/_helpers.js)
- Update `formatBill(bill)` to include `reservationId: bill.reservationId?._id || bill.reservationId || null`.

#### [NEW] [`billingHelpers.formatBill.test.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/billing/billingHelpers.formatBill.test.js)
- Unit test suite asserting `formatBill` returns `reservationId` when populated or unpopulated.

---

### Frontend Rent Billing Tab

#### [MODIFY] [`RentBillingTab.jsx`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/components/billing/RentBillingTab.jsx)
- In `tableRows` memo under `if (timeframeMode === "all")`:
  - Extract `reservationId` accurately from `bill.reservationId`: `getId(bill.reservationId?._id || bill.reservationId)`.
  - Filter `unbilledTenantRows` by checking:
    1. If `currentBillId` exists in `billsById`.
    2. If `tenant.billStatus === "already_billed"`.
    3. If `billedReservationIds.has(resId)`.

---

## Task Decomposition

### Task 1: Backend Contract Update & Unit Test

**Files:**
- Modify: `server/controllers/billing/_helpers.js:217-235`
- Test: `server/controllers/billing/billingHelpers.formatBill.test.js`

- [ ] **Step 1: Write failing test for `formatBill` reservationId inclusion**

```javascript
// server/controllers/billing/billingHelpers.formatBill.test.js
import { describe, expect, test } from "@jest/globals";
import mongoose from "mongoose";
import { formatBill } from "./_helpers.js";

describe("formatBill - contract parity", () => {
  test("includes reservationId as an ObjectId or string when present on bill document", () => {
    const resId = new mongoose.Types.ObjectId();
    const billDoc = {
      _id: new mongoose.Types.ObjectId(),
      reservationId: { _id: resId, roomId: "room-1", roomName: "Room 101" },
      userId: { _id: "user-1", firstName: "Juanito", lastName: "Dela Cruz" },
      charges: { rent: 6300 },
      totalAmount: 6300,
      status: "paid",
    };

    const formatted = formatBill(billDoc);
    expect(formatted.reservationId).toBeDefined();
    expect(String(formatted.reservationId)).toBe(String(resId));
  });

  test("handles unpopulated reservationId string/ObjectId gracefully", () => {
    const resId = new mongoose.Types.ObjectId();
    const billDoc = {
      _id: new mongoose.Types.ObjectId(),
      reservationId: resId,
      userId: { _id: "user-1" },
      totalAmount: 6300,
      status: "paid",
    };

    const formatted = formatBill(billDoc);
    expect(String(formatted.reservationId)).toBe(String(resId));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/controllers/billing/billingHelpers.formatBill.test.js`
Expected: FAIL due to `reservationId` being `undefined`.

- [ ] **Step 3: Update `formatBill` in `server/controllers/billing/_helpers.js`**

Add `reservationId: bill.reservationId?._id || bill.reservationId || null` to the returned object in `formatBill`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/controllers/billing/billingHelpers.formatBill.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/billing/_helpers.js server/controllers/billing/billingHelpers.formatBill.test.js
git commit -m "fix(billing): expose reservationId in formatBill response contract"
```

---

### Task 2: Frontend Unbilled Tenant Deduplication Filter in `RentBillingTab.jsx`

**Files:**
- Modify: `web/src/features/admin/components/billing/RentBillingTab.jsx:436-506`

- [ ] **Step 1: Update `tableRows` in `RentBillingTab.jsx` for `timeframeMode === "all"`**

Refactor the `unbilledTenantRows` filter in `RentBillingTab.jsx`:

```javascript
    if (timeframeMode === "all") {
      // 1. Build a row for every bill in bills (all historical and current statements)
      const billedReservationIds = new Set();
      const billRows = bills.map((bill) => {
        const billId = getId(bill.id || bill._id);
        const reservationId = getId(bill.reservationId?._id || bill.reservationId);
        if (reservationId) billedReservationIds.add(reservationId);
        
        const paymentRecord = billId ? paymentsByBillId.get(billId) : null;
        const normalizedBill = getNormalizedBillSnapshot(bill, paymentRecord);
        const tenantName = bill.tenant?.name || `${bill.userId?.firstName || ""} ${bill.userId?.lastName || ""}`.trim() || bill.tenantName || "Tenant";
        const roomName = bill.roomName || bill.room || bill.reservationId?.roomName || "Unassigned";
        const contractRate = normalizeAmount(bill.charges?.rent || bill.grossAmount || bill.totalAmount || 0);

        return {
          id: billId,
          reservationId: reservationId || billId,
          tenantName,
          roomName,
          branch: bill.branch,
          bill,
          paymentRecord,
          normalizedBill,
          computedStatus: normalizedBill.status,
          contractRate,
          billingCycleStart: bill.billingCycleStart,
          billingCycleEnd: bill.billingCycleEnd,
          dueDate: normalizedBill.dueDate || bill.dueDate,
          daysOverdue: normalizedBill.daysOverdue,
          isPastGen: false,
          applianceFees: normalizeAmount(bill.charges?.applianceFees || 0),
          isHistoricalBill: true,
        };
      });

      // 2. For active tenants who do not have any bill generated yet, include them as upcoming / action required
      const unbilledTenantRows = tenants
        .filter((tenant) => {
          const resId = getId(tenant.reservationId);
          const currentBillId = getId(tenant.currentMonthBill?.id || tenant.currentMonthBill?._id);
          const isAlreadyBilled =
            (currentBillId && billsById.has(currentBillId)) ||
            tenant.billStatus === "already_billed" ||
            billedReservationIds.has(resId);
          return !isAlreadyBilled;
        })
        .map((tenant) => {
          const contractRate = normalizeAmount(tenant.monthlyRent || tenant.pricingSnapshot?.finalMonthlyRate || 0);
          const isMissingData = tenant.billStatus === "missing_data" || contractRate <= 0;
          const genDate = tenant.nextBillingDate || tenant.billingCycle?.generationDate;
          const isPastGen = isGenerationDatePast(genDate);
          let computedStatus = isMissingData ? "missing_data" : "ready";
          if (computedStatus === "ready" && isPastGen) {
            computedStatus = "pending_generation";
          }
          return {
            ...tenant,
            id: getId(tenant.reservationId),
            bill: null,
            paymentRecord: null,
            normalizedBill: { isPaid: false, balance: contractRate, paidAmount: 0, status: computedStatus, daysOverdue: 0 },
            computedStatus,
            contractRate,
            daysOverdue: 0,
            isPastGen,
            isHistoricalBill: false,
          };
        });

      return [...billRows, ...unbilledTenantRows].sort((a, b) => {
        const order = { missing_data: 1, overdue: 2, pending_generation: 3, ready: 4, generated: 5, sent: 6, partially_paid: 7, paid: 8 };
        const statusDiff = (order[a.computedStatus] || 99) - (order[b.computedStatus] || 99);
        if (statusDiff !== 0) return statusDiff;
        const dateA = new Date(a.dueDate || a.billingCycleEnd || 0).getTime();
        const dateB = new Date(b.dueDate || b.billingCycleEnd || 0).getTime();
        return dateB - dateA;
      });
    }
```

- [ ] **Step 2: Build verification**

Run: `npm run build` in `Capstone-Website/web`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/features/admin/components/billing/RentBillingTab.jsx
git commit -m "fix(billing): prevent duplicate unbilled rows in All Time filter"
```

---

## Verification Plan

### Automated Tests
1. Run backend unit tests: `npm test -- server/controllers/billing/billingHelpers.formatBill.test.js`
2. Run web build: `npm run build` in `Capstone-Website/web`

### Manual Verification
1. Log in as Dorm Admin or Dorm Owner.
2. Navigate to `/admin/billing` -> **Rent Billing** tab.
3. Observe single-month view: Verify Juanito Dela Cruz shows one row with status "Paid".
4. Switch Timeframe filter dropdown to **"All Time"**.
5. Verify Juanito Dela Cruz shows his paid historical bill statements without any duplicate "Pending Generation" placeholder row.
6. Verify an active tenant with NO generated bills still shows as "Upcoming" / "Pending Generation" with the "Force Generate" button.
