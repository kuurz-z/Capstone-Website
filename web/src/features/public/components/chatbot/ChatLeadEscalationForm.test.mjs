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
