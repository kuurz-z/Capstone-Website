import mongoose from "mongoose";
import "../config/database.js";
import { Reservation, Stay, BedHistory } from "../models/index.js";
import { computeLeaseEndDate } from "../utils/tenantWorkspace.js";
import { hasReservationStatus, readMoveInDate, readMoveOutDate } from "../utils/lifecycleNaming.js";

const main = async () => {
  const reservations = await Reservation.find({
    isArchived: { $ne: true },
    status: { $in: ["moveIn", "moveOut"] },
  })
    .populate("roomId", "branch")
    .lean();

  let createdCount = 0;
  let linkedCount = 0;

  for (const reservation of reservations) {
    const existing = await Stay.findOne({ reservationId: reservation._id }).lean();
    if (existing) continue;

    const leaseStartDate = readMoveInDate(reservation);
    const leaseEndDate = computeLeaseEndDate(reservation);
    if (!leaseStartDate || !leaseEndDate || !reservation.roomId?.branch || !reservation.selectedBed?.id) {
      continue;
    }

    const stay = await Stay.create({
      tenantId: reservation.userId,
      reservationId: reservation._id,
      branch: reservation.roomId.branch,
      roomId: reservation.roomId._id || reservation.roomId,
      bedId: reservation.selectedBed.id,
      leaseStartDate,
      leaseEndDate,
      monthlyRent: Number(reservation.monthlyRent || 0),
      status: hasReservationStatus(reservation.status, "moveOut") ? "completed" : "active",
      endedAt: readMoveOutDate(reservation) || null,
      endReason: hasReservationStatus(reservation.status, "moveOut") ? "legacy_move_out" : "",
    });
    createdCount += 1;

    await Reservation.updateOne(
      { _id: reservation._id },
      {
        $set: {
          currentStayId: stay._id,
          latestStayStatus: stay.status,
        },
      },
    );

    const histories = await BedHistory.find({
      reservationId: reservation._id,
    });
    for (const history of histories) {
      if (!history.stayId) {
        history.stayId = stay._id;
        history.branch = history.branch || reservation.roomId.branch;
        history.status = history.moveOutDate ? "completed" : "active";
        history.effectiveStartDate = history.effectiveStartDate || history.moveInDate;
        history.effectiveEndDate = history.effectiveEndDate || history.moveOutDate || null;
        await history.save();
        linkedCount += 1;
      }
    }
  }

  console.log(`Created stays: ${createdCount}`);
  console.log(`Linked bed history rows: ${linkedCount}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
