import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("RoomConfigModal.jsx defines private room occupancy calculation and unified tenant card", () => {
  const modalCode = read("./RoomConfigModal.jsx");

  // Verify private room occupant calculation logic
  assert.match(modalCode, /const privateOccupiedBed = bedsArray\.find/);
  assert.match(modalCode, /const isRoomOccupied = Boolean/);
  assert.match(modalCode, /const privateOccupantName =/);

  // Verify unified occupant card and vacant state
  assert.match(modalCode, /Room Occupant Details/);
  assert.match(modalCode, /View Tenant Profile/);
  assert.match(modalCode, /handleOpenOccupantDetails\(\s*privateOccupiedBed/);
  assert.match(modalCode, /Room is Available/);
  assert.match(modalCode, /Available\s*<\/span>/);

  // Verify Total Capacity tile displays 1 pax (Entire Room) for private rooms
  assert.match(modalCode, /1 pax \(Entire Room\)/);

  // Verify shared rooms still support bed maintenance actions
  assert.match(modalCode, /handleToggleMaintenance/);
});

test("DoubleDeckRoomCard.jsx extracts occupant name and displays Entire Room for private rooms", () => {
  const cardCode = read("./DoubleDeckRoomCard.jsx");

  // Verify private occupant extraction
  assert.match(cardCode, /const privateOccupiedBed = \(room\.beds \|\| \[\]\)\.find/);
  assert.match(cardCode, /const privateOccupantFirstName = privateOccupantFullName/);

  // Verify Entire Room layout with semantic status badge
  assert.match(cardCode, /Entire Room/);
  assert.match(cardCode, /\(Occupied\)/);
  assert.match(cardCode, /\(Reserved\)/);
  assert.match(cardCode, /Vacant/);
});

test("DoubleDeckRoomCard.jsx enforces bg-transparent design tokens for bed pills and status badges without tinted backgrounds", () => {
  const cardCode = read("./DoubleDeckRoomCard.jsx");

  // Verify getDeckPillStyle uses bg-transparent for statuses
  assert.match(cardCode, /bg:\s*"bg-transparent"/);

  // Verify Entire Room badge has bg-transparent
  assert.match(cardCode, /border-slate-200 dark:border-slate-700 bg-transparent flex items-center gap-1\.5/);

  // Verify absence of tinted pill backgrounds
  assert.doesNotMatch(cardCode, /bg-rose-50\/80/);
  assert.doesNotMatch(cardCode, /bg-amber-50\/80/);
  assert.doesNotMatch(cardCode, /bg-emerald-50\/80/);
  assert.doesNotMatch(cardCode, /dark:bg-rose-950\/30/);
  assert.doesNotMatch(cardCode, /dark:bg-amber-950\/30/);
  assert.doesNotMatch(cardCode, /dark:bg-emerald-950\/30/);
});

test("Private room occupant extraction correctly parses occupant name and first name", () => {
  const extractOccupantFirstName = (room) => {
    const beds = room.beds || [];
    const occupiedBed = beds.find(
      (b) =>
        b.status === "occupied" ||
        b.status === "reserved" ||
        b.status === "locked" ||
        Boolean(b.occupiedBy?.userId) ||
        Boolean(b.occupiedBy?.name) ||
        Boolean(b.occupiedBy?.fullName) ||
        Boolean(b.tenantName) ||
        Boolean(b.userName),
    );

    const rawOccupant = occupiedBed?.occupiedBy || room.occupiedBy || {};
    const fullName =
      rawOccupant.name ||
      rawOccupant.fullName ||
      rawOccupant.tenantName ||
      rawOccupant.userName ||
      occupiedBed?.userName ||
      occupiedBed?.tenantName ||
      (rawOccupant.firstName || rawOccupant.lastName
        ? `${rawOccupant.firstName || ""} ${rawOccupant.lastName || ""}`.trim()
        : null);

    return fullName ? fullName.split(" ")[0] : null;
  };

  // Test with bed occupant
  const roomWithBedOccupant = {
    type: "private",
    beds: [
      { id: "bed-1", status: "occupied", occupiedBy: { name: "Maria Clara Santos" } },
      { id: "bed-2", status: "available" },
    ],
  };
  assert.equal(extractOccupantFirstName(roomWithBedOccupant), "Maria");

  // Test with room-level occupant
  const roomWithRoomOccupant = {
    type: "private",
    occupiedBy: { firstName: "Juan", lastName: "Dela Cruz" },
    beds: [],
  };
  assert.equal(extractOccupantFirstName(roomWithRoomOccupant), "Juan");

  // Test with vacant room
  const vacantRoom = {
    type: "private",
    beds: [
      { id: "bed-1", status: "available" },
      { id: "bed-2", status: "available" },
    ],
  };
  assert.equal(extractOccupantFirstName(vacantRoom), null);
});
