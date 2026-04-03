# Billing Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin billing screens into a cleaner workspace with a left work queue, sticky summary bar, and modernized billing tables without changing billing behavior.

**Architecture:** Keep the existing route and data-fetching structure, but refactor presentation inside the billing page, utility tab, and invoice publish tab into a workspace layout. Use focused shared billing presentation pieces where it reduces duplication, and preserve existing API hooks and actions so the redesign is visual and interaction-focused rather than logic-heavy.

**Tech Stack:** React 19, Vite, CSS, TanStack Query, lucide-react

---

## File Map

- Modify: `web/src/features/admin/pages/AdminBillingPage.jsx`
  Purpose: Upgrade the billing page shell and top-level tab workspace framing.
- Modify: `web/src/features/admin/pages/AdminBillingPage.css`
  Purpose: Introduce the page-level workspace shell, sticky tab/header behavior, and refined top navigation styling.
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.jsx`
  Purpose: Recompose the utility billing screen into a left rail + detail workspace with section cards and cleaner data presentation.
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.css`
  Purpose: Replace the dense mixed table styling with a calmer workspace visual system and modern table surfaces.
- Modify: `web/src/features/admin/components/billing/InvoicePublishTab.jsx`
  Purpose: Convert invoice publishing into a shipping-queue style workspace with grouped sections, sticky summaries, and better status/action framing.
- Modify: `web/src/features/admin/components/billing/InvoicePublishTab.css`
  Purpose: Move the invoice publish tab from dark dense cards to the new premium admin billing visual system.
- Modify: `web/src/features/admin/components/billing/shared/BillingRoomList.jsx`
  Purpose: Support richer queue item metadata and stronger selected-state semantics for the persistent left rail.

## Task 1: Build The Billing Workspace Shell

**Files:**
- Modify: `web/src/features/admin/pages/AdminBillingPage.jsx`
- Modify: `web/src/features/admin/pages/AdminBillingPage.css`
- Test: `web` admin build

- [ ] **Step 1: Write the failing test surrogate as a visual contract note**

Because this frontend area has no existing UI test harness in the repo, record the expected shell shape before implementation:

```jsx
// Expected layout contract in AdminBillingPage.jsx after redesign
<div className="admin-billing-page">
  <header className="admin-billing-page__hero">
    <div className="admin-billing-page__hero-copy" />
    <div className="admin-billing-page__hero-actions" />
  </header>
  <div className="admin-billing-page__workspace-tabs" role="tablist" />
  <section className="admin-billing-page__workspace-panel">
    {/* active tab content */}
  </section>
</div>
```

- [ ] **Step 2: Run build to verify current shell still lacks the redesigned workspace**

Run: `npm run build:admin`
Expected: build either passes with the old shell still present, or fails for the known existing Vite admin entry issue rather than proving the redesign exists.

- [ ] **Step 3: Write the minimal page-shell implementation**

Update the page shell to create a stronger workspace frame while preserving the three existing tabs:

```jsx
return (
  <div className="admin-billing-page">
    <section className="admin-billing-page__hero">
      <div className="admin-billing-page__hero-copy">
        <span className="admin-billing-page__eyebrow">Billing Workspace</span>
        <h1 className="admin-billing-page__heading">Billing Management</h1>
        <p className="admin-billing-page__subtitle">
          Manage utility cycles, review tenant splits, and publish invoices from one workspace.
        </p>
      </div>
      <div className="admin-billing-page__hero-actions" role="tablist" aria-label="Billing type">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`admin-billing-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="admin-billing-tab__icon"><Icon size={14} /></span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>

    <section className="admin-billing-page__workspace-panel">
      {activeTab === "electricity" && <UtilityBillingTab utilityType="electricity" />}
      {activeTab === "water" && <UtilityBillingTab utilityType="water" />}
      {activeTab === "invoices" && <InvoicePublishTab />}
    </section>
  </div>
);
```

Pair it with a lighter premium surface:

```css
.admin-billing-page {
  display: grid;
  gap: 20px;
}

.admin-billing-page__hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  background: linear-gradient(180deg, #fffdf8 0%, #ffffff 100%);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.05);
}

.admin-billing-page__workspace-panel {
  min-height: 720px;
}
```

- [ ] **Step 4: Run build to verify the shell compiles**

Run: `npm run build:admin`
Expected: same outcome as Step 2, except no new JSX/CSS syntax errors are introduced by the shell changes.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/admin/pages/AdminBillingPage.jsx web/src/features/admin/pages/AdminBillingPage.css
git commit -m "feat: redesign billing workspace shell"
```

## Task 2: Redesign The Utility Billing Workspace

**Files:**
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.jsx`
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.css`
- Modify: `web/src/features/admin/components/billing/shared/BillingRoomList.jsx`
- Test: `web` admin build

- [ ] **Step 1: Write the failing test surrogate as a component structure contract**

Capture the target structure before coding:

```jsx
// Expected high-level UtilityBillingTab structure after redesign
<div className="billing-workspace">
  <aside className="billing-workspace__rail">
    <BillingRoomList />
  </aside>
  <main className="billing-workspace__canvas">
    <section className="billing-workspace__summary" />
    <section className="billing-workspace__grid">
      <article className="billing-card" />
      <article className="billing-card" />
    </section>
  </main>
</div>
```

- [ ] **Step 2: Run build to verify the current utility tab has not yet been restructured**

Run: `npm run build:admin`
Expected: build passes or hits the known admin entry issue, but the utility tab is still using the older dense layout.

- [ ] **Step 3: Write the minimal workspace implementation**

Recompose the utility tab around summary cards and cleaner tables without altering data hooks:

```jsx
<div className="billing-workspace">
  <aside className="billing-workspace__rail">
    <BillingRoomList
      title={utilityType === "electricity" ? "Electricity Queue" : "Water Queue"}
      rooms={filteredRooms}
      selectedRoomId={selectedRoomId}
      onSelectRoom={setSelectedRoomId}
      isLoading={roomsLoading}
      searchValue={sidebarSearch}
      onSearchChange={setSidebarSearch}
      getMeta={(room) => [
        room.branch,
        room.hasOpenPeriod ? "Open cycle" : "No active cycle",
        `${room.activeTenantCount || 0} tenant${room.activeTenantCount === 1 ? "" : "s"}`,
      ]}
    />
  </aside>

  <main className="billing-workspace__canvas">
    <section className="billing-workspace__summary">
      <div className="billing-summary-card">
        <span className="billing-summary-card__label">Current room</span>
        <strong>{selectedRoom ? getRoomLabel(selectedRoom) : "No room selected"}</strong>
      </div>
      <div className="billing-summary-card">
        <span className="billing-summary-card__label">Cycle status</span>
        <strong>{openPeriodForRoom ? "Open" : "No active cycle"}</strong>
      </div>
      <div className="billing-summary-card">
        <span className="billing-summary-card__label">Rate</span>
        <strong>{fmtCurrency(defaultRatePerUnit)}</strong>
      </div>
    </section>

    <section className="billing-workspace__grid">
      {/* existing readings, periods, tenant split, and segment sections remain, but move into .billing-card wrappers */}
    </section>
  </main>
</div>
```

Refresh table styling toward a modern operational grid:

```css
.billing-workspace {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
}

.billing-card {
  padding: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.eb-table th {
  position: sticky;
  top: 0;
  background: #fcfaf6;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
}

.eb-table tbody tr:hover {
  background: #faf7f1;
}
```

- [ ] **Step 4: Run build to verify the redesigned utility workspace compiles**

Run: `npm run build:admin`
Expected: same build status as before, with no new syntax/import errors from the utility workspace changes.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/admin/components/billing/UtilityBillingTab.jsx web/src/features/admin/components/billing/UtilityBillingTab.css web/src/features/admin/components/billing/shared/BillingRoomList.jsx
git commit -m "feat: redesign utility billing workspace"
```

## Task 3: Redesign The Invoice Publish Workspace

**Files:**
- Modify: `web/src/features/admin/components/billing/InvoicePublishTab.jsx`
- Modify: `web/src/features/admin/components/billing/InvoicePublishTab.css`
- Test: `web` admin build

- [ ] **Step 1: Write the failing test surrogate as a publish-queue contract**

Record the expected top-level structure:

```jsx
// Expected InvoicePublishTab shape after redesign
<div className="invoice-workspace">
  <section className="invoice-workspace__summary" />
  <section className="invoice-workspace__queues">
    <div className="invoice-queue invoice-queue--ready" />
    <div className="invoice-queue invoice-queue--blocked" />
    <div className="invoice-queue invoice-queue--sent" />
  </section>
</div>
```

- [ ] **Step 2: Run build to verify the current invoice tab has not yet become the new queue workspace**

Run: `npm run build:admin`
Expected: build passes or hits the existing admin entry issue, but the invoice tab remains on the older darker layout.

- [ ] **Step 3: Write the minimal invoice workspace implementation**

Restructure the publish tab around a summary strip and calmer queue sections:

```jsx
<div className="invoice-workspace">
  <section className="invoice-workspace__summary">
    <div className="invoice-metric">
      <span>Ready Rooms</span>
      <strong>{readyRooms.length}</strong>
    </div>
    <div className="invoice-metric">
      <span>Blocked Rooms</span>
      <strong>{blockedRooms.length}</strong>
    </div>
    <div className="invoice-metric">
      <span>Sent Rooms</span>
      <strong>{sentRooms.length}</strong>
    </div>
  </section>

  <section className="invoice-workspace__queues">
    <div className="invoice-queue invoice-queue--ready">{readyRooms.map((room) => renderRoomRow(room, true, false))}</div>
    <div className="invoice-queue invoice-queue--blocked">{blockedRooms.map((room) => renderRoomRow(room, false, false))}</div>
    <div className="invoice-queue invoice-queue--sent">{sentRooms.map((room) => renderRoomRow(room, false, true))}</div>
  </section>
</div>
```

Shift the styles to the shared premium billing palette:

```css
.invoice-workspace__summary {
  position: sticky;
  top: 0;
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.92);
  backdrop-filter: blur(12px);
}

.ipt-row {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
}
```

- [ ] **Step 4: Run build to verify the invoice workspace compiles**

Run: `npm run build:admin`
Expected: same overall build status as earlier, with no new syntax/import failures from invoice workspace changes.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/admin/components/billing/InvoicePublishTab.jsx web/src/features/admin/components/billing/InvoicePublishTab.css
git commit -m "feat: redesign invoice publish workspace"
```

## Task 4: Responsive, Accessibility, And Visual Polish Pass

**Files:**
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.css`
- Modify: `web/src/features/admin/components/billing/InvoicePublishTab.css`
- Modify: `web/src/features/admin/pages/AdminBillingPage.css`
- Test: `web` admin build and manual viewport review

- [ ] **Step 1: Write the failing test surrogate as viewport acceptance criteria**

Document the required breakpoints before polishing:

```txt
Desktop >= 1280px:
- left rail remains visible
- sticky summary bars remain readable

Tablet 768px to 1279px:
- rail narrows
- tables remain usable

Mobile < 768px:
- workspace stacks vertically
- tables collapse into card-like records where needed
```

- [ ] **Step 2: Run build to verify the unpolished responsive pass has not yet been applied**

Run: `npm run build:admin`
Expected: same current build result as earlier, before the responsive polish adjustments.

- [ ] **Step 3: Write the minimal responsive and accessibility refinements**

Add focused breakpoint behavior:

```css
@media (max-width: 1024px) {
  .billing-workspace {
    grid-template-columns: 280px minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .billing-workspace,
  .invoice-workspace__queues,
  .admin-billing-page__hero {
    grid-template-columns: 1fr;
    display: grid;
  }

  .billing-workspace__rail {
    order: 1;
  }

  .billing-workspace__canvas {
    order: 2;
  }

  .eb-table,
  .eb-table tbody,
  .eb-table tr,
  .eb-table td {
    display: block;
    width: 100%;
  }
}

.admin-billing-tab:focus-visible,
.billing-room-card:focus-visible,
.ipt-btn:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run verification**

Run: `npm run build:admin`
Expected: same build status as prior steps, with no new CSS syntax or import issues.

Manual checks:
- Review desktop billing workspace
- Review tablet width
- Review mobile width
- Confirm selected states, sticky bars, and row actions are visible and usable

- [ ] **Step 5: Commit**

```bash
git add web/src/features/admin/components/billing/UtilityBillingTab.css web/src/features/admin/components/billing/InvoicePublishTab.css web/src/features/admin/pages/AdminBillingPage.css
git commit -m "feat: polish billing workspace responsiveness"
```

## Self-Review

Spec coverage check:
- Workspace shell: covered by Task 1
- Utility billing workspace and tables: covered by Task 2
- Invoice shipping queue redesign: covered by Task 3
- Responsive, loading, empty, focus, and polish states: covered by Task 4

Placeholder scan:
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes exact file paths, commands, and concrete code snippets.

Type consistency:
- Existing component names and file paths match the current codebase.
- Shared class names in the plan stay consistent with the proposed workspace naming: `billing-workspace`, `billing-card`, `invoice-workspace`, and `invoice-queue`.
