import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const summary = {
    reservations: {
      checkedIn: await db.collection("reservations").countDocuments({ status: "checked-in" }),
      checkedOut: await db.collection("reservations").countDocuments({ status: "checked-out" }),
      missingMoveInDate: await db.collection("reservations").countDocuments({
        checkInDate: { $exists: true, $ne: null },
        $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
      }),
      missingMoveOutDate: await db.collection("reservations").countDocuments({
        checkOutDate: { $exists: true, $ne: null },
        $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
      }),
    },
    utilityReadings: {
      moveIn: await db.collection("utilityreadings").countDocuments({ eventType: "move-in" }),
      moveOut: await db.collection("utilityreadings").countDocuments({ eventType: "move-out" }),
      regularBilling: await db.collection("utilityreadings").countDocuments({ eventType: "regular-billing" }),
      periodStart: await db.collection("utilityreadings").countDocuments({ eventType: "period-start" }),
      periodEnd: await db.collection("utilityreadings").countDocuments({ eventType: "period-end" }),
      manualAdjustment: await db.collection("utilityreadings").countDocuments({ eventType: "manual-adjustment" }),
    },
    utilityPeriods: {
      legacySegments: await db.collection("utilityperiods").countDocuments({
        $or: [
          { "segments.startEventType": { $in: ["move-in", "move-out", "regular-billing", "period-start", "period-end", "manual-adjustment"] } },
          { "segments.endEventType": { $in: ["move-in", "move-out", "regular-billing", "period-start", "period-end", "manual-adjustment"] } },
        ],
      }),
    },
    bedHistories: {
      missingMoveInDate: await db.collection("bedhistories").countDocuments({
        checkInDate: { $exists: true, $ne: null },
        $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
      }),
      missingMoveOutDate: await db.collection("bedhistories").countDocuments({
        checkOutDate: { $exists: true, $ne: null },
        $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
      }),
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  const failures = Object.values(summary.reservations).some(Boolean)
    || Object.values(summary.utilityReadings).some(Boolean)
    || Object.values(summary.utilityPeriods).some(Boolean)
    || Object.values(summary.bedHistories).some(Boolean);

  await mongoose.disconnect();
  if (failures) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure
  }
  process.exit(1);
});
