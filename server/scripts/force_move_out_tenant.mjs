import mongoose from "mongoose";
import dotenv from "dotenv";

import { Reservation, Room, User, UtilityReading } from "../models/index.js";

dotenv.config();

const [, , emailArg, readingArg] = process.argv;

function log(message) {
  console.log(`[force-move-out] ${message}`);
}

function fail(message) {
  console.error(`[force-move-out] ERROR: ${message}`);
}

function uniqObjectIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const key = String(id);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}

async function main() {
  const email = String(emailArg || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: node scripts/force_move_out_tenant.mjs <email> [meterReading]");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const user = await User.findOne({ email, isArchived: { $ne: true } });
  if (!user) {
    throw new Error(`No active user found for email: ${email}`);
  }

  const reservation = await Reservation.findOne({
    userId: user._id,
    status: "moveIn",
    isArchived: { $ne: true },
  })
    .sort({ checkInDate: -1, createdAt: -1 })
    .populate("roomId");

  if (!reservation) {
    throw new Error(`No moved-in reservation found for ${email}`);
  }

  const room = await Room.findById(reservation.roomId?._id || reservation.roomId);
  if (!room) {
    throw new Error("Reservation has no valid room");
  }

  const now = new Date();

  const explicitReading = readingArg != null && readingArg !== "" ? Number(readingArg) : null;
  if (explicitReading != null && Number.isNaN(explicitReading)) {
    throw new Error(`Invalid meter reading: ${readingArg}`);
  }

  const latestReading = await UtilityReading.findOne({
    utilityType: "electricity",
    roomId: room._id,
    isArchived: false,
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const fallbackReading = latestReading?.reading ?? 0;
  const meterReading = explicitReading != null ? explicitReading : fallbackReading;

  if (latestReading && meterReading < latestReading.reading) {
    throw new Error(
      `Meter reading ${meterReading} cannot be less than latest room reading ${latestReading.reading}`,
    );
  }

  const existingMoveOut = await UtilityReading.findOne({
    utilityType: "electricity",
    roomId: room._id,
    tenantId: user._id,
    eventType: "move-out",
    isArchived: false,
    date: { $gte: reservation.checkInDate },
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  if (!existingMoveOut) {
    // Build active list for the segment ending at move-out: includes departing tenant.
    const stillMovedIn = await Reservation.find({
      roomId: room._id,
      status: "moveIn",
      isArchived: { $ne: true },
    })
      .select("userId")
      .lean();

    const activeTenantIds = uniqObjectIds([
      ...stillMovedIn.map((entry) => entry.userId).filter(Boolean),
      user._id,
    ]);

    const adminUser =
      (await User.findOne({
        role: { $in: ["owner", "branch_admin"] },
        isArchived: { $ne: true },
      })
        .select("_id")
        .lean()) || user;

    await UtilityReading.create({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      reading: meterReading,
      date: now,
      eventType: "move-out",
      tenantId: user._id,
      activeTenantIds,
      recordedBy: adminUser._id,
      utilityPeriodId: null,
    });

    log(`Created move-out UtilityReading at ${meterReading} kWh.`);
  } else {
    log(`Existing move-out UtilityReading found (${existingMoveOut._id}); skipping new reading.`);
  }

  reservation.status = "moveOut";
  reservation.checkOutDate = now;
  reservation.notes = `${reservation.notes ? `${reservation.notes} | ` : ""}Force moved out for billing verification test`;
  await reservation.save();

  if (reservation.selectedBed?.id) {
    const vacated = room.vacateBed(reservation.selectedBed.id);
    if (vacated) {
      room.decreaseOccupancy();
      room.updateAvailability();
      await room.save();
      log(`Vacated bed ${reservation.selectedBed.id} in room ${room.name || room.roomNumber}.`);
    }
  }

  if (user.tenantStatus !== "inactive") {
    user.tenantStatus = "inactive";
    await user.save();
  }

  log("Done.");
  log(`Tenant: ${user.email}`);
  log(`Reservation: ${reservation._id}`);
  log(`Room: ${room.name || room.roomNumber}`);
  log(`Move-out date: ${now.toISOString()}`);
  log(`Meter reading used: ${meterReading}`);
}

main()
  .catch((error) => {
    fail(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // no-op
    }
  });
