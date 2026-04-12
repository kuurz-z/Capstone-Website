/**
 * Remove known seed.quad.* tenants from a specific room.
 *
 * What it does:
 * - Finds the target room by name or room number.
 * - Archives moved-in or active reservations for the known seeded users in that room.
 * - Archives move-in meter readings tied to those seeded users in that room.
 * - Vacates any occupied beds linked to the archived reservations.
 * - Recalculates occupancy and availability for the room.
 * - Archives the seeded users if they no longer have other active reservations.
 *
 * Usage:
 *   node scripts/remove_seeded_tenants_from_room.mjs "GD 101"
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import { MeterReading, Reservation, Room, User } from "../models/index.js";

dotenv.config();

const ROOM_NAME_ARG = process.argv[2] || null;
const SEED_EMAILS = [
  "seed.quad.baseline@example.com",
  "seed.quad.partial@example.com",
  "seed.quad.late@example.com",
  "seed.quad.endcycle@example.com",
];

const line = (char = "=") => char.repeat(72);
const ok = (message) => console.log(`  OK  ${message}`);
const info = (message) => console.log(`  INFO ${message}`);
const skip = (message) => console.log(`  SKIP ${message}`);
const fail = (message) => console.log(`  ERR  ${message}`);

function getMongoConnectOptions() {
  return process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {};
}

async function findRoom(roomNameOrNumber) {
  if (!roomNameOrNumber) {
    throw new Error('Room name or room number is required, for example: "GD 101"');
  }

  return Room.findOne({
    isArchived: { $ne: true },
    $or: [{ name: roomNameOrNumber }, { roomNumber: roomNameOrNumber }],
  });
}

async function archiveReservationsForRoom(room, userIds) {
  const reservations = await Reservation.find({
    roomId: room._id,
    userId: { $in: userIds },
    isArchived: { $ne: true },
  }).sort({ checkInDate: 1 });

  if (!reservations.length) {
    skip(`No active seeded reservations found in ${room.name}`);
    return [];
  }

  for (const reservation of reservations) {
    reservation.isArchived = true;
    reservation.archivedAt = new Date();
    reservation.status = "archived";
    await reservation.save();
    ok(`Archived reservation ${reservation._id} for user ${reservation.userId}`);
  }

  return reservations;
}

async function archiveMeterReadingsForRoom(room, userIds) {
  const meterReadings = await MeterReading.find({
    roomId: room._id,
    tenantId: { $in: userIds },
    isArchived: false,
  }).sort({ date: 1, createdAt: 1 });

  if (!meterReadings.length) {
    skip(`No active seeded meter readings found in ${room.name}`);
    return 0;
  }

  for (const reading of meterReadings) {
    reading.isArchived = true;
    await reading.save();
  }

  ok(`Archived ${meterReadings.length} seeded meter reading(s) in ${room.name}`);
  return meterReadings.length;
}

async function repairRoomOccupancy(roomId, archivedReservations) {
  const room = await Room.findById(roomId);
  if (!room) {
    throw new Error("Room not found while repairing occupancy");
  }

  const archivedReservationIds = new Set(
    archivedReservations.map((reservation) => String(reservation._id)),
  );

  let vacatedBeds = 0;
  for (const reservation of archivedReservations) {
    const bedId = reservation.selectedBed?.id;
    if (!bedId) continue;

    const vacated = room.vacateBed(bedId);
    if (vacated) vacatedBeds += 1;
  }

  // Recompute occupancy from actual non-archived moved-in/reserved reservations.
  const activeOccupancyCount = await Reservation.countDocuments({
    roomId,
    isArchived: { $ne: true },
    status: { $in: ["reserved", "moveIn"] },
  });

  for (const bed of room.beds) {
    const linkedReservationId = bed.occupiedBy?.reservationId
      ? String(bed.occupiedBy.reservationId)
      : null;
    if (linkedReservationId && archivedReservationIds.has(linkedReservationId)) {
      room.vacateBed(bed.id);
    }
  }

  room.currentOccupancy = activeOccupancyCount;
  room.updateAvailability();
  await room.save();

  ok(`Vacated ${vacatedBeds} bed(s) and reset occupancy to ${room.currentOccupancy}/${room.capacity}`);
  return room;
}

async function archiveUsersWithoutActiveReservations(userIds) {
  let archivedUsers = 0;

  for (const userId of userIds) {
    const hasOtherActiveReservations = await Reservation.exists({
      userId,
      isArchived: { $ne: true },
    });

    if (hasOtherActiveReservations) {
      skip(`User ${userId} still has other active reservations, leaving account untouched`);
      continue;
    }

    const user = await User.findById(userId);
    if (!user) continue;
    if (user.isArchived) {
      skip(`User ${user.email} already archived`);
      continue;
    }

    user.isArchived = true;
    user.archivedAt = new Date();
    user.accountStatus = "banned";
    user.tenantStatus = "inactive";
    await user.save();
    archivedUsers += 1;
    ok(`Archived seeded user ${user.email}`);
  }

  return archivedUsers;
}

async function main() {
  console.log(`\n${line()}`);
  console.log("  Remove Seeded Tenants From Room");
  console.log(line());

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, getMongoConnectOptions());
  info("Connected to MongoDB");

  const room = await findRoom(ROOM_NAME_ARG);
  if (!room) {
    throw new Error(`Room "${ROOM_NAME_ARG}" was not found`);
  }
  info(`Using room ${room.name} (${room.branch})`);

  const seededUsers = await User.find({
    email: { $in: SEED_EMAILS },
    isArchived: { $ne: true },
  }).select("_id email");

  if (!seededUsers.length) {
    skip("No active seeded users were found");
    await mongoose.disconnect();
    info("Disconnected");
    return;
  }

  const userIds = seededUsers.map((user) => user._id);
  info(`Matched ${seededUsers.length} seeded user(s)`);

  const archivedReservations = await archiveReservationsForRoom(room, userIds);
  await archiveMeterReadingsForRoom(room, userIds);
  await repairRoomOccupancy(room._id, archivedReservations);
  const archivedUsers = await archiveUsersWithoutActiveReservations(userIds);

  const refreshedRoom = await Room.findById(room._id).lean();
  console.log(`\n${line("-")}`);
  console.log(`  Room: ${refreshedRoom.name}`);
  console.log(`  Occupancy: ${refreshedRoom.currentOccupancy}/${refreshedRoom.capacity}`);
  console.log(`  Available: ${refreshedRoom.available ? "yes" : "no"}`);
  console.log(`  Archived reservations: ${archivedReservations.length}`);
  console.log(`  Archived users: ${archivedUsers}`);
  console.log(line());

  await mongoose.disconnect();
  info("Disconnected");
}

main().catch(async (error) => {
  fail(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
