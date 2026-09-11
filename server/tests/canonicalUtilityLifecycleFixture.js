import mongoose from "mongoose";
import {
  Reservation,
  Room,
  Stay,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import { branchSupportsSeparateUtilityBilling } from "../config/branches.js";
import { resolveRoomUtilityBoundaryContext } from "../services/billing/roomUtilityBoundaryService.js";
import {
  createOpenUtilityPeriodWithBoundary,
  resolveUtilityPeriodState,
  UTILITY_PERIOD_START_MODE,
  UTILITY_PERIOD_STATE,
} from "../services/billing/utilityPeriodLifecycleService.js";

// Jest business-date clocks and Mongoose's CJS clock live in different VM
// contexts. Date jumps must not mark a healthy isolated replica set stale.
Object.defineProperty(mongoose.connection, '_lastHeartbeatAt', {
  configurable:true, get:()=>Infinity, set(){},
});

const DEFAULT_RATE_PER_KWH = 16;

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function before(date, milliseconds = 1) {
  return new Date(date.getTime() - milliseconds);
}

async function latestReading(roomId, eventAt, session = null) {
  let query = UtilityReading.findOne({
    utilityType: "electricity",
    roomId,
    isArchived: false,
    readingStatus: { $ne: "voided" },
    date: { $lte: eventAt },
  }).sort({ date: -1, createdAt: -1 });
  if (session) query = query.session(session);
  return query;
}

export async function seedCanonicalElectricityRoom({
  room,
  actorId,
  eventAt,
  tenantId = null,
  reservationId = null,
  moveInAt = null,
  maximumOpeningReading = 100,
  session = null,
} = {}) {
  if (!room || !branchSupportsSeparateUtilityBilling(room.branch, "electricity")) {
    return { period: null, moveInBoundary: null };
  }

  const cutoverAt = validDate(eventAt) || new Date();
  const tenantMoveInAt = validDate(moveInAt);
  const desiredStart = tenantMoveInAt && tenantMoveInAt < cutoverAt
    ? before(tenantMoveInAt)
    : before(cutoverAt, 24 * 60 * 60 * 1000);
  let resolution = await resolveUtilityPeriodState({
    roomId: room._id,
    utilityType: "electricity",
    cutoverAt,
    session,
  });

  let period = resolution.period || null;
  if (resolution.state === UTILITY_PERIOD_STATE.MISSING) {
    const prior = await latestReading(room._id, cutoverAt, session);
    const openingReading = Math.max(
      0,
      Math.min(Number(maximumOpeningReading) || 0, Number(prior?.reading ?? maximumOpeningReading) || 0),
    );
    period = await createOpenUtilityPeriodWithBoundary({
      utilityType: "electricity",
      room,
      startDate: desiredStart,
      startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION,
      startReading: openingReading,
      ratePerUnit: DEFAULT_RATE_PER_KWH,
      actorId,
      session,
    });
    resolution = { state: UTILITY_PERIOD_STATE.OPEN, period };
  }

  if (resolution.state !== UTILITY_PERIOD_STATE.OPEN || !period) {
    throw Object.assign(new Error("The legacy test fixture is not in a canonical OPEN utility state."), {
      code: "TEST_UTILITY_FIXTURE_NOT_OPEN",
      details: { periodState: resolution.state, roomId: String(room._id) },
    });
  }

  let moveInBoundary = null;
  if (tenantId && tenantMoveInAt && tenantMoveInAt >= period.startDate && tenantMoveInAt <= cutoverAt) {
    const prior = await latestReading(room._id, tenantMoveInAt, session);
    moveInBoundary = (await resolveRoomUtilityBoundaryContext({
      room,
      utilityType: "electricity",
      eventAt: tenantMoveInAt,
      reading: Number(prior?.reading ?? period.startReading),
      eventType: "moveIn",
      reservationId,
      tenantId,
      actorId,
      allowInitialize: false,
      session,
    })).boundary;
  }

  return { period, moveInBoundary };
}

export async function prepareCanonicalTransferUtilityFixture({
  reservationId,
  payload,
  actorId,
  destinationState = "open",
} = {}) {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) return { payload };

  const [sourceRoom, targetRoom, activeStay] = await Promise.all([
    Room.findById(reservation.roomId),
    Room.findById(payload?.targetRoomId),
    Stay.findOne({ reservationId: reservation._id, status: "active" }),
  ]);
  const eventAt = validDate(payload?.effectiveTransferDate) || new Date();
  const tenantId = reservation.userId || activeStay?.tenantId || null;
  const moveInAt = activeStay?.leaseStartDate || reservation.moveInDate || null;

  const fixtureSession = await mongoose.startSession();
  try {
    const suppliedSourceReading = Number(payload?.sourceRoomMeterReading);
    await seedCanonicalElectricityRoom({
      room: sourceRoom,
      actorId,
      eventAt,
      tenantId,
      reservationId: reservation._id,
      moveInAt,
      maximumOpeningReading: Number.isFinite(suppliedSourceReading) ? suppliedSourceReading : 100,
      session: fixtureSession,
    });

    if (destinationState === "open") {
      const suppliedTargetReading = Number(payload?.targetRoomMeterReading);
      await seedCanonicalElectricityRoom({
        room: targetRoom,
        actorId,
        eventAt,
        maximumOpeningReading: Number.isFinite(suppliedTargetReading) ? suppliedTargetReading : 500,
        session: fixtureSession,
      });
    } else if (destinationState === "never_initialized") {
      await UtilityPeriod.syncIndexes();
    }
  } finally {
    await fixtureSession.endSession();
  }

  const nextPayload = {sourceWaterReading:100, targetWaterReading:100, ...payload};
  if (sourceRoom && branchSupportsSeparateUtilityBilling(sourceRoom.branch, "electricity")) {
    const latestSource = await latestReading(sourceRoom._id, eventAt);
    if (nextPayload.sourceRoomMeterReading == null) {
      nextPayload.sourceRoomMeterReading = Number(latestSource?.reading ?? 0);
    }
  }
  if (targetRoom && branchSupportsSeparateUtilityBilling(targetRoom.branch, "electricity")) {
    const latestTarget = await latestReading(targetRoom._id, eventAt);
    if (nextPayload.targetRoomMeterReading == null) {
      nextPayload.targetRoomMeterReading = Number(latestTarget?.reading ?? 500);
    }
  }

  return { payload: nextPayload };
}

export async function transferWithCanonicalUtilityFixture(transferStayWorkflow, input, options = {}) {
  const prepared = await prepareCanonicalTransferUtilityFixture({
    reservationId: input.reservationId,
    payload: input.payload,
    actorId: input.actorId,
    ...options,
  });
  try {
    return await transferStayWorkflow({ ...input, payload: prepared.payload });
  } finally {
    // transferStayWorkflow intentionally schedules non-blocking audit and
    // notification work after commit. Legacy suites reset their replica set
    // immediately after each assertion, so let those queued callbacks acquire
    // and release their Mongo operations before the next beforeEach teardown.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
}
