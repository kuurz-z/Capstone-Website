import dotenv from "dotenv";
import mongoose from "mongoose";

import { Reservation, Room, UtilityReading } from "../models/index.js";
import {
  filterBillableReservationsForPeriod,
  findMissingElectricityLifecycleReadings,
} from "../utils/utilityFlowRules.js";

dotenv.config();

async function main() {
  await mongoose.connect(
    process.env.MONGODB_URI,
    process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {},
  );

  const room = await Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: "GP - Room 201" }, { roomNumber: "GP - Room 201" }],
  }).lean();

  if (!room) throw new Error("Room not found");

  const start = new Date("2026-03-15T00:00:00.000Z");
  const end = new Date("2026-04-15T00:00:00.000Z");

  const reservations = await Reservation.find({
    roomId: room._id,
    status: { $in: ["moveIn", "moveOut"] },
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName")
    .lean();

  const billable = filterBillableReservationsForPeriod({
    reservations,
    cycleStart: start,
    cycleEnd: end,
  });

  const readings = await UtilityReading.find({
    roomId: room._id,
    utilityType: "electricity",
    isArchived: false,
    date: { $gte: start, $lte: end },
    $or: [{ utilityPeriodId: null }],
  }).lean();

  const missing = findMissingElectricityLifecycleReadings({
    period: { startDate: start, endDate: end },
    reservations: billable,
    readings,
  });

  console.log(
    JSON.stringify(
      {
        billableCount: billable.length,
        readingsCount: readings.length,
        missing,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[check-gp-room-201-missing-readings] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
