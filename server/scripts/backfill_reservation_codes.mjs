import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import Reservation from "../models/Reservation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldWrite = process.argv.includes("--write");

if (!MONGODB_URI) {
  console.error("No MONGODB_URI found in environment");
  process.exit(1);
}

const qualifiesForReservationCode = (reservation) =>
  ["reserved", "moveIn", "moveOut"].includes(reservation.status) ||
  reservation.paymentStatus === "paid";

async function main() {
  await mongoose.connect(MONGODB_URI);

  const candidates = await Reservation.find({
    $or: [
      { reservationCode: { $exists: false } },
      { reservationCode: null },
      { reservationCode: "" },
    ],
    isArchived: { $ne: true },
  })
    .select("_id status paymentStatus reservationCode")
    .lean();

  const targets = candidates.filter(qualifiesForReservationCode);

  console.log(
    `${shouldWrite ? "Backfilling" : "Dry run for"} ${targets.length} reservation(s) missing reservation codes.`,
  );

  let updated = 0;

  for (const reservation of targets) {
    const code = await Reservation.generateUniqueReservationCode();

    console.log(
      `${reservation._id} | ${reservation.status} | ${reservation.paymentStatus || "-"} -> ${code}`,
    );

    if (!shouldWrite) continue;

    const result = await Reservation.updateOne(
      {
        _id: reservation._id,
        $or: [
          { reservationCode: { $exists: false } },
          { reservationCode: null },
          { reservationCode: "" },
        ],
      },
      { $set: { reservationCode: code } },
    );

    if (result.modifiedCount > 0) {
      updated += 1;
    }
  }

  console.log(
    shouldWrite
      ? `Updated ${updated} reservation(s).`
      : "Dry run complete. Re-run with --write to persist changes.",
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure during shutdown
  }
  process.exit(1);
});
