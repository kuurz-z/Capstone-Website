import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ReservationInactivityModal enforces Lilycrest design tokens and plain English copy", () => {
  const filePath = new URL("./ReservationInactivityModal.jsx", import.meta.url);
  assert.ok(fs.existsSync(filePath), "ReservationInactivityModal.jsx must exist");
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(content.includes("Are you still working on your reservation?"), "Must include friendly title");
  assert.ok(content.includes("I'm still here"), "Must include extend button text");
  assert.ok(content.includes("Release Room"), "Must include voluntary release button");
  assert.ok(!content.includes("gradient"), "Strictly no gradients allowed per AGENTS.md");
});

test("ReservationInactivityModal guards against accidental backdrop and escape cancellation", () => {
  const filePath = new URL("./ReservationInactivityModal.jsx", import.meta.url);
  const content = fs.readFileSync(filePath, "utf8");
  assert.match(content, /closeOnBackdrop=\{false\}/, "Must disable closing on backdrop click");
  assert.match(content, /closeOnEscape=\{false\}/, "Must disable closing on escape key");
  assert.match(content, /onClose=\{onExtend\}/, "Default close must safely extend rather than release");
  assert.match(content, /onCancel=\{onRelease\}/, "Release action must be mapped strictly to explicit onCancel");
});

test("BaseModal respects backdrop cancellation guards and onCancel prop", () => {
  const baseModalPath = new URL("../../../shared/components/BaseModal.jsx", import.meta.url);
  const content = fs.readFileSync(baseModalPath, "utf8");
  assert.match(content, /closeOnBackdrop\s*=\s*true/, "BaseModal must accept closeOnBackdrop prop");
  assert.match(content, /closeOnEscape\s*=\s*true/, "BaseModal must accept closeOnEscape prop");
  assert.match(content, /if\s*\(closeOnBackdrop\s*&&/, "handleBackdropClick must verify closeOnBackdrop");
  assert.match(content, /if\s*\(closeOnEscape\s*&&/, "Escape keydown handler must verify closeOnEscape");
  assert.match(content, /onClick=\{onCancel \|\| onClose\}/, "Cancel button must trigger onCancel when provided");
});
