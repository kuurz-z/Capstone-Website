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

const tabContent = read("./UtilityBillingTab.jsx");

test("UtilityBillingTab declares roomSortOrder state initialized to 'default'", () => {
  assert.match(
    tabContent,
    /const\s*\[\s*roomSortOrder\s*,\s*setRoomSortOrder\s*\]\s*=\s*useState\(["']default["']\)/
  );
});

test("UtilityBillingTab passes sortOrder and onSortOrderChange with page reset to UtilityRoomSelector", () => {
  assert.match(tabContent, /sortOrder=\{roomSortOrder\}/);
  assert.match(
    tabContent,
    /onSortOrderChange=\{.*setRoomSortOrder\(val\);\s*setRoomsPage\(1\);?.*\}/s
  );
});

test("UtilityBillingTab filteredRooms useMemo includes roomSortOrder in dependencies", () => {
  assert.match(
    tabContent,
    /useMemo\(\(\)\s*=>\s*\{.*\},\s*\[rooms,\s*sidebarSearch,\s*floorFilter,\s*roomStatusFilter,\s*roomSortOrder\]\)/s
  );
});

const sortRooms = (list, roomSortOrder) => {
  if (roomSortOrder === "default") {
    return list;
  }

  return [...list].sort((a, b) => {
    const getRoomTimestamp = (room) => {
      const candidates = [
        room.activePeriod?.startDate,
        room.activePeriod?.createdAt,
        room.latestPeriod?.endDate,
        room.latestPeriod?.startDate,
        room.latestPeriod?.createdAt,
        room.targetCloseDate,
        room.createdAt,
        room.updatedAt,
      ];
      for (const val of candidates) {
        if (val) {
          const t = new Date(val).getTime();
          if (Number.isFinite(t) && t > 0) return t;
        }
      }
      if (room.id && typeof room.id === "string" && room.id.length === 24) {
        const hex = room.id.substring(0, 8);
        const sec = parseInt(hex, 16);
        if (Number.isFinite(sec) && sec > 0) return sec * 1000;
      }
      return null;
    };

    const timeA = getRoomTimestamp(a);
    const timeB = getRoomTimestamp(b);
    const hasA = timeA !== null;
    const hasB = timeB !== null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return roomSortOrder === "oldest" ? timeA - timeB : timeB - timeA;
  });
};

test("sortRooms: 'default' preserves original array order", () => {
  const rooms = [
    { id: "1", roomNumber: "101", activePeriod: { startDate: "2026-03-01" } },
    { id: "2", roomNumber: "102", activePeriod: { startDate: "2026-05-01" } },
    { id: "3", roomNumber: "103", activePeriod: { startDate: "2026-01-01" } },
  ];
  const sorted = sortRooms(rooms, "default");
  assert.deepEqual(sorted.map((r) => r.roomNumber), ["101", "102", "103"]);
});

test("sortRooms: 'newest' sorts chronologically descending by latest activity", () => {
  const rooms = [
    { id: "1", roomNumber: "101", activePeriod: { startDate: "2026-01-15T00:00:00Z" } },
    { id: "2", roomNumber: "102", latestPeriod: { endDate: "2026-03-20T00:00:00Z" } },
    { id: "3", roomNumber: "103", activePeriod: { startDate: "2026-02-10T00:00:00Z" } },
  ];
  const sorted = sortRooms(rooms, "newest");
  assert.deepEqual(sorted.map((r) => r.roomNumber), ["102", "103", "101"]);
});

test("sortRooms: 'oldest' sorts chronologically ascending by latest activity", () => {
  const rooms = [
    { id: "1", roomNumber: "101", activePeriod: { startDate: "2026-01-15T00:00:00Z" } },
    { id: "2", roomNumber: "102", latestPeriod: { endDate: "2026-03-20T00:00:00Z" } },
    { id: "3", roomNumber: "103", activePeriod: { startDate: "2026-02-10T00:00:00Z" } },
  ];
  const sorted = sortRooms(rooms, "oldest");
  assert.deepEqual(sorted.map((r) => r.roomNumber), ["101", "103", "102"]);
});

test("sortRooms: rooms with missing or invalid timestamps sort to the bottom in both directions", () => {
  const rooms = [
    { id: "bad1", roomNumber: "NoDate" },
    { id: "good1", roomNumber: "101", activePeriod: { startDate: "2026-02-01T00:00:00Z" } },
    { id: "bad2", roomNumber: "InvalidDate", activePeriod: { startDate: "not-a-date" } },
    { id: "good2", roomNumber: "102", activePeriod: { startDate: "2026-04-01T00:00:00Z" } },
  ];

  const newest = sortRooms(rooms, "newest");
  assert.deepEqual(newest.map((r) => r.roomNumber).slice(0, 2), ["102", "101"]);
  assert.deepEqual(newest.map((r) => r.roomNumber).slice(2).sort(), ["InvalidDate", "NoDate"]);

  const oldest = sortRooms(rooms, "oldest");
  assert.deepEqual(oldest.map((r) => r.roomNumber).slice(0, 2), ["101", "102"]);
  assert.deepEqual(oldest.map((r) => r.roomNumber).slice(2).sort(), ["InvalidDate", "NoDate"]);
});

test("sortRooms: fallback to 24-character hex MongoDB ObjectId creation timestamp", () => {
  const rooms = [
    { id: "65e000000000000000000001", roomNumber: "2024-Room" },
    { id: "679000000000000000000002", roomNumber: "2025-Room" },
  ];

  const newest = sortRooms(rooms, "newest");
  assert.deepEqual(newest.map((r) => r.roomNumber), ["2025-Room", "2024-Room"]);

  const oldest = sortRooms(rooms, "oldest");
  assert.deepEqual(oldest.map((r) => r.roomNumber), ["2024-Room", "2025-Room"]);
});

