import dotenv from "dotenv";
import mongoose from "mongoose";

import {
  User,
  Reservation,
  UtilityReading,
  Bill,
  Room,
  MaintenanceRequest,
} from "../models/index.js";

dotenv.config();

async function loadExistingUserIdSet() {
  const users = await User.find({}).select("_id user_id").lean();
  return {
    objectIds: new Set(users.map((user) => String(user._id))),
    userIds: new Set(users.map((user) => user.user_id).filter(Boolean)),
  };
}

function summarizeMissing(records, getKey) {
  return records
    .map((record) => ({ id: String(record._id), key: getKey(record) }))
    .filter((entry) => entry.key);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
  });

  const [{ objectIds, userIds }, reservations, readings, bills, rooms, maintenance] =
    await Promise.all([
      loadExistingUserIdSet(),
      Reservation.find({ isArchived: { $ne: true } })
        .select("_id userId roomId status")
        .lean(),
      UtilityReading.find({ isArchived: false, tenantId: { $ne: null } })
        .select("_id tenantId roomId utilityType eventType")
        .lean(),
      Bill.find({ userId: { $ne: null }, isArchived: false })
        .select("_id userId reservationId status")
        .lean(),
      Room.find({ isArchived: { $ne: true } })
        .select("_id name roomNumber beds")
        .lean(),
      MaintenanceRequest.find({ isArchived: { $ne: true } })
        .select("_id request_id user_id branch status")
        .lean(),
    ]);

  const orphanReservations = summarizeMissing(
    reservations.filter((record) => record.userId && !objectIds.has(String(record.userId))),
    (record) => String(record.userId),
  );
  const orphanReadings = summarizeMissing(
    readings.filter((record) => record.tenantId && !objectIds.has(String(record.tenantId))),
    (record) => String(record.tenantId),
  );
  const orphanBills = summarizeMissing(
    bills.filter((record) => record.userId && !objectIds.has(String(record.userId))),
    (record) => String(record.userId),
  );
  const orphanBedOccupants = rooms.flatMap((room) =>
    (room.beds || [])
      .filter((bed) => bed.occupiedBy?.userId && !objectIds.has(String(bed.occupiedBy.userId)))
      .map((bed) => ({
        roomId: String(room._id),
        roomName: room.name || room.roomNumber || String(room._id),
        bedId: bed.id,
        userId: String(bed.occupiedBy.userId),
        reservationId: bed.occupiedBy?.reservationId ? String(bed.occupiedBy.reservationId) : null,
      })),
  );
  const orphanMaintenanceUsers = summarizeMissing(
    maintenance.filter((record) => record.user_id && !userIds.has(String(record.user_id))),
    (record) => String(record.user_id),
  );

  console.log(
    JSON.stringify(
      {
        summary: {
          orphanReservations: orphanReservations.length,
          orphanUtilityReadings: orphanReadings.length,
          orphanBills: orphanBills.length,
          orphanBedOccupants: orphanBedOccupants.length,
          orphanMaintenanceUsers: orphanMaintenanceUsers.length,
        },
        orphanReservations,
        orphanUtilityReadings: orphanReadings,
        orphanBills,
        orphanBedOccupants,
        orphanMaintenanceUsers,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[diagnose-orphan-user-references] ERROR:", error.message || String(error));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
