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
import { Room, Reservation, User, UtilityPeriod, UtilityReading, Bill } from "../models/index.js";
import { computeBilling } from "../utils/billingEngine.js";
import { getUtilityTargetCloseDate, isSameUtilityCycleBoundary } from "../utils/billingPolicy.js";
import { logBillingAudit } from "../utils/billingAudit.js";
import { getRoomLabel } from "../utils/roomLabel.js";
import { upsertDraftBillsForUtility } from "../utils/utilityBillFlow.js";
import { getUtilityDiagnostics } from "../utils/utilityDiagnostics.js";
import { ensureOpenUtilityPeriodForRoom } from "../utils/utilityLifecycle.js";
import {
  buildTenantEventsForPeriod,
  filterBillableReservationsForPeriod,
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
    displayName: `${dbUser?.firstName || ""} ${dbUser?.lastName || ""}`.trim() || dbUser?.email || "Admin",
  };
}

function assertUtilityRoomEligibility(room, utilityType) {
  if (utilityType === "water" && !isWaterBillableRoom(room)) {
    const error = new Error("Water billing only applies to private and double-sharing rooms.");
    error.statusCode = 400;
    throw error;
  }
}

function buildElectricityValidationError(missing) {
  const missingParts = [];
  if (missing.missingMoveInReadings.length > 0) {
    missingParts.push(`move-in: ${missing.missingMoveInReadings.map((entry) => entry.tenantName).join(", ")}`);
  }
  if (missing.missingMoveOutReadings.length > 0) {
    missingParts.push(`move-out: ${missing.missingMoveOutReadings.map((entry) => entry.tenantName).join(", ")}`);
  }

  const error = new Error(
    `Electricity billing requires move-in and move-out readings for all in-cycle tenant events. Missing ${missingParts.join(" | ")}.`,
  );
  error.statusCode = 409;
  error.details = missing;
  return error;
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
  const targetCloseDate = getUtilityTargetCloseDate(period.startDate);
  const closingDate = dayjs(endDate ? new Date(endDate) : targetCloseDate).startOf("day").toDate();

  assertUtilityRoomEligibility(room, utilityType);

  if (!isSameUtilityCycleBoundary(closingDate, targetCloseDate)) {
    throw new Error(`This period must close on ${dayjs(targetCloseDate).format("MMM D, YYYY")} to align cycles.`);
  }

  const endUtilityReading = new UtilityReading({
    utilityType,
    roomId: room._id,
    branch: room.branch,
    reading: Number(endReading),
    date: closingDate,
    eventType: "regular-billing",
    recordedBy: admin._id,
    utilityPeriodId: period._id,
    activeTenantIds: [],
  });
  await endUtilityReading.save();

  const allReadings = await UtilityReading.find({
    utilityType,
    roomId: room._id,
    isArchived: false,
    date: { $gte: period.startDate, $lte: closingDate },
  }).sort({ date: 1, createdAt: 1 }).lean();

  const reservations = await Reservation.find({
    roomId: room._id,
    status: { $in: ["checked-in", "checked-out"] },
    isArchived: { $ne: true },
    checkInDate: { $lt: closingDate },
    $or: [{ checkOutDate: null }, { checkOutDate: { $gt: period.startDate } }],
  }).populate("userId", "firstName lastName").lean();

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

  // Auto-open next period
  let nextPeriodMeta = null;
  try {
    const nextPeriod = await ensureOpenUtilityPeriodForRoom({
      utilityType,
      room,
      anchorDate: closingDate,
      anchorReading: Number(endReading),
    });
    nextPeriodMeta = {
      periodId: nextPeriod.period?._id || null,
      created: !!nextPeriod.created,
      targetCloseDate: nextPeriod.targetCloseDate || null,
    };
  } catch (err) {
    logger.warn({ err }, "Auto-chain utility period failed");
  }

  return { closingDate, computationResult, periodId: period._id, nextPeriod: nextPeriodMeta };
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

    const openExists = await UtilityPeriod.findOne({ utilityType, roomId: room._id, status: "open", isArchived: false });
    if (openExists) return res.status(409).json({ error: "Room already has an open period." });

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

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    assertUtilityRoomEligibility(room, utilityType);

    const openPeriod = await UtilityPeriod.findOne({
      roomId: room._id, utilityType, status: "open", isArchived: false
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
    if (!period || period.status !== "open") return res.status(400).json({ error: "Invalid or already closed period" });

    const room = await Room.findById(period.roomId);
    const result = await closePeriodAndGenerateDrafts({ admin, period, room, endReading, endDate, utilityType, requestContext: req });
    
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
    const closed = [], failed = [];

    for (const item of closures) {
      try {
        const period = await UtilityPeriod.findById(item.periodId);
        const room = await Room.findById(period.roomId);
        const result = await closePeriodAndGenerateDrafts({
          admin, period, room, endReading: item.endReading, endDate: item.endDate || endDate, utilityType, requestContext: req
        });
        closed.push({ periodId: period._id, roomName: room.name, success: true });
      } catch (err) {
        failed.push({ periodId: item.periodId, error: err.message });
      }
    }

    res.status(closed.length > 0 ? 200 : 400).json({ success: failed.length === 0, closed, failed });
  } catch (err) {
    next(err);
  }
};

export const deleteUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;

    const period = await UtilityPeriod.findById(id);
    if (!period || period.isArchived) return res.status(404).json({ error: "Period not found" });

    // Ensure no published bills depend on this period
    if (period.tenantSummaries && period.tenantSummaries.length > 0) {
      for (const summary of period.tenantSummaries) {
        if (summary.billId) {
          const bill = await Bill.findById(summary.billId);
          if (bill && bill.status !== "draft") {
             return res.status(400).json({ error: "Cannot delete billing period because bills have already been published." });
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
             if (bill.charges.electricity === 0 && bill.charges.water === 0 && bill.charges.rent === 0) {
               bill.isArchived = true;
             }
             await bill.save();
          }
        }
      }
    }

    // Soft delete associated readings to keep history intact but out of calculations
    await UtilityReading.updateMany(
      { utilityPeriodId: period._id },
      { $set: { isArchived: true } }
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
    if (!period || period.isArchived) return res.status(404).json({ error: "Period not found" });
    
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
    if (!reading || reading.isArchived) return res.status(404).json({ error: "Reading not found" });
    
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
    
    const readingDoc = await UtilityReading.findById(id);
    if (!readingDoc || readingDoc.isArchived) return res.status(404).json({ error: "Reading not found" });
    
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
    if (!period || period.status !== "closed") return res.status(400).json({ error: "Invalid or open period" });
    
    const room = await Room.findById(period.roomId);
    assertUtilityRoomEligibility(room, utilityType);
    
    const allReadings = await UtilityReading.find({
      utilityType,
      roomId: room._id,
      isArchived: false,
      date: { $gte: period.startDate, $lte: period.endDate },
    }).sort({ date: 1, createdAt: 1 }).lean();

    const reservations = await Reservation.find({
      roomId: room._id,
      status: { $in: ["checked-in", "checked-out"] },
      isArchived: { $ne: true },
      checkInDate: { $lt: period.endDate },
      $or: [{ checkOutDate: null }, { checkOutDate: { $gt: period.startDate } }],
    }).populate("userId", "firstName lastName").lean();

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
    if (utilityType === 'electricity') {
      return res.json({ rooms: (diagnostics.electricityRooms || []).map(r => ({ ...r, id: r.roomId })) });
    } else if (utilityType === 'water') {
      return res.json({
        rooms: (diagnostics.waterRooms || []).map((r) => ({ ...r, id: r.roomId })),
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
      .populate("tenantId", "firstName lastName")
      .populate("recordedBy", "firstName lastName")
      .sort({ date: 1, createdAt: 1 })
      .lean();

    res.json({
      readings: readings.map((r) => ({
        id: r._id,
        reading: r.reading,
        date: r.date,
        eventType: r.eventType,
        tenant: r.tenantId
          ? `${r.tenantId.firstName || ""} ${r.tenantId.lastName || ""}`.trim()
          : null,
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
      reading: latestReading ? {
        id: latestReading._id,
        reading: latestReading.reading,
        date: latestReading.date,
        eventType: latestReading.eventType,
      } : null,
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

    res.json({
      periods: periods.map((p) => {
        const hasDraftBills = (p.tenantSummaries || []).some(s => s.billId && true);
        
        let displayStatus = "closed";
        if (p.status === "open") displayStatus = "open";
        else if (p.revised) displayStatus = "revised";
        else if (hasDraftBills) displayStatus = "ready";

        return {
          id: p._id,
          startDate: p.startDate,
          endDate: p.endDate,
          startReading: p.startReading,
          endReading: p.endReading,
          ratePerUnit: p.ratePerUnit, 
          status: p.status,
          displayStatus,
          revised: p.revised,
          hasDraftBills,
          hasSentBills: false, 
          closedAt: p.closedAt,
          targetCloseDate: p.status === "open" ? getUtilityTargetCloseDate(p.startDate) : null,
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
      return res.status(404).json({ error: "No billing result found for this period" });
    }

    res.json({ 
      result: {
         id: period._id,
         computedTotalUsage: period.computedTotalUsage,
         totalRoomCost: period.computedTotalCost, // Frontend uses this alias
         ratePerUnit: period.ratePerUnit,         // Frontend expects ratePerUnit
         verified: period.verified,
         segments: period.segments || [],
         tenantSummaries: period.tenantSummaries || [] 
      } 
    });
  } catch (error) {
    next(error);
  }
};
