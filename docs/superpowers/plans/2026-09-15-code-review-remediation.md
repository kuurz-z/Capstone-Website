# Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Resolve all code review issues across backend controllers, services, database occupancy management, and frontend components to ensure full schema alignment, object safety, and design token compliance.

**Architecture:** Update Stay.updateMany cascade operations to use canonical terminated status; introduce isPopulatedUser verification helper in oomsController.js; align DoubleDeckRoomCard.jsx status badges with g-transparent design tokens.

**Tech Stack:** Express.js, MongoDB/Mongoose, React, Vite.

**Spec:** [implementation_plan.md](file:///C:/Users/Adming/.gemini/antigravity/brain/ce01fedd-08d5-496a-a8e4-ed3934984021/implementation_plan.md)

## Global Constraints

- Strict Terminology: Always use Tenant (never Resident), Assistant (never Copilot).
- Design tokens: Strictly NO gradients, transparent status badge backgrounds (g-transparent) with a 1px neutral border (order-slate-200 dark:border-slate-700) and a colored status dot.
- Maintain backward compatibility with all mobile endpoints (/api/mobile/...).

---

### Task 1: Correct Stay Status Enum in Cascade Deletion

**Files:**
- Modify: Capstone-Website/server/controllers/usersController.js:1455-1465
- Modify: Capstone-Website/server/services/occupancy/occupancyManager.js:768-776
- Test: Capstone-Website/server/services/occupancy/stayTerminationCascade.test.js

**Interfaces:**
- Consumes: Stay model (STAY_STATUSES enum)
- Produces: Correct status: terminated in cascade deletion

- [ ] **Step 1: Write the failing unit test in stayTerminationCascade.test.js**
- [ ] **Step 2: Run test to verify it passes**
- [ ] **Step 3: Update usersController.js and occupancyManager.js**
- [ ] **Step 4: Run backend tests to verify**
- [ ] **Step 5: Commit**

---

### Task 2: Harden Populated User Object Verification in oomsController.js

**Files:**
- Modify: Capstone-Website/server/controllers/roomsController.js:220-230
- Test: Capstone-Website/server/controllers/roomsController.syncBedUser.test.js

**Interfaces:**
- Consumes: stayDoc.userId, stayDoc.tenantId, userMap
- Produces: Safe stayUser resolution ignoring raw ObjectId instances

- [ ] **Step 1: Write unit test in oomsController.syncBedUser.test.js**
- [ ] **Step 2: Run test to verify**
- [ ] **Step 3: Update oomsController.js**
- [ ] **Step 4: Run tests to verify**
- [ ] **Step 5: Commit**

---

### Task 3: Enforce g-transparent Design Tokens on Status Badges in DoubleDeckRoomCard.jsx

**Files:**
- Modify: Capstone-Website/web/src/features/admin/components/rooms/DoubleDeckRoomCard.jsx
- Test: Capstone-Website/web/src/features/admin/components/rooms/privateRoomOccupancyDisplay.test.mjs

**Interfaces:**
- Consumes: Room occupancy status
- Produces: Transparent status badges with 1px border and colored status dot

- [ ] **Step 1: Update test assertions in privateRoomOccupancyDisplay.test.mjs**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update DoubleDeckRoomCard.jsx**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Full-Suite Verification Gate

- [ ] **Step 1: Run all backend tests**
- [ ] **Step 2: Run all frontend tests**
- [ ] **Step 3: Run web production build**
