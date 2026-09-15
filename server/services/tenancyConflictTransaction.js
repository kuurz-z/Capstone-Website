import mongoose from "mongoose";
import { Reservation } from "../models/index.js";
import TenantTransferRequest from "../models/TenantTransferRequest.js";
import ScheduledRoomTransfer from "../models/ScheduledRoomTransfer.js";

// Shared Reservation write conflicts with transfer submission, scheduling,
// cutover, and extension. Retry always rechecks the competing transfer state.
export async function createExclusiveTenancyRecord(reservationId, create) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOneAndUpdate({ _id: reservationId }, { $inc: { renewalPreparationVersion: 1 } }, { new: true, session });
      if (!reservation) throw Object.assign(new Error("The tenant record could not be found. Refresh and try again."), { statusCode: 404 });
      const request = await TenantTransferRequest.exists({ reservationId, status: { $in: ["pending", "scheduling", "scheduled"] } }).session(session);
      const schedule = await ScheduledRoomTransfer.exists({ reservationId, status: { $in: ["scheduled", "action_required"] }, isArchived: { $ne: true } }).session(session);
      if (request || schedule) throw Object.assign(new Error("This tenant has an active room transfer. Resolve it in Room Transfer before starting another stay change."), { statusCode: 409, code: "ROOM_TRANSFER_LIFECYCLE_CONFLICT" });
      result = await create(session, reservation);
    });
    return result;
  } finally { await session.endSession(); }
}
