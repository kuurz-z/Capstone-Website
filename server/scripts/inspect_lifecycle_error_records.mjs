import dotenv from "dotenv";
import mongoose from "mongoose";

import { User, Reservation, UtilityReading } from "../models/index.js";

dotenv.config();

const NAME_PATTERNS = [/pix/i, /vince/i, /bryan/i];

function matchesAny(value) {
  const text = String(value || "");
  return NAME_PATTERNS.some((pattern) => pattern.test(text));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const users = await User.find({
    isArchived: { $ne: true },
  })
    .select("_id email firstName lastName")
    .lean();

  const matchedUsers = users.filter((user) =>
    [user.firstName, user.lastName, user.email].some(matchesAny),
  );

  const matchedUserIds = matchedUsers.map((user) => user._id);

  const reservations = await Reservation.find({
    userId: { $in: matchedUserIds },
    isArchived: { $ne: true },
  })
    .select("_id userId roomId status checkInDate checkOutDate selectedBed")
    .sort({ checkInDate: 1, createdAt: 1 })
    .lean();

  const readings = await UtilityReading.find({
    utilityType: "electricity",
    tenantId: { $in: matchedUserIds },
    isArchived: false,
  })
    .select("_id tenantId roomId utilityPeriodId eventType reading date")
    .sort({ date: 1, createdAt: 1 })
    .lean();

  console.log("USERS");
  console.log(JSON.stringify(matchedUsers, null, 2));
  console.log("RESERVATIONS");
  console.log(JSON.stringify(reservations, null, 2));
  console.log("READINGS");
  console.log(JSON.stringify(readings, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[inspect-lifecycle-error-records] ERROR:", error.message || String(error));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
