# Authentication System Optimization & 100% Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all code review findings, fix the backend registration payload contract test, deduplicate Google provider lookup logic, ensure proper React lifecycle timer cleanup, and achieve a 100% passing test score and production build.

**Architecture:** 
- In `server/controllers/authController.js` and `server/controllers/authController.identitySafety.test.js`, update `buildRegistrationUserPayload` options to correctly differentiate new registrations from resumed onboarding sessions, and update the contract test key assertion to include `createdAt` and `isNewAccount`.
- In `web/src/features/public/pages/SignUp.jsx`, extract duplicate Google identity provider checks into a reusable `checkIsGoogleIdentity` helper, and add timer cleanup in the `useEffect` autofocus lifecycle hook.
- Verify 100% passing results across all backend Jest test suites and frontend unit tests and production build.

**Tech Stack:** React 19 (Vite), ES Modules, Express.js, MongoDB/Mongoose, Jest, Node.js Test Runner.

**Spec:** Code review report and `AUTHENTICATION_AND_SECURITY.md`.

## Global Constraints
- Use "Tenant" exclusively across all copywriting.
- Maintain solid HSL tokens without gradients or colored border outlines.
- Enforce standardized API contracts and safe payload isolation (no `firebaseUid` or sensitive hashes).
- Full backward compatibility with web and mobile authentication endpoints.

---

## What to Expect from These Changes
- **100% Passing Automated Tests**: The backend registration contract test (`authController.identitySafety.test.js`) will pass cleanly alongside all other test suites.
- **Accurate New vs. Resumed Account Greeter**: Brand new sign-ups will be greeted with `"Welcome, [Name]!"`, while resumed onboarding or returning tenants will receive `"Welcome back, [Name]!"`.
- **Cleaner, More Maintainable Code**: Duplicate Google sign-in method queries in `SignUp.jsx` will be consolidated into a single clean helper.
- **Zero React Memory Leaks**: Component autofocus timeouts will be properly disposed of if the user navigates away before the timer expires.

---

### Task 1: Backend Registration Payload Contract Test & Onboarding Resume Refinement

**Files:**
- Modify: `server/controllers/authController.js:127-142, 317-322, 370-380`
- Modify: `server/controllers/authController.identitySafety.test.js:216-229`

**Interfaces:**
- Consumes: `user` model object and optional `{ isNewAccount?: boolean }` options
- Produces: Sanitized registration payload containing `id`, `user_id`, `email`, `username`, `firstName`, `lastName`, `phone`, `branch`, `role`, `permissions`, `isEmailVerified`, `onboardingStatus`, `createdAt`, and `isNewAccount`.

- [ ] **Step 1: Update `buildRegistrationUserPayload` in `server/controllers/authController.js`**

```javascript
export const buildRegistrationUserPayload = (user, options = {}) => ({
  id: user._id,
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  branch: user.branch,
  role: user.role,
  permissions: user.permissions || [],
  isEmailVerified: Boolean(user.isEmailVerified),
  onboardingStatus: user.onboardingStatus || "profile_complete",
  createdAt: user.createdAt,
  isNewAccount: options.isNewAccount !== undefined ? options.isNewAccount : true,
});
```

And update callers in `authController.js`:
- Line ~320 (`ONBOARDING_RESUMED`):
  `user: buildRegistrationUserPayload(existingUser, { isNewAccount: false }),`
- Line ~370 (New registration):
  `user: buildRegistrationUserPayload(user, { isNewAccount: true }),`
- Line ~379 (Duplicate-key race fallback to existing UID):
  `user: buildRegistrationUserPayload(existingByUid, { isNewAccount: false }),`

- [ ] **Step 2: Update contract test assertions in `server/controllers/authController.identitySafety.test.js`**

```javascript
  test("all registration payloads share the same safe shape", () => {
    const payload = buildRegistrationUserPayload({
      _id: "mongo-1", user_id: "public-1", firebaseUid: "never-return-this",
      email: "person@example.test", username: "person", firstName: "Test", lastName: "Person",
      phone: null, branch: null, role: "applicant", permissions: [], isEmailVerified: false,
      onboardingStatus: "verification_pending", otpHash: "never-return-this-either",
      createdAt: new Date().toISOString(),
    });
    expect(Object.keys(payload).sort()).toEqual([
      "branch", "createdAt", "email", "firstName", "id", "isEmailVerified",
      "isNewAccount", "lastName", "onboardingStatus", "permissions", "phone",
      "role", "user_id", "username",
    ].sort());
    expect(payload).not.toHaveProperty("firebaseUid");
    expect(payload).not.toHaveProperty("otpHash");
  });
```

- [ ] **Step 3: Run backend test to verify it passes**

Run: `npm test -- controllers/authController.identitySafety.test.js` (in `Capstone-Website/server`)
Expected: PASS (7/7 tests passing).

---

### Task 2: Refactor Google Identity Helper & Timer Cleanup in `SignUp.jsx`

**Files:**
- Modify: `web/src/features/public/pages/SignUp.jsx:98-120, 535-585`
- Test: `web/src/features/public/pages/SignUp.googleCollisionRecovery.test.mjs`

**Interfaces:**
- Consumes: `location.state`, `formData.email`
- Produces: Clean `checkIsGoogleIdentity(email)` helper and garbage-collected `useEffect` timers

- [ ] **Step 1: Add timer cleanup in `useEffect` and create `checkIsGoogleIdentity` in `SignUp.jsx`**

In `web/src/features/public/pages/SignUp.jsx`:
```jsx
  useEffect(() => {
    const prefillEmail = (location.state?.email || "").trim();
    const isGoogle = location.state?.isGoogleAuth === true;
    if (prefillEmail) {
      setFormData((prev) => ({ ...prev, email: prefillEmail }));
      setTouched((prev) => ({ ...prev, email: true }));
      setFieldValid((prev) => ({ ...prev, email: !validateEmail(prefillEmail) }));
    }
    let timer = null;
    if (isGoogle) {
      timer = setTimeout(() => {
        const googleBtn = document.querySelector(".social-auth-btn--google, [data-provider='google']");
        if (googleBtn) {
          googleBtn.focus();
          googleBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [location.state?.email, location.state?.isGoogleAuth]);
```

And extract `checkIsGoogleIdentity`:
```javascript
  const checkIsGoogleIdentity = async (email) => {
    if (location.state?.isGoogleAuth === true) return true;
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      return Array.isArray(methods) && methods.includes("google.com");
    } catch {
      return false;
    }
  };
```

And update `reconcileExistingFirebaseIdentity` catch blocks:
```javascript
      if (
        signInError?.code === "auth/wrong-password" ||
        signInError?.code === "auth/invalid-credential"
      ) {
        const isGoogle = await checkIsGoogleIdentity(formData.email);

        if (isGoogle) {
          showNotification(
            "This email is registered with Google. Please click 'Continue with Google' to complete your registration.",
            "warning",
            7000,
          );
          const googleBtn = document.querySelector(".social-auth-btn--google, [data-provider='google']");
          if (googleBtn) {
            googleBtn.focus();
            googleBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          return;
        }

        await redirectExistingAccountToSignIn(false);
        return;
      }
```
And in profile check:
```javascript
      await authApi.checkUser();
      const isGoogle = await checkIsGoogleIdentity(formData.email);
      await redirectExistingAccountToSignIn(isGoogle);
```

- [ ] **Step 2: Run frontend test suites to verify**

Run: `node src/features/public/pages/SignUp.googleCollisionRecovery.test.mjs` (in `Capstone-Website/web`)
Expected: PASS (3/3 tests passing).

---

### Task 3: Comprehensive Regression Testing & Production Build Verification

**Files:**
- All modified backend and frontend files

- [ ] **Step 1: Run full frontend test suite**

Run:
```powershell
node src/features/tenant/pages/SignIn.googleOnboarding.test.mjs
node src/features/public/pages/SignUp.googleCollisionRecovery.test.mjs
node src/shared/utils/authToasts.test.mjs
```
(in `Capstone-Website/web`)
Expected: All 3 suites pass (7/7 tests passing).

- [ ] **Step 2: Run web production build**

Run: `npm run build` (in `Capstone-Website/web`)
Expected: Vite build completes with 0 errors.

- [ ] **Step 3: Run targeted server auth test suites**

Run: `npm test -- controllers/authController.identitySafety.test.js` (in `Capstone-Website/server`)
Expected: 100% tests passing.
