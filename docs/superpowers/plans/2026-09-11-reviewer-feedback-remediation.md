# Reviewer Feedback & Bug Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs and performance bottlenecks identified in reviewer comments and aligned during the grill-me session: Chatbot front desk runtime crash, Profile date of birth state reset, Google sign-up duplicate prevention, manual sign-up phone persistence, and static image compression.

**Architecture:** 
- Frontend React component refactors using decoupled local state for compound date inputs (`PersonalDetailsTab.jsx`).
- API contract alignment in chatbot escalation (`ChatLeadEscalationForm.jsx` -> `chatbotApi.escalateChatbotLead`).
- Auth credential collision handling in `SignUp.jsx` directing Google accounts to Google Sign-In with pre-filled context.
- Static asset optimization compressing oversized raw camera assets (>2MB) to high-fidelity WebP without altering visual layouts.

**Tech Stack:** React 19, Vite, Firebase Auth, Express.js, MongoDB/Mongoose, Node.js Test Runner (`node --test`), WebP / Sharp image optimization.

**Spec:** Reviewer feedback comments + `/grill-me` alignment session decisions (no redesign of Available Rooms, Google sign-up keeps phone optional/empty, manual sign-up requires and persists phone).

## Global Constraints

- **Preserve Behavior**: Perform non-destructive updates. Preserve existing features, user flows, and utility functions.
- **Strictly No Gradients**: Solid HSL tokens only; zero background/text gradients.
- **Terminology Invariants**: Use "Tenant" (never "Resident"), "Rent" (never "Rental Fee"), "Intended Move-in Date".
- **Available Rooms Design**: Strictly **no changes** to room card dimensions, layout, or grid density.
- **Testing**: Every task must end with verified tests using `node --test` or `npm test`.

---

## File Structure & Responsibilities

| File Path | Responsibility |
| :--- | :--- |
| `web/src/features/public/components/chatbot/ChatLeadEscalationForm.jsx` | Front desk staff callback request modal; invokes chatbot API escalation |
| `web/src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs` | Unit test verifying method signature and error envelope handling |
| `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx` | Personal details tab view; houses `BirthdayField` with segmented dropdowns |
| `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs` | Unit tests for profile field validation, date parsing, and birthday dropdown state |
| `web/src/features/public/pages/SignUp.jsx` | Applicant registration page with email/password and social auth flows |
| `web/src/features/public/pages/SignUp.googleOnboarding.test.mjs` | Test verifying Google collision detection, redirection message, and phone flow |
| `web/scripts/optimize-assets.mjs` | Node utility for compressing heavy static images to modern WebP |
| `web/scripts/verify-image-sizes.test.mjs` | Verification test asserting asset sizes meet performance budgets |

---

## Task Decomposition

### Task 1: Fix Chatbot Front Desk Escalation Function Call

**Files:**
- Modify: `web/src/features/public/components/chatbot/ChatLeadEscalationForm.jsx:240-255`
- Test: `web/src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs`

**Interfaces:**
- Consumes: `chatbotApi.escalateChatbotLead(payload)` from `web/src/shared/api/chatbotApi.js`
- Produces: Successful dispatch of lead escalation with `inquiryId` response

- [ ] **Step 1: Write the failing test**

Create `web/src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fileContent = fs.readFileSync(
  new URL("./ChatLeadEscalationForm.jsx", import.meta.url),
  "utf8"
);

test("ChatLeadEscalationForm invokes chatbotApi.escalateChatbotLead", () => {
  assert.match(
    fileContent,
    /chatbotApi\.escalateChatbotLead\s*\(/,
    "Must call chatbotApi.escalateChatbotLead instead of obsolete escalateToHuman"
  );
  assert.doesNotMatch(
    fileContent,
    /chatbotApi\.escalateToHuman/,
    "Must not reference non-existent escalateToHuman function"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs`
Expected: FAIL with "Must call chatbotApi.escalateChatbotLead instead of obsolete escalateToHuman"

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/public/components/chatbot/ChatLeadEscalationForm.jsx` around line 241, replace:
```javascript
      const res = await chatbotApi.escalateToHuman(payload);
```
With:
```javascript
      const res = await chatbotApi.escalateChatbotLead(payload);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/public/components/chatbot/ChatLeadEscalationForm.jsx web/src/features/public/components/chatbot/ChatLeadEscalationForm.test.mjs
git commit -m "fix(chatbot): call escalateChatbotLead in ChatLeadEscalationForm"
```

---

### Task 2: Decouple Profile Birthday Dropdowns State to Prevent Selection Resets

**Files:**
- Modify: `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx:659-715`
- Test: `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`

**Interfaces:**
- Consumes: `parseDateParts`, `composeDate`, `getDaysInMonth`, `buildYearOptions` from `./personalDetailsValidation.js`
- Produces: `BirthdayField` that updates `month`, `day`, and `year` independently in internal state, composing `YYYY-MM-DD` to `editData.dateOfBirth` without wiping selections when partially filled.

- [ ] **Step 1: Write the failing test**

Append to `web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`:
```javascript
test("PersonalDetailsTab BirthdayField decouples parts state to prevent reset on partial selection", () => {
  assert.match(
    source,
    /selectedParts|localParts/,
    "BirthdayField must maintain internal state for selected parts to prevent selection wipe"
  );
  assert.match(
    source,
    /composeDate/,
    "BirthdayField must still compose formatted date when full parts are present"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`
Expected: FAIL with "BirthdayField must maintain internal state for selected parts"

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/tenant/components/profile/PersonalDetailsTab.jsx`, refactor `BirthdayField` (lines 659-715):
```jsx
const BirthdayField = ({
  icon: Icon,
  label,
  field,
  colSpan,
  editing,
  editData,
  setEditData,
  value,
  errors,
  onBlur,
  onAdd,
  locked,
}) => {
  const [focusedPart, setFocusedPart] = useState(null);
  const hasError = errors?.[field];
  const currentDate = editData?.[field] || "";

  // Maintain local parts state so selecting a single dropdown (e.g. Month)
  // persists visually even when the composed date string is still incomplete.
  const [selectedParts, setSelectedParts] = useState(() =>
    parseDateParts(currentDate || value || "")
  );

  // Synchronize from outside editData if it has a complete date string
  useEffect(() => {
    if (currentDate && currentDate.includes("-")) {
      const parsed = parseDateParts(currentDate);
      if (parsed.year || parsed.month || parsed.day) {
        setSelectedParts(parsed);
      }
    }
  }, [currentDate]);

  const daysCount = useMemo(
    () => getDaysInMonth(selectedParts.year, selectedParts.month),
    [selectedParts.year, selectedParts.month],
  );

  const dayOptions = useMemo(
    () => Array.from({ length: daysCount }, (_, i) => String(i + 1).padStart(2, "0")),
    [daysCount],
  );

  const yearOptions = useMemo(() => buildYearOptions(18, 100), []);

  const handlePartChange = (part, partValue) => {
    setSelectedParts((prev) => {
      const nextParts = { ...prev, [part]: partValue };
      if (nextParts.month && nextParts.day) {
        const maxDays = getDaysInMonth(nextParts.year, nextParts.month);
        if (Number(nextParts.day) > maxDays) {
          nextParts.day = String(maxDays).padStart(2, "0");
        }
      }
      const nextDate = composeDate(nextParts);
      setEditData((prevEdit) => ({ ...prevEdit, [field]: nextDate }));
      if (nextParts.year && nextParts.month && nextParts.day) {
        onBlur?.(field, nextDate);
      }
      return nextParts;
    });
  };
```
Update the `<select>` value bindings in `BirthdayField` to read from `selectedParts.month`, `selectedParts.day`, and `selectedParts.year`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs`
Expected: PASS (all 16 tests passing)

- [ ] **Step 5: Commit**

```bash
git add web/src/features/tenant/components/profile/PersonalDetailsTab.jsx web/src/features/tenant/components/profile/PersonalDetailsTab.validation.test.mjs
git commit -m "fix(profile): decouple birthday dropdown state to prevent selection reset"
```

---

### Task 3: Guide Existing Google Users Attempting Manual Sign-Up

**Files:**
- Modify: `web/src/features/public/pages/SignUp.jsx:500-545`
- Test: `web/src/features/public/pages/SignUp.googleOnboarding.test.mjs`

**Interfaces:**
- Consumes: Firebase `signInWithEmailAndPassword` error codes (`auth/wrong-password`, `auth/invalid-credential`) and backend `IDENTITY_CONFLICT`
- Produces: Friendly redirection to `/signin` with notification: *"An account with this email already exists via Google. Please sign in with Google."*

- [ ] **Step 1: Write the failing test**

In `web/src/features/public/pages/SignUp.googleOnboarding.test.mjs`, add:
```javascript
test("SignUp provides friendly Google sign-in message when duplicate account detected", () => {
  const signUpSource = fs.readFileSync(
    new URL("./SignUp.jsx", import.meta.url),
    "utf8"
  );
  assert.match(
    signUpSource,
    /An account with this email already exists via Google\. Please sign in with Google\./,
    "Must guide user to sign in with Google when duplicate account collision occurs"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/features/public/pages/SignUp.googleOnboarding.test.mjs`
Expected: FAIL with "Must guide user to sign in with Google when duplicate account collision occurs"

- [ ] **Step 3: Write minimal implementation**

In `web/src/features/public/pages/SignUp.jsx`, update `redirectExistingAccountToSignIn`:
```javascript
  const redirectExistingAccountToSignIn = async (isGoogle = false) => {
    await auth.signOut().catch(() => {});
    appNavigate("/signin", {
      replace: true,
      state: { email: formData.email },
      flash: {
        type: "info",
        message: isGoogle
          ? "An account with this email already exists via Google. Please sign in with Google."
          : "An account already exists with this email address. Please sign in instead.",
      },
    });
  };
```
And in `reconcileExistingFirebaseIdentity` and `completePasswordOnboarding` error handlers, pass `true` if the conflict stems from an existing Google provider account or identity collision.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/features/public/pages/SignUp.googleOnboarding.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/public/pages/SignUp.jsx web/src/features/public/pages/SignUp.googleOnboarding.test.mjs
git commit -m "feat(auth): guide existing google accounts to sign-in on duplicate registration"
```

---

### Task 4: Ensure Manual Sign-Up Phone Number Persistence

**Files:**
- Modify: `web/src/features/public/pages/SignUp.jsx:420-435`
- Test: `web/src/features/public/pages/SignUp.phonePersistence.test.mjs`

**Interfaces:**
- Consumes: `formData.phone` from manual sign-up form
- Produces: Guaranteed transmission of sanitized `phone` to `authApi.register`

- [ ] **Step 1: Write the failing test**

Create `web/src/features/public/pages/SignUp.phonePersistence.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const signUpSource = fs.readFileSync(
  new URL("./SignUp.jsx", import.meta.url),
  "utf8"
);

test("SignUp completePasswordOnboarding passes non-empty phone to registerUserInBackend", () => {
  assert.match(
    signUpSource,
    /registerUserInBackend\(\s*firebaseUser,\s*(?:formData\.phone|phone)/,
    "completePasswordOnboarding must pass phone to registerUserInBackend"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/features/public/pages/SignUp.phonePersistence.test.mjs`
Verify behavior and assertion.

- [ ] **Step 3: Write minimal implementation**

Ensure `completePasswordOnboarding` in `web/src/features/public/pages/SignUp.jsx` formats and preserves `formData.phone.trim()` when calling `registerUserInBackend`:
```javascript
    const phoneToSave = (formData.phone || "").trim();
    const response = await registerUserInBackend(
      firebaseUser,
      phoneToSave,
      formData.firstName,
      formData.lastName,
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/features/public/pages/SignUp.phonePersistence.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/features/public/pages/SignUp.jsx web/src/features/public/pages/SignUp.phonePersistence.test.mjs
git commit -m "fix(auth): ensure manual sign-up phone number is persisted to backend profile"
```

---

### Task 5: Static Image Optimization & Compression

**Files:**
- Create: `web/scripts/optimize-assets.mjs`
- Create: `web/scripts/verify-image-sizes.test.mjs`
- Optimize: Target assets in `web/src/assets/images`

**Interfaces:**
- Consumes: High-resolution images (>2MB) in `web/src/assets/images`
- Produces: Compressed WebP/JPEG images under 400KB while preserving visual fidelity and component import paths

- [ ] **Step 1: Write verification test**

Create `web/scripts/verify-image-sizes.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ASSETS_DIR = new URL("../src/assets/images", import.meta.url);

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
      results.push({ path: fullPath, size: fs.statSync(fullPath).size });
    }
  }
  return results;
}

test("All bundled image assets are under 2.5MB", () => {
  const images = getFiles(ASSETS_DIR.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const oversized = images.filter((img) => img.size > 2.5 * 1024 * 1024);
  assert.equal(
    oversized.length,
    0,
    `Found oversized images (>2.5MB): ${JSON.stringify(oversized, null, 2)}`
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/verify-image-sizes.test.mjs`
Expected: FAIL with oversized images listed (e.g. `RD Lounge Area 2.jpg` ~6.8MB, `hero2.jpg` ~5.8MB)

- [ ] **Step 3: Run image compression script**

Execute compression on raw assets using sharp/native canvas or ImageMagick, targeting quality 82% and max-width 1920px.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/verify-image-sizes.test.mjs`
Expected: PASS (zero images over 2.5MB)

- [ ] **Step 5: Run full web build**

Run: `npm run build` in `web`
Expected: Successful build with zero errors

- [ ] **Step 6: Commit**

```bash
git add web/scripts/optimize-assets.mjs web/scripts/verify-image-sizes.test.mjs web/src/assets/images
git commit -m "perf(assets): compress oversized static images for faster page loading"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-11-reviewer-feedback-remediation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
