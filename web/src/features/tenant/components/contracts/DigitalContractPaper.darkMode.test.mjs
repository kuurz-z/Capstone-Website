import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DigitalContractPaper.jsx", import.meta.url), "utf8");

test("DigitalContractPaper supports full dark mode adaptation on screen", () => {
  // Viewport wrapper supports dark background
  assert.match(source, /dark:bg-slate-950/);

  // Populated component adapts to dark mode with crisp white text
  assert.match(source, /dark:text-white/);
  assert.doesNotMatch(source, /const POPULATED_COLOR = "#000000";/);

  // Digital contract article container uses semantic dark classes
  assert.match(source, /id="digital-contract-paper"[^>]*dark:bg-slate-900/);
  assert.match(source, /id="digital-contract-paper"[^>]*dark:text-slate-100/);

  // Headings and paragraphs avoid hardcoded text-black
  assert.doesNotMatch(source, /h1 className="[^"]*text-black/);

  // Signature lines adapt to dark mode
  assert.doesNotMatch(source, /print-lessee-spacer border-b border-black/);
  assert.match(source, /print-lessee-spacer[^"]*dark:border-slate-600/);
});

test("DigitalContractPaper streamlines mobile controls by hiding Print on narrow viewports", () => {
  // Print button should be hidden on narrow viewports (<640px)
  assert.match(source, /hidden\s+sm:inline-flex[^"]*"\s+title=\{[^}]*Print/);
});

test("DigitalContractPaper strictly preserves 100% authentic black-on-white print & PDF invariant", () => {
  // Offscreen PDF container remains pure #ffffff and #000000
  assert.match(source, /id="offscreen-legal-pdf-container"/);
  assert.match(source, /backgroundColor:\s*"#ffffff"/);
  assert.match(source, /color:\s*"#000000"/);

  // @media print forces paper to #ffffff and #000000
  assert.match(source, /@media print \{[\s\S]*#digital-contract-paper[\s\S]*background:\s*#ffffff !important/);
  assert.match(source, /@media print \{[\s\S]*color:\s*#000000 !important/);
});
