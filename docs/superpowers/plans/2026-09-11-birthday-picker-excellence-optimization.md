# Tenant Birthday Picker & Date Component Excellence (>95% Optimization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate all audit dimensions of the Tenant Date of Birth selector and date inputs to >95% excellence across Correctness (98%), Accessibility (98%), UI/UX Ergonomics (96%), Maintainability (98%), and Empirical Verification (100%).

**Architecture:** Refactor date parsing to use local date components avoiding UTC offset drift in Asia/Manila timezone, implement full programmatic WCAG 2.2 accessibility wiring (`<label htmlFor>`, `aria-describedby`, `aria-invalid`, `aria-live="polite"`, 28×28px touch targets), eliminate vestigial dead code across the profile and reservation flow, and introduce rigorous unit tests to verify 100% regression immunity.

**Tech Stack:** React 19, Vite, Tailwind CSS, Lucide React, Node.js Test Runner (`node:test`, `node:assert/strict`).

**Spec:** Code review remediation from review audit (`46fadcdf..18a23dde`).

## Global Constraints
- Strictly follow Lilycrest DMS color semantics: solid flat HSL colors, strictly no gradients, clean 1px neutral borders.
- Preserve terminology invariant: Always use "Tenant", never "Resident".
- Maintain full non-destructive behavior across all profile viewing and editing operations.
- Ensure all automated unit tests pass (`npm test`) and `npm run build` compiles with 0 errors.

---

## User Review Required

> [!IMPORTANT]
> **Key Enhancements in this Plan**:
> 1. **Timezone Shift Protection**: Extract local date parts instead of `.toISOString().slice(0, 10)` to eliminate UTC day-shifting bugs for users in the Philippines (UTC+8).
> 2. **Full Screen Reader & WCAG AAA Accessibility**: Programmatically associate the `<label>` with `<input id="profileDateOfBirthInput">`, add `aria-describedby`, `aria-invalid`, `role="alert" aria-live="polite"`, and increase interactive touch targets to 28×28px.
> 3. **Dead Code Elimination**: Cleanly remove dead vestigial exports and obsolete reservation helper functions left over from the old 3-dropdown selector.

---

## What to Expect from These Changes

When these changes are implemented:
1. **Visual Appearance**:
   - The Date of Birth field will look crisp, polished, and balanced.
   - The clear (`X`) and calendar buttons will be slightly larger (28×28px), with comfortable spacing from the right border and text, featuring a subtle hover highlight and smooth click animation (`active:scale-95`).
   - The label will be clickable—clicking "Date of Birth" will instantly focus the input.
2. **Functional Behavior**:
   - Selecting a date on any device or in any timezone will never accidentally shift back by one day due to UTC time conversions.
   - Typing or picking dates will immediately update validation without lag or visual jitter.
   - Screen readers will announce the field name, its helper constraints ("Must be at least 18 years old"), and any error messages dynamically.
3. **Performance & Cleanliness**:
   - Dead boilerplate code in both `PersonalDetailsTab.jsx` and `PersonalInfoSection.jsx` will be purged, shrinking bundle size and improving code maintainability.

---

## Proposed Changes

### Component 1: Tenant Profile & Date Picker (`web/src/features/tenant/components/profile`)

#### [MODIFY] [PersonalDetailsTab.jsx](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/tenant/components/profile/PersonalDetailsTab.jsx)
- **Timezone-Safe Parsing**:
  Update `rawDateValue` to extract local year, month, and date rather than calling `.toISOString()`.
- **Label Association**:
  Change `<span style={s.fieldLabel}>{label}</span>` to `<label htmlFor="profileDateOfBirthInput" style={s.fieldLabel}>{label}</label>`.
- **ARIA & Assistive Attributes**:
  Add `aria-describedby={hasError ? "profileDobError" : "profileDobHelper"}`, `aria-invalid={!!hasError}`, and `role="alert" aria-live="polite"` on error feedback.
  Add `aria-label="Clear selected date of birth"` and `aria-label="Open calendar picker for date of birth"` with `aria-haspopup="dialog"`.
- **Target Size & Spacing**:
  Increase button size to `minWidth: "28px"`, `minHeight: "28px"`, padding `4px`.
  Increase input right padding to `rawDateValue ? 74 : 42`.
- **Dead Code Removal**:
  Remove unused re-exports `MONTH_OPTIONS`, `getDaysInMonth`, and `buildYearOptions`.

#### [MODIFY] [PersonalDetailsTab.validation.test.mjs](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs)
- Add tests verifying:
  - Local timezone extraction in `rawDateValue`
  - Programmatic label association (`htmlFor="profileDateOfBirthInput"`)
  - ARIA attributes (`aria-describedby`, `aria-invalid`, `role="alert"`)
  - Touch target dimensions (>= 28px)
  - Removal of dead re-exports

---

### Component 2: Reservation Step Personal Information (`web/src/features/tenant/pages/reservation-steps/components`)

#### [MODIFY] [PersonalInfoSection.jsx](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/tenant/pages/reservation-steps/components/PersonalInfoSection.jsx)
- Remove unused obsolete helper lines 21-63 (`MONTH_OPTIONS`, `pad2`, `parseDateParts`, `getDaysInMonth`, `composeDate`, `buildYearOptions`) to eliminate duplicate dead code.

---

## Task Structure

### Task 1: Timezone Resilience & Correctness Hardening (Target: 98% Correctness)

**Files:**
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx:695-725`
- Test: `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`

- [ ] **Step 1: Write failing test asserting local date component extraction and minDate arithmetic**
- [ ] **Step 2: Run test to confirm failure**
- [ ] **Step 3: Implement local date extraction and minDate arithmetic in `PersonalDetailsTab.jsx`**
- [ ] **Step 4: Run test to confirm pass**
- [ ] **Step 5: Commit changes**

### Task 2: WCAG 2.2 Accessibility & Ergonomics Expansion (Target: 98% Accessibility, 96% Ergonomics)

**Files:**
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx:433-455, 725-820`
- Test: `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`

- [ ] **Step 1: Write failing test asserting label `htmlFor`, ARIA describedby, live region, and 28px touch targets**
- [ ] **Step 2: Run test to confirm failure**
- [ ] **Step 3: Update `PersonalDetailsTab.jsx` with full accessible attributes, 28px targets, and active micro-transitions**
- [ ] **Step 4: Run test to confirm pass**
- [ ] **Step 5: Commit changes**

### Task 3: Dead Code Elimination & Architecture Cleanliness (Target: 98% Maintainability)

**Files:**
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx:25-56`
- Modify: `web/src/features/tenant/pages/reservation-steps/components/PersonalInfoSection.jsx:21-63`
- Test: `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`

- [ ] **Step 1: Remove dead re-exports in `PersonalDetailsTab.jsx` and dead helpers in `PersonalInfoSection.jsx`**
- [ ] **Step 2: Run all unit tests to ensure zero external breakage**
- [ ] **Step 3: Commit changes**

### Task 4: Full Empirical Verification & Build Validation (Target: 100% Verification)

**Files:**
- Test: Entire suite across `web` and `server`

- [ ] **Step 1: Run full tenant test suite (`node --test web/src/features/tenant/**/*.test.mjs`)**
- [ ] **Step 2: Run production build (`npm run build` in `/web`)**
- [ ] **Step 3: Verify clean exit codes and 0 compiler warnings**

---

## Verification Plan

### Automated Tests
- `node web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`
- `node --test web/src/features/tenant/components/profile/*.test.mjs`
- `npm run build` (in `web/`)

### Manual Verification
- Verify clicking the "Date of Birth" label focuses the date input.
- Inspect button dimensions in DevTools to confirm `>= 28px × 28px`.
- Verify screen reader announces field name and dynamic error alerts.
- Check dark mode contrast and smooth hover/active scaling.
