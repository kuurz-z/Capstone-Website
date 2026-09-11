/**
 * Targeted GP-705 -> GP-1008 utility lifecycle repair.
 *
 * DEFAULT: DRY RUN. Production writes require both --write and the exact
 * confirmation token. The script never derives a meter reading from the
 * accidental periods; both openings and both evidence references are required
 * external inputs.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  AuditLog,
  Bill,
  Contract,
  Payment,
  Reservation,
  Room,
  ScheduledRoomTransfer,
  Stay,
  UtilityFinalization,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import { parsePhysicalMeterReading } from "../utils/physicalMeterReading.js";
import {
  createOpenUtilityPeriodWithBoundary,
  resolveUtilityPeriodState,
  UTILITY_PERIOD_STATE,
} from "../services/billing/utilityPeriodLifecycleService.js";

export const SCRIPT_VERSION = "1.0.0";
export const REPAIR_KEY = "utility-lifecycle:GP705:GP1008:2026-09-01:v1";
export const CONFIRM_TOKEN = "GP705-GP1008-2026-09-01";

const deterministicObjectId = (role) => new mongoose.Types.ObjectId(
  createHash("sha256").update(`${REPAIR_KEY}:${role}`).digest("hex").slice(0, 24),
);

export const TARGET = Object.freeze({
  scheduleId: "6a9692e03c50c1349705d877",
  reservationId: "6a8d80356ebb68e87323b4f7",
  tenantId: "6a8d80206ebb68e87323b4c0",
  sourceRoomId: "69d9e9b939100a9aa9ba3ccd",
  destinationRoomId: "69d9e9c039100a9aa9ba3d9f",
  sourcePeriodId: "6a96961e3c50c1349705ee3d",
  destinationPeriodId: "6a9697ee3c50c1349705f820",
  sourceBillId: "6a9696203c50c1349705ee7a",
  sourceStartReadingId: "6a96961e3c50c1349705ee3f",
  sourceEndReadingId: "6a96961f3c50c1349705ee66",
  destinationStartReadingId: "6a9697ee3c50c1349705f822",
  destinationEndReadingId: "6a9697ef3c50c1349705f849",
  periodStart: "2026-08-31T16:00:00.000Z",
  periodEnd: "2026-09-30T16:00:00.000Z",
  ratePerUnit: 16,
});

export const EXPECTED_READING_UPDATED_AT = Object.freeze({
  [TARGET.sourceStartReadingId]: "2026-09-01T09:08:46.829Z",
  [TARGET.sourceEndReadingId]: "2026-09-01T09:08:47.928Z",
  [TARGET.destinationStartReadingId]: "2026-09-01T09:16:30.768Z",
  [TARGET.destinationEndReadingId]: "2026-09-01T09:16:31.770Z",
});

export const REPLACEMENT_IDS = Object.freeze({
  sourcePeriodId: String(deterministicObjectId("source-period")),
  sourceStartReadingId: String(deterministicObjectId("source-start-reading")),
  destinationPeriodId: String(deterministicObjectId("destination-period")),
  destinationStartReadingId: String(deterministicObjectId("destination-start-reading")),
  auditLogId: String(deterministicObjectId("audit-log")),
  auditLogIdText: `REPAIR-${CONFIRM_TOKEN}-V1`,
});

const REQUIRED_VALUE_ARGS = Object.freeze([
  "schedule-id",
  "source-period-id",
  "destination-period-id",
  "source-opening",
  "destination-opening",
  "source-evidence",
  "destination-evidence",
  "expected-source-updated-at",
  "expected-destination-updated-at",
  "expected-bill-updated-at",
]);
const OPTIONAL_VALUE_ARGS = new Set(["actor-id", "repair-note", "confirm-token"]);
const LIVE_RESERVATION_STATUSES = Object.freeze(["reserved", "approved_for_payment", "moveIn"]);
const ACTIVE_PERIOD_STATUSES = Object.freeze(["open", "manual_review_required"]);

export class TargetedUtilityRepairError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TargetedUtilityRepairError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new TargetedUtilityRepairError(code, message, details);
};
const sid = (value) => (value === null || value === undefined ? null : String(value));
const sameId = (left, right) => sid(left) === sid(right);
const sameInstant = (left, right) => Boolean(left && right)
  && new Date(left).getTime() === new Date(right).getTime();
const assertRepair = (condition, code, message, details = {}) => {
  if (!condition) fail(code, message, details);
};

function parseDateArgument(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    fail("INVALID_ARGUMENT", `${label} must be a valid ISO timestamp.`);
  }
  return parsed;
}

function parseObjectIdArgument(value, label) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    fail("INVALID_ARGUMENT", `${label} must be a valid ObjectId.`);
  }
  return String(value);
}

function requireEvidence(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("METER_EVIDENCE_REQUIRED", `${label} must be a non-empty external evidence reference.`);
  }
  return value.trim();
}

export function parseRepairArgs(argv = []) {
  const values = new Map();
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);
    if (token === "--write") {
      if (write) fail("INVALID_ARGUMENT", "--write may be supplied only once.");
      write = true;
      continue;
    }
    if (!token.startsWith("--")) fail("INVALID_ARGUMENT", `Unexpected positional argument: ${token}`);
    const name = token.slice(2);
    if (!REQUIRED_VALUE_ARGS.includes(name) && !OPTIONAL_VALUE_ARGS.has(name)) {
      fail("INVALID_ARGUMENT", `Unsupported argument: --${name}`);
    }
    if (values.has(name)) fail("INVALID_ARGUMENT", `Duplicate argument: --${name}`);
    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith("--")) {
      fail("INVALID_ARGUMENT", `--${name} requires a value.`);
    }
    values.set(name, value);
    index += 1;
  }

  for (const name of REQUIRED_VALUE_ARGS) {
    if (!values.has(name)) fail("MISSING_ARGUMENT", `Missing required argument: --${name}`);
  }

  const args = {
    write,
    confirmToken: values.has("confirm-token") ? String(values.get("confirm-token")) : null,
    scheduleId: parseObjectIdArgument(values.get("schedule-id"), "--schedule-id"),
    sourcePeriodId: parseObjectIdArgument(values.get("source-period-id"), "--source-period-id"),
    destinationPeriodId: parseObjectIdArgument(values.get("destination-period-id"), "--destination-period-id"),
    sourceOpening: parsePhysicalMeterReading(values.get("source-opening"), {
      fieldLabel: "Verified GP-705 opening reading",
    }),
    destinationOpening: parsePhysicalMeterReading(values.get("destination-opening"), {
      fieldLabel: "Verified GP-1008 opening reading",
    }),
    sourceEvidence: requireEvidence(values.get("source-evidence"), "--source-evidence"),
    destinationEvidence: requireEvidence(values.get("destination-evidence"), "--destination-evidence"),
    expectedSourceUpdatedAt: parseDateArgument(values.get("expected-source-updated-at"), "--expected-source-updated-at"),
    expectedDestinationUpdatedAt: parseDateArgument(values.get("expected-destination-updated-at"), "--expected-destination-updated-at"),
    expectedBillUpdatedAt: parseDateArgument(values.get("expected-bill-updated-at"), "--expected-bill-updated-at"),
    actorId: values.has("actor-id")
      ? parseObjectIdArgument(values.get("actor-id"), "--actor-id")
      : null,
    repairNote: values.has("repair-note") ? String(values.get("repair-note")).trim() : "",
  };

  assertRepair(args.scheduleId === TARGET.scheduleId, "TARGET_MISMATCH", "--schedule-id is not the approved target schedule.");
  assertRepair(args.sourcePeriodId === TARGET.sourcePeriodId, "TARGET_MISMATCH", "--source-period-id is not the approved GP-705 period.");
  assertRepair(args.destinationPeriodId === TARGET.destinationPeriodId, "TARGET_MISMATCH", "--destination-period-id is not the approved GP-1008 period.");
  if (write && args.confirmToken !== CONFIRM_TOKEN) {
    fail("WRITE_CONFIRMATION_REQUIRED", `Write mode requires --confirm-token ${CONFIRM_TOKEN}.`);
  }
  return Object.freeze(args);
}

function objectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function leanOne(Model, filter, session, selection = null) {
  let query = Model.findOne(filter);
  if (selection) query = query.select(selection);
  return withSession(query, session).lean();
}

async function leanMany(Model, filter, session, sort = { _id: 1 }) {
  return withSession(Model.find(filter).sort(sort), session).lean();
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function comparable(value) {
  return JSON.stringify(canonicalize(value));
}

function stateDigest(value) {
  return createHash("sha256").update(comparable(value)).digest("hex");
}

function summarizePeriod(period) {
  return period ? {
    id: sid(period._id),
    roomId: sid(period.roomId),
    utilityType: period.utilityType,
    status: period.status,
    isArchived: Boolean(period.isArchived),
    startDate: period.startDate,
    endDate: period.endDate,
    startReading: period.startReading,
    endReading: period.endReading,
    ratePerUnit: period.ratePerUnit,
    computedTotalUsage: period.computedTotalUsage,
    computedTotalCost: period.computedTotalCost,
    tenantSummaries: period.tenantSummaries || [],
    overheadSegments: period.overheadSegments || [],
    updatedAt: period.updatedAt,
  } : null;
}

function summarizeReading(reading) {
  return reading ? {
    id: sid(reading._id),
    roomId: sid(reading.roomId),
    utilityPeriodId: sid(reading.utilityPeriodId),
    eventType: reading.eventType,
    reading: reading.reading,
    date: reading.date,
    readingStatus: reading.readingStatus,
    isArchived: Boolean(reading.isArchived),
    updatedAt: reading.updatedAt,
  } : null;
}

function summarizeBill(bill) {
  return bill ? {
    id: sid(bill._id),
    status: bill.status,
    isArchived: Boolean(bill.isArchived),
    paidAmount: bill.paidAmount,
    sentAt: bill.sentAt,
    issuedAt: bill.issuedAt,
    releasedAt: bill.releasedAt,
    charges: bill.charges,
    utilityDispatch: bill.utilityDispatch,
    updatedAt: bill.updatedAt,
  } : null;
}

async function loadState({ models, session = null }) {
  const {
    AuditLog: AuditLogModel,
    Bill: BillModel,
    Contract: ContractModel,
    Payment: PaymentModel,
    Reservation: ReservationModel,
    Room: RoomModel,
    ScheduledRoomTransfer: ScheduleModel,
    Stay: StayModel,
    UtilityFinalization: FinalizationModel,
    UtilityPeriod: PeriodModel,
    UtilityReading: ReadingModel,
  } = models;
  const oid = Object.fromEntries(Object.entries(TARGET).filter(([, value]) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)).map(([key, value]) => [key, objectId(value)]));
  const newIds = Object.values(REPLACEMENT_IDS).filter((value) => mongoose.isValidObjectId(value)).map(objectId);

  const repairAudit = await leanOne(AuditLogModel, { "metadata.repairKey": REPAIR_KEY }, session);
  const deterministicAuditCollision = await leanOne(AuditLogModel, { _id: objectId(REPLACEMENT_IDS.auditLogId) }, session);
  const schedule = await leanOne(ScheduleModel, { _id: oid.scheduleId }, session, "+executionToken");
  const sourcePeriod = await leanOne(PeriodModel, { _id: oid.sourcePeriodId }, session);
  const destinationPeriod = await leanOne(PeriodModel, { _id: oid.destinationPeriodId }, session);
  const sourceBill = await leanOne(BillModel, { _id: oid.sourceBillId }, session);
  const sourceReadings = await leanMany(ReadingModel, { utilityPeriodId: oid.sourcePeriodId }, session, { date: 1, createdAt: 1 });
  const destinationReadings = await leanMany(ReadingModel, { utilityPeriodId: oid.destinationPeriodId }, session, { date: 1, createdAt: 1 });
  const sourceRoom = await leanOne(RoomModel, { _id: oid.sourceRoomId }, session);
  const destinationRoom = await leanOne(RoomModel, { _id: oid.destinationRoomId }, session);
  const reservation = schedule
    ? await leanOne(ReservationModel, { _id: schedule.reservationId }, session)
    : null;
  const stays = schedule
    ? await leanMany(StayModel, { reservationId: schedule.reservationId }, session, { createdAt: 1, _id: 1 })
    : [];
  const contracts = schedule
    ? await leanMany(ContractModel, { reservationId: schedule.reservationId }, session, { createdAt: 1, _id: 1 })
    : [];
  const targetReservations = await leanMany(ReservationModel, {
    roomId: oid.destinationRoomId,
    status: { $in: LIVE_RESERVATION_STATUSES },
    isArchived: { $ne: true },
  }, session);
  const targetStays = await leanMany(StayModel, {
    roomId: oid.destinationRoomId,
    status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
  }, session);
  const targetCurrentContracts = await leanMany(ContractModel, {
    roomId: oid.destinationRoomId,
    isCurrent: true,
  }, session);
  const otherDestinationHolds = await leanMany(ScheduleModel, {
    _id: { $ne: oid.scheduleId },
    destinationRoomId: oid.destinationRoomId,
    holdApplied: true,
    status: { $in: ["scheduled", "action_required"] },
    isArchived: { $ne: true },
  }, session);
  const linkedBills = await leanMany(BillModel, {
    $or: [
      { _id: oid.sourceBillId },
      { "utilityDispatch.electricity.periodId": { $in: [oid.sourcePeriodId, oid.destinationPeriodId] } },
    ],
  }, session);
  const reservationBills = schedule
    ? await leanMany(BillModel, { reservationId: schedule.reservationId }, session)
    : [];
  const relevantBillIds = reservationBills.map((bill) => bill._id);
  const payments = relevantBillIds.length
    ? await leanMany(PaymentModel, {
        $or: [
          { reservationId: schedule.reservationId },
          { billId: { $in: relevantBillIds } },
          { "allocations.billId": { $in: relevantBillIds } },
        ],
      }, session)
    : [];
  const oldPeriodPayments = await leanMany(PaymentModel, {
    $or: [
      { billId: oid.sourceBillId },
      { "allocations.billId": oid.sourceBillId },
    ],
  }, session);
  const finalizations = await leanMany(FinalizationModel, {
    utilityPeriodId: { $in: [oid.sourcePeriodId, oid.destinationPeriodId] },
    isArchived: { $ne: true },
  }, session);
  const activePeriods = await leanMany(PeriodModel, {
    roomId: { $in: [oid.sourceRoomId, oid.destinationRoomId] },
    utilityType: "electricity",
    status: { $in: ACTIVE_PERIOD_STATUSES },
    isArchived: false,
  }, session);
  const competingPeriods = await leanMany(PeriodModel, {
    _id: { $nin: [oid.sourcePeriodId, oid.destinationPeriodId] },
    roomId: { $in: [oid.sourceRoomId, oid.destinationRoomId] },
    utilityType: "electricity",
    startDate: { $gte: new Date(TARGET.periodStart) },
  }, session);
  const replacementCollisions = await leanMany(PeriodModel, { _id: { $in: newIds } }, session);
  const replacementReadingCollisions = await leanMany(ReadingModel, {
    _id: { $in: [objectId(REPLACEMENT_IDS.sourceStartReadingId), objectId(REPLACEMENT_IDS.destinationStartReadingId)] },
  }, session);

  return {
    repairAudit,
    deterministicAuditCollision,
    schedule,
    sourcePeriod,
    destinationPeriod,
    sourceBill,
    sourceReadings,
    destinationReadings,
    sourceRoom,
    destinationRoom,
    reservation,
    stays,
    contracts,
    targetReservations,
    targetStays,
    targetCurrentContracts,
    otherDestinationHolds,
    linkedBills,
    reservationBills,
    payments,
    oldPeriodPayments,
    finalizations,
    activePeriods,
    competingPeriods,
    replacementCollisions,
    replacementReadingCollisions,
  };
}

function validateBoundaryReadings(readings, expected) {
  assertRepair(readings.length === 2, "BOUNDARY_READING_CHANGED", `Expected exactly two ${expected.label} boundary readings.`);
  const byId = new Map(readings.map((reading) => [sid(reading._id), reading]));
  for (const item of expected.items) {
    const reading = byId.get(item.id);
    assertRepair(reading, "BOUNDARY_READING_CHANGED", `Required reading ${item.id} is missing.`);
    assertRepair(sameId(reading.roomId, expected.roomId), "BOUNDARY_READING_CHANGED", `Reading ${item.id} room changed.`);
    assertRepair(sameId(reading.utilityPeriodId, expected.periodId), "BOUNDARY_READING_CHANGED", `Reading ${item.id} period link changed.`);
    assertRepair(reading.eventType === item.eventType, "BOUNDARY_READING_CHANGED", `Reading ${item.id} event changed.`);
    assertRepair(Number(reading.reading) === item.reading, "BOUNDARY_READING_CHANGED", `Reading ${item.id} value changed.`);
    assertRepair(sameInstant(reading.date, item.date), "BOUNDARY_READING_CHANGED", `Reading ${item.id} timestamp changed.`);
    assertRepair(reading.readingStatus === "locked", "BOUNDARY_READING_CHANGED", `Reading ${item.id} is no longer locked.`);
    assertRepair(reading.isArchived === false, "BOUNDARY_READING_CHANGED", `Reading ${item.id} is already archived.`);
    assertRepair(sameInstant(reading.updatedAt, EXPECTED_READING_UPDATED_AT[item.id]), "CHANGED_SINCE_AUDIT", `Reading ${item.id} changed since audit.`);
  }
}

function validateErroneousPeriod(period, expected, expectedUpdatedAt) {
  assertRepair(period, "PERIOD_NOT_FOUND", `${expected.label} erroneous period is missing.`);
  assertRepair(sameId(period._id, expected.id), "TARGET_MISMATCH", `${expected.label} period ID changed.`);
  assertRepair(sameId(period.roomId, expected.roomId), "TARGET_MISMATCH", `${expected.label} period room changed.`);
  assertRepair(period.utilityType === "electricity", "TARGET_MISMATCH", `${expected.label} period is not electricity.`);
  assertRepair(period.status === "closed", "PERIOD_STATE_CHANGED", `${expected.label} period is no longer closed.`);
  assertRepair(period.isArchived === false, "PERIOD_STATE_CHANGED", `${expected.label} period is already archived.`);
  assertRepair(sameInstant(period.startDate, TARGET.periodStart), "PERIOD_STATE_CHANGED", `${expected.label} start date changed.`);
  assertRepair(sameInstant(period.endDate, TARGET.periodEnd), "PERIOD_STATE_CHANGED", `${expected.label} end date changed.`);
  assertRepair(Number(period.startReading) === expected.startReading, "PERIOD_STATE_CHANGED", `${expected.label} start reading changed.`);
  assertRepair(Number(period.endReading) === expected.endReading, "PERIOD_STATE_CHANGED", `${expected.label} end reading changed.`);
  assertRepair(Number(period.ratePerUnit) === TARGET.ratePerUnit, "PERIOD_STATE_CHANGED", `${expected.label} rate changed.`);
  assertRepair(sameInstant(period.updatedAt, expectedUpdatedAt), "CHANGED_SINCE_AUDIT", `${expected.label} period changed since audit.`);
}

function validatePreconditions(state, args) {
  const schedule = state.schedule;
  assertRepair(schedule, "SCHEDULE_NOT_FOUND", "Approved scheduled transfer is missing.");
  assertRepair(sameId(schedule._id, TARGET.scheduleId), "TARGET_MISMATCH", "Schedule ID changed.");
  assertRepair(schedule.status === "scheduled", "SCHEDULE_STATE_CHANGED", "Schedule is no longer scheduled.");
  assertRepair(schedule.holdApplied === true, "SCHEDULE_HOLD_MISSING", "Destination hold is no longer applied.");
  assertRepair(schedule.isArchived !== true, "SCHEDULE_STATE_CHANGED", "Schedule is archived.");
  assertRepair(sameId(schedule.reservationId, TARGET.reservationId), "TARGET_MISMATCH", "Schedule reservation changed.");
  assertRepair(sameId(schedule.tenantId, TARGET.tenantId), "TARGET_MISMATCH", "Schedule tenant changed.");
  assertRepair(sameId(schedule.sourceRoomId, TARGET.sourceRoomId), "TARGET_MISMATCH", "Schedule source is no longer GP-705.");
  assertRepair(sameId(schedule.destinationRoomId, TARGET.destinationRoomId), "TARGET_MISMATCH", "Schedule destination is no longer GP-1008.");
  assertRepair(schedule.destinationNeedsBed === false && !schedule.destinationBedId, "TARGET_MISMATCH", "Private destination bed semantics changed.");
  assertRepair(!schedule.executionToken && !schedule.executionStartedAt && !schedule.executedAt, "TRANSFER_EXECUTION_DETECTED", "Transfer execution has started or completed.");
  assertRepair(!schedule.settlementBillId, "TRANSFER_EXECUTION_DETECTED", "A transfer settlement Bill now exists.");

  assertRepair(state.sourceRoom && state.destinationRoom, "ROOM_NOT_FOUND", "A target room is missing.");
  assertRepair(state.sourceRoom.roomNumber === "GP-705" && state.sourceRoom.type === "private", "TARGET_MISMATCH", "Source room identity changed.");
  assertRepair(state.destinationRoom.roomNumber === "GP-1008" && state.destinationRoom.type === "private", "TARGET_MISMATCH", "Destination room identity changed.");
  assertRepair(Number(state.sourceRoom.currentOccupancy) === 1, "SOURCE_OCCUPANCY_CHANGED", "GP-705 occupancy is no longer one.");
  assertRepair(state.reservation && sameId(state.reservation._id, TARGET.reservationId), "SOURCE_OCCUPANCY_CHANGED", "Source Reservation is missing.");
  assertRepair(sameId(state.reservation.userId, TARGET.tenantId), "SOURCE_OCCUPANCY_CHANGED", "Source Reservation tenant changed.");
  assertRepair(sameId(state.reservation.roomId, TARGET.sourceRoomId), "SOURCE_OCCUPANCY_CHANGED", "Source Reservation is no longer in GP-705.");
  assertRepair(state.reservation.status === "moveIn" && state.reservation.isArchived !== true, "SOURCE_OCCUPANCY_CHANGED", "Source Reservation is no longer an active move-in.");
  const activeSourceStays = state.stays.filter((stay) => ["active", "ending_soon", "expired_occupancy_continuing"].includes(stay.status));
  assertRepair(activeSourceStays.length === 1, "SOURCE_OCCUPANCY_CHANGED", "Expected exactly one active source Stay.");
  assertRepair(sameId(activeSourceStays[0].roomId, TARGET.sourceRoomId) && sameId(activeSourceStays[0].tenantId, TARGET.tenantId), "SOURCE_OCCUPANCY_CHANGED", "Active Stay no longer proves Aya occupies GP-705.");

  assertRepair(Number(state.destinationRoom.capacity) === 1 && Number(state.destinationRoom.currentOccupancy) === 1, "DESTINATION_OCCUPANCY_CHANGED", "GP-1008 no longer contains exactly the scheduled capacity hold.");
  assertRepair(state.targetReservations.length === 0, "DESTINATION_REAL_OCCUPANT", "GP-1008 has a live Reservation.");
  assertRepair(state.targetStays.length === 0, "DESTINATION_REAL_OCCUPANT", "GP-1008 has an active Stay.");
  assertRepair(state.targetCurrentContracts.length === 0, "DESTINATION_REAL_OCCUPANT", "GP-1008 has a current Contract.");
  assertRepair(state.otherDestinationHolds.length === 0, "DESTINATION_OCCUPANCY_CHANGED", "GP-1008 has another scheduled hold.");
  const nonAvailableBeds = (state.destinationRoom.beds || []).filter((bed) => bed.status !== "available" || bed.occupiedBy?.userId || bed.occupiedBy?.reservationId || bed.occupiedBy?.occupiedSince);
  assertRepair(nonAvailableBeds.length === 0, "DESTINATION_REAL_OCCUPANT", "GP-1008 has a bed-level occupant or reservation.");

  validateErroneousPeriod(state.sourcePeriod, {
    label: "GP-705",
    id: TARGET.sourcePeriodId,
    roomId: TARGET.sourceRoomId,
    startReading: 1000,
    endReading: 1250,
  }, args.expectedSourceUpdatedAt);
  validateErroneousPeriod(state.destinationPeriod, {
    label: "GP-1008",
    id: TARGET.destinationPeriodId,
    roomId: TARGET.destinationRoomId,
    startReading: 1000,
    endReading: 1260,
  }, args.expectedDestinationUpdatedAt);

  validateBoundaryReadings(state.sourceReadings, {
    label: "GP-705",
    roomId: TARGET.sourceRoomId,
    periodId: TARGET.sourcePeriodId,
    items: [
      { id: TARGET.sourceStartReadingId, eventType: "periodStart", reading: 1000, date: TARGET.periodStart },
      { id: TARGET.sourceEndReadingId, eventType: "periodEnd", reading: 1250, date: TARGET.periodEnd },
    ],
  });
  validateBoundaryReadings(state.destinationReadings, {
    label: "GP-1008",
    roomId: TARGET.destinationRoomId,
    periodId: TARGET.destinationPeriodId,
    items: [
      { id: TARGET.destinationStartReadingId, eventType: "periodStart", reading: 1000, date: TARGET.periodStart },
      { id: TARGET.destinationEndReadingId, eventType: "periodEnd", reading: 1260, date: TARGET.periodEnd },
    ],
  });

  const bill = state.sourceBill;
  assertRepair(bill, "BILL_NOT_FOUND", "GP-705 draft Bill is missing.");
  assertRepair(bill.status === "draft" && bill.isArchived === false, "BILL_STATE_CHANGED", "GP-705 Bill is no longer an active draft.");
  assertRepair(!bill.sentAt && !bill.issuedAt && !bill.releasedAt, "BILL_STATE_CHANGED", "GP-705 Bill has been issued or sent.");
  assertRepair(Number(bill.paidAmount || 0) === 0, "BILL_STATE_CHANGED", "GP-705 Bill has acquired a payment.");
  assertRepair(Number(bill.charges?.electricity) === 4000, "BILL_STATE_CHANGED", "GP-705 electricity amount changed.");
  assertRepair(bill.utilityDispatch?.electricity?.state === "draft", "BILL_STATE_CHANGED", "GP-705 electricity dispatch is no longer draft.");
  assertRepair(sameId(bill.utilityDispatch?.electricity?.periodId, TARGET.sourcePeriodId), "BILL_STATE_CHANGED", "GP-705 Bill period reference changed.");
  assertRepair(Number(bill.utilityDispatch?.electricity?.amount) === 4000, "BILL_STATE_CHANGED", "GP-705 dispatch amount changed.");
  assertRepair(sameInstant(bill.updatedAt, args.expectedBillUpdatedAt), "CHANGED_SINCE_AUDIT", "GP-705 Bill changed since audit.");
  assertRepair(state.oldPeriodPayments.length === 0, "PAYMENT_DETECTED", "A payment now references the erroneous GP-705 Bill.");
  assertRepair(state.linkedBills.length === 1 && sameId(state.linkedBills[0]._id, TARGET.sourceBillId), "FINANCIAL_REFERENCE_CHANGED", "Unexpected Bill references an erroneous period.");
  assertRepair(state.finalizations.length === 0, "FINALIZATION_DETECTED", "An erroneous period has acquired a UtilityFinalization.");
  assertRepair(state.activePeriods.length === 0, "ACTIVE_PERIOD_EXISTS", "A lifecycle-active target-room electricity period already exists.");
  assertRepair(state.competingPeriods.length === 0, "REPLACEMENT_EXISTS", "A replacement or competing target-room electricity period already exists.");
  assertRepair(state.replacementCollisions.length === 0 && state.replacementReadingCollisions.length === 0, "REPLACEMENT_ID_COLLISION", "A preallocated replacement ID already exists without the repair AuditLog.");
  assertRepair(!state.deterministicAuditCollision, "REPLACEMENT_ID_COLLISION", "The deterministic AuditLog ID already exists with different metadata.");
}

function sanitizeRoomForUntouched(room) {
  if (!room) return null;
  const clone = { ...room };
  delete clone.electricityObservationRevision;
  delete clone.waterObservationRevision;
  return clone;
}

function untouchedSnapshot(state) {
  return canonicalize({
    schedule: state.schedule,
    rooms: [sanitizeRoomForUntouched(state.sourceRoom), sanitizeRoomForUntouched(state.destinationRoom)],
    reservation: state.reservation,
    stays: state.stays,
    contracts: state.contracts,
    payments: state.payments,
  });
}

export function buildRepairPreview(state, args, repairAt = new Date()) {
  const actorId = args.actorId || sid(state.schedule?.scheduledBy);
  return canonicalize({
    mode: args.write ? "write-authorized" : "dry-run",
    status: "READY",
    repairKey: REPAIR_KEY,
    scriptVersion: SCRIPT_VERSION,
    repairAt,
    records: {
      A_sourceErroneousPeriod: { before: summarizePeriod(state.sourcePeriod), after: { ...summarizePeriod(state.sourcePeriod), isArchived: true } },
      B_sourcePeriodStartReading: { before: summarizeReading(state.sourceReadings.find((r) => sameId(r._id, TARGET.sourceStartReadingId))), after: { ...summarizeReading(state.sourceReadings.find((r) => sameId(r._id, TARGET.sourceStartReadingId))), isArchived: true } },
      C_sourcePeriodEndReading: { before: summarizeReading(state.sourceReadings.find((r) => sameId(r._id, TARGET.sourceEndReadingId))), after: { ...summarizeReading(state.sourceReadings.find((r) => sameId(r._id, TARGET.sourceEndReadingId))), isArchived: true } },
      D_sourceDraftBill: { before: summarizeBill(state.sourceBill), after: { ...summarizeBill(state.sourceBill), isArchived: true } },
      E_destinationErroneousPeriod: { before: summarizePeriod(state.destinationPeriod), after: { ...summarizePeriod(state.destinationPeriod), isArchived: true } },
      F_destinationPeriodStartReading: { before: summarizeReading(state.destinationReadings.find((r) => sameId(r._id, TARGET.destinationStartReadingId))), after: { ...summarizeReading(state.destinationReadings.find((r) => sameId(r._id, TARGET.destinationStartReadingId))), isArchived: true } },
      G_destinationPeriodEndReading: { before: summarizeReading(state.destinationReadings.find((r) => sameId(r._id, TARGET.destinationEndReadingId))), after: { ...summarizeReading(state.destinationReadings.find((r) => sameId(r._id, TARGET.destinationEndReadingId))), isArchived: true } },
      H_newSourceOpenPeriod: { before: null, after: { id: REPLACEMENT_IDS.sourcePeriodId, roomId: TARGET.sourceRoomId, utilityType: "electricity", status: "open", isArchived: false, startDate: TARGET.periodStart, endDate: null, startReading: args.sourceOpening, endReading: null, ratePerUnit: TARGET.ratePerUnit } },
      I_newSourcePeriodStartReading: { before: null, after: { id: REPLACEMENT_IDS.sourceStartReadingId, roomId: TARGET.sourceRoomId, utilityPeriodId: REPLACEMENT_IDS.sourcePeriodId, eventType: "periodStart", readingStatus: "locked", reading: args.sourceOpening, date: TARGET.periodStart, isArchived: false } },
      J_newDestinationOpenPeriod: { before: null, after: { id: REPLACEMENT_IDS.destinationPeriodId, roomId: TARGET.destinationRoomId, utilityType: "electricity", status: "open", isArchived: false, startDate: TARGET.periodStart, endDate: null, startReading: args.destinationOpening, endReading: null, ratePerUnit: TARGET.ratePerUnit } },
      K_newDestinationPeriodStartReading: { before: null, after: { id: REPLACEMENT_IDS.destinationStartReadingId, roomId: TARGET.destinationRoomId, utilityPeriodId: REPLACEMENT_IDS.destinationPeriodId, eventType: "periodStart", readingStatus: "locked", reading: args.destinationOpening, date: TARGET.periodStart, isArchived: false } },
      L_auditLog: { before: null, after: { id: REPLACEMENT_IDS.auditLogId, logId: REPLACEMENT_IDS.auditLogIdText, type: "data_modification", severity: "critical", action: "targeted utility lifecycle data repair", entityType: "utility", entityId: TARGET.scheduleId, actorId, metadata: { repairKey: REPAIR_KEY, sourceEvidence: args.sourceEvidence, destinationEvidence: args.destinationEvidence, sourceOpening: args.sourceOpening, destinationOpening: args.destinationOpening, untouchedStateHash: stateDigest(untouchedSnapshot(state)), confirmToken: CONFIRM_TOKEN, scriptVersion: SCRIPT_VERSION } } },
    },
    untouched: {
      scheduleId: TARGET.scheduleId,
      holdApplied: true,
      roomOccupancy: { GP705: state.sourceRoom?.currentOccupancy, GP1008: state.destinationRoom?.currentOccupancy },
      reservationId: TARGET.reservationId,
      stayIds: state.stays.map((stay) => sid(stay._id)),
      contractIds: state.contracts.map((contract) => sid(contract._id)),
      paymentIds: state.payments.map((payment) => sid(payment._id)),
    },
  });
}

async function conditionalArchive(Model, filter, label, session) {
  // Archival is the only historical mutation. Disabling automatic timestamps
  // preserves the audited values and timestamps exactly as requested.
  const result = await Model.updateOne(
    filter,
    { $set: { isArchived: true } },
    { session, timestamps: false },
  );
  assertRepair(result.matchedCount === 1 && result.modifiedCount === 1, "CHANGED_SINCE_AUDIT", `${label} changed before it could be archived.`);
}

async function validatePostWrite({ models, session, args, beforeUntouched, deps }) {
  const state = await loadState({ models, session });
  const sourceResolution = await deps.resolvePeriodState({
    utilityType: "electricity",
    roomId: objectId(TARGET.sourceRoomId),
    cutoverDate: new Date(TARGET.periodStart),
    session,
  });
  const destinationResolution = await deps.resolvePeriodState({
    utilityType: "electricity",
    roomId: objectId(TARGET.destinationRoomId),
    cutoverDate: new Date(TARGET.periodStart),
    session,
  });
  assertRepair(sourceResolution.state === UTILITY_PERIOD_STATE.OPEN && sameId(sourceResolution.period?._id, REPLACEMENT_IDS.sourcePeriodId), "POSTCONDITION_FAILED", "GP-705 resolver is not OPEN on the replacement period.");
  assertRepair(destinationResolution.state === UTILITY_PERIOD_STATE.OPEN && sameId(destinationResolution.period?._id, REPLACEMENT_IDS.destinationPeriodId), "POSTCONDITION_FAILED", "GP-1008 resolver is not OPEN on the replacement period.");
  const activeSource = state.activePeriods.filter((p) => sameId(p.roomId, TARGET.sourceRoomId));
  const activeDestination = state.activePeriods.filter((p) => sameId(p.roomId, TARGET.destinationRoomId));
  assertRepair(activeSource.length === 1 && activeDestination.length === 1, "POSTCONDITION_FAILED", "Each target room must have exactly one lifecycle-active electricity period.");
  assertRepair(state.sourcePeriod?.isArchived === true && state.sourcePeriod.status === "closed", "POSTCONDITION_FAILED", "Old GP-705 period was not preserved as archived closed history.");
  assertRepair(state.destinationPeriod?.isArchived === true && state.destinationPeriod.status === "closed", "POSTCONDITION_FAILED", "Old GP-1008 period was not preserved as archived closed history.");
  assertRepair(state.sourceReadings.every((r) => r.isArchived === true), "POSTCONDITION_FAILED", "Old GP-705 boundaries were not all archived.");
  assertRepair(state.destinationReadings.every((r) => r.isArchived === true), "POSTCONDITION_FAILED", "Old GP-1008 boundaries were not all archived.");
  assertRepair(state.sourceBill?.isArchived === true && state.sourceBill.status === "draft", "POSTCONDITION_FAILED", "GP-705 draft Bill was not preserved as archived draft history.");
  assertRepair(Number(state.sourceBill?.charges?.electricity) === 4000 && Number(state.sourceBill?.paidAmount || 0) === 0, "POSTCONDITION_FAILED", "GP-705 draft Bill financial history changed.");
  const sourceNew = activeSource[0];
  const destinationNew = activeDestination[0];
  assertRepair(Number(sourceNew.startReading) === args.sourceOpening && sourceNew.endDate == null && sourceNew.status === "open", "POSTCONDITION_FAILED", "GP-705 replacement opening is incorrect.");
  assertRepair(Number(destinationNew.startReading) === args.destinationOpening && destinationNew.endDate == null && destinationNew.status === "open", "POSTCONDITION_FAILED", "GP-1008 replacement opening is incorrect.");
  const newReadings = await leanMany(models.UtilityReading, {
    _id: { $in: [objectId(REPLACEMENT_IDS.sourceStartReadingId), objectId(REPLACEMENT_IDS.destinationStartReadingId)] },
  }, session);
  assertRepair(newReadings.length === 2, "POSTCONDITION_FAILED", "Replacement start boundaries are missing.");
  for (const reading of newReadings) {
    const expected = sameId(reading.roomId, TARGET.sourceRoomId) ? args.sourceOpening : args.destinationOpening;
    assertRepair(reading.eventType === "periodStart" && reading.readingStatus === "locked" && Number(reading.reading) === expected && reading.isArchived === false, "POSTCONDITION_FAILED", "A replacement start boundary is invalid.");
  }
  assertRepair(comparable(untouchedSnapshot(state)) === comparable(beforeUntouched), "UNTOUCHED_STATE_CHANGED", "Schedule, occupancy, Reservation, Stay, Contract, or Payment state changed during repair.");
  assertRepair(state.schedule.status === "scheduled" && state.schedule.holdApplied === true && !state.schedule.executionToken && !state.schedule.executedAt, "POSTCONDITION_FAILED", "Transfer state changed during utility repair.");
  assertRepair(state.repairAudit && state.repairAudit.metadata?.repairKey === REPAIR_KEY, "POSTCONDITION_FAILED", "Repair AuditLog is missing.");
}

async function validateAlreadyApplied({ models, state, args, session = null }) {
  const audit = state.repairAudit;
  assertRepair(audit, "IDEMPOTENCY_STATE_MISMATCH", "Repair AuditLog could not be loaded.");
  assertRepair(sameId(audit._id, REPLACEMENT_IDS.auditLogId) && audit.logId === REPLACEMENT_IDS.auditLogIdText, "IDEMPOTENCY_STATE_MISMATCH", "Repair AuditLog identity differs from the approved script.");
  assertRepair(Number(audit.metadata?.sourceOpening) === args.sourceOpening && Number(audit.metadata?.destinationOpening) === args.destinationOpening, "IDEMPOTENCY_STATE_MISMATCH", "Supplied meter openings differ from the applied repair.");
  assertRepair(audit.metadata?.sourceEvidence === args.sourceEvidence && audit.metadata?.destinationEvidence === args.destinationEvidence, "IDEMPOTENCY_STATE_MISMATCH", "Supplied evidence references differ from the applied repair.");
  assertRepair(audit.metadata?.untouchedStateHash === stateDigest(untouchedSnapshot(state)), "IDEMPOTENCY_STATE_MISMATCH", "Schedule, occupancy, Reservation, Stay, Contract, or Payment state differs from the applied repair.");
  assertRepair(audit.metadata?.scheduleId === TARGET.scheduleId
    && audit.metadata?.sourceRoomId === TARGET.sourceRoomId
    && audit.metadata?.destinationRoomId === TARGET.destinationRoomId,
  "IDEMPOTENCY_STATE_MISMATCH", "Repair AuditLog target metadata differs from the approved repair.");
  assertRepair(comparable(audit.metadata?.archivedRecordIds) === comparable([
    TARGET.sourcePeriodId,
    TARGET.sourceStartReadingId,
    TARGET.sourceEndReadingId,
    TARGET.sourceBillId,
    TARGET.destinationPeriodId,
    TARGET.destinationStartReadingId,
    TARGET.destinationEndReadingId,
  ]), "IDEMPOTENCY_STATE_MISMATCH", "Repair AuditLog archived-record IDs differ from the approved repair.");
  assertRepair(comparable(audit.metadata?.newPeriodIds) === comparable([
    REPLACEMENT_IDS.sourcePeriodId,
    REPLACEMENT_IDS.destinationPeriodId,
  ]) && comparable(audit.metadata?.newReadingIds) === comparable([
    REPLACEMENT_IDS.sourceStartReadingId,
    REPLACEMENT_IDS.destinationStartReadingId,
  ]), "IDEMPOTENCY_STATE_MISMATCH", "Repair AuditLog replacement IDs differ from the approved repair.");
  const sourceNew = await leanOne(models.UtilityPeriod, { _id: objectId(REPLACEMENT_IDS.sourcePeriodId) }, session);
  const destinationNew = await leanOne(models.UtilityPeriod, { _id: objectId(REPLACEMENT_IDS.destinationPeriodId) }, session);
  const sourceReading = await leanOne(models.UtilityReading, { _id: objectId(REPLACEMENT_IDS.sourceStartReadingId) }, session);
  const destinationReading = await leanOne(models.UtilityReading, { _id: objectId(REPLACEMENT_IDS.destinationStartReadingId) }, session);
  assertRepair(state.sourcePeriod?.isArchived === true
    && state.sourcePeriod.status === "closed"
    && sameInstant(state.sourcePeriod.startDate, TARGET.periodStart)
    && sameInstant(state.sourcePeriod.endDate, TARGET.periodEnd)
    && Number(state.sourcePeriod.startReading) === 1000
    && Number(state.sourcePeriod.endReading) === 1250
    && Number(state.sourcePeriod.computedTotalCost) === 4000,
  "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-705 period no longer matches the applied repair.");
  assertRepair(sameInstant(state.sourcePeriod.updatedAt, args.expectedSourceUpdatedAt), "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-705 period timestamp differs from the supplied audited timestamp.");
  assertRepair(state.destinationPeriod?.isArchived === true
    && state.destinationPeriod.status === "closed"
    && sameInstant(state.destinationPeriod.startDate, TARGET.periodStart)
    && sameInstant(state.destinationPeriod.endDate, TARGET.periodEnd)
    && Number(state.destinationPeriod.startReading) === 1000
    && Number(state.destinationPeriod.endReading) === 1260
    && Number(state.destinationPeriod.computedTotalCost) === 4160,
  "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-1008 period no longer matches the applied repair.");
  assertRepair(sameInstant(state.destinationPeriod.updatedAt, args.expectedDestinationUpdatedAt), "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-1008 period timestamp differs from the supplied audited timestamp.");
  assertRepair(state.sourceBill?.isArchived === true
    && state.sourceBill.status === "draft"
    && Number(state.sourceBill.paidAmount || 0) === 0
    && Number(state.sourceBill.charges?.electricity) === 4000
    && state.sourceBill.utilityDispatch?.electricity?.state === "draft"
    && sameId(state.sourceBill.utilityDispatch?.electricity?.periodId, TARGET.sourcePeriodId)
    && Number(state.sourceBill.utilityDispatch?.electricity?.amount) === 4000,
  "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-705 draft Bill no longer matches the applied repair.");
  assertRepair(sameInstant(state.sourceBill.updatedAt, args.expectedBillUpdatedAt), "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-705 draft Bill timestamp differs from the supplied audited timestamp.");
  assertRepair(state.sourceReadings.length === 2 && state.sourceReadings.every((r) => r.isArchived), "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-705 readings no longer match.");
  assertRepair(state.destinationReadings.length === 2 && state.destinationReadings.every((r) => r.isArchived), "IDEMPOTENCY_STATE_MISMATCH", "Archived GP-1008 readings no longer match.");
  assertRepair(sourceNew?.status === "open"
    && sourceNew.isArchived === false
    && sameId(sourceNew.roomId, TARGET.sourceRoomId)
    && sameInstant(sourceNew.startDate, TARGET.periodStart)
    && sourceNew.endDate == null
    && sourceNew.endReading == null
    && Number(sourceNew.startReading) === args.sourceOpening
    && Number(sourceNew.ratePerUnit) === TARGET.ratePerUnit,
  "IDEMPOTENCY_STATE_MISMATCH", "GP-705 replacement period no longer matches.");
  assertRepair(destinationNew?.status === "open"
    && destinationNew.isArchived === false
    && sameId(destinationNew.roomId, TARGET.destinationRoomId)
    && sameInstant(destinationNew.startDate, TARGET.periodStart)
    && destinationNew.endDate == null
    && destinationNew.endReading == null
    && Number(destinationNew.startReading) === args.destinationOpening
    && Number(destinationNew.ratePerUnit) === TARGET.ratePerUnit,
  "IDEMPOTENCY_STATE_MISMATCH", "GP-1008 replacement period no longer matches.");
  assertRepair(sourceReading?.readingStatus === "locked"
    && sourceReading.eventType === "periodStart"
    && sourceReading.isArchived === false
    && sameId(sourceReading.roomId, TARGET.sourceRoomId)
    && sameId(sourceReading.utilityPeriodId, REPLACEMENT_IDS.sourcePeriodId)
    && sameInstant(sourceReading.date, TARGET.periodStart)
    && Number(sourceReading.reading) === args.sourceOpening,
  "IDEMPOTENCY_STATE_MISMATCH", "GP-705 replacement boundary no longer matches.");
  assertRepair(destinationReading?.readingStatus === "locked"
    && destinationReading.eventType === "periodStart"
    && destinationReading.isArchived === false
    && sameId(destinationReading.roomId, TARGET.destinationRoomId)
    && sameId(destinationReading.utilityPeriodId, REPLACEMENT_IDS.destinationPeriodId)
    && sameInstant(destinationReading.date, TARGET.periodStart)
    && Number(destinationReading.reading) === args.destinationOpening,
  "IDEMPOTENCY_STATE_MISMATCH", "GP-1008 replacement boundary no longer matches.");
  const activeIds = state.activePeriods.map((period) => sid(period._id)).sort();
  assertRepair(comparable(activeIds) === comparable([
    REPLACEMENT_IDS.sourcePeriodId,
    REPLACEMENT_IDS.destinationPeriodId,
  ].sort()), "IDEMPOTENCY_STATE_MISMATCH", "Applied repair no longer has exactly the two approved active periods.");
  return {
    mode: args.write ? "write-authorized" : "dry-run",
    status: "ALREADY_APPLIED",
    repairKey: REPAIR_KEY,
    auditLogId: REPLACEMENT_IDS.auditLogId,
    replacementIds: REPLACEMENT_IDS,
  };
}

const DEFAULT_MODELS = Object.freeze({
  AuditLog,
  Bill,
  Contract,
  Payment,
  Reservation,
  Room,
  ScheduledRoomTransfer,
  Stay,
  UtilityFinalization,
  UtilityPeriod,
  UtilityReading,
});

export async function runTargetedUtilityRepair({
  args,
  models = DEFAULT_MODELS,
  mongooseInstance = mongoose,
  deps = {
    createOpenPeriod: createOpenUtilityPeriodWithBoundary,
    resolvePeriodState: resolveUtilityPeriodState,
  },
  now = () => new Date(),
  hooks = {},
} = {}) {
  assertRepair(args && typeof args === "object", "INVALID_ARGUMENT", "Validated repair arguments are required.");
  if (args.write && args.confirmToken !== CONFIRM_TOKEN) {
    fail("WRITE_CONFIRMATION_REQUIRED", `Write mode requires --confirm-token ${CONFIRM_TOKEN}.`);
  }

  const initial = await loadState({ models });
  if (initial.repairAudit) return validateAlreadyApplied({ models, state: initial, args });
  validatePreconditions(initial, args);
  const repairAt = now();
  const preview = buildRepairPreview(initial, args, repairAt);
  if (!args.write) return preview;

  const session = await mongooseInstance.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const state = await loadState({ models, session });
      if (state.repairAudit) {
        result = await validateAlreadyApplied({ models, state, args, session });
        return;
      }
      validatePreconditions(state, args);
      const beforeUntouched = untouchedSnapshot(state);
      const actorId = objectId(args.actorId || state.schedule.scheduledBy);

      await conditionalArchive(models.UtilityPeriod, {
        _id: objectId(TARGET.sourcePeriodId),
        status: "closed",
        isArchived: false,
        updatedAt: args.expectedSourceUpdatedAt,
      }, "GP-705 erroneous period", session);
      await conditionalArchive(models.UtilityReading, {
        _id: objectId(TARGET.sourceStartReadingId),
        utilityPeriodId: objectId(TARGET.sourcePeriodId),
        isArchived: false,
        updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceStartReadingId]),
      }, "GP-705 periodStart reading", session);
      await conditionalArchive(models.UtilityReading, {
        _id: objectId(TARGET.sourceEndReadingId),
        utilityPeriodId: objectId(TARGET.sourcePeriodId),
        isArchived: false,
        updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.sourceEndReadingId]),
      }, "GP-705 periodEnd reading", session);
      await conditionalArchive(models.Bill, {
        _id: objectId(TARGET.sourceBillId),
        status: "draft",
        isArchived: false,
        paidAmount: 0,
        sentAt: null,
        issuedAt: null,
        updatedAt: args.expectedBillUpdatedAt,
      }, "GP-705 draft Bill", session);
      await conditionalArchive(models.UtilityPeriod, {
        _id: objectId(TARGET.destinationPeriodId),
        status: "closed",
        isArchived: false,
        updatedAt: args.expectedDestinationUpdatedAt,
      }, "GP-1008 erroneous period", session);
      await conditionalArchive(models.UtilityReading, {
        _id: objectId(TARGET.destinationStartReadingId),
        utilityPeriodId: objectId(TARGET.destinationPeriodId),
        isArchived: false,
        updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationStartReadingId]),
      }, "GP-1008 periodStart reading", session);
      await conditionalArchive(models.UtilityReading, {
        _id: objectId(TARGET.destinationEndReadingId),
        utilityPeriodId: objectId(TARGET.destinationPeriodId),
        isArchived: false,
        updatedAt: new Date(EXPECTED_READING_UPDATED_AT[TARGET.destinationEndReadingId]),
      }, "GP-1008 periodEnd reading", session);

      const sourcePeriod = await deps.createOpenPeriod({
        utilityType: "electricity",
        room: state.sourceRoom,
        startDate: new Date(TARGET.periodStart),
        startReading: args.sourceOpening,
        ratePerUnit: TARGET.ratePerUnit,
        actorId,
        periodId: objectId(REPLACEMENT_IDS.sourcePeriodId),
        boundaryReadingId: objectId(REPLACEMENT_IDS.sourceStartReadingId),
        session,
        serialize: false,
      });
      const destinationPeriod = await deps.createOpenPeriod({
        utilityType: "electricity",
        room: state.destinationRoom,
        startDate: new Date(TARGET.periodStart),
        startReading: args.destinationOpening,
        ratePerUnit: TARGET.ratePerUnit,
        actorId,
        periodId: objectId(REPLACEMENT_IDS.destinationPeriodId),
        boundaryReadingId: objectId(REPLACEMENT_IDS.destinationStartReadingId),
        session,
        serialize: false,
      });
      assertRepair(sameId(sourcePeriod._id, REPLACEMENT_IDS.sourcePeriodId) && sameId(destinationPeriod._id, REPLACEMENT_IDS.destinationPeriodId), "POSTCONDITION_FAILED", "Canonical lifecycle service did not use the preallocated period IDs.");

      const auditMetadata = {
        repairKey: REPAIR_KEY,
        scheduleId: TARGET.scheduleId,
        sourceRoomId: TARGET.sourceRoomId,
        destinationRoomId: TARGET.destinationRoomId,
        archivedRecordIds: [
          TARGET.sourcePeriodId,
          TARGET.sourceStartReadingId,
          TARGET.sourceEndReadingId,
          TARGET.sourceBillId,
          TARGET.destinationPeriodId,
          TARGET.destinationStartReadingId,
          TARGET.destinationEndReadingId,
        ],
        newPeriodIds: [REPLACEMENT_IDS.sourcePeriodId, REPLACEMENT_IDS.destinationPeriodId],
        newReadingIds: [REPLACEMENT_IDS.sourceStartReadingId, REPLACEMENT_IDS.destinationStartReadingId],
        sourceEvidence: args.sourceEvidence,
        destinationEvidence: args.destinationEvidence,
        sourceOpening: args.sourceOpening,
        destinationOpening: args.destinationOpening,
        actorId: sid(actorId),
        timestamp: repairAt,
        beforeAfter: preview.records,
        untouchedStateHash: stateDigest(beforeUntouched),
        confirmToken: CONFIRM_TOKEN,
        scriptVersion: SCRIPT_VERSION,
        repairNote: args.repairNote || null,
      };
      await models.AuditLog.create([{
        _id: objectId(REPLACEMENT_IDS.auditLogId),
        logId: REPLACEMENT_IDS.auditLogIdText,
        timestamp: repairAt,
        type: "data_modification",
        action: "targeted utility lifecycle data repair",
        severity: "critical",
        user: `actor:${sid(actorId)}`,
        userId: actorId,
        userRole: "system",
        branch: "gil-puyat",
        details: args.repairNote || "Archived two accidental immediately-closed electricity cycles and created evidence-backed canonical open replacements; no transfer, occupancy, contract, payment, or settlement state changed.",
        metadata: auditMetadata,
        entityType: "utility",
        entityId: TARGET.scheduleId,
      }], { session });

      if (hooks.afterMutations) await hooks.afterMutations({ session, models });
      await validatePostWrite({ models, session, args, beforeUntouched, deps });
      result = {
        ...preview,
        mode: "write",
        status: "APPLIED",
        replacementIds: REPLACEMENT_IDS,
      };
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function main() {
  const args = parseRepairArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) fail("CONFIGURATION_ERROR", "MONGODB_URI or MONGO_URI is required.");
  await mongoose.connect(mongoUri, {
    ...(process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {}),
    autoCreate: false,
    autoIndex: false,
    retryWrites: args.write,
    readPreference: args.write ? "primary" : "primaryPreferred",
    appName: `lilycrest-${REPAIR_KEY}`,
  });
  try {
    const result = await runTargetedUtilityRepair({ args });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(async (error) => {
    const payload = {
      status: "ABORTED",
      code: error?.code || "TARGETED_UTILITY_REPAIR_FAILED",
      message: error?.message || "Targeted utility repair failed.",
      details: error?.details || {},
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}
