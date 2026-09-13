import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSmartFullName } from "./nameParser.js";

test("parseSmartFullName uses Google profile given_name and family_name when available", () => {
  const profile = { given_name: "Ma. Elonah Kay", family_name: "Manes" };
  const result = parseSmartFullName("Ma. Elonah Kay Manes", profile);
  assert.equal(result.firstName, "Ma. Elonah Kay");
  assert.equal(result.lastName, "Manes");
});

test("parseSmartFullName parses multi-word first names with titles/initials like Ma.", () => {
  const result = parseSmartFullName("Ma. Elonah Kay Manes");
  assert.equal(result.firstName, "Ma. Elonah Kay");
  assert.equal(result.lastName, "Manes");
});

test("parseSmartFullName handles Filipino compound surnames (Dela Cruz, De Los Santos)", () => {
  const r1 = parseSmartFullName("Juan Dela Cruz");
  assert.equal(r1.firstName, "Juan");
  assert.equal(r1.lastName, "Dela Cruz");

  const r2 = parseSmartFullName("Maria De Los Santos");
  assert.equal(r2.firstName, "Maria");
  assert.equal(r2.lastName, "De Los Santos");

  const r3 = parseSmartFullName("John Paul Del Rosario");
  assert.equal(r3.firstName, "John Paul");
  assert.equal(r3.lastName, "Del Rosario");
});

test("parseSmartFullName handles generational suffixes (Jr., Sr., III)", () => {
  const r1 = parseSmartFullName("Robert Downey Jr.");
  assert.equal(r1.firstName, "Robert");
  assert.equal(r1.lastName, "Downey Jr.");

  const r2 = parseSmartFullName("John Smith III");
  assert.equal(r2.firstName, "John");
  assert.equal(r2.lastName, "Smith III");
});

test("parseSmartFullName handles standard two-word names", () => {
  const result = parseSmartFullName("Vince Palicpic");
  assert.equal(result.firstName, "Vince");
  assert.equal(result.lastName, "Palicpic");
});

test("parseSmartFullName gracefully handles single-word names and empty inputs", () => {
  const r1 = parseSmartFullName("Madonna");
  assert.equal(r1.firstName, "Madonna");
  assert.equal(r1.lastName, "User");

  const r2 = parseSmartFullName("");
  assert.equal(r2.firstName, "User");
  assert.equal(r2.lastName, "Guest");

  const r3 = parseSmartFullName(null);
  assert.equal(r3.firstName, "User");
  assert.equal(r3.lastName, "Guest");
});
