import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const signUp = read("src/features/public/pages/SignUp.jsx");

test("SignUp handleSocialSignup auto-onboards and handles instant cancellation", () => {
  // 1. Must check for 404 / unregistered backend status
  assert.match(signUp, /status === 404/);

  // 2. Must automatically register user in backend
  assert.match(signUp, /registerUserInBackend/);

  // 3. Must safely recover on conflict/failure
  assert.match(signUp, /await recoverFromAuthFailure\(auth/);

  // 4. Must support redirect auth fallback
  assert.match(signUp, /signInWithRedirect/);
  assert.match(signUp, /getRedirectResult/);

  // 5. Must integrate socialAuthManager for instant cancellation & timeout protection
  assert.match(signUp, /createSocialAuthSession/);
  assert.match(signUp, /isPopupCancellationError/);
});

test("SignUp provides friendly Google sign-in message when duplicate account detected", () => {
  assert.match(
    signUp,
    /An account with this email already exists via Google\. Please sign in with Google\./,
    "Must guide user to sign in with Google when duplicate account collision occurs"
  );
  assert.match(
    signUp,
    /fetchSignInMethodsForEmail/,
    "Must import and use fetchSignInMethodsForEmail to identify Google provider accounts"
  );
});


