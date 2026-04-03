import {
  Reservation,
  Room,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import { getUtilityTargetCloseDate } from "./billingPolicy.js";
import { getRoomLabel } from "./roomLabel.js";

const WATER_BILLABLE_ROOM_TYPES = new Set(["private", "double-sharing"]);

function addIssue(issues, issueCode, status, recommendedAction, extra = {}) {
  issues.push({
    issueCode,
    status,
    recommendedAction,
    ...extra,
  });
}

export function detectMissingMoveInAnchors({
  reservations = [],
  readings = [],
  periodStartDate = null,
}) {
  const moveInByTenant = new Map();

  for (const reading of readings) {
    if (reading.eventType !== "move-in" || !reading.tenantId) continue;
    const key = String(reading.tenantId);
    const current = moveInByTenant.get(key);
    if (!current || new Date(reading.date) < new Date(current.date)) {
      moveInByTenant.set(key, reading);
    }
  }

  return reservations
    .filter((reservation) => reservation.userId)
    .filter((reservation) => {
      const key = String(reservation.userId._id || reservation.userId);
      if (moveInByTenant.has(key)) return false;

      if (
        periodStartDate &&
        reservation.checkInDate &&
        new Date(reservation.checkInDate) < new Date(periodStartDate)
      ) {
        return false;
      }

      return true;
    })
    .map((reservation) => ({
      reservationId: reservation._id,
      tenantId: reservation.userId._id || reservation.userId,
      tenantName: reservation.userId?.firstName
        ? `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim()
        : "Tenant",
      checkInDate: reservation.checkInDate || null,
      status: reservation.status,
    }));
}

export async function getUtilityRoomDiagnostics(roomId, utilityType) {
  const room = await Room.findById(roomId)
    .select("name roomNumber branch type capacity")
    .lean();

  if (!room) return null;

  const [periods, readings, reservations] = await Promise.all([
    UtilityPeriod.find({ roomId: room._id, utilityType, isArchived: false })
      .sort({ startDate: 1 })
      .lean(),
    UtilityReading.find({ roomId: room._id, utilityType, isArchived: false })
      .sort({ date: 1, createdAt: 1 })
      .lean(),
    Reservation.find({
      roomId: room._id,
      status: { $in: ["checked-in", "checked-out"] },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName")
      .lean(),
  ]);

  const issues = [];
  const orphanReadings = readings.filter((reading) => !reading.utilityPeriodId);
  const openPeriod = periods.find((period) => period.status === "open") || null;
  const latestPeriod = periods[periods.length - 1] || null;
  const latestReading = readings[readings.length - 1] || null;
  const periodStartDate = openPeriod?.startDate || periods[0]?.startDate || null;
  
  const missingAnchors = detectMissingMoveInAnchors({
    reservations,
    readings,
    periodStartDate,
  });

  if ((reservations.length > 0 || readings.length > 0) && periods.length === 0) {
    addIssue(
      issues,
      `${utilityType}_missing_period`,
      "informational",
      `Create one open ${utilityType} period to begin tracking.`,
    );
  }

  if (orphanReadings.length > 0) {
    addIssue(
      issues,
      `${utilityType}_orphan_readings`,
      "repair_required",
      `Attach orphan readings to the room's active ${utilityType} period.`,
      { readingIds: orphanReadings.map((reading) => reading._id) },
    );
  }

  if (missingAnchors.length > 0 && utilityType === "electricity") {
    addIssue(
      issues,
      "electricity_missing_movein_anchor",
      "warning", 
      "Missing move-in reading. System will use Graceful Proration Fallback instead of Segment-Based math.",
      { reservations: missingAnchors.map((entry) => entry.reservationId) },
    );
  }

  return {
    entityType: `${utilityType}_room`,
    entityId: room._id,
    roomId: room._id,
    id: room._id,
    roomName: getRoomLabel(room),
    name: room.name,
    roomNumber: room.roomNumber,
    branch: room.branch,
    type: room.type,
    capacity: room.capacity,
    status: issues.length ? "needs_repair" : "ok",
    hasActiveTenants: reservations.some((reservation) => reservation.status === "checked-in"),
    activeTenantCount: reservations.filter((reservation) => reservation.status === "checked-in").length,
    reservationIds: reservations.map((reservation) => reservation._id),
    latestReading: latestReading?.reading ?? null,
    hasOpenPeriod: Boolean(openPeriod),
    orphanReadingIds: orphanReadings.map((reading) => reading._id),
    openPeriodId: openPeriod?._id || null,
    latestPeriodDisplayStatus: openPeriod
      ? "open"
      : latestPeriod?.revised
        ? "revised"
        : latestPeriod?.status || null,
    targetCloseDate: openPeriod ? getUtilityTargetCloseDate(openPeriod.startDate) : null,
    issueCodes: issues.map((issue) => issue.issueCode),
    missingMoveInAnchors: missingAnchors,
    issues,
  };
}

export async function getUtilityDiagnostics({ branch = null } = {}) {
  const roomFilter = { isArchived: false };
  if (branch) roomFilter.branch = branch;

  const visibleRooms = await Room.find({
    ...roomFilter,
  })
    .select("_id type")
    .lean();

  const electricityRooms = (
    await Promise.all(
      visibleRooms.map((room) => getUtilityRoomDiagnostics(room._id, "electricity")),
    )
  ).filter(Boolean);

  const waterRooms = (
    await Promise.all(
      visibleRooms
        .filter((room) => WATER_BILLABLE_ROOM_TYPES.has(room.type))
        .map((room) => getUtilityRoomDiagnostics(room._id, "water")),
    )
  ).filter(Boolean);

  return {
    generatedAt: new Date(),
    summary: {
      electricityRoomCount: electricityRooms.length,
      electricityIssueCount: electricityRooms.reduce(
        (sum, room) => sum + room.issues.length,
        0,
      ),
      waterRoomCount: waterRooms.length,
      waterIssueCount: waterRooms.reduce(
        (sum, room) => sum + room.issues.length,
        0,
      ),
    },
    electricityRooms,
    waterRooms,
  };
}
