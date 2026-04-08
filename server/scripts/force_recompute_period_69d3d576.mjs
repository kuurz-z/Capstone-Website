import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  Room,
  Reservation,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import { computeBilling } from "../utils/billingEngine.js";
import { upsertDraftBillsForUtility } from "../utils/utilityBillFlow.js";
import {
  buildTenantEventsForPeriod,
  filterBillableReservationsForPeriod,
  findBedOccupancyOverlaps,
  findMissingElectricityLifecycleReadings,
} from "../utils/utilityFlowRules.js";

dotenv.config();
const periodId = "69d3d576f9982d5de6337985";
const utilityType = "electricity";

await mongoose.connect(process.env.MONGODB_URI, {
  ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
});

const period = await UtilityPeriod.findById(periodId);
if (!period) throw new Error("Period not found");

const room = await Room.findById(period.roomId);
if (!room) throw new Error("Room not found");

const allReadings = await UtilityReading.find({
  utilityType,
  roomId: room._id,
  isArchived: false,
  date: { $gte: period.startDate, $lte: period.endDate },
})
  .sort({ date: 1, createdAt: 1 })
  .lean();

const reservations = await Reservation.find({
  roomId: room._id,
  status: { $in: ["checked-in", "checked-out"] },
  isArchived: { $ne: true },
  checkInDate: { $lt: period.endDate },
  $or: [{ checkOutDate: null }, { checkOutDate: { $gt: period.startDate } }],
})
  .populate("userId", "firstName lastName email")
  .lean();

const cyclePeriod = {
  startDate: period.startDate,
  endDate: period.endDate,
  startReading: period.startReading,
  endReading: period.endReading,
  ratePerUnit: period.ratePerUnit,
};

const billableReservations = filterBillableReservationsForPeriod({
  reservations,
  cycleStart: period.startDate,
  cycleEnd: period.endDate,
});

const occupancyOverlapResult = findBedOccupancyOverlaps({
  reservations: billableReservations,
  cycleStart: period.startDate,
  cycleEnd: period.endDate,
});
if (occupancyOverlapResult.hasOverlaps) {
  throw new Error("Cannot recompute due to occupancy overlaps");
}

const missing = findMissingElectricityLifecycleReadings({
  period: cyclePeriod,
  reservations: billableReservations,
  readings: allReadings,
});
if (missing.hasMissingReadings) {
  throw new Error("Cannot recompute due to missing lifecycle readings");
}

const mappedTenantEvents = buildTenantEventsForPeriod({
  period: cyclePeriod,
  reservations: billableReservations,
  readings: allReadings,
});

const computationResult = computeBilling({
  utilityPeriod: cyclePeriod,
  readings: allReadings,
  reservations: billableReservations,
  tenantEvents: mappedTenantEvents,
  forceSegmented: true,
});

period.computedTotalUsage = computationResult.computedTotalUsage;
period.computedTotalCost = computationResult.computedTotalCost;
period.verified = computationResult.verified;
period.segments = computationResult.segments;
period.tenantSummaries = computationResult.tenantSummaries;

period.tenantSummaries = await upsertDraftBillsForUtility({
  period: period.toObject(),
  room,
  tenantSummaries: period.tenantSummaries,
  utilityType,
});

period.revised = true;
await period.save();

console.log(
  JSON.stringify(
    {
      success: true,
      periodId: String(period._id),
      tenantSummaries: period.tenantSummaries,
      segments: period.segments.map((s) => ({
        readingFrom: s.readingFrom,
        readingTo: s.readingTo,
        unitsConsumed: s.unitsConsumed,
        activeTenantCount: s.activeTenantCount,
        coveredTenantNames: s.coveredTenantNames,
        startEventType: s.startEventType,
        endEventType: s.endEventType,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
