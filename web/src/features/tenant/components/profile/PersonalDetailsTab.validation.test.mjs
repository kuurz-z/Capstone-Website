import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateField,
  parseDateParts,
  getDaysInMonth,
  composeDate,
  buildYearOptions,
  toTitleCase,
} from "./personalDetailsValidation.js";

const source = fs.readFileSync(new URL("./PersonalDetailsTab.jsx", import.meta.url), "utf8");

test("toTitleCase formats names and words correctly", () => {
  assert.equal(toTitleCase("vince gamer"), "Vince Gamer");
  assert.equal(toTitleCase("JOHN DOE"), "John Doe");
  assert.equal(toTitleCase("filipino-chinese"), "Filipino Chinese");
});

test("validateField enforces first name and last name constraints", () => {
  // Required
  assert.equal(validateField("firstName", ""), "First name is required");
  assert.equal(validateField("lastName", "   "), "Last name is required");

  // Min length
  assert.equal(validateField("firstName", "A"), "At least 2 characters required");
  assert.equal(validateField("lastName", "B"), "At least 2 characters required");

  // Max length (50 chars)
  const longName = "A".repeat(51);
  assert.equal(validateField("firstName", longName), "50 characters maximum");
  assert.equal(validateField("lastName", longName), "50 characters maximum");

  // Format (letters, hyphens, apostrophes only)
  assert.equal(validateField("firstName", "John123"), "Letters, hyphens, and apostrophes only");
  assert.equal(validateField("lastName", "Smith@Home"), "Letters, hyphens, and apostrophes only");

  // Valid
  assert.equal(validateField("firstName", "John"), null);
  assert.equal(validateField("firstName", "Mary-Jane"), null);
  assert.equal(validateField("lastName", "O'Connor"), null);
  assert.equal(validateField("lastName", "Dela Cruz"), null);
});

test("validateField enforces middle name constraints", () => {
  // Empty/null is allowed (optional)
  assert.equal(validateField("middleName", ""), null);
  assert.equal(validateField("middleName", null), null);

  // Max length (50 chars)
  const longName = "M".repeat(51);
  assert.equal(validateField("middleName", longName), "50 characters maximum");

  // Format (letters, hyphens, apostrophes only)
  assert.equal(validateField("middleName", "Santos123"), "Letters, hyphens, and apostrophes only");
  assert.equal(validateField("middleName", "Dela@Cruz"), "Letters, hyphens, and apostrophes only");

  // Valid
  assert.equal(validateField("middleName", "Santos"), null);
  assert.equal(validateField("middleName", "Dela Cruz"), null);
  assert.equal(validateField("middleName", "Mary-Ann"), null);
});

test("validateField enforces nationality constraints", () => {
  // Empty is allowed (optional)
  assert.equal(validateField("nationality", ""), null);
  assert.equal(validateField("nationality", null), null);

  // Max length (50 chars)
  const longNat = "F".repeat(51);
  assert.equal(validateField("nationality", longNat), "50 characters maximum");

  // Invalid characters
  assert.equal(validateField("nationality", "Filipino123"), "Letters, hyphens, and apostrophes only");
  assert.equal(validateField("nationality", "PH#1"), "Letters, hyphens, and apostrophes only");

  // Valid
  assert.equal(validateField("nationality", "Filipino"), null);
  assert.equal(validateField("nationality", "Filipino-American"), null);
});

test("validateField enforces occupation constraints", () => {
  // Empty is allowed (optional)
  assert.equal(validateField("occupation", ""), null);
  assert.equal(validateField("occupation", null), null);

  // Max length (60 chars)
  const longOcc = "Engineer ".repeat(8);
  assert.equal(validateField("occupation", longOcc), "60 characters maximum");

  // Invalid characters
  assert.equal(validateField("occupation", "<script>alert(1)</script>"), "Invalid characters in occupation");

  // Valid
  assert.equal(validateField("occupation", "Software Engineer"), null);
  assert.equal(validateField("occupation", "Nurse / Health Worker"), null);
  assert.equal(validateField("occupation", "Sales & Marketing Lead"), null);
});

test("validateField enforces date of birth constraints (minimum 18 years old)", () => {
  const currentYear = new Date().getFullYear();

  // Incomplete / Invalid
  assert.equal(validateField("dateOfBirth", "2000-01"), "Complete date required (Month, Day, Year)");
  assert.equal(validateField("dateOfBirth", "invalid-date-string"), "Complete date required (Month, Day, Year)");

  // Future date
  const futureYear = currentYear + 1;
  assert.equal(validateField("dateOfBirth", `${futureYear}-01-01`), "Birth date cannot be in the future");

  // Under 18 years old (e.g. born 5 years ago)
  const minorYear = currentYear - 5;
  assert.equal(validateField("dateOfBirth", `${minorYear}-05-15`), "Must be at least 18 years old");

  // Over 100 years old
  const ancientYear = currentYear - 105;
  assert.equal(validateField("dateOfBirth", `${ancientYear}-01-01`), "Birth date must be within the last 100 years");

  // Exactly or over 18 years old
  const adultYear = currentYear - 20;
  assert.equal(validateField("dateOfBirth", `${adultYear}-01-15`), null);
});

test("validateField validates gender and civil status enums", () => {
  assert.equal(validateField("gender", "male"), null);
  assert.equal(validateField("gender", "female"), null);
  assert.equal(validateField("gender", "invalid_gender"), "Invalid gender option selected");

  assert.equal(validateField("civilStatus", "single"), null);
  assert.equal(validateField("civilStatus", "married"), null);
  assert.equal(validateField("civilStatus", "invalid_status"), "Invalid civil status option selected");
});

test("parseDateParts, getDaysInMonth, and composeDate operate correctly", () => {
  // Parsing ISO and standard strings
  assert.deepEqual(parseDateParts("1998-10-15"), { year: "1998", month: "10", day: "15" });
  assert.deepEqual(parseDateParts("1998-10-15T00:00:00.000Z"), { year: "1998", month: "10", day: "15" });
  assert.deepEqual(parseDateParts(""), { year: "", month: "", day: "" });

  // Dynamic days per month
  assert.equal(getDaysInMonth("2024", "02"), 29); // Leap year
  assert.equal(getDaysInMonth("2023", "02"), 28); // Non-leap year
  assert.equal(getDaysInMonth("2024", "04"), 30); // April
  assert.equal(getDaysInMonth("2024", "01"), 31); // January

  // Compose
  assert.equal(composeDate({ year: "1995", month: "3", day: "7" }), "1995-03-07");

  // Year options for 18+
  const years = buildYearOptions(18, 100);
  const currentYear = new Date().getFullYear();
  assert.equal(years[0], String(currentYear - 18));
  assert.equal(years[years.length - 1], String(currentYear - 100));
});

test("validateField validates phone and contact number constraints", () => {
  // Empty is allowed (optional)
  assert.equal(validateField("phone", ""), null);
  assert.equal(validateField("phone", null), null);

  // Invalid formats
  assert.equal(validateField("phone", "123"), "Please enter a valid phone number");
  assert.equal(validateField("phone", "abc"), "Please enter a valid phone number");
  assert.equal(validateField("phone", "09123"), "Please enter a valid phone number");

  // Valid formats
  assert.equal(validateField("phone", "+639171234567"), null);
  assert.equal(validateField("phone", "09171234567"), null);
  assert.equal(validateField("phone", "+63 917 123 4567"), null);
  assert.equal(validateField("phone", "+12025550123"), null);
});

test("validateField validates current address constraints", () => {
  // Empty is allowed (optional)
  assert.equal(validateField("address", ""), null);
  assert.equal(validateField("address", null), null);

  // Max length (200 chars)
  const longAddress = "A".repeat(201);
  assert.equal(validateField("address", longAddress), "200 characters maximum");

  // Valid address
  assert.equal(validateField("address", "123 Boni Ave, Plainview, Mandaluyong City"), null);
});

test("validateField validates emergency contact person name", () => {
  // Empty is allowed individually
  assert.equal(validateField("emergencyContact", ""), null);
  assert.equal(validateField("emergencyContact", null), null);

  // Min length
  assert.equal(validateField("emergencyContact", "A"), "At least 2 characters required");

  // Max length (100 chars)
  const longName = "A".repeat(101);
  assert.equal(validateField("emergencyContact", longName), "100 characters maximum");

  // Format
  assert.equal(validateField("emergencyContact", "Mama123"), "Letters, hyphens, and apostrophes only");
  assert.equal(validateField("emergencyContact", "Jane@Home"), "Letters, hyphens, and apostrophes only");

  // Valid
  assert.equal(validateField("emergencyContact", "Maria Santos"), null);
  assert.equal(validateField("emergencyContact", "John O'Connor"), null);
  assert.equal(validateField("emergencyContact", "Mary-Jane Watson"), null);
});

test("validateField validates emergency relationship options", () => {
  // Empty is allowed individually
  assert.equal(validateField("emergencyRelationship", ""), null);
  assert.equal(validateField("emergencyRelationship", null), null);

  // Valid options
  assert.equal(validateField("emergencyRelationship", "parent"), null);
  assert.equal(validateField("emergencyRelationship", "sibling"), null);
  assert.equal(validateField("emergencyRelationship", "spouse"), null);
  assert.equal(validateField("emergencyRelationship", "relative"), null);
  assert.equal(validateField("emergencyRelationship", "guardian"), null);
  assert.equal(validateField("emergencyRelationship", "friend"), null);
  assert.equal(validateField("emergencyRelationship", "colleague"), null);
  assert.equal(validateField("emergencyRelationship", "other"), null);

  // Invalid option
  assert.equal(validateField("emergencyRelationship", "invalid_relation"), "Invalid relationship option selected");
});

test("validateField validates emergency phone and rejects collisions with personal phone", () => {
  // Empty is allowed individually
  assert.equal(validateField("emergencyPhone", ""), null);
  assert.equal(validateField("emergencyPhone", null), null);

  // Invalid format
  assert.equal(validateField("emergencyPhone", "12345"), "Please enter a valid phone number");

  // Valid phone
  assert.equal(validateField("emergencyPhone", "+639181234567"), null);
  assert.equal(validateField("emergencyPhone", "09181234567"), null);

  // Collision with personal phone
  assert.equal(
    validateField("emergencyPhone", "+639171234567", { personalPhone: "+639171234567" }),
    "Emergency contact number cannot be the same as your personal mobile number",
  );
  assert.equal(
    validateField("emergencyPhone", "09171234567", { personalPhone: "+639171234567" }),
    "Emergency contact number cannot be the same as your personal mobile number",
  );
});

test("validateEmergencyContactGroup enforces group completeness and cross-field rules", async () => {
  const { validateEmergencyContactGroup, RELATIONSHIP_OPTIONS } = await import("./personalDetailsValidation.js");

  assert.ok(Array.isArray(RELATIONSHIP_OPTIONS) && RELATIONSHIP_OPTIONS.length >= 8);

  // All empty -> valid
  assert.deepEqual(validateEmergencyContactGroup({}), { isValid: true, errors: {} });
  assert.deepEqual(
    validateEmergencyContactGroup({ emergencyContact: "", emergencyRelationship: "", emergencyPhone: "" }),
    { isValid: true, errors: {} },
  );

  // Partially filled -> requires all 3
  const partial1 = validateEmergencyContactGroup({ emergencyContact: "Maria Santos" });
  assert.equal(partial1.isValid, false);
  assert.equal(partial1.errors.emergencyRelationship, "Relationship is required");
  assert.equal(partial1.errors.emergencyPhone, "Emergency contact number is required");

  const partial2 = validateEmergencyContactGroup({ emergencyRelationship: "parent", emergencyPhone: "+639181234567" });
  assert.equal(partial2.isValid, false);
  assert.equal(partial2.errors.emergencyContact, "Contact person is required");

  // Fully filled and valid
  const complete = validateEmergencyContactGroup({
    emergencyContact: "Maria Santos",
    emergencyRelationship: "parent",
    emergencyPhone: "+639181234567",
  }, "+639170001122");
  assert.equal(complete.isValid, true);
  assert.deepEqual(complete.errors, {});

  // Fully filled but phone collision
  const collision = validateEmergencyContactGroup({
    emergencyContact: "Maria Santos",
    emergencyRelationship: "parent",
    emergencyPhone: "+639170001122",
  }, "+639170001122");
  assert.equal(collision.isValid, false);
  assert.equal(collision.errors.emergencyPhone, "Emergency contact number cannot be the same as your personal mobile number");
});

test("PersonalDetailsTab component enforces visual limits, counters, and birthday calendar picker", () => {
  assert.match(source, /BirthdayField/);
  assert.match(source, /type="date"/);
  assert.match(source, /showPicker/);
  assert.match(source, /maxLength=\{50\}/);
  assert.match(source, /maxLength=\{60\}/);
  assert.match(source, /charCounter/);
  assert.match(source, /Must be at least 18 years old/);
});

test("PersonalDetailsTab BirthdayField uses a unified single-click date picker with 18+ age constraints", () => {
  assert.match(
    source,
    /type="date"/,
    "BirthdayField must render an input with type='date'"
  );
  assert.match(
    source,
    /max=\{maxDate\}/,
    "BirthdayField must constrain max to 18 years old date"
  );
  assert.match(
    source,
    /showPicker/,
    "BirthdayField must trigger showPicker on click for smooth calendar opening"
  );
  assert.match(
    source,
    /cutoff\s*=\s*new Date\(today\.getFullYear\(\)\s*-\s*18/,
    "BirthdayField must compute cutoff using Date arithmetic to prevent leap-year invalid date strings"
  );
  assert.match(
    source,
    /minWidth:\s*"26px"/,
    "BirthdayField action buttons must meet WCAG minimum touch target dimensions"
  );
});


