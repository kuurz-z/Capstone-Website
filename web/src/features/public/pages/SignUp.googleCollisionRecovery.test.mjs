import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../../..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const signUp = read("src/features/public/pages/SignUp.jsx");
const signIn = read("src/features/tenant/pages/SignIn.jsx");

test("SignIn passes isGoogleAuth and email state when redirecting unregistered social user to signup", () => {
  assert.match(
    signIn,
    /appNavigate\(\s*["']\/signup["'],\s*\{[\s\S]*?isGoogleAuth:\s*true/,
    "SignIn must pass isGoogleAuth: true in location state when redirecting to /signup"
  );
});

test("SignUp detects isGoogleAuth in location state and highlights Google signup action", () => {
  assert.match(
    signUp,
    /isGoogleAuth/,
    "SignUp must inspect isGoogleAuth from location.state"
  );
});

test("SignUp reconciliation guides Google-authenticated emails to Continue with Google in-place", () => {
  assert.match(
    signUp,
    /Please click\s+["']?Continue with Google["']?|Please sign in with Google|Please use Continue with Google/,
    "SignUp must instruct the user to use Continue with Google when email is tied to Google"
  );
});

test("SignUp safely clears autofocus timer upon component unmount", () => {
  assert.match(
    signUp,
    /clearTimeout\(\s*timer\s*\)/,
    "SignUp must call clearTimeout on unmount in its autofocus useEffect"
  );
});

test("SignUp encapsulates Google identity detection into checkIsGoogleIdentity helper", () => {
  assert.match(
    signUp,
    /const checkIsGoogleIdentity\s*=\s*async/,
    "SignUp must define a centralized checkIsGoogleIdentity helper"
  );
});

