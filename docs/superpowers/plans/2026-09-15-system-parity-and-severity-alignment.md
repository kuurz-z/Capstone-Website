# System Parity, Alphanumeric Room Validation & Severity Color Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve complete end-to-end parity for alphanumeric room numbers across frontend modals and backend validation, harmonize audit severity chart colors with system real-world color objectives, and secure the maintenance data hook against stale state closure comparisons.

**Architecture:** 
1. Harmonize room number validation across both layers: update `RoomFormModal.jsx` (`isFormValid` and `validateForm()`) on the web client, and `createRoomSchema` and `updateRoomSchema` in `zodSchemas.js` on Express.js so room numbers like "202-A" are consistently validated up to 20 characters (`/^[a-zA-Z0-9-]+$/`).
2. Align `AUDIT_SEVERITY_COLORS` in `AnalyticsMonitoringTab.jsx` with Lilycrest DMS semantic color tokens (Rose for Critical, Orange for High, Amber for Warning, Sky for Informational).
3. Update `useMaintenanceData.js` to utilize a functional state updater `setSelectedRequestId((prev) => ...)` to ensure bulletproof React hook safety without stale closure references.

**Tech Stack:** React 19, Vite 5, Tailwind CSS, Express.js 4, Zod, Jest, Node.js Test Runner.

**Spec / Audit Evidence:** Verified via static code analysis, `npm run build`, `npm test` (1,172 tests passing), and line-by-line inspection of contract boundaries.

---

## What to Expect from These Changes

### 1. Visual Outcomes
- In the **Audit Logs Monitoring Tab** (`/admin/analytics` -> Monitoring tab), the Donut Chart for "Severity distribution" will show:
  - **Critical** events in **Rose / Red** (`#e11d48`), matching the status dots in the audit events table and the central "Critical" label.
  - **Warning** events in **Amber / Gold-Orange** (`#d97706`), matching the amber warning dots in the table.
  - **High** events in **Orange** (`#ea580c`).
  - **Info** events in **Sky / Blue** (`#0284c7`).
- There will no longer be visual dissonance between the table's red dots and the donut chart's slices.

### 2. Functional Outcomes
- In the **Room Management** screen (`/admin/rooms`), when creating or editing a room:
  - Administrators can enter alphanumeric room numbers with hyphens up to 20 characters (such as `"202-A"`, `"101-B"`, `"G1"`).
  - The "Create Room" / "Save Changes" button in `RoomFormModal` will remain enabled and functional.
  - The backend server will accept and successfully save the room without returning a 400 Bad Request error.
- In the **Maintenance Page** (`/admin/maintenance`):
  - Selecting and closing maintenance requests with URL query parameters will operate smoothly with zero stale closures or memory glitches.

### 3. Workflow Outcomes
- System validation will be 100% symmetric: whatever the web interface accepts, the backend server will also validate and store with identical rules and error messages.

---

## User Review Required

> [!IMPORTANT]
> **Alphanumeric Room Numbers:** The room number schema change expands validation from digits-only (`/^[0-9]+$/`, max 10 digits) to alphanumeric and hyphens (`/^[a-zA-Z0-9-]+$/`, max 20 characters). Existing numeric room numbers remain 100% valid; this strictly unlocks rooms like `202-A`, `PH-1`, and `G1`.

---

## 95%+ Confidence Verified Issues Matrix

| # | Finding | File & Line | Confidence | Severity | Concrete Proof / Root Cause |
|:---:|:---|:---|:---:|:---:|:---|
| 1 | **RoomFormModal Submit Disabled on Alphanumeric** | [`RoomFormModal.jsx:553, 767`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/components/rooms/RoomFormModal.jsx#L553) | **100%** | Critical | Lines 553 & 767 still enforce `/^[0-9]+$/`, disabling the submit button (`!isFormValid`) and blocking form submission whenever "202-A" is typed. |
| 2 | **Backend Zod Schema Rejection for Alphanumeric** | [`zodSchemas.js:106-107, 147-148`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/validation/zodSchemas.js#L106-L107) | **100%** | Critical | `createRoomSchema` and `updateRoomSchema` reject any room number with letters, throwing a 400 validation error when saving. |
| 3 | **Audit Severity Donut Color Semantic Conflict** | [`AnalyticsMonitoringTab.jsx:30-35`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/pages/AnalyticsMonitoringTab.jsx#L30-L35) | **98%** | Important | `critical: "#d4af37"` (gold) directly contradicts `getSeverityDot` (`bg-rose-500`) and the workspace Real-World Color Objectives. |
| 4 | **Stale State in Maintenance Hook Effect** | [`useMaintenanceData.js:145-149`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/pages/maintenance/hooks/useMaintenanceData.js#L145-L149) | **96%** | Important | `selectedRequestId` is compared inside `useEffect` without being in the dependency array, risking stale closure reads. |

---

## Proposed Changes

### Component 1: Server Validation & Parity Layer

#### [MODIFY] [`server/validation/zodSchemas.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/validation/zodSchemas.js)
- Update `createRoomSchema` and `updateRoomSchema`:
  - Increase `max` from 10 to 20 with message `"Room number cannot exceed 20 characters"`.
  - Update regex to `/^[a-zA-Z0-9-]+$/` with message `"Room number must contain letters, numbers, and hyphens only"`.

#### [MODIFY] [`server/tests/validateRequest.universal.test.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/tests/validateRequest.universal.test.js)
- Update test case on line 137 to verify that valid alphanumeric room numbers (e.g. `"202-A"`, `"G1"`) pass validation.
- Add test assertions for rejecting special characters (e.g. `"202@A!"`) and lengths > 20 characters.

---

### Component 2: Frontend Room Form Modal

#### [MODIFY] [`web/src/features/admin/components/rooms/RoomFormModal.jsx`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/components/rooms/RoomFormModal.jsx)
- Update `validateForm()` on lines 551-554:
  - Replace `LIMITS.ROOM_NUMBER_MAX digits` with `LIMITS.ROOM_NUMBER_MAX characters`.
  - Replace `/^[0-9]+$/` check with `/^[a-zA-Z0-9-]+$/` and message `"Room number must contain letters, numbers, and hyphens only"`.
- Update `isFormValid` on line 767:
  - Replace `/^[0-9]+$/.test(form.roomNumber.trim())` with `/^[a-zA-Z0-9-]+$/.test(form.roomNumber.trim())`.

---

### Component 3: Analytics Monitoring Donut Chart

#### [MODIFY] [`web/src/features/admin/pages/AnalyticsMonitoringTab.jsx`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/pages/AnalyticsMonitoringTab.jsx)
- Update `AUDIT_SEVERITY_COLORS`:
  - `critical`: Set to `#e11d48` (Rose / Red).
  - `high`: Set to `#ea580c` (Orange).
  - `warning`: Set to `#d97706` (Amber).
  - `info`: Set to `#0284c7` (Sky / Blue).

---

### Component 4: Maintenance Hook State Resilience

#### [MODIFY] [`web/src/features/admin/pages/maintenance/hooks/useMaintenanceData.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/pages/maintenance/hooks/useMaintenanceData.js)
- Update lines 145-149 inside `useEffect`:
  - Replace `if (urlRequestId && urlRequestId !== selectedRequestId) { setSelectedRequestId(urlRequestId); }`
  - With functional state updater:
    ```javascript
    if (urlRequestId) {
      setSelectedRequestId((prev) => (prev !== urlRequestId ? urlRequestId : prev));
    }
    ```

---

## Detailed Implementation Tasks

### Task 1: Backend Room Validation Parity
**Files:**
- Modify: `server/validation/zodSchemas.js:102-107, 143-149`
- Test: `server/tests/validateRequest.universal.test.js:136-153`

- [ ] **Step 1: Update the unit test in `validateRequest.universal.test.js` to assert alphanumeric support and symbol rejection:**
```javascript
it("accepts alphanumeric room numbers (e.g. 202-A, G1) and rejects invalid special symbols", () => {
  const validResult = createRoomSchema.safeParse({
    name: "Deluxe Suite",
    roomNumber: "202-A",
    branch: "gil-puyat",
    type: "private",
    capacity: 1,
    price: 5000,
  });
  expect(validResult.success).toBe(true);
  expect(validResult.data.roomNumber).toBe("202-A");

  const invalidResult = createRoomSchema.safeParse({
    name: "Deluxe Suite",
    roomNumber: "202@A!",
    branch: "gil-puyat",
    type: "private",
    capacity: 1,
    price: 5000,
  });
  expect(invalidResult.success).toBe(false);
  expect(
    invalidResult.error.issues.some((issue) =>
      issue.message.includes("Room number must contain letters, numbers, and hyphens only"),
    ),
  ).toBe(true);
});
```
- [ ] **Step 2: Run test to confirm it fails against existing regex:**
`npm test -- tests/validateRequest.universal.test.js`
Expected: FAIL (`Room number must contain numbers only`)
- [ ] **Step 3: Update `createRoomSchema` and `updateRoomSchema` in `server/validation/zodSchemas.js`:**
```javascript
roomNumber: z
  .string()
  .trim()
  .min(1, "Room number is required")
  .max(20, "Room number cannot exceed 20 characters")
  .regex(/^[a-zA-Z0-9-]+$/, "Room number must contain letters, numbers, and hyphens only"),
```
- [ ] **Step 4: Run test to verify it passes:**
`npm test -- tests/validateRequest.universal.test.js`
Expected: PASS

---

### Task 2: Frontend RoomFormModal Alphanumeric Unlocking
**Files:**
- Modify: `web/src/features/admin/components/rooms/RoomFormModal.jsx:551-554, 767`

- [ ] **Step 1: Update `validateForm()` in `RoomFormModal.jsx`:**
```javascript
    const trimmedNumber = form.roomNumber.trim();
    if (!trimmedNumber) {
      newErrors.roomNumber = "Room number is required";
    } else if (trimmedNumber.length > LIMITS.ROOM_NUMBER_MAX) {
      newErrors.roomNumber = `Room number cannot exceed ${LIMITS.ROOM_NUMBER_MAX} characters`;
    } else if (!/^[a-zA-Z0-9-]+$/.test(trimmedNumber)) {
      newErrors.roomNumber = "Room number must contain letters, numbers, and hyphens only";
    } else if (isRoomNumberDuplicate(allRooms, form.branch, trimmedNumber, room?._id)) {
      newErrors.roomNumber = `Room number ${trimmedNumber} already exists in ${branchLabel}`;
    }
```
- [ ] **Step 2: Update `isFormValid` in `RoomFormModal.jsx` line 767:**
```javascript
    form.roomNumber.trim().length >= LIMITS.ROOM_NUMBER_MIN &&
    form.roomNumber.trim().length <= LIMITS.ROOM_NUMBER_MAX &&
    /^[a-zA-Z0-9-]+$/.test(form.roomNumber.trim()) &&
    !isDuplicateNumber &&
```
- [ ] **Step 3: Run web tests to confirm no regressions:**
`npm test` in `/web`

---

### Task 3: Audit Severity Donut Chart Semantic Color Alignment
**Files:**
- Modify: `web/src/features/admin/pages/AnalyticsMonitoringTab.jsx:30-35`

- [ ] **Step 1: Update `AUDIT_SEVERITY_COLORS` in `AnalyticsMonitoringTab.jsx`:**
```javascript
const AUDIT_SEVERITY_COLORS = {
  info: "#0284c7",     // Sky / Blue
  warning: "#d97706",  // Amber / Warning
  high: "#ea580c",     // Orange / High
  critical: "#e11d48", // Rose / Red
};
```
- [ ] **Step 2: Run web build to verify clean bundling:**
`npm run build` in `/web`

---

### Task 4: Maintenance Hook State Synchronization
**Files:**
- Modify: `web/src/features/admin/pages/maintenance/hooks/useMaintenanceData.js:145-149`

- [ ] **Step 1: Replace closure comparison with functional updater in `useMaintenanceData.js`:**
```javascript
    const urlRequestId = searchParams.get("requestId");
    if (urlRequestId) {
      setSelectedRequestId((prev) => (prev !== urlRequestId ? urlRequestId : prev));
    }
```
- [ ] **Step 2: Run web tests to verify maintenance data hook stability:**
`npm test` in `/web`

---

## Verification Plan

### Automated Verification
1. **Server Unit Tests:**
   - Command: `npm test -- tests/validateRequest.universal.test.js` in `/server`
   - Target: All room validation tests pass with alphanumeric and hyphen support.
2. **Web Test Suite:**
   - Command: `npm test` in `/web`
   - Target: 1,172 tests pass without regressions.
3. **Web Production Build:**
   - Command: `npm run build` in `/web`
   - Target: Vite builds cleanly with 0 errors.

### Manual Verification
1. **Alphanumeric Room Creation:**
   - Open `/admin/rooms` -> click "+ Add Room".
   - Type Room Name: `"Deluxe 202-A"`, Room Number: `"202-A"`, Type: `"Private"`, Floor: `2`.
   - Verify the submit button remains enabled and clickable.
   - Click "Create Room" and observe successful creation and toast notification.
2. **Audit Severity Chart:**
   - Navigate to `/admin/analytics` -> "Monitoring" tab.
   - Verify the "Severity distribution" Donut Chart displays "Critical" slices in Rose/Red and "Warning" slices in Amber.
