/**
 * Migration: Enforce private rooms = capacity 1, max 1 bed
 *
 * Safe rules:
 *  - capacity → 1
 *  - beds → keep only the OCCUPIED or RESERVED bed if one exists,
 *            otherwise keep the first bed
 *  - currentOccupancy → min(currentOccupancy, 1)
 *  - available → currentOccupancy < 1
 *
 * Run: node scripts/migrate_private_rooms.mjs
 * Idempotent: safe to run multiple times.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Room from "../models/Room.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log("✅ Connected to MongoDB\n");

const privateRooms = await Room.find({ type: "private", isArchived: false });

let fixed = 0;
let skipped = 0;

for (const room of privateRooms) {
  const needsFix = room.capacity !== 1 || room.beds.length > 1;
  if (!needsFix) {
    skipped++;
    continue;
  }

  // Pick which bed to keep:
  // Priority: occupied → reserved → maintenance → first bed
  const priority = ["occupied", "reserved", "maintenance"];
  let keepBed = null;
  for (const status of priority) {
    keepBed = room.beds.find((b) => b.status === status);
    if (keepBed) break;
  }
  if (!keepBed) keepBed = room.beds[0] ?? { id: "bed-1", position: "single", status: "available" };

  const oldCapacity = room.capacity;
  const oldBeds = room.beds.length;
  const oldOccupancy = room.currentOccupancy;

  room.capacity = 1;
  room.beds = [keepBed];
  room.currentOccupancy = Math.min(room.currentOccupancy, 1);
  room.available = room.currentOccupancy < 1;

  await room.save();
  fixed++;

  console.log(
    `  ✔ ${room.name} (${room.branch})\n` +
    `     capacity: ${oldCapacity} → 1 | beds: ${oldBeds} → 1 | occupancy: ${oldOccupancy} → ${room.currentOccupancy}\n` +
    `     kept bed: "${keepBed.id}" (${keepBed.position}, ${keepBed.status})`
  );
}

console.log(`\n✅ Done. Fixed: ${fixed} | Already correct: ${skipped}`);
await mongoose.disconnect();
