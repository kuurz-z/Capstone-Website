import { register } from "node:module";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import { mount } from "../../test-fixtures/reactMountHarness.mjs";

register("../../test-fixtures/jsxLoaderHooks.mjs", import.meta.url);

let CustomDatePicker;

before(async () => {
  ({ default: CustomDatePicker } = await import("./CustomDatePicker.jsx"));
});

test("CustomDatePicker renders input field with placeholder and calendar trigger", () => {
  const { container, unmount } = mount(
    React.createElement(CustomDatePicker, {
      id: "test-date-picker",
      value: "",
      placeholder: "Select move-in date...",
      min: "2026-09-14",
      max: "2026-11-14",
    })
  );

  const input = container.querySelector("input[readonly], button.custom-date-picker-trigger");
  assert.ok(input, "Expected an input or trigger button to be rendered");
  unmount();
});

test("CustomDatePicker opens calendar popover on click and NEVER displays a 'Today' button", () => {
  const { container, unmount } = mount(
    React.createElement(CustomDatePicker, {
      id: "test-date-picker",
      value: "",
      min: "2026-09-14",
      max: "2026-11-14",
    })
  );

  const trigger = container.querySelector(".custom-date-picker-trigger") || container.querySelector("input");
  assert.ok(trigger, "Trigger element exists");

  // Open calendar popover
  act(() => {
    trigger.click();
  });

  const calendarPopover = container.querySelector(".custom-date-picker-popover");
  assert.ok(calendarPopover, "Expected calendar popover to appear after click");

  // Verify NO 'Today' button is present anywhere in the popover or footer
  const buttons = Array.from(calendarPopover.querySelectorAll("button"));
  const todayButton = buttons.find((b) => b.textContent.trim().toLowerCase() === "today");
  assert.equal(todayButton, undefined, "There must NOT be a 'Today' button in the calendar popover");

  unmount();
});

test("CustomDatePicker disables dates before minDate (e.g. today) and does NOT place a today outline on them", () => {
  const { container, unmount } = mount(
    React.createElement(CustomDatePicker, {
      id: "test-date-picker",
      value: "",
      min: "2026-09-14",
      max: "2026-11-14",
      defaultMonth: new Date(2026, 8, 1), // September 2026
    })
  );

  const trigger = container.querySelector(".custom-date-picker-trigger") || container.querySelector("input");
  act(() => {
    trigger.click();
  });

  // Dates 1 to 13 of September should be disabled
  const dayButtons = Array.from(container.querySelectorAll(".custom-calendar-day-btn"));
  assert.ok(dayButtons.length >= 28, "Expected calendar days to be rendered");

  const day11 = dayButtons.find((btn) => btn.getAttribute("data-date") === "2026-09-11");
  assert.ok(day11, "Day 11 (Sep 11) should be present in September 2026 view");
  assert.equal(day11.disabled || day11.getAttribute("aria-disabled") === "true", true, "Day 11 must be disabled");

  // Crucial check: No special 'today' highlight or square border on disabled today
  assert.doesNotMatch(
    day11.className,
    /border-black|border-slate-900|today-outline|is-today-active/,
    "Disabled date 11 must NOT have any special today outline or border"
  );

  unmount();
});

test("CustomDatePicker enables dates within [min, max] and clicking an enabled date triggers onChange", () => {
  let selectedValue = "";
  const handleChange = (val) => {
    selectedValue = val;
  };

  const { container, unmount } = mount(
    React.createElement(CustomDatePicker, {
      id: "test-date-picker",
      value: "",
      min: "2026-09-14",
      max: "2026-11-14",
      defaultMonth: new Date(2026, 8, 1),
      onChange: handleChange,
    })
  );

  const trigger = container.querySelector(".custom-date-picker-trigger") || container.querySelector("input");
  act(() => {
    trigger.click();
  });

  const dayButtons = Array.from(container.querySelectorAll(".custom-calendar-day-btn"));
  const day14 = dayButtons.find((btn) => btn.getAttribute("data-date") === "2026-09-14");
  assert.ok(day14, "Day 14 (Sep 14) should be present");
  assert.equal(day14.disabled, false, "Day 14 must be enabled");

  act(() => {
    day14.click();
  });

  assert.equal(selectedValue, "2026-09-14", "Expected onChange to be called with '2026-09-14'");
  unmount();
});

test("CustomDatePicker Clear button resets value via onChange('')", () => {
  let selectedValue = "2026-09-15";
  const handleChange = (val) => {
    selectedValue = val;
  };

  const { container, unmount } = mount(
    React.createElement(CustomDatePicker, {
      id: "test-date-picker",
      value: "2026-09-15",
      min: "2026-09-14",
      max: "2026-11-14",
      defaultMonth: new Date(2026, 8, 1),
      onChange: handleChange,
    })
  );

  const trigger = container.querySelector(".custom-date-picker-trigger") || container.querySelector("input");
  act(() => {
    trigger.click();
  });

  const clearButton = container.querySelector(".custom-calendar-clear-btn");
  assert.ok(clearButton, "Expected a clear button in calendar footer");

  act(() => {
    clearButton.click();
  });

  assert.equal(selectedValue, "", "Expected onChange to be called with empty string on clear");
  unmount();
});
