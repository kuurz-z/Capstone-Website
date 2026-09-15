import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthSuccessMessage,
  buildAuthWelcomeMessage,
  resolveAuthDisplayName,
} from "./authToasts.js";

test("resolveAuthDisplayName resolves full name with proper formatting", () => {
  const user = { firstName: "vince bryan", lastName: "palicpic" };
  assert.equal(resolveAuthDisplayName(user), "Vince Bryan Palicpic");
});

test("buildAuthSuccessMessage returns 'Welcome, [Name]!' for new users", () => {
  const newUserFlag = {
    firstName: "Vince Bryan",
    lastName: "Palicpic",
    isNewAccount: true,
  };
  assert.equal(
    buildAuthSuccessMessage(newUserFlag),
    "Welcome, Vince Bryan Palicpic!"
  );

  const newRecentAccount = {
    firstName: "Vince Bryan",
    lastName: "Palicpic",
    createdAt: new Date().toISOString(),
  };
  assert.equal(
    buildAuthSuccessMessage(newRecentAccount),
    "Welcome, Vince Bryan Palicpic!"
  );
});

test("buildAuthSuccessMessage returns 'Welcome back, [Name]!' for returnees", () => {
  const returnee = {
    firstName: "Vince Bryan",
    lastName: "Palicpic",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  };
  assert.equal(
    buildAuthSuccessMessage(returnee),
    "Welcome back, Vince Bryan Palicpic!"
  );

  const returneeNoTimestamp = {
    firstName: "Vince Bryan",
    lastName: "Palicpic",
  };
  assert.equal(
    buildAuthSuccessMessage(returneeNoTimestamp),
    "Welcome back, Vince Bryan Palicpic!"
  );
});
