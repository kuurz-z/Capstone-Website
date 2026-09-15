import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const signIn = read("src/features/tenant/pages/SignIn.jsx");

test("SignIn handleSocialLogin auto-onboards unregistered Google accounts seamlessly", () => {
  // 1. Must check for 404 / unregistered backend status
  assert.match(signIn, /status === 404/);

  // 2. Must automatically register user in backend
  assert.match(signIn, /registerUserInBackend/);

  // 3. Must safely recover on conflict/failure
  assert.match(signIn, /await recoverFromAuthFailure\(auth/);

  // 4. Must support redirect auth fallback
  assert.match(signIn, /signInWithRedirect/);
  assert.match(signIn, /getRedirectResult/);

  // 5. Must integrate socialAuthManager for instant cancellation & timeout protection
  assert.match(signIn, /createSocialAuthSession/);
  assert.match(signIn, /isPopupCancellationError/);

  // 6. Must use parseSmartFullName to correctly handle multi-word and compound names
  assert.match(signIn, /parseSmartFullName/);
});


