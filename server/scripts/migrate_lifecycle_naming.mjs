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

const shouldWrite = process.argv.includes("--write");
const modeLabel = shouldWrite ? "WRITE" : "DRY RUN";

const statusMap = {
  "checked-in": "moveIn",
  "checked-out": "moveOut",
};

const eventTypeMap = {
  "move-in": "moveIn",
  "move-out": "moveOut",
  "regular-billing": "regularBilling",
  "period-start": "periodStart",
  "period-end": "periodEnd",
  "manual-adjustment": "manualAdjustment",
};

async function countLegacyValues(db) {
  const reservations = db.collection("reservations");
  const utilityReadings = db.collection("utilityreadings");
  const utilityPeriods = db.collection("utilityperiods");
  const bedHistories = db.collection("bedhistories");

  const [checkedInCount, checkedOutCount, moveInDateAliasCount, moveOutDateAliasCount] =
    await Promise.all([
      reservations.countDocuments({ status: "checked-in" }),
      reservations.countDocuments({ status: "checked-out" }),
      reservations.countDocuments({
        checkInDate: { $exists: true, $ne: null },
        $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
      }),
      reservations.countDocuments({
        checkOutDate: { $exists: true, $ne: null },
        $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
      }),
    ]);

  const utilityEventCounts = {};
  for (const [legacyType] of Object.entries(eventTypeMap)) {
    utilityEventCounts[legacyType] = await utilityReadings.countDocuments({
      eventType: legacyType,
    });
  }

  const [periodSegmentLegacyCount, bedMoveInAliasCount, bedMoveOutAliasCount] =
    await Promise.all([
      utilityPeriods.countDocuments({
        $or: [
          { "segments.startEventType": { $in: Object.keys(eventTypeMap) } },
          { "segments.endEventType": { $in: Object.keys(eventTypeMap) } },
        ],
      }),
      bedHistories.countDocuments({
        checkInDate: { $exists: true, $ne: null },
        $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
      }),
      bedHistories.countDocuments({
        checkOutDate: { $exists: true, $ne: null },
        $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
      }),
    ]);

  return {
    reservations: {
      checkedInCount,
      checkedOutCount,
      moveInDateAliasCount,
      moveOutDateAliasCount,
    },
    utilityReadings: utilityEventCounts,
    utilityPeriods: {
      periodSegmentLegacyCount,
    },
    bedHistories: {
      bedMoveInAliasCount,
      bedMoveOutAliasCount,
    },
  };
}

async function runMigration(db) {
  const reservations = db.collection("reservations");
  const utilityReadings = db.collection("utilityreadings");
  const utilityPeriods = db.collection("utilityperiods");
  const bedHistories = db.collection("bedhistories");

  const results = {};

  results.checkedInToMoveIn = await reservations.updateMany(
    { status: "checked-in" },
    { $set: { status: "moveIn" } },
  );

  results.checkedOutToMoveOut = await reservations.updateMany(
    { status: "checked-out" },
    { $set: { status: "moveOut" } },
  );

  results.copyMoveInDate = await reservations.updateMany(
    {
      checkInDate: { $exists: true, $ne: null },
      $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
    },
    [{ $set: { moveInDate: "$checkInDate" } }],
  );

  results.copyMoveOutDate = await reservations.updateMany(
    {
      checkOutDate: { $exists: true, $ne: null },
      $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
    },
    [{ $set: { moveOutDate: "$checkOutDate" } }],
  );

  for (const [legacyType, canonicalType] of Object.entries(eventTypeMap)) {
    results[`reading_${legacyType}`] = await utilityReadings.updateMany(
      { eventType: legacyType },
      { $set: { eventType: canonicalType } },
    );
  }

  results.utilityPeriods = await utilityPeriods.updateMany(
    {
      $or: [
        { "segments.startEventType": { $in: Object.keys(eventTypeMap) } },
        { "segments.endEventType": { $in: Object.keys(eventTypeMap) } },
      ],
    },
    [
      {
        $set: {
          segments: {
            $map: {
              input: "$segments",
              as: "segment",
              in: {
                $mergeObjects: [
                  "$$segment",
                  {
                    startEventType: {
                      $switch: {
                        branches: Object.entries(eventTypeMap).map(([legacyType, canonicalType]) => ({
                          case: { $eq: ["$$segment.startEventType", legacyType] },
                          then: canonicalType,
                        })),
                        default: "$$segment.startEventType",
                      },
                    },
                    endEventType: {
                      $switch: {
                        branches: Object.entries(eventTypeMap).map(([legacyType, canonicalType]) => ({
                          case: { $eq: ["$$segment.endEventType", legacyType] },
                          then: canonicalType,
                        })),
                        default: "$$segment.endEventType",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  );

  results.bedHistoryMoveIn = await bedHistories.updateMany(
    {
      checkInDate: { $exists: true, $ne: null },
      $or: [{ moveInDate: { $exists: false } }, { moveInDate: null }],
    },
    [{ $set: { moveInDate: "$checkInDate" } }],
  );

  results.bedHistoryMoveOut = await bedHistories.updateMany(
    {
      checkOutDate: { $exists: true, $ne: null },
      $or: [{ moveOutDate: { $exists: false } }, { moveOutDate: null }],
    },
    [{ $set: { moveOutDate: "$checkOutDate" } }],
  );

  return results;
}

async function main() {
  console.log(`[${modeLabel}] Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const before = await countLegacyValues(db);
  console.log(`[${modeLabel}] Legacy counts before migration:`);
  console.log(JSON.stringify(before, null, 2));

  if (!shouldWrite) {
    console.log(`[${modeLabel}] No changes applied. Re-run with --write to persist.`);
    await mongoose.disconnect();
    return;
  }

  const results = await runMigration(db);
  console.log(`[${modeLabel}] Update summary:`);
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([key, value]) => [
          key,
          value.modifiedCount ?? value.matchedCount ?? null,
        ]),
      ),
      null,
      2,
    ),
  );

  const after = await countLegacyValues(db);
  console.log(`[${modeLabel}] Legacy counts after migration:`);
  console.log(JSON.stringify(after, null, 2));

  await mongoose.disconnect();
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
