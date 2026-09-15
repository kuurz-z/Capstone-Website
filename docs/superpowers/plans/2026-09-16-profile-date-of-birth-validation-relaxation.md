# Profile & Birthday Minimum Age Validation (15+) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower the minimum age validation requirement from 18 to 15 across the Tenant Profile and Reservation Application flow so student tenants (ages 15–17, such as Senior High School and college students) can enter and save their real birth dates without validation errors.

**Architecture:** Update the date-of-birth validation logic, calendar picker range cutoffs (`maxDate`), UI helper texts, and error strings across frontend components, validation helper utilities, and backend Express validation middleware.

**Tech Stack:** React 19 (Vite), JavaScript / ES Modules, Express.js, Jest, Node.js Test Runner.

**Spec:** User reported being unable to save profile changes with birth date `11 Sep 2008` due to strict "Must be at least 18 years old" check.

## Global Constraints
- Use "Tenant" exclusively across all copywriting.
- Maintain solid HSL token design without gradients.
- Keep frontend and backend validation rules in 100% parity.
- Minimum age threshold: **15 years old** (allows Senior High School Grades 11-12 and university freshmen).

---

## What to Expect from These Changes
- **Accurate Real Birthdays Allowed**: Tenants who are 15, 16, or 17 years old will be able to enter and save their real date of birth without being forced to change it or fake their age.
- **Updated Helper Text & Guidance**: The helper text beneath the Date of Birth field will reflect the new student-friendly minimum age (`Must be at least 15 years old`).
- **Smooth Calendar Picker Range**: The date picker popup will allow selecting years up to 15 years ago (instead of blocking all dates after 18 years ago).
- **Consistent Backend & Frontend Protection**: Both the frontend form validation and backend Express API middleware will stay in perfect sync so saving profile changes never gets rejected with unexpected errors.

---

### Task 1: Backend Profile Update Validation Middleware & Unit Tests

**Files:**
- Modify: `server/middleware/validation.js:555-575`
- Modify: `server/middleware/validation.profile.test.js:55-75`

**Interfaces:**
- Consumes: `body.dateOfBirth` string / Date object
- Produces: `validateProfileUpdateInput(body)` returning `{ isValid: boolean, errors: string[], data: object }`

- [ ] **Step 1: Update the unit test in `server/middleware/validation.profile.test.js` to expect age >= 15**

```javascript
  it("enforces date of birth constraints (minimum 15 years old, max 100 years)", () => {
    const currentYear = new Date().getFullYear();
    const futureDate = validateProfileUpdateInput({ dateOfBirth: `${currentYear + 2}-01-01` });
    expect(futureDate.isValid).toBe(false);
    expect(futureDate.errors[0]).toMatch(/cannot be in the future/i);

    const under15 = validateProfileUpdateInput({ dateOfBirth: `${currentYear - 10}-01-01` });
    expect(under15.isValid).toBe(false);
    expect(under15.errors[0]).toMatch(/at least 15 years old/i);

    const over100 = validateProfileUpdateInput({ dateOfBirth: `${currentYear - 110}-01-01` });
    expect(over100.isValid).toBe(false);
    expect(over100.errors[0]).toMatch(/within the last 100 years/i);

    const validStudentAge = validateProfileUpdateInput({ dateOfBirth: `${currentYear - 16}-01-01` });
    expect(validStudentAge.isValid).toBe(true);
    expect(validStudentAge.errors).toHaveLength(0);

    const validDob = validateProfileUpdateInput({ dateOfBirth: `${currentYear - 22}-01-01` });
    expect(validDob.isValid).toBe(true);
    expect(validDob.errors).toHaveLength(0);
  });
```

- [ ] **Step 2: Run test to verify failure on new assertion**

Run: `npm test -- middleware/validation.profile.test.js` (in `Capstone-Website/server`)
Expected: FAIL due to age < 18 error vs at least 15 years old expectation.

- [ ] **Step 3: Update `server/middleware/validation.js` dateOfBirth check to age < 15**

```javascript
        if (dob > today) {
          errors.push("Date of birth cannot be in the future");
        } else if (age < 15) {
          errors.push("Must be at least 15 years old");
        } else if (age > 100) {
          errors.push("Date of birth must be within the last 100 years");
        } else {
          data.dateOfBirth = dob;
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- middleware/validation.profile.test.js` (in `Capstone-Website/server`)
Expected: PASS (6 tests passing).

---

### Task 2: Frontend Profile Validation Utility & Unit Tests

**Files:**
- Modify: `web/src/features/tenant/components/profile/personalDetailsValidation.js:206-231`
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs:100-130`

**Interfaces:**
- Consumes: `validateField("dateOfBirth", strVal)`
- Produces: Returns `string | null` error message

- [ ] **Step 1: Update unit tests in `PersonalDetailsTab.validation.test.mjs`**

```javascript
test("validateField enforces date of birth constraints (minimum 15 years old)", () => {
  const currentYear = new Date().getFullYear();
  const minorYear = currentYear - 10;
  const validStudentYear = currentYear - 16;
  const adultYear = currentYear - 22;

  // Invalid date string
  assert.equal(validateField("dateOfBirth", "not-a-date"), "Complete date required (Month, Day, Year)");

  // Future date
  assert.equal(validateField("dateOfBirth", `${currentYear + 2}-01-01`), "Birth date cannot be in the future");

  // Under 15 years old (e.g. born 10 years ago)
  assert.equal(validateField("dateOfBirth", `${minorYear}-05-15`), "Must be at least 15 years old");

  // 15-17 years old student
  assert.equal(validateField("dateOfBirth", `${validStudentYear}-05-15`), null);

  // Exactly or over 18 years old
  assert.equal(validateField("dateOfBirth", `${adultYear}-01-01`), null);

  // Over 100 years old
  assert.equal(
    validateField("dateOfBirth", `${currentYear - 105}-01-01`),
    "Birth date must be within the last 100 years"
  );
});
```
And update the assertions around lines 295-315 from `18` to `15`:
```javascript
  assert.match(source, /Must be at least 15 years old/);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs` (in `Capstone-Website/web`)
Expected: FAIL on `Must be at least 15 years old`.

- [ ] **Step 3: Update `personalDetailsValidation.js`**

```javascript
    case "dateOfBirth": {
      if (!strVal) return null;
      const parts = parseDateParts(strVal);
      if (!parts.year || !parts.month || !parts.day) {
        return "Complete date required (Month, Day, Year)";
      }
      const dob = new Date(`${parts.year}-${parts.month}-${parts.day}`);
      if (isNaN(dob.getTime())) return "Invalid birth date";
      const today = new Date();
      if (dob > today) return "Birth date cannot be in the future";

      const currentYear = today.getFullYear();
      const birthYear = dob.getFullYear();
      let age = currentYear - birthYear;
      const monthDiff = today.getMonth() - dob.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < dob.getDate())
      ) {
        age--;
      }

      if (age < 15) return "Must be at least 15 years old";
      if (age > 100) return "Birth date must be within the last 100 years";
      return null;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs` (in `Capstone-Website/web`)
Expected: PASS (19 tests passing).

---

### Task 3: Personal Details Profile Tab UI Component (`PersonalDetailsTab.jsx`)

**Files:**
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx:707-717, 820-825`

**Interfaces:**
- Consumes: `editData.dateOfBirth`
- Produces: Date input with `min={minDate}` and `max={maxDate}` allowing dates up to 15 years ago, and updated helper text `"Must be at least 15 years old"`.

- [ ] **Step 1: Update `minDate`/`maxDate` calculation and helper text in `PersonalDetailsTab.jsx`**

```javascript
  const { minDate, maxDate } = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());
    const minCutoff = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
    const pad = (n) => String(n).padStart(2, "0");
    return {
      maxDate: `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`,
      minDate: `${minCutoff.getFullYear()}-${pad(minCutoff.getMonth() + 1)}-${pad(minCutoff.getDate())}`,
    };
  }, []);
```
And update line 822 helper text:
```jsx
            <div id="profileDobHelper" style={s.helperText}>
              Must be at least 15 years old
            </div>
```

- [ ] **Step 2: Verify `PersonalDetailsTab.validation.test.mjs` passes**

Run: `node src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs` (in `Capstone-Website/web`)
Expected: PASS.

---

### Task 4: Reservation Application Flow Validation & Consistency Pass

**Files:**
- Modify: `web/src/features/tenant/utils/reservationValidation.js:70-85`
- Modify: `web/src/features/tenant/pages/reservation-steps/applicationFormConstants.js:103-115`
- Modify: `server/controllers/reservations/reservationLifecycleController.js:1860`

**Interfaces:**
- Consumes: `validateBirthday(birthday)`
- Produces: Returns `{ valid: boolean, error?: string }`

- [ ] **Step 1: Update `validateBirthday` in `web/src/features/tenant/utils/reservationValidation.js`**

```javascript
  // Check if person is at least 15 years old
  let age = currentYear - birthYear;
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  if (age < 15) {
    return { valid: false, error: "Must be at least 15 years old" };
  }

  return { valid: true };
```

- [ ] **Step 2: Update `getDateConstraints` in `applicationFormConstants.js`**

```javascript
export function getDateConstraints() {
  const today = new Date();
  const birthdayMax = new Date(
    today.getFullYear() - 15,
    today.getMonth(),
    today.getDate(),
  );
  const birthdayMin = new Date(
    today.getFullYear() - 80,
    today.getMonth(),
    today.getDate(),
  );
  const { moveInMin, moveInMax } = getMoveInDateConstraints(today);
  return {
    birthdayMin: formatDateInputValue(birthdayMin),
    birthdayMax: formatDateInputValue(birthdayMax),
    moveInMin,
    moveInMax,
  };
}
```

- [ ] **Step 3: Update `reservationLifecycleController.js` missing field text**

```javascript
      if (!hasVal(effectiveBirthday)) missingRequired.push("birthday (applicant must be at least 15)");
```

---

### Task 5: Full Build & Regression Test Verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run server test suites**

Run: `npm test` (in `Capstone-Website/server`)
Expected: All backend unit and integration test suites pass.

- [ ] **Step 2: Run web unit test suites**

Run: `node src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs` (in `Capstone-Website/web`)
Run: `node src/features/tenant/utils/moveInDateValidation.test.mjs` (in `Capstone-Website/web`)
Expected: All unit tests pass.

- [ ] **Step 3: Run web production build**

Run: `npm run build` (in `Capstone-Website/web`)
Expected: Build passes with 0 errors.
