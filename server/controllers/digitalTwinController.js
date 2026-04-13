/**
 * ============================================================================
 * DIGITAL TWIN CONTROLLER
 * ============================================================================
 *
 * Aggregation endpoints that unify Room, Reservation, Bill, and
 * MaintenanceRequest data into a single "digital twin" view of each branch.
 *
 * Two endpoints:
 *   GET /api/digital-twin/snapshot?branch=  — branch overview with all rooms
 *   GET /api/digital-twin/room/:roomId      — single room deep-dive
 *
 * ============================================================================
 */

import Room from "../models/Room.js";
import Reservation from "../models/Reservation.js";
import Bill from "../models/Bill.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import BillingPeriod from "../models/BillingPeriod.js";
import {
  OPEN_MAINTENANCE_STATUSES,
  formatMaintenanceTypeLabel,
} from "../config/maintenance.js";
import { deriveRoomOccupancyState } from "../utils/occupancyManager.js";
import {
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  hasReservationStatus,
} from "../utils/lifecycleNaming.js";

// ============================================================================
// HEALTH SCORE CALCULATION
// ============================================================================

/**
 * Compute a 0–100 health score for a room based on operational signals.
 *
 * Scoring:
 *   Start at 100
 *   -15 per open maintenance request
 *   -10 extra per HIGH urgency request
 *   -20 per overdue bill
 *   +10 bonus if every bill is paid
 *   Clamped to [0, 100]
 */
function computeHealthScore(maintenanceRequests, bills) {
  let score = 100;

  // Maintenance penalties
  const openRequests = maintenanceRequests.filter((r) =>
    OPEN_MAINTENANCE_STATUSES.includes(r.status),
  );
  score -= openRequests.length * 15;

  const highUrgency = openRequests.filter((r) => r.urgency === "high");
  score -= highUrgency.length * 10;

  // Billing penalties
  const overdueBills = bills.filter((b) => b.status === "overdue");
  score -= overdueBills.length * 20;

  // Bonus: all bills paid
  if (bills.length > 0 && bills.every((b) => b.status === "paid")) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Map a health score to a status label and color tier.
 */
function getHealthTier(score) {
  if (score >= 80) return { label: "Healthy", tier: "good" };
  if (score >= 50) return { label: "Warning", tier: "warning" };
  return { label: "Critical", tier: "critical" };
}

// ============================================================================
// GET /api/digital-twin/snapshot
// ============================================================================

/**
 * Returns a full branch snapshot with all rooms enriched with:
 *  - bed states (from Room.beds)
 *  - active tenant names (from Reservation → User)
 *  - open maintenance count + details
 *  - billing summary (overdue count, total owed)
 *  - computed health score
 */
export const getSnapshot = async (req, res) => {
  try {
    const { branch } = req.query;

    // Build room filter
    const roomFilter = { isArchived: false };
    if (branch && branch !== "all") roomFilter.branch = branch;

    // Parallel queries (bills scoped after we have active reservation IDs)
    const [rooms, activeReservations, openMaintenance] = await Promise.all([
      Room.find(roomFilter).lean(),
      Reservation.find({
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
        isArchived: false,
        ...(branch && branch !== "all" ? { branch } : {}),
      })
        .populate("userId", "firstName lastName email")
        .lean(),
      MaintenanceRequest.find({
        status: { $in: OPEN_MAINTENANCE_STATUSES },
        isArchived: false,
        ...(branch && branch !== "all" ? { branch } : {}),
      }).lean(),
    ]);

    // Fetch bills only for active reservations (prevents past-tenant bills from skewing KPIs)
    // Also excludes draft bills — they haven't been officially issued yet
    const activeReservationIds = activeReservations.map((r) => r._id);
    const currentBills =
      activeReservationIds.length > 0
        ? await Bill.find({
            reservationId: { $in: activeReservationIds },
            status: { $ne: "draft" },
            isArchived: false,
          })
            .sort({ billingMonth: -1 })
            .lean()
        : [];

    // Stale open billing periods (open > 20 days = past the ~15th reading window)
    const STALE_DAYS = 20;
    const openPeriods = await BillingPeriod.find({
      status: "open",
      isArchived: false,
      ...(branch && branch !== "all" ? { branch } : {}),
    }).lean();
    const now = Date.now();
    const stalePeriodsByRoom = {};
    for (const p of openPeriods) {
      const daysOpen = Math.floor((now - new Date(p.startDate)) / 86_400_000);
      if (daysOpen > STALE_DAYS) {
        stalePeriodsByRoom[String(p.roomId)] = daysOpen;
      }
    }

    // Index reservations, bills, and maintenance by roomId for fast lookup
    const reservationsByRoom = {};
    for (const r of activeReservations) {
      const key = String(r.roomId);
      if (!reservationsByRoom[key]) reservationsByRoom[key] = [];
      reservationsByRoom[key].push(r);
    }

    const billsByRoom = {};
    for (const b of currentBills) {
      const key = String(b.roomId);
      if (!billsByRoom[key]) billsByRoom[key] = [];
      billsByRoom[key].push(b);
    }

    const maintenanceByRoom = {};
    for (const m of openMaintenance) {
      const key = String(m.roomId);
      if (!maintenanceByRoom[key]) maintenanceByRoom[key] = [];
      maintenanceByRoom[key].push(m);
    }

    // Enrich each room
    const enrichedRooms = rooms.map((room) => {
      const roomId = String(room._id);
      const roomReservations = reservationsByRoom[roomId] || [];
      const roomBills = billsByRoom[roomId] || [];
      const occupancy = deriveRoomOccupancyState(room, roomReservations);

      // Separate physical occupancy (moved in) from reservations
      // "reserved" = paid deposit, confirmed, but NOT yet physically present
      const physicalOccupancy = occupancy.physicalOccupancy;
      const reservedCount = occupancy.reservedCount;
      const roomMaintenance = maintenanceByRoom[roomId] || [];

      const overdueBills = roomBills.filter((b) => b.status === "overdue");
      const pendingBills = roomBills.filter((b) =>
        ["pending", "partially-paid"].includes(b.status),
      );
      const totalOwed = [...overdueBills, ...pendingBills].reduce(
        (sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)),
        0,
      );

      const healthScore = computeHealthScore(roomMaintenance, roomBills);
      const healthTier = getHealthTier(healthScore);

      return {
        _id: room._id,
        name: room.name,
        roomNumber: room.roomNumber,
        branch: room.branch,
        floor: room.floor,
        type: room.type,
        capacity: room.capacity,
        currentOccupancy: occupancy.currentOccupancy,
        reservedCount,
        physicalOccupancy,
        available: occupancy.available,
        readinessStatus: occupancy.readinessStatus,
        beds: (() => {
          // Build enriched beds array with display status inferred from live reservations
          const enrichedBeds = room.beds.map((bed) => {
            const matchingRes =
              roomReservations.find((r) => r.selectedBed?.id && r.selectedBed.id === bed.id) ||
              roomReservations.find((r) => String(r.userId?._id) === String(bed.occupiedBy?.userId));

            let displayStatus = bed.status;
            if (matchingRes && displayStatus === "available") {
              displayStatus = hasReservationStatus(matchingRes.status, "moveIn")
                ? "occupied"
                : "reserved";
            }

            return {
              id: bed.id,
              position: bed.position,
              status: displayStatus,
              _matchedResId: matchingRes ? String(matchingRes._id) : null,
              occupant: matchingRes?.userId
                ? {
                    name: `${matchingRes.userId.firstName || ""} ${matchingRes.userId.lastName || ""}`.trim(),
                    since: bed.occupiedBy?.occupiedSince ?? null,
                    reservationStatus: matchingRes.status,
                  }
                : null,
            };
          });

          // Fallback: any reservation not matched to a bed → assign to first still-available slot
          const matchedIds = new Set(enrichedBeds.map((b) => b._matchedResId).filter(Boolean));
          const unmatched = roomReservations.filter((r) => !matchedIds.has(String(r._id)));
          for (const res of unmatched) {
            const freeBed = enrichedBeds.find((b) => b.status === "available");
            if (freeBed) {
              freeBed.status = hasReservationStatus(res.status, "moveIn")
                ? "occupied"
                : "reserved";
              freeBed.occupant = res.userId
                ? {
                    name: `${res.userId.firstName || ""} ${res.userId.lastName || ""}`.trim(),
                    since: null,
                    reservationStatus: res.status,
                  }
                : null;
            }
          }

          // Strip internal helper field
          return enrichedBeds.map(({ _matchedResId, ...bed }) => bed);
        })(),
        beds: occupancy.beds.map((bed) => ({
          id: bed.id,
          position: bed.position,
          status: bed.status,
          lockExpiresAt: bed.lockExpiresAt,
          occupant: bed.occupant
            ? {
                name: bed.occupant.name,
                since: bed.occupant.occupiedSince ?? null,
                reservationStatus: bed.occupant.reservationStatus,
                reservationId: bed.occupant.reservationId,
              }
            : null,
        })),
        electricity: {
          hasStaleOpenPeriod: !!stalePeriodsByRoom[roomId],
          staleOpenDays: stalePeriodsByRoom[roomId] ?? null,
        },
        maintenance: {
          openCount: roomMaintenance.length,
          highUrgencyCount: roomMaintenance.filter(
            (m) => m.urgency === "high",
          ).length,
          items: roomMaintenance.map((m) => ({
            _id: m._id,
            title: `${formatMaintenanceTypeLabel(m.request_type)} Request`,
            category: m.request_type,
            urgency: m.urgency,
            status: m.status,
            createdAt: m.created_at,
          })),
        },
        billing: {
          overdueCount: overdueBills.length,
          pendingCount: pendingBills.length,
          totalOwed,
        },
        health: {
          score: healthScore,
          ...healthTier,
        },
      };
    });

    // Branch-level KPIs
    const totalRooms = enrichedRooms.length;
    const totalCapacity = enrichedRooms.reduce(
      (s, r) => s + r.capacity,
      0,
    );
    const totalOccupancy = enrichedRooms.reduce(
      (s, r) => s + r.currentOccupancy,
      0,
    );
    const atRiskRooms = enrichedRooms.filter(
      (r) => r.health.tier === "critical",
    ).length;
    const warningRooms = enrichedRooms.filter(
      (r) => r.health.tier === "warning",
    ).length;
    const totalOpenMaintenance = openMaintenance.length;
    const totalOwedBranch = enrichedRooms.reduce(
      (s, r) => s + r.billing.totalOwed,
      0,
    );
    const avgHealth =
      totalRooms > 0
        ? Math.round(
            enrichedRooms.reduce((s, r) => s + r.health.score, 0) /
              totalRooms,
          )
        : 100;

    // ── Branch comparison (only when viewing all branches) ──
    let comparison = null;
    if (!branch || branch === "all") {
      const branchGroups = {};
      for (const room of enrichedRooms) {
        const b = room.branch;
        if (!branchGroups[b]) branchGroups[b] = [];
        branchGroups[b].push(room);
      }
      comparison = {};
      for (const [b, bRooms] of Object.entries(branchGroups)) {
        const bCapacity = bRooms.reduce((s, r) => s + r.capacity, 0);
        const bOccupancy = bRooms.reduce((s, r) => s + r.currentOccupancy, 0);
        comparison[b] = {
          totalRooms: bRooms.length,
          avgHealth: bRooms.length > 0
            ? Math.round(bRooms.reduce((s, r) => s + r.health.score, 0) / bRooms.length)
            : 100,
          occupancyRate: bCapacity > 0
            ? Math.round((bOccupancy / bCapacity) * 100)
            : 0,
          openMaintenance: bRooms.reduce((s, r) => s + r.maintenance.openCount, 0),
          totalOwed: bRooms.reduce((s, r) => s + r.billing.totalOwed, 0),
          atRiskRooms: bRooms.filter((r) => r.health.tier === "critical").length,
        };
      }
    }

    res.json({
      success: true,
      data: {
        kpis: {
          overallHealth: avgHealth,
          totalRooms,
          totalCapacity,
          totalOccupancy,
          occupancyRate:
            totalCapacity > 0
              ? Math.round((totalOccupancy / totalCapacity) * 100)
              : 0,
          atRiskRooms,
          warningRooms,
          openMaintenance: totalOpenMaintenance,
          totalOwed: totalOwedBranch,
        },
        rooms: enrichedRooms,
        ...(comparison && { comparison }),
      },
    });
  } catch (error) {
    console.error("Digital twin snapshot error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate digital twin snapshot",
    });
  }
};

// ============================================================================
// GET /api/digital-twin/room/:roomId
// ============================================================================

/**
 * Returns a deep-dive view of a single room with full tenant profiles,
 * maintenance history, and billing timeline.
 */
export const getRoomDetail = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    // Parallel queries for this specific room
    const [reservations, maintenance] = await Promise.all([
      Reservation.find({
        roomId,
        status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
        isArchived: false,
      })
        .populate("userId", "firstName lastName email phone profileImage")
        .lean(),
      MaintenanceRequest.find({ roomId, isArchived: false })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("userId", "firstName lastName")
        .lean(),
    ]);

    // Only fetch bills that belong to currently active reservations
    // This prevents historical bills from past tenants from surfacing
    const activeReservationIds = reservations.map((r) => r._id);
    const bills =
      activeReservationIds.length > 0
        ? await Bill.find({
            reservationId: { $in: activeReservationIds },
            status: { $ne: "draft" },
            isArchived: false,
          })
            .sort({ billingMonth: -1 })
            .limit(12)
            .populate("userId", "firstName lastName")
            .lean()
        : [];

    // Health score
    const openMaintenance = maintenance.filter((m) =>
      OPEN_MAINTENANCE_STATUSES.includes(m.status),
    );
    const healthScore = computeHealthScore(openMaintenance, bills);
    const healthTier = getHealthTier(healthScore);
    const occupancy = deriveRoomOccupancyState(room, reservations);

    // Enrich beds with tenant info
    // Match priority: (1) bed.id matches reservation.selectedBed.id,
    // (2) bed.occupiedBy.userId matches reservation.userId (legacy fallback)
    const enrichedBeds = room.beds.map((bed) => {
      const reservation =
        reservations.find((r) => r.selectedBed?.id && r.selectedBed.id === bed.id) ||
        reservations.find((r) => String(r.userId?._id) === String(bed.occupiedBy?.userId));

      // Determine correct display status:
      // If the DB bed.status is already correct, use it;
      // otherwise infer from reservation status (handles stale data)
      let displayStatus = bed.status;
      if (reservation && displayStatus === "available") {
        displayStatus = hasReservationStatus(reservation.status, "moveIn")
          ? "occupied"
          : "reserved";
      }

      return {
        id: bed.id,
        position: bed.position,
        status: displayStatus,
        occupant: reservation?.userId
          ? {
              _id: reservation.userId._id,
              name: `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim(),
              email: reservation.userId.email,
              phone: reservation.userId.phone,
              since: bed.occupiedBy?.occupiedSince,
              reservationId: reservation._id,
              reservationStatus: reservation.status,
            }
          : null,
      };
    });

    // If there are more reservations than matched beds (selectedBed not set),
    // attach unmatched tenants to the first unoccupied bed slot
    const matchedReservationIds = new Set(
      enrichedBeds.filter((b) => b.occupant).map((b) => String(b.occupant.reservationId))
    );
    const unmatchedReservations = reservations.filter(
      (r) => !matchedReservationIds.has(String(r._id))
    );
    if (unmatchedReservations.length > 0) {
      for (const res of unmatchedReservations) {
        const freeBed = enrichedBeds.find((b) => !b.occupant && b.status === "available");
        if (freeBed) {
          freeBed.status = hasReservationStatus(res.status, "moveIn")
            ? "occupied"
            : "reserved";
          freeBed.occupant = {
            _id: res.userId._id,
            name: `${res.userId.firstName || ""} ${res.userId.lastName || ""}`.trim(),
            email: res.userId.email,
            phone: res.userId.phone,
            since: null,
            reservationId: res._id,
            reservationStatus: res.status,
          };
        }
      }
    }

    // Bills grouped by tenant — skip any orphaned bills (no resolvable userId)
    const tenantBills = {};
    for (const bill of bills) {
      // Skip bills where the userId didn't populate (orphaned/deleted user)
      if (!bill.userId?._id && !bill.userId) continue;
      const key = String(bill.userId?._id || bill.userId);
      // Skip if we can't get a real name (extra safety net)
      const tenantName = bill.userId?.firstName
        ? `${bill.userId.firstName} ${bill.userId.lastName || ""}`.trim()
        : null;
      if (!tenantName) continue;
      if (!tenantBills[key]) {
        tenantBills[key] = { tenantName, bills: [] };
      }
      tenantBills[key].bills.push({
        _id: bill._id,
        billingMonth: bill.billingMonth,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        status: bill.status,
        dueDate: bill.dueDate,
      });
    }

    const physicalOccupancy = occupancy.physicalOccupancy;
    const reservedCount = occupancy.reservedCount;

    res.json({
      success: true,
      data: {
        room: {
          _id: room._id,
          name: room.name,
          roomNumber: room.roomNumber,
          branch: room.branch,
          floor: room.floor,
          type: room.type,
          capacity: room.capacity,
          currentOccupancy: occupancy.currentOccupancy,
          reservedCount,
          physicalOccupancy,
          available: occupancy.available,
          readinessStatus: occupancy.readinessStatus,
          amenities: room.amenities,
          images: room.images,
        },
        beds: occupancy.beds,
        maintenance: maintenance.map((m) => ({
          _id: m._id,
          title: `${formatMaintenanceTypeLabel(m.request_type)} Request`,
          category: m.request_type,
          urgency: m.urgency,
          status: m.status,
          description: m.description,
          createdAt: m.created_at,
          resolvedAt: m.resolved_at,
          completionNote: m.notes,
          submittedBy: m.userId
            ? `${m.userId.firstName || ""} ${m.userId.lastName || ""}`.trim()
            : "Unknown",
        })),
        billing: Object.values(tenantBills),
        health: {
          score: healthScore,
          ...healthTier,
          breakdown: {
            openMaintenance: openMaintenance.length,
            highUrgency: openMaintenance.filter((m) => m.urgency === "high")
              .length,
            overdueBills: bills.filter((b) => b.status === "overdue").length,
            allPaid:
              bills.length > 0 && bills.every((b) => b.status === "paid"),
          },
        },
      },
    });
  } catch (error) {
    console.error("Digital twin room detail error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load room detail",
    });
  }
};
