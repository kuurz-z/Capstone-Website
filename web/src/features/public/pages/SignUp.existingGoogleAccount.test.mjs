import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const signUp = read("src/features/public/pages/SignUp.jsx");
const useAuth = read("src/shared/hooks/useAuth.js");

test("useAuth checkAuth guards against socialAuthInProgress to prevent eager background sessions", () => {
  assert.match(
    useAuth,
    /socialAuthInProgress/,
    "checkAuth in useAuth must check socialAuthInProgress to prevent race conditions during social sign-up checks"
  );
});

test("SignUp processSocialSignupUser performs full session logout when existing account is detected", () => {
  assert.match(
    signUp,
    /processSocialSignupUser[\s\S]*?authApi\.logout\(\)/,
    "processSocialSignupUser must invoke authApi.logout() when existing account is detected to purge both Firebase and backend sessions"
  );
});

test("SignUp redirects existing Google user to /signin with email in location state", () => {
  assert.match(
    signUp,
    /processSocialSignupUser[\s\S]*?appNavigate\(\s*["']\/signin["'][\s\S]*?email:\s*firebaseUser\.email/,
    "processSocialSignupUser must pass firebaseUser.email in state to /signin for pre-filling"
  );
});

test("SignUp notifies existing Google user with agreed method-specific message", () => {
  assert.match(
    signUp,
    /An account with this email already exists\. Please sign in with Google or your password to continue\./,
    "Flash notification must display the agreed method-specific prompt"
  );
});

test("SignUp redirectExistingAccountToSignIn performs full session logout", () => {
  assert.match(
    signUp,
    /redirectExistingAccountToSignIn[\s\S]*?authApi\.logout\(\)/,
    "redirectExistingAccountToSignIn must invoke authApi.logout() to ensure clean session state"
  );
});
