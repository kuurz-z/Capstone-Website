/**
 * Check: Private rooms with capacity > 1 or beds.length > 1
 * Run: node scripts/check_private_rooms.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Room from "../models/Room.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const badRooms = await Room.find({
  type: "private",
  isArchived: false,
  $or: [
    { capacity: { $gt: 1 } },
    { $expr: { $gt: [{ $size: "$beds" }, 1] } },
  ],
}).lean();

if (badRooms.length === 0) {
  console.log("✅ All private rooms have capacity=1 and ≤1 bed. No migration needed.");
} else {
  console.log(`⚠️  Found ${badRooms.length} private room(s) with bad data:\n`);
  for (const r of badRooms) {
    console.log(`  - ${r.name} (${r.branch}) | capacity: ${r.capacity} | beds: ${r.beds.length} | occupancy: ${r.currentOccupancy}`);
  }
}

await mongoose.disconnect();
