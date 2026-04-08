import dotenv from "dotenv";
import mongoose from "mongoose";

import { Room, Reservation, UtilityReading, User, UtilityPeriod } from "../models/index.js";

dotenv.config();

const roomNameArg = process.argv[2] || "GP - Room 201";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: roomNameArg }, { roomNumber: roomNameArg }],
  }).lean();

  if (!room) throw new Error(`Room not found: ${roomNameArg}`);

  const periods = await UtilityPeriod.find({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
  })
    .select("_id startDate endDate startReading endReading status targetCloseDate")
    .sort({ createdAt: -1 })
    .lean();

  const reservations = await Reservation.find({
    roomId: room._id,
    isArchived: { $ne: true },
  })
    .select("_id userId status checkInDate checkOutDate selectedBed")
    .sort({ checkInDate: 1 })
    .lean();

  const userIds = [...new Set(reservations.map((r) => String(r.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id firstName lastName email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const readings = await UtilityReading.find({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
  })
    .select("_id tenantId eventType reading date utilityPeriodId")
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const enrichedReservations = reservations.map((r) => {
    const u = userMap.get(String(r.userId));
    return {
      ...r,
      tenantName: u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : null,
      tenantEmail: u?.email || null,
    };
  });

  const enrichedReadings = readings.map((rd) => {
    const u = rd.tenantId ? userMap.get(String(rd.tenantId)) : null;
    return {
      ...rd,
      tenantName: u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : null,
      tenantEmail: u?.email || null,
    };
  });

  console.log(JSON.stringify({
    room: {
      id: String(room._id),
      name: room.name,
      branch: room.branch,
      currentOccupancy: room.currentOccupancy,
      capacity: room.capacity,
    },
    periods,
    reservations: enrichedReservations,
    readings: enrichedReadings,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[inspect-room-billing-state] ERROR:", error.message || String(error));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
