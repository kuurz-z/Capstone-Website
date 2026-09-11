import { parseUtilityCycleDate, resolveUtilityOpening, assertUtilityCycleRange, assertUtilityOpeningChange, applyUtilityOpening } from '../services/billing/monthlyUtilitySchedule.js';
import { calculateCanonicalWaterPeriod } from '../services/billing/canonicalWaterCalculation.js';
import { assertWaterChronology } from '../services/billing/waterChronology.js';
import { assertElectricityChronology } from '../services/billing/electricityChronology.js';
import { refreshWaterAggregate, waterPeriodSent } from '../services/billing/waterAllocations.js';
import { assertUtilityHistoryMutable } from '../services/billing/utilityHistorySafety.js';
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
import mongoose from "mongoose";
import {
  Room,
  Reservation,
  User,
  UtilityPeriod,
  UtilityReading,
  UtilityFinalization,
  Bill,
  BedHistory,
} from "../models/index.js";
import { computeBilling } from "../utils/billingEngine.js";
import { logBillingAudit } from "../utils/billingAudit.js";
import { getRoomLabel } from "../utils/roomLabel.js";
import {
  sendUtilityPeriodBills,
  upsertDraftBillsForUtility,
} from "../utils/utilityBillFlow.js";
import {
  deriveUtilityPeriodBillingState,
  getUtilityDiagnostics,
} from "../utils/utilityDiagnostics.js";
import { buildElectricityReview } from "../utils/electricityReviewRules.js";
import {
  buildBillingIntelligenceSnapshot,
  generateBillingIntelligence,
} from "../services/billingIntelligenceService.js";
import {
  resolveReferencedUser,
  UNKNOWN_TENANT_LABEL,
} from "../utils/userReference.js";

import {
  buildTenantEventsForPeriod,
  filterBillableReservationsForPeriod,
  findBedOccupancyOverlaps,
  findMissingElectricityLifecycleReadings,
  isWaterBillableRoom,
  readRoomScopedMoveInDate,
  readRoomScopedMoveOutDate,
} from "../utils/utilityFlowRules.js";
import {
  getUtilityDispatchEntry,
  syncBillAmounts,
} from "../utils/billingPolicy.js";
import {
  buildMoveInBeforeQuery,
  buildMoveOutAfterOrMissingQuery,
  BILLABLE_RESERVATION_STATUS_QUERY,
  hasReservationStatus,
  isUtilityEventType,
  normalizeReservationPayload,
  normalizeUtilityEventType,
  readMoveInDate,
  readMoveOutDate,
  reservationStatusesForQuery,
  serializeUtilityPeriod,
  serializeUtilityReading,
  utilityEventTypesForQuery,
} from "../utils/lifecycleNaming.js";
import logger from "../middleware/logger.js";
import { resolveAdminAccessContext } from "../utils/adminAccess.js";
import { branchSupportsSeparateUtilityBilling } from "../config/branches.js";
import {
  assertUtilityClosingDate,
  assertUtilityPeriodSendable,
  assertUtilityReadingDate,
  assertUtilityStartDate,
} from "../utils/utilityDateIntegrity.js";
import { resolveRoomScopedReservationsForUtilityPeriod } from "../services/billing/roomScopedUtilityParticipants.js";
import {
  createOpenUtilityPeriodWithBoundary,
  resolveUtilityPeriodState,
  UTILITY_PERIOD_START_MODE,
  UTILITY_PERIOD_STATE,
} from "../services/billing/utilityPeriodLifecycleService.js";
import {
  assertPhysicalMeterContinuity,
  parsePhysicalMeterReading,
} from "../utils/physicalMeterReading.js";
import { toManilaStartOfDay } from "../utils/dateUtils.js";
import { resolveHistoricalUtilityGap } from "../services/billing/utilityHistoricalGapService.js";
import {
  assertUtilityLifecycleActiveIndexReady,
  resolveCurrentUtilityRate,
  resolveRoomUtilityBoundaryContext,
} from "../services/billing/roomUtilityBoundaryService.js";

const getAdminInfo = resolveAdminAccessContext;

const UTILITY_EXPORT_TYPES = new Set(["electricity", "water"]);

async function logCommittedUtilityClose({ requestContext, admin, utilityType, result }) {
  try {
    const period = await UtilityPeriod.findById(result?.periodId).lean();
    const room = period ? await Room.findById(period.roomId).lean() : null;
    await logBillingAudit(requestContext || {}, {
      admin,
      action: "utility_period_closed",
      severity: "high",
      entityId: period?._id || result?.periodId,
      branch: period?.branch,
      details: `Closed ${utilityType} period for room ${getRoomLabel(room || {})}. Math: ${result?.computationResult?.strategy || "canonical"}`,
      metadata: {
        utilityType,
        roomId: period?.roomId || null,
        tenantCount: result?.computationResult?.tenantSummaries?.length || 0,
        computedCost: result?.computationResult?.computedTotalCost || 0,
      },
    });
  } catch (error) {
    logger.warn({ err: error, periodId: result?.periodId }, "Utility period closed but post-commit audit logging failed");
  }
}

const formatExportDate = (value) =>
  value ? dayjs(value).format("YYYY-MM-DD") : "";

const buildUtilityExportRow = ({ utilityType, period, summary }) => {
  const measured = utilityType === "electricity" || period.calculationVersion === "water-meter-v1";
  const room = period.roomId || {};
  const charge =
    summary.billAmount ??
    summary.waterCharge ??
    summary.electricityCharge ??
    summary.amount ??
    summary.totalCost ??
    period.computedTotalCost ??
    0;

  return {
    utilityType,
    calculationVersion:period.calculationVersion || "legacy",
    unit:utilityType === "electricity" ? "kWh" : measured ? "m3" : "unknown",
    branch: room.branch || period.branch || "",
    roomId: String(room._id || period.roomId || ""),
    roomName: getRoomLabel(room) || room.name || room.roomNumber || "",
    periodId: String(period._id || ""),
    periodStatus: period.status || "",
    startDate: formatExportDate(period.startDate),
    endDate: formatExportDate(period.endDate),
    startReading: measured ? period.startReading ?? "" : "",
    endReading: measured ? period.endReading ?? "" : "",
    totalUsage: measured ? period.computedTotalUsage ?? "" : "",
    ratePerUnit: measured ? period.ratePerUnit ?? "" : "",
    totalRoomCost: period.computedTotalCost ?? "",
    tenantId: summary.tenantId ? String(summary.tenantId) : "",
    tenantName: summary.tenantName || "",
    tenantEmail: summary.tenantEmail || "",
    reservationId: summary.reservationId ? String(summary.reservationId) : "",
    bedId: summary.bedId || "",
    bedName: summary.bedName || summary.bedLabel || "",
    durationRange: summary.durationRange || "",
    usage: measured ? summary.totalUsage ?? summary.usage ?? summary.consumption ?? period.computedTotalUsage ?? "" : "",
    legacyBasis: measured ? "" : summary.billingBasis || "historical allocation",
    amount: charge,
    billId: summary.billId ? String(summary.billId) : "",
  };
};

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

function normalizeBillingComputationError(error) {
  if (!error) return error;

  const message = String(error.message || "");
  if (
    message.includes("Invalid reading sequence:") ||
    message.includes("has consumption but no active tenants") ||
    message.includes(
      "Cannot compute segmented billing without at least two ordered meter events",
    )
  ) {
    error.statusCode = error.statusCode || 400;
  }

  return error;
}

async function syncElectricityBoundaryReadings({
  period,
  room,
  adminId,
  shouldPersistEndReading = false,
}) {
  const startDate = dayjs(period.startDate).startOf("day").toDate();

  let startBoundaryReading = await UtilityReading.findOne({
    utilityPeriodId: period._id,
    utilityType: "electricity",
    eventType: "periodStart",
    isArchived: false,
    readingStatus:{$nin:['voided','corrected']},supersededByReadingId:null,
  });

  if (!startBoundaryReading) {
    startBoundaryReading = new UtilityReading({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      eventType: "periodStart",
      readingStatus: "locked",
      recordedBy: adminId,
      utilityPeriodId: period._id,
      activeTenantIds: [],
    });
  }

  // Validate both proposed boundaries before persisting either one.
  const oldEnd = await UtilityReading.findOne({utilityPeriodId:period._id,utilityType:'electricity',eventType:'periodEnd',isArchived:false,readingStatus:{$nin:['voided','corrected']},supersededByReadingId:null});
  const excludeIds=[startBoundaryReading._id,oldEnd?._id].filter(Boolean);
  await assertElectricityChronology({roomId:room._id,date:startDate,reading:period.startReading,eventType:'periodStart',excludeIds});
  if (shouldPersistEndReading && period.endDate && period.endReading != null) await assertElectricityChronology({roomId:room._id,date:dayjs(period.endDate).startOf('day').toDate(),reading:period.endReading,eventType:'periodEnd',excludeIds});
  startBoundaryReading.roomId = room._id;
  startBoundaryReading.branch = room.branch;
  startBoundaryReading.reading = Number(period.startReading);
  startBoundaryReading.date = startDate;
  if (!startBoundaryReading.recordedBy) {
    startBoundaryReading.recordedBy = adminId;
  }
  await startBoundaryReading.save();

  let endBoundaryReading = await UtilityReading.findOne({
    utilityPeriodId: period._id,
    utilityType: "electricity",
    eventType: "periodEnd",
    isArchived: false,
    readingStatus:{$nin:['voided','corrected']},supersededByReadingId:null,
  });

  const hasEndBoundary =
    shouldPersistEndReading &&
    period.endDate &&
    period.endReading !== undefined &&
    period.endReading !== null;

  if (!hasEndBoundary) {
    if (endBoundaryReading) {
      endBoundaryReading.isArchived = true;
      await endBoundaryReading.save();
    }
    return;
  }

  if (!endBoundaryReading) {
    endBoundaryReading = new UtilityReading({
      utilityType: "electricity",
      roomId: room._id,
      branch: room.branch,
      eventType: "periodEnd",
      readingStatus: "locked",
      recordedBy: adminId,
      utilityPeriodId: period._id,
      activeTenantIds: [],
    });
  }

  endBoundaryReading.roomId = room._id;
  endBoundaryReading.branch = room.branch;
  endBoundaryReading.reading = Number(period.endReading);
  endBoundaryReading.date = dayjs(period.endDate).startOf("day").toDate();
  if (!endBoundaryReading.recordedBy) {
    endBoundaryReading.recordedBy = adminId;
  }
  await endBoundaryReading.save();
}

function getUtilitySummaryBillIds(period) {
  return (period?.tenantSummaries || [])
    .map((summary) => summary.billId)
    .filter(Boolean);
}

async function assertUtilityPeriodNotSent(period, utilityType) {
  const billIds = getUtilitySummaryBillIds(period);
  if (billIds.length === 0) return;

  const linkedBills = await Bill.find({ _id: { $in: billIds } }).select(
    "charges utilityDispatch waterAllocations status paidAmount releasedAt sentAt issuedAt dueDate",
  );
  assertUtilityHistoryMutable(linkedBills, utilityType);
  const alreadySent = linkedBills.some(
    (bill) => getUtilityDispatchEntry(bill, utilityType).state === "sent",
  );

  if (!alreadySent) return;

  const error = new Error(
    `Cannot modify this ${utilityType} period because it has already been sent to tenants.`,
  );
  error.statusCode = 409;
  throw error;
}

// ============================================================================
// ROOM-SCOPED OCCUPANT RESOLUTION (Phase 4 — electricity/water follow the
// tenant's ACTUAL room, across room transfers)
// ============================================================================
//
// The utility close/recompute historically resolved a room's billable
// occupants purely from the denormalized `Reservation.roomId` +
// `moveInDate`/`moveOutDate`. A ROOM TRANSFER mutates `Reservation.roomId` to
// the destination and (correctly) leaves the global `moveOutDate` null — it
// is not a dorm move-out. Result: for a period spanning the transfer date,
// the source room DROPS the transferred tenant entirely (their valid
// pre-transfer days go unbilled and the rest of the room is over-charged),
// and the destination room would count them from the period start reading
// (billing them for consumption before they arrived).
//
// BedHistory is the canonical per-(room, reservation) occupancy record and is
// written atomically inside the transfer transaction:
//   - old room: the active row is closed -> status:"transferred",
//     effectiveEndDate/moveOutDate = transfer date
//   - new room: a fresh status:"active" row, moveInDate = transfer date
//
// This helper returns every reservation that occupied `room` at any point in
// the period — including one that has since transferred AWAY (found via its
// "transferred" BedHistory row, not the roomId filter) — and stamps each with
// the matching BedHistory boundaries as `_roomScopedMoveInDate` /
// `_roomScopedMoveOutDate`. A reservation with no BedHistory row for the room
// (e.g. a private-room move-in, which does not create one today) is returned
// unstamped and the pure helpers fall back to the global reservation dates —
// so non-transfer billing is byte-for-byte unchanged.
export async function resolveRoomScopedReservationsForPeriod({
  room,
  periodStart,
  periodEnd,
  utilityType = null,
  calculationVersion = null,
  session = null,
}) {
  return resolveRoomScopedReservationsForUtilityPeriod({
    room,
    periodStart,
    periodEnd,
    utilityType,
    calculationVersion,
    session,
  });
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
  session = null,
  deferAudit = false,
  openNextPeriod = "when_occupied",
}) {
  const meterWater = utilityType === 'water' && period.calculationVersion === 'water-meter-v1';
  const metered = utilityType === 'electricity' || meterWater;
  const normalizedClosingDay = toManilaStartOfDay(endDate || new Date());
  const closingDate = normalizedClosingDay?.toDate();
  if (!closingDate) {
    throw Object.assign(new Error("A valid closing date is required."), {
      statusCode: 400,
      code: "INVALID_UTILITY_CLOSING_DATE",
    });
  }

  assertUtilityClosingDate(period.startDate, closingDate);
  await assertUtilityCycleRange({roomId:room._id,utilityType,startDate:period.startDate,endDate:closingDate,periodId:period._id,session});

  if (metered) {
    if (utilityType === 'electricity') await assertElectricityChronology({roomId:room._id,date:closingDate,reading:endReading,eventType:'periodEnd',session});
    if (meterWater) {
      await Room.updateOne({_id:room._id},{$inc:{waterObservationRevision:1}},{session});
      await assertWaterChronology({roomId:room._id,date:closingDate,reading:endReading,session});
    }
    assertBoundaryReadings({ startReading: period.startReading, endReading });
    if (meterWater) {
    let latestReadingQuery = UtilityReading.findOne({
      roomId: room._id,
      utilityType,
      isArchived: false,
      readingStatus:{$nin:["voided","corrected"]},
      date: { $lte: closingDate },
    }).sort({ date: -1, createdAt: -1 });
    if (session) latestReadingQuery = latestReadingQuery.session(session);
    const latestReading = await latestReadingQuery.lean();
    assertPhysicalMeterContinuity({
      reading: endReading,
      previousReading: latestReading?.reading ?? period.startReading,
      eventType: "periodEnd",
      fieldLabel: "Final meter reading",
    });
    }
  }

  assertUtilityRoomEligibility(room, utilityType);

  if (metered) {
    const endUtilityReading = new UtilityReading({
      utilityType,
      roomId: room._id,
      branch: room.branch,
      reading: Number(endReading),
      date: closingDate,
      eventType: "periodEnd",
      readingStatus: "locked",
      recordedBy: admin._id,
      utilityPeriodId: period._id,
      activeTenantIds: [],
    });
    await endUtilityReading.save(session ? { session } : undefined);
  }

  // Preserve an EXACT_OBSERVATION boundary when a recovered period is later
  // closed. Widening it back to midnight would pull unknown pre-baseline
  // readings into the canonical cycle.
  const cycleStart = new Date(period.startDate);
  const allReadings =
    utilityType === "electricity"
      ? await (() => {
          let query = UtilityReading.find({
          roomId: room._id,
          utilityType,
          isArchived: false,
          readingStatus: {$nin:['voided','corrected']},
          date: {
            $gte: cycleStart,
            $lte: closingDate,
          },
          $or: [{ utilityPeriodId: period._id }, { utilityPeriodId: null }],
          }).sort({ date: 1, createdAt: 1 });
          if (session) query = query.session(session);
          return query.lean();
        })()
      : [];

  const reservations = meterWater ? [] : await resolveRoomScopedReservationsForPeriod({
    room,
    periodStart: period.startDate,
    periodEnd: closingDate,
    utilityType,
    calculationVersion: period.calculationVersion,
    session,
  });

  const cyclePeriod = {
    calculationVersion:period.calculationVersion,
    pricingSnapshot:period.pricingSnapshot,
    startDate: period.startDate,
    endDate: closingDate,
    startReading: metered ? period.startReading : 0,
    endReading:
      metered
        ? Number(endReading)
        : Number(period.endReading || period.startReading || 0),
    ratePerUnit: period.ratePerUnit,
  };

  const billableReservations = meterWater ? reservations : filterBillableReservationsForPeriod({
    reservations,
    cycleStart: period.startDate,
    cycleEnd: closingDate,
  });

  const occupancyOverlapResult = findBedOccupancyOverlaps({
    reservations: billableReservations,
    cycleStart: period.startDate,
    cycleEnd: closingDate,
  });
  if (!meterWater && occupancyOverlapResult.hasOverlaps) {
    throw buildOccupancyOverlapError(occupancyOverlapResult);
  }

  let cycleReadings = meterWater ? allReadings : [];
  let mappedTenantEvents = [];
  if (utilityType === "electricity") {
    // Build a set of tenant IDs who actually moved in or out DURING this cycle.
    // Tenants who were already present before the cycle should not create segments.
    const cycleStartDay = dayjs(period.startDate).startOf("day");
    const cycleEndDay = dayjs(closingDate).startOf("day");
    const inCycleMoveTenantIds = new Set();
    for (const res of billableReservations) {
      const tenantKey = String(res.userId?._id || res.userId);
      // Room-scoped: for a tenant who transferred into/out of THIS room the
      // relevant move date is the transfer boundary (BedHistory), not the
      // whole-tenancy move-in/move-out — so their transfer-day reading is
      // correctly recognised as an in-cycle move and kept below.
      const checkIn = readRoomScopedMoveInDate(res)
        ? dayjs(readRoomScopedMoveInDate(res)).startOf("day")
        : null;
      const checkOut = readRoomScopedMoveOutDate(res)
        ? dayjs(readRoomScopedMoveOutDate(res)).startOf("day")
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

    // Keep canonical meter boundaries, including both-sided meter-reset events,
    // and only tenant boundaries for occupants who actually moved this cycle.
    cycleReadings = allReadings.filter((r) => {
      if (
        isUtilityEventType(r.eventType, "regularBilling") ||
        isUtilityEventType(r.eventType, "periodStart") ||
        isUtilityEventType(r.eventType, "periodEnd") ||
        isUtilityEventType(r.eventType, "meterReplacement") ||
        isUtilityEventType(r.eventType, "meterRollover")
      ) {
        return true;
      }
      if (
        (isUtilityEventType(r.eventType, "moveIn") ||
          isUtilityEventType(r.eventType, "moveOut")) &&
        r.tenantId
      ) {
        return inCycleMoveTenantIds.has(String(r.tenantId));
      }
      return false;
    });

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

  let computationResult;
  try {
    computationResult = meterWater ? await calculateCanonicalWaterPeriod({room,period:cyclePeriod,endDate:closingDate,endReading:Number(endReading),session}) : computeBilling({
      utilityPeriod: cyclePeriod,
      readings: cycleReadings,
      reservations: billableReservations,
      tenantEvents: mappedTenantEvents,
      forceSegmented: utilityType === "electricity",
      utilityType,
      roomType: room.type,
    });
  } catch (error) {
    throw normalizeBillingComputationError(error);
  }

  period.endDate = closingDate;
  period.endReading =
    metered
      ? Number(endReading)
      : Number(period.endReading || period.startReading || 0);
  period.computedTotalUsage = computationResult.computedTotalUsage;
  period.computedTotalCost = computationResult.computedTotalCost;
  period.verified = computationResult.verified;
  period.segments = computationResult.segments;
  if (meterWater) {
    period.meterEvents = computationResult.meterEvents;
    period.calculationInputs = computationResult.calculationInputs;
    period.calculationFingerprint = computationResult.calculationFingerprint;
  }
  period.tenantSummaries = computationResult.tenantSummaries;
  const carriedVacancyOverhead = (period.overheadSegments || [])
    .filter((segment) => segment.reason === "VACANT_GAP_BEFORE_PERIOD")
    .map((segment) => segment.toObject?.() || segment);
  period.overheadSegments = [
    ...carriedVacancyOverhead,
    ...(computationResult.overheadSegments || []),
  ];

  period.tenantSummaries = await upsertDraftBillsForUtility({
    period: period.toObject(),
    room,
    tenantSummaries: period.tenantSummaries,
    utilityType,
    session,
  });

  // ── Transfer-finalization reconciliation invariant ──────────────────────
  // A room transfer settles the transferring tenant's source-room electricity
  // BEFORE cutover, on the transfer_settlement Bill (recorded as a
  // UtilityFinalization). That tenant still participated fully in the
  // canonical allocation above — their moveOut UtilityReading bounds their
  // segments — so:
  //
  //   Σ(normal draft-bill charges for this period)
  //     + Σ(UtilityFinalization.settledAmount for this period)
  //   ≈ period.computedTotalCost
  //
  // A variance beyond tolerance means the transfer-day estimate diverged from
  // the canonical close (e.g. a co-occupant change mid-period). The period
  // still closes for everyone else; flag it for admin review.
  try {
    let finalizationQuery = UtilityFinalization.find({
      utilityPeriodId: period._id,
      utilityType,
      isArchived: { $ne: true },
    });
    if (session) finalizationQuery = finalizationQuery.session(session);
    const finalized = await finalizationQuery.lean();
    if (finalized.length > 0) {
      const finalizedTotal = finalized.reduce(
        (sum, f) => sum + Number(f.settledAmount || 0),
        0,
      );
      const draftTotal = (period.tenantSummaries || [])
        .filter((s) => !s.settledOnTransfer)
        .reduce((sum, s) => sum + Number(s.billAmount || 0), 0);
      const overheadTotal = (computationResult.overheadSegments || []).reduce(
        (sum, segment) => sum + Number(segment.cost || 0),
        0,
      );
      const canonicalTotal = Number(computationResult.computedTotalCost || 0);
      const reconVariance =
        Math.round((draftTotal + finalizedTotal + overheadTotal - canonicalTotal) * 100) / 100;
      const flagged = Math.abs(reconVariance) > 1; // ₱1 tolerance
      period.transferFinalizationReconciliation = {
        finalizedTotal: Math.round(finalizedTotal * 100) / 100,
        draftBillTotal: Math.round(draftTotal * 100) / 100,
        canonicalTotal: Math.round(canonicalTotal * 100) / 100,
        variance: reconVariance,
        flagged,
        reconciledAt: new Date(),
      };
      if (flagged) {
        period.manualReviewReason = "transfer_utility_reconciliation_variance";
      }
    }
  } catch (reconErr) {
    // Non-fatal — the period close itself already succeeded for co-occupants.
    // eslint-disable-next-line no-console
    console.warn("[closePeriodAndGenerateDrafts] transfer reconciliation check failed:", reconErr?.message);
  }

  period.status = "closed";
  period.closedAt = new Date();
  period.closedBy = admin._id;
  await period.save(session ? { session } : undefined);

  const continuingOccupants = billableReservations.filter((reservation) => {
    const moveIn = readRoomScopedMoveInDate(reservation);
    const moveOut = readRoomScopedMoveOutDate(reservation);
    const startsByClose = moveIn && new Date(moveIn) <= closingDate;
    const remainsAfterClose = !moveOut || new Date(moveOut) > closingDate;
    return startsByClose && remainsAfterClose;
  });
  const shouldOpenNextPeriod =
    openNextPeriod === true ||
    (openNextPeriod === "when_occupied" && continuingOccupants.length > 0);
  let nextPeriod = null;
  if (shouldOpenNextPeriod) {
    await assertUtilityLifecycleActiveIndexReady();
    const nextRate = await resolveCurrentUtilityRate({ utilityType });
    nextPeriod = await createOpenUtilityPeriodWithBoundary({
      utilityType,
      room,
      startDate: closingDate,
      startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
      calculationVersion: period.calculationVersion || (utilityType === "water" ? "water-occupancy-legacy" : undefined),
      startReading: metered ? Number(endReading) : 0,
      ratePerUnit: nextRate,
      actorId: admin._id,
      session,
    });
  }

  if (!deferAudit) await logBillingAudit(requestContext || {}, {
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

  return {
    closingDate,
    computationResult,
    periodId: period._id,
    nextPeriodId: nextPeriod?._id || null,
    nextPeriod,
    occupancyContinued: continuingOccupants.length > 0,
    continuingOccupantCount: continuingOccupants.length,
  };
}

// ============================================================================
// ENDPOINTS
// ============================================================================

export const openUtilityPeriod = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { roomId, startDate, startReading, ratePerUnit } = req.body;

    const requiresMeterReading = ["electricity", "water"].includes(utilityType);
    if (
      !roomId ||
      !startDate ||
      (!ratePerUnit && ratePerUnit !== 0) ||
      (requiresMeterReading && startReading === undefined)
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedRate = Number(ratePerUnit);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      return res.status(400).json({ error: "Utility rate cannot be negative." });
    }
    const maxRate = utilityType === "electricity" ? 100 : 100000;
    if (parsedRate > maxRate) {
      return res.status(400).json({ error: `Utility rate cannot exceed ₱${maxRate.toLocaleString()}.` });
    }
    const parsedStartReading = requiresMeterReading
      ? parsePhysicalMeterReading(startReading, {
          fieldLabel: "Opening meter reading",
          maximum: 999999.99,
        })
      : 0;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (!admin.isOwner && (!admin.branch || room.branch !== admin.branch)) return res.status(403).json({error:'Access denied'});
    if (!branchSupportsSeparateUtilityBilling(room.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }

    assertUtilityRoomEligibility(room, utilityType);

    const activeResolution = await resolveUtilityPeriodState({
      utilityType,
      roomId: room._id,
    });
    if (
      activeResolution.state !== UTILITY_PERIOD_STATE.MISSING &&
      activeResolution.state !== UTILITY_PERIOD_STATE.CLOSED_ONLY
    )
      return res
        .status(409)
        .json({
          error: "Room already has a lifecycle-active utility period.",
          code: "UTILITY_PERIOD_ALREADY_ACTIVE",
          periodState: activeResolution.state,
        });

    let parsedStartDate = toManilaStartOfDay(startDate)?.toDate();
    if (utilityType === 'water') {
      if (!admin.isOwner && room.branch !== admin.branch) return res.status(403).json({error:'Access denied'});
      const existing = await UtilityReading.findOne({roomId:room._id,utilityType:'water',unit:'m3',reading:parsedStartReading,isArchived:false,readingStatus:{$nin:['voided','corrected']},date:{$gte:parsedStartDate,$lt:dayjs(parsedStartDate).add(1,'day').toDate()}}).sort({date:1});
      if (existing) parsedStartDate=existing.date;
      else if (toManilaStartOfDay(startDate)?.isSame(toManilaStartOfDay(new Date()))) parsedStartDate=new Date();
      else throw Object.assign(new Error('Water cutover requires a previously verified boundary, or a new physical observation today.'),{statusCode:422,code:'WATER_VERIFIED_BASELINE_REQUIRED'});
      const previous=await UtilityReading.findOne({roomId:room._id,utilityType:'water',isArchived:false,readingStatus:{$nin:['voided','corrected']},date:{$lte:parsedStartDate}}).sort({date:-1});
      assertPhysicalMeterContinuity({reading:parsedStartReading,previousReading:previous?.reading,eventType:'periodStart'});
    }
    assertUtilityStartDate(parsedStartDate);
    const overlappingPeriod = await UtilityPeriod.findOne({
      utilityType,
      roomId: room._id,
      status: { $in: ["closed", "revised"] },
      isArchived: false,
      startDate: { $lte: parsedStartDate },
      endDate: { $gt: parsedStartDate },
    });
    if (overlappingPeriod) {
      return res.status(409).json({
        error: `Cannot open billing period because the start date falls within an existing cycle (${dayjs(overlappingPeriod.startDate).format("MMM D, YYYY")} – ${dayjs(overlappingPeriod.endDate).format("MMM D, YYYY")}).`,
      });
    }

    const period = await createOpenUtilityPeriodWithBoundary({
      utilityType,
      room,
      startDate: parsedStartDate,
      startReading: parsedStartReading,
      ratePerUnit: parsedRate,
      actorId: admin._id,
      startMode: utilityType === "water" ? UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION : UTILITY_PERIOD_START_MODE.BUSINESS_DATE,
    });

    res
      .status(201)
      .json({ success: true, period: serializeUtilityPeriod(period) });
  } catch (err) {
    next(err);
  }
};

export const recordUtilityReading = async (req, res, next) => {
  try {
    const payload = normalizeReservationPayload(req.body);
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { roomId, reading, date, eventType, tenantId } = payload;

    if (eventType === "regularBilling") {
      return res.status(400).json({
        error:
          "Mid-period checkpoint readings are no longer supported. Use move-in, move-out, or boundary readings from New Billing Period.",
      });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isOwner && (!admin.branch || room.branch !== admin.branch)) return res.status(403).json({error:'Access denied'});
    if (!branchSupportsSeparateUtilityBilling(room.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }
    assertUtilityRoomEligibility(room, utilityType);

    if (!admin.isOwner && room.branch !== admin.branch) return res.status(403).json({error:'Access denied'});
    if (utilityType === 'water') {
      if (!['moveIn','moveOut'].includes(normalizeUtilityEventType(eventType))) throw Object.assign(new Error('Use cycle opening or closing for water period boundaries.'),{statusCode:422});
      const {recordWaterObservation} = await import('../services/billing/waterObservations.js');
      const session=await mongoose.startSession();
      try {
        let observation;
        await session.withTransaction(async()=>{observation=await recordWaterObservation({room,eventAt:date,reading,eventType:normalizeUtilityEventType(eventType),tenantId,actorId:admin._id,session,source:'admin-observation'});});
        return res.status(201).json({success:true,reading:serializeUtilityReading(observation)});
      } finally {await session.endSession();}
    }
    const normalizedReadingDate = assertUtilityReadingDate(date);
    const result = await resolveRoomUtilityBoundaryContext({
      room,
      utilityType,
      eventAt: normalizedReadingDate,
      reading,
      eventType: normalizeUtilityEventType(eventType),
      tenantId: tenantId || null,
      actorId: admin._id,
      allowInitialize: false,
      meterReset: payload.meterReset || {
        oldMeterFinalReading: payload.oldMeterFinalReading,
        evidenceReferences: payload.evidenceReferences,
      },
    });
    const newReading = result.boundary;

    res.status(201).json({
      success: true,
      reading: serializeUtilityReading(newReading),
    });
  } catch (err) {
    next(err);
  }
};

export const closeUtilityPeriod = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { id } = req.params;
    const { endReading, endDate, startDate, startReading } = req.body;

    let result;
    await session.withTransaction(async () => {
      const period = await UtilityPeriod.findById(id).session(session);
      if (period && (!admin.isOwner && (!admin.branch || period.branch !== admin.branch))) throw Object.assign(new Error('Access denied'),{statusCode:403});
      if (period && period.utilityType !== utilityType) throw Object.assign(new Error('Period not found'),{statusCode:404});
      const parsedEndReading = utilityType === "electricity" || period?.calculationVersion === "water-meter-v1"
        ? parsePhysicalMeterReading(endReading, {
            fieldLabel: "Final meter reading",
            maximum: 999999.99,
          })
        : 0;

      const requestedClosingDate = parseUtilityCycleDate(endDate || new Date());
      if (
        period &&
        ["closed", "revised"].includes(period.status) &&
        requestedClosingDate &&
        period.endDate?.getTime() === requestedClosingDate.getTime() &&
        Number(period.endReading) === Number(parsedEndReading) &&
        (!startDate || toManilaStartOfDay(startDate)?.isSame(toManilaStartOfDay(period.startDate))) &&
        (startReading == null || Number(startReading) === Number(period.startReading))
      ) {
        const nextPeriod = await UtilityPeriod.findOne({
          utilityType,
          roomId: period.roomId,
          status: "open",
          isArchived: false,
          startDate: period.endDate,
          startReading: period.endReading,
        }).session(session);
        result = {
          periodId: period._id,
          nextPeriodId: nextPeriod?._id || null,
          nextPeriod,
          closingDate: period.endDate,
          occupancyContinued: Boolean(nextPeriod),
          idempotent: true,
        };
        return;
      }
      if (!period || period.status !== "open") {
        throw Object.assign(new Error("Invalid or already closed period"), {
          statusCode: 400,
          code: "UTILITY_PERIOD_NOT_OPEN",
        });
      }
      if (!branchSupportsSeparateUtilityBilling(period.branch, utilityType)) {
        throw Object.assign(new Error("Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch."), {
          statusCode: 422,
          code: "BRANCH_UTILITY_NOT_SUPPORTED",
        });
      }
      const activeResolution = await resolveUtilityPeriodState({
        utilityType,
        roomId: period.roomId,
        session,
      });
      if (
        activeResolution.state !== UTILITY_PERIOD_STATE.OPEN ||
        String(activeResolution.period?._id) !== String(period._id)
      ) {
        throw Object.assign(
          new Error("Electricity billing for this room is not in one valid open state."),
          {
            statusCode: 409,
            code: `UTILITY_PERIOD_${activeResolution.state || "INVALID"}`,
            details: { periodState: activeResolution.state },
          },
        );
      }
      const room = await Room.findById(period.roomId).session(session);
      if (startDate !== undefined) {
        const evidence = await resolveUtilityOpening({roomId:period.roomId,utilityType,startDate,startReading,period,session});
        await assertUtilityCycleRange({roomId:period.roomId,utilityType,startDate:evidence.date,endDate:requestedClosingDate,periodId:period._id,session});
        await applyUtilityOpening({period,evidence,actorId:admin._id,session});
      }
      result = await closePeriodAndGenerateDrafts({
        admin,
        period,
        room,
        endReading: parsedEndReading,
        endDate,
        utilityType,
        requestContext: req,
        session,
        deferAudit: true,
      });
    });
    if (!result?.idempotent) {
      await logCommittedUtilityClose({ requestContext: req, admin, utilityType, result });
    }

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
  }
};

export const resolveUtilityHistoricalGap = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const period = await UtilityPeriod.findById(req.params.id).select("branch utilityType").lean();
    if (!period) return res.status(404).json({ error: "Utility period not found" });
    if (period.utilityType !== req.params.utilityType) return res.status(409).json({ error: "Utility type does not match period." });
    if (!admin.isOwner && period.branch !== admin.branch) return res.status(403).json({ error: "Access denied" });
    const result = await resolveHistoricalUtilityGap({
      reviewRecordId: req.body.reviewRecordId,
      expectedPeriodId: req.params.id,
      actorId: admin._id,
      actorName: admin.displayName,
      actorRole: admin.role,
      branch: period.branch,
      outcome: req.body.outcome,
      explanation: req.body.explanation,
      evidenceReferences: req.body.evidenceReferences,
      approvalReference: req.body.approvalReference,
      financialDispositionType: req.body.financialDispositionType,
      financialAmount: req.body.financialAmount,
      verifiedOpeningReading: req.body.verifiedOpeningReading,
    });
    return res.json({ success: true, period: serializeUtilityPeriod(result.period), review: result.gap });
  } catch (error) {
    next(error);
  }
};

export const generateHistoricalUtilityPeriod = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const admin = await getAdminInfo(req);
    const utilityType = req.params.utilityType;
    const { roomId, startDate, startReading, ratePerUnit, endDate, endReading } = req.body;
    if (!roomId || !startDate || !endDate || ratePerUnit === null || ratePerUnit === undefined || ratePerUnit === "") {
      return res.status(400).json({ error: "Room, dates, and rate are required." });
    }
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isOwner && room.branch !== admin.branch) return res.status(403).json({ error: "Access denied" });
    if (!branchSupportsSeparateUtilityBilling(room.branch, utilityType)) {
      return res.status(422).json({ error: "This branch does not use separate utility periods.", code: "BRANCH_UTILITY_NOT_SUPPORTED" });
    }
    assertUtilityRoomEligibility(room, utilityType);

    let start = parseUtilityCycleDate(startDate);
    const end = parseUtilityCycleDate(endDate);
    assertUtilityStartDate(start);
    assertUtilityClosingDate(start, end);
    const opening = ["electricity", "water"].includes(utilityType)
      ? parsePhysicalMeterReading(startReading, { fieldLabel: "Opening meter reading", maximum: 999999.99 })
      : 0;
    const closing = ["electricity", "water"].includes(utilityType)
      ? parsePhysicalMeterReading(endReading, { fieldLabel: "Final meter reading", maximum: 999999.99 })
      : 0;
    assertPhysicalMeterContinuity({
      reading: closing,
      previousReading: opening,
      eventType: "periodEnd",
      fieldLabel: "Final meter reading",
    });
    const rate = Number(ratePerUnit);
    const maxRate = utilityType === "electricity" ? 100 : 100000;
    if (!Number.isFinite(rate) || rate < 0 || rate > maxRate) {
      return res.status(400).json({ error: `Rate must be between 0 and ${maxRate.toLocaleString()}.` });
    }

    let result;
    let createdPeriodId;
    await session.withTransaction(async () => {
      const conflict = await resolveUtilityPeriodState({ utilityType, roomId: room._id, session });
      if (conflict.state !== UTILITY_PERIOD_STATE.MISSING && conflict.state !== UTILITY_PERIOD_STATE.CLOSED_ONLY) {
        throw Object.assign(new Error("An active utility period already exists. Historical generation cannot replace or delete it."), {
          statusCode: 409,
          code: "UTILITY_PERIOD_ALREADY_ACTIVE",
          details: { periodState: conflict.state },
        });
      }
      const evidence = await resolveUtilityOpening({roomId:room._id,utilityType,startDate:start,startReading:opening,session});
      start = evidence.date;
      await assertUtilityCycleRange({roomId:room._id,utilityType,startDate:start,endDate:end,session});
      const period = await createOpenUtilityPeriodWithBoundary({
        utilityType,
        room,
        startDate: start,
        startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
        startReading: opening,
        ratePerUnit: rate,
        actorId: admin._id,
        session,
      });
      createdPeriodId = period._id;
      result = await closePeriodAndGenerateDrafts({
        admin,
        period,
        room,
        endReading: closing,
        endDate: end,
        utilityType,
        requestContext: req,
        session,
        deferAudit: true,
        openNextPeriod: false,
      });
    });
    const period = await UtilityPeriod.findById(createdPeriodId).lean();
    await logCommittedUtilityClose({ requestContext: req, admin, utilityType, result });
    res.status(201).json({ success: true, period: serializeUtilityPeriod(period), result });
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
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
      const session = await mongoose.startSession();
      try {
        let parsedEndReading = 0;
        let closedPeriod;
        let room;
        let closeResult;
        await session.withTransaction(async () => {
          closedPeriod = await UtilityPeriod.findById(item.periodId).session(session);
          if (!closedPeriod || closedPeriod.status !== "open") {
            throw Object.assign(new Error("Period not found or is not open"), { statusCode: 400, code: "UTILITY_PERIOD_NOT_OPEN" });
          }
          if (!branchSupportsSeparateUtilityBilling(closedPeriod.branch, utilityType)) {
            throw Object.assign(new Error("This branch does not use separate utility periods."), { statusCode: 422, code: "BRANCH_UTILITY_NOT_SUPPORTED" });
          }
          if (closedPeriod.utilityType !== utilityType || (!admin.isOwner && closedPeriod.branch !== admin.branch)) throw Object.assign(new Error('Access denied'),{statusCode:403});
          if (utilityType === 'electricity' || closedPeriod.calculationVersion === 'water-meter-v1') parsedEndReading = parsePhysicalMeterReading(item.endReading,{fieldLabel:'Final meter reading',maximum:999999.99});
          room = await Room.findById(closedPeriod.roomId).session(session);
          closeResult = await closePeriodAndGenerateDrafts({
            admin,
            period: closedPeriod,
            room,
            endReading: parsedEndReading,
            endDate: item.endDate || endDate,
            utilityType,
            requestContext: req,
            session,
            deferAudit: true,
          });
        });
        await logCommittedUtilityClose({ requestContext: req, admin, utilityType, result: closeResult });
        closed.push({
          periodId: closedPeriod._id,
          roomName: room.name,
          success: true,
        });
      } catch (err) {
        failed.push({ periodId: item.periodId, error: err.message });
      } finally {
        await session.endSession();
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
  const session = await mongoose.startSession();
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;
    await session.withTransaction(async () => {
      const period = await UtilityPeriod.findById(id).session(session);
      if (!period || period.utilityType !== utilityType) throw Object.assign(new Error('Period not found'), {statusCode:404});
      if (!admin.isOwner && period.branch !== admin.branch) throw Object.assign(new Error('Access denied'), {statusCode:403});
      const bills = await Bill.find({$or:[
        {_id:{$in:getUtilitySummaryBillIds(period)}},
        {'waterAllocations.utilityPeriodId':period._id},
        {[`utilityDispatch.${utilityType}.periodId`]:period._id},
      ]}).session(session);
      assertUtilityHistoryMutable(bills, utilityType);
      for (const bill of bills) {
        if (utilityType === 'water' && bill.waterAllocations?.length) {
          bill.waterAllocations = bill.waterAllocations.filter(a => String(a.utilityPeriodId) !== String(period._id));
          refreshWaterAggregate(bill);
        } else bill.charges[utilityType] = 0;
        if (bill.utilityDispatch) bill.utilityDispatch[utilityType] = undefined;
        syncBillAmounts(bill, {preserveStatus:bill.status === 'draft'});
        await bill.save({session});
      }
      // Keep both period and physical observations as auditable history.
      period.isArchived = true;
      await period.save({session});
    });
    await logBillingAudit(req, {admin, action:'utility_period_archived', severity:'high',
      entityId:id, branch:admin.branch, details:`Archived unpublished ${utilityType} cycle; observations retained.`,
      metadata:{utilityType,periodId:id}});
    res.json({success:true, message:'Unpublished billing cycle archived; physical observations retained.'});
  } catch (err) { next(err); } finally { await session.endSession(); }
};

export const updateUtilityPeriod = async (req, res, next) => {
  try {
    const payload = normalizeReservationPayload(req.body);
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;
    const { ratePerUnit, startDate, endDate, startReading, endReading } =
      payload;

    const period = await UtilityPeriod.findOne({
      _id: id,
      utilityType,
      isArchived: false,
    });
    if (!period || period.isArchived)
      return res.status(404).json({ error: "Period not found" });

    if (period && (!admin.isOwner && (!admin.branch || period.branch !== admin.branch))) return res.status(403).json({error:'Access denied'});
    if (period && period.utilityType !== utilityType) return res.status(404).json({error:'Period not found'});
    if (period.status !== "open") {
      await assertUtilityPeriodNotSent(period, utilityType);
    if (period.calculationVersion === 'water-meter-v1') throw Object.assign(new Error('Measured water snapshots are immutable. Archive an unpublished cycle and regenerate from verified observations.'),{statusCode:409,code:'WATER_SNAPSHOT_IMMUTABLE'});
    }

    const room = await Room.findById(period.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!branchSupportsSeparateUtilityBilling(room.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }
    assertUtilityRoomEligibility(room, utilityType);

    if (utilityType === 'water' && period.calculationVersion === 'water-meter-v1') {
      for (const field of ['startReading','startDate','endReading','endDate','calculationVersion','openingObservationId','openingReadingId']) {
        if (payload[field] === undefined) continue;
        const current = period[field];
        const same = field.endsWith('Date') ? +new Date(payload[field]) === +new Date(current)
          : payload[field] != null && current != null && String(payload[field]) === String(current);
        if (!same) throw Object.assign(new Error('Physical water boundaries are immutable. Use the audited observation correction workflow.'), {statusCode:409,code:'WATER_BOUNDARY_IMMUTABLE'});
      }
      if (ratePerUnit !== undefined) {
        const rate = parsePhysicalMeterReading(ratePerUnit,{fieldLabel:'Water rate',maximum:100000});
        const previousRate = period.pricingSnapshot?.ratePerUnit ?? period.ratePerUnit;
        period.ratePerUnit = rate;
        period.pricingAudit.push({previousRate,ratePerUnit:rate,recordedBy:admin._id,capturedAt:new Date()});
        period.pricingSnapshot = {ratePerUnit:rate,unit:'m3',recordedBy:admin._id,capturedAt:new Date()};
      }
      const updated = await UtilityPeriod.findOneAndUpdate({_id:period._id,status:'open',updatedAt:period.updatedAt,__v:period.__v},
        {$set:{ratePerUnit:period.ratePerUnit,pricingSnapshot:period.pricingSnapshot,pricingAudit:period.pricingAudit},$inc:{__v:1}}, {new:true,runValidators:true});
      if (!updated) throw Object.assign(new Error('Water period changed. Refresh before editing its rate.'),{statusCode:409});
      return res.json({success:true,period:serializeUtilityPeriod(updated),result:null});
    }

    if (startDate !== undefined) {
      period.startDate = toManilaStartOfDay(startDate)?.toDate();
    }
    if (endDate !== undefined) {
      period.endDate = endDate ? toManilaStartOfDay(endDate)?.toDate() : null;
    }
    if (startReading !== undefined) {
      period.startReading = utilityType === "electricity"
        ? parsePhysicalMeterReading(startReading, { fieldLabel: "Opening meter reading", maximum: 999999.99 })
        : 0;
    }
    if (endReading !== undefined) {
      period.endReading =
        endReading === null || endReading === ""
          ? null
          : utilityType === "electricity"
            ? parsePhysicalMeterReading(endReading, { fieldLabel: "Final meter reading", maximum: 999999.99 })
            : 0;
    }

    if (ratePerUnit !== undefined) {
      const maxRate = utilityType === "electricity" ? 100 : 100000;
      const parsedRate = Number(ratePerUnit);
      if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > maxRate) {
        return res.status(400).json({ error: `Rate must be between ₱0.00 and ₱${maxRate.toLocaleString()}.` });
      }
      period.ratePerUnit = parsedRate;
    }

    assertUtilityStartDate(period.startDate);

    if (
      period.endDate &&
      dayjs(period.endDate).startOf("day").isBefore(dayjs(period.startDate))
    ) {
      return res.status(400).json({
        error: "Billing cycle end date must be on or after the start date.",
      });
    }
    if (period.status !== "open" && !period.endDate) {
      return res.status(400).json({
        error: "Finalized billing periods must have an end date.",
      });
    }

    if (period.startDate && period.endDate) {
      assertUtilityClosingDate(period.startDate, period.endDate);
      const collidingPeriod = await UtilityPeriod.findOne({
        _id: { $ne: period._id },
        roomId: room._id,
        utilityType,
        isArchived: false,
        startDate: { $lt: period.endDate },
        endDate: { $gt: period.startDate },
      });
      if (collidingPeriod) {
        return res.status(409).json({
          error: `The updated date range overlaps with an existing cycle (${dayjs(collidingPeriod.startDate).format("MMM D, YYYY")} – ${dayjs(collidingPeriod.endDate).format("MMM D, YYYY")}).`,
        });
      }
    }

    if (utilityType === "electricity" && period.status !== "open") {
      assertBoundaryReadings({
        startReading: period.startReading,
        endReading: period.endReading,
      });
      assertPhysicalMeterContinuity({
        reading: period.endReading,
        previousReading: period.startReading,
        eventType: "periodEnd",
        fieldLabel: "Final meter reading",
      });
    }

    if (utilityType === "electricity") {
      await syncElectricityBoundaryReadings({
        period,
        room,
        adminId: admin._id,
        shouldPersistEndReading: period.status !== "open",
      });
    }

    if (period.status !== "open") {
      const allReadings = await UtilityReading.find({
        utilityType,
        roomId: room._id,
        isArchived: false,
        date: { $gte: period.startDate, $lte: period.endDate },
      })
        .sort({ date: 1, createdAt: 1 })
        .lean();

      const reservations = await resolveRoomScopedReservationsForPeriod({
        room,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        utilityType,
      });

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

      let computationResult;
      try {
        computationResult = computeBilling({
          utilityPeriod: cyclePeriod,
          readings: allReadings,
          reservations: billableReservations,
          tenantEvents: mappedTenantEvents,
          forceSegmented: utilityType === "electricity",
          utilityType,
          roomType: room.type,
        });
      } catch (error) {
        throw normalizeBillingComputationError(error);
      }

      period.computedTotalUsage = computationResult.computedTotalUsage;
      period.computedTotalCost = computationResult.computedTotalCost;
      period.verified = computationResult.verified;
      period.segments = computationResult.segments;
      period.tenantSummaries = computationResult.tenantSummaries;
      period.overheadSegments = computationResult.overheadSegments || [];
      period.tenantSummaries = await upsertDraftBillsForUtility({
        period: period.toObject(),
        room,
        tenantSummaries: period.tenantSummaries,
        utilityType,
      });
      period.revised = true;
      period.revisedAt = new Date();
      if (period.status === "closed") {
        period.status = "revised";
      }
    }

    await period.save();

    const serializedPeriod = serializeUtilityPeriod(period);
    const serializedResult =
      period.status !== "open"
        ? {
            id: period._id,
            computedTotalUsage: period.computedTotalUsage,
            totalRoomCost: period.computedTotalCost,
            ratePerUnit: period.ratePerUnit,
            verified: period.verified,
            segments: period.segments || [],
            tenantSummaries: period.tenantSummaries || [],
          }
        : null;

    res.json({
      success: true,
      period: serializedPeriod,
      result: serializedResult,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteUtilityReading = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;

    const reading = await UtilityReading.findById(id);
    if (!reading || reading.isArchived || reading.utilityType !== utilityType)
      return res.status(404).json({ error: "Reading not found" });

    if (!admin.isOwner && reading.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!branchSupportsSeparateUtilityBilling(reading.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }

    if (reading.utilityPeriodId) {
      const period = await UtilityPeriod.findById(reading.utilityPeriodId);
      if (period) await assertUtilityPeriodNotSent(period, utilityType);
    }

    if (utilityType === 'water') throw Object.assign(new Error('Use an audited water correction; physical observations cannot be deleted.'),{statusCode:409});
    reading.isArchived = true;
    await reading.save();

    res.json({ success: true, message: "Reading archived" });
  } catch (err) {
    next(err);
  }
};

export const updateUtilityReading = async (req, res, next) => {
  try {
    const payload = normalizeReservationPayload(req.body);
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;
    const { reading, date, eventType } = payload;

    if (eventType === "regularBilling") {
      return res.status(400).json({
        error:
          "Mid-period checkpoint readings are no longer supported. Use move-in, move-out, or boundary readings from New Billing Period.",
      });
    }

    const readingDoc = await UtilityReading.findById(id);
    if (!readingDoc || readingDoc.isArchived || readingDoc.utilityType !== utilityType)
      return res.status(404).json({ error: "Reading not found" });

    if (!admin.isOwner && readingDoc.branch !== admin.branch) return res.status(403).json({error:'Access denied'});
    if (readingDoc.utilityType !== utilityType) return res.status(404).json({error:'Reading not found'});
    if (utilityType === 'water') return correctWaterObservation(req, res, next, readingDoc, admin);
    if (!branchSupportsSeparateUtilityBilling(readingDoc.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }

    let linkedPeriod = null;
    if (readingDoc.utilityPeriodId) {
      linkedPeriod = await UtilityPeriod.findById(readingDoc.utilityPeriodId);
      if (linkedPeriod) await assertUtilityPeriodNotSent(linkedPeriod, utilityType);
    }

    if (reading !== undefined) {
      const parsedReading = parsePhysicalMeterReading(reading, {
        fieldLabel: "Meter reading",
        maximum: 999999.99,
      });
      readingDoc.reading = parsedReading;
    }
    if (date !== undefined) {
      readingDoc.date = assertUtilityReadingDate(date, {
        periodStart: linkedPeriod?.startDate || null,
      });
    }
    if (eventType !== undefined) readingDoc.eventType = eventType;

    if (utilityType === 'electricity') await assertElectricityChronology({roomId:readingDoc.roomId,date:readingDoc.date,reading:readingDoc.reading,eventType:readingDoc.eventType,meterReset:readingDoc.meterReset,excludeIds:[readingDoc._id]});
    await readingDoc.save();
    res.json({ success: true, reading: serializeUtilityReading(readingDoc) });
  } catch (err) {
    next(err);
  }
};

export const reviseUtilityResult = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, periodId } = req.params;

    const period = await UtilityPeriod.findById(periodId);
    if (period && (!admin.isOwner && (!admin.branch || period.branch !== admin.branch))) return res.status(403).json({error:'Access denied'});
    if (period && period.utilityType !== utilityType) return res.status(404).json({error:'Period not found'});
    if (!period || period.status !== "closed")
      return res.status(400).json({ error: "Invalid or open period" });
    await assertUtilityPeriodNotSent(period, utilityType);
    if (period.calculationVersion === 'water-meter-v1') throw Object.assign(new Error('Measured water snapshots are immutable. Archive an unpublished cycle and regenerate from verified observations.'),{statusCode:409,code:'WATER_SNAPSHOT_IMMUTABLE'});

    const room = await Room.findById(period.roomId);
    if (!branchSupportsSeparateUtilityBilling(period.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }
    assertUtilityRoomEligibility(room, utilityType);

    const allReadings = await UtilityReading.find({
      utilityType,
      roomId: room._id,
      isArchived: false,
      date: { $gte: period.startDate, $lte: period.endDate },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const reservations = await resolveRoomScopedReservationsForPeriod({
      room,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      utilityType,
    });

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
      utilityType,
      roomType: room.type,
    });

    period.computedTotalUsage = computationResult.computedTotalUsage;
    period.computedTotalCost = computationResult.computedTotalCost;
    period.verified = computationResult.verified;
    period.segments = computationResult.segments;
    period.tenantSummaries = computationResult.tenantSummaries;
    period.overheadSegments = computationResult.overheadSegments || [];

    period.tenantSummaries = await upsertDraftBillsForUtility({
      period: period.toObject(),
      room,
      tenantSummaries: period.tenantSummaries,
      utilityType,
    });

    period.revised = true;
    period.revisedAt = new Date();
    period.status = "revised";
    await period.save();

    res.json({ success: true, result: computationResult });
  } catch (err) {
    next(err);
  }
};

export const sendUtilityPeriod = async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const admin = await getAdminInfo(req);
    const { utilityType, id } = req.params;

    const period = await UtilityPeriod.findOne({
      _id: id,
      utilityType,
      isArchived: false,
    }).lean();

    if (period && (!admin.isOwner && (!admin.branch || period.branch !== admin.branch))) return res.status(403).json({error:'Access denied'});
    if (period && period.utilityType !== utilityType) return res.status(404).json({error:'Period not found'});
    if (!period || period.status === "open") {
      return res
        .status(400)
        .json({ error: "Only finalized periods can be sent." });
    }

    const room = await Room.findById(period.roomId).lean();
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!branchSupportsSeparateUtilityBilling(room.branch, utilityType)) {
      return res.status(422).json({
        error:
          "Guadalupe uses a fixed-rate billing setup. Separate electricity and water utility billing are not used for this branch.",
        code: "BRANCH_UTILITY_NOT_SUPPORTED",
      });
    }
    assertUtilityRoomEligibility(room, utilityType);
    assertUtilityPeriodSendable(period);

    const billIds = getUtilitySummaryBillIds(period);
    if (billIds.length === 0) {
      return res
        .status(409)
        .json({ error: "No tenant bills found for this period." });
    }

    const bills = await Bill.find({
      _id: { $in: billIds },
      isArchived: false,
    }).populate("userId", "firstName lastName email");

    const sendableBills = bills.filter((bill) => {
      const chargeField = utilityType === "water" ? "water" : "electricity";
      return (
        Number(bill?.charges?.[chargeField] || 0) > 0 &&
        (utilityType === "water" && bill.waterAllocations?.length ? !waterPeriodSent(bill, period._id) : getUtilityDispatchEntry(bill, utilityType).state !== "sent")
      );
    });

    if (sendableBills.length === 0) {
      return res.status(409).json({
        error: `This ${utilityType} period has already been sent to tenants.`,
      });
    }

    const result = {
      computedTotalUsage: period.computedTotalUsage,
      computedTotalCost: period.computedTotalCost,
      ratePerUnit: period.ratePerUnit,
      segments: period.segments || [],
      tenantSummaries: period.tenantSummaries || [],
    };

    const sendResult = await sendUtilityPeriodBills({
      bills: sendableBills,
      period,
      result,
      utilityType,
    });

    logger.info(
      {
        utilityType,
        periodId: period._id,
        billCount: sendableBills.length,
        sentCount: sendResult.sent,
        durationMs: Date.now() - startedAt,
      },
      "Utility period send completed",
    );

    await logBillingAudit(req, {
      admin,
      action: `${utilityType}_period_sent`,
      details: `Sent ${utilityType} charges for ${getRoomLabel(room)}.`,
      metadata: {
        roomId: room._id,
        roomName: getRoomLabel(room),
        periodId: period._id,
        utilityType,
        publishedCount: sendResult.sent,
      },
      entityId: period._id,
      branch: room.branch,
    });

    res.json({
      success: true,
      utilityType,
      roomId: room._id,
      roomName: getRoomLabel(room),
      periodId: period._id,
      published: sendResult.sent,
      publishedAt: sendResult.publishedAt,
      issuedAt: sendResult.issuedAt,
      dueDate: sendResult.dueDate,
      emailSuccessCount: sendResult.emailSuccessCount || 0,
      emailFailedCount: sendResult.emailFailedCount || 0,
      notificationSuccessCount: sendResult.notificationSuccessCount || 0,
      notificationFailedCount: sendResult.notificationFailedCount || 0,
      deliveries: sendResult.deliveries,
      partialFailures: sendResult.deliveries.filter(
        (entry) => entry.emailError || entry.notificationError,
      ),
    });
  } catch (err) {
    next(err);
  }
};

export const getUtilityDiagnosticsApi = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isOwner ? req.query.branch || null : admin.branch;
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
    const branch = admin.isOwner ? req.query.branch || null : admin.branch;
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
    if (!admin.isOwner && room.branch !== admin.branch) {
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
        ...(function buildTenant() {
          const tenant = resolveReferencedUser(r.tenantId, {
            unknownLabel: UNKNOWN_TENANT_LABEL,
          });
          return {
            tenant: tenant.name === UNKNOWN_TENANT_LABEL ? null : tenant.name,
            tenantEmail: tenant.email,
            tenantId: tenant.id,
          };
        })(),
        utilityPeriodId: r.utilityPeriodId || null,
        utilityPeriodStatus: r.utilityPeriodId
          ? periodStatusMap.get(String(r.utilityPeriodId)) || null
          : null,
        id: r._id,
        reading: r.reading,
        date: r.date,
        eventType: normalizeUtilityEventType(r.eventType),
        readingStatus: r.readingStatus || "recorded",
        isLocked:
          r.readingStatus === "locked" ||
          isUtilityEventType(r.eventType, "periodStart") ||
          isUtilityEventType(r.eventType, "periodEnd") ||
          (r.utilityPeriodId &&
            ["closed", "revised"].includes(
              periodStatusMap.get(String(r.utilityPeriodId)) || "",
            )),
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
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const latestReading = await UtilityReading.findOne({
      roomId: room._id,
      utilityType,
      isArchived: false,
      ...(utilityType === "water" ? {readingStatus:{$nin:["voided","corrected"]}} : {}),
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
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periods = await UtilityPeriod.find({
      roomId: room._id,
      utilityType,
      isArchived: false,
    })
      .sort({ startDate: -1 })
      .lean();

    // Bulk-fetch linked bills so dispatch state reflects per-utility visibility.
    const allBillIds = periods
      .flatMap((p) => (p.tenantSummaries || []).map((s) => s.billId))
      .filter(Boolean);
    const billMap = new Map();
    if (allBillIds.length > 0) {
      const bills = await Bill.find({ _id: { $in: allBillIds } })
        .select("charges utilityDispatch waterAllocations status sentAt issuedAt dueDate")
        .lean();
      for (const b of bills) {
        billMap.set(String(b._id), b);
      }
    }

    res.json({
      periods: periods.map((p) => {
        const linkedBills = getUtilitySummaryBillIds(p)
          .map((id) => billMap.get(String(id)))
          .filter(Boolean);
        const {
          billingState,
          billingLabel,
          hasDraftBills,
          hasSentBills,
          blockingReason,
        } = deriveUtilityPeriodBillingState({
          period: p,
          utilityType,
          linkedBills,
        });

        let displayStatus = "closed";
        if (billingState === "open") displayStatus = "open";
        else if (billingState === "ready_to_send") displayStatus = "ready";
        else if (billingState === "sent") displayStatus = "finalized";
        else if (p.revised) displayStatus = "revised";

        return {
          id: p._id,
          roomId:p.roomId,
          calculationVersion:p.calculationVersion || (utilityType === "water" ? "water-occupancy-legacy" : null),
          unit:p.unit || null,
          pricingSnapshot:p.pricingSnapshot || null,
          meterEvents:p.meterEvents || [],
          segments:p.segments || [],
          tenantSummaries:p.tenantSummaries || [],
          startDate: p.startDate,
          endDate: p.endDate,
          startReading: p.startReading,
          endReading: p.endReading,
          computedTotalUsage: p.computedTotalUsage,
          computedTotalCost: p.computedTotalCost,
          ratePerUnit: p.ratePerUnit,
          status: p.status,
          displayStatus,
          billingState,
          billingLabel,
          revised: p.revised,
          hasDraftBills,
          hasSentBills,
          blockingReason,
          canSend: billingState === "ready_to_send",
          canRevise:
            (p.status === "closed" || p.status === "revised") &&
            billingState !== "sent",
          canDelete: billingState !== "sent",
          dispatchState: hasSentBills && !hasDraftBills ? "sent" : "draft",
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

    if (!admin.isOwner && (!admin.branch || period.branch !== admin.branch)) return res.status(403).json({error:'Access denied'});

    const summaries = period.tenantSummaries || [];
    const reservationIds = summaries
      .map((summary) => summary.reservationId)
      .filter(Boolean);
    const tenantIds = summaries
      .map((summary) => summary.tenantId)
      .filter(Boolean);

    const formatDurationRange = (moveInDate, moveOutDate) => {
      if (!moveInDate) return "Ongoing";
      const start = dayjs(moveInDate).format("MMM D, YYYY");
      const end = moveOutDate
        ? dayjs(moveOutDate).format("MMM D, YYYY")
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
            $and: [
              buildMoveInBeforeQuery(period.endDate || period.startDate),
              buildMoveOutAfterOrMissingQuery(period.startDate),
            ],
          })
            .sort({ moveInDate: -1 })
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
      const resolvedTenant = resolveReferencedUser(
        reservation?.userId || tenant || summary.tenantId || null,
        { unknownLabel: UNKNOWN_TENANT_LABEL },
      );

      return {
        ...summary,
        tenantName: summary.tenantName || resolvedTenant.name,
        durationRange: reservation
          ? formatDurationRange(
              readMoveInDate(reservation),
              readMoveOutDate(reservation),
            )
          : summary.durationRange || "Ongoing",
        tenantEmail:
          summary.tenantEmail ||
          resolvedTenant.email ||
          reservation?.billingEmail ||
          null,
      };
    });

    res.json({
      result: {
        id: period._id,
        calculationVersion:period.calculationVersion || (utilityType === 'water' ? 'water-occupancy-legacy' : null),
        unit:period.unit || null,
        meterEvents:period.meterEvents || [],
        calculationInputs:period.calculationInputs || null,
        calculationFingerprint:period.calculationFingerprint || null,
        pricingSnapshot:period.pricingSnapshot || null,
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
 * Exports finalized utility billing rows for admin CSV downloads.
 * Branch admins are scoped to their assigned branch; owners may filter by branch.
 * This is the "source of truth" view for billing — billing periods just
 * ──────────────────────────────────────────────────────────────────────── */
export const exportUtilityRows = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType } = req.params;
    if (!UTILITY_EXPORT_TYPES.has(utilityType)) {
      return res.status(400).json({ error: "Invalid utility type specified" });
    }

    const branch = admin.isOwner ? req.query.branch || null : admin.branch;
    const roomId = req.query.roomId || null;

    const filter = {
      utilityType,
      isArchived: false,
      status: { $in: ["closed", "revised"] },
    };
    if (roomId) {
      filter.roomId = roomId;
    }

    const periods = await UtilityPeriod.find(filter)
      .populate("roomId", "name roomNumber branch type")
      .sort({ startDate: -1, createdAt: -1 })
      .lean();

    const scopedPeriods = branch
      ? periods.filter((period) => period.roomId?.branch === branch)
      : periods.filter((period) =>
          branchSupportsSeparateUtilityBilling(
            period.roomId?.branch || period.branch,
            utilityType,
          ),
        );

    const rows = scopedPeriods.flatMap((period) => {
      const summaries = period.tenantSummaries || [];
      if (summaries.length === 0) {
        return [{
          utilityType,
          branch: period.roomId?.branch || period.branch || "",
          roomId: String(period.roomId?._id || period.roomId || ""),
          roomName: getRoomLabel(period.roomId),
          periodId: String(period._id || ""),
          periodStatus: period.status || "",
          startDate: formatExportDate(period.startDate),
          endDate: formatExportDate(period.endDate),
          startReading: period.startReading ?? "",
          endReading: period.endReading ?? "",
          totalUsage: period.computedTotalUsage ?? "",
          ratePerUnit: period.ratePerUnit ?? "",
          totalRoomCost: period.computedTotalCost ?? "",
          tenantId: "",
          tenantName: "-",
          tenantEmail: "",
          reservationId: "",
          bedId: "",
          bedName: "",
          durationRange: "",
          usage: period.computedTotalUsage ?? 0,
          amount: period.computedTotalCost ?? 0,
          billId: "",
        }];
      }
      return summaries.map((summary) =>
        buildUtilityExportRow({ utilityType, period, summary }),
      );
    });

    res.json({ success: true, rows });
  } catch (error) {
    next(error);
  }
};

export const getUtilityAiReview = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, periodId } = req.params;

    if (utilityType !== "electricity") {
      return res.status(400).json({
        success: false,
        utilityType,
        error: "AI billing review is currently available for electricity only.",
      });
    }

    const period = await UtilityPeriod.findOne({
      _id: periodId,
      utilityType: "electricity",
      isArchived: false,
    }).lean();

    if (!period) {
      return res.status(404).json({ error: "Electricity period not found" });
    }

    const room = await Room.findById(period.roomId)
      .select("_id name roomNumber branch type capacity floor")
      .lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [periods, readings, reservations, linkedBills] = await Promise.all([
      UtilityPeriod.find({
        roomId: room._id,
        utilityType: "electricity",
        isArchived: false,
      })
        .sort({ startDate: 1 })
        .lean(),
      UtilityReading.find({
        roomId: room._id,
        utilityType: "electricity",
        isArchived: false,
      })
        .sort({ date: 1, createdAt: 1 })
        .lean(),
      Reservation.find({
        roomId: room._id,
        status: { $in: BILLABLE_RESERVATION_STATUS_QUERY },
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName")
        .lean(),
      Bill.find({
        _id: { $in: getUtilitySummaryBillIds(period) },
      })
        .select("charges utilityDispatch waterAllocations status sentAt issuedAt dueDate")
        .lean(),
    ]);

    const periodForReview =
      periods.find((entry) => String(entry._id) === String(period._id)) ||
      period;
    const electricityReview = buildElectricityReview({
      period: periodForReview,
      periods,
      readings,
      reservations,
    });
    const { billingState, billingLabel } = deriveUtilityPeriodBillingState({
      period,
      utilityType: "electricity",
      linkedBills,
    });
    const snapshot = buildBillingIntelligenceSnapshot({
      period,
      periods,
      room: { ...room, roomLabel: getRoomLabel(room) },
      electricityReview,
      billingState,
      billingLabel,
    });
    const { insight, model, fallbackReason } =
      await generateBillingIntelligence(snapshot);

    res.json({
      success: true,
      periodId,
      utilityType: "electricity",
      snapshotMeta: {
        provider: insight.provider,
        usedFallback: insight.usedFallback,
        model,
        fallbackReason,
        generatedAt: insight.generatedAt,
      },
      insight: {
        headline: insight.headline,
        summary: insight.summary,
        riskLevel: insight.riskLevel,
        keyFindings: insight.keyFindings,
        recommendedActions: insight.recommendedActions,
        riskDrivers: insight.riskDrivers,
        reviewChecklist: insight.reviewChecklist,
        disputePreventionNote: insight.disputePreventionNote,
        tenantExplanationDraft: insight.tenantExplanationDraft,
        confidence: insight.confidence,
        disclaimer:
          "This AI review is advisory only. Deterministic billing rules control validation, amounts, and sending.",
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomHistory = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { utilityType, roomId } = req.params;

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isOwner && room.branch !== admin.branch) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all active and past occupancy records for this room.
    // Include 'reserved' so tenants who physically moved in but whose reservation
    // status has not yet been transitioned to 'moveIn' still appear in the timeline.
    const ROOM_HISTORY_STATUS_QUERY = reservationStatusesForQuery(
      "reserved",
      "moveIn",
      "moveOut",
    );
    const [reservations, bedHistoryRecords] = await Promise.all([
      Reservation.find({
        roomId: room._id,
        status: { $in: ROOM_HISTORY_STATUS_QUERY },
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName email")
        .sort({ moveInDate: -1 })
        .lean(),
      BedHistory.find({
        roomId: room._id,
      })
        .populate("tenantId", "firstName lastName email")
        .sort({ moveInDate: -1 })
        .lean(),
    ]);

    // Get all move-in / move-out meter readings for this room
    const readings = await UtilityReading.find({
      roomId: room._id,
      utilityType,
      eventType: { $in: utilityEventTypesForQuery("moveIn", "moveOut") },
      isArchived: false,
    }).lean();

    // Index readings by tenantId + eventType for fast lookup
    const readingMap = {};
    for (const r of readings) {
      const key = `${r.tenantId}_${normalizeUtilityEventType(r.eventType)}`;
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
    const historyBySourceKey = new Map();

    const addHistoryEntry = (entry) => {
      const sourceKey = [
        entry.tenantId || entry.id || entry.tenantName || "unknown",
        entry.bedId || entry.bedName || "bed",
        entry.moveInDate ? new Date(entry.moveInDate).toISOString() : "no-move-in",
        entry.moveOutDate ? new Date(entry.moveOutDate).toISOString() : "active",
      ].join(":");

      if (!historyBySourceKey.has(sourceKey)) {
        historyBySourceKey.set(sourceKey, entry);
        return;
      }

      const existing = historyBySourceKey.get(sourceKey);
      historyBySourceKey.set(sourceKey, {
        ...existing,
        ...entry,
        moveInReading: existing.moveInReading || entry.moveInReading,
        moveOutReading: existing.moveOutReading || entry.moveOutReading,
      });
    };

    reservations.forEach((res) => {
      const tenant = resolveReferencedUser(res.userId, {
        unknownLabel: UNKNOWN_TENANT_LABEL,
      });
      const tenantId = tenant.id;
      const moveInReading = tenantId ? readingMap[`${tenantId}_moveIn`] : null;
      const moveOutReading = tenantId
        ? readingMap[`${tenantId}_moveOut`]
        : null;

      // Only surface a move-in date on the billing timeline when the tenant has
      // actually moved in (status = moveIn / moveOut) or an admin has explicitly
      // confirmed the date via confirmedMoveInDate.
      //
      // For "reserved" reservations, res.moveInDate is the tenant's *intended*
      // future date captured during booking — NOT a real occupancy event. Emitting
      // it would create a spurious future "Move In" event in the billing timeline.
      const hasActuallyMovedIn =
        hasReservationStatus(res.status, "moveIn", "moveOut") ||
        Boolean(res.confirmedMoveInDate);
      const moveInDateRaw = hasActuallyMovedIn ? readMoveInDate(res) : null;
      const moveIn = moveInDateRaw ? new Date(moveInDateRaw) : null;
      const moveOut = readMoveOutDate(res)
        ? new Date(readMoveOutDate(res))
        : null;
      const endDate = moveOut || now;
      const durationDays = moveIn
        ? Math.max(1, Math.ceil((endDate - moveIn) / 86_400_000))
        : 0;

      // Resolve bed name: try room.beds lookup first, fall back to reservation position
      const bedId = res.selectedBed?.id;
      const bedName =
        (bedId && bedLabelMap[bedId]) || res.selectedBed?.position || "—";

      addHistoryEntry({
        id: res._id,
        tenantName: tenant.name,
        tenantEmail: tenant.email || res.billingEmail || null,
        tenantId: tenantId || null,
        bedName,
        bedId: bedId || null,
        moveInDate: moveIn,
        moveOutDate: moveOut || null,
        isActive: hasReservationStatus(res.status, "moveIn", "reserved"),
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
      });
    });

    bedHistoryRecords.forEach((record) => {
      const tenant = resolveReferencedUser(record.tenantId, {
        unknownLabel: UNKNOWN_TENANT_LABEL,
      });
      const tenantId = tenant.id;
      const moveInReading = tenantId ? readingMap[`${tenantId}_moveIn`] : null;
      const moveOutReading = tenantId
        ? readingMap[`${tenantId}_moveOut`]
        : null;
      const moveIn = record.moveInDate ? new Date(record.moveInDate) : null;
      const moveOut = record.moveOutDate ? new Date(record.moveOutDate) : null;
      const endDate = moveOut || now;
      const durationDays = moveIn
        ? Math.max(1, Math.ceil((endDate - moveIn) / 86_400_000))
        : 0;
      const bedId = record.bedId || null;
      const bedName = (bedId && bedLabelMap[bedId]) || bedId || "-";

      addHistoryEntry({
        id: record.reservationId || record._id,
        tenantName: tenant.name,
        tenantEmail: tenant.email || null,
        tenantId: tenantId || null,
        bedName,
        bedId,
        moveInDate: moveIn,
        moveOutDate: moveOut,
        isActive: !moveOut && record.status === "active",
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
      });
    });

    const history = [...historyBySourceKey.values()].sort((left, right) => {
      const leftDate = left.moveInDate ? new Date(left.moveInDate).getTime() : 0;
      const rightDate = right.moveInDate ? new Date(right.moveInDate).getTime() : 0;
      return rightDate - leftDate;
    });

    res.json({ history, roomName: room.name || room.roomNumber });
  } catch (error) {
    next(error);
  }
};

async function correctWaterObservation(req, res, next, original, admin) {
  const session = await mongoose.startSession();
  try {
    if (!String(req.body.correctionReason || '').trim()) throw Object.assign(new Error('A correction reason is required.'),{statusCode:400});
    if (req.body.date && new Date(req.body.date).getTime() !== original.date.getTime()) throw Object.assign(new Error('An occupancy observation timestamp cannot be moved by a reading correction.'),{statusCode:422});
    const value = parsePhysicalMeterReading(req.body.reading,{fieldLabel:'Corrected water reading'});
    let replacement;
    await session.withTransaction(async () => {
      await Room.updateOne({_id:original.roomId},{$inc:{waterObservationRevision:1}},{session});
      const current = await UtilityReading.findById(original._id).session(session);
      if (!current || current.supersededByReadingId || ['voided','corrected'].includes(current.readingStatus)) throw Object.assign(new Error('This observation has already been superseded.'),{statusCode:409});
      // A period boundary and an occupancy event may describe the same physical
      // instant. Supersede that entire instant together, preserving each event.
      const valid = {roomId:current.roomId,utilityType:'water',isArchived:false,readingStatus:{$nin:['voided','corrected']}};
      const group = await UtilityReading.find({...valid,date:current.date}).session(session);
      await assertWaterChronology({roomId:current.roomId,date:current.date,reading:value,eventType:current.eventType,meterReset:current.meterReset,session,excludeIds:group.map(r=>r._id)});
      const linkedPeriods=await UtilityPeriod.find({_id:{$in:group.map(r=>r.utilityPeriodId).filter(Boolean)}}).session(session);
      for (const period of linkedPeriods) {
        await assertUtilityPeriodNotSent(period,'water');
        if (!period.isArchived && period.status !== 'open') throw Object.assign(new Error('Archive the unpublished cycle before correcting its observations. Issued cycles are immutable.'),{statusCode:409});
        if (!period.isArchived && current.date.getTime() === period.startDate.getTime()) {
          period.startReading=value; await period.save({session});
        }
      }
      for (const observation of group) {
        const data=observation.toObject(); delete data._id; delete data.createdAt; delete data.updatedAt;
        const [corrected]=await UtilityReading.create([{...data,reading:value,recordedBy:admin._id,
          supersedesReadingId:observation._id,correctionReason:req.body.correctionReason,source:'correction',readingStatus:'locked'}],{session});
        observation.readingStatus='corrected'; observation.supersededByReadingId=corrected._id;
        observation.correctedBy=admin._id;observation.correctedAt=new Date();observation.correctionReason=req.body.correctionReason;
        await observation.save({session});
        if (String(observation._id)===String(current._id)) replacement=corrected;
      }
    });
    res.json({success:true,reading:serializeUtilityReading(replacement)});
  } catch(error) {next(error);} finally {await session.endSession();}
}

export const previewWaterBilling = async (req,res,next) => {
  try {
    const admin=await getAdminInfo(req);
    const room=await Room.findById(req.body.roomId);
    if (!room) return res.status(404).json({error:'Room not found'});
    if (!admin.isOwner && room.branch !== admin.branch) return res.status(403).json({error:'Access denied'});
    if (!branchSupportsSeparateUtilityBilling(room.branch,'water')) return res.status(422).json({error:'This branch is excluded from separate water billing.'});
    assertUtilityRoomEligibility(room,'water');
    const active = req.body.periodId ? await UtilityPeriod.findById(req.body.periodId).lean() : null;
    if (req.body.periodId && !active) throw Object.assign(new Error('Water cycle not found.'),{statusCode:404});
    if (active && (String(active.roomId)!==String(room._id) || active.calculationVersion!=='water-meter-v1')) throw Object.assign(new Error('Select a measured water cycle for this room.'),{statusCode:422});
    const end=parseUtilityCycleDate(req.body.endDate);
    const evidence=await resolveUtilityOpening({roomId:room._id,utilityType:'water',startDate:req.body.startDate || active?.startDate,startReading:req.body.startReading,period:active});
    const start=evidence.date;
    if (active) await assertUtilityOpeningChange({period:active,evidence});
    await assertUtilityCycleRange({roomId:room._id,utilityType:'water',startDate:start,endDate:end,periodId:active?._id});
    const closing=parsePhysicalMeterReading(req.body.endReading,{fieldLabel:'Closing water reading'});
    const period={calculationVersion:'water-meter-v1',startDate:start,ratePerUnit:active?.ratePerUnit ?? req.body.ratePerUnit,pricingSnapshot:active?.pricingSnapshot};
    const result=await calculateCanonicalWaterPeriod({room,period,endDate:end,endReading:closing});
    res.json({success:true,data:result,result});
  } catch(error) {next(error);}
};
