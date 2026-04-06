import {
  Bill,
  Reservation,
  Room,
  UtilityPeriod,
  UtilityReading,
} from "../models/index.js";
import {
  getUtilityDispatchEntry,
  getUtilityTargetCloseDate,
} from "./billingPolicy.js";
import { getRoomLabel } from "./roomLabel.js";

const WATER_BILLABLE_ROOM_TYPES = new Set([
  "private",
  "double-sharing",
  "quadruple-sharing",
]);

function addIssue(issues, issueCode, status, recommendedAction, extra = {}) {
  issues.push({ issueCode, status, recommendedAction, ...extra });
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
    .filter((r) => r.userId)
    .filter((r) => {
      const key = String(r.userId._id || r.userId);
      if (moveInByTenant.has(key)) return false;
      if (periodStartDate && r.checkInDate && new Date(r.checkInDate) < new Date(periodStartDate)) return false;
      return true;
    })
    .map((r) => ({
      reservationId: r._id,
      tenantId: r.userId._id || r.userId,
      tenantName: r.userId?.firstName
        ? `${r.userId.firstName || ""} ${r.userId.lastName || ""}`.trim()
        : "Tenant",
      checkInDate: r.checkInDate || null,
      status: r.status,
    }));
}

/**
 * Build a room diagnostic object from pre-fetched data (no DB queries).
 */
function buildRoomDiagnostic({ room, utilityType, periods, readings, reservations, billStatusMap }) {
  const issues = [];
  const orphanReadings = readings.filter((r) => !r.utilityPeriodId);
  const openPeriod = periods.find((p) => p.status === "open") || null;
  const latestPeriod = periods[periods.length - 1] || null;
  const latestReading = readings[readings.length - 1] || null;
  const latestReadingValue = latestReading != null && Number.isFinite(latestReading.reading)
    ? latestReading.reading
    : null;
  const periodStartDate = openPeriod?.startDate || periods[0]?.startDate || null;

  const missingAnchors = detectMissingMoveInAnchors({ reservations, readings, periodStartDate });

  if ((reservations.length > 0 || readings.length > 0) && periods.length === 0) {
    addIssue(issues, `${utilityType}_missing_period`, "informational", `Create one open ${utilityType} period to begin tracking.`);
  }
  if (orphanReadings.length > 0) {
    addIssue(issues, `${utilityType}_orphan_readings`, "repair_required", `Attach orphan readings to the room's active ${utilityType} period.`, { readingIds: orphanReadings.map((r) => r._id) });
  }
  if (missingAnchors.length > 0 && utilityType === "electricity") {
    addIssue(issues, "electricity_missing_movein_anchor", "warning", "Missing move-in reading. System will use Graceful Proration Fallback instead of Segment-Based math.", { reservations: missingAnchors.map((e) => e.reservationId) });
  }

  // Compute latestPeriodDisplayStatus using the pre-fetched billStatusMap
  let latestPeriodDisplayStatus = null;
  if (openPeriod) {
    latestPeriodDisplayStatus = "open";
  } else if (latestPeriod) {
    const summaryBillIds = (latestPeriod.tenantSummaries || []).map((s) => String(s.billId)).filter(Boolean);
    if (summaryBillIds.length === 0) {
      latestPeriodDisplayStatus = latestPeriod.revised ? "revised" : (latestPeriod.status || "closed");
    } else {
      const linkedBills = summaryBillIds
        .map((id) => billStatusMap.get(id))
        .filter(Boolean);
      const hasDraft = linkedBills.some(
        (bill) => getUtilityDispatchEntry(bill, utilityType).state !== "sent",
      );
      const hasSent = linkedBills.some(
        (bill) => getUtilityDispatchEntry(bill, utilityType).state === "sent",
      );
      if (hasDraft) latestPeriodDisplayStatus = "ready";
      else if (hasSent) latestPeriodDisplayStatus = "finalized";
      else latestPeriodDisplayStatus = latestPeriod.revised ? "revised" : (latestPeriod.status || "closed");
    }
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
    hasActiveTenants: reservations.some((r) => r.status === "checked-in"),
    activeTenantCount: reservations.filter((r) => r.status === "checked-in").length,
    reservationIds: reservations.map((r) => r._id),
    latestReading: latestReadingValue,
    hasOpenPeriod: Boolean(openPeriod),
    orphanReadingIds: orphanReadings.map((r) => r._id),
    openPeriodId: openPeriod?._id || null,
    latestPeriodId: latestPeriod?._id || null,
    latestPeriodDisplayStatus,
    targetCloseDate: openPeriod ? getUtilityTargetCloseDate(openPeriod.startDate) : null,
    issueCodes: issues.map((i) => i.issueCode),
    missingMoveInAnchors: missingAnchors,
    issues,
  };
}

/**
 * Single-room diagnostics (used when inspecting a specific room's detail view).
 */
export async function getUtilityRoomDiagnostics(roomId, utilityType) {
  const room = await Room.findById(roomId).select("name roomNumber branch type capacity").lean();
  if (!room) return null;

  const [periods, readings, reservations] = await Promise.all([
    UtilityPeriod.find({ roomId: room._id, utilityType, isArchived: false }).sort({ startDate: 1 }).lean(),
    UtilityReading.find({ roomId: room._id, utilityType, isArchived: false }).sort({ date: 1, createdAt: 1 }).lean(),
    Reservation.find({ roomId: room._id, status: { $in: ["checked-in", "checked-out"] }, isArchived: { $ne: true } })
      .populate("userId", "firstName lastName").lean(),
  ]);

  const allBillIds = periods.flatMap((p) => (p.tenantSummaries || []).map((s) => s.billId)).filter(Boolean);
  const billStatusMap = new Map();
  if (allBillIds.length > 0) {
    const bills = await Bill.find({ _id: { $in: allBillIds } })
      .select("status utilityDispatch sentAt issuedAt dueDate charges")
      .lean();
    for (const b of bills) billStatusMap.set(String(b._id), b);
  }

  return buildRoomDiagnostic({ room, utilityType, periods, readings, reservations, billStatusMap });
}

/**
 * Bulk diagnostics for the room list sidebar.
 * Uses exactly 5 DB queries regardless of how many rooms exist.
 */
export async function getUtilityDiagnostics({ branch = null } = {}) {
  const roomFilter = { isArchived: false };
  if (branch) roomFilter.branch = branch;

  // Query 1: All rooms
  const allRooms = await Room.find(roomFilter).select("_id name roomNumber branch type capacity").lean();
  const roomIds = allRooms.map((r) => r._id);

  // Queries 2-4: Bulk fetch all related data in parallel
  const [allPeriods, allReadings, allReservations] = await Promise.all([
    UtilityPeriod.find({ roomId: { $in: roomIds }, isArchived: false }).sort({ startDate: 1 }).lean(),
    UtilityReading.find({ roomId: { $in: roomIds }, isArchived: false }).sort({ date: 1, createdAt: 1 }).lean(),
    Reservation.find({ roomId: { $in: roomIds }, status: { $in: ["checked-in", "checked-out"] }, isArchived: { $ne: true } })
      .populate("userId", "firstName lastName").lean(),
  ]);

  // Query 5: All bill statuses for all periods
  const allBillIds = allPeriods.flatMap((p) => (p.tenantSummaries || []).map((s) => s.billId)).filter(Boolean);
  const billStatusMap = new Map();
  if (allBillIds.length > 0) {
    const bills = await Bill.find({ _id: { $in: allBillIds } })
      .select("status utilityDispatch sentAt issuedAt dueDate charges")
      .lean();
    for (const b of bills) billStatusMap.set(String(b._id), b);
  }

  // Group by roomId in memory
  const periodsByRoom    = new Map();
  const readingsByRoom   = new Map();
  const reservationsByRoom = new Map();

  for (const p of allPeriods) {
    const key = String(p.roomId);
    if (!periodsByRoom.has(key)) periodsByRoom.set(key, { electricity: [], water: [] });
    const group = periodsByRoom.get(key);
    if (p.utilityType === "electricity") group.electricity.push(p);
    else if (p.utilityType === "water") group.water.push(p);
  }
  for (const r of allReadings) {
    const key = String(r.roomId);
    if (!readingsByRoom.has(key)) readingsByRoom.set(key, { electricity: [], water: [] });
    const group = readingsByRoom.get(key);
    if (r.utilityType === "electricity") group.electricity.push(r);
    else if (r.utilityType === "water") group.water.push(r);
  }
  for (const r of allReservations) {
    const key = String(r.roomId);
    if (!reservationsByRoom.has(key)) reservationsByRoom.set(key, []);
    reservationsByRoom.get(key).push(r);
  }

  // Build all diagnostic objects in memory (zero additional DB queries)
  const electricityRooms = allRooms.map((room) => {
    const key = String(room._id);
    return buildRoomDiagnostic({
      room, utilityType: "electricity",
      periods: periodsByRoom.get(key)?.electricity || [],
      readings: readingsByRoom.get(key)?.electricity || [],
      reservations: reservationsByRoom.get(key) || [],
      billStatusMap,
    });
  }).filter(Boolean);

  const waterRooms = allRooms
    .filter((room) => WATER_BILLABLE_ROOM_TYPES.has(room.type))
    .map((room) => {
      const key = String(room._id);
      return buildRoomDiagnostic({
        room, utilityType: "water",
        periods: periodsByRoom.get(key)?.water || [],
        readings: readingsByRoom.get(key)?.water || [],
        reservations: reservationsByRoom.get(key) || [],
        billStatusMap,
      });
    }).filter(Boolean);

  return {
    generatedAt: new Date(),
    summary: {
      electricityRoomCount: electricityRooms.length,
      electricityIssueCount: electricityRooms.reduce((sum, r) => sum + r.issues.length, 0),
      waterRoomCount: waterRooms.length,
      waterIssueCount: waterRooms.reduce((sum, r) => sum + r.issues.length, 0),
    },
    electricityRooms,
    waterRooms,
  };
}
