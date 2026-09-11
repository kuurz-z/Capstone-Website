import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const formSource = fs.readFileSync(
  new URL("./ChatLeadEscalationForm.jsx", import.meta.url),
  "utf8"
);

test("ChatLeadEscalationForm invokes chatbotApi.escalateChatbotLead", () => {
  assert.match(
    formSource,
    /chatbotApi\.escalateChatbotLead\s*\(/,
    "Must call chatbotApi.escalateChatbotLead instead of obsolete escalateToHuman"
  );
  assert.doesNotMatch(
    formSource,
    /chatbotApi\.escalateToHuman/,
    "Must not reference non-existent escalateToHuman function"
  );
});

test("ChatLeadEscalationForm sanitizes technical errors and provides friendly guidance", () => {
  assert.match(
    formSource,
    /isTechnicalError/,
    "Must detect technical runtime/network errors"
  );
  assert.match(
    formSource,
    /We could not submit your request at this moment/,
    "Must display friendly guidance message instead of raw runtime exceptions"
  );
});

test("ChatLeadEscalationForm handles onClose and onCancel navigation", () => {
  assert.match(
    formSource,
    /typeof onClose === "function"/,
    "Must verify and invoke onClose if provided"
  );
  assert.match(
    formSource,
    /onCancel\s*\(\s*\)/,
    "Must fall back to onCancel if onClose is not provided"
  );
});

test("ChatLeadEscalationForm renders dedicated Submitted UI with Reference ID and details", () => {
  assert.match(
    formSource,
    /Request Submitted Successfully/,
    "Must render prominent submission success title"
  );
  assert.match(
    formSource,
    /submittedRequest\.inquiryId/,
    "Must display the generated inquiry reference ID"
  );
  assert.match(
    formSource,
    /Return to Conversation/,
    "Must provide action button to return to chat conversation"
  );
  assert.match(
    formSource,
    /Submit Another Inquiry/,
    "Must provide reset option to submit another inquiry"
  );
});

test("ChatLeadEscalationForm handles both wrapped and unwrapped API responses", () => {
  assert.match(
    formSource,
    /Boolean\s*\(\s*res\?\.inquiryId\s*\)/,
    "Must consider inquiryId present in unwrapped response as success"
  );
});
