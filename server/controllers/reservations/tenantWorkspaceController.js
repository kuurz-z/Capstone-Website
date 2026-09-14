/**
 * ============================================================================
 * TENANT WORKSPACE CONTROLLER
 * ============================================================================
 *
 * Controller for tenant workspace queries, active resident status, and action context.
 */

import { Reservation, Room, UtilityReading } from "../../models/index.js";
import { ROOM_BRANCHES } from "../../models/index.js";
import logger from "../../middleware/logger.js";
import { sendSuccess, sendError, AppError } from "../../middleware/errorHandler.js";
import {
  isValidObjectId,
  invalidIdResponse,
  handleReservationError,
  reconcileTenantUsersForScope,
} from "../../utils/reservationHelpers.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
} from "../../utils/lifecycleNaming.js";
import {
  buildTenantWorkspaceStats,
} from "../../utils/tenantWorkspace.js";
import { getTenantActionContext as loadTenantActionContext } from "../../utils/tenantActionService.js";
import {
  CURRENT_RESIDENT_FIELDS,
  CURRENT_RESIDENT_USER,
  CURRENT_RESIDENT_ROOM,
  TENANT_WORKSPACE_FIELDS,
  TENANT_WORKSPACE_USER,
  TENANT_WORKSPACE_ROOM,
  findDbUser,
  mapCurrentResident,
  buildResidentStats,
  buildWorkspaceRoomQuery,
  getTenantWorkspaceReservations,
  buildWorkspaceEntries,
  buildTenantWorkspaceEntry,
} from "./_helpers.js";
import { getOpenScheduledRoomTransferForReservation } from "../../services/scheduledRoomTransferView.js";
import { getRoomTransferHistoryForReservation } from "../../services/scheduledRoomTransferHistory.js";
import { getAdminTransferLifecycleForReservation } from "../../services/tenantTransferRequestService.js";

// In-memory throttle for tenant scope reconciliation (prevents redundant MongoDB write scans on repeated GET reads)
const lastScopeReconcileTime = new Map();
const RECONCILE_THROTTLE_MS = 60 * 1000; // 60 seconds

export const throttledReconcileTenantUsersForScope = async ({ branch = null } = {}) => {
  const key = branch || "all";
  const now = Date.now();
  const lastTime = lastScopeReconcileTime.get(key) || 0;
  if (now - lastTime < RECONCILE_THROTTLE_MS) {
    return;
  }
  lastScopeReconcileTime.set(key, now);
  try {
    await reconcileTenantUsersForScope({ branch });
  } catch (err) {
    lastScopeReconcileTime.delete(key);
    throw err;
  }
};

export const getCurrentResidents = async (req, res) => {
  try {
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) {
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });
    }

    if (dbUser.role !== "owner" && dbUser.role !== "branch_admin") {
      return res.status(403).json({
        error: "Access denied. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const requestedBranch = req.query.branch;
    if (
      requestedBranch &&
      requestedBranch !== "all" &&
      !ROOM_BRANCHES.includes(requestedBranch)
    ) {
      return res.status(400).json({
        error: `Invalid branch. Must be one of: ${ROOM_BRANCHES.join(", ")}`,
        code: "INVALID_BRANCH",
      });
    }

    let roomQuery = {};
    if (dbUser.role === "branch_admin") {
      roomQuery.branch = dbUser.branch;
    } else if (requestedBranch && requestedBranch !== "all") {
      roomQuery.branch = requestedBranch;
    }

    await throttledReconcileTenantUsersForScope({
      branch: roomQuery.branch || null,
    });

    const roomIds = await Room.find(roomQuery).distinct("_id");
    const reservations = await Reservation.find({
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      roomId: { $in: roomIds },
      isArchived: { $ne: true },
    })
      .select(CURRENT_RESIDENT_FIELDS)
      .populate(...CURRENT_RESIDENT_USER)
      .populate(...CURRENT_RESIDENT_ROOM)
      .sort({ moveInDate: -1 })
      .lean();

    const now = new Date();
    const residents = reservations.map((reservation) =>
      mapCurrentResident(reservation, now),
    );

    return sendSuccess(res, {
      residents,
      stats: buildResidentStats(residents),
    });
  } catch (error) {
    logger.error(
      { err: error, requestId: req.id },
      "Fetch current residents error",
    );
    return handleReservationError(res, error, "fetch current residents");
  }
};

export const getTenantWorkspace = async (req, res) => {
  try {
    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) {
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });
    }

    if (dbUser.role !== "owner" && dbUser.role !== "branch_admin") {
      return res.status(403).json({
        error: "Access denied. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const roomQuery = await buildWorkspaceRoomQuery({
      dbUser,
      requestedBranch: req.query.branch,
    });

    await throttledReconcileTenantUsersForScope({
      branch: roomQuery.branch || null,
    });

    const reservations = await getTenantWorkspaceReservations({ roomQuery });
    const tenants = await buildWorkspaceEntries(reservations, new Date());

    return sendSuccess(res, {
      tenants,
      stats: buildTenantWorkspaceStats(tenants),
    });
  } catch (error) {
    if (error instanceof AppError) {
      return sendError(
        res,
        error.message,
        error.statusCode,
        error.code,
        error.details,
      );
    }
    logger.error(
      { err: error, requestId: req.id },
      "Fetch tenant workspace error",
    );
    return handleReservationError(res, error, "fetch tenant workspace");
  }
};

export const getTenantWorkspaceById = async (req, res) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) {
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });
    }

    if (dbUser.role !== "owner" && dbUser.role !== "branch_admin") {
      return res.status(403).json({
        error: "Access denied. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const reservation = await Reservation.findById(reservationId)
      .select(TENANT_WORKSPACE_FIELDS)
      .populate(...TENANT_WORKSPACE_USER)
      .populate(...TENANT_WORKSPACE_ROOM)
      .lean();
    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    if (
      dbUser.role === "branch_admin" &&
      reservation.roomId?.branch !== dbUser.branch
    ) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${dbUser.branch} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    const { Bill, BedHistory, Stay, Contract, TenantViolation } = await import("../../models/index.js");
    const [bills, bedHistoryRecords, stayHistory, branchRooms, contracts, violations] = await Promise.all([
      Bill.find({
        $or: [
          { reservationId: reservation._id },
          { userId: reservation.userId?._id || reservation.userId },
          { tenantId: reservation.userId?._id || reservation.userId },
        ],
        isArchived: { $ne: true },
      }).lean(),
      BedHistory.find({
        $or: [
          { reservationId: reservation._id },
          { tenantId: reservation.userId?._id || reservation.userId },
        ],
      })
        .populate("roomId", "name branch")
        .sort({ moveInDate: -1 })
        .lean(),
      Stay.find({ reservationId: reservation._id })
        .sort({ leaseStartDate: -1, createdAt: -1 })
        .lean(),
      Room.find({
        branch: reservation.roomId?.branch || "",
        isArchived: { $ne: true },
      })
        .select("_id beds")
        .lean(),
      Contract.find({
        $or: [
          { reservationId: reservation._id },
          { tenantId: reservation.userId?._id || reservation.userId },
        ],
      })
        .sort({ version: -1, createdAt: -1 })
        .lean(),
      TenantViolation.find({
        $or: [
          { reservationId: reservation._id },
          { tenantId: reservation.userId?._id || reservation.userId },
        ],
        status: { $nin: ["dismissed", "resolved"] },
      })
        .sort({ dateOfIncident: -1, createdAt: -1 })
        .lean(),
    ]);
    const currentStay =
      stayHistory.find((stay) => stay.status === "active") ||
      stayHistory[0] ||
      null;
    const hasAvailableBedsInBranch = branchRooms.some((room) => {
      const availableBeds = (room.beds || [])
        .filter((bed) => bed.status === "available")
        .map((bed) => bed.id || String(bed._id));
      return (
        availableBeds.length > 0 &&
        (String(room._id) !== String(currentStay?.roomId || reservation.roomId?._id || "") ||
          availableBeds.some((bedId) => String(bedId) !== String(currentStay?.bedId || reservation.selectedBed?.id || "")))
      );
    });

    const readAt = new Date();
    await Reservation.updateOne(
      { _id: reservation._id },
      { $set: { lastAdminViewedAt: readAt, isViewedByAdmin: true } },
    );

    const transferLifecycle = await getAdminTransferLifecycleForReservation(
      reservation._id,
    ).catch((e) => {
      logger.warn({ err: e, reservationId: String(reservation._id) }, "resolve canonical tenant transfer lifecycle (non-fatal)");
      return { request: null, scheduledTransfer: null };
    });
    const scheduledRoomTransfer = transferLifecycle.scheduledTransfer
      ? await getOpenScheduledRoomTransferForReservation(reservation._id).catch((e) => {
          logger.warn({ err: e, reservationId: String(reservation._id) }, "serialize scheduled room transfer (non-fatal)");
          return null;
        })
      : null;
    const tenantTransferRequest = transferLifecycle.request;

    // F3 — the complete Room Transfer audit trail for Tenant Details -> History
    // (all ScheduledRoomTransfer statuses + derived legacy immediate transfers).
    // Reuses the BedHistory / Contract / Bill rows already loaded above.
    const roomTransferHistory = await getRoomTransferHistoryForReservation(reservation._id, {
      bedHistory: bedHistoryRecords,
      contracts,
      bills,
    }).catch((e) => {
      logger.warn({ err: e, reservationId: String(reservation._id) }, "resolve room transfer history (non-fatal)");
      return [];
    });

    const tenant = buildTenantWorkspaceEntry({
      reservation: { ...reservation, lastAdminViewedAt: readAt, isViewedByAdmin: true },
      currentStay,
      stayHistory,
      bills,
      bedHistoryRecords,
      contracts,
      violations,
      tenantStatus: reservation.userId?.tenantStatus || "applicant",
      hasAvailableBedsInBranch,
      scheduledRoomTransfer,
      tenantTransferRequest,
      roomTransferHistory,
      now: new Date(),
    });

    return sendSuccess(res, tenant);
  } catch (error) {
    if (error instanceof AppError) {
      return sendError(
        res,
        error.message,
        error.statusCode,
        error.code,
        error.details,
      );
    }
    logger.error(
      { err: error, requestId: req.id },
      "Fetch tenant workspace detail error",
    );
    return handleReservationError(res, error, "fetch tenant details");
  }
};

export const markTenantWorkspaceAsViewed = async (req, res) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) {
      return res
        .status(404)
        .json({ error: "User not found in database", code: "USER_NOT_FOUND" });
    }

    if (dbUser.role !== "owner" && dbUser.role !== "branch_admin") {
      return res.status(403).json({
        error: "Access denied. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const readAt = new Date();
    await Reservation.updateOne(
      { _id: reservationId },
      { $set: { lastAdminViewedAt: readAt, isViewedByAdmin: true } },
    );

    return sendSuccess(res, {
      reservationId,
      lastAdminViewedAt: readAt.toISOString(),
      isViewedByAdmin: true,
    });
  } catch (error) {
    logger.error(
      { err: error, requestId: req.id },
      "Mark tenant workspace as viewed error",
    );
    return handleReservationError(res, error, "mark tenant as viewed");
  }
};

export const getTenantActionContext = async (req, res) => {
  try {
    const { reservationId } = req.params;
    if (!isValidObjectId(reservationId)) return invalidIdResponse(res);

    const dbUser = await findDbUser(req.user.uid);
    if (!dbUser) {
      return res.status(404).json({ error: "User not found in database", code: "USER_NOT_FOUND" });
    }
    if (dbUser.role !== "owner" && dbUser.role !== "branch_admin") {
      return res.status(403).json({
        error: "Access denied. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const includeCandidates =
      req.query?.includeCandidates === "1" || req.query?.includeCandidates === "true";
    const previewParams =
      req.query?.targetRoomId || includeCandidates
        ? {
            targetRoomId: req.query?.targetRoomId ? String(req.query.targetRoomId) : null,
            effectiveTransferDate: req.query.effectiveTransferDate || null,
            includeCandidates,
          }
        : null;
    const context = await loadTenantActionContext(reservationId, previewParams);
    if (!context) {
      return res.status(404).json({ error: "Reservation not found", code: "RESERVATION_NOT_FOUND" });
    }
    if (dbUser.role === "branch_admin" && context.currentStay.branch !== dbUser.branch) {
      return res.status(403).json({
        error: `Access denied. You can only manage reservations for ${dbUser.branch} branch.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    return sendSuccess(res, context);
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Fetch tenant action context error");
    return handleReservationError(res, error, "fetch tenant action context");
  }
};

/**
 * GET /api/reservations/room-meter-baseline/:roomId
 *
 * Returns the latest electricity UtilityReading for a given room.
 * Used by the Transfer Tenant modal to pre-fill the target room's
 * opening meter baseline without requiring a full tenant action context.
 *
 * Access: Admin only (verifyToken + verifyAdmin enforced at route level)
 */
export const getRoomMeterBaseline = async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!isValidObjectId(roomId)) return invalidIdResponse(res);

    const latest = await UtilityReading.findOne({
      roomId,
      utilityType: "electricity",
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return sendSuccess(res, {
      roomId,
      latestReading: latest
        ? {
            reading: latest.reading,
            date: latest.date,
            eventType: latest.eventType,
          }
        : null,
    });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Fetch room meter baseline error");
    return res.status(500).json({ error: "Failed to fetch meter baseline", code: "FETCH_ERROR" });
  }
};
