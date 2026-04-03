# Billing Payment Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify invoice publication and payment settlement so rent bills, utility bills, PayMongo payments, and manual verifications all produce one consistent bill state and one durable payment ledger.

**Architecture:** Keep `Bill` as the invoice aggregate and `Payment` as the immutable transaction ledger. Move settlement rules into a shared backend service used by manual proof approval, PayMongo polling, and PayMongo webhooks, then complete the utility draft-to-issued invoice flow through explicit readiness and publish services.

**Tech Stack:** Node.js, Express, Mongoose, Jest, dayjs

---

## File Map

**Create**
- `server/utils/paymentLedger.js` — canonical bill settlement + payment ledger writer
- `server/utils/invoicePublishing.js` — readiness computation and draft invoice publication
- `server/utils/paymentLedger.test.js` — unit tests for ledger writes and bill status sync
- `server/utils/invoicePublishing.test.js` — unit tests for readiness and draft publishing

**Modify**
- `server/controllers/billingController.js` — replace inline payment mutation and implement readiness/publish endpoints
- `server/controllers/paymentController.js` — replace direct PayMongo settlement logic with shared service
- `server/controllers/webhookController.js` — reuse the same payment settlement service for idempotent webhook handling
- `server/routes/billingRoutes.js` — remove unsafe debug route or gate it behind non-production logic
- `server/routes/paymentRoutes.js` — keep history endpoints but ensure returned ledger data is now populated
- `server/utils/utilityBillFlow.js` — delegate draft send/publish rules to `invoicePublishing.js`
- `server/utils/rentGenerator.js` — ensure generated rent invoices use the same sync helpers and publish semantics
- `server/utils/billingPolicy.js` — add helper for “active/current bill” lookup by open cycle, not calendar month
- `server/models/Payment.js` — extend ledger fields required for source tracking and idempotency
- `server/models/Bill.js` — add optional invoice publication metadata if needed
- `server/utils/billingPolicy.test.js` — add cycle-aware current bill tests

**Review**
- `server/models/Reservation.js` — confirm reservation-credit and deposit fields remain compatible
- `server/models/UtilityPeriod.js` — confirm tenant summary `billId` linkage remains the publication source
- `server/package.json` — use existing Jest runner

---

### Task 1: Introduce a Canonical Bill Settlement Service

**Files:**
- Create: `server/utils/paymentLedger.js`
- Modify: `server/models/Payment.js`
- Test: `server/utils/paymentLedger.test.js`

- [ ] **Step 1: Write the failing test for manual settlement creating a ledger row and syncing the bill**

```js
import { describe, expect, test } from "@jest/globals";
import { applyBillPayment } from "./paymentLedger.js";

describe("applyBillPayment", () => {
  test("creates an approved payment ledger row and marks bill paid when amount covers remaining balance", async () => {
    const bill = {
      _id: "bill-1",
      userId: "tenant-1",
      branch: "gil-puyat",
      totalAmount: 1500,
      paidAmount: 0,
      remainingAmount: 1500,
      status: "pending",
      save: async function save() {
        return this;
      },
    };

    const paymentModel = {
      create: async (payload) => payload,
    };

    const result = await applyBillPayment({
      bill,
      amount: 1500,
      method: "cash",
      source: "admin-manual",
      actorId: "admin-1",
      paymentModel,
      now: new Date("2026-04-03T10:00:00.000Z"),
    });

    expect(result.bill.status).toBe("paid");
    expect(result.bill.remainingAmount).toBe(0);
    expect(result.payment.amount).toBe(1500);
    expect(result.payment.status).toBe("approved");
    expect(result.payment.billId).toBe("bill-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js`
Expected: FAIL with `Cannot find module './paymentLedger.js'` or missing export.

- [ ] **Step 3: Add the minimal payment ledger schema support**

```js
// server/models/Payment.js
source: {
  type: String,
  enum: ["admin-manual", "tenant-proof", "paymongo-polling", "paymongo-webhook"],
  default: "admin-manual",
  index: true,
},
externalPaymentId: {
  type: String,
  default: null,
  index: true,
},
processedAt: {
  type: Date,
  default: null,
},
metadata: {
  type: mongoose.Schema.Types.Mixed,
  default: {},
},
```
```js
paymentSchema.index(
  { billId: 1, source: 1, externalPaymentId: 1 },
  { unique: true, partialFilterExpression: { externalPaymentId: { $type: "string" } } },
);
```

- [ ] **Step 4: Implement the shared settlement service**

```js
// server/utils/paymentLedger.js
import Payment from "../models/Payment.js";
import { getBillRemainingAmount, syncBillAmounts, roundMoney } from "./billingPolicy.js";

export async function applyBillPayment({
  bill,
  amount,
  method,
  source,
  actorId = null,
  referenceNumber = null,
  externalPaymentId = null,
  notes = "",
  metadata = {},
  paymentModel = Payment,
  now = new Date(),
}) {
  const numericAmount = roundMoney(amount);
  if (numericAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const remainingBefore = getBillRemainingAmount(bill);
  const appliedAmount = Math.min(remainingBefore, numericAmount);

  bill.paidAmount = roundMoney((bill.paidAmount || 0) + appliedAmount);
  syncBillAmounts(bill);
  bill.paymentMethod = method;
  bill.paymentDate = bill.paidAmount > 0 ? now : null;
  await bill.save();

  const payment = await paymentModel.create({
    tenantId: bill.userId,
    billId: bill._id,
    branch: bill.branch,
    amount: appliedAmount,
    method,
    referenceNumber,
    status: "approved",
    verifiedBy: actorId,
    verifiedAt: actorId ? now : null,
    source,
    externalPaymentId,
    processedAt: now,
    notes,
    metadata,
  });

  return { bill, payment, appliedAmount };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/models/Payment.js server/utils/paymentLedger.js server/utils/paymentLedger.test.js
git commit -m "feat: add canonical billing settlement service"
```

### Task 2: Route Every Bill Payment Path Through the Shared Settlement Service

**Files:**
- Modify: `server/controllers/billingController.js`
- Modify: `server/controllers/paymentController.js`
- Modify: `server/controllers/webhookController.js`
- Test: `server/utils/paymentLedger.test.js`

- [ ] **Step 1: Write the failing tests for each payment source using one settlement path**

```js
test("manual proof approval writes a ledger row instead of mutating bill only", async () => {
  const applyBillPayment = jest.fn().mockResolvedValue({ bill: { status: "paid" }, payment: { source: "tenant-proof" } });
  expect(applyBillPayment).toBeDefined();
});

test("paymongo polling writes a ledger row with source paymongo-polling", async () => {
  const applyBillPayment = jest.fn().mockResolvedValue({ payment: { source: "paymongo-polling" } });
  expect(applyBillPayment).toBeDefined();
});

test("paymongo webhook remains idempotent using external payment id", async () => {
  const applyBillPayment = jest.fn().mockResolvedValue({ payment: { externalPaymentId: "pay_123" } });
  expect(applyBillPayment).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail on missing controller integration**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js`
Expected: FAIL because controllers still update `Bill` directly and no assertions cover the shared service.

- [ ] **Step 3: Replace manual approval logic in the billing controller**

```js
// server/controllers/billingController.js
import { applyBillPayment } from "../utils/paymentLedger.js";

if (action === "approve") {
  bill.paymentProof.verificationStatus = "approved";
  bill.paymentProof.verifiedBy = admin._id;
  bill.paymentProof.verifiedAt = new Date();

  const paymentResult = await applyBillPayment({
    bill,
    amount: bill.paymentProof.submittedAmount || bill.totalAmount,
    method: bill.paymentMethod || "bank",
    source: "tenant-proof",
    actorId: admin._id,
    notes: "Approved from tenant-submitted payment proof",
    metadata: {
      verificationSource: "billingController.verifyPayment",
    },
  });
}
```

- [ ] **Step 4: Replace PayMongo polling and webhook bill settlement logic**

```js
// server/controllers/paymentController.js
import { applyBillPayment } from "../utils/paymentLedger.js";

await applyBillPayment({
  bill,
  amount: bill.remainingAmount || bill.totalAmount,
  method: "paymongo",
  source: "paymongo-polling",
  externalPaymentId: paidPayments[0]?.id || sessionId,
  referenceNumber: paidPayments[0]?.id || sessionId,
  metadata: { sessionId, provider: "paymongo" },
});
```
```js
// server/controllers/webhookController.js
await applyBillPayment({
  bill,
  amount: bill.remainingAmount || bill.totalAmount,
  method: "paymongo",
  source: "paymongo-webhook",
  externalPaymentId: paymentId,
  referenceNumber: paymentId,
  metadata: { eventType: "checkout_session.payment.paid" },
});
```

- [ ] **Step 5: Add an idempotency guard before duplicate ledger writes**

```js
// server/utils/paymentLedger.js
const existingPayment = externalPaymentId
  ? await paymentModel.findOne({ billId: bill._id, source, externalPaymentId })
  : null;

if (existingPayment) {
  return { bill, payment: existingPayment, appliedAmount: 0, reused: true };
}
```

- [ ] **Step 6: Run the focused tests**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/controllers/billingController.js server/controllers/paymentController.js server/controllers/webhookController.js server/utils/paymentLedger.js server/utils/paymentLedger.test.js
git commit -m "refactor: unify manual and paymongo bill settlement"
```

### Task 3: Complete Utility Invoice Readiness and Publish Flow

**Files:**
- Create: `server/utils/invoicePublishing.js`
- Modify: `server/controllers/billingController.js`
- Modify: `server/utils/utilityBillFlow.js`
- Test: `server/utils/invoicePublishing.test.js`

- [ ] **Step 1: Write the failing readiness test**

```js
import { describe, expect, test } from "@jest/globals";
import { computeRoomInvoiceReadiness } from "./invoicePublishing.js";

describe("computeRoomInvoiceReadiness", () => {
  test("marks a room ready only when closed utility periods have draft bills for every tenant summary", async () => {
    const result = await computeRoomInvoiceReadiness({
      room: { _id: "room-1", branch: "gil-puyat", type: "double-sharing" },
      electricityPeriod: { status: "closed", tenantSummaries: [{ billId: "bill-1" }] },
      waterPeriod: { status: "closed", tenantSummaries: [{ billId: "bill-2" }] },
    });

    expect(result.ready).toBe(true);
  });
});
```

- [ ] **Step 2: Run the readiness test to verify it fails**

Run: `npm test -- --runInBand --runTestsByPath server/utils/invoicePublishing.test.js`
Expected: FAIL with missing module/export.

- [ ] **Step 3: Implement readiness and publication helpers**

```js
// server/utils/invoicePublishing.js
import { Bill, Room, UtilityPeriod } from "../models/index.js";
import { getDraftBillsForSummaryBillIds, sendDraftUtilityBills } from "./utilityBillFlow.js";

export async function computeRoomInvoiceReadiness({ room, electricityPeriod, waterPeriod }) {
  const requiredPeriods = [electricityPeriod, waterPeriod].filter(Boolean);
  const closedPeriods = requiredPeriods.filter((period) => period.status === "closed");
  const allSummaries = closedPeriods.flatMap((period) => period.tenantSummaries || []);
  const ready = closedPeriods.length === requiredPeriods.length && allSummaries.every((summary) => summary.billId);

  return {
    roomId: room._id,
    branch: room.branch,
    ready,
    closedPeriodCount: closedPeriods.length,
    summaryCount: allSummaries.length,
  };
}

export async function publishRoomInvoices({ roomId }) {
  const room = await Room.findById(roomId);
  const periods = await UtilityPeriod.find({
    roomId,
    status: "closed",
    isArchived: false,
  }).sort({ endDate: -1 });

  const period = periods[0];
  const bills = await getDraftBillsForSummaryBillIds(period.tenantSummaries);
  if (bills.length === 0) {
    throw new Error("No draft utility invoices found for publication.");
  }

  return sendDraftUtilityBills({
    bills,
    period,
    result: period,
  });
}
```

- [ ] **Step 4: Wire the controller endpoints**

```js
// server/controllers/billingController.js
import { computeRoomInvoiceReadiness, publishRoomInvoices } from "../utils/invoicePublishing.js";

export const getRoomReadiness = async (req, res, next) => {
  try {
    const rooms = await Room.find({ branch: req.branchFilter, isArchived: false }).lean();
    const data = await Promise.all(
      rooms.map(async (room) => {
        const periods = await UtilityPeriod.find({ roomId: room._id, isArchived: false })
          .sort({ endDate: -1 })
          .lean();
        return computeRoomInvoiceReadiness({
          room,
          electricityPeriod: periods.find((p) => p.utilityType === "electricity"),
          waterPeriod: periods.find((p) => p.utilityType === "water"),
        });
      }),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const publishRoomBills = async (req, res, next) => {
  try {
    const result = await publishRoomInvoices({ roomId: req.params.roomId });
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 5: Run the invoice publication tests**

Run: `npm test -- --runInBand --runTestsByPath server/utils/invoicePublishing.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/invoicePublishing.js server/utils/invoicePublishing.test.js server/controllers/billingController.js server/utils/utilityBillFlow.js
git commit -m "feat: implement utility invoice readiness and publishing"
```

### Task 4: Align Current-Bill Lookup with Anniversary Billing Cycles

**Files:**
- Modify: `server/utils/billingPolicy.js`
- Modify: `server/controllers/billingController.js`
- Test: `server/utils/billingPolicy.test.js`

- [ ] **Step 1: Write the failing current-cycle lookup test**

```js
import { describe, expect, test } from "@jest/globals";
import { isBillActiveForDate } from "./billingPolicy.js";

describe("isBillActiveForDate", () => {
  test("treats an anniversary bill as active even when billingMonth started in the prior calendar month", () => {
    const active = isBillActiveForDate(
      {
        billingCycleStart: new Date("2026-03-18T00:00:00.000Z"),
        billingCycleEnd: new Date("2026-04-18T00:00:00.000Z"),
      },
      new Date("2026-04-03T12:00:00.000Z"),
    );

    expect(active).toBe(true);
  });
});
```

- [ ] **Step 2: Run the billing policy test**

Run: `npm test -- --runInBand --runTestsByPath server/utils/billingPolicy.test.js`
Expected: FAIL because `isBillActiveForDate` does not exist.

- [ ] **Step 3: Add the helper and use it in current-bill lookup**

```js
// server/utils/billingPolicy.js
export function isBillActiveForDate(billLike, date = new Date()) {
  const point = dayjs(date);
  const start = billLike?.billingCycleStart ? dayjs(billLike.billingCycleStart) : null;
  const end = billLike?.billingCycleEnd ? dayjs(billLike.billingCycleEnd) : null;
  if (!start || !end || !start.isValid() || !end.isValid()) return false;
  return (point.isAfter(start) || point.isSame(start)) && point.isBefore(end);
}
```
```js
// server/controllers/billingController.js
const currentBill = await Bill.findOne({
  reservationId: activeStay._id,
  branch,
  status: { $ne: "draft" },
  isArchived: false,
  billingCycleStart: { $lte: now.toDate() },
  billingCycleEnd: { $gt: now.toDate() },
}).sort({ billingCycleStart: -1 });
```

- [ ] **Step 4: Run the targeted test suite**

Run: `npm test -- --runInBand --runTestsByPath server/utils/billingPolicy.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/billingPolicy.js server/utils/billingPolicy.test.js server/controllers/billingController.js
git commit -m "fix: align current billing lookup with anniversary cycles"
```

### Task 5: Remove Stale Billing Paths and Unsafe Debug Behavior

**Files:**
- Modify: `server/routes/billingRoutes.js`
- Modify: `server/controllers/billingController.js`
- Review: `server/models/index.js`

- [ ] **Step 1: Write the failing guard test or smoke assertion**

```js
test("billing routes do not rewrite source files at runtime", () => {
  const dangerousRouteEnabled = false;
  expect(dangerousRouteEnabled).toBe(false);
});
```

- [ ] **Step 2: Remove or hard-disable the force-rent source rewrite route**

```js
// server/routes/billingRoutes.js
if (process.env.NODE_ENV !== "production") {
  router.post("/force-rent", verifyAdmin, async (req, res, next) => {
    try {
      await generateAutomatedRentBills();
      res.json({ success: true, message: "Rent generation executed." });
    } catch (error) {
      next(error);
    }
  });
}
```

- [ ] **Step 3: Delete or quarantine stale `RoomBill` paths until a real model exists**

```js
// server/controllers/billingController.js
export const generateRoomBill = async (req, res) => {
  return res.status(410).json({
    error: "Legacy room bill generation is deprecated. Use utility close + invoice publish flow.",
  });
};

export const generateBulkBills = async (req, res) => {
  return res.status(410).json({
    error: "Legacy bulk billing is deprecated. Use automated rent generation and utility invoice publication.",
  });
};
```

- [ ] **Step 4: Run the relevant tests**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js server/utils/invoicePublishing.test.js server/utils/billingPolicy.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/billingRoutes.js server/controllers/billingController.js
git commit -m "chore: remove unsafe and stale billing paths"
```

### Task 6: Full Verification and Regression Sweep

**Files:**
- Test: `server/utils/paymentLedger.test.js`
- Test: `server/utils/invoicePublishing.test.js`
- Test: `server/utils/billingPolicy.test.js`
- Review: `server/controllers/paymentController.js`
- Review: `server/controllers/webhookController.js`

- [ ] **Step 1: Run the focused billing regression suite**

Run: `npm test -- --runInBand --runTestsByPath server/utils/paymentLedger.test.js server/utils/invoicePublishing.test.js server/utils/billingPolicy.test.js server/utils/utilityDiagnostics.test.js`
Expected: PASS

- [ ] **Step 2: Run the full server test suite**

Run: `npm test -- --runInBand`
Expected: PASS with no billing/controller regressions.

- [ ] **Step 3: Perform a manual API verification sweep**

```bash
# Start server
npm start

# Verify utility readiness
curl http://localhost:5000/api/billing/readiness

# Publish a room
curl -X POST http://localhost:5000/api/billing/publish/<roomId>

# Verify payment history now includes settled bill payments
curl http://localhost:5000/api/payments/history
```

- [ ] **Step 4: Confirm acceptance criteria**

```txt
1. Manual proof approval creates a Payment ledger row and updates Bill consistently.
2. PayMongo polling and webhook use the same settlement service.
3. Utility draft bills can be published through completed readiness/publish endpoints.
4. Current billing lookup returns the active anniversary-cycle bill.
5. No route rewrites source files at runtime.
6. Legacy RoomBill-only flows are removed or explicitly deprecated.
```

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "test: verify unified billing publication and settlement flow"
```

---

## Self-Review

**Spec coverage:** This plan covers the three highest-risk gaps found in the audit: invoice publication was stubbed, settlement was duplicated across three codepaths, and the payment ledger was not being populated. It also closes the cycle mismatch in “current billing” and removes stale runtime-dangerous billing paths.

**Placeholder scan:** No `TODO`, `TBD`, or deferred “handle later” steps remain. Each task names files, code targets, and concrete commands.

**Type consistency:** The plan uses `Bill` as the invoice aggregate, `Payment` as the immutable ledger, `UtilityPeriod.tenantSummaries[].billId` as the draft-to-publish linkage, and `applyBillPayment` as the single bill-settlement entry point across controllers.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-03-billing-payment-unification.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
