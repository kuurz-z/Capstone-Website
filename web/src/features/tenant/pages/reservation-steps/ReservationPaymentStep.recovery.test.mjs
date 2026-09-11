import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ReservationPaymentStep provides recovery CTA when payment timer expires", () => {
  const filePath = new URL("./ReservationPaymentStep.jsx", import.meta.url);
  assert.ok(fs.existsSync(filePath), "ReservationPaymentStep.jsx must exist");
  const content = fs.readFileSync(filePath, "utf8");

  // 1. Navigation hook integration
  assert.match(content, /import\s*\{[^}]*useNavigate[^}]*\}\s*from\s*["']react-router-dom["']/, "Must import useNavigate");
  assert.match(content, /const\s+navigate\s*=\s*useNavigate\(\);/, "Must invoke useNavigate hook");

  // 2. Recovery CTA button rendering
  assert.match(content, /isTimerExpired\s*&&\s*!readOnly/, "Must guard recovery button on isTimerExpired and !readOnly");
  assert.match(content, /Browse Available Rooms/, "Must provide clear recovery button label");
  assert.match(content, /navigate\(["']\/applicant\/check-availability["']\)/, "Recovery button must navigate to check availability page");

  // 3. Lilycrest design tokens compliance
  assert.doesNotMatch(content, /bg-gradient/, "Strictly no background gradients allowed");
  assert.match(content, /border-slate-200\s+dark:border-slate-700/, "Must use solid neutral 1px borders");
});
