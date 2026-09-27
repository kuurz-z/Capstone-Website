# Billing Workspace Sort Order & Status Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified "Newest to Oldest" / "Oldest to Newest" date sort dropdown and a grouped status filter dropdown across all applicable billing views in Lilycrest DMS (Admin Rent Billing, Tenant Portal Billing statements, and the Overdue Accounts Tracker).

**Architecture:** 
1. **Admin Rent Billing (`RentBillingTab.jsx`)**: Add reactive `statusFilter` (`all`, `unpaid`, `paid`) and `sortOrder` (`newest`, `oldest`, defaulting to `newest`) states into the table toolbar alongside the search input, compounding seamlessly with the existing lifecycle sub-tabs.
2. **Tenant Portal Billing (`BillingTab.jsx`)**: Add `sortOrder` into `StatementFilters` and update the `filteredBills` calculation to respect the user's chosen sort order (defaulting to `newest`), removing the previous rigid sort restriction on unpaid statements.
3. **Overdue Accounts Tracker (`OverdueNoticeTracker.jsx`)**: Add `sortOrder` dropdown alongside the existing stage filter, allowing admins to sort escalation notices chronologically in either direction.
4. **Automated Verification**: Build unit test suite `billingFiltersAndSorting.test.mjs` using Node's native test runner to guarantee contract adherence and prevent regressions.

**Tech Stack:** React 19, Tailwind CSS, Lucide React, Vite, Node.js Test Runner (`node:test`).

**Spec:** User interview specifications from `/grill-me` alignment and `AGENTS.md`.

---

## Global Constraints
- **Strict Terminology Invariants:**
  - Always use **"Tenant"** (NEVER "Resident").
  - Always use **"Assistant"** (NEVER "Copilot").
  - Always use **"Owner"** / **"Dorm Owner"** (NEVER "Super Admin").
  - Always use **"Rent"** / **"Rent Billing"** (NEVER "Rental Fee").
- **Visual Design Rules:**
  - Solid plain colors only — strictly **NO gradients**.
  - Solid neutral 1px borders (`border-slate-200 dark:border-slate-700` or `1px solid var(--border)`).
  - No matching colored outlines or colored border glow rings.
  - Transparent status badge backgrounds with colored status dots.
  - Skeletons use neutral tokens (`bg-slate-200 dark:bg-slate-800`).
- **Resilience & Safe State:**
  - State variables and memoized derivations must be declared prior to rendering JSX to prevent TDZ errors.
  - Date parsing must handle string ISO timestamps, `Date` objects, and empty/missing dates gracefully without `NaN` or crashes.

---

## What to Expect from These Changes

| Screen / Area | New Controls | Visual & Functional Behavior |
| :--- | :--- | :--- |
| **Admin Rent Billing** (`/admin/billing?tab=rent`) | • **Status Filter Dropdown**<br>• **Sort Order Dropdown** | Admins can easily filter records by **All Status**, **Unpaid (Upcoming / Sent / Overdue)**, or **Paid History**, and order the table by **Sort: Newest to Oldest** (default) or **Sort: Oldest to Newest** without disrupting the active lifecycle sub-tabs. |
| **Tenant Portal Billing** (`/billing`) | • **Sort Order Dropdown** | Tenants keep their existing statement tabs (**All Statements**, **Unpaid**, **Paid History**) and gain the ability to switch between **Sort: Newest to Oldest** and **Sort: Oldest to Newest**, empowering them to view their latest bills first or audit their oldest charges. |
| **Overdue Accounts Tracker** (`/admin/billing?tab=overdue-notices`) | • **Sort Order Dropdown** | Admins tracking overdue accounts can sort the escalation ledger by **Sort: Newest to Oldest** or **Sort: Oldest to Newest** alongside the existing escalation stage filter. |

---

## Proposed Changes & Tasks

### Task 1: Create Automated Test Suite for Billing Sort & Status Filters

**Files:**
- Create: `Capstone-Website/web/src/features/admin/components/billing/billingFiltersAndSorting.test.mjs`

**Interfaces:**
- Consumes: Component source code and render contracts from `RentBillingTab.jsx`, `BillingTab.jsx`, and `OverdueNoticeTracker.jsx`.
- Produces: Test runner validations asserting presence of status dropdown, sort dropdowns, default values, and event bindings.

- [ ] **Step 1: Write the failing test suite**
```javascript
// Capstone-Website/web/src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rentTab = fs.readFileSync(
  path.resolve("src/features/admin/components/billing/RentBillingTab.jsx"),
  "utf8"
);
const tenantTab = fs.readFileSync(
  path.resolve("src/features/tenant/components/profile/BillingTab.jsx"),
  "utf8"
);
const overdueTracker = fs.readFileSync(
  path.resolve("src/features/admin/components/OverdueNoticeTracker.jsx"),
  "utf8"
);

test("RentBillingTab contains statusFilter and sortOrder states and controls", () => {
  assert.match(rentTab, /const\s*\[statusFilter,\s*setStatusFilter\]\s*=\s*useState/);
  assert.match(rentTab, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(rentTab, /All Status/);
  assert.match(rentTab, /Unpaid \(Upcoming \/ Sent \/ Overdue\)/);
  assert.match(rentTab, /Paid History/);
  assert.match(rentTab, /Sort: Newest to Oldest/);
  assert.match(rentTab, /Sort: Oldest to Newest/);
});

test("Tenant BillingTab StatementFilters contains sortOrder control and logic", () => {
  assert.match(tenantTab, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(tenantTab, /Sort: Newest to Oldest/);
  assert.match(tenantTab, /Sort: Oldest to Newest/);
  assert.match(tenantTab, /sortOrder === ["']oldest["']/);
});

test("OverdueNoticeTracker contains sortOrder state and control", () => {
  assert.match(overdueTracker, /const\s*\[sortOrder,\s*setSortOrder\]\s*=\s*useState\(["']newest["']\)/);
  assert.match(overdueTracker, /Sort: Newest to Oldest/);
  assert.match(overdueTracker, /Sort: Oldest to Newest/);
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
node --test src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
```
Expected: Tests fail because the new state variables and UI options do not yet exist.

---

### Task 2: Implement Status & Date Sort Dropdowns in Admin Rent Billing (`RentBillingTab.jsx`)

**Files:**
- Modify: `Capstone-Website/web/src/features/admin/components/billing/RentBillingTab.jsx`

**Interfaces:**
- Consumes: Table rows (`tableRows`), active sub-tab (`activeTab`), search query (`searchQuery`).
- Produces: Reactive `statusFilter` (`"all"` | `"unpaid"` | `"paid"`), `sortOrder` (`"newest"` | `"oldest"`), sorted and filtered rows in `filteredRows`, and UI dropdowns in the toolbar.

- [ ] **Step 1: Add state variables in `RentBillingTab.jsx`**
```javascript
const [statusFilter, setStatusFilter] = useState("all"); // "all" | "unpaid" | "paid"
const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"
```

- [ ] **Step 2: Update `filteredRows` memo with status filtering and sorting**
```javascript
const filteredRows = useMemo(() => {
  let rows = tableRows;

  // 1. Existing Sub-tab filtering
  if (activeTab === 'upcoming') {
    rows = rows.filter(r => r.computedStatus === 'ready' || r.computedStatus === 'pending_generation');
  } else if (activeTab === 'overdue') {
    rows = rows.filter(r => r.computedStatus === 'overdue');
  } else if (activeTab === 'exceptions') {
    rows = rows.filter(r => r.computedStatus === 'missing_data');
  }

  // 2. Status dropdown filtering (compounds with sub-tabs)
  if (statusFilter === 'unpaid') {
    rows = rows.filter(r => r.computedStatus !== 'paid');
  } else if (statusFilter === 'paid') {
    rows = rows.filter(r => r.computedStatus === 'paid');
  }

  // 3. Search query filtering
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter(r =>
      (r.tenantName && r.tenantName.toLowerCase().includes(q)) ||
      (r.roomName && r.roomName.toLowerCase().includes(q)) ||
      (r.branch && r.branch.toLowerCase().includes(q))
    );
  }

  // 4. Date sorting ("Newest to Oldest" vs "Oldest to Newest")
  const sorted = [...rows].sort((a, b) => {
    const dateA = new Date(a.dueDate || a.billingCycleEnd || a.createdAt || 0).getTime();
    const dateB = new Date(b.dueDate || b.billingCycleEnd || b.createdAt || 0).getTime();
    return sortOrder === "oldest" ? dateA - dateB : dateB - dateA;
  });

  return sorted;
}, [tableRows, activeTab, statusFilter, searchQuery, sortOrder]);
```

- [ ] **Step 3: Render Status and Sort dropdowns in the toolbar**
In `RentBillingTab.jsx` toolbar container (next to search):
```jsx
<div className="flex flex-wrap items-center gap-2">
  {/* Search Input */}
  <div className="relative flex items-center shrink-0 w-full sm:w-56">
    <Search size={14} className="absolute left-2.5 text-muted-foreground pointer-events-none" />
    <input
      type="text"
      maxLength={50}
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search tenant, room..."
      className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-card-foreground shadow-xs placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
    />
  </div>

  {/* Status Filter Dropdown */}
  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
    aria-label="Filter by payment status"
    title="Filter by payment status"
  >
    <option value="all">All Status</option>
    <option value="unpaid">Unpaid (Upcoming / Sent / Overdue)</option>
    <option value="paid">Paid History</option>
  </select>

  {/* Sort Order Dropdown */}
  <select
    value={sortOrder}
    onChange={(e) => setSortOrder(e.target.value)}
    className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
    aria-label="Sort records by date"
    title="Sort records by date"
  >
    <option value="newest">Sort: Newest to Oldest</option>
    <option value="oldest">Sort: Oldest to Newest</option>
  </select>
</div>
```

- [ ] **Step 4: Verify test passes for RentBillingTab**
```bash
node --test src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
```

---

### Task 3: Implement Date Sort Control in Tenant Portal Billing (`BillingTab.jsx`)

**Files:**
- Modify: `Capstone-Website/web/src/features/tenant/components/profile/BillingTab.jsx`

**Interfaces:**
- Consumes: `bills` array, `statusFilter`, `categoryFilter`.
- Produces: `sortOrder` state in `BillingTab`, passed to `StatementFilters`, and dynamic sorting in `filteredBills`.

- [ ] **Step 1: Add `sortOrder` state to `BillingTab` and pass to `StatementFilters`**
```javascript
const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"
```
In JSX where `<StatementFilters>` is invoked:
```jsx
<StatementFilters
  bills={bills}
  statusFilter={statusFilter}
  setStatusFilter={setStatusFilter}
  categoryFilter={categoryFilter}
  setCategoryFilter={setCategoryFilter}
  sortOrder={sortOrder}
  setSortOrder={setSortOrder}
  hasElectricityBilling={hasElectricityBilling}
  hasWaterBilling={hasWaterBilling}
/>
```

- [ ] **Step 2: Update `StatementFilters` component to render the sort dropdown**
Add `sortOrder` and `setSortOrder` to props of `StatementFilters`, and render the select dropdown beside the category filter button:
```jsx
{/* Sort Order Dropdown */}
<div className="relative flex-shrink-0">
  <select
    value={sortOrder}
    onChange={(e) => setSortOrder(e.target.value)}
    className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
    aria-label="Sort statements by date"
    title="Sort statements by date"
  >
    <option value="newest">Sort: Newest to Oldest</option>
    <option value="oldest">Sort: Oldest to Newest</option>
  </select>
</div>
```

- [ ] **Step 3: Update `filteredBills` sort logic in `BillingTab.jsx`**
Replace lines 1851-1854:
```javascript
      .sort((a, b) => {
        if (sortOrder === "oldest") {
          return getBillSortTimestamp(a) - getBillSortTimestamp(b);
        }
        return getBillSortTimestamp(b) - getBillSortTimestamp(a);
      });
```
Add `sortOrder` to dependency array of `filteredBills`:
`[bills, statusFilter, categoryFilter, sortOrder]`

- [ ] **Step 4: Verify test passes for Tenant BillingTab**
```bash
node --test src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
```

---

### Task 4: Implement Date Sort Dropdown in Overdue Accounts Tracker (`OverdueNoticeTracker.jsx`)

**Files:**
- Modify: `Capstone-Website/web/src/features/admin/components/OverdueNoticeTracker.jsx`

**Interfaces:**
- Consumes: `notices` list, `stageFilter`.
- Produces: `sortOrder` state (`"newest"` | `"oldest"`), sorted `filteredNotices`, and UI dropdown in the action toolbar.

- [ ] **Step 1: Add `sortOrder` state in `OverdueNoticeTracker.jsx`**
```javascript
const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"
```

- [ ] **Step 2: Update `filteredNotices` memo to sort by `sortOrder`**
```javascript
  const filteredNotices = useMemo(() => {
    const list = notices.filter((n) => {
      // Stage filtering logic...
      ...
    });

    return [...list].sort((a, b) => {
      const dateA = new Date(a.dueDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.dueDate || b.createdAt || 0).getTime();
      return sortOrder === "oldest" ? dateA - dateB : dateB - dateA;
    });
  }, [notices, stageFilter, sortOrder, ...]);
```

- [ ] **Step 3: Render Sort dropdown beside `Stage Filter` in the toolbar**
```jsx
<div className="flex items-center gap-1.5">
  <span className="text-xs font-semibold text-muted-foreground">Sort:</span>
  <select
    value={sortOrder}
    onChange={(e) => setSortOrder(e.target.value)}
    className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
    aria-label="Sort overdue accounts by date"
    title="Sort overdue accounts by date"
  >
    <option value="newest">Sort: Newest to Oldest</option>
    <option value="oldest">Sort: Oldest to Newest</option>
  </select>
</div>
```

- [ ] **Step 4: Verify test passes for OverdueNoticeTracker**
```bash
node --test src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
```

---

### Task 5: Empirical Build Check, Regression Testing, and Git Commit

- [ ] **Step 1: Run unit tests**
```bash
node --test src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
```
- [ ] **Step 2: Run frontend build check**
```bash
cd Capstone-Website/web && npm run build
```
Confirm zero build errors, syntax errors, or TypeScript/Vite issues.
- [ ] **Step 3: Run backend test regression suite**
```bash
cd Capstone-Website/server && npm test
```
Confirm all tests pass.

---

## Detailed Step-by-Step Manual QA Guide

### 1. Where to Go
1. **Admin Rent Billing**: Log in as Admin/Owner &rarr; navigate to `/admin/billing?tab=rent`.
2. **Tenant Portal Billing**: Log in as a Tenant &rarr; navigate to `/billing`.
3. **Overdue Accounts Tracker**: Log in as Admin/Owner &rarr; navigate to `/admin/billing?tab=overdue-notices`.

### 2. Step-by-Step Actions & Expected Results
1. **Admin Rent Billing**:
   - Locate the **Status** and **Sort** dropdowns in the toolbar next to the search input.
   - Click the Sort dropdown and select **"Sort: Oldest to Newest"** &rarr; Verify the earliest billing dates appear at the top.
   - Click the Sort dropdown and select **"Sort: Newest to Oldest"** &rarr; Verify the most recent billing dates appear first.
   - Click the Status dropdown and select **"Unpaid (Upcoming / Sent / Overdue)"** &rarr; Verify only unsettled/upcoming bills are shown; all "Paid" rows disappear.
   - Click the Status dropdown and select **"Paid History"** &rarr; Verify only settled bills are shown.
   - Click the Status dropdown and select **"All Status"** &rarr; Verify all records return.
   - Click through the sub-tabs ("Lifecycle Overview", "Upcoming Auto-Gen", "Overdue Rent", "Action Required") &rarr; Verify the status and sort filters compound smoothly with each sub-tab.
2. **Tenant Portal Billing**:
   - Open `/billing`.
   - Locate the **"Sort: Newest to Oldest"** dropdown next to the Category filter.
   - Toggle to **"Sort: Oldest to Newest"** &rarr; Verify statements are listed from oldest to newest.
   - Toggle to **"Sort: Newest to Oldest"** &rarr; Verify statements are listed from newest to oldest.
   - Switch between **"All Statements"**, **"Unpaid"**, and **"Paid History"** tabs &rarr; Verify the chosen sort direction persists cleanly.
3. **Overdue Accounts Tracker**:
   - Open `/admin/billing?tab=overdue-notices`.
   - Locate the sort dropdown next to the Stage filter.
   - Toggle between **"Sort: Newest to Oldest"** and **"Sort: Oldest to Newest"** &rarr; Verify notices reorder by due date chronologically.

### 3. Edge Cases & Boundary Conditions
- **Empty States**: If a status filter has no matching records (e.g. "Paid History" when no bills have been settled), verify the clean empty state displays without errors.
- **Search Query Interaction**: Search by tenant or room name while status and sort filters are active &rarr; Verify search filters within the sorted/status-filtered results.
- **Null / Missing Dates**: Records with missing due dates or billing cycles should be sorted safely to the end without throwing `NaN` or crashing the component.
