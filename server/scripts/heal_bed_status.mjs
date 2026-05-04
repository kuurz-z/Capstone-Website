/**
 * heal_bed_status.mjs
 * One-time script: fixes beds that are stuck as "available" even though
 * the room has a "reserved" or "moveIn" reservation.
 *
 * Run: node scripts/heal_bed_status.mjs
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error("No MONGO_URI in .env"); process.exit(1); }

await mongoose.connect(MONGO_URI);
console.log("✅ Connected to MongoDB\n");

const Room = mongoose.model("Room", new mongoose.Schema({}, { strict: false }));
const Reservation = mongoose.model("Reservation", new mongoose.Schema({}, { strict: false }));

const rooms = await Room.find({ isArchived: false }).lean();
let healedRooms = 0;
let healedBeds = 0;

for (const room of rooms) {
  const reservations = await Reservation.find({
    roomId: room._id,
    status: { $in: ["reserved", "moveIn"] },
    isArchived: { $ne: true },
  }).lean();

  if (reservations.length === 0) continue;

  const beds = room.beds || [];
  let dirty = false;

  for (const bed of beds) {
    if (bed.status === "maintenance") continue;

    const occupier = reservations.find((r) => r.selectedBed?.id === bed.id);
    if (occupier) {
      const expectedStatus = occupier.status === "moveIn" ? "occupied" : "reserved";
      if (bed.status !== expectedStatus) {
        console.log(`  Room ${room.name} | Bed ${bed.id}: ${bed.status} → ${expectedStatus}`);
        bed.status = expectedStatus;
        bed.occupiedBy = {
          userId: occupier.userId,
          reservationId: occupier._id,
          occupiedSince: occupier.status === "moveIn" ? (occupier.createdAt || new Date()) : null,
        };
        dirty = true;
        healedBeds++;
      }
    }
  }

  if (dirty) {
    await Room.updateOne({ _id: room._id }, { $set: { beds } });
    healedRooms++;
    console.log(`  ✅ Saved ${room.name}`);
  }
}

console.log(`\n🏁 Done — healed ${healedBeds} bed(s) across ${healedRooms} room(s).`);
await mongoose.disconnect();
