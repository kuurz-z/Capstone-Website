import dotenv from "dotenv";
import mongoose from "mongoose";

import { Room, User, UtilityReading } from "../models/index.js";

dotenv.config();

const ROOM_NAME = "GP - Room 201";
const TARGET_EMAILS = [
  "pixdummy.5@gmail.com",
  "pixdummy.2@gmail.com",
  "pixdummy.10@gmail.com",
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(
    process.env.MONGODB_URI,
    process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {},
  );

  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: ROOM_NAME }, { roomNumber: ROOM_NAME }],
  }).lean();

  if (!room) {
    throw new Error(`Room not found: ${ROOM_NAME}`);
  }

  const users = await User.find({
    email: { $in: TARGET_EMAILS },
    isArchived: { $ne: true },
  })
    .select("_id email")
    .lean();

  const userIds = users.map((user) => user._id);
  if (!userIds.length) {
    throw new Error("No target users found");
  }

  const result = await UtilityReading.updateMany(
    {
      utilityType: "electricity",
      roomId: room._id,
      tenantId: { $in: userIds },
      eventType: { $in: ["move-in", "move-out"] },
      isArchived: false,
    },
    {
      $set: {
        utilityPeriodId: null,
      },
    },
  );

  console.log(`Matched readings: ${result.matchedCount}`);
  console.log(`Detached readings: ${result.modifiedCount}`);

  const verify = await UtilityReading.find({
    utilityType: "electricity",
    roomId: room._id,
    tenantId: { $in: userIds },
    eventType: { $in: ["move-in", "move-out"] },
    isArchived: false,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  for (const reading of verify) {
    console.log(
      `${reading.eventType} | tenant=${reading.tenantId} | date=${new Date(reading.date).toISOString()} | period=${reading.utilityPeriodId || "null"}`,
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[detach-gp-room-201-tenant-readings] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
