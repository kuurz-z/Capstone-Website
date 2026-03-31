/**
 * One-off backfill: create a BillingPeriod + move-in MeterReading
 * for the checked-in tenant in room GP-Q-001.
 *
 * Safe to re-run — idempotent (skips if period/reading already exists).
 *
 * Usage: node scripts/backfill_gpq001_reading.mjs [meterReading]
 *   e.g. node scripts/backfill_gpq001_reading.mjs 1250
 *
 * If no meterReading arg is given it defaults to 0.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { Room, Reservation, BillingPeriod, MeterReading, User } from "../models/index.js";

const DEFAULT_RATE = Number(process.env.DEFAULT_ELECTRICITY_RATE) || 16;
const ROOM_NAME   = "GP-Q-001";
const meterArg    = Number(process.argv[2] ?? 0);

const line = (c = "─") => c.repeat(60);
const ok   = (m) => console.log(`  ✅ ${m}`);
const skip = (m) => console.log(`  ⏭️  ${m}`);
const info = (m) => console.log(`  ℹ️  ${m}`);

async function main() {
  console.log("\n" + line("═"));
  console.log(`  BACKFILL — ${ROOM_NAME} move-in reading`);
  console.log(line("═"));

  await mongoose.connect(process.env.MONGODB_URI);
  info(`Connected to MongoDB`);

  // ── 1. Find the room ───────────────────────────────────────────────────────
  const room = await Room.findOne({ name: ROOM_NAME, isArchived: { $ne: true } }).lean();
  if (!room) {
    console.error(`  ❌ Room "${ROOM_NAME}" not found.`);
    process.exit(1);
  }
  ok(`Room found: ${room.name} (${room._id}) — branch: ${room.branch}`);

  // ── 2. Find checked-in tenant(s) ──────────────────────────────────────────
  const reservations = await Reservation.find({
    roomId: room._id,
    status: "checked-in",
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName email")
    .lean();

  if (reservations.length === 0) {
    console.error(`  ❌ No checked-in tenants found in ${ROOM_NAME}.`);
    process.exit(1);
  }
  ok(`Found ${reservations.length} checked-in tenant(s):`);
  for (const r of reservations) {
    const name = `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim();
    info(`  • ${name} (${r.userId?.email}) — check-in: ${r.checkInDate ? new Date(r.checkInDate).toDateString() : "—"}`);
  }

  // Use the earliest check-in date as the period start
  const checkInDates = reservations
    .map((r) => r.checkInDate ? new Date(r.checkInDate) : new Date())
    .sort((a, b) => a - b);
  const periodStartDate = checkInDates[0];

  // ── 3. Ensure a BillingPeriod exists ──────────────────────────────────────
  let activePeriod = await BillingPeriod.findOne({
    roomId: room._id,
    status: "open",
    isArchived: false,
  }).lean();

  if (activePeriod) {
    skip(`Open BillingPeriod already exists (${activePeriod._id}) — skipping creation`);
  } else {
    // Inherit rate from last closed period if any
    const lastPeriod = await BillingPeriod.findOne({ roomId: room._id, isArchived: false })
      .sort({ startDate: -1 })
      .lean();
    const rate = lastPeriod?.ratePerKwh || DEFAULT_RATE;

    const newPeriod = new BillingPeriod({
      roomId: room._id,
      branch: room.branch,
      startDate: periodStartDate,
      startReading: meterArg,
      ratePerKwh: rate,
      status: "open",
    });
    await newPeriod.save();
    activePeriod = newPeriod.toObject();
    ok(`Created BillingPeriod: start=${meterArg} kWh @ ₱${rate}/kWh, from ${periodStartDate.toDateString()}`);
  }

  // Find the first available admin to use as recordedBy (schema requires it)
  const adminUser = await User.findOne({
    role: { $in: ["branch_admin", "owner"] },
  }).lean();
  if (!adminUser) {
    console.error("  ❌ No admin user found — cannot set recordedBy. Aborting.");
    await mongoose.disconnect();
    process.exit(1);
  }
  info(`Using admin: ${adminUser.firstName} ${adminUser.lastName} as recordedBy`);

  // ── 4. Record move-in readings for each tenant ─────────────────────────────
  const activeTenantIds = reservations.map((r) => r.userId?._id).filter(Boolean);

  for (const res of reservations) {
    const tenantId = res.userId?._id;
    const tenantName = `${res.userId?.firstName || ""} ${res.userId?.lastName || ""}`.trim();
    const readingDate = res.checkInDate ? new Date(res.checkInDate) : periodStartDate;

    // Check for duplicate
    const existing = await MeterReading.findOne({
      roomId: room._id,
      billingPeriodId: activePeriod._id,
      tenantId: tenantId,
      eventType: "move-in",
      isArchived: false,
    }).lean();

    if (existing) {
      skip(`Move-in reading already exists for ${tenantName} — skipping`);
      continue;
    }

    const reading = new MeterReading({
      roomId: room._id,
      branch: room.branch,
      reading: meterArg,
      date: readingDate,
      eventType: "move-in",
      tenantId: tenantId,
      activeTenantIds,
      recordedBy: adminUser._id,
      billingPeriodId: activePeriod._id,
    });
    await reading.save();
    ok(`Move-in reading saved for ${tenantName} — ${meterArg} kWh on ${readingDate.toDateString()}`);
  }

  console.log("\n" + line("═"));
  console.log("  DONE — reading history updated. Refresh the billing page.");
  console.log(line("═") + "\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err.message);
  mongoose.disconnect();
  process.exit(1);
});
