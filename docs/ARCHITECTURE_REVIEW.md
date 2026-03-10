# LILYCREST DORMITORY MANAGEMENT SYSTEM — LEVEL 3 ARCHITECTURE REVIEW

> **Review Date:** March 5, 2026  
> **Reviewer:** Senior Software Architect & Refactoring Specialist  
> **Stack:** React (Vite) + Node.js/Express + MongoDB + Firebase Auth

---

## Table of Contents

1. [System Architecture Summary](#1️⃣-system-architecture-summary)
2. [Architecture Issues Detected](#2️⃣-architecture-issues-detected)
3. [Safe Simplification Recommendations](#3️⃣-safe-simplification-recommendations)
4. [Suggested Clean Architecture Structure](#4️⃣-suggested-clean-architecture-structure)
5. [Module Completion Tracker](#5️⃣-module-completion-tracker)
6. [Technical Debt Report](#6️⃣-technical-debt-report)
7. [Priority Refactoring Roadmap](#7️⃣-priority-refactoring-roadmap)

---

## 1️⃣ SYSTEM ARCHITECTURE SUMMARY

**Overall Architecture Quality: 68/100 — Functional but has significant structural debt**

### Major Strengths

- **Well-documented codebase** — Nearly every file has comprehensive JSDoc headers, sectioned comments, and clear explanations of business rules. This is above average for a capstone project.
- **Solid authentication architecture** — Firebase Auth as SSO source of truth with MongoDB mirroring is a sound pattern. Token verification middleware is correct and well-structured.
- **Good MongoDB schema design** — Models have proper indexes, virtual fields, instance/static methods, soft-delete patterns, and branch isolation. The archive mixin in `server/models/archive/index.js` is particularly good.
- **Consistent error handling** — Backend controllers use structured error codes (`VALIDATION_ERROR`, `BRANCH_ACCESS_DENIED`, etc.), which makes client-side error handling predictable.
- **Branch-based data isolation** — Multi-branch logic is consistently enforced through middleware and query filters.
- **Audit logging** — Comprehensive audit trail via `AuditLogger` across all mutation operations.

### Major Weaknesses

- **Dual routing system (`routes/` + `api/`)** — The same endpoints exist in both `server/routes/` and `server/api/` directories. Only one set is mounted in `server.js` per resource, but the dead copies create confusion.
- **Missing service layer** — Business logic is embedded directly in controllers (especially the 1,153-line `reservationsController.js`).
- **Massive duplicated frontend files** — `SignIn.jsx` and `SignUp.jsx` are duplicated across `features/public/pages/` and `features/tenant/pages/` with ~80% shared logic.
- **Monster components** — `ProfilePage.jsx` (4,362 lines), `ReservationApplicationStep.jsx` (1,429 lines), and `SignUp.jsx` (1,069–1,336 lines) are unmaintainable.
- **Broken CSRF implementation** — The `csrf.js` middleware is effectively a no-op (detailed below).
- **Super Admin module is skeleton only** — All pages are 10-line stubs.

### Immediate Improvement Opportunities

1. Delete the unused `server/api/` directory (or consolidate into `server/routes/`)
2. Extract shared auth form logic from duplicated SignIn/SignUp files
3. Split the 4,362-line ProfilePage into sub-components
4. Fix the CSRF middleware or remove it honestly

---

## 2️⃣ ARCHITECTURE ISSUES DETECTED

### Issue #1 — Dual Route/API Directory (Dead Code)

**Location:** `server/api/` vs `server/routes/`

Both directories define routes for the same resources. In `server.js`, some resources use `routes/` (auth, users, rooms, reservations, inquiries, audit) while others use `api/` (billing, announcements, maintenance). The `api/` files for auth, reservations, rooms, users, and inquiries are **never mounted** — they are dead code.

**Why it's problematic:** Developers may edit the wrong file. The `api/auth.js` file lacks validation middleware that `routes/authRoutes.js` has, so if someone accidentally switches the import, registration validation disappears silently.

---

### Issue #2 — 1,153-Line Reservation Controller (God Controller)

**Location:** `server/controllers/reservationsController.js`

This file handles 11 exported functions covering reservation CRUD, occupancy management, slot release, archiving, and statistics. The `createReservation` function alone manually maps 40+ fields from `req.body` (lines 200-300). `updateReservationByUser` does the same with a repetitive `setField()` pattern.

**Why it's problematic:** Any change to reservation fields requires editing 3+ places (schema, create, user-update). High risk of field mismatches and bugs.

---

### Issue #3 — No Service Layer (Business Logic in Controllers)

**Location:** All controllers in `server/controllers/`

Controllers directly:

- Query the database
- Apply business rules (3-month window, occupancy calculations, role transitions)
- Handle error formatting
- Call audit logger

Example: `updateReservation` in `reservationsController.js` auto-promotes users to "tenant" role when checked-in (line ~440) — this is critical business logic buried in a route handler.

**Why it's problematic:** Business rules cannot be reused (e.g., if a scheduled job needs to check-in a user). Testing requires mocking Express req/res objects instead of testing pure functions.

---

### Issue #4 — Duplicated Authentication UI Components (~80% Overlap)

**Location:**

- `features/public/pages/SignIn.jsx` (715 lines) vs `features/tenant/pages/SignIn.jsx` (679 lines)
- `features/public/pages/SignUp.jsx` (1,069 lines) vs `features/tenant/pages/SignUp.jsx` (1,336 lines)

Both versions share: `validateEmail`, `handleChange`, `validateField`, `isFormValid`, `handleEmailPasswordLogin`, `handleSocialLogin`, `handleGoogleLogin`, `handleFacebookLogin`, and all Firebase auth integration.

**Why it's problematic:** Bug fixes and feature additions must be applied in 2 places. Over time they diverge silently (e.g., public version has session lock redirect; tenant version doesn't).

---

### Issue #5 — 4,362-Line ProfilePage (Mega Component)

**Location:** `web/src/features/tenant/pages/ProfilePage.jsx`

At 4,362 lines, this is the largest file in the codebase by far. It likely contains profile display, edit forms, image upload, password change, settings, and possibly stay history — all in one component.

**Why it's problematic:** Impossible to code-review, slow IDE performance, high merge conflict risk, and React will re-render the entire tree on any state change.

---

### Issue #6 — Broken CSRF Middleware

**Location:** `server/middleware/csrf.js`

Three critical flaws:

1. **All authenticated requests bypass CSRF** — Any request with a `Bearer` token skips validation entirely (line ~80)
2. **Tokens are never stored server-side** — `generateCSRFToken()` creates a token and sends it in a response header but never saves it. Validation only checks the hex format, not whether the server issued it.
3. **Any 64-char hex string passes** — An attacker can generate a valid-looking CSRF token themselves.

**Why it's problematic:** This provides a false sense of security. The middleware is not imported or used in `server.js` currently, so it has no runtime effect — but if it were enabled, it would still not protect anything.

---

### Issue #7 — ReDoS Vulnerability in Username Lookup

**Location:** `server/controllers/usersController.js` — `getEmailByUsername`

```js
const user = await User.findOne({
  username: new RegExp(`^${trimmedUsername}$`, "i"),
});
```

User input is injected directly into `RegExp()` without escaping. A crafted username with regex special characters could cause catastrophic backtracking.

**Why it's problematic:** Denial of service via malicious input.

---

### Issue #8 — Monolithic API Client (701 Lines)

**Location:** `web/src/shared/api/apiClient.js`

This single file defines API objects for 9 different domains (auth, rooms, reservations, inquiries, users, audit, billing, announcements, maintenance). It also re-exports `authApi` that conflicts with the separate `authApi.js` file.

**Why it's problematic:** Any import of any API function loads the entire 701-line module. The duplicate `authApi` export creates confusion about which to import.

---

### Issue #9 — `motion` Package in Backend Dependencies

**Location:** `server/package.json` — `"motion": "^12.34.0"`

The `motion` (framer-motion) package is a **frontend animation library**. It has no purpose in a Node.js/Express backend.

**Why it's problematic:** Bloats `node_modules`, increases install time, potential supply chain risk.

---

### Issue #10 — Inconsistent Route Naming

Some routes use plural nouns consistently (`/api/reservations`, `/api/rooms`), but there's a file `server/routes/reservations.js` alongside `server/routes/reservationsRoutes.js` — two files for the same resource. Only `reservationsRoutes.js` is mounted.

---

## 3️⃣ SAFE SIMPLIFICATION RECOMMENDATIONS

### Recommendation 1 — Delete Unmounted `/api/` Route Files

**Risk: Very Low** | **Impact: High (clarity)**

Delete these unused files from `server/api/`:

- `auth.js` (superseded by `routes/authRoutes.js`)
- `reservations.js` (superseded by `routes/reservationsRoutes.js`)
- `rooms.js` (superseded by `routes/roomsRoutes.js`)
- `users.js` (superseded by `routes/usersRoutes.js`)
- `inquiries.js` (superseded by `routes/inquiriesRoutes.js`)

Move the 3 actively-used files (`billing.js`, `announcements.js`, `maintenance.js`) into `routes/` and rename them consistently (`billingRoutes.js`, `announcementsRoutes.js`, `maintenanceRoutes.js`).

---

### Recommendation 2 — Introduce a Service Layer (Incremental)

**Risk: Low** | **Impact: High**

Start with the `reservationsController.js`. Extract business logic into `server/services/reservationService.js`:

```
server/
  services/
    reservationService.js    ← business rules (create, confirm, check-in)
    occupancyService.js      ← already partially exists as occupancyManager.js
    billingService.js
    ...
```

**Step 1:** Move the field-mapping logic from `createReservation` into a `parseReservationInput(body)` function.  
**Step 2:** Move the status-transition side effects (user role promotion, occupancy updates) into `processReservationStatusChange(reservation, oldStatus, newStatus)`.  
**Step 3:** Controllers become thin wrappers: validate input → call service → format response.

---

### Recommendation 3 — Extract Shared Auth Form Logic

**Risk: Low** | **Impact: High**

Create `web/src/shared/hooks/useSignInForm.js` containing:

- `validateEmail`, `validateField`, `isFormValid`
- `handleEmailPasswordLogin`, `handleGoogleLogin`, `handleFacebookLogin`
- Form state management (`formData`, `errors`, `loading`)

Each `SignIn.jsx` variant then only contains the **UI/layout** and calls the shared hook. Same pattern for `useSignUpForm.js`.

---

### Recommendation 4 — Split ProfilePage into Sub-Components

**Risk: Low** | **Impact: High**

Break `ProfilePage.jsx` (4,362 lines) into:

```
features/tenant/components/profile/
  ProfileHeader.jsx          ← Avatar, name, branch badge
  ProfileInfoSection.jsx     ← Personal details display/edit
  ProfileImageUpload.jsx     ← Image upload logic
  PasswordChangeForm.jsx     ← Password change only
  StayHistorySection.jsx     ← Stay history table
  ProfilePage.jsx            ← Composition orchestrator (~200 lines)
```

---

### Recommendation 5 — Fix Username RegExp Injection

**Risk: Very Low** | **Impact: Medium (security)**

In `usersController.js`, replace:

```js
username: new RegExp(`^${trimmedUsername}$`, "i");
```

with:

```js
username: trimmedUsername.toLowerCase();
```

Since the User schema already has `lowercase: true` on the username field, a case-insensitive regex is unnecessary.

---

### Recommendation 6 — Split API Client into Domain Modules

**Risk: Low** | **Impact: Medium**

Split `apiClient.js` (701 lines) into:

```
shared/api/
  core.js              ← authFetch, publicFetch, getFreshToken (shared infra)
  authApi.js           ← already exists, consolidate
  roomApi.js
  reservationApi.js
  inquiryApi.js
  userApi.js
  auditApi.js
  billingApi.js
  announcementApi.js
  maintenanceApi.js
  index.js             ← re-exports all APIs
```

---

### Recommendation 7 — Remove `motion` from Backend Dependencies

**Risk: Zero** | **Impact: Low**

```bash
cd server && npm uninstall motion
```

---

### Recommendation 8 — Whitelist-Based Field Updates

Replace the 40+ line `setField()` repetition in `updateReservationByUser` with a whitelist approach:

```js
const ALLOWED_USER_FIELDS = ['firstName', 'lastName', 'mobileNumber', 'birthday', ...];
const updates = {};
for (const field of ALLOWED_USER_FIELDS) {
  if (req.body[field] !== undefined) updates[field] = req.body[field];
}
Object.assign(reservation, updates);
```

---

## 4️⃣ SUGGESTED CLEAN ARCHITECTURE STRUCTURE

### Backend (Recommended)

```
server/
├── config/
│   ├── database.js          ← MongoDB connection
│   ├── firebase.js          ← Firebase Admin SDK
│   └── email.js             ← Nodemailer transport
├── middleware/
│   ├── auth.js              ← Token verification, role guards
│   ├── branchAccess.js      ← Branch-based data isolation
│   └── validation.js        ← Input sanitization
├── models/
│   ├── User.js
│   ├── Room.js
│   ├── Reservation.js
│   ├── Bill.js
│   ├── Inquiry.js
│   ├── MaintenanceRequest.js
│   ├── Announcement.js
│   ├── AuditLog.js
│   └── index.js             ← Central export + constants
├── routes/                   ← SINGLE route directory (thin)
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── roomRoutes.js
│   ├── reservationRoutes.js
│   ├── inquiryRoutes.js
│   ├── billingRoutes.js
│   ├── announcementRoutes.js
│   ├── maintenanceRoutes.js
│   └── auditRoutes.js
├── controllers/              ← HTTP layer only (validate → delegate → respond)
│   ├── authController.js
│   ├── reservationsController.js
│   └── ... (same files, but thinner)
├── services/                 ← NEW: Business logic layer
│   ├── authService.js
│   ├── reservationService.js
│   ├── occupancyService.js
│   ├── billingService.js
│   ├── inquiryService.js
│   ├── maintenanceService.js
│   └── announcementService.js
├── utils/
│   ├── auditLogger.js
│   └── occupancyManager.js  ← Eventually merge into occupancyService.js
├── scripts/                  ← Admin/migration scripts (unchanged)
└── server.js
```

### Layer Responsibilities

| Layer           | Responsibility                                 | Accesses         |
| --------------- | ---------------------------------------------- | ---------------- |
| **Routes**      | HTTP method + URL mapping, middleware chain    | Controllers      |
| **Controllers** | Parse request, validate input, format response | Services         |
| **Services**    | Business rules, orchestration, transactions    | Models, Utils    |
| **Models**      | Schema definition, data access, queries        | MongoDB          |
| **Middleware**  | Auth, validation, branch filtering             | Firebase, Models |
| **Utils**       | Cross-cutting concerns (logging, email)        | Models           |

### Frontend (Recommended Adjustments)

```
web/src/
├── shared/
│   ├── api/
│   │   ├── core.js            ← authFetch, publicFetch
│   │   ├── authApi.js         ← Single source (remove duplicate)
│   │   ├── roomApi.js
│   │   ├── reservationApi.js
│   │   └── ... (one per domain)
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── FirebaseAuthContext.js
│   │   ├── useSignInForm.js   ← NEW: Shared sign-in logic
│   │   └── useSignUpForm.js   ← NEW: Shared sign-up logic
│   ├── components/
│   ├── guards/
│   └── layouts/
├── features/
│   ├── admin/
│   │   ├── components/
│   │   │   ├── reservations/  ← Split into sub-folders
│   │   │   ├── visits/
│   │   │   └── payments/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── services/
│   ├── tenant/
│   │   ├── components/
│   │   │   ├── profile/       ← NEW: Split from ProfilePage
│   │   │   └── reservation/
│   │   ├── hooks/
│   │   └── pages/
│   └── public/
```

---

## 5️⃣ MODULE COMPLETION TRACKER

### Module 1 — User & Access Management

| Area                    | Score   | Notes                                                        |
| ----------------------- | ------- | ------------------------------------------------------------ |
| Architecture Quality    | 82%     | Clean auth flow with Firebase, proper middleware separation  |
| Security Implementation | 70%     | Firebase tokens good; CSRF broken; ReDoS in username lookup  |
| Role Logic Structure    | 85%     | 4 clear roles with middleware guards, branch isolation works |
| **Overall Completion**  | **79%** | Core auth is solid, needs CSRF fix and input hardening       |

### Module 2 — Reservation, Tenant & Contract Management

| Area                   | Score   | Notes                                                        |
| ---------------------- | ------- | ------------------------------------------------------------ |
| Architecture Quality   | 60%     | 1,153-line god controller, no service layer                  |
| Logic Organization     | 55%     | 40+ manual field mappings, business rules in controllers     |
| Data Handling          | 75%     | Schema is well-designed with proper indexes, code generation |
| **Overall Completion** | **63%** | Functional but highest refactoring need                      |

### Module 3 — Room, Bed & Occupancy Management

| Area                   | Score   | Notes                                                   |
| ---------------------- | ------- | ------------------------------------------------------- |
| Architecture Quality   | 78%     | Clean Room model, occupancyManager utility exists       |
| Logic Organization     | 72%     | Occupancy tracking is correct but spread across 3 files |
| Data Handling          | 80%     | Good bed schema design with proper vacancy tracking     |
| **Overall Completion** | **77%** | Solid, mainly needs service consolidation               |

### Module 4 — Billing, Payments & Penalty Management

| Area                   | Score   | Notes                                                     |
| ---------------------- | ------- | --------------------------------------------------------- |
| Architecture Quality   | 70%     | Clean controller (161 lines), good Bill schema            |
| Logic Organization     | 65%     | Basic CRUD implemented, forecasting stubs present         |
| Data Handling          | 75%     | Good indexes, aggregation pipeline for revenue reports    |
| **Overall Completion** | **55%** | Core billing works, penalty/invoice generation incomplete |

### Module 5 — Maintenance, Announcements & Compliance

| Area                   | Score   | Notes                                               |
| ---------------------- | ------- | --------------------------------------------------- |
| Architecture Quality   | 75%     | Clean schemas with AI-ready metrics fields          |
| Logic Organization     | 70%     | Controllers are well-sized, proper branch isolation |
| Data Handling          | 80%     | Good indexes for analytics, completion stats        |
| **Overall Completion** | **72%** | Feature-complete for basic operations               |

### Module 6 — AI Reports, Analytics & System Administration

| Area                   | Score   | Notes                                       |
| ---------------------- | ------- | ------------------------------------------- |
| Architecture Quality   | 30%     | Super Admin pages are all 10-line stubs     |
| Logic Organization     | 25%     | No analytics implementation exists          |
| Data Handling          | 40%     | Schema fields for AI exist but no consumers |
| **Overall Completion** | **20%** | Schemas are prepared but module is skeletal |

### Module 7 — Chatbot / Predefined Inquiry System

| Area                   | Score   | Notes                                               |
| ---------------------- | ------- | --------------------------------------------------- |
| Architecture Quality   | 75%     | Inquiry model is well-designed with tags/priority   |
| Logic Organization     | 70%     | CRUD is solid, email response works                 |
| Data Handling          | 75%     | Good indexes, branch filtering                      |
| **Overall Completion** | **65%** | Basic inquiry management works; no chatbot AI layer |

---

## 6️⃣ TECHNICAL DEBT REPORT

### Architecture Debt

| Item                        | Severity | Description                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------- |
| Dual routes/api directories | Medium   | Creates confusion, risk of editing dead files                       |
| Missing service layer       | High     | Business logic coupled to Express req/res; untestable, non-reusable |
| Monolithic apiClient.js     | Medium   | 701-line kitchen-sink; tree-shaking doesn't help with runtime eval  |
| Duplicated auth components  | High     | 2x SignIn + 2x SignUp with ~80% shared code                         |

### Performance Risks

| Item                                         | Severity | Description                                                                                                                      |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ProfilePage.jsx (4,362 lines)                | High     | Entire component re-renders on any state change; massive bundle chunk                                                            |
| ReservationApplicationStep.jsx (1,429 lines) | Medium   | Similar re-render and bundle issues                                                                                              |
| N+1 queries in reservationsController        | Medium   | `getReservations` for admins first fetches all branch rooms, then queries reservations — could use a single aggregation pipeline |
| No pagination on several list endpoints      | Medium   | `getReservations` returns all matching without pagination limit                                                                  |
| 10MB body parser limit                       | Low      | Allows large payloads; proof of payment images should use dedicated upload service                                               |

### Maintainability Risks

| Item                              | Severity | Description                                                                                         |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| 40+ manual field mappings         | High     | In `createReservation` and `updateReservationByUser`; any schema change requires updating 3+ places |
| Excessive console.log statements  | Low      | Production-visible logs with emojis leak internal details                                           |
| Dead `reservations.js` in routes/ | Low      | Extra file alongside `reservationsRoutes.js`                                                        |
| Super Admin module is all stubs   | Medium   | If this is expected for release, it blocks a major feature vertical                                 |

### Scalability Risks

| Item                                  | Severity | Description                                                  |
| ------------------------------------- | -------- | ------------------------------------------------------------ |
| No rate limiting                      | High     | No express-rate-limit or similar. API is open to brute force |
| No request caching                    | Medium   | Room listings and stats are fetched fresh on every request   |
| Single-process Node.js                | Low      | No PM2/cluster config for production                         |
| No database connection pooling config | Low      | Default Mongoose settings may be insufficient under load     |

### Security Risks

| Item                                    | Severity | Description                                                                                                    |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Broken CSRF middleware                  | High     | Generates tokens that are never validated against a server store                                               |
| ReDoS in getEmailByUsername             | Medium   | User input used directly in `new RegExp()`                                                                     |
| No rate limiting on login               | High     | Brute force possible                                                                                           |
| Development error details in production | Low      | Error handler in server.js leaks `err.message` conditionally, but console.log everywhere leaks unconditionally |
| No helmet.js                            | Medium   | Missing security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)                                 |

---

## 7️⃣ PRIORITY REFACTORING ROADMAP

### Priority 1 — Security Hardening (Highest Impact, Low Risk)

- [ ] Fix ReDoS in `getEmailByUsername` → use exact match instead of RegExp
- [ ] Add `helmet` middleware to `server.js` for security headers
- [ ] Add `express-rate-limit` for auth endpoints (login/register)
- [ ] Either fix CSRF properly or remove the dead middleware file
- [ ] Remove `motion` from backend dependencies

**Estimated effort: 1-2 hours**

---

### Priority 2 — Eliminate Dead Code & Consolidate Routes (Clarity)

- [ ] Delete unmounted files in `server/api/` (auth, reservations, rooms, users, inquiries)
- [ ] Move `billing.js`, `announcements.js`, `maintenance.js` from `api/` to `routes/`
- [ ] Delete duplicate `server/routes/reservations.js` (keep `reservationsRoutes.js`)
- [ ] Update imports in `server.js`

**Estimated effort: 30 minutes**

---

### Priority 3 — Extract Shared Auth Form Logic (DRY)

- [ ] Create `useSignInForm.js` hook in `shared/hooks/`
- [ ] Create `useSignUpForm.js` hook in `shared/hooks/`
- [ ] Refactor both `SignIn.jsx` files to use the shared hook
- [ ] Refactor both `SignUp.jsx` files to use the shared hook

**Estimated effort: 4-6 hours**

---

### Priority 4 — Split Monster Components (Maintainability)

- [ ] Break `ProfilePage.jsx` (4,362 lines) into 5-7 sub-components
- [ ] Break `ReservationApplicationStep.jsx` (1,429 lines) into section components
- [ ] Break `VisitSchedulesTab.jsx` (1,100 lines) into sub-components
- [ ] Extract `ReservationsPage.jsx` (1,066 lines) table/filter logic into sub-components

**Estimated effort: 8-12 hours**

---

### Priority 5 — Introduce Service Layer (Architecture)

- [ ] Create `server/services/reservationService.js` — extract business rules from controller
- [ ] Create `parseReservationInput()` utility to replace 40+ manual field mappings
- [ ] Create `processStatusChange()` to centralize status transition side-effects
- [ ] Gradually extract services for auth, billing, maintenance

**Estimated effort: 6-10 hours**

---

### Priority 6 — Split Frontend API Client (Modularity)

- [ ] Extract `authFetch`/`publicFetch`/`getFreshToken` into `shared/api/core.js`
- [ ] Split each domain API into its own file
- [ ] Remove the duplicate `authApi` definition (keep one source)
- [ ] Create `shared/api/index.js` for clean re-exports

**Estimated effort: 2-3 hours**

---

### Priority 7 — Add Pagination to Unbounded Queries

- [ ] Add `limit` and `page` parameters to `getReservations`
- [ ] Optimize admin reservation query (replace N+1 rooms lookup with aggregation)
- [ ] Add cursor-based pagination for audit logs (high volume)

**Estimated effort: 3-4 hours**

---

## Summary

**Total estimated refactoring effort: ~26-38 hours**, spread across 7 priority tiers, all without breaking changes.

| Priority | Task                     | Effort | Risk     |
| -------- | ------------------------ | ------ | -------- |
| P1       | Security Hardening       | 1-2h   | Very Low |
| P2       | Dead Code Cleanup        | 30min  | Very Low |
| P3       | Shared Auth Hooks        | 4-6h   | Low      |
| P4       | Split Monster Components | 8-12h  | Low      |
| P5       | Service Layer            | 6-10h  | Low      |
| P6       | Split API Client         | 2-3h   | Low      |
| P7       | Pagination               | 3-4h   | Low      |
