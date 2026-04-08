import dotenv from "dotenv";
import mongoose from "mongoose";

import { Reservation, Room, UtilityReading, User } from "../models/index.js";

dotenv.config();

const ROOM_NAME = "GP - Room 201";
const TARGET_EMAILS = [
  "pixdummy.5@gmail.com",
  "pixdummy.2@gmail.com",
  "pixdummy.10@gmail.com",
];

function sameDate(left, right) {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function getActiveTenantIdsAt(reservations, atDate, includeTenantId = null) {
  const active = new Set();
  const target = new Date(atDate).getTime();

  for (const reservation of reservations) {
    const checkInTime = reservation.checkInDate
      ? new Date(reservation.checkInDate).getTime()
      : null;
    const checkOutTime = reservation.checkOutDate
      ? new Date(reservation.checkOutDate).getTime()
      : null;

    if (
      checkInTime != null &&
      checkInTime <= target &&
      (checkOutTime == null || checkOutTime >= target)
    ) {
      active.add(String(reservation.userId));
    }
  }

  if (includeTenantId) {
    active.add(String(includeTenantId));
  }

  return [...active];
}

async function ensureReading({ room, admin, reservation, eventType, reading }) {
  const date =
    eventType === "move-in"
      ? reservation.checkInDate
      : reservation.checkOutDate;
  if (!date) return;

  let existing = await UtilityReading.findOne({
    utilityType: "electricity",
    roomId: room._id,
    tenantId: reservation.userId,
    eventType,
    date,
    isArchived: false,
  });

  const allRoomReservations = await Reservation.find({
    roomId: room._id,
    status: { $in: ["checked-in", "checked-out"] },
    isArchived: { $ne: true },
  })
    .select("userId checkInDate checkOutDate")
    .lean();

  const activeTenantIds = getActiveTenantIdsAt(
    allRoomReservations,
    date,
    eventType === "move-out" ? reservation.userId : null,
  );

  if (!existing) {
    existing = new UtilityReading({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      reading,
      date,
      eventType,
      tenantId: reservation.userId,
      activeTenantIds,
      recordedBy: admin._id,
      utilityPeriodId: null,
      isArchived: false,
    });
    await existing.save();
    console.log(
      `Created ${eventType} reading for reservation ${reservation._id} at ${new Date(date).toISOString()}`,
    );
    return;
  }

  let changed = false;
  if (Number(existing.reading) !== Number(reading)) {
    existing.reading = reading;
    changed = true;
  }
  if (existing.isArchived) {
    existing.isArchived = false;
    changed = true;
  }
  if (!sameDate(existing.date, date)) {
    existing.date = date;
    changed = true;
  }
  if (existing.utilityPeriodId !== null) {
    existing.utilityPeriodId = null;
    changed = true;
  }

  const currentActive = (existing.activeTenantIds || [])
    .map((id) => String(id))
    .sort();
  const nextActive = [
    ...new Set(activeTenantIds.map((id) => String(id))),
  ].sort();
  const sameActive =
    currentActive.length === nextActive.length &&
    currentActive.every((id, index) => id === nextActive[index]);
  if (!sameActive) {
    existing.activeTenantIds = activeTenantIds;
    changed = true;
  }

  if (changed) {
    await existing.save();
    console.log(
      `Updated ${eventType} reading for reservation ${reservation._id}`,
    );
  } else {
    console.log(
      `Reused ${eventType} reading for reservation ${reservation._id}`,
    );
  }
}

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
  });
  if (!room) throw new Error(`Room not found: ${ROOM_NAME}`);

  const users = await User.find({
    email: { $in: TARGET_EMAILS },
    isArchived: { $ne: true },
  })
    .select("_id email")
    .lean();
  const userIds = users.map((user) => user._id);

  const reservations = await Reservation.find({
    roomId: room._id,
    userId: { $in: userIds },
    isArchived: { $ne: true },
  })
    .select("_id userId checkInDate checkOutDate status")
    .sort({ checkInDate: 1 })
    .lean();

  if (!reservations.length) {
    throw new Error("No target reservations found");
  }

  const admin = await User.findOne({
    branch: room.branch,
    role: { $in: ["owner", "branch_admin"] },
    isArchived: { $ne: true },
  }).select("_id email");
  if (!admin) throw new Error("No admin found for recordedBy");

  let nextReading = 1204;

  for (const reservation of reservations) {
    await ensureReading({
      room,
      admin,
      reservation,
      eventType: "move-in",
      reading: nextReading,
    });
    nextReading += 40;

    if (reservation.checkOutDate) {
      await ensureReading({
        room,
        admin,
        reservation,
        eventType: "move-out",
        reading: nextReading,
      });
      nextReading += 20;
    }
  }

  const finalReadings = await UtilityReading.find({
    utilityType: "electricity",
    roomId: room._id,
    tenantId: { $in: userIds },
    eventType: { $in: ["move-in", "move-out"] },
    isArchived: false,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  console.log(
    `Active lifecycle readings for target tenants: ${finalReadings.length}`,
  );
  for (const reading of finalReadings) {
    console.log(
      `- ${reading.eventType} | tenant=${reading.tenantId} | ${new Date(reading.date).toISOString()} | ${reading.reading}`,
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(
    "[add-gp-room-201-missing-readings] ERROR:",
    error.message || String(error),
  );
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
