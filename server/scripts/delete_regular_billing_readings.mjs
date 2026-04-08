import mongoose from "mongoose";
import dotenv from "dotenv";

import { UtilityReading } from "../models/index.js";

dotenv.config();

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const filter = {
    eventType: "regular-billing",
  };

  const toDelete = await UtilityReading.countDocuments(filter);
  if (toDelete === 0) {
    console.log("[delete-regular-billing] No regular-billing readings found.");
    return;
  }

  const result = await UtilityReading.deleteMany(filter);
  console.log(
    `[delete-regular-billing] Deleted ${result.deletedCount || 0} regular-billing readings permanently.`,
  );
}

main()
  .catch((error) => {
    console.error(
      `[delete-regular-billing] ERROR: ${error.message || String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // no-op
    }
  });
