# Move-Out Billing Termination, Deposit Isolation & Final Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure tenant billing cycles terminate immediately upon move-out, isolate the security deposit for on-the-spot cash/check return without automatic bill deductions, provide admins with an itemized final bill breakdown before move-out confirmation, accurately release room beds to full vacancy ("4 of 4 open"), route vacant power to branch overhead, and permanently delete the invalid draft bill for GP - Room 204.

**Architecture:** 
1. **Backend Lifecycle**: In `tenantActionService.js` and `moveOutClearanceService.js`, update `moveOutStayWorkflow` to pass `(bedId, userId, reservationId)` to `room.vacateBed`, eliminate automatic deposit deductions for unpaid bills, auto-close the room's open utility period upon full vacancy, and prevent `utilityBillFlow.js` from creating draft bills for moved-out tenants.
2. **Settlement Preview Service**: Provide a unified pre-move-out settlement calculation returning the itemized unpaid rent, pro-rata electricity up to the move-out meter reading, water share, and damage/key fees alongside the full security deposit to return.
3. **Admin Frontend**: Redesign `MoveOutClearanceCalculator.jsx` to render the itemized final bill to collect and the cash/check deposit return tracker with payment verification.
4. **Data Reconciliation**: Execute a one-time script to permanently delete the invalid Sep 15 – Oct 15 draft bill for Leander Ponce and reset GP - Room 204 beds to 4 of 4 open.

**Tech Stack:** Node.js (ESM), Express.js, MongoDB / Mongoose, React, Tailwind CSS, Dayjs.

**Spec:** Lilycrest DMS Module 3 (Tenancy Lifecycle) & Module 4 (Billing & Utilities).

## Global Constraints
- Strictly maintain terms: **"Tenant"** (never Resident), **"Rent"** (never Rental Fee), **"Owner"** (never Super Admin).
- Strictly no background/text gradients in UI; use solid tokens (`1px solid var(--border)`).
- Preserve atomic MongoDB operations (`session` transactions) for move-out and bed releases.
- Never deduct pending utility/rent bills from the Security Deposit held; the Security Deposit is returned in full via cash/check or tracked bank transfer.

---

### Task 1: Permanent Deletion & Reconciliation for GP - Room 204 & Leander Ponce

**Files:**
- Create: `Capstone-Website/server/scripts/reconcile_room_204_moveout.mjs`

**Interfaces:**
- Input: Database connection string (`process.env.MONGODB_URI`)
- Output: Permanently deleted draft bill for Leander Ponce, permanently deleted invalid Sep 15 – Oct 15 period for Room 204, reset all 4 beds in Room 204 to `available`.

- [ ] **Step 1: Write the reconciliation script**

```javascript
// Capstone-Website/server/scripts/reconcile_room_204_moveout.mjs
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Bill, Room, UtilityPeriod, UtilityReading, Reservation, User } from "../models/index.js";

dotenv.config();

async function run() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  console.log("Connected to MongoDB for GP - Room 204 Reconciliation...");

  // 1. Locate GP - Room 204
  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: "GP - Room 204" }, { roomNumber: "204", branch: "gil-puyat" }],
  });
  if (!room) throw new Error("Room GP - Room 204 not found");

  console.log(`Found Room: ${room.name} (${room._id}), Capacity: ${room.capacity}, CurrentOccupancy: ${room.currentOccupancy}`);

  // 2. Locate Leander Ponce
  const user = await User.findOne({
    $or: [{ email: "jhajhaisonce@gmail.com" }, { firstName: "Leander", lastName: "Ponce" }],
  });
  const userId = user ? user._id : null;
  console.log(`Found User: ${user ? `${user.firstName} ${user.lastName} (${user._id})` : "Not found"}`);

  // 3. Permanently delete the invalid Sep 15 - Oct 15 draft bill
  const deleteBillResult = await Bill.deleteMany({
    $or: [
      { roomId: room._id, status: "draft" },
      ...(userId ? [{ userId, status: "draft" }] : []),
    ],
  });
  console.log(`Deleted ${deleteBillResult.deletedCount} invalid draft bill(s).`);

  // 4. Delete the invalid open/sent Sep 15 - Oct 15 period for Room 204
  const deletePeriodResult = await UtilityPeriod.deleteMany({
    roomId: room._id,
    startDate: { $gte: new Date("2026-09-14T00:00:00.000Z") },
  });
  console.log(`Deleted ${deletePeriodResult.deletedCount} invalid utility period(s).`);

  // 5. Reset all beds in Room 204 to available (4 of 4 open)
  if (Array.isArray(room.beds)) {
    room.beds.forEach((bed) => {
      bed.status = "available";
      bed.lockedBy = null;
      bed.lockExpiresAt = null;
      bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
    });
  }
  room.currentOccupancy = 0;
  room.updateAvailability();
  await room.save();

  console.log("Successfully synchronized GP - Room 204 to 4 of 4 open (Occupancy: 0).");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Reconciliation error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
```

- [ ] **Step 2: Run the script to verify cleanup**

Run: `node Capstone-Website/server/scripts/reconcile_room_204_moveout.mjs`
Expected output:
```
Deleted invalid draft bill(s).
Deleted invalid utility period(s).
Successfully synchronized GP - Room 204 to 4 of 4 open (Occupancy: 0).
```

---

### Task 2: Bed Matching, Deposit Isolation & Utility Period Termination in Move-Out Workflow

**Files:**
- Modify: `Capstone-Website/server/utils/tenantActionService.js:3312-3320,3422-3450,3475-3490`
- Modify: `Capstone-Website/server/models/Room.js:309-345`
- Test: `Capstone-Website/server/services/moveOutClearanceService.test.js`

**Interfaces:**
- `room.vacateBed(bedId, userId, reservationId)`: Matches bed across `id`, `code`, `bedNumber`, `userId`, or `reservationId` and sets `status = "available"`.
- `moveOutStayWorkflow`: Returns isolated `depositSettlement` where `depositRefundAmount = securityDepositAmount` without deduction of unpaid rent/utilities.

- [ ] **Step 1: Write unit test for robust bed vacancy and deposit isolation**

In `Capstone-Website/server/services/moveOutClearanceService.test.js`, add:
```javascript
test("moveOutStayWorkflow vacates bed by reservationId and keeps security deposit intact", async () => {
  // Test that room.beds are set to available even with arbitrary bedId
  // Test that depositRefundAmount equals full security deposit
});
```

- [ ] **Step 2: Update Room.vacateBed to ensure robust matching**

In `Capstone-Website/server/models/Room.js`:
```javascript
roomSchema.methods.vacateBed = function (bedId, userId, reservationId) {
  const normBedId = bedId ? String(bedId).trim().toLowerCase() : null;
  const normUserId = userId ? String(userId?._id || userId).trim() : null;
  const normResId = reservationId ? String(reservationId?._id || reservationId).trim() : null;

  let bed = this.beds.find((b) => {
    const bId = b.id ? String(b.id).trim().toLowerCase() : "";
    const bCode = b.code ? String(b.code).trim().toLowerCase() : "";
    const bMongoId = b._id ? String(b._id).trim().toLowerCase() : "";
    const bNum = b.bedNumber != null ? String(b.bedNumber) : "";
    const bUserId = b.occupiedBy?.userId ? String(b.occupiedBy.userId).trim() : "";
    const bResId = b.occupiedBy?.reservationId ? String(b.occupiedBy.reservationId).trim() : "";

    if (normBedId && (bId === normBedId || bCode === normBedId || bMongoId === normBedId || bNum === normBedId)) {
      return true;
    }
    if (normUserId && bUserId && bUserId === normUserId) {
      return true;
    }
    if (normResId && bResId && bResId === normResId) {
      return true;
    }
    return false;
  });

  // Fallback: if only 1 occupied bed exists in room, vacate that bed
  if (!bed && this.beds.filter((b) => b.status === "occupied").length === 1) {
    bed = this.beds.find((b) => b.status === "occupied");
  }

  if (!bed) return false;

  bed.status = "available";
  bed.lockedBy = null;
  bed.lockExpiresAt = null;
  bed.occupiedBy = {
    userId: null,
    reservationId: null,
    occupiedSince: null,
  };
  return true;
};
```

- [ ] **Step 3: Update moveOutStayWorkflow in tenantActionService.js**

In `Capstone-Website/server/utils/tenantActionService.js`:
1. Call `room.vacateBed(activeStay.bedId, reservation.userId?._id || reservation.userId, reservation._id)` and update availability.
2. Remove rent/utility deductions from `securityDepositAmount`. Set `reservation.depositRefundAmount = isEarlyVacancy ? 0 : securityDepositAmount`.
3. Auto-close the open `UtilityPeriod` when `room.currentOccupancy === 0`:
```javascript
if (room.currentOccupancy === 0) {
  const openPeriod = await UtilityPeriod.findOne({
    roomId: room._id,
    utilityType: "electricity",
    status: { $in: ["open", "manual_review_required"] },
    isArchived: false,
  }).session(session);
  if (openPeriod) {
    openPeriod.status = "closed";
    openPeriod.endDate = moveOutAt;
    openPeriod.endReading = validatedFinalUtilityReading || openPeriod.startReading;
    openPeriod.closedAt = new Date();
    await openPeriod.save({ session });
  }
}
```

- [ ] **Step 4: Run tests to verify**

Run: `npm test -- server/services/moveOutClearanceService.test.js`
Expected: PASS

---

### Task 3: Backend Guard in Utility Bill Flow to Prevent Departed Tenant Draft Bills

**Files:**
- Modify: `Capstone-Website/server/utils/utilityBillFlow.js:180-235`

**Interfaces:**
- `upsertDraftBillsForUtility`: Skips creating draft bills if `summary.tenantId` is `moved_out` or if the period started on/after the tenant's move-out date.

- [ ] **Step 1: Write test in utilityBillFlow test suite**

- [ ] **Step 2: Add lifecycle check in upsertDraftBillsForUtility**

In `Capstone-Website/server/utils/utilityBillFlow.js`:
```javascript
// Check tenant status before upserting draft bill
const tenantUser = await User.findById(summary.tenantId).select("tenantStatus").lean();
if (tenantUser?.tenantStatus === "moved_out") {
  // Departed tenant — do not generate ongoing draft bills
  continue;
}
```

- [ ] **Step 3: Run utility tests**

Run: `npm test -- server/controllers/monthlyUtilityWorkflow.integration.test.js`
Expected: PASS

---

### Task 4: Frontend Move-Out Clearance & Final Settlement Modal

**Files:**
- Modify: `Capstone-Website/web/src/features/admin/components/MoveOutClearanceCalculator.jsx`

**Interfaces:**
- Props: `reservation`, `isOpen`, `onClose`, `onClearanceCompleted`
- Calculates: Unpaid rent balance, move-out electricity share, water share, and damage deductions -> Total Final Bill to Collect.
- Displays: Full Security Deposit to Return with checkbox for "Handed over in Cash/Check on the spot".

- [ ] **Step 1: Update MoveOutClearanceCalculator.jsx UI**

Render:
1. **Section 1: Final Bill to Collect** (Rent + Pro-rata Utilities + Damages).
2. **Section 2: Security Deposit to Return** (₱5,400.00) with Cash/Check confirmation.
3. **Section 3: Action Buttons** with Payment Confirmation Gate and Admin Override.

- [ ] **Step 2: Build verification**

Run: `npm run build` in `Capstone-Website/web`
Expected: Build passes with 0 errors.

---

### Task 5: Final End-to-End Verification & Walkthrough

- [ ] **Step 1: Execute full verification test suite**
- [ ] **Step 2: Run frontend dev check and verify live view for Room 204**
- [ ] **Step 3: Update walkthrough artifact with screenshots and QA guide**
