import mongoose from "mongoose";
import { assertElectricityChronology } from './electricityChronology.js';
import {
  BedHistory,
  Reservation,
  Room,
  UtilityPeriod,
  UtilityReading,
} from "../../models/index.js";
import {
  getDefaultElectricityRatePerKwh,
  getDefaultWaterRatePerUnit,
} from "../../utils/businessSettings.js";
import {
  assertPhysicalMeterContinuity,
  parsePhysicalMeterReading,
} from "../../utils/physicalMeterReading.js";
import {
  createOpenUtilityPeriodWithBoundary,
  resolveUtilityPeriodState,
  UTILITY_PERIOD_START_MODE,
  UTILITY_PERIOD_STATE,
} from "./utilityPeriodLifecycleService.js";

const ACTIVE_INDEX_NAME = "unique_lifecycle_active_utility_period";
const RESET_EVENTS = new Set(["meterReplacement", "meterRollover"]);
const REAL_OCCUPANCY_STATUS_QUERY = Object.freeze([
  "moveIn",
  "moveOut",
  "movein",
  "move_in",
  "moved_in",
  "moveout",
  "move_out",
  "moved_out",
]);

const withSession = (query, session) => (session ? query.session(session) : query);

function boundaryError(message, code, periodState, details = {}) {
  return Object.assign(new Error(message), {
    statusCode: 409,
    code,
    manualReviewRequired: true,
    details: { periodState, ...details },
  });
}

export async function inspectUtilityLifecycleActiveIndex() {
  let indexes = [];
  try {
    indexes = await UtilityPeriod.collection.indexes();
  } catch (error) {
    if (error?.codeName !== "NamespaceNotFound") throw error;
  }
  const index = indexes.find((entry) => entry.name === ACTIVE_INDEX_NAME) || null;
  const ready = Boolean(
    index?.unique === true &&
      index?.key?.utilityType === 1 &&
      index?.key?.roomId === 1 &&
      index?.partialFilterExpression?.isArchived === false &&
      Array.isArray(index?.partialFilterExpression?.status?.$in) &&
      ["open", "manual_review_required"].every((status) =>
        index.partialFilterExpression.status.$in.includes(status),
      ),
  );
  return { ready, indexName: ACTIVE_INDEX_NAME, index };
}

export async function assertUtilityLifecycleActiveIndexReady() {
  const result = await inspectUtilityLifecycleActiveIndex();
  if (!result.ready) {
    throw boundaryError(
      "Automatic utility initialization is temporarily unavailable until the active-period safety index is installed and verified.",
      "UTILITY_AUTO_INITIALIZATION_INDEX_REQUIRED",
      UTILITY_PERIOD_STATE.MISSING,
      { requiredIndex: ACTIVE_INDEX_NAME },
    );
  }
  return result;
}

export async function inspectUtilityRoomInitializationEvidence({
  roomId,
  utilityType = "electricity",
  session = null,
} = {}) {
  const periodFilter = { roomId, utilityType };
  const readingFilter = { roomId, utilityType };
  const legacyFilter = { roomId };
  const nativeOptions = session ? { session } : {};
  const legacyBillingPeriods = mongoose.connection.collection("billingperiods");
  const legacyMeterReadings = mongoose.connection.collection("meterreadings");
  const [periodCount, readingCount, legacyPeriodCount, legacyReadingCount] =
    await Promise.all([
      withSession(UtilityPeriod.countDocuments(periodFilter), session),
      withSession(UtilityReading.countDocuments(readingFilter), session),
      legacyBillingPeriods.countDocuments(legacyFilter, nativeOptions),
      legacyMeterReadings.countDocuments(legacyFilter, nativeOptions),
    ]);

  const reasons = [];
  if (periodCount > 0) reasons.push("UTILITY_PERIOD_HISTORY_EXISTS");
  if (readingCount > 0) reasons.push("UTILITY_READING_HISTORY_EXISTS");
  if (legacyPeriodCount > 0) reasons.push("LEGACY_BILLING_PERIOD_EXISTS");
  if (legacyReadingCount > 0) reasons.push("LEGACY_METER_READING_EXISTS");

  return {
    neverInitialized: reasons.length === 0,
    reasons,
    counts: { periodCount, readingCount, legacyPeriodCount, legacyReadingCount },
  };
}

export async function isUtilityRoomNeverInitialized(options = {}) {
  return (await inspectUtilityRoomInitializationEvidence(options)).neverInitialized;
}

const asTime = (value) => {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const readReservationMoveIn = (reservation) =>
  reservation?.confirmedMoveInDate ??
  reservation?.moveInDate ??
  reservation?.intendedMoveInDate ??
  reservation?.targetMoveInDate ??
  null;

const intervalsOverlap = (start, end, intervalStart, intervalEnd) => {
  const normalizedStart = asTime(start);
  const normalizedEnd = asTime(end);
  return Boolean(
    normalizedStart &&
      normalizedStart < intervalEnd &&
      (!normalizedEnd || normalizedEnd > intervalStart),
  );
};

/**
 * Proves that a CLOSED_ONLY room can be initialized from a real move-in
 * observation without hiding tenant consumption. This is deliberately
 * stricter than the manual recovery command: any unresolved or ambiguous
 * evidence fails closed and must go through Billing review.
 */
export async function inspectClosedOnlyVacantContinuity({
  roomId,
  utilityType = "electricity",
  eventAt,
  incomingReservationId = null,
  session = null,
} = {}) {
  const observationAt = asTime(eventAt);
  if (!observationAt) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_EVENT_TIME_INVALID" };
  }

  const queryWithSession = (query) => withSession(query, session);
  const nativeOptions = session ? { session } : {};
  const historicalGaps = mongoose.connection.collection("utilityhistoricalgaps");
  const staysCollection = mongoose.connection.collection("stays");
  const [periods, archivedReadingCount, unresolvedGapCount, roomHistory, reservations, stays] =
    await Promise.all([
      queryWithSession(
        UtilityPeriod.find({ roomId, utilityType })
          .sort({ startDate: 1, createdAt: 1 })
          .lean(),
      ),
      queryWithSession(
        UtilityReading.countDocuments({ roomId, utilityType, isArchived: true }),
      ),
      historicalGaps.countDocuments({
          roomId,
          utilityType,
          $or: [{ isArchived: true }, { reviewState: "PENDING" }],
        }, nativeOptions),
      queryWithSession(BedHistory.find({ roomId, tenantId: { $ne: null } }).lean()),
      queryWithSession(
        Reservation.find({
          roomId,
          status: { $in: REAL_OCCUPANCY_STATUS_QUERY },
          isArchived: { $ne: true },
          ...(incomingReservationId ? { _id: { $ne: incomingReservationId } } : {}),
        }).lean(),
      ),
      staysCollection.find({ roomId }, nativeOptions).toArray(),
    ]);

  if (periods.some((period) => period.isArchived === true) || archivedReadingCount > 0) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_ARCHIVED_HISTORY" };
  }
  if (unresolvedGapCount > 0) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_UNRESOLVED_HISTORY" };
  }

  const legitimate = periods.filter((period) => period.isArchived !== true);
  if (!legitimate.length || legitimate.some((period) => !["closed", "revised"].includes(period.status))) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_PERIOD_HISTORY_INVALID" };
  }

  for (let index = 0; index < legitimate.length; index += 1) {
    const period = legitimate[index];
    const start = asTime(period.startDate);
    const end = asTime(period.endDate);
    if (
      !start ||
      !end ||
      end <= start ||
      !Number.isFinite(Number(period.startReading)) ||
      !Number.isFinite(Number(period.endReading)) ||
      Number(period.endReading) < 0 ||
      period.manualReviewReason ||
      (period.manualReview && !period.manualReview?.resolution?.outcome)
    ) {
      return { eligible: false, code: "UTILITY_CLOSED_ONLY_PERIOD_HISTORY_INVALID" };
    }
    if (index > 0) {
      const previousEnd = asTime(legitimate[index - 1].endDate);
      if (!previousEnd || start < previousEnd) {
        return { eligible: false, code: "UTILITY_CLOSED_ONLY_PERIOD_HISTORY_AMBIGUOUS" };
      }
    }
  }

  const latest = [...legitimate].sort(
    (left, right) =>
      new Date(right.endDate).getTime() - new Date(left.endDate).getTime() ||
      new Date(right.startDate).getTime() - new Date(left.startDate).getTime(),
  )[0];
  const closedAt = asTime(latest.endDate);
  if (!closedAt || closedAt > observationAt) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_CLOSE_TIME_INVALID" };
  }

  const [closingBoundaries, unexplainedReadings] = await Promise.all([
    queryWithSession(
      UtilityReading.find({
        roomId,
        utilityType,
        utilityPeriodId: latest._id,
        eventType: "periodEnd",
        date: closedAt,
        readingStatus: "locked",
        isArchived: false,
      }).lean(),
    ),
    queryWithSession(
      UtilityReading.find({
        roomId,
        utilityType,
        isArchived: false,
        readingStatus: { $ne: "voided" },
        date: { $gt: closedAt, $lte: observationAt },
      }).lean(),
    ),
  ]);
  if (
    closingBoundaries.length !== 1 ||
    Number(closingBoundaries[0].reading) !== Number(latest.endReading)
  ) {
    return { eligible: false, code: "UTILITY_CLOSED_ONLY_CLOSING_BOUNDARY_INVALID" };
  }
  if (unexplainedReadings.length > 0) {
    return {
      eligible: false,
      code: "UTILITY_CLOSED_ONLY_ORPHAN_READING_AFTER_CLOSE",
      readingIds: unexplainedReadings.map((reading) => String(reading._id)),
    };
  }

  const occupantHistory = roomHistory.filter((history) =>
    intervalsOverlap(
      history.effectiveStartDate || history.moveInDate,
      history.effectiveEndDate || history.moveOutDate,
      closedAt,
      observationAt,
    ),
  );
  const occupantReservations = reservations.filter((reservation) =>
    intervalsOverlap(
      readReservationMoveIn(reservation),
      reservation.moveOutDate ?? null,
      closedAt,
      observationAt,
    ),
  );
  const occupantStays = stays.filter((stay) =>
    intervalsOverlap(
      stay.leaseStartDate,
      stay.endedAt || (stay.status === "active" || stay.status === "ending_soon" ? null : stay.leaseEndDate),
      closedAt,
      observationAt,
    ),
  );
  if (occupantHistory.length || occupantReservations.length || occupantStays.length) {
    return {
      eligible: false,
      code: "UTILITY_CLOSED_ONLY_OCCUPANT_DURING_GAP",
      occupantReservationIds: [
        ...new Set([
          ...occupantHistory.map((entry) => String(entry.reservationId || "")).filter(Boolean),
          ...occupantReservations.map((entry) => String(entry._id)),
          ...occupantStays.map((entry) => String(entry.reservationId || "")).filter(Boolean),
        ]),
      ],
    };
  }

  return {
    eligible: true,
    latestPeriod: latest,
    intervalStart: closedAt,
    intervalEnd: observationAt,
    closingReading: Number(latest.endReading),
  };
}

export async function resolveCurrentUtilityRate({ utilityType = "electricity" } = {}) {
  const rate = utilityType === "electricity"
    ? await getDefaultElectricityRatePerKwh()
    : await getDefaultWaterRatePerUnit();
  const parsed = Number(rate);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw boundaryError(
      "The current utility rate could not be determined. Configure the billing rate before continuing.",
      "UTILITY_RATE_UNAVAILABLE",
      null,
    );
  }
  return parsed;
}

function lifecycleBlocker(resolution, roomLabel = "this room") {
  const messages = {
    [UTILITY_PERIOD_STATE.CLOSED_ONLY]:
      "This room has previous billing history but no valid active period. Review or initialize continuity before continuing.",
    [UTILITY_PERIOD_STATE.MANUAL_REVIEW_REQUIRED]:
      "Electricity billing for this room requires review before this action can continue.",
    [UTILITY_PERIOD_STATE.AMBIGUOUS]:
      "Multiple active electricity periods were found. Resolve the billing conflict first.",
    [UTILITY_PERIOD_STATE.OUTSIDE_PERIOD]:
      "The utility period does not contain the requested occupancy time. Review period continuity first.",
    [UTILITY_PERIOD_STATE.MISSING]:
      "No active electricity period exists for this room.",
  };
  return boundaryError(
    messages[resolution.state] || `Electricity billing for ${roomLabel} is not ready.`,
    `ROOM_UTILITY_BOUNDARY_${resolution.state || "INVALID"}`,
    resolution.state,
    { activePeriodCount: resolution.activeCount ?? 0 },
  );
}

async function latestUsableReading({ roomId, utilityType, eventAt, session }) {
  let query = UtilityReading.findOne({
    roomId,
    utilityType,
    isArchived: false,
    ...(utilityType === 'electricity' ? {readingStatus:{$nin:['voided','corrected']},supersededByReadingId:null} : {readingStatus:{$ne:'voided'}}),
    date: { $lte: eventAt },
  }).sort({ date: -1, createdAt: -1 });
  query = withSession(query, session);
  return query.lean();
}

async function findIdempotentBoundary({
  roomId,
  utilityType,
  eventAt,
  eventType,
  tenantId,
  session,
}) {
  let query = UtilityReading.findOne({
    roomId,
    utilityType,
    eventType,
    tenantId: tenantId || null,
    date: eventAt,
    isArchived: false,
    ...(utilityType === 'electricity' ? {readingStatus:{$nin:['voided','corrected']},supersededByReadingId:null} : {}),
  });
  query = withSession(query, session);
  return query;
}

export async function resolveRoomUtilityBoundaryContext({
  room: suppliedRoom = null,
  roomId,
  utilityType = "electricity",
  eventAt,
  reading,
  eventType,
  reservationId = null,
  tenantId = null,
  actorId,
  allowInitialize = false,
  ratePerUnit = null,
  meterReset = null,
  session = null,
} = {}) {
  if ((allowInitialize || utilityType === 'electricity') && !session) {
    const ownedSession = await mongoose.startSession();
    let result;
    try {
      await ownedSession.withTransaction(async () => {
        result = await resolveRoomUtilityBoundaryContext({
          room: suppliedRoom,
          roomId,
          utilityType,
          eventAt,
          reading,
          eventType,
          reservationId,
          tenantId,
          actorId,
          allowInitialize,
          ratePerUnit,
          meterReset,
          session: ownedSession,
        });
      });
      return result;
    } finally {
      await ownedSession.endSession();
    }
  }

  const timestamp = new Date(eventAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw Object.assign(new Error("A valid utility boundary timestamp is required."), {
      statusCode: 400,
      code: "UTILITY_BOUNDARY_TIME_INVALID",
    });
  }
  if (!actorId) {
    throw Object.assign(new Error("An authenticated actor is required."), {
      statusCode: 401,
      code: "UTILITY_BOUNDARY_ACTOR_REQUIRED",
    });
  }

  const parsedReading = parsePhysicalMeterReading(reading, {
    fieldLabel: "Physical meter reading",
    maximum: 999999.99,
  });
  const room = suppliedRoom || (await withSession(Room.findById(roomId), session));
  if (!room) {
    throw Object.assign(new Error("Room not found."), {
      statusCode: 404,
      code: "ROOM_NOT_FOUND",
    });
  }
  const canonicalRoomId = room._id;

  const existingBoundary = await findIdempotentBoundary({
    roomId: canonicalRoomId,
    utilityType,
    eventAt: timestamp,
    eventType,
    tenantId,
    session,
  });
  if (existingBoundary) {
    if (!existingBoundary.utilityPeriodId) {
      throw boundaryError(
        "A matching legacy utility reading exists without a canonical period link. Review continuity before continuing.",
        "UTILITY_BOUNDARY_ORPHAN_REVIEW_REQUIRED",
        null,
        { readingId: String(existingBoundary._id) },
      );
    }
    if (Number(existingBoundary.reading) !== parsedReading) {
      throw boundaryError(
        "A different physical reading already exists for this occupancy boundary.",
        "UTILITY_BOUNDARY_RETRY_MISMATCH",
        null,
        { readingId: String(existingBoundary._id) },
      );
    }
    if (
      RESET_EVENTS.has(eventType) &&
      Number(existingBoundary.meterReset?.oldMeterFinalReading) !==
        Number(meterReset?.oldMeterFinalReading)
    ) {
      throw boundaryError(
        "A different old-meter final reading already exists for this reset boundary.",
        "UTILITY_BOUNDARY_RETRY_MISMATCH",
        null,
        { readingId: String(existingBoundary._id) },
      );
    }
    if (RESET_EVENTS.has(eventType)) {
      const storedEvidence = (existingBoundary.meterReset?.evidenceReferences || [])
        .map((reference) => String(reference || "").trim())
        .filter(Boolean)
        .sort();
      const retryEvidence = (meterReset?.evidenceReferences || [])
        .map((reference) => String(reference || "").trim())
        .filter(Boolean)
        .sort();
      if (JSON.stringify(storedEvidence) !== JSON.stringify(retryEvidence)) {
        throw boundaryError(
          "Different evidence was supplied for an existing meter-reset boundary.",
          "UTILITY_BOUNDARY_RETRY_MISMATCH",
          null,
          { readingId: String(existingBoundary._id) },
        );
      }
    }
    return {
      room,
      period: existingBoundary.utilityPeriodId
        ? await withSession(UtilityPeriod.findById(existingBoundary.utilityPeriodId), session)
        : null,
      boundary: existingBoundary,
      initialized: false,
      idempotent: true,
    };
  }

  let resolution = await resolveUtilityPeriodState({
    roomId: canonicalRoomId,
    utilityType,
    cutoverAt: timestamp,
    session,
  });
  let period = resolution.period || null;
  let initialized = false;
  let vacancyGap = null;

  if (
    allowInitialize &&
    [UTILITY_PERIOD_STATE.MISSING, UTILITY_PERIOD_STATE.CLOSED_ONLY].includes(resolution.state)
  ) {
    if (eventType !== "moveIn") throw lifecycleBlocker(resolution);
    let closedContinuity = null;
    if (resolution.state === UTILITY_PERIOD_STATE.MISSING) {
      const evidence = await inspectUtilityRoomInitializationEvidence({
        roomId: canonicalRoomId,
        utilityType,
        session,
      });
      if (!evidence.neverInitialized) {
        throw boundaryError(
          "This room has prior utility evidence and cannot be initialized automatically. Review its billing continuity first.",
          "UTILITY_ROOM_NOT_NEVER_INITIALIZED",
          resolution.state,
          { evidence },
        );
      }
    } else {
      closedContinuity = await inspectClosedOnlyVacantContinuity({
        roomId: canonicalRoomId,
        utilityType,
        eventAt: timestamp,
        incomingReservationId: reservationId,
        session,
      });
      if (!closedContinuity.eligible) {
        throw boundaryError(
          "This room's closed utility history cannot prove a fully vacant gap. Review billing continuity before move-in.",
          closedContinuity.code || "UTILITY_CLOSED_ONLY_NOT_SAFE_TO_INITIALIZE",
          resolution.state,
          { continuity: closedContinuity },
        );
      }
      assertPhysicalMeterContinuity({
        reading: parsedReading,
        previousReading: closedContinuity.closingReading,
        eventType: "periodStart",
        fieldLabel: "Physical meter reading",
      });
    }
    await assertUtilityLifecycleActiveIndexReady();
    const resolvedRate = ratePerUnit == null
      ? await resolveCurrentUtilityRate({ utilityType })
      : Number(ratePerUnit);
    if (!Number.isFinite(resolvedRate) || resolvedRate < 0) {
      throw boundaryError(
        "The current utility rate could not be determined. Configure the billing rate before continuing.",
        "UTILITY_RATE_UNAVAILABLE",
        resolution.state,
      );
    }
    period = await createOpenUtilityPeriodWithBoundary({
      utilityType,
      room,
      startDate: timestamp,
      startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
      startReading: parsedReading,
      ratePerUnit: resolvedRate,
      actorId,
      session,
    });
    if (closedContinuity) {
      const consumed = Math.round(
        (parsedReading - Number(closedContinuity.closingReading)) * 100,
      ) / 100;
      if (consumed > 0) {
        // A vacant gap has no period of its own, so its overhead is valued at
        // the configured rate effective when this next period initializes.
        vacancyGap = {
          segmentIndex: -1,
          periodLabel: "Vacant gap before current period",
          startDate: closedContinuity.intervalStart,
          endDate: closedContinuity.intervalEnd,
          readingFrom: Number(closedContinuity.closingReading),
          readingTo: parsedReading,
          kwhConsumed: consumed,
          cost: Math.round(consumed * resolvedRate * 100) / 100,
          reason: "VACANT_GAP_BEFORE_PERIOD",
        };
        period.overheadSegments = [vacancyGap];
        await period.save(session ? { session } : undefined);
      }
    }
    initialized = true;
    resolution = { state: UTILITY_PERIOD_STATE.OPEN, period };
  }

  if (resolution.state !== UTILITY_PERIOD_STATE.OPEN || !period) {
    throw lifecycleBlocker(resolution);
  }

  const previous = await latestUsableReading({
    roomId: canonicalRoomId,
    utilityType,
    eventAt: timestamp,
    session,
  });
  let resetEvidenceReferences = [];
  if (RESET_EVENTS.has(eventType)) {
    resetEvidenceReferences = Array.isArray(meterReset?.evidenceReferences)
      ? meterReset.evidenceReferences
          .map((reference) => String(reference || "").trim())
          .filter(Boolean)
      : [];
    if (resetEvidenceReferences.length === 0) {
      throw boundaryError(
        "Meter replacement or rollover requires at least one evidence reference.",
        "METER_RESET_EVIDENCE_REQUIRED",
        resolution.state,
      );
    }
    const oldMeterFinalReading = parsePhysicalMeterReading(
      meterReset?.oldMeterFinalReading,
      { fieldLabel: "Old meter final reading", maximum: 999999.99 },
    );
    if (utilityType !== 'electricity') assertPhysicalMeterContinuity({
      reading: oldMeterFinalReading,
      previousReading: previous?.reading,
      eventType: "periodEnd",
      fieldLabel: "Old meter final reading",
    });
  } else if (utilityType !== 'electricity') {
    assertPhysicalMeterContinuity({
      reading: parsedReading,
      previousReading: previous?.reading,
      eventType,
      fieldLabel: "Physical meter reading",
    });
  }

  if (utilityType === 'electricity') await assertElectricityChronology({roomId:canonicalRoomId,date:timestamp,reading:parsedReading,eventType,meterReset,session});
  const [boundary] = await UtilityReading.create(
    [
      {
        utilityType,
        roomId: canonicalRoomId,
        branch: room.branch,
        reading: parsedReading,
        date: timestamp,
        eventType,
        tenantId: tenantId || null,
        recordedBy: actorId,
        utilityPeriodId: period._id,
        readingStatus: "recorded",
        meterReset: RESET_EVENTS.has(eventType)
          ? {
              oldMeterFinalReading: Number(meterReset.oldMeterFinalReading),
              evidenceReferences: resetEvidenceReferences,
            }
          : undefined,
      },
    ],
    session ? { session } : {},
  );

  return {
    room,
    period,
    boundary,
    initialized,
    vacancyGap,
    idempotent: false,
    reservationId,
  };
}
