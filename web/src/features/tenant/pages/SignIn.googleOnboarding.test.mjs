import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const signIn = read("src/features/tenant/pages/SignIn.jsx");

test("SignIn handleSocialLogin rejects unregistered Google accounts and redirects to signup", () => {
  // 1. Must check for 404 / unregistered backend status
  assert.match(signIn, /status === 404/);

  // 2. Must NOT register user in backend from SignIn page
  assert.doesNotMatch(signIn, /registerUserInBackend/);

  // 3. Must safely sign out on unauthenticated/unregistered access
  assert.match(signIn, /authApi\.logout\(\)|auth\.signOut\(\)/);

  // 4. Must support redirect auth fallback
  assert.match(signIn, /signInWithRedirect/);
  assert.match(signIn, /getRedirectResult/);

  // 5. Must integrate socialAuthManager for instant cancellation & timeout protection
  assert.match(signIn, /createSocialAuthSession/);
  assert.match(signIn, /isPopupCancellationError/);

  // 6. Must guide unregistered user to sign up
  assert.match(signIn, /No registered account found with this Google account\. Please sign up first\./);
  assert.match(signIn, /appNavigate\(\s*["']\/signup["']/);
});


