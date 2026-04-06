/**
 * ============================================================================
 * UNIFIED UTILITY BILLING CONTROLLER
 * ============================================================================
 *
 * Handles hybrid billing (Electricity & Water) seamlessly.
 * Routes will inject `req.params.utilityType` into these functions.
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import {
  Room,
  Reservation,
  User,
  UtilityPeriod,
  UtilityReading,
  Bill,
} from "../models/index.js";
import { computeBilling } from "../utils/billingEngine.js";
import { logBillingAudit } from "../utils/billingAudit.js";
import { getRoomLabel } from "../utils/roomLabel.js";
import { upsertDraftBillsForUtility } from "../utils/utilityBillFlow.js";
import { getUtilityDiagnostics } from "../utils/utilityDiagnostics.js";

import {
  buildTenantEventsForPeriod,
  filterBillableReservationsForPeriod,
  findBedOccupancyOverlaps,
  findMissingElectricityLifecycleReadings,
  isWaterBillableRoom,
} from "../utils/utilityFlowRules.js";
import logger from "../middleware/logger.js";

async function getAdminInfo(req) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
  return {
    role: dbUser?.role || "user",
    branch: dbUser?.branch || null,
    isSuperAdmin: dbUser?.role === "owner",
    _id: dbUser?._id || null,
    email: dbUser?.email || req.user?.email || "",
    displayName:
      `${dbUser?.firstName || ""} ${dbUser?.lastName || ""}`.trim() ||
      dbUser?.email ||
      "Admin",
  };
}

function assertUtilityRoomEligibility(room, utilityType) {
  if (utilityType === "water" && !isWaterBillableRoom(room)) {
    const error = new Error(
      "Water billing only applies to private and double-sharing rooms.",
    );
    error.statusCode = 400;
    throw error;
  }
}

function buildElectricityValidationError(missing) {
  const missingParts = [];
  if (missing.missingMoveInReadings.length > 0) {
    missingParts.push(
      `move-in: ${missing.missingMoveInReadings.map((entry) => entry.tenantName).join(", ")}`,
    );
  }
  if (missing.missingMoveOutReadings.length > 0) {
    missingParts.push(
      `move-out: ${missing.missingMoveOutReadings.map((entry) => entry.tenantName).join(", ")}`,
    );
  }

  const error = new Error(
    `Electricity billing requires move-in and move-out readings for all in-cycle tenant events. Missing ${missingParts.join(" | ")}.`,
  );
  error.statusCode = 409;
  error.details = missing;
  return error;
}

function buildOccupancyOverlapError(overlapResult) {
  const first = overlapResult?.overlaps?.[0];
  const message = first
    ? `Cannot generate billing because bed ${first.bedKey} has overlapping occupancy between ${first.firstTenantName} and ${first.secondTenantName}.`
    : "Cannot generate billing due to overlapping occupancy records for the same bed.";

  const error = new Error(message);
  error.statusCode = 409;
  error.details = overlapResult;
  return error;
}

function assertBoundaryReadings({ startReading, endReading }) {
  if (startReading === undefined || startReading === null) {
    const error = new Error(
      "Billing generation requires a period start boundary reading.",
    );
    error.statusCode = 400;
    throw error;
  }
  if (endReading === undefined || endReading === null) {
    const error = new Error(
      "Billing generation requires a period end boundary reading.",
    );
    error.statusCode = 400;
    throw error;
  }
  if (Number(endReading) < Number(startReading)) {
    const error = new Error(
      "Period end reading must be greater than or equal to period start reading.",
    );
    error.statusCode = 400;
    throw error;
  }
}

// ============================================================================
// CLOSING BIZ LOGIC
// ============================================================================

async function closePeriodAndGenerateDrafts({
  admin,
  period,
  room,
  endReading,
  endDate,
  utilityType,
  requestContext = null,
}) {
  const closingDate = dayjs(endDate ? new Date(endDate) : new Date())
    .startOf("day")
    .toDate();
  assertBoundaryReadings({ startReading: period.startReading, endReading });

  assertUtilityRoomEligibility(room, utilityType);

  const endUtilityReading = new UtilityReading({
    utilityType,
    roomId: room._id,
    branch: room.branch,
    reading: Number(endReading),
    date: closingDate,
    eventType: "period-end",
    readingStatus: "locked",
    recordedBy: admin._id,
    utilityPeriodId: period._id,
    activeTenantIds: [],
  });
  await endUtilityReading.save();

  const cycleStart = dayjs(period.startDate).startOf("day").toDate();
  const allReadings = await UtilityReading.find({
    roomId: room._id,
    utilityType,
    isArchived: false,
    date: {
      $gte: cycleStart,
      $lte: closingDate,
    },
    $or: [{ utilityPeriodId: period._id }, { utilityPeriodId: null }],
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const reservations = await Reservation.find({
    roomId: room._id,
    status: { $in: ["checked-in", "checked-out"] },
    isArchived: { $ne: true },
    checkInDate: { $lt: closingDate },
    $or: [{ checkOutDate: null }, { checkOutDate: { $gt: period.startDate } }],
  })
    .populate("userId", "firstName lastName email")
    .lean();

  const cyclePeriod = {
    startDate: period.startDate,
    endDate: closingDate,
    startReading: period.startReading,
    endReading: Number(endReading),
    ratePerUnit: period.ratePerUnit,
  };

  const billableReservations = filterBillableReservationsForPeriod({
    reservations,
    cycleStart: period.startDate,
    cycleEnd: closingDate,
  });

  const occupancyOverlapResult = findBedOccupancyOverlaps({
    reservations: billableReservations,
    cycleStart: period.startDate,
    cycleEnd: closingDate,
  });
  if (occupancyOverlapResult.hasOverlaps) {
    throw buildOccupancyOverlapError(occupancyOverlapResult);
  }

  // Build a set of tenant IDs who actually moved in or out DURING this cycle.
  // Tenants who were already present before the cycle should not create segments.
  const cycleStartDay = dayjs(period.startDate).startOf("day");
  const cycleEndDay = dayjs(closingDate).startOf("day");
  const inCycleMoveTenantIds = new Set();
  for (const res of billableReservations) {
    const tenantKey = String(res.userId?._id || res.userId);
    const checkIn = res.checkInDate
      ? dayjs(res.checkInDate).startOf("day")
      : null;
    const checkOut = res.checkOutDate
      ? dayjs(res.checkOutDate).startOf("day")
      : null;
    if (
      checkIn &&
      checkIn.isAfter(cycleStartDay) &&
      !checkIn.isAfter(cycleEndDay)
    ) {
      inCycleMoveTenantIds.add(tenantKey);
    }
    if (
      checkOut &&
      !checkOut.isBefore(cycleStartDay) &&
      !checkOut.isAfter(cycleEndDay)
    ) {
      inCycleMoveTenantIds.add(tenantKey);
    }
  }

  // Filter readings: keep baseline (regular-billing) readings and only
  // move-in/move-out readings for tenants who actually moved during this cycle.
  const cycleReadings = allReadings.filter((r) => {
    if (
      r.eventType === "regular-billing" ||
      r.eventType === "period-start" ||
      r.eventType === "period-end"
    ) {
      return true;
    }
    if (
      (r.eventType === "move-in" || r.eventType === "move-out") &&
      r.tenantId
    ) {
      return inCycleMoveTenantIds.has(String(r.tenantId));
    }
    return false;
  });

  let mappedTenantEvents = [];
  if (utilityType === "electricity") {
    const missing = findMissingElectricityLifecycleReadings({
      period: cyclePeriod,
      reservations: billableReservations,
      readings: cycleReadings,
    });
    if (missing.hasMissingReadings) {
      throw buildElectricityValidationError(missing);
    }

    mappedTenantEvents = buildTenantEventsForPeriod({
      period: cyclePeriod,
      reservations: billableReservations,
      readings: cycleReadings,
    });
  }

  const computationResult = computeBilling({
    utilityPeriod: cyclePeriod,
    readings: cycleReadings,
    reservations: billableReservations,
    tenantEvents: mappedTenantEvents,
    forceSegmented: utilityType === "electricity",
  });

  period.endDate = closingDate;
  period.endReading = Number(endReading);
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

  period.status = "closed";
  period.closedAt = new Date();
  period.closedBy = admin._id;
  await period.save();

  await logBillingAudit(requestContext || {}, {
    admin,
    action: "utility_period_closed",
    severity: "high",
    entityId: period._id,
    branch: period.branch,
    details: `Closed ${utilityType} period for room ${getRoomLabel(room)}. Math: ${computationResult.strategy}`,
    metadata: {
      utilityType,
      roomId: room._id,
      tenantCount: computationResult.tenantSummaries.length,
      computedCost: computationResult.computedTotalCost,
    },
  });

  return { closingDate, computationResult, periodId: period._id };
}

// ============================================================================
// ENDPOINTS
// ============================================================================

export const openUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { roomId, startDate, startReading, ratePerUnit } = req.body;

    if (!roomId || !startDate || startReading === undefined || !ratePerUnit) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    assertUtilityRoomEligibility(room, utilityType);

    // Temp: Clean up old soft-deleted periods to avoid legacy unique index conflicts
    await UtilityPeriod.deleteMany({ isArchived: true });

    const openExists = await UtilityPeriod.findOne({
      utilityType,
      roomId: room._id,
      status: "open",
      isArchived: false,
    });
    if (openExists)
      return res
        .status(409)
        .json({ error: "Room already has an open period." });

    const period = new UtilityPeriod({
      utilityType,
      roomId: room._id,
      branch: room.branch,
      startDate: dayjs(startDate).startOf("day").toDate(),
      startReading: Number(startReading),
      ratePerUnit: Number(ratePerUnit),
      status: "open",
    });
    await period.save();

    // Create the start baseline reading tied to this period
    const startBaselineReading = new UtilityReading({
      utilityType,
      roomId: room._id,
      branch: room.branch,
      reading: Number(startReading),
      date: dayjs(startDate).startOf("day").toDate(),
      eventType: "period-start",
      readingStatus: "locked",
      recordedBy: admin._id,
      utilityPeriodId: period._id,
      activeTenantIds: [],
    });
    await startBaselineReading.save();

    res.status(201).json({ success: true, period });
  } catch (err) {
    next(err);
  }
};

export const recordUtilityReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { roomId, reading, date, eventType, tenantId } = req.body;

    if (eventType === "regular-billing") {
      return res.status(400).json({
        error:
          "Mid-period checkpoint readings are no longer supported. Use move-in, move-out, or boundary readings from New Billing Period.",
      });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    assertUtilityRoomEligibility(room, utilityType);

    const openPeriod = await UtilityPeriod.findOne({
      roomId: room._id,
      utilityType,
      status: "open",
      isArchived: false,
    });

    const newReading = new UtilityReading({
      utilityType,
      roomId: room._id,
      branch: room.branch,
      reading: Number(reading),
      date: new Date(date),
      eventType,
      tenantId: tenantId || null,
      recordedBy: admin._id,
      utilityPeriodId: openPeriod?._id || null,
    });
    await newReading.save();

    res.status(201).json({ success: true, reading: newReading });
  } catch (err) {
    next(err);
  }
};

export const closeUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { id } = req.params;
    const { endReading, endDate } = req.body;

    const period = await UtilityPeriod.findById(id);
    if (!period || period.status !== "open")
      return res
        .status(400)
        .json({ error: "Invalid or already closed period" });

    const room = await Room.findById(period.roomId);
    const result = await closePeriodAndGenerateDrafts({
      admin,
      period,
      room,
      endReading,
      endDate,
      utilityType,
      requestContext: req,
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

export const batchCloseUtilityPeriods = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { closures, endDate } = req.body;
    const closed = [],
      failed = [];

    for (const item of closures) {
      try {
        const period = await UtilityPeriod.findById(item.periodId);
        const room = await Room.findById(period.roomId);
        const result = await closePeriodAndGenerateDrafts({
          admin,
          period,
          room,
          endReading: item.endReading,
          endDate: item.endDate || endDate,
          utilityType,
          requestContext: req,
        });
        closed.push({
          periodId: period._id,
          roomName: room.name,
          success: true,
        });
      } catch (err) {
        failed.push({ periodId: item.periodId, error: err.message });
      }
    }

    res
      .status(closed.length > 0 ? 200 : 400)
      .json({ success: failed.length === 0, closed, failed });
  } catch (err) {
    next(err);
  }
};

export const deleteUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;

    const period = await UtilityPeriod.findById(id);
    if (!period || period.isArchived)
      return res.status(404).json({ error: "Period not found" });

    // Ensure no published bills depend on this period
    if (period.tenantSummaries && period.tenantSummaries.length > 0) {
      for (const summary of period.tenantSummaries) {
        if (summary.billId) {
          const bill = await Bill.findById(summary.billId);
          if (bill && bill.status !== "draft") {
            return res.status(400).json({
              error:
                "Cannot delete billing period because bills have already been published.",
            });
          }
        }
      }

      // Reset charges for associated draft bills
      const chargeField = utilityType === "water" ? "water" : "electricity";
      for (const summary of period.tenantSummaries) {
        if (summary.billId) {
          const bill = await Bill.findById(summary.billId);
          if (bill && bill.status === "draft") {
            bill.charges[chargeField] = 0;
            if (
              bill.charges.electricity === 0 &&
              bill.charges.water === 0 &&
              bill.charges.rent === 0
            ) {
              bill.isArchived = true;
            }
            await bill.save();
          }
        }
      }
    }

    // Keep tenant lifecycle readings (move-in/move-out) detached from periods
    // so deleting a cycle does not erase account-level history.
    await UtilityReading.updateMany(
      {
        utilityPeriodId: period._id,
        eventType: { $in: ["move-in", "move-out"] },
      },
      { $set: { utilityPeriodId: null } },
    );

    // Soft delete only boundary/checkpoint readings that belong to this period.
    await UtilityReading.updateMany(
      {
        utilityPeriodId: period._id,
        eventType: { $in: ["period-start", "period-end", "regular-billing"] },
      },
      { $set: { isArchived: true } },
    );

    period.isArchived = true;
    await period.save();

    res.json({ success: true, message: "Billing period deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export const updateUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;
    const { ratePerUnit } = req.body;

    const period = await UtilityPeriod.findById(id);
    if (!period || period.isArchived)
      return res.status(404).json({ error: "Period not found" });

    if (ratePerUnit !== undefined) {
      period.ratePerUnit = Number(ratePerUnit);
    }
    await period.save();

    res.json({ success: true, period });
  } catch (err) {
    next(err);
  }
};

export const deleteUtilityReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;

    const reading = await UtilityReading.findById(id);
    if (!reading || reading.isArchived)
      return res.status(404).json({ error: "Reading not found" });

    reading.isArchived = true;
    await reading.save();

    res.json({ success: true, message: "Reading deleted" });
  } catch (err) {
    next(err);
  }
};

export const updateUtilityReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;
    const { reading, date, eventType } = req.body;

    if (eventType === "regular-billing") {
      return res.status(400).json({
        error:
          "Mid-period checkpoint readings are no longer supported. Use move-in, move-out, or boundary readings from New Billing Period.",
      });
    }

    const readingDoc = await UtilityReading.findById(id);
    if (!readingDoc || readingDoc.isArchived)
      return res.status(404).json({ error: "Reading not found" });

    if (reading !== undefined) readingDoc.reading = Number(reading);
    if (date !== undefined) readingDoc.date = new Date(date);
    if (eventType !== undefined) readingDoc.eventType = eventType;

    await readingDoc.save();
    res.json({ success: true, reading: readingDoc });
  } catch (err) {
    next(err);
  }
};

export const reviseUtilityResult = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, periodId } = req.params;

    const period = await UtilityPeriod.findById(periodId);
    if (!period || period.status !== "closed")
      return res.status(400).json({ error: "Invalid or open period" });

    const room = await Room.findById(period.roomId);
    assertUtilityRoomEligibility(room, utilityType);

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
      $or: [
        { checkOutDate: null },
        { checkOutDate: { $gt: period.startDate } },
      ],
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
      throw buildOccupancyOverlapError(occupancyOverlapResult);
    }

    let mappedTenantEvents = [];
    if (utilityType === "electricity") {
      const missing = findMissingElectricityLifecycleReadings({
        period: cyclePeriod,
        reservations: billableReservations,
        readings: allReadings,
      });
      if (missing.hasMissingReadings) {
        throw buildElectricityValidationError(missing);
      }

      mappedTenantEvents = buildTenantEventsForPeriod({
        period: cyclePeriod,
        reservations: billableReservations,
        readings: allReadings,
      });
    }

    const computationResult = computeBilling({
      utilityPeriod: cyclePeriod,
      readings: allReadings,
      reservations: billableReservations,
      tenantEvents: mappedTenantEvents,
      forceSegmented: utilityType === "electricity",
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

    res.json({ success: true, result: computationResult });
  } catch (err) {
    next(err);
  }
};

export const getUtilityDiagnosticsApi = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isSuperAdmin ? req.query.branch || null : admin.branch;
    res.json(await getUtilityDiagnostics({ branch }));
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// QUERY / UI READ ENDPOINTS
// ============================================================================

export const getUtilityRooms = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isSuperAdmin ? req.query.branch || null : admin.branch;
    const utilityType = req.params.utilityType;

    // Fallback to Utility Diagnostics for fetching the robust mapped room objects
    const diagnostics = await getUtilityDiagnostics({ branch });
    if (utilityType === "electricity") {
      return res.json({
        rooms: (diagnostics.electricityRooms || []).map((r) => ({
          ...r,
          id: r.roomId,
        })),
      });
    } else if (utilityType === "water") {
      return res.json({
        rooms: (diagnostics.waterRooms || []).map((r) => ({
          ...r,
          id: r.roomId,
        })),
      });
    }
    return res.status(400).json({ error: "Invalid utility type specified" });
  } catch (err) {
    next(err);
  }
};

export const getUtilityReadings = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, roomId } = req.params;
    const { periodId } = req.query;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const filter = { roomId: room._id, utilityType, isArchived: false };
    if (periodId) filter.utilityPeriodId = periodId;

    const readings = await UtilityReading.find(filter)
      .populate("tenantId", "firstName lastName email")
      .populate("recordedBy", "firstName lastName")
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const periodIds = [
      ...new Set(
        readings
          .map((entry) => entry.utilityPeriodId)
          .filter(Boolean)
          .map((entry) => String(entry)),
      ),
    ];

    const periodStatusMap = new Map();
    if (periodIds.length > 0) {
      const periods = await UtilityPeriod.find({ _id: { $in: periodIds } })
        .select("status")
        .lean();
      for (const period of periods) {
        periodStatusMap.set(String(period._id), period.status || null);
      }
    }

    res.json({
      readings: readings.map((r) => ({
        utilityPeriodId: r.utilityPeriodId || null,
        utilityPeriodStatus: r.utilityPeriodId
          ? periodStatusMap.get(String(r.utilityPeriodId)) || null
          : null,
        id: r._id,
        reading: r.reading,
        date: r.date,
        eventType: r.eventType,
        readingStatus: r.readingStatus || "recorded",
        isLocked:
          r.readingStatus === "locked" ||
          r.eventType === "period-start" ||
          r.eventType === "period-end" ||
          (r.utilityPeriodId &&
            ["closed", "revised"].includes(
              periodStatusMap.get(String(r.utilityPeriodId)) || "",
            )),
        tenant: r.tenantId
          ? `${r.tenantId.firstName || ""} ${r.tenantId.lastName || ""}`.trim()
          : null,
        tenantEmail: r.tenantId?.email || null,
        tenantId: r.tenantId?._id || null,
        activeTenantCount: r.activeTenantIds?.length || 0,
        recordedBy: r.recordedBy
          ? `${r.recordedBy.firstName || ""} ${r.recordedBy.lastName || ""}`.trim()
          : "System",
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getUtilityLatestReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const latestReading = await UtilityReading.findOne({
      roomId: room._id,
      utilityType,
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({
      reading: latestReading
        ? {
            id: latestReading._id,
            reading: latestReading.reading,
            date: latestReading.date,
            eventType: latestReading.eventType,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

export const getUtilityPeriods = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periods = await UtilityPeriod.find({
      roomId: room._id,
      utilityType,
      isArchived: false,
    })
      .sort({ startDate: -1 })
      .lean();

    // Bulk-fetch actual bill statuses so we know which are still drafts
    const allBillIds = periods
      .flatMap((p) => (p.tenantSummaries || []).map((s) => s.billId))
      .filter(Boolean);
    const billStatusMap = {};
    if (allBillIds.length > 0) {
      const bills = await Bill.find({ _id: { $in: allBillIds } })
        .select("status")
        .lean();
      for (const b of bills) {
        billStatusMap[String(b._id)] = b.status;
      }
    }

    res.json({
      periods: periods.map((p) => {
        const summaryBillIds = (p.tenantSummaries || [])
          .map((s) => s.billId)
          .filter(Boolean);
        const hasDraftBills = summaryBillIds.some(
          (id) => billStatusMap[String(id)] === "draft",
        );
        const hasSentBills = summaryBillIds.some(
          (id) =>
            billStatusMap[String(id)] && billStatusMap[String(id)] !== "draft",
        );

        let displayStatus = "closed";
        if (p.status === "open") displayStatus = "open";
        else if (p.revised) displayStatus = "revised";
        else if (hasDraftBills) displayStatus = "ready";
        else if (hasSentBills) displayStatus = "finalized";

        return {
          id: p._id,
          startDate: p.startDate,
          endDate: p.endDate,
          startReading: p.startReading,
          endReading: p.endReading,
          computedTotalUsage: p.computedTotalUsage,
          computedTotalCost: p.computedTotalCost,
          ratePerUnit: p.ratePerUnit,
          status: p.status,
          displayStatus,
          revised: p.revised,
          hasDraftBills,
          hasSentBills,
          closedAt: p.closedAt,
          targetCloseDate: null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const getUtilityResult = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, periodId } = req.params;

    const period = await UtilityPeriod.findOne({
      _id: periodId,
      utilityType,
      isArchived: false,
    }).lean();

    if (!period) {
      return res
        .status(404)
        .json({ error: "No billing result found for this period" });
    }

    const summaries = period.tenantSummaries || [];
    const reservationIds = summaries
      .map((summary) => summary.reservationId)
      .filter(Boolean);
    const tenantIds = summaries
      .map((summary) => summary.tenantId)
      .filter(Boolean);

    const formatDurationRange = (checkInDate, checkOutDate) => {
      if (!checkInDate) return "Ongoing";
      const start = dayjs(checkInDate).format("MMM D, YYYY");
      const end = checkOutDate
        ? dayjs(checkOutDate).format("MMM D, YYYY")
        : "Ongoing";
      return `${start} - ${end}`;
    };

    const [reservations, overlapReservations, tenants] = await Promise.all([
      reservationIds.length
        ? Reservation.find({ _id: { $in: reservationIds } })
            .populate("userId", "firstName lastName email")
            .lean()
        : [],
      tenantIds.length
        ? Reservation.find({
            roomId: period.roomId,
            userId: { $in: tenantIds },
            isArchived: { $ne: true },
            checkInDate: { $lt: period.endDate || period.startDate },
            $or: [
              { checkOutDate: null },
              { checkOutDate: { $gt: period.startDate } },
            ],
          })
            .sort({ checkInDate: -1 })
            .populate("userId", "firstName lastName email")
            .lean()
        : [],
      tenantIds.length
        ? User.find(
            { _id: { $in: tenantIds } },
            "firstName lastName email",
          ).lean()
        : [],
    ]);

    const reservationById = new Map(
      reservations.map((reservation) => [String(reservation._id), reservation]),
    );
    const reservationByTenantId = new Map();
    for (const reservation of overlapReservations) {
      const tenantKey = String(
        reservation.userId?._id || reservation.userId || "",
      );
      if (!tenantKey || reservationByTenantId.has(tenantKey)) continue;
      reservationByTenantId.set(tenantKey, reservation);
    }
    const tenantById = new Map(
      tenants.map((tenant) => [String(tenant._id), tenant]),
    );

    const tenantSummaries = summaries.map((summary) => {
      const reservationFromId = summary.reservationId
        ? reservationById.get(String(summary.reservationId))
        : null;
      const reservation =
        reservationFromId ||
        (summary.tenantId
          ? reservationByTenantId.get(String(summary.tenantId))
          : null);
      const tenant = summary.tenantId
        ? tenantById.get(String(summary.tenantId))
        : null;

      return {
        ...summary,
        durationRange: reservation
          ? formatDurationRange(
              reservation.checkInDate,
              reservation.checkOutDate,
            )
          : summary.durationRange || "Ongoing",
        tenantEmail:
          summary.tenantEmail ||
          reservation?.userId?.email ||
          reservation?.billingEmail ||
          tenant?.email ||
          null,
      };
    });

    res.json({
      result: {
        id: period._id,
        computedTotalUsage: period.computedTotalUsage,
        totalRoomCost: period.computedTotalCost, // Frontend uses this alias
        ratePerUnit: period.ratePerUnit, // Frontend expects ratePerUnit
        verified: period.verified,
        segments: period.segments || [],
        tenantSummaries,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ─── ROOM HISTORY ───────────────────────────────────────────────────────────
 * Returns a complete occupancy log for a room: tenant name, bed, dates,
 * duration, and associated move-in/move-out meter readings.
 * This is the "source of truth" view for billing — billing periods just
 * filter from this log by date range.
 * ──────────────────────────────────────────────────────────────────────── */
export const getRoomHistory = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, roomId } = req.params;

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all check-in / check-out reservations for this room
    const reservations = await Reservation.find({
      roomId: room._id,
      status: { $in: ["checked-in", "checked-out"] },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .sort({ checkInDate: -1 })
      .lean();

    // Get all move-in / move-out meter readings for this room
    const readings = await UtilityReading.find({
      roomId: room._id,
      utilityType,
      eventType: { $in: ["move-in", "move-out"] },
      isArchived: false,
    }).lean();

    // Index readings by tenantId + eventType for fast lookup
    const readingMap = {};
    for (const r of readings) {
      const key = `${r.tenantId}_${r.eventType}`;
      // Keep the latest reading for each tenant+event combo
      if (
        !readingMap[key] ||
        new Date(r.date) > new Date(readingMap[key].date)
      ) {
        readingMap[key] = r;
      }
    }

    // Build a bed-id → bed-name lookup from the room's beds array
    const bedLabelMap = {};
    if (room.beds && Array.isArray(room.beds)) {
      for (const bed of room.beds) {
        const id = bed._id?.toString() || bed.id;
        if (id) bedLabelMap[id] = bed.label || bed.position || bed.name || "—";
      }
    }

    const now = new Date();
    const history = reservations.map((res) => {
      const tenantId = res.userId?._id?.toString();
      const moveInReading = tenantId ? readingMap[`${tenantId}_move-in`] : null;
      const moveOutReading = tenantId
        ? readingMap[`${tenantId}_move-out`]
        : null;

      const moveIn = res.checkInDate ? new Date(res.checkInDate) : null;
      const moveOut = res.checkOutDate ? new Date(res.checkOutDate) : null;
      const endDate = moveOut || now;
      const durationDays = moveIn
        ? Math.max(1, Math.ceil((endDate - moveIn) / 86_400_000))
        : 0;

      // Resolve bed name: try room.beds lookup first, fall back to reservation position
      const bedId = res.selectedBed?.id;
      const bedName =
        (bedId && bedLabelMap[bedId]) || res.selectedBed?.position || "—";

      return {
        id: res._id,
        tenantName: res.userId
          ? `${res.userId.firstName || ""} ${res.userId.lastName || ""}`.trim()
          : "Unknown",
        tenantEmail: res.userId?.email || res.billingEmail || null,
        tenantId: tenantId || null,
        bedName,
        bedId: bedId || null,
        moveInDate: res.checkInDate,
        moveOutDate: res.checkOutDate || null,
        isActive: res.status === "checked-in",
        durationDays,
        moveInReading: moveInReading
          ? {
              id: moveInReading._id,
              reading: moveInReading.reading,
              date: moveInReading.date,
            }
          : null,
        moveOutReading: moveOutReading
          ? {
              id: moveOutReading._id,
              reading: moveOutReading.reading,
              date: moveOutReading.date,
            }
          : null,
      };
    });

    res.json({ history, roomName: room.name || room.roomNumber });
  } catch (error) {
    next(error);
  }
};
