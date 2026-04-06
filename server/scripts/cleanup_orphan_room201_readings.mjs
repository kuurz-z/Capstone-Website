import dotenv from "dotenv";
import mongoose from "mongoose";

import { UtilityReading, Reservation, Room } from "../models/index.js";

dotenv.config();

const ROOM_NAME = "GP - Room 201";

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const room = await Room.findOne({
    isArchived: { $ne: true },
    name: ROOM_NAME,
  }).lean();

  if (!room) throw new Error(`Room not found: ${ROOM_NAME}`);

  const tenantReadings = await UtilityReading.find({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
    eventType: { $in: ["move-in", "move-out"] },
    tenantId: { $ne: null },
  })
    .select("_id tenantId eventType date reading")
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const archivedIds = [];

  for (const reading of tenantReadings) {
    const matchingReservation = await Reservation.findOne({
      roomId: room._id,
      userId: reading.tenantId,
      isArchived: { $ne: true },
      ...(reading.eventType === "move-in"
        ? { checkInDate: { $gte: new Date(new Date(reading.date).setUTCHours(0, 0, 0, 0)), $lte: new Date(new Date(reading.date).setUTCHours(23, 59, 59, 999)) } }
        : { checkOutDate: { $gte: new Date(new Date(reading.date).setUTCHours(0, 0, 0, 0)), $lte: new Date(new Date(reading.date).setUTCHours(23, 59, 59, 999)) } }),
    }).lean();

    if (!matchingReservation) {
      await UtilityReading.updateOne(
        { _id: reading._id },
        { $set: { isArchived: true } },
      );
      archivedIds.push(String(reading._id));
    }
  }

  console.log(
    JSON.stringify(
      {
        roomId: String(room._id),
        roomName: room.name,
        archivedOrphanReadingIds: archivedIds,
        archivedCount: archivedIds.length,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[cleanup-orphan-room201-readings] ERROR:", error.message || String(error));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
