import dotenv from "dotenv";
import mongoose from "mongoose";

import { Reservation, Room, User, UtilityReading } from "../models/index.js";

dotenv.config();

// Targets taken directly from latest validation error panel.
const TARGETS = [
  {
    firstName: "pixx",
    lastName: "Guest",
    eventType: "move-in",
    eventDate: "2026-04-01",
  },
  {
    firstName: "pix",
    lastName: "Guest",
    eventType: "move-in",
    eventDate: "2026-04-03",
  },
  {
    firstName: "Vince",
    lastName: "Bryan",
    eventType: "move-out",
    eventDate: "2026-04-06",
  },
];

function startOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(value) {
  const day = startOfDay(value);
  if (!day) return null;
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return end;
}

function sameDayWindow(dateStr) {
  return {
    $gte: startOfDay(dateStr),
    $lte: endOfDay(dateStr),
  };
}

async function findUser(firstName, lastName) {
  return User.findOne({
    isArchived: { $ne: true },
    firstName: new RegExp(`^${firstName}$`, "i"),
    lastName: new RegExp(`^${lastName}$`, "i"),
  }).lean();
}

async function archiveMatchingReservation({ userId, eventType, eventDate }) {
  const dateFilter = sameDayWindow(eventDate);
  const reservationQuery = {
    userId,
    isArchived: { $ne: true },
    ...(eventType === "move-in"
      ? { checkInDate: dateFilter }
      : { checkOutDate: dateFilter }),
  };

  const reservation = await Reservation.findOne(reservationQuery);
  if (!reservation) return null;

  reservation.isArchived = true;
  reservation.archivedAt = new Date();
  reservation.status = "archived";
  await reservation.save();
  return reservation;
}

async function archiveMatchingReading({ userId, eventType, eventDate }) {
  const reading = await UtilityReading.findOne({
    utilityType: "electricity",
    tenantId: userId,
    eventType,
    isArchived: false,
    date: sameDayWindow(eventDate),
  });

  if (!reading) return null;

  reading.isArchived = true;
  await reading.save();
  return reading;
}

async function repairRoom(roomId, archivedReservationIds = new Set()) {
  const room = await Room.findById(roomId);
  if (!room) return null;

  for (const bed of room.beds) {
    const linkedReservationId = bed.occupiedBy?.reservationId
      ? String(bed.occupiedBy.reservationId)
      : null;
    if (linkedReservationId && archivedReservationIds.has(linkedReservationId)) {
      room.vacateBed(bed.id);
    }
  }

  const currentOccupancy = await Reservation.countDocuments({
    roomId,
    isArchived: { $ne: true },
    status: { $in: ["reserved", "moveIn"] },
  });

  room.currentOccupancy = currentOccupancy;
  room.updateAvailability();
  await room.save();
  return room;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const summary = [];
  const touchedRoomIds = new Set();
  const archivedReservationIds = new Set();

  for (const target of TARGETS) {
    const user = await findUser(target.firstName, target.lastName);
    if (!user) {
      summary.push({ ...target, status: "user-not-found" });
      continue;
    }

    const reservation = await archiveMatchingReservation({
      userId: user._id,
      eventType: target.eventType,
      eventDate: target.eventDate,
    });

    const reading = await archiveMatchingReading({
      userId: user._id,
      eventType: target.eventType,
      eventDate: target.eventDate,
    });

    if (reservation?.roomId) touchedRoomIds.add(String(reservation.roomId));
    if (reservation?._id) archivedReservationIds.add(String(reservation._id));

    summary.push({
      target: `${target.firstName} ${target.lastName} ${target.eventType} ${target.eventDate}`,
      userId: String(user._id),
      reservationArchived: reservation ? String(reservation._id) : null,
      readingArchived: reading ? String(reading._id) : null,
    });
  }

  const repairedRooms = [];
  for (const roomId of touchedRoomIds) {
    const room = await repairRoom(roomId, archivedReservationIds);
    if (room) {
      repairedRooms.push({
        roomId: String(room._id),
        roomName: room.name || room.roomNumber || String(room._id),
        currentOccupancy: room.currentOccupancy,
        capacity: room.capacity,
      });
    }
  }

  console.log("[delete-lifecycle-error-events] Summary:");
  console.log(JSON.stringify({ summary, repairedRooms }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[delete-lifecycle-error-events] ERROR:", error.message || String(error));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
