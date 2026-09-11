import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateRoomDetailsCost,
  calculatePaymentBreakdown,
} from "../utils/roomDetailsPricing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. Pricing logic contract for Room Modal ─────────────────
const quadRoom = {
  type: "Quadruple",
  regularLongRate: 6000,
  regularShortRate: 7000,
  monthlyPrice: 5400,
  shortTermRate: 6300,
  isDiscountEnabled: true,
  quadrupleDiscountPercent: 10,
  longTermDiscountPercent: 10,
};

// Short term cost
const shortTermCost = calculateRoomDetailsCost({
  room: quadRoom,
  roomType: "Quadruple",
  activeLeaseDuration: "1",
  calculateApplianceFees: () => 200,
});

assert.equal(shortTermCost.activeMonthlyRate, 6300, "Base monthly rate should be 6300");
assert.equal(shortTermCost.applianceFeesAmount, 200, "Appliance fees should be 200");
const totalMonthlyStayRate = shortTermCost.activeMonthlyRate + shortTermCost.applianceFeesAmount;
assert.equal(totalMonthlyStayRate, 6500, "Total monthly rate should be 6500");

// ── 2. RoomDetailsModal.jsx Source Code Structural Invariants ─
const modalPath = path.resolve(__dirname, "RoomDetailsModal.jsx");
const modalSource = fs.readFileSync(modalPath, "utf-8");

// A. Old payment breakdown elements must NOT be present in RoomDetailsModal.jsx
assert.equal(
  modalSource.includes("1. Initial Reservation Deposit:"),
  false,
  "RoomDetailsModal must NOT contain Initial Reservation Deposit breakdown math (belongs in Step 1)",
);
assert.equal(
  modalSource.includes("1 Month Advance Rent:"),
  false,
  "RoomDetailsModal must NOT contain Advance Rent breakdown line (belongs in Step 1)",
);
assert.equal(
  modalSource.includes("1 Month Security Deposit (Refundable):"),
  false,
  "RoomDetailsModal must NOT contain Security Deposit breakdown line (belongs in Step 1)",
);
assert.equal(
  modalSource.includes("Less: Credited Reservation Deposit:"),
  false,
  "RoomDetailsModal must NOT contain Credited Reservation Deposit line (belongs in Step 1)",
);
assert.equal(
  modalSource.includes("2. Net Pre-Move-In Cashout:"),
  false,
  "RoomDetailsModal must NOT contain Net Pre-Move-In Cashout breakdown line (belongs in Step 1)",
);
assert.equal(
  modalSource.includes("Est. Net Pre-Move-In Balance"),
  false,
  "RoomDetailsModal must NOT display Est. Net Pre-Move-In Balance (should display Monthly Stay Rate)",
);

// B. New clean Rate Summary elements MUST be present in RoomDetailsModal.jsx
assert.equal(
  modalSource.includes("Monthly Rate Summary") || modalSource.includes("Rate Summary"),
  true,
  "RoomDetailsModal must contain a clean Rate Summary card",
);
assert.equal(
  modalSource.includes("Step 1"),
  true,
  "RoomDetailsModal must have an informative note pointing to Step 1 for move-in balance and deposits",
);
assert.equal(
  modalSource.includes("Monthly Stay Rate"),
  true,
  "RoomDetailsModal footer must display Monthly Stay Rate",
);

// C. Intended Move-in Date Single Calendar Indicator
assert.match(
  modalSource,
  /hide-native-date-indicator/,
  "RoomDetailsModal intended move-in date input must suppress native webkit picker indicator to prevent duplicate icons"
);

console.log("✔ RoomDetailsModal.scope.test.mjs passed all scope and separation contract tests");
