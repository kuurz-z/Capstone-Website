/**
 * Fresh-baseline GP-705 / GP-1008 recovery. Default mode is a read-only plan.
 * This script deliberately has a different key and confirmation token from v1.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  AuditLog, Bill, Contract, Payment, Reservation, Room, ScheduledRoomTransfer, Stay,
  UtilityFinalization, UtilityHistoricalGap, UtilityPeriod, UtilityReading,
} from "../models/index.js";
import { parsePhysicalMeterReading } from "../utils/physicalMeterReading.js";
import {
  createOpenUtilityPeriodWithBoundary,
  markUtilityPeriodForManualReview,
  resolveUtilityPeriodState,
  UTILITY_PERIOD_START_MODE,
  UTILITY_PERIOD_STATE,
} from "../services/billing/utilityPeriodLifecycleService.js";

export const SCRIPT_VERSION = "2.0.0";
export const REPAIR_KEY = "utility-lifecycle:GP705:GP1008:fresh-baseline:v2";
export const CONFIRM_TOKEN = "GP705-GP1008-FRESH-BASELINE-V2-APPLY";
export const TARGET = Object.freeze({
  scheduleId: "6a9692e03c50c1349705d877",
  reservationId: "6a8d80356ebb68e87323b4f7",
  tenantId: "6a8d80206ebb68e87323b4c0",
  sourceRoomId: "69d9e9b939100a9aa9ba3ccd",
  destinationRoomId: "69d9e9c039100a9aa9ba3d9f",
  sourcePeriodId: "6a96961e3c50c1349705ee3d",
  destinationPeriodId: "6a9697ee3c50c1349705f820",
  sourceBillId: "6a9696203c50c1349705ee7a",
  sourceReadingIds: ["6a96961e3c50c1349705ee3f", "6a96961f3c50c1349705ee66"],
  destinationReadingIds: ["6a9697ee3c50c1349705f822", "6a9697ef3c50c1349705f849"],
  gapStart: "2026-08-31T16:00:00.000Z",
  ratePerUnit: 16,
});
export const EXPECTED_READINGS = Object.freeze({
  "6a96961e3c50c1349705ee3f": { roomId: TARGET.sourceRoomId, periodId: TARGET.sourcePeriodId, eventType: "periodStart", reading: 1000, date: TARGET.gapStart, updatedAt: "2026-09-01T09:08:46.829Z" },
  "6a96961f3c50c1349705ee66": { roomId: TARGET.sourceRoomId, periodId: TARGET.sourcePeriodId, eventType: "periodEnd", reading: 1250, date: "2026-09-30T16:00:00.000Z", updatedAt: "2026-09-01T09:08:47.928Z" },
  "6a9697ee3c50c1349705f822": { roomId: TARGET.destinationRoomId, periodId: TARGET.destinationPeriodId, eventType: "periodStart", reading: 1000, date: TARGET.gapStart, updatedAt: "2026-09-01T09:16:30.768Z" },
  "6a9697ef3c50c1349705f849": { roomId: TARGET.destinationRoomId, periodId: TARGET.destinationPeriodId, eventType: "periodEnd", reading: 1260, date: "2026-09-30T16:00:00.000Z", updatedAt: "2026-09-01T09:16:31.770Z" },
});
const idFor = (role) => String(new mongoose.Types.ObjectId(createHash("sha256").update(`${REPAIR_KEY}:${role}`).digest("hex").slice(0, 24)));
export const GENERATED_IDS = Object.freeze({
  sourcePeriodId: idFor("source-period"), sourceReadingId: idFor("source-period-start"),
  sourceGapId: idFor("source-gap"), destinationPeriodId: idFor("destination-period"),
  destinationReadingId: idFor("destination-period-start"), destinationGapId: idFor("destination-gap"),
  auditId: idFor("audit"), auditLogId: "REPAIR-GP705-GP1008-FRESH-BASELINE-V2",
});
const REQUIRED = [
  "schedule-id", "source-period-id", "destination-period-id", "source-opening", "destination-opening",
  "observed-at", "source-evidence", "destination-evidence", "source-review-owner", "source-review-reference",
  "destination-gap-reference", "expected-source-updated-at", "expected-destination-updated-at",
  "expected-bill-updated-at", "expected-reservation-updated-at", "reservation-change-reference", "actor-id",
];
const OPTIONAL = new Set(["confirm-token"]);
export class FreshBaselineRepairError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new FreshBaselineRepairError(code, message, details); };
const oid = (value) => new mongoose.Types.ObjectId(String(value));
const textValue = (value, label) => { const valueText = String(value || "").trim(); if (!valueText) fail("MISSING_ARGUMENT", `${label} is required.`); return valueText; };
const objectIdValue = (value, label) => mongoose.isValidObjectId(value) ? String(value) : fail("INVALID_ARGUMENT", `${label} must be an ObjectId.`);
const dateValue = (value, label) => { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) fail("INVALID_ARGUMENT", `${label} must be an ISO timestamp.`); return date; };
const sameInstant = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
const sameId = (a, b) => String(a) === String(b);

export function parseRepairArgs(argv = []) {
  const values = new Map(); let write = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    if (token === "--write") { if (write) fail("INVALID_ARGUMENT", "Duplicate --write."); write = true; continue; }
    if (!token.startsWith("--")) fail("INVALID_ARGUMENT", `Unexpected argument ${token}.`);
    const key = token.slice(2); if (!REQUIRED.includes(key) && !OPTIONAL.has(key)) fail("INVALID_ARGUMENT", `Unsupported argument --${key}.`);
    if (values.has(key)) fail("INVALID_ARGUMENT", `Duplicate argument --${key}.`);
    if (argv[i + 1] == null || String(argv[i + 1]).startsWith("--")) fail("MISSING_ARGUMENT", `--${key} requires a value.`);
    values.set(key, argv[++i]);
  }
  REQUIRED.forEach((key) => { if (!values.has(key)) fail("MISSING_ARGUMENT", `Missing --${key}.`); });
  const reservationChangeReference = textValue(values.get("reservation-change-reference"), "--reservation-change-reference");
  const args = Object.freeze({
    write, confirmToken: values.get("confirm-token") || null,
    scheduleId: objectIdValue(values.get("schedule-id"), "--schedule-id"),
    sourcePeriodId: objectIdValue(values.get("source-period-id"), "--source-period-id"),
    destinationPeriodId: objectIdValue(values.get("destination-period-id"), "--destination-period-id"),
    sourceOpening: parsePhysicalMeterReading(values.get("source-opening"), { fieldLabel: "Fresh GP-705 reading" }),
    destinationOpening: parsePhysicalMeterReading(values.get("destination-opening"), { fieldLabel: "Fresh GP-1008 reading" }),
    observedAt: dateValue(values.get("observed-at"), "--observed-at"),
    sourceEvidence: textValue(values.get("source-evidence"), "--source-evidence"),
    destinationEvidence: textValue(values.get("destination-evidence"), "--destination-evidence"),
    sourceReviewOwner: objectIdValue(values.get("source-review-owner"), "--source-review-owner"),
    sourceReviewReference: textValue(values.get("source-review-reference"), "--source-review-reference"),
    destinationGapReference: textValue(values.get("destination-gap-reference"), "--destination-gap-reference"),
    expectedSourceUpdatedAt: dateValue(values.get("expected-source-updated-at"), "--expected-source-updated-at"),
    expectedDestinationUpdatedAt: dateValue(values.get("expected-destination-updated-at"), "--expected-destination-updated-at"),
    expectedBillUpdatedAt: dateValue(values.get("expected-bill-updated-at"), "--expected-bill-updated-at"),
    expectedReservationUpdatedAt: dateValue(values.get("expected-reservation-updated-at"), "--expected-reservation-updated-at"),
    reservationChangeReference,
    reservationAnomalyResolved: !/(pending|unresolved|unknown)/i.test(reservationChangeReference),
    actorId: objectIdValue(values.get("actor-id"), "--actor-id"),
  });
  if (args.scheduleId !== TARGET.scheduleId || args.sourcePeriodId !== TARGET.sourcePeriodId || args.destinationPeriodId !== TARGET.destinationPeriodId) fail("TARGET_MISMATCH", "Identifiers differ from the approved target.");
  if (args.observedAt > new Date()) fail("FUTURE_OBSERVATION", "--observed-at cannot be in the future.");
  if (args.observedAt <= new Date(TARGET.gapStart)) fail("INVALID_OBSERVATION", "--observed-at must be after the historical-gap start.");
  if (write && args.confirmToken !== CONFIRM_TOKEN) fail("WRITE_CONFIRMATION_REQUIRED", `Write mode requires --confirm-token ${CONFIRM_TOKEN}.`);
  if (write && !args.reservationAnomalyResolved) fail("RESERVATION_UPDATED_AT_CAUSE_UNRESOLVED", "Write mode is blocked until an authoritative Reservation.updatedAt change reference establishes the cause.");
  return args;
}

const sessionQuery = (query, session) => session ? query.session(session) : query;
async function loadState(models, session = null) {
  const one = (Model, filter) => sessionQuery(Model.findOne(filter), session).lean();
  const many = (Model, filter) => sessionQuery(Model.find(filter).sort({ _id: 1 }), session).lean();
  return {
    schedule: await one(models.ScheduledRoomTransfer, { _id: oid(TARGET.scheduleId) }),
    reservation: await one(models.Reservation, { _id: oid(TARGET.reservationId) }),
    sourceRoom: await one(models.Room, { _id: oid(TARGET.sourceRoomId) }),
    destinationRoom: await one(models.Room, { _id: oid(TARGET.destinationRoomId) }),
    sourcePeriod: await one(models.UtilityPeriod, { _id: oid(TARGET.sourcePeriodId) }),
    destinationPeriod: await one(models.UtilityPeriod, { _id: oid(TARGET.destinationPeriodId) }),
    sourceBill: await one(models.Bill, { _id: oid(TARGET.sourceBillId) }),
    sourceReadings: await many(models.UtilityReading, { _id: { $in: TARGET.sourceReadingIds.map(oid) } }),
    destinationReadings: await many(models.UtilityReading, { _id: { $in: TARGET.destinationReadingIds.map(oid) } }),
    competingPeriods: await many(models.UtilityPeriod, { roomId: { $in: [oid(TARGET.sourceRoomId), oid(TARGET.destinationRoomId)] }, utilityType: "electricity", status: { $in: ["open", "manual_review_required"] }, isArchived: false }),
    priorRepair: await one(models.AuditLog, { "metadata.repairKey": REPAIR_KEY }),
    oldPayments: await many(models.Payment, { $or: [{ billId: oid(TARGET.sourceBillId) }, { "allocations.billId": oid(TARGET.sourceBillId) }] }),
    oldFinalizations: await many(models.UtilityFinalization, { utilityPeriodId: { $in: [oid(TARGET.sourcePeriodId), oid(TARGET.destinationPeriodId)] }, isArchived: { $ne: true } }),
    generatedPeriodCollisions: await many(models.UtilityPeriod, { _id: { $in: [oid(GENERATED_IDS.sourcePeriodId), oid(GENERATED_IDS.destinationPeriodId)] } }),
    generatedReadingCollisions: await many(models.UtilityReading, { _id: { $in: [oid(GENERATED_IDS.sourceReadingId), oid(GENERATED_IDS.destinationReadingId)] } }),
    generatedGapCollisions: await many(models.UtilityHistoricalGap, { _id: { $in: [oid(GENERATED_IDS.sourceGapId), oid(GENERATED_IDS.destinationGapId)] } }),
    stays: await many(models.Stay, { reservationId: oid(TARGET.reservationId) }),
    contracts: await many(models.Contract, { reservationId: oid(TARGET.reservationId) }),
    reservationPayments: await many(models.Payment, { reservationId: oid(TARGET.reservationId) }),
    destinationReservations: await many(models.Reservation, { roomId: oid(TARGET.destinationRoomId), status: { $in: ["reserved", "approved_for_payment", "moveIn"] }, isArchived: { $ne: true } }),
    destinationActiveStays: await many(models.Stay, { roomId: oid(TARGET.destinationRoomId), status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] } }),
  };
}

function validateState(state, args) {
  const { schedule, reservation, sourcePeriod, destinationPeriod, sourceBill } = state;
  if (!schedule || schedule.status !== "scheduled" || !schedule.holdApplied || !sameId(schedule.reservationId, TARGET.reservationId) || !sameId(schedule.sourceRoomId, TARGET.sourceRoomId) || !sameId(schedule.destinationRoomId, TARGET.destinationRoomId)) fail("SCHEDULE_FINGERPRINT_CHANGED", "Scheduled transfer or its own hold changed.");
  if (!state.sourceRoom || !state.destinationRoom || Number(state.sourceRoom.currentOccupancy) !== 1 || Number(state.destinationRoom.currentOccupancy) !== 1) fail("ROOM_FINGERPRINT_CHANGED", "Source occupancy or destination hold occupancy changed.");
  if (state.destinationReservations.length || state.destinationActiveStays.length) fail("DESTINATION_OCCUPANCY_CHANGED", "A real destination occupant appeared; the own transfer hold is no longer the only occupancy.");
  if (!reservation || !sameInstant(reservation.updatedAt, args.expectedReservationUpdatedAt) || !sameId(reservation.roomId, TARGET.sourceRoomId) || !sameId(reservation.userId, TARGET.tenantId) || String(reservation.status) !== "moveIn") fail("RESERVATION_FINGERPRINT_CHANGED", "Reservation fingerprint changed; do not update the expected timestamp without investigating.");
  const activeSourceStays = state.stays.filter((stay) => ["active", "ending_soon", "expired_occupancy_continuing"].includes(stay.status) && sameId(stay.roomId, TARGET.sourceRoomId) && sameId(stay.tenantId, TARGET.tenantId));
  if (activeSourceStays.length !== 1) fail("SOURCE_OCCUPANCY_CHANGED", "Aya no longer has exactly one active GP-705 Stay.");
  if (!sourcePeriod || sourcePeriod.status !== "closed" || sourcePeriod.isArchived || !sameInstant(sourcePeriod.updatedAt, args.expectedSourceUpdatedAt)) fail("SOURCE_FINGERPRINT_CHANGED", "GP-705 period changed since audit.");
  if (!destinationPeriod || destinationPeriod.status !== "closed" || destinationPeriod.isArchived || !sameInstant(destinationPeriod.updatedAt, args.expectedDestinationUpdatedAt)) fail("DESTINATION_FINGERPRINT_CHANGED", "GP-1008 period changed since audit.");
  if (!sameInstant(sourcePeriod.startDate, TARGET.gapStart) || !sameInstant(sourcePeriod.endDate, "2026-09-30T16:00:00.000Z") || Number(sourcePeriod.startReading) !== 1000 || Number(sourcePeriod.endReading) !== 1250 || Number(sourcePeriod.ratePerUnit) !== 16 || Number(sourcePeriod.computedTotalCost) !== 4000) fail("SOURCE_FINGERPRINT_CHANGED", "GP-705 period values differ from the audit.");
  if (!sameInstant(destinationPeriod.startDate, TARGET.gapStart) || !sameInstant(destinationPeriod.endDate, "2026-09-30T16:00:00.000Z") || Number(destinationPeriod.startReading) !== 1000 || Number(destinationPeriod.endReading) !== 1260 || Number(destinationPeriod.ratePerUnit) !== 16 || Number(destinationPeriod.computedTotalCost) !== 4160) fail("DESTINATION_FINGERPRINT_CHANGED", "GP-1008 period values differ from the audit.");
  if (!sourceBill || sourceBill.status !== "draft" || sourceBill.isArchived || Number(sourceBill.paidAmount || 0) !== 0 || sourceBill.sentAt || sourceBill.issuedAt || !sameInstant(sourceBill.updatedAt, args.expectedBillUpdatedAt)) fail("BILL_FINGERPRINT_CHANGED", "GP-705 draft Bill changed, was sent, or was paid.");
  if (Number(sourceBill.charges?.electricity) !== 4000 || sourceBill.utilityDispatch?.electricity?.state !== "draft" || !sameId(sourceBill.utilityDispatch?.electricity?.periodId, TARGET.sourcePeriodId) || Number(sourceBill.utilityDispatch?.electricity?.amount) !== 4000) fail("BILL_FINGERPRINT_CHANGED", "GP-705 draft Bill values differ from the audit.");
  const readings = [...state.sourceReadings, ...state.destinationReadings];
  if (state.sourceReadings.length !== 2 || state.destinationReadings.length !== 2 || readings.some((reading) => {
    const expected = EXPECTED_READINGS[String(reading._id)];
    return !expected || reading.isArchived || reading.readingStatus !== "locked" || !sameId(reading.roomId, expected.roomId) || !sameId(reading.utilityPeriodId, expected.periodId)
      || reading.eventType !== expected.eventType || Number(reading.reading) !== expected.reading || !sameInstant(reading.date, expected.date) || !sameInstant(reading.updatedAt, expected.updatedAt);
  })) fail("READING_FINGERPRINT_CHANGED", "Audited boundary readings changed.");
  if (state.competingPeriods.length) fail("COMPETING_ACTIVE_PERIOD", "A competing lifecycle-active period appeared.");
  if (state.priorRepair) fail("REPAIR_ALREADY_APPLIED", "The v2 repair key already exists.");
  if (state.oldPayments.length || state.oldFinalizations.length) fail("FINANCIAL_STATE_CHANGED", "A payment or utility finalization appeared for the erroneous history.");
  if (state.generatedPeriodCollisions.length || state.generatedReadingCollisions.length || state.generatedGapCollisions.length) fail("DETERMINISTIC_ID_COLLISION", "A deterministic v2 replacement ID is already in use.");
}

function preview(args, state) {
  return {
    mode: "dry-run", status: args.reservationAnomalyResolved ? "READY" : "BLOCKED_RESERVATION_ANOMALY", databaseMutations: 0, repairKey: REPAIR_KEY,
    reservationFingerprint: { updatedAt: state.reservation.updatedAt, changeReference: args.reservationChangeReference, anomalyResolved: args.reservationAnomalyResolved },
    observedAt: args.observedAt, generatedIds: GENERATED_IDS,
    archives: [TARGET.sourcePeriodId, ...TARGET.sourceReadingIds, TARGET.sourceBillId, TARGET.destinationPeriodId, ...TARGET.destinationReadingIds],
    replacements: {
      source: { id: GENERATED_IDS.sourcePeriodId, startDate: args.observedAt, startReading: args.sourceOpening, ratePerUnit: 16, status: "manual_review_required", boundaryId: GENERATED_IDS.sourceReadingId },
      destination: { id: GENERATED_IDS.destinationPeriodId, startDate: args.observedAt, startReading: args.destinationOpening, ratePerUnit: 16, status: "open", boundaryId: GENERATED_IDS.destinationReadingId },
    },
    gaps: {
      source: { id: GENERATED_IDS.sourceGapId, interval: [new Date(TARGET.gapStart), args.observedAt], reason: "UNKNOWN_PREBASELINE_TENANT_LIABILITY", blocksTransfer: true },
      destination: { id: GENERATED_IDS.destinationGapId, interval: [new Date(TARGET.gapStart), args.observedAt], reason: "UNKNOWN_VACANCY_BRANCH_CONSUMPTION", blocksTransfer: false },
    },
    untouched: ["ScheduledRoomTransfer", "Reservation", "Stay", "Contract", "addendum", "Payment", "physical transfer"],
  };
}

const DEFAULT_MODELS = { AuditLog, Bill, Contract, Payment, Reservation, Room, ScheduledRoomTransfer, Stay, UtilityFinalization, UtilityHistoricalGap, UtilityPeriod, UtilityReading };
export async function runFreshBaselineRepair({ args, models = DEFAULT_MODELS, mongooseInstance = mongoose, deps = {}, now = () => new Date() }) {
  const services = { createOpenPeriod: createOpenUtilityPeriodWithBoundary, markReview: markUtilityPeriodForManualReview, resolvePeriod: resolveUtilityPeriodState, ...deps };
  const initial = await loadState(models); validateState(initial, args); const plan = preview(args, initial); const repairAt = now();
  if (!args.write) return plan;
  const dbSession = await mongooseInstance.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const state = await loadState(models, dbSession); validateState(state, args); const actorId = oid(args.actorId);
      const untouchedSnapshot = JSON.stringify({ schedule: state.schedule, reservation: state.reservation, sourceRoom: state.sourceRoom, destinationRoom: state.destinationRoom, stays: state.stays, contracts: state.contracts, payments: state.reservationPayments });
      const archive = async (Model, filter, label) => {
        const result = await Model.updateOne(filter, { $set: { isArchived: true } }, { session: dbSession, timestamps: false });
        if (result.modifiedCount !== 1) fail("STALE_FINGERPRINT", `${label} changed while the transaction was starting.`);
      };
      await archive(models.UtilityPeriod, { _id: oid(TARGET.sourcePeriodId), updatedAt: args.expectedSourceUpdatedAt, status: "closed", isArchived: false }, "source period");
      for (const id of TARGET.sourceReadingIds) await archive(models.UtilityReading, { _id: oid(id), isArchived: false, readingStatus: "locked", updatedAt: new Date(EXPECTED_READINGS[id].updatedAt) }, `source reading ${id}`);
      await archive(models.Bill, { _id: oid(TARGET.sourceBillId), updatedAt: args.expectedBillUpdatedAt, status: "draft", paidAmount: 0, isArchived: false }, "source Bill");
      await archive(models.UtilityPeriod, { _id: oid(TARGET.destinationPeriodId), updatedAt: args.expectedDestinationUpdatedAt, status: "closed", isArchived: false }, "destination period");
      for (const id of TARGET.destinationReadingIds) await archive(models.UtilityReading, { _id: oid(id), isArchived: false, readingStatus: "locked", updatedAt: new Date(EXPECTED_READINGS[id].updatedAt) }, `destination reading ${id}`);
      const common = { utilityType: "electricity", startDate: args.observedAt, ratePerUnit: TARGET.ratePerUnit, actorId, startMode: UTILITY_PERIOD_START_MODE.EXACT_OBSERVATION, session: dbSession, serialize: false };
      const sourcePeriod = await services.createOpenPeriod({ ...common, room: state.sourceRoom, startReading: args.sourceOpening, periodId: oid(GENERATED_IDS.sourcePeriodId), boundaryReadingId: oid(GENERATED_IDS.sourceReadingId) });
      const destinationPeriod = await services.createOpenPeriod({ ...common, room: state.destinationRoom, startReading: args.destinationOpening, periodId: oid(GENERATED_IDS.destinationPeriodId), boundaryReadingId: oid(GENERATED_IDS.destinationReadingId) });
      await models.UtilityHistoricalGap.create([{
        _id: oid(GENERATED_IDS.sourceGapId), repairKey: `${REPAIR_KEY}:source`, utilityType: "electricity", roomId: state.sourceRoom._id, branch: state.sourceRoom.branch,
        utilityPeriodId: sourcePeriod._id, intervalStart: new Date(TARGET.gapStart), intervalEnd: args.observedAt, reason: "UNKNOWN_PREBASELINE_TENANT_LIABILITY",
        reservationId: state.reservation._id, tenantId: state.reservation.userId, evidenceReferences: [args.sourceEvidence], reviewState: "PENDING", blocksTransfer: true,
        openedBy: actorId, openedAt: repairAt, reviewOwner: oid(args.sourceReviewOwner), reviewReference: args.sourceReviewReference,
      }, {
        _id: oid(GENERATED_IDS.destinationGapId), repairKey: `${REPAIR_KEY}:destination`, utilityType: "electricity", roomId: state.destinationRoom._id, branch: state.destinationRoom.branch,
        utilityPeriodId: destinationPeriod._id, intervalStart: new Date(TARGET.gapStart), intervalEnd: args.observedAt, reason: "UNKNOWN_VACANCY_BRANCH_CONSUMPTION",
        evidenceReferences: [args.destinationEvidence], reviewState: "NOT_REQUIRED", blocksTransfer: false, openedBy: actorId, openedAt: repairAt, reviewReference: args.destinationGapReference,
      }], { session: dbSession, ordered: true });
      await services.markReview({ periodId: sourcePeriod._id, reason: "unknown_prebaseline_consumption", actorId, reviewType: "HISTORICAL_PHYSICAL_METER_GAP", openedAt: repairAt, observationAt: args.observedAt,
        affectedIntervalStart: new Date(TARGET.gapStart), affectedIntervalEnd: args.observedAt, evidenceReferences: [args.sourceEvidence], reviewOwner: oid(args.sourceReviewOwner),
        reviewReference: args.sourceReviewReference, historicalGapId: oid(GENERATED_IDS.sourceGapId), session: dbSession });
      await models.AuditLog.create([{
        _id: oid(GENERATED_IDS.auditId), logId: GENERATED_IDS.auditLogId, timestamp: repairAt, type: "data_modification", action: "FRESH_BASELINE_UTILITY_RECOVERY_V2", severity: "critical",
        user: `actor:${args.actorId}`, userId: actorId, userRole: "admin", branch: state.sourceRoom.branch, entityType: "utility", entityId: TARGET.scheduleId,
        details: "Archived untrusted utility history and established exact evidence-backed fresh baselines; transfer state was not changed.",
        metadata: { repairKey: REPAIR_KEY, scriptVersion: SCRIPT_VERSION, observedAt: args.observedAt, sourceEvidence: args.sourceEvidence, destinationEvidence: args.destinationEvidence,
          reservationChangeReference: args.reservationChangeReference, generatedIds: GENERATED_IDS, archivedIds: plan.archives, beforeAfter: plan },
      }], { session: dbSession });
      const sourceResolution = await services.resolvePeriod({ utilityType: "electricity", roomId: state.sourceRoom._id, cutoverAt: args.observedAt, session: dbSession });
      const destinationResolution = await services.resolvePeriod({ utilityType: "electricity", roomId: state.destinationRoom._id, cutoverAt: args.observedAt, session: dbSession });
      if (sourceResolution.state !== UTILITY_PERIOD_STATE.MANUAL_REVIEW_REQUIRED || destinationResolution.state !== UTILITY_PERIOD_STATE.OPEN) fail("POSTCONDITION_FAILED", "Replacement lifecycle states are not canonical.");
      if (sourceResolution.activeCount !== 1 || destinationResolution.activeCount !== 1
        || !sameInstant(sourceResolution.period.startDate, args.observedAt)
        || !sameInstant(destinationResolution.period.startDate, args.observedAt)) fail("POSTCONDITION_FAILED", "Replacement periods do not start exactly at observedAt.");
      const replacementReadings = await sessionQuery(models.UtilityReading.find({ _id: { $in: [oid(GENERATED_IDS.sourceReadingId), oid(GENERATED_IDS.destinationReadingId)] } }), dbSession).lean();
      if (replacementReadings.length !== 2 || replacementReadings.some((reading) => reading.isArchived || reading.eventType !== "periodStart" || reading.readingStatus !== "locked" || !sameInstant(reading.date, args.observedAt))) fail("POSTCONDITION_FAILED", "Fresh locked start boundaries are invalid.");
      const gaps = await sessionQuery(models.UtilityHistoricalGap.find({ _id: { $in: [oid(GENERATED_IDS.sourceGapId), oid(GENERATED_IDS.destinationGapId)] } }), dbSession).lean();
      const sourceGap = gaps.find((gap) => sameId(gap._id, GENERATED_IDS.sourceGapId));
      const destinationGap = gaps.find((gap) => sameId(gap._id, GENERATED_IDS.destinationGapId));
      if (sourceGap?.reviewState !== "PENDING" || !sourceGap.blocksTransfer || destinationGap?.reviewState !== "NOT_REQUIRED" || destinationGap.blocksTransfer) fail("POSTCONDITION_FAILED", "Historical-gap transfer semantics are invalid.");
      const archivedPeriods = await sessionQuery(models.UtilityPeriod.find({ _id: { $in: [oid(TARGET.sourcePeriodId), oid(TARGET.destinationPeriodId)] } }), dbSession).lean();
      const archivedReadings = await sessionQuery(models.UtilityReading.find({ _id: { $in: [...TARGET.sourceReadingIds, ...TARGET.destinationReadingIds].map(oid) } }), dbSession).lean();
      const archivedBill = await sessionQuery(models.Bill.findById(TARGET.sourceBillId), dbSession).lean();
      if (archivedPeriods.length !== 2 || archivedPeriods.some((period) => !period.isArchived || period.status !== "closed")
        || archivedReadings.length !== 4 || archivedReadings.some((reading) => !reading.isArchived)
        || !archivedBill?.isArchived || archivedBill.status !== "draft" || Number(archivedBill.charges?.electricity) !== 4000) fail("POSTCONDITION_FAILED", "Erroneous history was not preserved as archived history.");
      const unchangedSchedule = await sessionQuery(models.ScheduledRoomTransfer.findById(TARGET.scheduleId), dbSession).lean();
      const unchangedReservation = await sessionQuery(models.Reservation.findById(TARGET.reservationId), dbSession).lean();
      if (!sameInstant(unchangedSchedule.updatedAt, state.schedule.updatedAt) || !sameInstant(unchangedReservation.updatedAt, state.reservation.updatedAt)
        || unchangedSchedule.status !== "scheduled" || !unchangedSchedule.holdApplied || unchangedSchedule.executedAt || unchangedSchedule.executionToken
        || !sameId(unchangedReservation.roomId, TARGET.sourceRoomId)) fail("UNTOUCHED_STATE_CHANGED", "Transfer or Reservation changed inside repair transaction.");
      const afterUntouchedState = await loadState(models, dbSession);
      const afterUntouchedSnapshot = JSON.stringify({ schedule: afterUntouchedState.schedule, reservation: afterUntouchedState.reservation, sourceRoom: afterUntouchedState.sourceRoom, destinationRoom: afterUntouchedState.destinationRoom, stays: afterUntouchedState.stays, contracts: afterUntouchedState.contracts, payments: afterUntouchedState.reservationPayments });
      if (afterUntouchedSnapshot !== untouchedSnapshot) fail("UNTOUCHED_STATE_CHANGED", "Room, Stay, Contract, addendum, Payment, schedule, or Reservation state changed during utility repair.");
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { ...plan, mode: "write", status: "APPLIED", databaseMutations: 15 };
  } finally { await dbSession.endSession(); }
}

async function main() {
  const args = parseRepairArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI; if (!uri) fail("CONFIGURATION_ERROR", "MONGODB_URI or MONGO_URI is required.");
  await mongoose.connect(uri, { ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}), autoCreate: false, autoIndex: false, retryWrites: args.write, readPreference: args.write ? "primary" : "primaryPreferred", appName: `lilycrest-${REPAIR_KEY}` });
  try { process.stdout.write(`${JSON.stringify(await runFreshBaselineRepair({ args }), null, 2)}\n`); } finally { await mongoose.disconnect(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(async (error) => { process.stderr.write(`${JSON.stringify({ status: "ABORTED", code: error.code || "FRESH_BASELINE_REPAIR_FAILED", message: error.message, details: error.details || {} }, null, 2)}\n`); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
