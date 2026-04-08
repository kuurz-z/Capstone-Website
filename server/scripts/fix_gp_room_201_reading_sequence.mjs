import dotenv from "dotenv";
import mongoose from "mongoose";

import { Room, UtilityReading, User } from "../models/index.js";

dotenv.config();

const ROOM_NAME = "GP - Room 201";
const EVENTS = [
  {
    email: "pixdummy.5@gmail.com",
    eventType: "move-in",
    date: "2026-03-15T08:30:00.000Z",
    reading: 1204,
  },
  {
    email: "pixdummy.2@gmail.com",
    eventType: "move-in",
    date: "2026-03-22T09:00:00.000Z",
    reading: 1244,
  },
  {
    email: "pixdummy.10@gmail.com",
    eventType: "move-in",
    date: "2026-03-29T10:00:00.000Z",
    reading: 1304,
  },
  {
    email: "pixdummy.2@gmail.com",
    eventType: "move-out",
    date: "2026-04-03T17:00:00.000Z",
    reading: 1324,
  },
  {
    email: "pixdummy.10@gmail.com",
    eventType: "move-out",
    date: "2026-04-05T16:00:00.000Z",
    reading: 1364,
  },
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
    email: { $in: [...new Set(EVENTS.map((entry) => entry.email))] },
    isArchived: { $ne: true },
  })
    .select("_id email")
    .lean();

  const byEmail = new Map(users.map((user) => [user.email, user]));

  let updatedCount = 0;
  for (const event of EVENTS) {
    const user = byEmail.get(event.email);
    if (!user) {
      throw new Error(`User not found: ${event.email}`);
    }

    const result = await UtilityReading.updateMany(
      {
        roomId: room._id,
        utilityType: "electricity",
        tenantId: user._id,
        eventType: event.eventType,
        date: new Date(event.date),
        isArchived: false,
      },
      {
        $set: {
          reading: event.reading,
        },
      },
    );

    updatedCount += result.modifiedCount;
    console.log(
      `${event.eventType} ${event.email} ${event.date} => ${event.reading} | matched=${result.matchedCount} modified=${result.modifiedCount}`,
    );
  }

  const targetIds = users.map((user) => user._id);
  const finalReadings = await UtilityReading.find({
    roomId: room._id,
    utilityType: "electricity",
    tenantId: { $in: targetIds },
    eventType: { $in: ["move-in", "move-out"] },
    isArchived: false,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  console.log("\nFinal sequence:");
  let prev = null;
  let monotonic = true;
  for (const reading of finalReadings) {
    const value = Number(reading.reading || 0);
    if (prev != null && value < prev) monotonic = false;
    prev = value;
    console.log(
      `- ${reading.eventType} | ${new Date(reading.date).toISOString()} | ${value}`,
    );
  }

  console.log(`\nTotal updated: ${updatedCount}`);
  console.log(`Monotonic: ${monotonic}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[fix-gp-room-201-reading-sequence] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
