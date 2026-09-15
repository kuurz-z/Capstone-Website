# Tenant Assistant AI Penalty Fee Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Tenant Assistant AI to accurately detect and report unpaid penalty fees, total outstanding balances, and active billing statements instead of claiming bills are ₱0.00 penalty and already marked as paid.

**Architecture:** Enrich `tenantContextResolver.js` to aggregate all non-draft bills for the tenant into an authoritative `billingSummary` (total outstanding balance, unpaid statement count, total penalty due) and structured `unpaidBills` / `recentBills` lists alongside `currentBill`. Update `tenantChatbotService.js` to recognize penalty intent keywords and ground the system prompt on outstanding balances and penalties. Update `TenantAssistantDrawer.jsx` and `TenantBillingBreakdownCard.jsx` to prioritize unpaid statements when balances exist.

**Tech Stack:** Express.js, MongoDB/Mongoose, Google Gemini AI / Generative AI SDK, React, Vite.

**Spec:** [implementation_plan.md](file:///C:/Users/Adming/.gemini/antigravity/brain/10ba29c7-b383-45bc-8608-3d2f231e7f76/implementation_plan.md)

## Global Constraints

- Never invent unlisted bills, rates, or dates; always ground strictly on MongoDB records.
- Preserve zero-gradient, solid HSL design tokens (`1px solid var(--border)`), transparent status badges with colored status dots, and standalone semantic icons.
- Strict Terminology: Always use "Tenant" (never "Resident"), "Assistant" (never "Copilot").
- Maintain backward compatibility for mobile endpoints (`/api/mobile/...`) and all existing bill resolvers.

---

### Task 1: Backend Context Resolution: Expose Billing Summary, Unpaid Bills, and Penalty Breakdown

**Files:**
- Modify: `Capstone-Website/server/services/chatbot/tenantContextResolver.js`
- Test: `Capstone-Website/server/services/chatbot/tenantContextResolver.test.js`

**Interfaces:**
- Consumes: `Bill` model, `selectCurrentBillFromList`
- Produces: `contextSnapshot.billingSummary` (`totalOutstandingBalance`, `unpaidStatementsCount`, `totalPenaltyDue`, `hasPendingBalance`), `contextSnapshot.unpaidBills`, `contextSnapshot.activeUnpaidBill`, updated `contextSnapshot.hasPendingBill`

- [ ] **Step 1: Write the failing unit test in `tenantContextResolver.test.js`**

Add a test in `server/services/chatbot/tenantContextResolver.test.js`:
```javascript
  test("exposes billingSummary, unpaidBills with penaltyAmount, and activeUnpaidBill when an unpaid penalty bill exists", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = {
      _id: tenantId,
      user_id: "tenant-firebase-id",
      firstName: "Jhai",
      lastName: "Ponce",
      email: "jhajhaiponce@gmail.com",
      branch: "gil-puyat",
    };
    const activeStay = {
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      branch: "gil-puyat",
      status: "active",
      leaseStartDate: new Date("2026-08-13T00:00:00Z"),
      roomId: { _id: new mongoose.Types.ObjectId(), roomNumber: "204", branch: "gil-puyat" },
    };
    const paidCycleBill = {
      _id: new mongoose.Types.ObjectId("6aa9062279b2011a70fa2735"),
      status: "paid",
      isArchived: false,
      billType: "transfer_settlement",
      billingCycleStart: new Date("2026-09-14T16:00:00Z"),
      billingCycleEnd: new Date("2026-10-14T16:00:00Z"),
      billingMonth: new Date("2026-09-14T16:00:00Z"),
      totalAmount: 5400,
      remainingAmount: 0,
      paidAmount: 5400,
      charges: { rent: 0, electricity: 0, penalty: 0 },
    };
    const pendingPenaltyBill = {
      _id: new mongoose.Types.ObjectId("6aa908f679b2011a70fa3a36"),
      status: "pending",
      isArchived: false,
      billType: "penalty",
      billingMonth: new Date("2026-09-01T00:00:00Z"),
      totalAmount: 50000,
      remainingAmount: 50000,
      paidAmount: 0,
      charges: { rent: 0, electricity: 0, penalty: 50000 },
      penaltyDetails: { daysLate: 5 },
    };

    userFindOne.mockReturnValue(queryResult(user));
    stayFindOne.mockReturnValue(queryResult(activeStay));
    reservationFindOne.mockReturnValue(queryResult(null));
    billFind.mockReturnValue(queryResult([paidCycleBill, pendingPenaltyBill]));
    maintenanceFind.mockReturnValue(queryResult([]));
    conversationFind.mockReturnValue(queryResult([]));
    resolveTenantCanonicalContract.mockResolvedValue(null);
    toMobileBill.mockImplementation((b) => ({
      billing_id: String(b._id),
      total: b.totalAmount,
      remaining_amount: b.remainingAmount,
      paid_amount: b.paidAmount,
      rent: b.charges?.rent || 0,
      electricity: b.charges?.electricity || 0,
      water: b.charges?.water || 0,
      status: b.status,
      status_label: b.status === "paid" ? "Paid" : "Pending",
      due_date: "2026-09-22T00:00:00.000Z",
    }));

    const context = await resolveTenantAIContext(tenantId, user, { now: new Date("2026-09-15T00:00:00Z") });

    expect(context.billingSummary).toBeDefined();
    expect(context.billingSummary.totalOutstandingBalance).toBe(50000);
    expect(context.billingSummary.unpaidStatementsCount).toBe(1);
    expect(context.billingSummary.totalPenaltyDue).toBe(50000);
    expect(context.hasPendingBill).toBe(true);
    expect(context.unpaidBills).toHaveLength(1);
    expect(context.unpaidBills[0].billId).toBe("6aa908f679b2011a70fa3a36");
    expect(context.unpaidBills[0].penaltyAmount).toBe(50000);
    expect(context.activeUnpaidBill).toBeDefined();
    expect(context.activeUnpaidBill.billId).toBe("6aa908f679b2011a70fa3a36");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantContextResolver.test.js
```
Expected: FAIL with `expect(context.billingSummary).toBeDefined()` returning undefined.

- [ ] **Step 3: Implement minimal code in `tenantContextResolver.js`**

In `server/services/chatbot/tenantContextResolver.js`:
1. Enhance `toCurrentBillContext(bill)` to include:
   ```javascript
   billType: bill.billType || "monthly",
   penaltyAmount: Number(bill.charges?.penalty || 0),
   penaltyDetails: bill.penaltyDetails || null,
   ```
2. Update the `billingResolution` calculation:
   Query bills using `$or: [{ userId: tenantId }, { tenantId: tenantId }]` with `isArchived: { $ne: true }, status: { $ne: "draft" }`.
   Map all non-voided bills to detect unpaid bills (`remainingAmount > 0` and `status !== "voided" && status !== "paid"`).
   Calculate:
   ```javascript
   const totalOutstandingBalance = bills.reduce((sum, b) => {
     if (b.status === "voided" || b.status === "waived") return sum;
     return sum + (Number(b.remainingAmount !== undefined ? b.remainingAmount : b.totalAmount) || 0);
   }, 0);
   const unpaidBills = bills
     .filter((b) => b.status !== "voided" && b.status !== "waived" && Number(b.remainingAmount !== undefined ? b.remainingAmount : b.totalAmount) > 0)
     .map(toCurrentBillContext);
   const totalPenaltyDue = bills.reduce((sum, b) => {
     if (b.status === "voided" || b.status === "waived" || Number(b.remainingAmount || 0) <= 0) return sum;
     return sum + (Number(b.charges?.penalty) || 0);
   }, 0);
   const activeUnpaidBill = unpaidBills.find(b => b.penaltyAmount > 0) || unpaidBills[0] || null;
   ```
3. Attach to return object:
   ```javascript
   billingSummary: {
     totalOutstandingBalance,
     unpaidStatementsCount: unpaidBills.length,
     hasPendingBalance: totalOutstandingBalance > 0,
     totalPenaltyDue,
   },
   unpaidBills,
   activeUnpaidBill,
   recentBills: bills.slice(0, 5).map(toCurrentBillContext),
   hasPendingBill: Boolean(totalOutstandingBalance > 0 || unpaidBills.length > 0 || (currentBill && currentBill.remainingAmount > 0)),
   ```

- [ ] **Step 4: Run test to verify it passes**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantContextResolver.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/chatbot/tenantContextResolver.js server/services/chatbot/tenantContextResolver.test.js
git commit -m "feat(chatbot): expose billingSummary and unpaidBills with penalties in tenantContextResolver"
```

---

### Task 2: AI Prompt Grounding & Penalty Intent Recognition

**Files:**
- Modify: `Capstone-Website/server/services/chatbot/tenantChatbotService.js`
- Test: `Capstone-Website/server/services/chatbot/tenantChatbotService.test.js`

**Interfaces:**
- Consumes: `contextSnapshot.billingSummary`, `contextSnapshot.unpaidBills`, `contextSnapshot.activeUnpaidBill`
- Produces: Accurate conversational responses regarding penalty fees and outstanding balances; triggers `billing_breakdown` widget on penalty inquiries.

- [ ] **Step 1: Write the failing unit test in `tenantChatbotService.test.js`**

Add tests to `server/services/chatbot/tenantChatbotService.test.js`:
```javascript
  test("detectTenantWidgetIntent detects penalty keywords as billing_breakdown", () => {
    const context = { tenancy: { isCurrentResident: true }, userRole: "tenant" };
    expect(detectTenantWidgetIntent("how much is my penalty fee?", context)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("meron ba akong multa?", context)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("pero sa penalty siya", context)).toBe("billing_breakdown");
    expect(detectTenantWidgetIntent("why do i have a late payment penalty?", context)).toBe("billing_breakdown");
  });

  test("getSystemPrompt incorporates billingSummary and unpaid penalty items", () => {
    const context = {
      tenantName: "Jhai Ponce",
      branch: "Gil Puyat",
      roomNumber: "204",
      bedPosition: "bed-3",
      tenancy: { isCurrentResident: true },
      billingSummary: {
        totalOutstandingBalance: 50000,
        unpaidStatementsCount: 1,
        totalPenaltyDue: 50000,
        hasPendingBalance: true,
      },
      unpaidBills: [
        {
          billId: "6aa908f679b2011a70fa3a36",
          billType: "penalty",
          billingPeriod: "September 2026",
          totalAmount: 50000,
          remainingAmount: 50000,
          penaltyAmount: 50000,
          status: "pending",
        },
      ],
      currentBill: {
        totalAmount: 5400,
        remainingAmount: 0,
        status: "paid",
        penaltyAmount: 0,
      },
    };
    const prompt = getSystemPrompt(context);
    expect(prompt).toContain("OUTSTANDING BALANCE & PENALTIES");
    expect(prompt).toContain("50,000");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantChatbotService.test.js
```
Expected: FAIL with `billing_breakdown` expected but returning null.

- [ ] **Step 3: Implement minimal code in `tenantChatbotService.js`**

In `server/services/chatbot/tenantChatbotService.js`:
1. In `detectTenantWidgetIntent`:
   Add penalty terms to billing intent matching:
   ```javascript
   lower.match(/\b(my bill|monthly bill|billing breakdown|electric bill|view bill|bill statement|statement of account|unpaid bill|pay bill|billing summary|my balance|current balance|rent balance|due balance|electricity share|electricity math|penalty|penalties|penalty fee|late fee|multa|surcharge|late payment penalty)\b/) ||
   lower.includes("penalty") ||
   lower.includes("multa") ||
   lower.includes("late fee")
   ```
2. In `getSystemPrompt`:
   Add a dedicated section for `OUTSTANDING BALANCE & PENALTIES`:
   ```javascript
   `OUTSTANDING BALANCE & PENALTIES:
   - Total Outstanding Balance: ₱${Number(contextSnapshot?.billingSummary?.totalOutstandingBalance || 0).toLocaleString()}
   - Unpaid Statements Count: ${contextSnapshot?.billingSummary?.unpaidStatementsCount || 0}
   - Total Penalty Charges Due: ₱${Number(contextSnapshot?.billingSummary?.totalPenaltyDue || 0).toLocaleString()}
   - Outstanding Unpaid Statements: ${
     contextSnapshot?.unpaidBills?.length
       ? contextSnapshot.unpaidBills.map(b => `- [${b.billingPeriod} ${b.billType?.toUpperCase()}] ₱${Number(b.remainingAmount).toLocaleString()} (Penalty: ₱${Number(b.penaltyAmount || 0).toLocaleString()}, Status: ${b.status?.toUpperCase()})`).join("\n")
       : "None"
   }
   
   BILLING ACCURACY RULES:
   1. If the tenant asks about their balance, an unpaid bill, or penalties, ALWAYS report their Total Outstanding Balance and itemized penalty charges from OUTSTANDING BALANCE & PENALTIES above.
   2. NEVER tell a tenant their bill is paid or that they have 0 penalty if totalOutstandingBalance > 0 or totalPenaltyDue > 0. Acknowledge both: that their regular rent may be paid, BUT they have an outstanding pending penalty fee.
   `
   ```

- [ ] **Step 4: Run test to verify it passes**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantChatbotService.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/chatbot/tenantChatbotService.js server/services/chatbot/tenantChatbotService.test.js
git commit -m "feat(chatbot): add penalty intent detection and system prompt balance grounding"
```

---

### Task 3: Assistant Drawer & Statement Card Prioritization

**Files:**
- Modify: `Capstone-Website/web/src/features/tenant/components/assistant/TenantAssistantDrawer.jsx`
- Modify: `Capstone-Website/web/src/features/tenant/components/assistant/cards/TenantBillingBreakdownCard.jsx`
- Test: `Capstone-Website/web/src/features/tenant/components/assistant/tenantAssistant.test.mjs`

**Interfaces:**
- Consumes: `contextSnapshot.activeUnpaidBill || contextSnapshot.currentBill`
- Produces: UI statement card displaying the pending penalty statement and prominent Late Penalties line item.

- [ ] **Step 1: Write test assertions in `tenantAssistant.test.mjs`**

In `web/src/features/tenant/components/assistant/tenantAssistant.test.mjs`:
```javascript
test("TenantAssistantDrawer prioritizes activeUnpaidBill over currentBill when displaying billing breakdown", () => {
  assert.match(drawerSource, /activeUnpaidBill/);
});

test("TenantBillingBreakdownCard supports standalone penalty billType", () => {
  assert.match(billingCardSource, /Penalty Fee Statement|penalty/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run in `Capstone-Website/web`:
```powershell
npm test -- src/features/tenant/components/assistant/tenantAssistant.test.mjs
```
Expected: FAIL due to missing regex matches in source files.

- [ ] **Step 3: Implement minimal code in `TenantAssistantDrawer.jsx` and `TenantBillingBreakdownCard.jsx`**

1. In `TenantAssistantDrawer.jsx`:
   Update line 841:
   ```javascript
   const billData = widgetData?.activeUnpaidBill || widgetData?.currentBill;
   ```
2. In `TenantBillingBreakdownCard.jsx`:
   Update statement title logic:
   ```javascript
   const isPenaltyBill = data?.billType === "penalty" || (penalties > 0 && rent === 0 && electricity === 0);
   const formattedTitle = isPenaltyBill
     ? `${formattedMonth} Penalty Fee Statement`
     : formattedMonth;
   ```
   Render `formattedTitle` in the card header.

- [ ] **Step 4: Run test to verify it passes**

Run in `Capstone-Website/web`:
```powershell
npm test -- src/features/tenant/components/assistant/tenantAssistant.test.mjs
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/tenant/components/assistant/TenantAssistantDrawer.jsx web/src/features/tenant/components/assistant/cards/TenantBillingBreakdownCard.jsx web/src/features/tenant/components/assistant/tenantAssistant.test.mjs
git commit -m "fix(ui): prioritize active unpaid penalty statement in tenant assistant drawer card"
```

---

### Task 4: Harden Secondary Service (`tenantAssistantService.js`)

**Files:**
- Modify: `Capstone-Website/server/services/chatbot/tenantAssistantService.js`
- Test: `Capstone-Website/server/services/chatbot/tenantAssistantService.test.js`

**Interfaces:**
- Consumes: Canonical `Bill` schema properties
- Produces: Correct penalty mapping and fallback responses

- [ ] **Step 1: Write test assertions in `tenantAssistantService.test.js`**

Verify that `tenantAssistantService.test.js` tests include penalty fee retrieval.
```javascript
test("getTenantStayContext correctly maps charges.penalty to lateFee", async () => {
  // test verification of penalty mapping
});
```

- [ ] **Step 2: Run test to verify current state**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantAssistantService.test.js
```

- [ ] **Step 3: Update `tenantAssistantService.js`**

Fix field accesses on lines 192-196:
```javascript
rentAmount: latestBill.charges?.rent || latestBill.rentAmount || 0,
electricityAmount: latestBill.charges?.electricity || latestBill.electricityAmount || 0,
waterAmount: latestBill.charges?.water || latestBill.waterAmount || 0,
applianceCharges: latestBill.charges?.applianceFees || latestBill.applianceCharges || 0,
lateFee: latestBill.charges?.penalty || latestBill.lateFee || 0,
```
Add penalty line to `buildTenantSystemPrompt`:
```javascript
- Penalty / Late Fee: ₱${bill?.lateFee ? Number(bill.lateFee).toLocaleString() : "0.00"}
```

- [ ] **Step 4: Run test to verify it passes**

Run in `Capstone-Website/server`:
```powershell
npm test -- services/chatbot/tenantAssistantService.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/chatbot/tenantAssistantService.js server/services/chatbot/tenantAssistantService.test.js
git commit -m "fix(chatbot): correct bill charges property mapping in tenantAssistantService"
```

---

### Task 5: End-to-End Build & Verification Gate

**Files:**
- None (verification only)

- [ ] **Step 1: Run all backend tests**
```powershell
cd server; npm test
```
Expected: All suites pass with 0 errors.

- [ ] **Step 2: Run all frontend tests**
```powershell
cd web; npm test
```
Expected: All tests pass with 0 errors.

- [ ] **Step 3: Run web production build**
```powershell
cd web; npm run build
```
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Final verification on live database**
Run script to verify `resolveTenantAIContext` output for `6aa8d7384273b65552f44dcf`:
Verify `billingSummary.totalOutstandingBalance === 50000`, `totalPenaltyDue === 50000`, `unpaidBills[0].penaltyAmount === 50000`.

- [ ] **Step 5: Final commit if needed**
```bash
git status
```
