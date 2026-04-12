/**
 * Data Repair Script: Room Availability & Occupancy Sync
 *
 * Problem:
 *   The `room.available` boolean and `room.currentOccupancy` counter can drift
 *   out of sync when reservations are cancelled or deleted without properly
 *   decrementing the room counters. This causes rooms that have free beds to
 *   appear as fully booked, blocking new reservations.
 *
 * What this script does:
 *   1. Loads every room from MongoDB
 *   2. Counts the actual active reservations per room (status: pending/reserved/moveIn)
 *   3. Compares the live count against `currentOccupancy` and `available`
 *   4. Writes corrections for any room that is out of sync
 *
 * Usage:
 *   node server/scripts/fix-room-availability.js
 *   (run from the repo root, or from the /server directory)
 *
 * Safe to re-run — it only touches rooms with stale data.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set. Check your .env file.");
  process.exit(1);
}

// ── Inline minimal schemas (avoids loading the full app stack) ────────────────

const reservationSchema = new mongoose.Schema(
  {
    roomId: mongoose.Schema.Types.ObjectId,
    status: String,
    isArchived: Boolean,
  },
  { collection: "reservations" },
);

const roomSchema = new mongoose.Schema(
  {
    name: String,
    roomNumber: String,
    branch: String,
    type: String,
    capacity: Number,
    currentOccupancy: Number,
    available: Boolean,
    isArchived: Boolean,
  },
  { collection: "rooms" },
);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄  Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected\n");

  const ReservationModel = mongoose.model("_RepairReservation", reservationSchema);
  const RoomModel = mongoose.model("_RepairRoom", roomSchema);

  const ACTIVE_STATUSES = ["pending", "reserved", "moveIn"];

  // Aggregate: count active reservations per room in a single DB call
  const counts = await ReservationModel.aggregate([
    {
      $match: {
        status: { $in: ACTIVE_STATUSES },
        isArchived: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$roomId",
        count: { $sum: 1 },
      },
    },
  ]);

  // Build a lookup map: roomId (string) → count
  const countByRoom = {};
  for (const entry of counts) {
    if (entry._id) countByRoom[String(entry._id)] = entry.count;
  }

  // Load all non-archived rooms
  const rooms = await RoomModel.find({ isArchived: { $ne: true } }).lean();
  console.log(`📋  Found ${rooms.length} active rooms to inspect\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const room of rooms) {
    const roomLabel = room.name || room.roomNumber || String(room._id);
    const liveOccupancy = countByRoom[String(room._id)] ?? 0;
    const correctAvailable = liveOccupancy < room.capacity;

    const occupancyStale = room.currentOccupancy !== liveOccupancy;
    const availableStale = room.available !== correctAvailable;

    if (!occupancyStale && !availableStale) {
      skippedCount++;
      continue; // nothing to fix
    }

    // Print what we're correcting
    const changes = [];
    if (occupancyStale)
      changes.push(
        `currentOccupancy: ${room.currentOccupancy} → ${liveOccupancy}`,
      );
    if (availableStale)
      changes.push(`available: ${room.available} → ${correctAvailable}`);

    console.log(`🔧  [${roomLabel}] (capacity ${room.capacity})`);
    for (const c of changes) console.log(`     • ${c}`);

    await RoomModel.findByIdAndUpdate(room._id, {
      currentOccupancy: liveOccupancy,
      available: correctAvailable,
    });

    fixedCount++;
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`✅  Fixed   : ${fixedCount} room(s)`);
  console.log(`⏭️   Skipped : ${skippedCount} room(s) (already correct)`);
  console.log("─────────────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("🔌  Disconnected. Done!");
}

main().catch((err) => {
  console.error("❌  Script failed:", err);
  process.exit(1);
});
