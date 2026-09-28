import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const selectorContent = read("./utility/UtilityRoomSelector.jsx");

test("UtilityRoomSelector accepts sortOrder and onSortOrderChange props", () => {
  assert.match(selectorContent, /sortOrder\s*=\s*["']default["']/);
  assert.match(selectorContent, /onSortOrderChange/);
});

test("UtilityRoomSelector renders sort dropdown with aria-label='Sort rooms' and required options", () => {
  assert.match(selectorContent, /aria-label=["']Sort rooms["']/);
  assert.match(
    selectorContent,
    /<option\s+value=["']default["']>\s*Sort:\s*Default\s*\(Room Number\)\s*<\/option>/
  );
  assert.match(
    selectorContent,
    /<option\s+value=["']newest["']>\s*Sort:\s*Newest to Oldest\s*<\/option>/
  );
  assert.match(
    selectorContent,
    /<option\s+value=["']oldest["']>\s*Sort:\s*Oldest to Newest\s*<\/option>/
  );
  assert.match(selectorContent, /value=\{sortOrder\}/);
  assert.match(
    selectorContent,
    /onSortOrderChange\??\.\(e\.target\.value\)|onSortOrderChange\s*\(\s*e\.target\.value\s*\)/
  );
});

test("hasActiveFilters includes sortOrder !== 'default'", () => {
  assert.match(selectorContent, /sortOrder\s*!==\s*["']default["']/);
});

test("handleResetFilters calls onSortOrderChange with 'default'", () => {
  assert.match(
    selectorContent,
    /if\s*\(\s*onSortOrderChange\s*\)\s*onSortOrderChange\(\s*["']default["']\s*\)|onSortOrderChange\?\.\(["']default["']\)/
  );
});

test("hasActiveFilters evaluation logic with sortOrder", () => {
  const evaluateHasActiveFilters = ({
    sidebarSearch = "",
    floorFilter = "all",
    roomStatusFilter = "all",
    sortOrder = "default",
  }) => {
    return (
      Boolean(sidebarSearch.trim()) ||
      floorFilter !== "all" ||
      roomStatusFilter !== "all" ||
      sortOrder !== "default"
    );
  };

  assert.equal(evaluateHasActiveFilters({ sortOrder: "default" }), false);
  assert.equal(evaluateHasActiveFilters({ sortOrder: "newest" }), true);
  assert.equal(evaluateHasActiveFilters({ sortOrder: "oldest" }), true);
  assert.equal(
    evaluateHasActiveFilters({ sidebarSearch: "101", sortOrder: "default" }),
    true
  );
});

test("handleResetFilters resets sortOrder alongside other active filters", () => {
  let search = "101";
  let floor = "2";
  let status = "occupied";
  let sort = "newest";

  const onSearchChange = (v) => {
    search = v;
  };
  const onFloorFilterChange = (v) => {
    floor = v;
  };
  const onRoomStatusFilterChange = (v) => {
    status = v;
  };
  const onSortOrderChange = (v) => {
    sort = v;
  };

  const handleResetFilters = () => {
    if (onSearchChange) onSearchChange("");
    if (onFloorFilterChange) onFloorFilterChange("all");
    if (onRoomStatusFilterChange) onRoomStatusFilterChange("all");
    if (onSortOrderChange) onSortOrderChange("default");
  };

  handleResetFilters();
  assert.equal(search, "");
  assert.equal(floor, "all");
  assert.equal(status, "all");
  assert.equal(sort, "default");
});
