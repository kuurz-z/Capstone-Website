/**
 * ============================================================================
 * ELECTRICITY BILLING CONTROLLER
 * ============================================================================
 *
 * Handles all segment-based electricity billing operations.
/**
 * ============================================================================
 * ELECTRICITY BILLING CONTROLLER
 * ============================================================================
 *
 * Handles all segment-based electricity billing operations.
 * Separate from billingController.js to avoid breaking existing payment flows.
 *
 * MIDDLEWARE CHAIN: verifyToken ΓåÆ verifyAdmin ΓåÆ filterByBranch ΓåÆ handler
 * (Tenant endpoints only need verifyToken)
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  Bill,
  MeterReading,
  BillingPeriod,
  BillingResult,
  Room,
  Reservation,
  User,
} from "../models/index.js";
import { computeBilling, truncate4 } from "../utils/billingEngine.js";
import { generateBillPdf } from "../utils/pdfGenerator.js";
import logger from "../middleware/logger.js";
import { sendBillGeneratedEmail } from "../config/email.js";
import {
  getUtilityTargetCloseDate,
  isSameUtilityCycleBoundary,
  syncBillAmounts,
} from "../utils/billingPolicy.js";
import {
  getFinalizedWaterRecordForPeriod,
  isWaterBillableRoomType,
} from "../utils/waterBilling.js";
import { logBillingAudit } from "../utils/billingAudit.js";
import { getRoomLabel } from "../utils/roomLabel.js";
import { ensureOpenElectricityPeriodForRoom } from "../utils/electricityLifecycle.js";
import {
  getElectricityRoomDiagnostics,
  getUtilityDiagnostics,
} from "../utils/utilityDiagnostics.js";
import {
  getDraftBillsForSummaryBillIds,
  sendDraftUtilityBills,
  upsertDraftBillsForUtility,
} from "../utils/utilityBillFlow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ΓöÇΓöÇΓöÇ shared helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

/** Get admin's role and branch from MongoDB */
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
      req.user?.email ||
      "Admin",
  };
}

/** Round to 2 decimal places for final bill amounts */
const r2 = (n) => Math.round(n * 100) / 100;

function formatClosedPeriodResponse({ billingResult, computationResult }) {
  return {
    id: billingResult._id,
    totalRoomKwh: computationResult.totalRoomKwh,
    totalRoomCost: computationResult.totalRoomCost,
    verified: computationResult.verified,
    segmentCount: computationResult.segments.length,
    tenantCount: computationResult.tenantSummaries.length,
    tenantSummaries: computationResult.tenantSummaries.map((tenant) => ({
      tenantName: tenant.tenantName,
      totalKwh: tenant.totalKwh,
      billAmount: tenant.billAmount,
    })),
  };
}

function formatElectricityRoomDiagnostics(diag) {
  return {
    entityType: diag.entityType,
    entityId: diag.entityId,
    roomId: diag.roomId,
    roomName: diag.roomName,
    branch: diag.branch,
    status: diag.status,
    activeTenantCount: diag.activeTenantCount,
    reservationIds: diag.reservationIds,
    orphanReadingIds: diag.orphanReadingIds,
    openPeriodId: diag.openPeriodId,
    targetCloseDate: diag.targetCloseDate,
    issueCodes: diag.issueCodes,
    issues: diag.issues,
  };
}

async function resolveTenantEventsForBilling(roomId, readings, periodStartReading, periodStartDate = null) {
  const tenantEvents = await buildTenantEventsFromReadings(
    roomId,
    readings,
    periodStartReading,
    periodStartDate,
  );

  const unresolvedAnchors = tenantEvents.filter((event) => event.requiresRepair);
  if (unresolvedAnchors.length > 0) {
    const tenantNames = unresolvedAnchors
      .map((event) => event.tenantName)
      .filter(Boolean)
      .join(", ");
    const error = new Error(
      `Missing move-in anchor reading for: ${tenantNames || "one or more tenants"}`,
    );
    error.statusCode = 409;
    error.code = "electricity_missing_movein_anchor";
    error.metadata = {
      unresolvedAnchors: unresolvedAnchors.map((event) => ({
        tenantId: event.tenantId,
        tenantName: event.tenantName,
        reservationId: event.reservationId || null,
      })),
    };
    throw error;
  }

  return tenantEvents.map(({ requiresRepair, reservationId, ...event }) => event);
}

function buildPeriodDateFilter(from, to, field = "startDate") {
  const filter = {};
  if (from) {
    const parsedFrom = new Date(from);
    if (!Number.isNaN(parsedFrom.getTime())) {
      filter.$gte = parsedFrom;
    }
  }
  if (to) {
    const parsedTo = new Date(to);
    if (!Number.isNaN(parsedTo.getTime())) {
      parsedTo.setHours(23, 59, 59, 999);
      filter.$lte = parsedTo;
    }
  }
  return Object.keys(filter).length ? { [field]: filter } : {};
}

async function closePeriodAndGenerateDrafts({
  admin,
  period,
  room,
  endReading,
  endDate,
  requestContext = null,
}) {
  const targetCloseDate = getUtilityTargetCloseDate(period.startDate);
  const requestedClosingDate = endDate ? new Date(endDate) : targetCloseDate;
  const closingDate = dayjs(requestedClosingDate).startOf("day").toDate();

  if (!isSameUtilityCycleBoundary(closingDate, targetCloseDate)) {
    throw new Error(
      `This billing period must close on ${dayjs(targetCloseDate).format("MMM D, YYYY")} to stay on the 15th-to-15th cycle.`,
    );
  }

  const endMeterReading = new MeterReading({
    roomId: room._id,
    branch: room.branch,
    reading: Number(endReading),
    date: closingDate,
    eventType: "regular-billing",
    recordedBy: admin._id,
    billingPeriodId: period._id,
    activeTenantIds: [],
  });
  await endMeterReading.save();

  const allReadings = await MeterReading.find({
    roomId: room._id,
    isArchived: false,
    date: { $gte: period.startDate, $lte: closingDate },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const tenantEvents = await resolveTenantEventsForBilling(
    room._id,
    allReadings,
    period.startReading,
    period.startDate,
  );

  const computationResult = computeBilling({
    meterReadings: allReadings.map((reading) => ({
      date: reading.date,
      reading: reading.reading,
      eventType: reading.eventType,
    })),
    tenantEvents,
    ratePerKwh: period.ratePerKwh,
    startReading: period.startReading,
    endReading: Number(endReading),
  });

  const billingResult = new BillingResult({
    billingPeriodId: period._id,
    roomId: room._id,
    branch: room.branch,
    computedBy: admin._id,
    ratePerKwh: period.ratePerKwh,
    totalRoomKwh: computationResult.totalRoomKwh,
    totalRoomCost: computationResult.totalRoomCost,
    verified: computationResult.verified,
    segments: computationResult.segments,
    tenantSummaries: computationResult.tenantSummaries,
  });
  await billingResult.save();

  billingResult.tenantSummaries = await upsertDraftBillsForUtility({
    period: { ...period.toObject(), endDate: closingDate },
    room,
    tenantSummaries: billingResult.tenantSummaries,
    utilityType: "electricity",
  });
  await billingResult.save();

  period.endDate = closingDate;
  period.endReading = Number(endReading);
  period.status = "closed";
  period.closedAt = new Date();
  period.closedBy = admin._id;
  await period.save();

  await logBillingAudit(requestContext || {}, {
    admin,
    action: "billing_period_closed",
    severity: "medium",
    entityId: period._id,
    branch: period.branch,
    details: `Closed billing period for room ${getRoomLabel(room)}`,
    metadata: {
      roomId: room._id,
      roomName: getRoomLabel(room),
      billingResultId: billingResult._id,
      tenantCount: computationResult.tenantSummaries.length,
      totalRoomCost: computationResult.totalRoomCost,
      totalRoomKwh: computationResult.totalRoomKwh,
    },
  });

  try {
    const alreadyOpen = await BillingPeriod.findOne({
      roomId: room._id,
      status: "open",
      isArchived: false,
    });
    if (!alreadyOpen) {
      const nextPeriod = new BillingPeriod({
        roomId: room._id,
        branch: room.branch,
        startDate: dayjs(closingDate).startOf("day").toDate(),
        startReading: Number(endReading),
        ratePerKwh: period.ratePerKwh,
        status: "open",
        createdBy: admin._id,
      });
      await nextPeriod.save();
      logger.info({ roomId: room._id, nextPeriodId: nextPeriod._id }, "Auto-opened next billing period");
    }
  } catch (chainErr) {
    logger.warn({ err: chainErr }, "Auto-chain billing period failed (non-fatal)");
  }

  return {
    closingDate,
    billingResult,
    computationResult,
  };
}

// ============================================================================
// METER READING ENDPOINTS
// ============================================================================

/**
 * POST /api/electricity/readings
 * Record a new submeter reading for a room.
 */
export const recordMeterReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId, reading, date, eventType, tenantId } = req.body;

    // Validate required fields
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });
    if (reading === undefined || reading === null)
      return res.status(400).json({ error: "Meter reading value is required" });
    if (!date) return res.status(400).json({ error: "Date is required" });
    if (!eventType)
      return res.status(400).json({ error: "Event type is required" });
    if (
      (eventType === "move-in" || eventType === "move-out") &&
      !tenantId
    ) {
      return res
        .status(400)
        .json({ error: "Tenant ID is required for move-in/move-out events" });
    }

    // Verify room exists and admin has access
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Cannot access rooms from another branch" });
    }

    // FR-MR-03: Reading must be >= the most recent reading for the same room
    const lastReading = await MeterReading.findOne({
      roomId: room._id,
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (lastReading && reading < lastReading.reading) {
      return res.status(400).json({
        error: `Reading cannot be lower than last recorded value (${lastReading.reading}). Meter readings must be non-decreasing.`,
      });
    }

    // Build activeTenantIds snapshot: all checked-in tenants currently in room
    const checkedInReservations = await Reservation.find({
      roomId: room._id,
      status: "checked-in",
      isArchived: { $ne: true },
    })
      .select("userId")
      .lean();
    const activeTenantIds = checkedInReservations
      .map((r) => r.userId)
      .filter(Boolean);

    // Find the open billing period for this room (if any)
    const openPeriod = await BillingPeriod.findOne({
      roomId: room._id,
      status: "open",
      isArchived: false,
    }).lean();

    const meterReading = new MeterReading({
      roomId: room._id,
      branch: room.branch,
      reading: Number(reading),
      date: new Date(date),
      eventType,
      tenantId: tenantId || null,
      activeTenantIds,
      recordedBy: admin._id,
      billingPeriodId: openPeriod?._id || null,
    });
    await meterReading.save();

    res.status(201).json({
      success: true,
      meterReading: {
        id: meterReading._id,
        roomId: meterReading.roomId,
        reading: meterReading.reading,
        date: meterReading.date,
        eventType: meterReading.eventType,
        tenantId: meterReading.tenantId,
        activeTenantCount: activeTenantIds.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/readings/:roomId
 * Get all meter readings for a room. Optional ?periodId filter.
 */
export const getMeterReadings = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId } = req.params;
    const { periodId } = req.query;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const filter = { roomId: room._id, isArchived: false };
    if (periodId) filter.billingPeriodId = periodId;

    const readings = await MeterReading.find(filter)
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

/**
 * GET /api/electricity/readings/:roomId/latest
 * Get the most recent meter reading for a room.
 */
export const getLatestReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const reading = await MeterReading.findOne({
      roomId: room._id,
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (!reading) {
      return res
        .status(404)
        .json({ error: "No meter readings found for this room" });
    }

    res.json({
      reading: reading.reading,
      date: reading.date,
      eventType: reading.eventType,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/electricity/readings/:id
 * Update an existing meter reading (value, date, eventType, tenantId).
 * Intended for fixing auto-generated move-in/move-out readings.
 */
export const updateMeterReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;
    const { reading, date, eventType, tenantId } = req.body;

    const meterReading = await MeterReading.findById(id);
    if (!meterReading) return res.status(404).json({ error: "Meter reading not found" });
    if (!admin.isSuperAdmin && meterReading.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Validate eventType if provided
    const validEventTypes = ["move-in", "move-out", "regular-billing"];
    if (eventType && !validEventTypes.includes(eventType)) {
      return res.status(400).json({ error: `Invalid event type. Must be one of: ${validEventTypes.join(", ")}` });
    }

    // Apply updates selectively
    if (reading !== undefined && reading !== null && reading !== "") {
      meterReading.reading = Number(reading);
    }
    if (date) {
      meterReading.date = new Date(date);
    }
    if (eventType) {
      meterReading.eventType = eventType;
    }
    // Allow clearing tenantId (null) or setting a new one
    if ("tenantId" in req.body) {
      meterReading.tenantId = tenantId || null;
    }

    await meterReading.save();

    await logBillingAudit(req, {
      admin,
      action: "meter_reading_updated",
      severity: "medium",
      entityId: meterReading._id,
      branch: meterReading.branch,
      details: `Updated ${meterReading.eventType} reading for room ${meterReading.roomId}`,
      metadata: {
        roomId: meterReading.roomId,
        billingPeriodId: meterReading.billingPeriodId || null,
        eventType: meterReading.eventType,
        reading: meterReading.reading,
        date: meterReading.date,
      },
    });

    res.json({
      success: true,
      meterReading: {
        id: meterReading._id,
        reading: meterReading.reading,
        date: meterReading.date,
        eventType: meterReading.eventType,
        tenantId: meterReading.tenantId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// BILLING PERIOD ENDPOINTS
// ============================================================================

/**
 * POST /api/electricity/periods
 * Open a new billing period for a room.
 */
export const openBillingPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId, startDate, startReading, ratePerKwh } = req.body;
    const requestedStartDate = startDate ? new Date(startDate) : null;

    if (!roomId) return res.status(400).json({ error: "Room ID is required" });
    if (!startDate)
      return res.status(400).json({ error: "Start date is required" });
    if (startReading === undefined)
      return res.status(400).json({ error: "Start reading is required" });
    if (!ratePerKwh || ratePerKwh <= 0)
      return res
        .status(400)
        .json({ error: "Rate per kWh is required and must be positive" });
    if (!requestedStartDate || Number.isNaN(requestedStartDate.getTime()) || dayjs(requestedStartDate).date() !== 15) {
      return res.status(400).json({
        error: "Billing period start date must be on the 15th to stay aligned with the monthly cycle.",
      });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Cannot access rooms from another branch" });
    }

    // Check for existing open period
    const existingOpen = await BillingPeriod.findOne({
      roomId: room._id,
      status: "open",
      isArchived: false,
    });
    if (existingOpen) {
      return res.status(409).json({
        error:
          "This room already has an open billing period. Close it before opening a new one.",
      });
    }

    // Also record the start reading as a meter reading entry
    const meterReading = new MeterReading({
      roomId: room._id,
      branch: room.branch,
      reading: Number(startReading),
      date: dayjs(requestedStartDate).startOf("day").toDate(),
      eventType: "regular-billing",
      recordedBy: admin._id,
      activeTenantIds: [],
    });
    await meterReading.save();

    const bootstrap = await ensureOpenElectricityPeriodForRoom({
      room,
      anchorDate: dayjs(requestedStartDate).startOf("day").toDate(),
      anchorReading: Number(startReading),
    });
    const period = bootstrap.period;
    period.ratePerKwh = Number(ratePerKwh);
    await period.save();

    // Link the start reading to the new period
    meterReading.billingPeriodId = period._id;
    await meterReading.save();

    res.status(201).json({
      success: true,
      period: {
        id: period._id,
        roomId: period.roomId,
        startDate: period.startDate,
        startReading: period.startReading,
        ratePerKwh: period.ratePerKwh,
        status: period.status,
        targetCloseDate: getUtilityTargetCloseDate(period.startDate),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/electricity/periods/:id/close
 * Close a billing period and trigger computation.
 */
export const closeBillingPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;
    const { endReading, endDate } = req.body;

    if (endReading === undefined) {
      return res.status(400).json({ error: "End reading is required" });
    }

    const period = await BillingPeriod.findById(id);
    if (!period) return res.status(404).json({ error: "Billing period not found" });
    if (!admin.isSuperAdmin && period.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (period.status !== "open") {
      return res.status(400).json({ error: "Only open periods can be closed" });
    }
    if (Number(endReading) < period.startReading) {
      return res.status(400).json({
        error: `End reading (${endReading}) cannot be lower than start reading (${period.startReading}).`,
      });
    }
    const targetCloseDate = getUtilityTargetCloseDate(period.startDate);
    const requestedCloseDate = endDate ? dayjs(endDate).startOf("day").toDate() : targetCloseDate;
    if (!isSameUtilityCycleBoundary(requestedCloseDate, targetCloseDate)) {
      return res.status(400).json({
        error: `Open periods must close on ${dayjs(targetCloseDate).format("MMM D, YYYY")} to keep the 15th-to-15th cycle.`,
      });
    }

    const room = await Room.findById(period.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const result = await closePeriodAndGenerateDrafts({
      admin,
      period,
      room,
      endReading,
      endDate: requestedCloseDate,
      requestContext: req,
    });

    res.json({
      success: true,
      result: formatClosedPeriodResponse(result),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/electricity/batch-close
 * Best-effort close for multiple open periods.
 */
export const batchCloseBillingPeriods = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { closures, endDate } = req.body;

    if (!Array.isArray(closures) || closures.length === 0) {
      return res.status(400).json({ error: "At least one closure item is required" });
    }

    const closed = [];
    const failed = [];

    for (const item of closures) {
      const { periodId, endReading, roomLabel = null } = item || {};

      try {
        if (!periodId) {
          throw new Error("Missing periodId");
        }
        if (endReading === undefined || endReading === null || endReading === "") {
          throw new Error("Missing endReading");
        }

        const period = await BillingPeriod.findById(periodId);
        if (!period || period.isArchived) {
          throw new Error("Billing period not found");
        }
        if (!admin.isSuperAdmin && period.branch !== admin.branch) {
          throw new Error("Access denied");
        }
        if (period.status !== "open") {
          throw new Error("Only open periods can be closed");
        }
        if (Number(endReading) < period.startReading) {
          throw new Error(
            `End reading (${endReading}) cannot be lower than start reading (${period.startReading})`,
          );
        }

        const room = await Room.findById(period.roomId);
        if (!room) {
          throw new Error("Room not found");
        }

        const result = await closePeriodAndGenerateDrafts({
          admin,
          period,
          room,
          endReading,
          endDate: item?.endDate || endDate,
          requestContext: req,
        });

        closed.push({
          periodId: period._id,
          roomId: room._id,
          roomName: getRoomLabel(room, roomLabel || "Unknown room"),
          branch: period.branch,
          ...formatClosedPeriodResponse(result),
        });
      } catch (error) {
        failed.push({
          periodId: periodId || null,
          roomName: roomLabel || null,
          error: error.message || "Failed to close billing period",
        });
      }
    }

    res.status(closed.length > 0 ? 200 : 400).json({
      success: failed.length === 0,
      summary: {
        requested: closures.length,
        closed: closed.length,
        failed: failed.length,
      },
      closed,
      failed,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/diagnostics
 * Combined utility diagnostics for electricity rooms and water records.
 */
export const getBillingDiagnostics = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isSuperAdmin ? req.query.branch || null : admin.branch;
    const diagnostics = await getUtilityDiagnostics({ branch });

    res.json({
      ...diagnostics,
      electricityRooms: diagnostics.electricityRooms.map(formatElectricityRoomDiagnostics),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/export
 * Export electricity billing rows for CSV download.
 */
export const exportElectricityBilling = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isSuperAdmin ? req.query.branch || null : admin.branch;
    const status = req.query.status && req.query.status !== "all" ? req.query.status : null;
    const roomId = req.query.roomId || null;

    const periodFilter = {
      isArchived: false,
      ...(branch ? { branch } : {}),
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
      ...buildPeriodDateFilter(req.query.from, req.query.to, "startDate"),
    };

    const periods = await BillingPeriod.find(periodFilter)
      .sort({ startDate: -1, createdAt: -1 })
      .lean();

    const periodIds = periods.map((period) => period._id);
    const roomIds = [...new Set(periods.map((period) => String(period.roomId)))];

    const [results, rooms] = await Promise.all([
      BillingResult.find({ billingPeriodId: { $in: periodIds } }).lean(),
      Room.find({ _id: { $in: roomIds } }).select("name roomNumber branch type").lean(),
    ]);

    const resultMap = new Map(results.map((result) => [String(result.billingPeriodId), result]));
    const roomMap = new Map(rooms.map((room) => [String(room._id), room]));
    const billIds = [];

    for (const result of results) {
      for (const summary of result.tenantSummaries || []) {
        if (summary.billId) {
          billIds.push(summary.billId);
        }
      }
    }

    const bills = billIds.length
      ? await Bill.find({ _id: { $in: billIds }, isArchived: false })
          .select("status dueDate sentAt totalAmount")
          .lean()
      : [];
    const billMap = new Map(bills.map((bill) => [String(bill._id), bill]));

    const rows = periods.flatMap((period) => {
      const room = roomMap.get(String(period.roomId));
      const result = resultMap.get(String(period._id));
      const baseRow = {
        periodId: String(period._id),
        roomId: String(period.roomId),
        roomName: getRoomLabel(room),
        branch: period.branch,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        periodStatus: period.status,
        ratePerKwh: result?.ratePerKwh ?? period.ratePerKwh,
      };

      if (!result?.tenantSummaries?.length) {
        return [
          {
            ...baseRow,
            tenantName: "",
            totalKwh: "",
            billAmount: "",
            billStatus: "",
            dueDate: null,
            sentAt: null,
            totalBillAmount: "",
          },
        ];
      }

      return result.tenantSummaries.map((summary) => {
        const bill = summary.billId ? billMap.get(String(summary.billId)) : null;
        return {
          ...baseRow,
          tenantName: summary.tenantName || "",
          totalKwh: summary.totalKwh ?? "",
          billAmount: summary.billAmount ?? "",
          billStatus: bill?.status || "",
          dueDate: bill?.dueDate || null,
          sentAt: bill?.sentAt || null,
          totalBillAmount: bill?.totalAmount ?? summary.billAmount ?? "",
        };
      });
    });

    await logBillingAudit(req, {
      admin,
      action: "electricity_export_downloaded",
      severity: "low",
      branch,
      details: `Exported ${rows.length} electricity billing row${rows.length === 1 ? "" : "s"}`,
      metadata: {
        rowCount: rows.length,
        periodCount: periods.length,
        filters: {
          branch,
          status,
          roomId,
          from: req.query.from || null,
          to: req.query.to || null,
        },
      },
    });

    res.json({
      success: true,
      generatedAt: new Date(),
      filters: {
        branch,
        status,
        roomId,
        from: req.query.from || null,
        to: req.query.to || null,
      },
      summary: {
        periodCount: periods.length,
        rowCount: rows.length,
      },
      rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/periods/:roomId
 * List all billing periods for a room.
 */
export const getBillingPeriods = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periods = await BillingPeriod.find({
      roomId: room._id,
      isArchived: false,
    })
      .sort({ startDate: -1 })
      .lean();

    const periodIds = periods.map((period) => period._id);
    const results = periodIds.length
      ? await BillingResult.find({
          billingPeriodId: { $in: periodIds },
          isArchived: false,
        })
          .select("billingPeriodId tenantSummaries.billId")
          .lean()
      : [];
    const resultMap = new Map(results.map((result) => [String(result.billingPeriodId), result]));

    const billIds = results.flatMap((result) =>
      (result.tenantSummaries || []).map((summary) => summary.billId).filter(Boolean),
    );
    const bills = billIds.length
      ? await Bill.find({ _id: { $in: billIds }, isArchived: false })
          .select("_id status sentAt")
          .lean()
      : [];
    const billMap = new Map(bills.map((bill) => [String(bill._id), bill]));

    res.json({
      periods: periods.map((p) => {
        const result = resultMap.get(String(p._id));
        const periodBills = (result?.tenantSummaries || [])
          .map((summary) => summary.billId)
          .filter(Boolean)
          .map((billId) => billMap.get(String(billId)))
          .filter(Boolean);
        const hasDraftBills = periodBills.some((bill) => bill.status === "draft");
        const hasSentBills = periodBills.some((bill) => bill.status !== "draft" || bill.sentAt);
        const displayStatus = p.status === "open"
          ? "open"
          : hasDraftBills
            ? "ready"
            : p.revised
              ? "revised"
              : "closed";

        return {
          id: p._id,
          startDate: p.startDate,
          endDate: p.endDate,
          startReading: p.startReading,
          endReading: p.endReading,
          ratePerKwh: p.ratePerKwh,
          status: p.status,
          displayStatus,
          revised: p.revised,
          hasDraftBills,
          hasSentBills,
          closedAt: p.closedAt,
          targetCloseDate: p.status === "open" ? getUtilityTargetCloseDate(p.startDate) : null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/electricity/periods/:id
 * Update an open billing period.
 */
export const updateBillingPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;
    const { ratePerKwh } = req.body;

    const parsedRate = Number(ratePerKwh);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      return res.status(400).json({ error: "Rate per kWh must be a positive number" });
    }

    const period = await BillingPeriod.findById(id);
    if (!period || period.isArchived) {
      return res.status(404).json({ error: "Billing period not found" });
    }
    if (!admin.isSuperAdmin && period.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (period.status !== "open") {
      return res.status(400).json({ error: "Only open periods can be updated" });
    }

    period.ratePerKwh = parsedRate;
    await period.save();

    res.json({
      success: true,
      period: {
        id: period._id,
        roomId: period.roomId,
        startDate: period.startDate,
        endDate: period.endDate,
        startReading: period.startReading,
        endReading: period.endReading,
        ratePerKwh: period.ratePerKwh,
        status: period.status,
        revised: period.revised,
        closedAt: period.closedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// BILLING RESULT ENDPOINTS
// ============================================================================

/**
 * GET /api/electricity/results/:periodId
 * Get full billing result for a period (segments + tenant summaries).
 */
export const getBillingResult = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { periodId } = req.params;

    const result = await BillingResult.findOne({
      billingPeriodId: periodId,
      isArchived: false,
    }).lean();

    if (!result) {
      return res
        .status(404)
        .json({ error: "No billing result found for this period" });
    }
    if (!admin.isSuperAdmin && result.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/electricity/results/:periodId/revise
 * Re-run computation on a closed period. Overwrites the result.
 */
export const reviseBillingResult = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { periodId } = req.params;
    const { revisionNote } = req.body;

    const period = await BillingPeriod.findById(periodId);
    if (!period) return res.status(404).json({ error: "Billing period not found" });
    if (!admin.isSuperAdmin && period.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (period.status === "open") {
      return res.status(400).json({ error: "Cannot revise an open period" });
    }

    const room = await Room.findById(period.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Re-fetch readings and re-compute
    const allReadings = await MeterReading.find({
      roomId: room._id,
      isArchived: false,
      date: { $gte: period.startDate, $lte: period.endDate },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const tenantEvents = await resolveTenantEventsForBilling(
      room._id,
      allReadings,
      period.startReading,
      period.startDate,
    );

    const computationResult = computeBilling({
      meterReadings: allReadings.map((r) => ({
        date: r.date,
        reading: r.reading,
        eventType: r.eventType,
      })),
      tenantEvents,
      ratePerKwh: period.ratePerKwh,
      startReading: period.startReading,
      endReading: period.endReading,
    });

    // Overwrite existing result
    const updatedResult = await BillingResult.findOneAndUpdate(
      { billingPeriodId: period._id },
      {
        computedAt: new Date(),
        computedBy: admin._id,
        totalRoomKwh: computationResult.totalRoomKwh,
        totalRoomCost: computationResult.totalRoomCost,
        verified: computationResult.verified,
        segments: computationResult.segments,
        tenantSummaries: computationResult.tenantSummaries,
        revised: true,
        revisionNote: revisionNote || null,
        revisedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    updatedResult.tenantSummaries = await upsertDraftBillsForUtility({
      period,
      room,
      tenantSummaries: updatedResult.tenantSummaries,
      utilityType: "electricity",
    });
    await updatedResult.save();

    // Update period
    period.revised = true;
    period.revisionNote = revisionNote || null;
    period.revisedAt = new Date();
    period.status = "revised";
    await period.save();

    await logBillingAudit(req, {
      admin,
      action: "billing_period_revised",
      severity: "high",
      entityId: period._id,
      branch: period.branch,
      details: `Revised billing period for room ${getRoomLabel(room)}`,
      metadata: {
        roomId: room._id,
        periodId: period._id,
        verified: computationResult.verified,
        revisionNote: revisionNote || "",
      },
    });

    res.json({
      success: true,
      message: "Billing result revised successfully",
      verified: computationResult.verified,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// TENANT ENDPOINTS
// ============================================================================

/**
 * GET /api/electricity/my-bills
 * Tenant views their electricity bill summaries.
 */
export const getMyElectricityBills = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const results = await BillingResult.find({
      "tenantSummaries.tenantId": dbUser._id,
      isArchived: false,
    })
      .populate("roomId", "name roomNumber branch type")
      .populate("billingPeriodId", "startDate endDate billingMonth")
      .sort({ computedAt: -1 })
      .lean();

    const bills = results.map((r) => {
      const mySummary = r.tenantSummaries.find(
        (t) => String(t.tenantId) === String(dbUser._id),
      );
      
      let fallbackCycleText = "";
      if (r.segments && r.segments.length > 0) {
          const firstLab = r.segments[0].periodLabel || "";
          const lastLab = r.segments[r.segments.length - 1].periodLabel || "";
          const splitChar1 = firstLab.includes("ΓÇô") ? "ΓÇô" : "-";
          const splitChar2 = lastLab.includes("ΓÇô") ? "ΓÇô" : "-";
          
          const sDateStr = firstLab.split(splitChar1)[0]?.trim();
          const eDateStr = lastLab.split(splitChar2)[1]?.trim();
          if (sDateStr && eDateStr) {
             fallbackCycleText = `${sDateStr} - ${eDateStr}`;
          }
      }

      return {
        billingResultId: r._id,
        billingPeriodId: r.billingPeriodId?._id || r.billingPeriodId,
        startDate: r.billingPeriodId?.startDate,
        endDate: r.billingPeriodId?.endDate,
        cycleText: fallbackCycleText,
        billingMonth: r.billingPeriodId?.billingMonth,
        room: getRoomLabel(r.roomId, "N/A"),
        branch: r.branch,
        ratePerKwh: r.ratePerKwh,
        totalKwh: mySummary?.totalKwh || 0,
        billAmount: mySummary?.billAmount || 0,
        billId: mySummary?.billId || null,
        verified: r.verified,
        revised: r.revised,
        computedAt: r.computedAt,
      };
    });

    res.json({ bills });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/my-bills/:periodId
 * Tenant views one period's breakdown (only their segments).
 */
export const getMyBillBreakdown = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const { periodId } = req.params;
    const result = await BillingResult.findOne({
      billingPeriodId: periodId,
      isArchived: false,
    })
      .populate("roomId", "name roomNumber branch type")
      .lean();

    if (!result) {
      return res.status(404).json({ error: "Billing result not found" });
    }

    // Check tenant has access
    const mySummary = result.tenantSummaries.find(
      (t) => String(t.tenantId) === String(dbUser._id),
    );
    if (!mySummary) {
      return res.status(403).json({ error: "You do not have access to this billing result" });
    }

    // Filter segments to only show those where tenant was active
    const mySegments = result.segments.filter((seg) =>
      seg.activeTenantIds.some((id) => String(id) === String(dbUser._id)),
    );

    res.json({
      room: getRoomLabel(result.roomId, "N/A"),
      branch: result.branch,
      ratePerKwh: result.ratePerKwh,
      totalRoomKwh: result.totalRoomKwh,
      myTotalKwh: mySummary.totalKwh,
      myBillAmount: mySummary.billAmount,
      verified: result.verified,
      segments: mySegments,
      allSegments: result.segments, // Full table for transparency
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/electricity/my-bills/by-bill/:billId
 * Tenant: returns the electricity segment breakdown for a specific Bill document.
 *
 * Use-case: BillingPage already has a Bill object with charges.electricity > 0.
 *   This endpoint lets the UI show the full kWh breakdown using that billId
 *   without needing to know the periodId.
 *
 * Auth: verifyToken only (tenant-facing)
 */
export const getMyBillBreakdownByBillId = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const { billId } = req.params;

    // Validate the bill exists and belongs to this tenant
    const bill = await Bill.findById(billId).lean();
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (String(bill.userId) !== String(dbUser._id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Find the BillingResult that references this billId
    const result = await BillingResult.findOne({
      "tenantSummaries.billId": bill._id,
      isArchived: false,
    })
      .populate("roomId", "name roomNumber branch type")
      .populate("billingPeriodId", "startDate endDate")
      .lean();

    if (!result) {
      // Bill has no electricity breakdown (e.g. rent-only bill, or result was deleted)
      return res.status(404).json({ error: "No electricity breakdown found for this bill" });
    }

    // Find this tenant's summary within the result
    const mySummary = result.tenantSummaries.find(
      (t) => String(t.billId) === String(bill._id),
    );

    if (!mySummary) {
      return res.status(403).json({ error: "Access denied to this billing result" });
    }

    // Filter segments to only those where this tenant was active
    const mySegments = result.segments
      .filter((seg) =>
        seg.activeTenantIds.some((id) => String(id) === String(dbUser._id)),
      )
      .map((seg) => ({
        segmentIndex: seg.segmentIndex,
        periodLabel: seg.periodLabel,
        readingFrom: seg.readingFrom,
        readingTo: seg.readingTo,
        kwhConsumed: r2(seg.kwhConsumed),
        activeTenantCount: seg.activeTenantCount,
        sharePerTenantKwh: r2(seg.sharePerTenantKwh),
        sharePerTenantCost: r2(seg.sharePerTenantCost),
      }));

    res.json({
      room: getRoomLabel(result.roomId, "N/A"),
      branch: result.branch,
      ratePerKwh: result.ratePerKwh,
      period: {
        startDate: result.billingPeriodId?.startDate || null,
        endDate: result.billingPeriodId?.endDate || null,
      },
      myTotalKwh: r2(mySummary.totalKwh),
      myBillAmount: r2(mySummary.billAmount),
      verified: result.verified,
      segments: mySegments,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Get rooms for electricity billing
// ============================================================================

/**
 * GET /api/electricity/rooms
 * Get rooms with billing period status for admin dashboard.
 */
export const getRoomsForBilling = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isSuperAdmin && req.query.branch
      ? req.query.branch
      : admin.branch;

    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter)
      .select("name roomNumber branch type capacity")
      .sort({ name: 1 })
      .lean();

    const roomIds = rooms.map((r) => r._id);

    // Parallel: open periods, latest readings, checked-in reservations
    const [openPeriods, latestReadings, activeReservations, recentPeriods] = await Promise.all([
      BillingPeriod.find({ roomId: { $in: roomIds }, status: "open", isArchived: false }).lean(),
      MeterReading.aggregate([
        { $match: { roomId: { $in: roomIds }, isArchived: false } },
        { $sort: { date: -1 } },
        { $group: { _id: "$roomId", latestReading: { $first: "$reading" }, latestDate: { $first: "$date" } } },
      ]),
      Reservation.find({
        roomId: { $in: roomIds },
        status: "checked-in",
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName")
        .select("roomId userId")
        .lean(),
      BillingPeriod.find({
        roomId: { $in: roomIds },
        status: { $ne: "open" },
        isArchived: false,
      })
        .sort({ startDate: -1, createdAt: -1 })
        .lean(),
    ]);

    const openPeriodMap = new Map(openPeriods.map((p) => [String(p.roomId), p]));
    const readingMap = new Map(latestReadings.map((r) => [String(r._id), r]));
    const latestClosedPeriodByRoom = new Map();
    for (const period of recentPeriods) {
      const key = String(period.roomId);
      if (!latestClosedPeriodByRoom.has(key)) {
        latestClosedPeriodByRoom.set(key, period);
      }
    }
    const recentPeriodIds = [...latestClosedPeriodByRoom.values()].map((period) => period._id);
    const recentResults = recentPeriodIds.length
      ? await BillingResult.find({
          billingPeriodId: { $in: recentPeriodIds },
          isArchived: false,
        })
          .select("billingPeriodId tenantSummaries.billId")
          .lean()
      : [];
    const recentResultMap = new Map(recentResults.map((result) => [String(result.billingPeriodId), result]));
    const recentBillIds = recentResults.flatMap((result) =>
      (result.tenantSummaries || []).map((summary) => summary.billId).filter(Boolean),
    );
    const recentBills = recentBillIds.length
      ? await Bill.find({ _id: { $in: recentBillIds }, isArchived: false })
          .select("_id status sentAt")
          .lean()
      : [];
    const recentBillMap = new Map(recentBills.map((bill) => [String(bill._id), bill]));
    const diagnosticsByRoom = new Map(
      (
        await Promise.all(rooms.map((room) => getElectricityRoomDiagnostics(room._id)))
      )
        .filter(Boolean)
        .map((diag) => [String(diag.roomId), diag]),
    );

    // Build per-room tenant map with masked names
    const tenantsByRoom = new Map();
    for (const res of activeReservations) {
      const key = String(res.roomId);
      if (!tenantsByRoom.has(key)) tenantsByRoom.set(key, []);
      const u = res.userId;
      if (u) {
        const first = u.firstName || "Tenant";
        const last = u.lastName || "";
        // Mask: show first name + masked last name (e.g. "Maria ****")
        const maskedLast = last ? "*".repeat(Math.max(last.length, 4)) : "****";
        tenantsByRoom.get(key).push(`${first} ${maskedLast}`);
      }
    }

    res.json({
      rooms: rooms.map((room) => {
        const key = String(room._id);
        const period = openPeriodMap.get(key);
        const recentPeriod = latestClosedPeriodByRoom.get(key) || null;
        const latest = readingMap.get(key);
        const tenants = tenantsByRoom.get(key) || [];
        const diag = diagnosticsByRoom.get(key);
        const recentResult = recentPeriod ? recentResultMap.get(String(recentPeriod._id)) : null;
        const recentPeriodBills = (recentResult?.tenantSummaries || [])
          .map((summary) => summary.billId)
          .filter(Boolean)
          .map((billId) => recentBillMap.get(String(billId)))
          .filter(Boolean);
        const latestPeriodDisplayStatus = period
          ? "open"
          : recentPeriod
            ? (
                recentPeriodBills.some((bill) => bill.status === "draft")
                  ? "ready"
                  : recentPeriod.revised
                    ? "revised"
                    : "closed"
              )
            : null;
        return {
          id: room._id,
          name: room.name,
          roomNumber: room.roomNumber,
          branch: room.branch,
          type: room.type,
          capacity: room.capacity,
          hasOpenPeriod: !!period,
          openPeriodId: period?._id || null,
          latestPeriodId: recentPeriod?._id || null,
          latestPeriodDisplayStatus,
          ratePerKwh: period?.ratePerKwh || null,
          latestReading: latest?.latestReading || null,
          latestReadingDate: latest?.latestDate || null,
          hasActiveTenants: tenants.length > 0,
          activeTenantCount: tenants.length,
          maskedTenants: tenants,
          requiresRepair: !!diag?.issues?.length,
          orphanReadingCount: diag?.orphanReadingIds?.length || 0,
          targetCloseDate: period ? getUtilityTargetCloseDate(period.startDate) : null,
          repairIssueCodes: diag?.issueCodes || [],
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// HELPER: Build tenant events from meter readings
// ============================================================================

/**
 * Build tenant events array from meter readings and reservations.
 * Each tenant event tracks their moveInReading and optional moveOutReading.
 */
async function buildTenantEventsFromReadings(roomId, readings, periodStartReading, periodStartDate = null) {
  // Get all tenants who had checked-in reservations for this room
  const reservations = await Reservation.find({
    roomId,
    status: { $in: ["checked-in", "checked-out"] },
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName")
    .lean();

  const tenantMap = new Map();

  // First: register all tenants from reservations as having moved in
  // at or before the period start only when the reservation already predates
  // the anchored period boundary. Otherwise the room requires a move-in reading.
  for (const res of reservations) {
    if (!res.userId) continue;
    const key = String(res.userId._id);
    if (!tenantMap.has(key)) {
      const assumedPrePeriodOccupancy =
        periodStartDate &&
        res.checkInDate &&
        new Date(res.checkInDate) <= new Date(periodStartDate);

      tenantMap.set(key, {
        tenantId: key,
        reservationId: res._id,
        tenantName:
          `${res.userId.firstName || ""} ${res.userId.lastName || ""}`.trim() ||
          "Tenant",
        moveInReading: assumedPrePeriodOccupancy ? periodStartReading : null,
        moveOutReading: null,
        requiresRepair: !assumedPrePeriodOccupancy,
      });
    }
  }

  // Then: override with actual meter reading events
  for (const reading of readings) {
    if (!reading.tenantId) continue;
    const key = String(reading.tenantId);

    if (reading.eventType === "move-in") {
      if (!tenantMap.has(key)) {
        // New tenant ΓÇö find their name
        const user = await User.findById(reading.tenantId)
          .select("firstName lastName")
          .lean();
        tenantMap.set(key, {
          tenantId: key,
          tenantName: user
            ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
            : "Tenant",
          moveInReading: reading.reading,
          moveOutReading: null,
          requiresRepair: false,
        });
      } else {
        tenantMap.get(key).moveInReading = reading.reading;
        tenantMap.get(key).requiresRepair = false;
      }
    }

    if (reading.eventType === "move-out") {
      if (tenantMap.has(key)) {
        tenantMap.get(key).moveOutReading = reading.reading;
      }
    }
  }

  // Fallback: tenants who checked in DURING the period (not before it) and
  // have no explicit move-in reading are anchored to the period start reading
  // rather than hard-blocking the close. Their occupancy is confirmed by the
  // reservation record; the missing reading is an operational gap, not a
  // data-integrity issue that should prevent billing.
  if (periodStartReading !== null && periodStartReading !== undefined) {
    for (const [, entry] of tenantMap) {
      if (entry.requiresRepair && entry.moveInReading === null) {
        entry.moveInReading = periodStartReading;
        entry.requiresRepair = false;
      }
    }
  }

  return Array.from(tenantMap.values()).filter(
    (entry) => entry.moveInReading !== null || entry.requiresRepair,
  );
}

// ============================================================================
// DELETE: Meter Reading
// ============================================================================

/**
 * DELETE /api/electricity/readings/:id
 * Soft-delete a meter reading by archiving it.
 * Admins are allowed to delete readings that belong to closed periods,
 * but they must click 'Re-run' on the period to recalculate the bills.
 */
export const deleteMeterReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;

    const reading = await MeterReading.findById(id);
    if (!reading) return res.status(404).json({ error: "Meter reading not found" });
    if (!admin.isSuperAdmin && reading.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deletedReading = reading.toObject();
    await MeterReading.findByIdAndDelete(id);

    await logBillingAudit(req, {
      admin,
      action: "meter_reading_deleted",
      severity: "high",
      entityId: deletedReading._id,
      branch: deletedReading.branch,
      details: `Deleted ${deletedReading.eventType} reading for room ${deletedReading.roomId}`,
      metadata: {
        roomId: deletedReading.roomId,
        billingPeriodId: deletedReading.billingPeriodId || null,
        eventType: deletedReading.eventType,
        reading: deletedReading.reading,
        date: deletedReading.date,
      },
    });

    res.json({ success: true, message: "Meter reading deleted." });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DRAFT BILLING ENDPOINTS
// ============================================================================

/**
 * GET /api/electricity/periods/:periodId/draft-bills
 * Get all draft bills for a closed billing period.
 */
export const getDraftBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { periodId } = req.params;

    const result = await BillingResult.findOne({
      billingPeriodId: periodId,
      isArchived: false,
    }).lean();

    if (!result) {
      return res.status(404).json({ error: "No billing result found for this period" });
    }
    if (!admin.isSuperAdmin && result.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const billIds = result.tenantSummaries
      .map((t) => t.billId)
      .filter(Boolean);

    const bills = billIds.length > 0
      ? await Bill.find({
          _id: { $in: billIds },
          status: "draft",
          isArchived: false,
        })
          .populate("userId", "firstName lastName email")
          .lean()
      : [];

    res.json({
      bills: bills.map((b) => ({
        billId: b._id,
        tenantId: b.userId?._id,
        tenantName: b.userId
          ? `${b.userId.firstName || ""} ${b.userId.lastName || ""}`.trim()
          : "Unknown",
        charges: b.charges,
        totalAmount: b.totalAmount,
        dueDate: b.dueDate,
        notes: b.notes,
        isManuallyAdjusted: b.isManuallyAdjusted,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/electricity/periods/:periodId/send-bills
 * Send all draft bills for a period ΓÇö flips to pending and emails tenants.
 */
export const sendBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { periodId } = req.params;

    const period = await BillingPeriod.findById(periodId);
    if (!period) return res.status(404).json({ error: "Billing period not found" });
    if (!admin.isSuperAdmin && period.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (period.status === "open") {
      return res.status(400).json({ error: "Cannot send bills for an open period" });
    }

    const result = await BillingResult.findOne({
      billingPeriodId: period._id,
      isArchived: false,
    }).lean();

    if (!result) {
      return res.status(404).json({ error: "No billing result found" });
    }

    const billIds = result.tenantSummaries.map((t) => t.billId).filter(Boolean);
    if (billIds.length === 0) {
      return res.json({ success: true, sent: 0, skipped: 0, message: "No draft bills to send" });
    }

    let draftBills = await getDraftBillsForSummaryBillIds(result.tenantSummaries);

    if (draftBills.length === 0) {
      return res.json({ success: true, sent: 0, skipped: 0, message: "No draft bills to send" });
    }

    const room = await Room.findById(period.roomId).lean();
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomDiagnostics = await getElectricityRoomDiagnostics(room._id);
    if (roomDiagnostics?.issueCodes?.includes("electricity_missing_movein_anchor")) {
      return res.status(409).json({
        error: `Repair missing move-in anchor readings for room ${getRoomLabel(room)} before sending bills.`,
        diagnostics: formatElectricityRoomDiagnostics(roomDiagnostics),
      });
    }

    if (isWaterBillableRoomType(room.type)) {
      const waterRecord = await getFinalizedWaterRecordForPeriod(
        room._id,
        period.startDate,
        period.endDate,
      );
      if (!waterRecord) {
        return res.status(400).json({
          error: `Finalize the water billing for room ${getRoomLabel(room)} before sending bills.`,
        });
      }
    }

    const { sent } = await sendDraftUtilityBills({
      bills: draftBills,
      period,
      result,
    });

    for (const bill of draftBills) {

      // ΓöÇΓöÇ PDF Generation (non-fatal) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      // Generate a PDF billing statement for this tenant.
      // If PDF generation fails for any reason, we log it and continue ΓÇö
      // the bill has already been sent and the email will still go out.
      // Admin can regenerate via POST /api/electricity/bills/:billId/regenerate-pdf
      try {
        const tenant = await User.findById(bill.userId).lean();
        if (tenant) {
          const pdfFilePath = await generateBillPdf({
            bill: bill.toObject ? bill.toObject() : bill,
            billingResult: result,
            period: period.toObject ? period.toObject() : period,
            room,
            tenant,
          });
          bill.pdfPath = pdfFilePath;
          bill.pdfGeneratedAt = new Date();
          await bill.save();
          logger.info({ billId: bill._id, pdfPath: pdfFilePath }, "PDF bill generated");
        }
      } catch (pdfErr) {
        logger.warn(
          { err: pdfErr, billId: bill._id },
          "PDF generation failed (non-fatal) ΓÇö bill sent without PDF",
        );
      }

      // ΓöÇΓöÇ Email notification ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      try {
        const tenant = await User.findById(bill.userId).lean();
        if (tenant?.email) {
          const summary = result.tenantSummaries.find(
            (t) => String(t.tenantId) === String(bill.userId),
          );
          await sendBillGeneratedEmail({
            to: tenant.email,
            tenantName: summary?.tenantName || `${tenant.firstName} ${tenant.lastName}`,
            billingMonth: dayjs(period.startDate).format("MMMM YYYY"),
            totalAmount: bill.totalAmount,
            dueDate: dayjs(bill.dueDate).format("MMMM D, YYYY"),
            branchName: period.branch || "Lilycrest",
          });
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr }, "Bill notification email failed (non-blocking)");
      }
    }

    await logBillingAudit(req, {
      admin,
      action: "bills_sent_to_tenants",
      severity: "info",
      entityId: period._id,
      branch: period.branch,
      details: `Sent ${sent} utility bill(s) for room ${getRoomLabel(room)}`,
      metadata: {
        roomId: room._id,
        periodId: period._id,
        sent,
        skipped: billIds.length - sent,
      },
    });

    res.json({
      success: true,
      sent,
      skipped: billIds.length - sent,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/electricity/bills/:billId/adjust
 * Admin adjusts charges on a draft bill. Recomputes totalAmount.
 */
export const adjustDraftBill = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { billId } = req.params;
    const { charges, notes, dueDate } = req.body;

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (bill.status !== "draft") {
      return res.status(400).json({ error: "Only draft bills can be adjusted" });
    }

    // Merge provided charge fields
    if (charges) {
      const chargeFields = ["electricity", "water", "rent", "applianceFees", "corkageFees", "penalty", "discount"];
      for (const field of chargeFields) {
        if (charges[field] !== undefined) {
          bill.charges[field] = r2(Number(charges[field]));
        }
      }
    }

    if (notes !== undefined) bill.notes = notes;
    if (dueDate) bill.dueDate = new Date(dueDate);
    bill.isManuallyAdjusted = true;
    syncBillAmounts(bill, { preserveStatus: true });

    await bill.save();

    await logBillingAudit(req, {
      admin,
      action: "draft_bill_adjusted",
      severity: "high",
      entityId: bill._id,
      branch: bill.branch,
      details: `Adjusted draft bill ${bill._id}`,
      metadata: {
        charges: bill.charges,
        dueDate: bill.dueDate,
        notes: bill.notes || "",
      },
    });

    res.json({
      success: true,
      bill: {
        billId: bill._id,
        charges: bill.charges,
        totalAmount: bill.totalAmount,
        dueDate: bill.dueDate,
        notes: bill.notes,
        isManuallyAdjusted: bill.isManuallyAdjusted,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DELETE: Billing Period
// ============================================================================

/**
 * DELETE /api/electricity/periods/:id
 * Hard-delete a billing period and cascade-delete its linked readings & results.
 */
export const deleteBillingPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;

    const period = await BillingPeriod.findById(id);
    if (!period) return res.status(404).json({ error: "Billing period not found" });
    if (!admin.isSuperAdmin && period.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deletedPeriod = period.toObject();

    // Find associated results to delete linked bills
    const results = await BillingResult.find({ billingPeriodId: period._id });
    for (const result of results) {
       for (const ts of result.tenantSummaries) {
          if (ts.billId) {
            await Bill.findByIdAndDelete(ts.billId);
          }
       }
    }

    // Hard delete the period
    await BillingPeriod.findByIdAndDelete(id);

    // Hard delete all readings linked to this period
    await MeterReading.deleteMany({ billingPeriodId: period._id });

    // Hard delete any generated billing results linked to this period
    await BillingResult.deleteMany({ billingPeriodId: period._id });

    await logBillingAudit(req, {
      admin,
      action: "billing_period_deleted",
      severity: "critical",
      entityId: deletedPeriod._id,
      branch: deletedPeriod.branch,
      details: `Deleted billing period ${deletedPeriod._id}`,
      metadata: {
        roomId: deletedPeriod.roomId,
        startDate: deletedPeriod.startDate,
        endDate: deletedPeriod.endDate,
        status: deletedPeriod.status,
      },
    });

    res.json({ success: true, message: "Billing period deleted." });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PDF DOWNLOAD
// ============================================================================

/**
 * GET /api/electricity/bills/:billId/pdf
 *
 * Streams the stored PDF file for a bill.
 * Access: tenant (own bills only) OR any admin.
 */
export const downloadBillPdf = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bill = await Bill.findById(req.params.billId).lean();
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    // Access control: owner or admin
    const isOwner = String(bill.userId) === String(dbUser._id);
    const isAdmin = dbUser.role === "branch_admin" || dbUser.role === "owner";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Branch guard for admins
    if (isAdmin && !isOwner && dbUser.role !== "owner" && bill.branch !== dbUser.branch) {
      return res.status(403).json({ error: "Access denied to another branch's bill" });
    }

    // Tenant can only download after bill is sent (not draft)
    if (isOwner && !isAdmin && bill.status === "draft") {
      return res.status(403).json({ error: "Bill is not yet available" });
    }

    if (!bill.pdfPath) {
      return res.status(404).json({ error: "PDF not yet generated for this bill" });
    }

    const absolutePath = path.resolve(path.join(__dirname, "..", bill.pdfPath));

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "PDF file not found on server" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="lilycrest-bill-${String(bill._id).slice(-8)}.pdf"`,
    );
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PDF REGENERATION (Admin)
// ============================================================================

/**
 * POST /api/electricity/bills/:billId/regenerate-pdf
 *
 * Admin-only endpoint to regenerate a PDF bill.
 * Use when PDF was not generated at send time (generation failed),
 * or after a manual charge adjustment.
 */
export const regenerateBillPdf = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);

    const bill = await Bill.findById(req.params.billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Find the BillingResult that references this bill
    const billingResult = await BillingResult.findOne({
      "tenantSummaries.billId": bill._id,
      isArchived: false,
    }).lean();

    if (!billingResult) {
      return res.status(404).json({
        error: "No billing result found for this bill ΓÇö cannot generate PDF",
      });
    }

    const period = await BillingPeriod.findById(billingResult.billingPeriodId).lean();
    const room   = await Room.findById(bill.roomId).lean();
    const tenant = await User.findById(bill.userId).lean();

    if (!period || !room || !tenant) {
      return res.status(404).json({ error: "Missing data to regenerate PDF (period, room, or tenant not found)" });
    }

    const pdfFilePath = await generateBillPdf({
      bill: bill.toObject(),
      billingResult,
      period,
      room,
      tenant,
    });

    bill.pdfPath = pdfFilePath;
    bill.pdfGeneratedAt = new Date();
    await bill.save();

    logger.info({ billId: bill._id, pdfPath: pdfFilePath, adminId: admin._id }, "PDF bill regenerated by admin");

    res.json({
      success: true,
      billId: bill._id,
      pdfPath: pdfFilePath,
      pdfGeneratedAt: bill.pdfGeneratedAt,
    });
  } catch (error) {
    next(error);
  }
};

