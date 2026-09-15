import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEmail,
  validatePassword,
  getFirebaseErrorMessage,
  evaluatePasswordRules,
  evaluateNewPassword,
  NEW_PASSWORD_MAX_LENGTH,
  calculatePasswordStrength,
  formatProperCase,
  sanitizeName,
} from "./authValidation.js";

test("validateEmail gives plain-language guidance, not technical jargon", () => {
  assert.equal(validateEmail(""), "Email address is required");
  assert.match(validateEmail("not-an-email"), /valid email address/i);
  assert.doesNotMatch(validateEmail("not-an-email") || "", /regex|format|domain/i);
  assert.equal(validateEmail("name@example.com"), null);
});

test("validatePassword explains what's missing in plain language", () => {
  assert.equal(validatePassword(""), "Password is required");
  assert.match(validatePassword("short"), /at least 8 characters/i);
  assert.equal(validatePassword("Str0ng!Pass"), null);
});

test("evaluatePasswordRules exposes five checklist rows while enforcing hidden whitespace and maximum rules", () => {
  const empty = evaluatePasswordRules("");
  assert.equal(empty.allPassed, false);

  const partial = evaluatePasswordRules("Pass1234");
  assert.equal(partial.allPassed, false);
  const specialRule = partial.results.find((r) => r.id === "special");
  assert.equal(specialRule.passed, false);

  const full = evaluatePasswordRules("Str0ng!Pass2026");
  assert.equal(full.allPassed, true);
  assert.equal(full.results.every((r) => r.passed), true);

  const withSpaces = evaluatePasswordRules("Str0ng! Pass");
  assert.deepEqual(withSpaces.results.map((rule) => rule.id), ["length", "uppercase", "lowercase", "number", "special"]);
  assert.equal(withSpaces.allPassed, false);
});

test("canonical new-password boundary matrix", () => {
  const cases = [
    ["", false], ["Aa1!aaa", false], ["Aa1!aaaa", true],
    ["aa1!aaaa", false], ["AA1!AAAA", false], ["Aaa!aaaa", false], ["Aaa1aaaa", false],
    ["Aa1! aaab", false], [" Aa1!aaab", false], ["Aa1!aaab ", false],
    ["Aa1!\taaab", false], ["Aa1!\naaab", false], ["Lilycrest2026#Secure", true],
    [`Aa1!${"x".repeat(NEW_PASSWORD_MAX_LENGTH - 4)}`, true],
    [`Aa1!${"x".repeat(NEW_PASSWORD_MAX_LENGTH - 3)}`, false],
  ];
  for (const [password, expected] of cases) {
    assert.equal(evaluateNewPassword(password).valid, expected, JSON.stringify(password));
    assert.equal(validatePassword(password) === null, expected, JSON.stringify(password));
  }
});

test("calculatePasswordStrength calculates tiers and labels appropriately", () => {
  assert.equal(calculatePasswordStrength("").score, 0);
  assert.equal(calculatePasswordStrength("abc").level, "weak");
  assert.equal(calculatePasswordStrength("Password123").level, "medium");
  assert.equal(calculatePasswordStrength("P@ssw0rd2026!").level, "strong");
});

test("getFirebaseErrorMessage never leaks raw backend text on unmapped codes", () => {
  const error = { code: "auth/some-unmapped-future-code", response: { data: { error: "Internal: uid=abc123 stack" } } };
  const message = getFirebaseErrorMessage(error, "signup");
  assert.doesNotMatch(message, /uid=|stack|Internal:/);
  assert.match(message, /could not complete your registration/i);
});

test("getFirebaseErrorMessage maps duplicate-email signup to a sign-in prompt", () => {
  const message = getFirebaseErrorMessage({ code: "auth/email-already-in-use" }, "signup");
  assert.match(message, /already exists/i);
  assert.match(message, /sign in/i);
});

test("formatProperCase capitalizes first letter of words and after spaces, hyphens, and apostrophes", () => {
  assert.equal(formatProperCase(""), "");
  assert.equal(formatProperCase("palicpic"), "Palicpic");
  assert.equal(formatProperCase("vince"), "Vince");
  assert.equal(formatProperCase("vince palicpic"), "Vince Palicpic");
  assert.equal(formatProperCase("juan dela cruz"), "Juan Dela Cruz");
  assert.equal(formatProperCase("mary-jane"), "Mary-Jane");
  assert.equal(formatProperCase("o'connor"), "O'Connor");
  assert.equal(formatProperCase("p"), "P");
});

test("sanitizeName strips forbidden characters and capitalizes the first letter of each word", () => {
  assert.equal(sanitizeName(""), "");
  assert.equal(sanitizeName("palicpic"), "Palicpic");
  assert.equal(sanitizeName("palicpic123"), "Palicpic");
  assert.equal(sanitizeName("vince<script>alert(1)</script>"), "Vince");
  assert.equal(sanitizeName("dela cruz"), "Dela Cruz");
  assert.equal(sanitizeName("anne-marie"), "Anne-Marie");
  assert.equal(sanitizeName("Ma. Elonah Kay"), "Ma. Elonah Kay");
  assert.equal(sanitizeName("ma."), "Ma.");
});

