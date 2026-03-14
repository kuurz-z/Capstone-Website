/**
 * Migration Script: Reservation Status Update
 * 
 * Converts old statuses to new lifecycle:
 * - "confirmed" → "reserved"
 * - "grace_period" → "reserved"
 * 
 * Also removes deprecated grace period fields.
 * 
 * Usage: node server/scripts/migrate-reservation-status.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  console.log("🔄 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const db = mongoose.connection.db;
  const collection = db.collection("reservations");

  // 1. Rename "confirmed" → "reserved"
  const confirmedResult = await collection.updateMany(
    { status: "confirmed" },
    { $set: { status: "reserved" } }
  );
  console.log(`📌 confirmed → reserved: ${confirmedResult.modifiedCount} updated`);

  // 2. Rename "grace_period" → "reserved"
  const graceResult = await collection.updateMany(
    { status: "grace_period" },
    { $set: { status: "reserved" } }
  );
  console.log(`📌 grace_period → reserved: ${graceResult.modifiedCount} updated`);

  // 3. Remove deprecated fields
  const cleanupResult = await collection.updateMany(
    {},
    { $unset: { gracePeriodDays: "", graceDeadline: "" } }
  );
  console.log(`🧹 Removed grace period fields from ${cleanupResult.modifiedCount} documents`);

  // 4. Summary
  const total = confirmedResult.modifiedCount + graceResult.modifiedCount;
  console.log(`\n✅ Migration complete: ${total} reservations updated`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
