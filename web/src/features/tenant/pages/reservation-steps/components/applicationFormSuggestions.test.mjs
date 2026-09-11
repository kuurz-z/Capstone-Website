import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tenantRoot = resolve(__dirname, "../../..");

const readTenantSource = (relativePath) =>
  readFileSync(resolve(tenantRoot, relativePath), "utf8");

test("PhotoEmailSection provides locked verified account email with Mail icon, Lock tooltip, and guaranteed padding", () => {
  const source = readTenantSource("pages/reservation-steps/components/PhotoEmailSection.jsx");

  // Verify email input is locked/readOnly/disabled
  assert.match(source, /readOnly/, "Email input in PhotoEmailSection should be readOnly");
  assert.match(source, /disabled/, "Email input in PhotoEmailSection should be disabled");
  assert.match(source, /Mail/, "Mail icon should be imported and rendered on the left");
  assert.match(source, /Lock/, "Lock icon should be rendered on the right");
  assert.match(
    source,
    /title="Verified account email is locked and cannot be edited"/,
    "Lock icon should have user-friendly tooltip title"
  );
  assert.match(
    source,
    /style=\{\{\s*paddingLeft:\s*"38px",\s*paddingRight:\s*"38px"\s*\}\}/,
    "Email input must enforce 38px left and right padding to prevent icon collision"
  );
  assert.match(source, /Verified Account/, "Verified Account badge should be rendered");
  assert.match(source, /accountEmail/, "Component should accept and use accountEmail");
});

test("ReservationApplicationStep supports Multi-Open Continuous Scroll with zero disruptive auto-advance timers", () => {
  const source = readTenantSource("pages/reservation-steps/ReservationApplicationStep.jsx");

  // Verify autoAdvanceTimerRef is removed
  assert.doesNotMatch(
    source,
    /autoAdvanceTimerRef/,
    "ReservationApplicationStep must not have autoAdvanceTimerRef to prevent abrupt auto-advancing"
  );
  assert.match(source, /toggleSection/, "Manual section toggling must be available");
  assert.match(
    source,
    /setOpenSections\(buildOpenSectionState\(true\)\)/,
    "Validation errors should expand all sections for clear error visibility"
  );
});

test("PersonalInfoSection provides autocomplete attributes, datalist suggestions, and character counters", () => {
  const source = readTenantSource("pages/reservation-steps/components/PersonalInfoSection.jsx");

  assert.match(source, /autoComplete="family-name"/, "Last Name should have family-name autocomplete");
  assert.match(source, /autoComplete="given-name"/, "First Name should have given-name autocomplete");
  assert.match(source, /autoComplete="additional-name"/, "Middle Name should have additional-name autocomplete");
  assert.match(source, /autoComplete="nickname"/, "Nickname should have nickname autocomplete");
  assert.match(source, /autoComplete="tel"/, "Mobile number should have tel autocomplete");
  assert.match(source, /datalist id=\{datalistId\}/, "NameField should support datalist suggestion dropdown");
  assert.match(source, /rf-char-counter/, "Personal notes and NBI reason should have character counters");
});

test("EmploymentSection provides occupation datalist, suggestion chips, and autocomplete attributes", () => {
  const source = readTenantSource("pages/reservation-steps/components/EmploymentSection.jsx");

  assert.match(source, /<datalist id="occupation-suggestions"/, "Occupation datalist should exist");
  assert.match(source, /list="occupation-suggestions"/, "Occupation input should connect to datalist");
  assert.match(source, /autoComplete="organization"/, "Employer school input should have organization autocomplete");
  assert.match(source, /autoComplete="street-address"/, "Employer address input should have street-address autocomplete");
  assert.match(source, /autoComplete="tel"/, "Employer contact input should have tel autocomplete");
  assert.match(source, /rf-suggestion-chip/, "Quick occupation suggestion chips should be provided");
  assert.match(source, /rf-char-counter/, "Employment inputs should have character counters");
});

test("EmergencyContactSection provides autocomplete attributes and N/A quick chip", () => {
  const source = readTenantSource("pages/reservation-steps/components/EmergencyContactSection.jsx");

  assert.match(source, /autoComplete="name"/, "Emergency contact name should have name autocomplete");
  assert.match(source, /autoComplete="tel"/, "Emergency contact phone should have tel autocomplete");
  assert.match(source, /rf-suggestion-chip/, "Health concerns should have a quick N/A suggestion chip");
  assert.match(source, /rf-char-counter/, "Health concerns should have character counter");
});

test("AddressCascadeFields provides autocomplete attributes on unit and street inputs", () => {
  const source = readTenantSource("pages/reservation-steps/components/AddressCascadeFields.jsx");

  assert.match(source, /autoComplete="address-line2"/, "Unit/House No should have address-line2 autocomplete");
  assert.match(source, /autoComplete="address-line1"/, "Street should have address-line1 autocomplete");
});

test("useReservationFlow guards profile name initialization and manages billingEmail across lifecycle", () => {
  const source = readTenantSource("hooks/useReservationFlow.js");

  assert.match(source, /profileNameInitializedRef/, "Profile name initialization should be guarded by ref");
  assert.match(source, /billingEmail,/, "billingEmail should be in buildDraftPayload and applicationPayload");
  assert.match(source, /key:\s*"billingEmail"/, "billingEmail should be validated upon submission");
  assert.match(source, /userAccountEmail/, "userAccountEmail should be exported from useReservationFlow");
});

test("ReservationApplicationStep calculates section completion, renders progress bar and back navigation", () => {
  const source = readTenantSource("pages/reservation-steps/ReservationApplicationStep.jsx");

  assert.match(source, /sectionCompletionMap/, "Section completion map should be computed");
  assert.match(source, /completedSectionsCount/, "completedSectionsCount should be computed from sectionCompletionMap");
  assert.match(source, /<ApplicationProgressBar/, "ApplicationProgressBar should be rendered in header area");
  assert.match(source, /rf-section-badge--done/, "Completed sections should show completion badges");
  assert.match(source, /setBillingEmail/, "setBillingEmail should be passed to PhotoEmailSection");
  assert.match(source, /Step 3 · Tenant Application/, "Header badge should state Step 3 · Tenant Application");
  assert.match(source, /onPrev/, "onPrev Back button should be supported in Stage 3 navigation");
});

test("ApplicationProgressBar renders accessible progressbar semantics and saving indicators", () => {
  const source = readTenantSource("pages/reservation-steps/components/ApplicationProgressBar.jsx");

  assert.match(source, /role="progressbar"/, "Progress track should have role='progressbar'");
  assert.match(source, /aria-valuenow=\{percentage\}/, "Progress track should have aria-valuenow");
  assert.match(source, /rf-app-progress__save/, "Auto-save status indicator should be rendered");
  assert.match(source, /Ready to submit/, "Ready to submit badge should show when all sections complete");
});

test("CSS rules suppress native datalist dropdown arrows across global and reservation flow styles", () => {
  const globalCss = readFileSync(resolve(tenantRoot, "../../index.css"), "utf8");
  const reservationCss = readTenantSource("styles/reservation-flow.css");

  assert.match(
    globalCss,
    /input(\[list\])?::-webkit-calendar-picker-indicator[\s\S]*?display:\s*none\s*!important/,
    "Global index.css must suppress native calendar/datalist picker indicator",
  );
  assert.match(
    reservationCss,
    /\.form-input(\[list\])?::-webkit-calendar-picker-indicator[\s\S]*?display:\s*none\s*!important/,
    "Reservation flow CSS must explicitly suppress native calendar/datalist picker indicator",
  );
});

test("PersonalInfoSection defines date helpers required by BirthdaySelectField", () => {
  const source = readTenantSource("pages/reservation-steps/components/PersonalInfoSection.jsx");

  assert.match(source, /parseDateParts/, "PersonalInfoSection must define parseDateParts");
  assert.match(source, /getDaysInMonth/, "PersonalInfoSection must define getDaysInMonth");
  assert.match(source, /pad2/, "PersonalInfoSection must define pad2");
  assert.match(source, /composeDate/, "PersonalInfoSection must define composeDate");
  assert.match(source, /buildYearOptions/, "PersonalInfoSection must define buildYearOptions");
  assert.match(source, /MONTH_OPTIONS/, "PersonalInfoSection must define MONTH_OPTIONS");
  assert.match(
    source,
    /(?:const|function)\s+parseDateParts/,
    "parseDateParts must be declared as a function or const in PersonalInfoSection",
  );
  assert.match(
    source,
    /(?:const|function)\s+getDaysInMonth/,
    "getDaysInMonth must be declared as a function or const in PersonalInfoSection",
  );
  assert.match(
    source,
    /(?:const|function)\s+pad2/,
    "pad2 must be declared as a function or const in PersonalInfoSection",
  );
  assert.match(
    source,
    /(?:const|function)\s+composeDate/,
    "composeDate must be declared as a function or const in PersonalInfoSection",
  );
  assert.match(
    source,
    /(?:const|function)\s+buildYearOptions/,
    "buildYearOptions must be declared as a function or const in PersonalInfoSection",
  );
  assert.match(
    source,
    /const\s+MONTH_OPTIONS/,
    "MONTH_OPTIONS must be declared as a const in PersonalInfoSection",
  );
});

test("PersonalInfoSection date helpers execute correctly", () => {
  const source = readTenantSource("pages/reservation-steps/components/PersonalInfoSection.jsx");

  // Verify BirthdaySelectField consumes the helpers without ReferenceError
  assert.match(source, /parseDateParts\(birthday\)/);
  assert.match(source, /buildYearOptions\(birthdayMin,\s*birthdayMax\)/);
  assert.match(source, /getDaysInMonth\(parts\.year,\s*parts\.month\)/);
  assert.match(source, /pad2\(index\s*\+\s*1\)/);
  assert.match(source, /composeDate\(next\)/);
  assert.match(source, /MONTH_OPTIONS\.map/);

  // Evaluate the extracted functions to verify runtime execution
  const helperCode = `
    ${source.match(/export const MONTH_OPTIONS = \[[\s\S]*?\];/)[0].replace('export ', '')}
    ${source.match(/export const pad2 = [\s\S]*?;/)[0].replace('export ', '')}
    ${source.match(/export const parseDateParts = [\s\S]*?\n\};/)[0].replace('export ', '')}
    ${source.match(/export const getDaysInMonth = [\s\S]*?\n\};/)[0].replace('export ', '')}
    ${source.match(/export const composeDate = [\s\S]*?\n\};/)[0].replace('export ', '')}
    ${source.match(/export const buildYearOptions = [\s\S]*?\n\};/)[0].replace('export ', '')}
    return { MONTH_OPTIONS, pad2, parseDateParts, getDaysInMonth, composeDate, buildYearOptions };
  `;
  const fn = new Function(helperCode);
  const { MONTH_OPTIONS, pad2, parseDateParts, getDaysInMonth, composeDate, buildYearOptions } = fn();

  assert.equal(MONTH_OPTIONS.length, 12);
  assert.equal(pad2(5), "05");
  assert.equal(pad2("9"), "09");
  assert.deepEqual(parseDateParts("2002-08-25"), { year: "2002", month: "08", day: "25" });
  assert.deepEqual(parseDateParts(""), { year: "", month: "", day: "" });
  assert.deepEqual(parseDateParts(null), { year: "", month: "", day: "" });
  assert.equal(getDaysInMonth("2024", "02"), 29);
  assert.equal(getDaysInMonth("2023", "02"), 28);
  assert.equal(getDaysInMonth("2024", "04"), 30);
  assert.equal(composeDate({ year: "2000", month: "5", day: "4" }), "2000-05-04");

  const years = buildYearOptions("1946-01-01", "2008-12-31");
  assert.equal(years[0], "2008");
  assert.equal(years[years.length - 1], "1946");
});


