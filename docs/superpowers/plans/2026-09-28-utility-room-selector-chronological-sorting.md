# Utility Room Selector Chronological Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Newest to Oldest" and "Oldest to Newest" chronological date sorting to the Utility Billing Room Selector (`UtilityRoomSelector.jsx` and `UtilityBillingTab.jsx`) across Electricity and Water tabs, sorting by latest utility activity with a safe fallback to room creation.

**Architecture:** 
1. Enrich room diagnostic objects in `server/utils/utilityDiagnostics.js` with `createdAt`, `updatedAt`, and `floor` fields.
2. Extend `UtilityRoomSelector.jsx` with a dedicated full-width `sortOrder` dropdown (`Default (Room Number)`, `Newest to Oldest`, `Oldest to Newest`) below the existing Floor and Status dropdowns, wired to a reset handler.
3. Add `roomSortOrder` state and update `filteredRooms` in `UtilityBillingTab.jsx` with a robust chronological comparator that sorts by latest utility activity (active cycle start date, latest period date, target close date, room creation), safely placing rooms with missing dates at the bottom in both sort directions.
4. Add comprehensive automated tests in `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs` verifying UI options and behavioral sorting logic.

**Tech Stack:** React 19, Vite, Node.js Test Runner (`node:test`), Tailwind CSS, Express / MongoDB (Mongoose).

**Spec:** User answers from interactive interview:
1. Criteria: Latest utility activity date (active cycle / reading / closed bill), falling back to room creation.
2. Layout: Dedicated row below All Floors and All Status (full width to prevent clipping in 320px sidebar).
3. Default: Default Room Order (numerical room number order 201, 202, 203... by default).

## Global Constraints
- Strict Terminology Invariants: Always use **"Tenant"** (never "Resident"), **"Rent"**, **"Assistant"**, **"Owner"**.
- Design System: Flat solid HSL tokens, 1px neutral borders (`border-border`), strictly **NO gradients**, no colored outlines on badges.
- TDZ Prevention: All hooks and helper variables declared before JSX referencing.
- Boundary Safety: Non-finite or missing dates must always sort to the bottom without `NaN` or runtime crashes.

---

## What to Expect from These Changes

### Visual & Layout Changes:
- **Dedicated Sort Dropdown**: A clean select dropdown placed below `All Floors` and `All Status` with options:
  - `Sort: Default (Room Number)`
  - `Sort: Newest to Oldest`
  - `Sort: Oldest to Newest`
- **Reset Button**: Clicking the existing "Reset" button in the Room Selector header resets the sort order to `Default (Room Number)` while clearing the search box and floor/status filters.
- **Visual Ergonomics**: Matches existing inputs with neutral 1px borders (`border-border`), card background (`bg-card`), and focus rings.

### Functional Outcomes:
- **Electricity & Water Support**: Both utility tabs inherit the room sorting seamlessly.
- **Natural Default**: Opening the page keeps rooms in their standard room number order (201, 202, 203...).
- **Dynamic Sorting**: Switching to "Newest to Oldest" immediately brings rooms with active utility cycles, recent readings, or newly generated periods to the top.
- **Pagination Reset**: Switching the sort order automatically resets room pagination to Page 1 and ensures the selected room remains valid.

---

## File Structure

| File | Action | Purpose |
| :--- | :--- | :--- |
| `server/utils/utilityDiagnostics.js` | Modify | Select `createdAt`, `updatedAt`, `floor` on `Room.find()` and pass to diagnostic objects |
| `web/src/features/admin/components/billing/utility/UtilityRoomSelector.jsx` | Modify | Add `sortOrder` prop, Sort dropdown below floors/status, and wire into `hasActiveFilters` / `handleResetFilters` |
| `web/src/features/admin/components/billing/UtilityBillingTab.jsx` | Modify | Add `roomSortOrder` state, implement chronological comparator in `filteredRooms`, wire to `UtilityRoomSelector` |
| `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs` | Create | Unit test suite for component contracts and sorting comparator logic |

---

## Tasks

### Task 1: Backend Diagnostic Attributes Enrichment

**Files:**
- Modify: `server/utils/utilityDiagnostics.js:385-480`
- Test: `server/utils/utilityDiagnostics.test.js`

**Interfaces:**
- Consumes: `Room.find(roomFilter)` query
- Produces: `createdAt`, `updatedAt`, `floor` properties on room diagnostic objects

- [ ] **Step 1: Inspect existing test coverage**
Run in `Capstone-Website/server`:
```powershell
npm test -- utils/utilityDiagnostics.test.js
```
Verify tests pass before modifying code.

- [ ] **Step 2: Update Room.find projection in `utilityDiagnostics.js`**
In `server/utils/utilityDiagnostics.js` around line 386:
```javascript
  const allRooms = await Room.find(roomFilter)
    .select("_id name roomNumber branch type capacity createdAt updatedAt floor")
    .lean();
```

- [ ] **Step 3: Include `createdAt`, `updatedAt`, `floor` in `buildRoomDiagnostic` return object**
In `server/utils/utilityDiagnostics.js` in `buildRoomDiagnostic`:
```javascript
    createdAt: room.createdAt || null,
    updatedAt: room.updatedAt || null,
    floor: room.floor != null ? String(room.floor) : null,
```

- [ ] **Step 4: Verify server diagnostics test**
Run:
```powershell
npm test -- utils/utilityDiagnostics.test.js
```
Expected: PASS

- [ ] **Step 5: Commit backend diagnostic update**
```bash
git add server/utils/utilityDiagnostics.js
git commit -m "feat(utility-billing): include room creation timestamps and floor in utility diagnostics"
```

---

### Task 2: UtilityRoomSelector UI & Props

**Files:**
- Modify: `web/src/features/admin/components/billing/utility/UtilityRoomSelector.jsx:16-150`
- Test: `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs`

**Interfaces:**
- Consumes: `sortOrder = "default"`, `onSortOrderChange`
- Produces: Sort dropdown in DOM with `Sort: Default (Room Number)`, `Sort: Newest to Oldest`, `Sort: Oldest to Newest`

- [ ] **Step 1: Write the failing unit test for `UtilityRoomSelector`**
Create `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs`:
```javascript
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const selectorCode = fs.readFileSync(
  path.resolve("src/features/admin/components/billing/utility/UtilityRoomSelector.jsx"),
  "utf8"
);

test("UtilityRoomSelector accepts sortOrder and renders sort dropdown", () => {
  assert.match(selectorCode, /sortOrder\s*=\s*["']default["']/);
  assert.match(selectorCode, /onSortOrderChange/);
  assert.match(selectorCode, /Sort:\s*Default\s*\(Room Number\)/);
  assert.match(selectorCode, /Sort:\s*Newest to Oldest/);
  assert.match(selectorCode, /Sort:\s*Oldest to Newest/);
  assert.match(selectorCode, /sortOrder\s*!==\s*["']default["']/);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run in `Capstone-Website/web`:
```powershell
node --test src/features/admin/components/billing/utilityRoomSorting.test.mjs
```
Expected: FAIL (regex does not match)

- [ ] **Step 3: Update `UtilityRoomSelector.jsx`**
1. Add `sortOrder = "default"`, `onSortOrderChange` to component parameters:
```javascript
export default function UtilityRoomSelector({
  rooms = [],
  filteredRooms = [],
  pagedRooms = [],
  selectedRoomId,
  onSelectRoom,
  sidebarSearch = "",
  onSearchChange,
  floorFilter = "all",
  onFloorFilterChange,
  availableFloors = [],
  roomStatusFilter = "all",
  onRoomStatusFilterChange,
  sortOrder = "default",
  onSortOrderChange,
  roomsPage = 1,
  totalRoomPages = 1,
  onPageChange,
  roomsLoading = false,
  utilityType = "electricity",
}) {
```

2. Update `hasActiveFilters` and `handleResetFilters`:
```javascript
  const hasActiveFilters =
    Boolean(sidebarSearch.trim()) ||
    floorFilter !== "all" ||
    roomStatusFilter !== "all" ||
    sortOrder !== "default";

  const handleResetFilters = () => {
    if (onSearchChange) onSearchChange("");
    if (onFloorFilterChange) onFloorFilterChange("all");
    if (onRoomStatusFilterChange) onRoomStatusFilterChange("all");
    if (onSortOrderChange) onSortOrderChange("default");
  };
```

3. Render the sort dropdown below the `grid-cols-2` floor/status container:
```jsx
      {/* Sort Order Dropdown */}
      <div className="relative">
        <select
          aria-label="Sort rooms"
          className="h-8 w-full appearance-none rounded-lg border border-border bg-card pl-2.5 pr-6 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 transition-all cursor-pointer"
          value={sortOrder}
          onChange={(e) => onSortOrderChange?.(e.target.value)}
        >
          <option value="default">Sort: Default (Room Number)</option>
          <option value="newest">Sort: Newest to Oldest</option>
          <option value="oldest">Sort: Oldest to Newest</option>
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
```

- [ ] **Step 4: Run test to verify it passes**
Run in `Capstone-Website/web`:
```powershell
node --test src/features/admin/components/billing/utilityRoomSorting.test.mjs
```
Expected: PASS

- [ ] **Step 5: Commit `UtilityRoomSelector` changes**
```bash
git add web/src/features/admin/components/billing/utility/UtilityRoomSelector.jsx web/src/features/admin/components/billing/utilityRoomSorting.test.mjs
git commit -m "feat(billing): add sort order dropdown to utility room selector"
```

---

### Task 3: UtilityBillingTab State & Chronological Sorting Logic

**Files:**
- Modify: `web/src/features/admin/components/billing/UtilityBillingTab.jsx:250-300, 1030-1065`
- Test: `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs`

**Interfaces:**
- Consumes: `rooms`, `sidebarSearch`, `floorFilter`, `roomStatusFilter`, `roomSortOrder`
- Produces: `filteredRooms` sorted chronologically based on latest utility activity, wired to `<UtilityRoomSelector>`

- [ ] **Step 1: Add behavioral sorting test cases to `utilityRoomSorting.test.mjs`**
Append to `web/src/features/admin/components/billing/utilityRoomSorting.test.mjs`:
```javascript
const tabCode = fs.readFileSync(
  path.resolve("src/features/admin/components/billing/UtilityBillingTab.jsx"),
  "utf8"
);

test("UtilityBillingTab maintains roomSortOrder state and passes to UtilityRoomSelector", () => {
  assert.match(tabCode, /const\s*\[roomSortOrder,\s*setRoomSortOrder\]\s*=\s*useState\(["']default["']\)/);
  assert.match(tabCode, /sortOrder=\{roomSortOrder\}/);
  assert.match(tabCode, /onSortOrderChange=\{/);
});

// Behavioral test for the sort comparator
const sortRooms = (roomList, order) => {
  if (order === "default") return roomList;
  return [...roomList].sort((a, b) => {
    const getRoomTimestamp = (room) => {
      const candidates = [
        room.activePeriod?.startDate,
        room.activePeriod?.createdAt,
        room.latestPeriod?.endDate,
        room.latestPeriod?.startDate,
        room.latestPeriod?.createdAt,
        room.targetCloseDate,
        room.createdAt,
        room.updatedAt,
      ];
      for (const val of candidates) {
        if (val) {
          const t = new Date(val).getTime();
          if (Number.isFinite(t) && t > 0) return t;
        }
      }
      if (room.id && typeof room.id === "string" && room.id.length === 24) {
        const hex = room.id.substring(0, 8);
        const sec = parseInt(hex, 16);
        if (Number.isFinite(sec) && sec > 0) return sec * 1000;
      }
      return null;
    };

    const timeA = getRoomTimestamp(a);
    const timeB = getRoomTimestamp(b);
    const hasA = timeA !== null;
    const hasB = timeB !== null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return order === "oldest" ? timeA - timeB : timeB - timeA;
  });
};

test("sortRooms preserves original order on default", () => {
  const rooms = [{ id: "201" }, { id: "202" }, { id: "203" }];
  const result = sortRooms(rooms, "default");
  assert.deepEqual(result.map(r => r.id), ["201", "202", "203"]);
});

test("sortRooms sorts newest to oldest by utility activity date", () => {
  const rooms = [
    { id: "201", latestPeriod: { endDate: "2026-02-01T00:00:00.000Z" } },
    { id: "202", activePeriod: { startDate: "2026-03-15T00:00:00.000Z" } },
    { id: "203", latestPeriod: { endDate: "2026-01-10T00:00:00.000Z" } },
  ];
  const result = sortRooms(rooms, "newest");
  assert.deepEqual(result.map(r => r.id), ["202", "201", "203"]);
});

test("sortRooms sorts oldest to newest by utility activity date", () => {
  const rooms = [
    { id: "201", latestPeriod: { endDate: "2026-02-01T00:00:00.000Z" } },
    { id: "202", activePeriod: { startDate: "2026-03-15T00:00:00.000Z" } },
    { id: "203", latestPeriod: { endDate: "2026-01-10T00:00:00.000Z" } },
  ];
  const result = sortRooms(rooms, "oldest");
  assert.deepEqual(result.map(r => r.id), ["203", "201", "202"]);
});

test("sortRooms places rooms without dates at the bottom in both directions", () => {
  const rooms = [
    { id: "dated-1", activePeriod: { startDate: "2026-02-01T00:00:00.000Z" } },
    { id: "nodate-1" },
    { id: "dated-2", activePeriod: { startDate: "2026-03-01T00:00:00.000Z" } },
  ];
  const newest = sortRooms(rooms, "newest");
  assert.equal(newest[0].id, "dated-2");
  assert.equal(newest[1].id, "dated-1");
  assert.equal(newest[2].id, "nodate-1");

  const oldest = sortRooms(rooms, "oldest");
  assert.equal(oldest[0].id, "dated-1");
  assert.equal(oldest[1].id, "dated-2");
  assert.equal(oldest[2].id, "nodate-1");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run:
```powershell
node --test src/features/admin/components/billing/utilityRoomSorting.test.mjs
```
Expected: FAIL (assertion on `roomSortOrder` in `UtilityBillingTab.jsx` fails)

- [ ] **Step 3: Update `UtilityBillingTab.jsx`**
1. Add state in `UtilityBillingTab`:
```javascript
  const [roomSortOrder, setRoomSortOrder] = useState("default"); // default | newest | oldest
```

2. Update `filteredRooms` `useMemo`:
```javascript
  const filteredRooms = useMemo(() => {
    const list = rooms.filter((r) => {
      const q = sidebarSearch.trim().toLowerCase();
      if (q) {
        const name = String(r.name || r.roomNumber || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (floorFilter !== "all" && getRoomFloor(r) !== floorFilter) {
        return false;
      }
      if (roomStatusFilter === "occupied") {
        const hasTenants = Boolean(r.hasActiveTenants || (r.activeTenantCount && r.activeTenantCount > 0));
        if (!hasTenants) return false;
      }
      if (roomStatusFilter === "vacant") {
        const hasTenants = Boolean(r.hasActiveTenants || (r.activeTenantCount && r.activeTenantCount > 0));
        if (hasTenants) return false;
      }
      return true;
    });

    if (roomSortOrder === "default") {
      return list;
    }

    return [...list].sort((a, b) => {
      const getRoomTimestamp = (room) => {
        const candidates = [
          room.activePeriod?.startDate,
          room.activePeriod?.createdAt,
          room.latestPeriod?.endDate,
          room.latestPeriod?.startDate,
          room.latestPeriod?.createdAt,
          room.targetCloseDate,
          room.createdAt,
          room.updatedAt,
        ];
        for (const val of candidates) {
          if (val) {
            const t = new Date(val).getTime();
            if (Number.isFinite(t) && t > 0) return t;
          }
        }
        if (room.id && typeof room.id === "string" && room.id.length === 24) {
          const hex = room.id.substring(0, 8);
          const sec = parseInt(hex, 16);
          if (Number.isFinite(sec) && sec > 0) return sec * 1000;
        }
        return null;
      };

      const timeA = getRoomTimestamp(a);
      const timeB = getRoomTimestamp(b);
      const hasA = timeA !== null;
      const hasB = timeB !== null;
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      return roomSortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    });
  }, [rooms, sidebarSearch, floorFilter, roomStatusFilter, roomSortOrder]);
```

3. Pass props to `<UtilityRoomSelector>`:
```jsx
        <UtilityRoomSelector
          rooms={rooms}
          filteredRooms={filteredRooms}
          pagedRooms={pagedRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(id) => {
            setSelectedRoomId(id);
            setPeriodsPage(1);
            setTimelinePage(1);
          }}
          sidebarSearch={sidebarSearch}
          onSearchChange={(val) => {
            setSidebarSearch(val);
            setRoomsPage(1);
          }}
          floorFilter={floorFilter}
          onFloorFilterChange={(fl) => {
            setFloorFilter(fl);
            setRoomsPage(1);
          }}
          availableFloors={availableFloors}
          roomStatusFilter={roomStatusFilter}
          onRoomStatusFilterChange={(st) => {
            setRoomStatusFilter(st);
            setRoomsPage(1);
          }}
          sortOrder={roomSortOrder}
          onSortOrderChange={(val) => {
            setRoomSortOrder(val);
            setRoomsPage(1);
          }}
          roomsPage={roomsPage}
          totalRoomPages={totalRoomPages}
          onPageChange={setRoomsPage}
          roomsLoading={roomsLoading}
          utilityType={utilityType}
        />
```

- [ ] **Step 4: Run test to verify it passes**
Run in `Capstone-Website/web`:
```powershell
node --test src/features/admin/components/billing/utilityRoomSorting.test.mjs
```
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit `UtilityBillingTab` changes**
```bash
git add web/src/features/admin/components/billing/UtilityBillingTab.jsx web/src/features/admin/components/billing/utilityRoomSorting.test.mjs
git commit -m "feat(billing): wire roomSortOrder state and chronological comparator to utility billing workspace"
```

---

### Task 4: Full System Verification & Production Build

**Files:**
- Test: All web unit tests and production build

- [ ] **Step 1: Run all unit tests**
In `Capstone-Website/web`:
```powershell
npm test
```
Expected: PASS with 0 failures.

- [ ] **Step 2: Run production build check**
In `Capstone-Website/web`:
```powershell
npm run build
```
Expected: `✓ built in ...` with 0 bundling errors.

- [ ] **Step 3: Commit plan and final test adjustments**
```bash
git add docs/superpowers/plans/2026-09-28-utility-room-selector-chronological-sorting.md
git commit -m "docs: add utility room selector chronological sorting implementation plan"
```
