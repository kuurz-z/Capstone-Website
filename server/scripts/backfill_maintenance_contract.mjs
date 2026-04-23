import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import User from "../models/User.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import {
  buildStableMaintenanceRequestId,
  buildStableUserId,
  mapLegacyMaintenanceDocument,
} from "../utils/maintenanceMigration.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldWrite = process.argv.includes("--write");

if (!MONGODB_URI) {
  console.error("No MONGODB_URI found in environment");
  process.exit(1);
}

const formatAssignedTo = (value, userByMongoId) => {
  if (!value) return null;
  const key = value?.toString?.() || String(value);
  const matchedUser = userByMongoId.get(key);

  if (!matchedUser) {
    return typeof value === "string" ? value : key;
  }

  return `${matchedUser.firstName || ""} ${matchedUser.lastName || ""}`.trim() || key;
};

async function backfillUserIds() {
  const usersMissingUserId = await User.find({
    $or: [
      { user_id: { $exists: false } },
      { user_id: null },
      { user_id: "" },
    ],
  })
    .select("_id user_id")
    .lean();

  console.log(
    `${shouldWrite ? "Backfilling" : "Dry run for"} ${usersMissingUserId.length} user record(s) missing user_id.`,
  );

  let updatedCount = 0;

  for (const user of usersMissingUserId) {
    const nextUserId = buildStableUserId(user._id?.toString?.() || user._id);
    console.log(`${user._id} -> ${nextUserId}`);

    if (!shouldWrite) continue;

    const result = await User.updateOne(
      {
        _id: user._id,
        $or: [
          { user_id: { $exists: false } },
          { user_id: null },
          { user_id: "" },
        ],
      },
      { $set: { user_id: nextUserId } },
    );

    if (result.modifiedCount > 0) {
      updatedCount += 1;
    }
  }

  return updatedCount;
}

async function backfillMaintenanceRequests() {
  const legacyCollectionName = "maintenancerequests";
  const collections = await mongoose.connection.db
    .listCollections({ name: legacyCollectionName })
    .toArray();

  if (collections.length === 0) {
    console.log(`Legacy collection "${legacyCollectionName}" not found. Skipping maintenance migration.`);
    return 0;
  }

  const legacyRequests = await mongoose.connection.db
    .collection(legacyCollectionName)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  const users = await User.find({})
    .select("_id user_id branch firstName lastName")
    .lean();

  const userByMongoId = new Map(
    users.map((user) => [String(user._id), user]),
  );

  console.log(
    `${shouldWrite ? "Migrating" : "Dry run for"} ${legacyRequests.length} legacy maintenance record(s).`,
  );

  let insertedCount = 0;

  for (const legacyRequest of legacyRequests) {
    const legacyMongoUserId = legacyRequest?.userId?.toString?.() || legacyRequest?.userId;
    const linkedUser = userByMongoId.get(String(legacyMongoUserId));
    const mappedRequest = mapLegacyMaintenanceDocument(legacyRequest, {
      user_id:
        linkedUser?.user_id ||
        buildStableUserId(legacyMongoUserId || legacyRequest?._id),
      userMongoId: linkedUser?._id || null,
      branch: legacyRequest?.branch || linkedUser?.branch || null,
      assigned_to: formatAssignedTo(legacyRequest?.assignedTo, userByMongoId),
    });

    const requestId =
      mappedRequest.request_id ||
      buildStableMaintenanceRequestId(legacyRequest?._id?.toString?.() || legacyRequest?._id);

    console.log(
      `${legacyRequest?._id} -> ${requestId} | ${mappedRequest.request_type} | ${mappedRequest.status}`,
    );

    if (!shouldWrite) continue;

    const result = await MaintenanceRequest.updateOne(
      { request_id: requestId },
      {
        $setOnInsert: {
          ...mappedRequest,
          request_id: requestId,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      insertedCount += 1;
    }
  }

  return insertedCount;
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const updatedUsers = await backfillUserIds();
  const insertedMaintenance = await backfillMaintenanceRequests();

  console.log(
    shouldWrite
      ? `Updated ${updatedUsers} user(s) and inserted ${insertedMaintenance} maintenance request(s).`
      : "Dry run complete. Re-run with --write to persist changes.",
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Maintenance contract backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure during shutdown
  }
  process.exit(1);
});
