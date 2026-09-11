import { assertWaterChronology } from './waterChronology.js';
import { assertElectricityChronology } from './electricityChronology.js';
import mongoose from "mongoose";
import { UtilityPeriod, UtilityReading } from "../../models/index.js";
import { toManilaStartOfDay } from "../../utils/dateUtils.js";
import { parsePhysicalMeterReading } from "../../utils/physicalMeterReading.js";

export const UTILITY_PERIOD_STATE = Object.freeze({
  OPEN: "OPEN",
  MANUAL_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED",
  MISSING: "MISSING",
  CLOSED_ONLY: "CLOSED_ONLY",
  AMBIGUOUS: "AMBIGUOUS",
  OUTSIDE_PERIOD: "OUTSIDE_PERIOD",
});

export const LIFECYCLE_ACTIVE_UTILITY_STATUSES = Object.freeze([
  "open",
  "manual_review_required",
]);

export const UTILITY_PERIOD_START_MODE = Object.freeze({
  BUSINESS_DATE: "BUSINESS_DATE",
  EXACT_OBSERVATION: "EXACT_OBSERVATION",
});

const withSession = (query, session) => (session ? query.session(session) : query);

function containsManilaDay(period, dateLike) {
  if (!dateLike) return true;
  const requested = toManilaStartOfDay(dateLike);
  const start = toManilaStartOfDay(period?.startDate);
  const end = period?.endDate ? toManilaStartOfDay(period.endDate) : null;
  if (!requested || !start) return false;
  // Utility periods are half-open calendar intervals: [start, end). This makes
  // a shared previous-end/next-start boundary select the next period exactly.
  return !requested.isBefore(start) && (!end || requested.isBefore(end));
}

export function normalizeUtilityPeriodStart({ startDate, startMode = UTILITY_PERIOD_START_MODE.BUSINESS_DATE } = {}) {
  if (!Object.values(UTILITY_PERIOD_START_MODE).includes(startMode)) {
    throw Object.assign(new Error("Unsupported utility-period start mode."), {
      statusCode: 400,
      code: "UTILITY_PERIOD_START_MODE_INVALID",
    });
  }
  if (startMode === UTILITY_PERIOD_START_MODE.BUSINESS_DATE) {
    const start = toManilaStartOfDay(startDate);
    if (!start?.isValid?.()) throw new Error("A valid utility-period business date is required.");
    return start.toDate();
  }
  const exact = new Date(startDate);
  if (Number.isNaN(exact.getTime())) throw new Error("A valid exact observation timestamp is required.");
  return exact;
}

export function utilityPeriodContainsCutover(period, { cutoverAt = null, cutoverDate = null } = {}) {
  if (cutoverAt != null) {
    const requested = new Date(cutoverAt);
    const start = new Date(period?.startDate);
    const end = period?.endDate ? new Date(period.endDate) : null;
    if ([requested, start, ...(end ? [end] : [])].some((value) => Number.isNaN(value.getTime()))) return false;
    // Exact, half-open instant interval: [startInstant, endInstant).
    return requested >= start && (!end || requested < end);
  }
  return containsManilaDay(period, cutoverDate);
}

export function classifyUtilityPeriodDocuments(periods = [], { cutoverAt = null, cutoverDate = null } = {}) {
  const activePeriods = periods
    .filter((period) =>
      period &&
      period.isArchived !== true &&
      LIFECYCLE_ACTIVE_UTILITY_STATUSES.includes(period.status),
    )
    .sort((left, right) => new Date(right.startDate || 0) - new Date(left.startDate || 0));
  if (activePeriods.length > 1) {
    return { state: UTILITY_PERIOD_STATE.AMBIGUOUS, period: null, candidates: activePeriods, activeCount: activePeriods.length };
  }
  if (activePeriods.length === 1) {
    const period = activePeriods[0];
    if ((cutoverAt || cutoverDate) && !utilityPeriodContainsCutover(period, { cutoverAt, cutoverDate })) {
      return { state: UTILITY_PERIOD_STATE.OUTSIDE_PERIOD, period, candidates: activePeriods, activeCount: 1 };
    }
    if (period.status === "manual_review_required") {
      return { state: UTILITY_PERIOD_STATE.MANUAL_REVIEW_REQUIRED, period, candidates: activePeriods, activeCount: 1 };
    }
    return { state: UTILITY_PERIOD_STATE.OPEN, period, candidates: activePeriods, activeCount: 1 };
  }
  const historical = periods
    .filter((period) => period && period.isArchived !== true)
    .sort((left, right) => new Date(right.startDate || 0) - new Date(left.startDate || 0));
  return {
    state: historical.length ? UTILITY_PERIOD_STATE.CLOSED_ONLY : UTILITY_PERIOD_STATE.MISSING,
    period: null,
    latestPeriod: historical[0] || null,
    candidates: [],
    activeCount: 0,
  };
}

export async function resolveUtilityPeriodState({
  utilityType,
  roomId,
  cutoverAt = null,
  cutoverDate = null,
  session = null,
} = {}) {
  let activeQuery = UtilityPeriod.find({
    utilityType,
    roomId,
    status: { $in: [...LIFECYCLE_ACTIVE_UTILITY_STATUSES] },
    isArchived: false,
  }).sort({ startDate: -1, createdAt: -1 });
  activeQuery = withSession(activeQuery, session);
  const activePeriods = await activeQuery.lean();

  if (activePeriods.length) return classifyUtilityPeriodDocuments(activePeriods, { cutoverAt, cutoverDate });

  let latestQuery = UtilityPeriod.findOne({
    utilityType,
    roomId,
    isArchived: false,
  }).sort({ startDate: -1, createdAt: -1 });
  latestQuery = withSession(latestQuery, session);
  const latestPeriod = await latestQuery.lean();
  return {
    state: latestPeriod
      ? UTILITY_PERIOD_STATE.CLOSED_ONLY
      : UTILITY_PERIOD_STATE.MISSING,
    period: null,
    latestPeriod,
    candidates: [],
    activeCount: 0,
  };
}

export function utilityPeriodStateError({ resolution, roomLabel = "this room", role = "room" }) {
  const prefix = role === "source" ? "source room" : role === "destination" ? "destination room" : "room";
  const details = {
    roomLabel,
    periodState: resolution?.state,
    activePeriodCount: resolution?.activeCount ?? 0,
  };
  const definitions = {
    [UTILITY_PERIOD_STATE.MISSING]: [
      `No active electricity period exists for ${roomLabel}. Open the current billing period before completing the transfer.`,
      `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_MISSING`,
    ],
    [UTILITY_PERIOD_STATE.CLOSED_ONLY]: [
      `The latest electricity period for ${roomLabel} is closed. Open the next current period before completing the transfer.`,
      `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_CLOSED_ONLY`,
    ],
    [UTILITY_PERIOD_STATE.MANUAL_REVIEW_REQUIRED]: [
      resolution?.period?.manualReview?.reason === "unknown_prebaseline_consumption"
        ? `${roomLabel} electricity requires review for an unresolved pre-baseline interval before the transfer can continue.`
        : `The electricity period for ${roomLabel} requires billing review before this transfer can continue.`,
      `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_REVIEW_REQUIRED`,
    ],
    [UTILITY_PERIOD_STATE.AMBIGUOUS]: [
      `Multiple active electricity periods were found for ${roomLabel}. Resolve the billing-period conflict before continuing.`,
      `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_AMBIGUOUS`,
    ],
    [UTILITY_PERIOD_STATE.OUTSIDE_PERIOD]: [
      `The transfer effective date does not fall inside ${roomLabel}'s active electricity period.`,
      `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_OUTSIDE_CUTOVER`,
    ],
  };
  const [message, code] = definitions[resolution?.state] || [
    `The ${prefix} electricity period is not valid for this transfer.`,
    `ROOM_TRANSFER_${role.toUpperCase()}_ELECTRICITY_PERIOD_INVALID`,
  ];
  return Object.assign(new Error(message), {
    statusCode: 409,
    code,
    manualReviewRequired: true,
    details,
  });
}

export async function markUtilityPeriodForManualReview({
  periodId,
  reason,
  actorId = null,
  reviewType = null,
  openedAt = new Date(),
  observationAt = null,
  affectedIntervalStart = null,
  affectedIntervalEnd = null,
  evidenceReferences = [],
  reviewOwner = null,
  reviewReference = null,
  historicalGapId = null,
  session = null,
}) {
  const richReviewRequested = Boolean(reviewType || historicalGapId || reviewReference);
  if (richReviewRequested && (!actorId || !reviewType || !observationAt || !affectedIntervalStart || !affectedIntervalEnd || !reviewOwner || !reviewReference || !historicalGapId)) {
    throw Object.assign(new Error("Complete manual-review provenance is required."), {
      statusCode: 400,
      code: "UTILITY_PERIOD_REVIEW_METADATA_REQUIRED",
    });
  }
  const manualReview = richReviewRequested ? {
    reviewType,
    reason: String(reason || "unspecified_utility_review"),
    openedAt,
    openedBy: actorId,
    reviewedAt: null,
    observationAt,
    affectedIntervalStart,
    affectedIntervalEnd,
    evidenceReferences,
    reviewOwner,
    reviewReference,
    historicalGapId,
    resolution: null,
  } : null;
  const update = UtilityPeriod.findOneAndUpdate(
    { _id: periodId, status: "open", isArchived: false },
    {
      $set: {
        status: "manual_review_required",
        manualReviewReason: String(reason || "unspecified_utility_review"),
        manualReviewResolvedBy: null,
        manualReviewResolvedAt: null,
        ...(manualReview ? { manualReview } : {}),
      },
    },
    { new: true, runValidators: true },
  );
  if (session) update.session(session);
  const period = await update;
  if (!period) {
    throw Object.assign(new Error("Only an open utility period can be placed into manual review."), {
      statusCode: 409,
      code: "UTILITY_PERIOD_REVIEW_TRANSITION_INVALID",
    });
  }
  return period;
}

export async function resolveUtilityPeriodManualReview({ periodId, actorId, session = null }) {
  if (!actorId) {
    throw Object.assign(new Error("An actor is required to resolve utility-period review."), {
      statusCode: 400,
      code: "UTILITY_PERIOD_REVIEW_ACTOR_REQUIRED",
    });
  }
  const update = UtilityPeriod.findOneAndUpdate(
    { _id: periodId, status: "manual_review_required", isArchived: false },
    {
      $set: {
        status: "open",
        manualReviewReason: null,
        manualReviewResolvedBy: actorId,
        manualReviewResolvedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  );
  if (session) update.session(session);
  const period = await update;
  if (!period) {
    throw Object.assign(new Error("No manual-review utility period was found."), {
      statusCode: 409,
      code: "UTILITY_PERIOD_REVIEW_RESOLUTION_INVALID",
    });
  }
  return period;
}

export async function createOpenUtilityPeriodWithBoundary({
  utilityType,
  room,
  startDate,
  startReading,
  ratePerUnit,
  calculationVersion = utilityType === "water" ? "water-meter-v1" : undefined,
  actorId,
  periodId = null,
  boundaryReadingId = null,
  startMode = UTILITY_PERIOD_START_MODE.BUSINESS_DATE,
  session = null,
}) {
  const reading = utilityType === "water" && calculationVersion !== "water-meter-v1"
    ? 0
    : parsePhysicalMeterReading(startReading, {
        fieldLabel: "Opening meter reading",
        maximum: 999999.99,
      });
  const normalizedStartDate = normalizeUtilityPeriodStart({ startDate, startMode });

  const execute = async (activeSession) => {
    if (utilityType === 'electricity') await assertElectricityChronology({roomId:room._id,date:normalizedStartDate,reading,eventType:'periodStart',session:activeSession});
    if (utilityType === 'water' && calculationVersion === 'water-meter-v1') {
      await mongoose.model('Room').updateOne({_id:room._id},{$inc:{waterObservationRevision:1}},{session:activeSession, timestamps:false});
      await assertWaterChronology({roomId:room._id,date:normalizedStartDate,reading,session:activeSession});
    }
    const existing = await resolveUtilityPeriodState({
      utilityType,
      roomId: room._id,
      session: activeSession,
    });
    if (existing.state !== UTILITY_PERIOD_STATE.MISSING && existing.state !== UTILITY_PERIOD_STATE.CLOSED_ONLY) {
      throw Object.assign(new Error("Room already has a lifecycle-active utility period."), {
        statusCode: 409,
        code: "UTILITY_PERIOD_ALREADY_ACTIVE",
        details: { periodState: existing.state, activePeriodCount: existing.activeCount },
      });
    }

    const [period] = await UtilityPeriod.create([{
      ...(periodId ? { _id: periodId } : {}),
      utilityType,
      calculationVersion,
      ...(calculationVersion === 'water-meter-v1' ? {unit:'m3',pricingSnapshot:{ratePerUnit,unit:'m3',capturedAt:new Date(),recordedBy:actorId}} : {}),
      roomId: room._id,
      branch: room.branch,
      startDate: normalizedStartDate,
      startReading: reading,
      ratePerUnit,
      status: "open",
    }], { session: activeSession });

    if (utilityType === "electricity" || calculationVersion === "water-meter-v1") {
      await UtilityReading.create([{
        ...(boundaryReadingId ? { _id: boundaryReadingId } : {}),
        utilityType,
        roomId: room._id,
        branch: room.branch,
        reading,
        date: normalizedStartDate,
        eventType: "periodStart",
        readingStatus: "locked",
        recordedBy: actorId,
        utilityPeriodId: period._id,
        activeTenantIds: [],
      }], { session: activeSession });
    }
    return period;
  };

  if (session) return execute(session);
  const ownSession = await mongoose.startSession();
  try {
    let period;
    await ownSession.withTransaction(async () => {
      period = await execute(ownSession);
    });
    return period;
  } finally {
    await ownSession.endSession();
  }
}
