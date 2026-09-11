import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const signUpSource = fs.readFileSync(
  new URL("./SignUp.jsx", import.meta.url),
  "utf8"
);

test("SignUp completePasswordOnboarding sanitizes and passes phone to registerUserInBackend", () => {
  assert.match(
    signUpSource,
    /const phoneToSave = \(formData\.phone \|\| ""\)\.trim\(\);/,
    "completePasswordOnboarding must sanitize and extract phoneToSave from formData"
  );
  assert.match(
    signUpSource,
    /registerUserInBackend\(\s*firebaseUser,\s*phoneToSave/,
    "completePasswordOnboarding must pass phoneToSave to registerUserInBackend"
  );
});
