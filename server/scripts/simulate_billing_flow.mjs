/**
 * ============================================================================
 * BILLING FLOW SIMULATION — DRY RUN (READ-ONLY)
 * ============================================================================
 *
 * This script traces what WOULD happen from move-in → billing without
 * writing anything to the database.
 *
 * - If moved-in tenants exist in DB, uses real data.
 * - If not, falls back to MOCK mode using the first available room + user.
 *
 * Run: node scripts/simulate_billing_flow.mjs
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config();

// ── Models ──────────────────────────────────────────────────────────────────
import { Reservation, Room, Bill, BillingPeriod, MeterReading } from "../models/index.js";

// ── Formatting helpers ───────────────────────────────────────────────────────
const fmt = (n) => `₱${Number(n || 0).toFixed(2)}`;
const line = (char = "─", len = 60) => char.repeat(len);
const section = (title) => {
  console.log("\n" + line("═"));
  console.log(`  ${title}`);
  console.log(line("═"));
};
const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const step = (n, msg) => console.log(`\n  [Step ${n}] ${msg}`);

// ── Pro-rata water calculation (mirrors billingController) ───────────────────
const r2 = (n) => Math.round(n * 100) / 100;
const computeWaterShare = (roomType, totalWater, tenantCount) => {
  if (!totalWater || totalWater <= 0) return 0;
  switch (roomType) {
    case "quadruple-sharing": return 0;
    case "double-sharing":    return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
    case "private":           return r2(totalWater);
    default:                  return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
  }
};

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + line("█"));
  console.log("  LILYCREST DMS — BILLING FLOW SIMULATION (DRY RUN)");
  console.log("  Everything shown is READ-ONLY. Zero writes to DB.");
  console.log(line("█"));

  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME || "lilycrest" });
  console.log("\n  🔌 Connected to MongoDB (read-only mode)");

  // ─── STEP 1: Find a moved-in reservation ────────────────────────────────
  section("STEP 1 — Find a moved-in tenant");

  const reservation = await Reservation.findOne({ status: "moveIn", isArchived: { $ne: true } })
    .populate("userId", "firstName lastName email")
    .populate("roomId", "name branch type capacity beds price monthlyPrice")
    .lean();

  let MOCK_MODE = false;
  let tenant, room;

  if (!reservation) {
    warn("No moved-in reservations found in DB — switching to MOCK mode.");
    MOCK_MODE = true;

    // Pull any available room and user to use as stand-ins
    const anyRoom = await Room.findOne({ isArchived: { $ne: true } })
      .select("name branch type capacity beds price monthlyPrice")
      .lean();
    const anyUser = await mongoose.model("User").findOne({ role: "user" })
      .select("firstName lastName email")
      .lean();

    if (!anyRoom || !anyUser) {
      warn("No room or user found in DB either. Cannot simulate.");
      await mongoose.disconnect();
      process.exit(0);
    }

    // Build a mock reservation object that mirrors what a real one would look like
    tenant = anyUser;
    room = anyRoom;
    Object.assign(reservation || {}, {
      userId: anyUser,
      roomId: anyRoom,
      checkInDate: dayjs().subtract(5, "day").toDate(),
      leaseDuration: 6,
      monthlyRent: anyRoom.monthlyPrice || anyRoom.price || 5000,
      totalPrice: anyRoom.monthlyPrice || anyRoom.price || 5000,
      customCharges: [],
    });
    // Assign back since reservation was null
    Object.assign(reservation = {
      userId: anyUser,
      roomId: anyRoom,
      _id: new mongoose.Types.ObjectId(),
      checkInDate: dayjs().subtract(5, "day").toDate(),
      leaseDuration: 6,
      monthlyRent: anyRoom.monthlyPrice || anyRoom.price || 5000,
      totalPrice: anyRoom.monthlyPrice || anyRoom.price || 5000,
      customCharges: [],
    }, {});
  } else {
    tenant = reservation.userId;
    room = reservation.roomId;
  }

  if (MOCK_MODE) {
    console.log("\n  ⚡ MOCK MODE — Using stand-in data (no real move-in in DB)");
  }

  ok(`Tenant: ${tenant?.firstName} ${tenant?.lastName} (${tenant?.email})`);
  ok(`Room: ${room?.name} | Branch: ${room?.branch} | Type: ${room?.type}`);
  ok(`Move-in date: ${dayjs(reservation.checkInDate).format("MMMM D, YYYY")}${MOCK_MODE ? " (simulated)" : ""}`);
  ok(`Lease duration: ${reservation.leaseDuration || "Not set"} month(s)`);
  ok(`Monthly rent: ${fmt(reservation.monthlyRent || reservation.totalPrice)}`);

  // ─── STEP 2: What happened at move-in? ───────────────────────────────────
  section("STEP 2 — What happens at move-in (status → 'moveIn')");

  info("Moving in does NOT create a bill automatically.");
  info("The only thing that happens at move-in:");
  console.log("    1. Reservation.status → 'moveIn'");
  console.log("    2. Bed marked as occupied (occupiedBy) in the Room document");
  console.log("    3. Room.currentOccupancy incremented via occupancyManager");
  console.log("    4. If meterReading is passed: a MeterReading (move-in event) is recorded");
  console.log("       for the room's active BillingPeriod (electricity module only)");
  console.log("");
  console.log("  ❌ No Bill document is created.");
  console.log("  ❌ No BillingPeriod is created.");
  console.log("  ❌ No 'table/segment' appears in the billing section for the tenant yet.");

  // ─── STEP 3: Check if a BillingPeriod exists (electricity module) ─────────
  section("STEP 3 — Electricity BillingPeriod status for this room");

  const activePeriod = await BillingPeriod.findOne({
    roomId: room._id,
    status: "open",
    isArchived: false,
  }).lean();

  if (activePeriod) {
    ok(`Active BillingPeriod found: ${dayjs(activePeriod.startDate).format("MMM D, YYYY")} onwards`);
    ok(`Start reading: ${activePeriod.startReading} kWh | Rate: ₱${activePeriod.ratePerKwh}/kWh`);

    // Check meter readings in this period
    const readings = await MeterReading.find({ billingPeriodId: activePeriod._id }).sort({ date: 1 }).lean();
    info(`Meter readings in this period: ${readings.length}`);
    for (const r of readings) {
      console.log(`    • [${r.eventType}] ${dayjs(r.date).format("MMM D, YYYY")} — ${r.reading} kWh`);
    }
  } else {
    warn("No active BillingPeriod for this room. Electricity billing cannot be computed yet.");
    warn("Admin must open a BillingPeriod first (set start reading + rate).");
  }

  // ─── STEP 4: Check existing bills ─────────────────────────────────────────
  section("STEP 4 — Existing Bills for this tenant");

  const existingBills = await Bill.find({
    userId: tenant._id,
    isArchived: false,
  }).sort({ billingMonth: -1 }).lean();

  if (existingBills.length === 0) {
    warn("No bills exist for this tenant yet.");
    info("Bills are created by the admin manually via 'Generate Room Bill'.");
  } else {
    ok(`Found ${existingBills.length} bill(s):`);
    for (const b of existingBills) {
      const month = dayjs(b.billingMonth).format("MMMM YYYY");
      const status = b.status.toUpperCase();
      const penalty = b.charges?.penalty > 0 ? ` | Penalty: ${fmt(b.charges.penalty)}` : "";
      console.log(`    • [${status}] ${month} — ${fmt(b.totalAmount)}${penalty}`);
    }
  }

  // ─── STEP 5: Simulate what a new bill WOULD look like ────────────────────
  section("STEP 5 — Simulate generating a bill for this tenant (DRY RUN)");

  const billingMonth = dayjs().startOf("month");
  const monthLabel = billingMonth.format("MMMM YYYY");

  // Check if bill already exists for current month
  const duplicateCheck = await Bill.findOne({
    userId: tenant._id,
    reservationId: reservation._id,
    billingMonth: { $gte: billingMonth.toDate(), $lt: billingMonth.add(1, "month").toDate() },
    isArchived: false,
  }).lean();

  if (duplicateCheck) {
    warn(`A bill ALREADY EXISTS for ${monthLabel}. Would be blocked with 409 Conflict.`);
  } else {
    info(`No bill exists yet for ${monthLabel}. Simulating what would be created...`);
  }

  // Find all moved-in tenants in the same room (for pro-rata split)
  const roomReservations = await Reservation.find({
    roomId: room._id,
    status: "moveIn",
    isArchived: { $ne: true },
  }).populate("userId", "firstName lastName").lean();

  const tenantCount = roomReservations.length;
  info(`Room has ${tenantCount} moved-in tenant(s) — pro-rata split applies`);

  // Simulate charges (using example utility values)
  const EXAMPLE_ELECTRICITY = 800; // ₱ total room electricity
  const EXAMPLE_WATER =       300; // ₱ total room water
  const monthlyRent = reservation.monthlyRent || reservation.totalPrice || room?.price || 0;
  const daysInMonth = billingMonth.daysInMonth();
  const checkInDay = dayjs(reservation.checkInDate);
  const isFirstMonth = checkInDay.isSame(billingMonth, "month");
  const daysInRoom = isFirstMonth
    ? daysInMonth - checkInDay.date() + 1
    : daysInMonth;

  // Pro-rata calculation (same as billing controller)
  const totalOccupantDays = roomReservations.reduce((sum, r) => {
    const ci = dayjs(r.checkInDate);
    const isFirst = ci.isSame(billingMonth, "month");
    const days = isFirst ? daysInMonth - ci.date() + 1 : daysInMonth;
    return sum + Math.max(1, days);
  }, 0);

  const share = daysInRoom / totalOccupantDays;
  const electricityShare = r2(EXAMPLE_ELECTRICITY * share);
  const waterShare = computeWaterShare(room?.type, EXAMPLE_WATER, tenantCount);
  const customChargesTotal = (reservation.customCharges || []).reduce((s, c) => s + c.amount, 0);
  const totalAmount = monthlyRent + electricityShare + waterShare + customChargesTotal;

  console.log("");
  console.log("  ┌─────────────────────────────────────────────┐");
  console.log(`  │  SIMULATED BILL — ${monthLabel.padEnd(27)}│`);
  console.log("  ├─────────────────────────────────────────────┤");
  console.log(`  │  Tenant:       ${(tenant.firstName + " " + tenant.lastName).padEnd(29)}│`);
  console.log(`  │  Room:         ${(room?.name || "N/A").padEnd(29)}│`);
  console.log(`  │  Branch:       ${(room?.branch || "N/A").padEnd(29)}│`);
  console.log(`  │  Room type:    ${(room?.type || "N/A").padEnd(29)}│`);
  console.log(`  │  Days in room: ${String(daysInRoom + " / " + daysInMonth + " days").padEnd(29)}│`);
  console.log(`  │  Pro-rata:     ${(Math.round(share * 100) + "%").padEnd(29)}│`);
  console.log("  ├─────────────────────────────────────────────┤");
  console.log(`  │  Rent:         ${fmt(monthlyRent).padEnd(29)}│`);
  console.log(`  │  Electricity:  ${fmt(electricityShare).padEnd(29)}│`);
  console.log(`  │    (room total: ${fmt(EXAMPLE_ELECTRICITY)}, your share: ${Math.round(share * 100)}%)`);
  console.log(`  │  Water:        ${fmt(waterShare).padEnd(29)}│`);
  if (customChargesTotal > 0) {
    console.log(`  │  Custom fees:  ${fmt(customChargesTotal).padEnd(29)}│`);
  }
  console.log("  ├─────────────────────────────────────────────┤");
  console.log(`  │  TOTAL:        ${fmt(totalAmount).padEnd(29)}│`);
  console.log(`  │  Status:       ${"pending".padEnd(29)}│`);
  console.log(`  │  Due date:     ${dayjs().add(1, "month").date(15).format("MMMM D, YYYY").padEnd(29)}│`);
  console.log("  └─────────────────────────────────────────────┘");

  // ─── STEP 6: What admin must do to trigger billing ────────────────────────
  section("STEP 6 — What admin must do to create a real bill");

  console.log("  Bill generation is still admin-driven. Payment settlement now defaults to online checkout.\n");
  console.log("  A. Admin marks tenant as 'moveIn' (with optional meterReading)");
  console.log("     → Reservation.status = 'moveIn'");
  console.log("     → Bed occupied, occupancy incremented");
  console.log("     → If meterReading given: MeterReading (move-in event) recorded\n");
  console.log("  B. (Electricity only) Admin opens a BillingPeriod for the room");
  console.log("     → POST /api/electricity/periods");
  console.log("     → Sets start reading + rate per kWh\n");
  console.log("  C. Admin generates the monthly bill");
  console.log("     → POST /api/billing/generate-room-bill");
  console.log("     → Admin enters room electricity + water totals");
  console.log("     → System computes pro-rata share for each tenant");
  console.log("     → Bill documents are created in DB (one per tenant)");
  console.log("     → Email sent to each tenant via sendBillGeneratedEmail()\n");
  console.log("  D. Tenant opens the Billing page and starts online checkout");
  console.log("     → POST /api/payments/bill/:billId/checkout");
  console.log("     → Browser is redirected to PayMongo checkout\n");
  console.log("  E. After payment, tenant returns to /applicant/billing");
  console.log("     → GET /api/payments/session/:sessionId/status");
  console.log("     → Polling path verifies status and is safe to retry\n");
  console.log("  F. PayMongo webhook confirms the payment server-to-server");
  console.log("     → POST /api/webhooks/paymongo");
  console.log("     → Shared bill settlement helper updates the bill + payment ledger\n");
  console.log("  G. If branch staff accepts an assisted offline payment");
  console.log("     → Admin records it manually via /api/billing/:billId/mark-paid");
  console.log("     → Legacy proof verification is for already-submitted historical records only\n");
  console.log("  H. (Automated) If unpaid past due date:");
  console.log("     → Cron Job 3 (midnight): Bill.status → 'overdue'");
  console.log("     → Cron Job 4 (00:10): ₱50/day penalty applied to charges.penalty");

  console.log("\n" + line("═"));
  console.log("  SIMULATION COMPLETE — No changes written to database.");
  console.log(line("═") + "\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Simulation error:", err);
  mongoose.disconnect();
  process.exit(1);
});
