/**
 * Migration Script: Reservation Status Update
 *
 * Safely migrates legacy reservation lifecycle values to the canonical set.
 *
 * Legacy changes handled:
 * - "confirmed" -> "reserved"
 * - "grace_period" -> "cancelled" (legacy hold-over state; the canonical
 *   jobs now handle expiry and no-show cancellation directly)
 * - Removes deprecated grace period fields
 *
 * Usage:
 *   node server/scripts/migrate-reservation-status.js
 *   node server/scripts/migrate-reservation-status.js --write
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  CANONICAL_RESERVATION_STATUSES,
  normalizeReservationStatus,
} from "../utils/lifecycleNaming.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldWrite = process.argv.includes("--write");
const mode = shouldWrite ? "WRITE" : "DRY RUN";

const LEGACY_STATUS_MAP = {
  confirmed: "reserved",
  grace_period: "cancelled",
};

const countByStatus = async (collection, status) =>
  collection.countDocuments({ status });

async function summarizeLegacyState(collection) {
  const counts = {
    confirmed: await countByStatus(collection, "confirmed"),
    grace_period: await countByStatus(collection, "grace_period"),
    nonCanonical: await collection.countDocuments({
      status: { $nin: [...CANONICAL_RESERVATION_STATUSES, ...Object.keys(LEGACY_STATUS_MAP)] },
    }),
    gracePeriodFields: await collection.countDocuments({
      $or: [
        { gracePeriodDays: { $exists: true, $ne: null } },
        { graceDeadline: { $exists: true, $ne: null } },
      ],
    }),
  };

  return counts;
}

async function applyMigration(collection) {
  const results = {};

  results.confirmedToReserved = await collection.updateMany(
    { status: "confirmed" },
    { $set: { status: "reserved" } },
  );

  results.gracePeriodToCancelled = await collection.updateMany(
    { status: "grace_period" },
    { $set: { status: "cancelled" } },
  );

  results.cleanupDeprecatedFields = await collection.updateMany(
    {
      $or: [
        { gracePeriodDays: { $exists: true, $ne: null } },
        { graceDeadline: { $exists: true, $ne: null } },
      ],
    },
    { $unset: { gracePeriodDays: "", graceDeadline: "" } },
  );

  return results;
}

async function migrate() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  console.log(`🔄 Connecting to MongoDB... [${mode}]`);
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const db = mongoose.connection.db;
  const collection = db.collection("reservations");

  const before = await summarizeLegacyState(collection);
  console.log("📋 Legacy counts before migration:");
  console.log(JSON.stringify(before, null, 2));

  if (!shouldWrite) {
    console.log("\nℹ️ Dry run only. Re-run with --write to persist changes.");
    await mongoose.disconnect();
    console.log("🔌 Disconnected");
    return;
  }

  const results = await applyMigration(collection);

  console.log(`📌 confirmed → reserved: ${results.confirmedToReserved.modifiedCount} updated`);
  console.log(`📌 grace_period → cancelled: ${results.gracePeriodToCancelled.modifiedCount} updated`);

  console.log(
    `🧹 Removed grace period fields from ${results.cleanupDeprecatedFields.modifiedCount} documents`,
  );

  const after = await summarizeLegacyState(collection);
  console.log("\n📋 Legacy counts after migration:");
  console.log(JSON.stringify(after, null, 2));

  const normalizedAfter = await collection.countDocuments({
    status: { $nin: CANONICAL_RESERVATION_STATUSES },
  });
  console.log(`\n✅ Migration complete: ${results.confirmedToReserved.modifiedCount + results.gracePeriodToCancelled.modifiedCount} reservations updated`);
  console.log(`ℹ️ Non-canonical statuses remaining: ${normalizedAfter}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
