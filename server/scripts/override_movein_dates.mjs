import mongoose from "mongoose";
import dotenv from "dotenv";

import { Reservation, User, UtilityReading } from "../models/index.js";

dotenv.config();

const overrides = [
  { email: "pixdummy.2@gmail.com", checkInDate: new Date("2026-03-15T09:00:00.000Z") },
  { email: "pixdummy.10@gmail.com", checkInDate: new Date("2026-04-01T09:00:00.000Z") },
  { email: "pixdummy.5@gmail.com", checkInDate: new Date("2026-04-03T09:00:00.000Z") },
];

function log(message) {
  console.log(`[override-movein] ${message}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const results = [];

  for (const item of overrides) {
    const user = await User.findOne({ email: item.email, isArchived: { $ne: true } });
    if (!user) {
      results.push({ email: item.email, error: "user not found" });
      continue;
    }

    const reservation = await Reservation.findOne({ userId: user._id })
      .sort({ createdAt: -1, checkInDate: -1 });

    if (!reservation) {
      results.push({ email: item.email, error: "reservation not found" });
      continue;
    }

    reservation.checkInDate = item.checkInDate;

    if (
      reservation.status === "checked-out" &&
      reservation.checkOutDate &&
      reservation.checkOutDate < item.checkInDate
    ) {
      reservation.checkOutDate = new Date(item.checkInDate.getTime() + (60 * 60 * 1000));
    }

    await reservation.save();

    const moveInReading = await UtilityReading.findOne({
      utilityType: "electricity",
      tenantId: user._id,
      eventType: "move-in",
      isArchived: false,
    }).sort({ date: -1, createdAt: -1 });

    if (moveInReading) {
      moveInReading.date = item.checkInDate;
      await moveInReading.save();
    }

    results.push({
      email: item.email,
      reservationId: String(reservation._id),
      status: reservation.status,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate || null,
      moveInReadingUpdated: Boolean(moveInReading),
    });
  }

  log("Applied move-in overrides:");
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error(`[override-movein] ERROR: ${error.message || String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // no-op
    }
  });
