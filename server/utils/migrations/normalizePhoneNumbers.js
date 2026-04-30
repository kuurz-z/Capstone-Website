/**
 * ============================================================================
 * MIGRATION: Normalize phone numbers to 09XXXXXXXXX format
 * ============================================================================
 *
 * Converts existing reservation phone numbers from E.164 (+639XXXXXXXXX)
 * to the local Philippine format (09XXXXXXXXX) used by the reservation form.
 *
 * Affected fields:
 *   - mobileNumber
 *   - emergencyContact.contactNumber
 *   - employment.employerContact
 *
 * Safe to run multiple times (idempotent): already-normalized numbers
 * starting with "09" are skipped.
 *
 * Run:
 *   node --env-file=.env server/utils/migrations/normalizePhoneNumbers.js
 *
 * Or import and call normalizeReservationPhones() from a script/seeder.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

// ─── Conversion helper ───────────────────────────────────────────────────────

/**
 * Convert a phone string to local 09XXXXXXXXX format.
 * Returns null if the value is not a recognizable PH mobile number.
 */
function toLocalPhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");

  // E.164: +639XXXXXXXXX → 09XXXXXXXXX
  if (digits.startsWith("639") && digits.length === 12) {
    return "0" + digits.slice(2);
  }
  // Already local
  if (digits.startsWith("09") && digits.length === 11) {
    return digits;
  }
  return null; // Not a recognizable PH mobile number — leave unchanged
}

// ─── Migration function ──────────────────────────────────────────────────────

export async function normalizeReservationPhones({ dryRun = false } = {}) {
  const Reservation = mongoose.models.Reservation ||
    (await import("../../../server/models/Reservation.js")).default;

  const cursor = Reservation.find(
    {
      $or: [
        // mobileNumber starting with +63
        { mobileNumber: /^\+639/ },
        // emergencyContact.contactNumber starting with +63
        { "emergencyContact.contactNumber": /^\+639/ },
        // employment.employerContact starting with +63
        { "employment.employerContact": /^\+639/ },
      ],
      isArchived: { $ne: true },
    },
    "mobileNumber emergencyContact employment _id",
  ).lean().cursor();

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    processed++;
    const $set = {};

    const mobile = toLocalPhone(doc.mobileNumber);
    if (mobile && mobile !== doc.mobileNumber) {
      $set.mobileNumber = mobile;
    }

    const ecNum = toLocalPhone(doc.emergencyContact?.contactNumber);
    if (ecNum && ecNum !== doc.emergencyContact?.contactNumber) {
      $set["emergencyContact.contactNumber"] = ecNum;
    }

    const empContact = toLocalPhone(doc.employment?.employerContact);
    if (empContact && empContact !== doc.employment?.employerContact) {
      $set["employment.employerContact"] = empContact;
    }

    if (Object.keys($set).length === 0) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await Reservation.findByIdAndUpdate(doc._id, { $set });
    }

    updated++;
    if (dryRun) {
      console.log(`[DRY RUN] Would update ${doc._id}:`, $set);
    }
  }

  const summary = { processed, updated, skipped, dryRun };
  console.log("Phone normalization complete:", summary);
  return summary;
}

// ─── Standalone runner ───────────────────────────────────────────────────────
// Runs when executed directly: node .../normalizePhoneNumbers.js [--dry-run]

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const dryRun = process.argv.includes("--dry-run");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set. Aborting.");
    process.exit(1);
  }

  console.log(`Starting phone normalization migration (dryRun=${dryRun})…`);

  mongoose.connect(mongoUri)
    .then(async () => {
      // Import model after connection is established
      await import("../../models/Reservation.js");
      const result = await normalizeReservationPhones({ dryRun });
      if (result.updated === 0) {
        console.log("Nothing to update — all phone numbers are already normalized.");
      }
    })
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exit(1);
    })
    .finally(() => mongoose.disconnect());
}
