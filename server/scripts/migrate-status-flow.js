/**
 * ============================================================================
 * MIGRATION: Status-Driven Reservation Flow
 * ============================================================================
 *
 * One-time migration to backfill existing reservations that are stuck at
 * "pending" status but actually belong to a later stage based on their
 * boolean flags and data-presence.
 *
 * Usage:
 *   node server/scripts/migrate-status-flow.js
 *
 * Safe to run multiple times — only updates records that need it.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) {
  console.error("❌ No MONGODB_URI found in environment");
  process.exit(1);
}

async function migrate() {
  console.log("🔄 Connecting to database...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const Reservation = mongoose.model(
    "Reservation",
    new mongoose.Schema({}, { strict: false, collection: "reservations" }),
  );

  // Find all "pending" reservations that should be at a later stage
  const pendingReservations = await Reservation.find({
    status: "pending",
    isArchived: { $ne: true },
  }).lean();

  console.log(`📋 Found ${pendingReservations.length} pending reservations to analyze\n`);

  let updated = 0;
  let skipped = 0;
  const changes = [];

  for (const r of pendingReservations) {
    let newStatus = null;

    // Check from most advanced to least advanced
    if (r.paymentStatus === "paid" || r.status === "reserved") {
      newStatus = "reserved"; // Already confirmed
    } else if (r.proofOfPaymentUrl && r.firstName && r.lastName) {
      newStatus = "payment_pending"; // Has application + payment proof
    } else if (r.firstName && r.lastName && r.mobileNumber && r.visitApproved) {
      newStatus = "payment_pending"; // Has application, visit approved
    } else if (r.visitApproved === true) {
      newStatus = "visit_approved"; // Visit approved, awaiting application
    } else if (r.visitDate && r.agreedToPrivacy) {
      newStatus = "visit_pending"; // Visit scheduled, awaiting admin approval
    }
    // else: stays "pending" (just room selected)

    if (newStatus && newStatus !== r.status) {
      changes.push({
        id: r._id,
        from: r.status,
        to: newStatus,
        name: `${r.firstName || "?"} ${r.lastName || "?"}`,
      });

      await Reservation.updateOne(
        { _id: r._id },
        { $set: { status: newStatus } },
      );
      updated++;
    } else {
      skipped++;
    }
  }

  console.log("─────────────────────────────────────────");
  console.log(`✅ Updated: ${updated} reservations`);
  console.log(`⏭️  Skipped: ${skipped} (already correct)`);
  console.log("─────────────────────────────────────────\n");

  if (changes.length > 0) {
    console.log("Changes made:");
    for (const c of changes) {
      console.log(`  ${c.id} (${c.name}): ${c.from} → ${c.to}`);
    }
  }

  await mongoose.disconnect();
  console.log("\n✅ Migration complete. Database disconnected.");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
