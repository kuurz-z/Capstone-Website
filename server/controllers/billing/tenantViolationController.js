import { createExclusiveTenancyRecord } from "../../services/tenancyConflictTransaction.js";
/**
 * ============================================================================
 * TENANT VIOLATION CONTROLLER (Spec §23 & §22)
 * ============================================================================
 *
 * Handles house-rule violations, formal warning tracking, penalty fees,
 * ledger line-item attachments, and escalation to the Termination Review Board.
 *
 * ============================================================================
 */

import mongoose from "mongoose";
import dayjs from "dayjs";
import {
  TenantViolation,
  TerminationReview,
  Reservation,
  Bill,
  User,
  Room,
} from "../../models/index.js";
import { VIOLATION_TYPES } from "../../models/TenantViolation.js";
import { getAdminInfo, resolveAdminUserId, CURRENT_RESIDENT_STATUS_QUERY } from "./_helpers.js";
import logger from "../../middleware/logger.js";
import { logBillingAudit } from "../../utils/billingAudit.js";
import { createNotification } from "../../services/notifications/notificationService.js";

// Helper to format category for bill line-item label
const formatCategoryLabel = (type) => {
  if (!type) return "Rule Infraction";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// Helper to escape regex special characters to prevent ReDoS
export const escapeRegex = (str) => {
  if (typeof str !== "string") return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Helper to sanitize HTML tags and trim text strings to prevent stored XSS
export const sanitizeText = (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]*>?/gm, "")
    .trim();
};

/**
 * Synchronize violation penalty fee to open monthly rent bills or standalone penalty bills.
 * Handles penalty addition, delta updates on in-office modification, and complete reversals.
 *
 * @param {Object} options
 * @param {Object} options.violation - The TenantViolation document.
 * @param {number} [options.previousPenalty=0] - Previous penalty amount before edit.
 * @param {number} [options.newPenalty=0] - New penalty amount after edit.
 * @param {"sync"|"reverse"} [options.action="sync"] - "sync" to update/add, "reverse" to cancel.
 * @returns {Promise<{ attachedBillId: string|null, status: string }>}
 */
export const syncViolationPenaltyToBill = async ({
  violation,
  previousPenalty = 0,
  newPenalty = 0,
  action = "sync",
}) => {
  if (!violation) return { attachedBillId: null, status: "none" };

  const violationShortId = violation._id.toString().slice(-6);
  const violationCategory = formatCategoryLabel(violation.violationType);
  const lineItemName = `Violation Penalty: ${violationCategory} (${violationShortId})`;

  // 1. REVERSE ACTION: Remove from monthly bill and void standalone bills
  if (action === "reverse" || newPenalty === 0) {
    // Reverse from monthly bill if attached
    if (violation.reservationId) {
      try {
        const openBill = await Bill.findOne({
          reservationId: violation.reservationId,
          userId: violation.tenantId,
          status: { $in: ["draft", "pending", "overdue"] },
          isArchived: { $ne: true },
        }).sort({ billingMonth: -1 });

        if (openBill && Array.isArray(openBill.additionalCharges)) {
          const initialCount = openBill.additionalCharges.length;
          const removedCharge = openBill.additionalCharges.find(
            (c) => c.name?.includes(violationShortId),
          );
          const penaltyToRemove = removedCharge ? Number(removedCharge.amount) || previousPenalty : previousPenalty;

          openBill.additionalCharges = openBill.additionalCharges.filter(
            (c) => !c.name?.includes(violationShortId),
          );

          if (openBill.additionalCharges.length < initialCount) {
            openBill.charges = openBill.charges || {};
            openBill.charges.penalty = Math.max(0, Math.round(((Number(openBill.charges.penalty) || 0) - penaltyToRemove) * 100) / 100);
            openBill.totalAmount = Math.max(0, Math.round(((Number(openBill.totalAmount) || 0) - penaltyToRemove) * 100) / 100);
            openBill.remainingAmount = Math.max(0, Math.round(((Number(openBill.remainingAmount) || 0) - penaltyToRemove) * 100) / 100);
            await openBill.save();
            logger.info(`[TenantViolation] Reversed penalty fee ₱${penaltyToRemove} from Bill ${openBill._id}.`);
          }
        }
      } catch (revErr) {
        logger.warn("[TenantViolation] Failed to reverse bill penalty from monthly bill:", revErr);
      }
    }

    // Void standalone penalty bills
    try {
      await Bill.updateMany(
        {
          violationId: violation._id,
          status: { $in: ["draft", "pending", "overdue"] },
          isArchived: { $ne: true },
        },
        {
          $set: {
            status: "voided",
            remainingAmount: 0,
          },
        },
      );
    } catch (stErr) {
      logger.warn("[TenantViolation] Failed to void standalone penalty bill:", stErr);
    }

    return { attachedBillId: null, status: "reversed" };
  }

  // 2. SYNC ACTION (newPenalty > 0)
  const penaltyDelta = Number(newPenalty) - Number(previousPenalty);

  // Check if open monthly rent bill exists
  let openBill = null;
  if (violation.reservationId) {
    try {
      openBill = await Bill.findOne({
        reservationId: violation.reservationId,
        userId: violation.tenantId,
        status: { $in: ["draft", "pending", "overdue"] },
        isArchived: { $ne: true },
      }).sort({ billingMonth: -1 });
    } catch (findErr) {
      logger.warn("[TenantViolation] Failed to find open monthly bill for penalty sync:", findErr);
    }
  }

  if (openBill) {
    openBill.additionalCharges = openBill.additionalCharges || [];
    const existingIndex = openBill.additionalCharges.findIndex(
      (c) => c.name?.includes(violationShortId),
    );

    if (existingIndex >= 0) {
      // Update existing line item
      openBill.additionalCharges[existingIndex].amount = newPenalty;
      openBill.charges = openBill.charges || {};
      openBill.charges.penalty = Math.max(0, Math.round(((Number(openBill.charges.penalty) || 0) + penaltyDelta) * 100) / 100);
      openBill.totalAmount = Math.max(0, Math.round(((Number(openBill.totalAmount) || 0) + penaltyDelta) * 100) / 100);
      openBill.remainingAmount = Math.max(0, Math.round(((Number(openBill.remainingAmount) || 0) + penaltyDelta) * 100) / 100);
    } else {
      // Add new line item
      openBill.additionalCharges.push({
        name: lineItemName,
        amount: newPenalty,
      });
      openBill.charges = openBill.charges || {};
      openBill.charges.penalty = Math.round(((Number(openBill.charges.penalty) || 0) + newPenalty) * 100) / 100;
      openBill.totalAmount = Math.round(((Number(openBill.totalAmount) || 0) + newPenalty) * 100) / 100;
      openBill.remainingAmount = Math.round(((Number(openBill.remainingAmount) || 0) + newPenalty) * 100) / 100;
    }

    await openBill.save();
    logger.info(`[TenantViolation] Synchronized penalty fee ₱${newPenalty} on Bill ${openBill._id}.`);
    return { attachedBillId: openBill._id, status: "synced_monthly" };
  }

  // If no open monthly bill, manage standalone penalty bill
  try {
    let standaloneBill = await Bill.findOne({
      violationId: violation._id,
      status: { $in: ["draft", "pending", "overdue"] },
      isArchived: { $ne: true },
    });

    if (standaloneBill) {
      standaloneBill.charges = standaloneBill.charges || {};
      standaloneBill.charges.penalty = newPenalty;
      standaloneBill.totalAmount = newPenalty;
      standaloneBill.remainingAmount = newPenalty;
      if (Array.isArray(standaloneBill.additionalCharges) && standaloneBill.additionalCharges.length > 0) {
        standaloneBill.additionalCharges[0].amount = newPenalty;
      }
      await standaloneBill.save();
      return { attachedBillId: standaloneBill._id, status: "synced_standalone" };
    } else {
      const newStandalone = new Bill({
        billType: "penalty",
        userId: violation.tenantId,
        reservationId: violation.reservationId || null,
        branch: violation.branch,
        status: "pending",
        totalAmount: newPenalty,
        remainingAmount: newPenalty,
        charges: { penalty: newPenalty },
        dueDate: dayjs().add(7, "day").toDate(),
        violationId: violation._id,
        billingMonth: dayjs().format("YYYY-MM"),
      });
      await newStandalone.save();
      return { attachedBillId: newStandalone._id, status: "created_standalone" };
    }
  } catch (stErr) {
    logger.warn("[TenantViolation] Failed to update/create standalone bill:", stErr);
  }

  return { attachedBillId: null, status: "pending" };
};

/**
 * Automatically syncs and re-sequences violations for tenants to ensure sequential warning counts
 * and confirmed statuses for admin-logged infractions.
 */
export const reconcileTenantViolations = async (tenantId = null) => {
  try {
    const filter = { isArchived: { $ne: true } };
    if (tenantId) filter.tenantId = tenantId;

    const tenantIds = tenantId
      ? [tenantId]
      : await TenantViolation.distinct("tenantId", filter);

    for (const tId of tenantIds) {
      if (!tId) continue;
      const tenantLogs = await TenantViolation.find({
        tenantId: tId,
        isArchived: { $ne: true },
        status: { $ne: "dismissed" },
      }).sort({ dateOfIncident: 1, createdAt: 1 });

      let currentSeq = 1;
      for (const log of tenantLogs) {
        let changed = false;

        if (log.status === "reported" || log.status === "escalated" || !log.adminDecision) {
          log.adminDecision = "confirmed";
          log.adminDecisionReason =
            log.adminDecisionReason ||
            log.evidenceNotes ||
            "Rule infraction confirmed by dormitory administration.";
          log.status = (log.penaltyApplied && Number(log.penaltyApplied) > 0)
            ? "penalty_issued"
            : "warning_issued";
          changed = true;
        }

        if (log.warningNumber !== currentSeq) {
          log.warningNumber = currentSeq;
          changed = true;
        }

        if (changed) {
          await log.save();
        }

        currentSeq++;
      }
    }
  } catch (err) {
    logger.warn("[TenantViolation] reconcileTenantViolations warning:", err);
  }
};

/**
 * GET /api/billing/violations
 * List tenant violation records with filtering, search, and summary metrics.
 */
export const getViolations = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      req.branchFilter ||
      (admin.isOwner && req.query.branch && req.query.branch !== "all"
        ? req.query.branch
        : null);

    if (!branch && !admin.isOwner) {
      return res.status(403).json({ success: false, error: "Access denied. Invalid branch filter." });
    }

    const { status, category, violationType, search, tenantId, reservationId } = req.query;

    // Ensure violations are reconciled for up-to-date sequential warning numbers if querying specific tenant
    if (tenantId) {
      await reconcileTenantViolations(tenantId);
    }

    const filter = { isArchived: false };
    if (branch) filter.branch = branch;
    if (tenantId) filter.tenantId = tenantId;
    if (reservationId) filter.reservationId = reservationId;
    if (status && status !== "all") {
      if (status === "active" || status === "active_confirmed" || status === "warnings") {
        filter.status = { $in: ["confirmed", "warning_issued", "penalty_issued", "reported", "under_review", "awaiting_response"] };
      } else if (status === "resolved_dismissed" || status === "dismissed_resolved" || status === "closed") {
        filter.status = { $in: ["dismissed", "resolved"] };
      } else {
        filter.status = status;
      }
    }
    const cat = category || violationType;
    if (cat && cat !== "all") filter.violationType = cat;

    let tenantIdsFromSearch = null;
    if (search && search.trim()) {
      const q = escapeRegex(search.trim());
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
        ],
      }).select("_id");
      tenantIdsFromSearch = matchingUsers.map((u) => u._id);

      const searchConditions = [
        { locationOfIncident: { $regex: q, $options: "i" } },
        { evidenceNotes: { $regex: q, $options: "i" } },
        { customViolationDescription: { $regex: q, $options: "i" } },
      ];
      if (tenantIdsFromSearch && tenantIdsFromSearch.length > 0) {
        searchConditions.unshift({ tenantId: { $in: tenantIdsFromSearch } });
      }
      filter.$or = searchConditions;
    }

    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const totalCount = await TenantViolation.countDocuments(filter);

    let query = TenantViolation.find(filter)
      .populate("tenantId", "firstName lastName email phone avatar profileImage photoURL")
      .populate({
        path: "reservationId",
        select: "roomId roomNumber branch moveInDate moveOutDate status",
        populate: { path: "roomId", select: "name roomNumber branch type" },
      })
      .populate("reportedBy", "firstName lastName email role")
      .populate("decidedBy", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    if (hasPagination) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const violations = await query.lean();

    // Compute summary KPI metrics for the branch
    const baseFilter = { isArchived: false, ...(branch ? { branch } : {}) };
    const allBranchViolations = await TenantViolation.find(baseFilter).select("status penaltyApplied").lean();

    const activeGroupStatuses = ["confirmed", "warning_issued", "penalty_issued", "reported", "under_review", "awaiting_response"];
    const closedGroupStatuses = ["dismissed", "resolved"];

    const stats = {
      total: allBranchViolations.length,
      activeWarnings: allBranchViolations.filter((v) =>
        activeGroupStatuses.includes(v.status),
      ).length,
      totalPenalties: allBranchViolations.reduce(
        (sum, v) => sum + (Number(v.penaltyApplied) || 0),
        0,
      ),
      tabCounts: {
        all: allBranchViolations.length,
        active: allBranchViolations.filter((v) => activeGroupStatuses.includes(v.status)).length,
        resolved_dismissed: allBranchViolations.filter((v) => closedGroupStatuses.includes(v.status)).length,
      },
    };

    // Format for frontend response
    const formattedData = violations.map((v) => {
      const tenant = v.tenantId || {};
      const resv = v.reservationId || {};
      const room = resv.roomId || {};
      const tenantName = `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant";
      const avatarUrl = tenant.profileImage || tenant.avatar || tenant.photoURL || "";

      return {
        ...v,
        tenantName,
        tenantEmail: tenant.email || "",
        tenantPhone: tenant.phone || "",
        tenantAvatar: avatarUrl,
        tenantProfileImage: avatarUrl,
        roomName: room.name || resv.roomNumber || "Unassigned",
        branch: v.branch,
        reportedByName: v.reportedBy ? `${v.reportedBy.firstName || ""} ${v.reportedBy.lastName || ""}`.trim() : "Staff Admin",
        decidedByName: v.decidedBy ? `${v.decidedBy.firstName || ""} ${v.decidedBy.lastName || ""}`.trim() : null,
      };
    });

    const responsePayload = {
      success: true,
      data: formattedData,
      stats,
    };

    if (hasPagination) {
      responsePayload.pagination = {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      };
    }

    res.json(responsePayload);
  } catch (error) {
    logger.error("[TenantViolation] getViolations error:", error);
    next(error);
  }
};

/**
 * GET /api/billing/violations/active-tenants
 * Returns active checked-in tenants in branch with room info and cumulative warning count.
 */
export const getActiveTenantsForViolations = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const effectiveBranch =
      req.branchFilter ||
      (admin.isOwner && req.query.branch && req.query.branch !== "all"
        ? req.query.branch
        : admin.isOwner
        ? null
        : admin.branch);

    const RESIDENT_STATUSES = [
      "moveIn",
      "reserved",
      "move_in_overdue",
      "checked-in",
      "checked_in",
      "active",
      "approved_for_payment",
      "payment_pending",
      ...CURRENT_RESIDENT_STATUS_QUERY,
    ];

    // Find rooms if branch is specified
    const roomFilter = { isArchived: false };
    if (effectiveBranch) roomFilter.branch = effectiveBranch;
    const rooms = await Room.find(roomFilter).select("_id branch name roomNumber type").lean();
    const roomIds = rooms.map((r) => r._id);

    const reservationFilter = {
      $or: [
        { roomId: { $in: roomIds } },
        ...(effectiveBranch ? [{ branch: effectiveBranch }] : []),
      ],
      status: { $in: RESIDENT_STATUSES },
      isArchived: { $ne: true },
    };

    const reservations = await Reservation.find(reservationFilter)
      .populate("userId", "firstName lastName email phone avatar profileImage photoURL role branch")
      .populate("roomId", "name roomNumber branch type")
      .sort({ moveInDate: -1, createdAt: -1 })
      .lean();

    // Also query all users with role "tenant" in branch/system as secondary fallback
    const userFilter = {
      role: "tenant",
      isArchived: { $ne: true },
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
    };
    const tenantUsers = await User.find(userFilter)
      .select("firstName lastName email phone avatar profileImage photoURL role branch")
      .lean();

    const seenTenantIds = new Set();
    const tenantList = [];

    // 1. Process active reservations
    for (const r of reservations) {
      const u = r.userId;
      if (!u || !u._id) continue;
      const tenantIdStr = u._id.toString();
      if (seenTenantIds.has(tenantIdStr)) continue;
      seenTenantIds.add(tenantIdStr);

      const room = r.roomId || {};
      const warningCount = await TenantViolation.computeWarningCount(u._id);
      const avatarUrl = u.profileImage || u.avatar || u.photoURL || "";

      tenantList.push({
        reservationId: r._id,
        tenantId: u._id,
        fullName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Tenant",
        email: u.email || "",
        phone: u.phone || "",
        profileImage: avatarUrl,
        avatar: avatarUrl,
        roomName: room.name || room.roomNumber || r.roomNumber || "Room",
        roomNumber: room.roomNumber || r.roomNumber || "",
        bedIdentifier: r.bedNumber || r.bedName || r.bedId || "",
        branch: r.branch || room.branch || u.branch || "gil-puyat",
        warningCount,
      });
    }

    // 2. Process any remaining tenant users without an active reservation document
    for (const u of tenantUsers) {
      const tenantIdStr = u._id.toString();
      if (seenTenantIds.has(tenantIdStr)) continue;
      seenTenantIds.add(tenantIdStr);

      const warningCount = await TenantViolation.computeWarningCount(u._id);
      const avatarUrl = u.profileImage || u.avatar || u.photoURL || "";

      tenantList.push({
        reservationId: null,
        tenantId: u._id,
        fullName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Tenant",
        email: u.email || "",
        phone: u.phone || "",
        profileImage: avatarUrl,
        avatar: avatarUrl,
        roomName: "Tenant (No Room Assigned)",
        roomNumber: "",
        bedIdentifier: "",
        branch: u.branch || effectiveBranch || "gil-puyat",
        warningCount,
      });
    }

    res.json({
      success: true,
      data: tenantList,
    });
  } catch (error) {
    logger.error("[TenantViolation] getActiveTenantsForViolations error:", error);
    next(error);
  }
};

/**
 * GET /api/billing/violations/:id
 * Retrieve a single violation record with full audit and evidence detail.
 */
export const getViolationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid violation ID format." });
    }

    const violation = await TenantViolation.findById(id)
      .populate("tenantId", "firstName lastName email phone avatar profileImage")
      .populate({
        path: "reservationId",
        select: "roomId roomNumber branch moveInDate moveOutDate status",
        populate: { path: "roomId", select: "name roomNumber branch type" },
      })
      .populate("reportedBy", "firstName lastName email role")
      .populate("decidedBy", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .populate("escalatedToReviewId")
      .lean();

    if (!violation) {
      return res.status(404).json({ success: false, error: "Tenant violation record not found." });
    }

    const tenant = violation.tenantId || {};
    const resv = violation.reservationId || {};
    const room = resv.roomId || {};

    const formatted = {
      ...violation,
      tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant",
      tenantEmail: tenant.email || "",
      tenantPhone: tenant.phone || "",
      roomName: room.name || resv.roomNumber || "Unassigned",
    };

    res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error("[TenantViolation] getViolationById error:", error);
    next(error);
  }
};

/**
 * POST /api/billing/violations
 * Record a new rule infraction with validation, warning count calculation, and optional billing sync.
 */
export const createViolation = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const adminUserId = await resolveAdminUserId(req, admin);

    if (!adminUserId) {
      return res.status(401).json({
        success: false,
        error: "Authenticated user record not found in system.",
      });
    }

    const {
      tenantId,
      reservationId: providedReservationId,
      violationType,
      customViolationDescription,
      dateOfIncident,
      timeOfIncident,
      locationOfIncident,
      evidenceUrls,
      evidenceUrl,
      evidenceNotes,
      description,
      penaltyApplied,
      penaltyAmount,
      penaltyReason,
      chargeToBill,
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant ID is required." });
    }

    if (!violationType || !VIOLATION_TYPES.includes(violationType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid violation type. Must be one of: ${VIOLATION_TYPES.join(", ")}`,
      });
    }

    if (violationType === "custom" && (!customViolationDescription || !customViolationDescription.trim())) {
      return res.status(400).json({
        success: false,
        error: "A description is required when category is set to Custom Infraction.",
      });
    }

    if (!dateOfIncident) {
      return res.status(400).json({ success: false, error: "Date of incident is required." });
    }

    const incidentDate = new Date(dateOfIncident);
    if (Number.isNaN(incidentDate.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid incident date format." });
    }

    if (dayjs(incidentDate).isAfter(dayjs().endOf("day"))) {
      return res.status(400).json({ success: false, error: "Incident date cannot be in the future." });
    }

    const penaltyNum = Number(penaltyApplied !== undefined ? penaltyApplied : penaltyAmount) || 0;
    if (penaltyNum < 0 || penaltyNum > 100000) {
      return res.status(400).json({
        success: false,
        error: "Penalty fee must be a valid amount between ₱0.00 and ₱100,000.00.",
      });
    }

    if (penaltyNum > 0 && (!penaltyReason || !penaltyReason.trim())) {
      return res.status(400).json({
        success: false,
        error: "A penalty reason is required when a monetary penalty is applied.",
      });
    }

    // Resolve reservation and branch
    let reservation = null;
    if (providedReservationId) {
      reservation = await Reservation.findById(providedReservationId).populate("roomId").lean();
    }
    if (!reservation) {
      reservation = await Reservation.findOne({
        userId: tenantId,
        isArchived: { $ne: true },
      })
        .sort({ moveInDate: -1, createdAt: -1 })
        .populate("roomId")
        .lean();
    }

    const tenantUser = await User.findById(tenantId).lean();
    if (!tenantUser && !reservation) {
      return res.status(404).json({
        success: false,
        error: "Tenant user record not found.",
      });
    }

    const branch =
      req.branchFilter ||
      reservation?.branch ||
      reservation?.roomId?.branch ||
      tenantUser?.branch ||
      admin.branch ||
      "gil-puyat";

    // Compute cumulative warnings
    const priorCount = await TenantViolation.computeWarningCount(tenantId);
    const nextWarningNumber = priorCount + 1;

    // Normalize evidence URLs
    let normalizedUrls = [];
    if (Array.isArray(evidenceUrls)) {
      normalizedUrls = evidenceUrls.filter((u) => typeof u === "string" && u.trim());
    } else if (evidenceUrl && typeof evidenceUrl === "string" && evidenceUrl.trim()) {
      normalizedUrls = [evidenceUrl.trim()];
    }

    const notes = (evidenceNotes || description || "").trim();
    const isPenalty = penaltyNum > 0;
    const initialStatus = isPenalty ? "penalty_issued" : "warning_issued";
    const decisionReasonText = notes || `Rule infraction confirmed and recorded by dormitory administration (${formatCategoryLabel(violationType)}).`;

    // Create the violation record
    const violation = new TenantViolation({
      reservationId: reservation?._id || null,
      tenantId,
      branch,
      violationType,
      customViolationDescription: violationType === "custom" ? customViolationDescription.trim() : null,
      dateOfIncident: incidentDate,
      timeOfIncident: timeOfIncident ? String(timeOfIncident).trim() : null,
      locationOfIncident: locationOfIncident ? String(locationOfIncident).trim() : "",
      status: initialStatus,
      adminDecision: "confirmed",
      adminDecisionReason: decisionReasonText,
      decidedBy: adminUserId,
      decidedAt: new Date(),
      evidenceUrls: normalizedUrls,
      evidenceNotes: notes,
      warningNumber: nextWarningNumber,
      penaltyApplied: isPenalty ? penaltyNum : null,
      penaltyReason: isPenalty ? penaltyReason.trim() : null,
      penaltyApprovedBy: isPenalty ? adminUserId : null,
      reportedBy: adminUserId,
    });

    await violation.save();

    // If penalty is applied, automatically append to tenant's active/open rent bill or create standalone bill
    let attachedBillId = null;
    if (chargeToBill !== false && penaltyNum > 0) {
      try {
        const syncResult = await syncViolationPenaltyToBill({
          violation,
          previousPenalty: 0,
          newPenalty: penaltyNum,
          action: "sync",
        });
        attachedBillId = syncResult.attachedBillId;
      } catch (billError) {
        logger.error("[TenantViolation] Failed to auto-attach penalty to bill:", billError);
      }
    }

    await logBillingAudit({
      action: "LOG_TENANT_VIOLATION",
      actorId: adminUserId,
      targetUserId: tenantId,
      branch,
      details: {
        violationId: violation._id,
        violationType,
        warningNumber: nextWarningNumber,
        penaltyApplied: penaltyNum,
        attachedBillId,
      },
    });

    // Dispatch in-app notification to tenant
    try {
      const categoryLabel = formatCategoryLabel(violationType);
      const penaltyText = penaltyNum > 0 ? ` with an assessed penalty fee of ₱${penaltyNum.toFixed(2)}` : "";
      await createNotification(
        tenantId,
        "tenant_violation",
        `House Rule Warning (#${nextWarningNumber})`,
        `A dormitory rule infraction (${categoryLabel}) was recorded on your account${penaltyText}. Please review your account policies.`,
        { entityType: "violation", entityId: violation._id }
      );
    } catch (notifErr) {
      logger.warn("[TenantViolation] Failed to dispatch tenant in-app notification:", notifErr);
    }

    res.status(201).json({
      success: true,
      message: "Violation record logged successfully.",
      data: violation,
      attachedBillId,
    });
  } catch (error) {
    logger.error("[TenantViolation] createViolation error:", error);
    next(error);
  }
};

/**
 * PATCH /api/billing/violations/:id/decision
 * Admin adjudication: Confirm or dismiss violation, issue warning/penalty, or escalate.
 */
export const updateViolationDecision = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const adminUserId = await resolveAdminUserId(req, admin);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid violation ID format." });
    }
    const {
      decision,
      decisionReason,
      status,
      targetStatus: rawTargetStatus,
      penaltyApplied,
      penaltyReason,
      resolution,
      chargeToBill,
    } = req.body;

    const targetStatus = status || rawTargetStatus;

    if (!["confirmed", "dismissed"].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: "Decision must be either 'confirmed' or 'dismissed'.",
      });
    }

    if (!decisionReason || !decisionReason.trim()) {
      return res.status(400).json({
        success: false,
        error: "A formal reason is required for the admin decision.",
      });
    }

    const violation = await TenantViolation.findById(id);
    if (!violation) {
      return res.status(404).json({ success: false, error: "Violation record not found." });
    }

    // Branch guard
    if (req.branchFilter && violation.branch !== req.branchFilter) {
      return res.status(403).json({ success: false, error: "Unauthorized for this branch." });
    }

    violation.adminDecision = decision;
    violation.adminDecisionReason = decisionReason.trim();
    violation.decidedBy = adminUserId;
    violation.decidedAt = new Date();

    if (decision === "dismissed") {
      violation.status = "dismissed";
      violation.resolution = resolution ? resolution.trim() : "Infraction dismissed upon administrative review.";
      violation.resolvedBy = adminUserId;
      violation.resolvedAt = new Date();

      // If a penalty was previously attached to a bill, automatically reverse it
      if (violation.penaltyApplied > 0) {
        await syncViolationPenaltyToBill({
          violation,
          previousPenalty: violation.penaltyApplied,
          action: "reverse",
        });
      }
    } else {
      // Confirmed
      if (targetStatus && ["warning_issued", "penalty_issued", "resolved"].includes(targetStatus)) {
        violation.status = targetStatus;
      } else {
        violation.status = "confirmed";
      }

      if (penaltyApplied !== undefined && Number(penaltyApplied) > 0) {
        violation.penaltyApplied = Number(penaltyApplied);
        violation.penaltyReason = (penaltyReason || decisionReason).trim();
        violation.penaltyApprovedBy = adminUserId;
      }

      if (resolution && resolution.trim()) {
        violation.resolution = resolution.trim();
        violation.resolvedBy = adminUserId;
        violation.resolvedAt = new Date();
      }

      // Handle optional bill line-item attachment (with duplicate guard)
      if (chargeToBill && violation.penaltyApplied > 0) {
        let openBill = null;
        if (violation.reservationId) {
          openBill = await Bill.findOne({
            reservationId: violation.reservationId,
            userId: violation.tenantId,
            status: { $in: ["draft", "pending", "overdue"] },
            isArchived: { $ne: true },
          }).sort({ billingMonth: -1 });
        }

        if (openBill) {
          const categoryLabel = formatCategoryLabel(violation.violationType);
          const violationShortId = violation._id.toString().slice(-6);
          const lineItemLabel = `Violation Penalty: ${categoryLabel} (${violationShortId})`;

          openBill.additionalCharges = openBill.additionalCharges || [];
          const alreadyAttached = openBill.additionalCharges.some(
            (c) => c.name && c.name.includes(violationShortId),
          );

          if (!alreadyAttached) {
            openBill.additionalCharges.push({
              name: lineItemLabel,
              amount: violation.penaltyApplied,
            });

            openBill.charges = openBill.charges || {};
            openBill.charges.penalty = (Number(openBill.charges.penalty) || 0) + violation.penaltyApplied;
            openBill.totalAmount = (Number(openBill.totalAmount) || 0) + violation.penaltyApplied;
            openBill.remainingAmount = (Number(openBill.remainingAmount) || 0) + violation.penaltyApplied;

            await openBill.save();
          }
        }
      }
    }

    await violation.save();
    if (violation.tenantId) {
      await reconcileTenantViolations(violation.tenantId);
    }

    await logBillingAudit({
      action: "UPDATE_VIOLATION_DECISION",
      actorId: adminUserId,
      targetUserId: violation.tenantId,
      branch: violation.branch,
      details: {
        violationId: violation._id,
        decision,
        status: violation.status,
        escalatedToReviewId: violation.escalatedToReviewId,
      },
    });

    // Dispatch decision notification to tenant
    try {
      if (violation.tenantId) {
        const categoryLabel = formatCategoryLabel(violation.violationType);
        const isDismissed = decision === "dismissed";
        await createNotification(
          violation.tenantId,
          "tenant_violation",
          `Rule Infraction Status: ${isDismissed ? "Infraction Dismissed" : "Warning Confirmed"}`,
          isDismissed
            ? `Your recorded infraction for ${categoryLabel} has been dismissed upon administrative review.`
            : `Administrative review has confirmed the infraction for ${categoryLabel}. ${decisionReason.trim()}`,
          { entityType: "violation", entityId: violation._id }
        );
      }
    } catch (notifErr) {
      logger.warn("[TenantViolation] Failed to dispatch decision notification:", notifErr);
    }

    res.json({
      success: true,
      message: "Violation decision updated successfully.",
      data: violation,
    });
  } catch (error) {
    logger.error("[TenantViolation] updateViolationDecision error:", error);
    next(error);
  }
};

/**
 * GET /api/billing/termination-reviews
 * Retrieve administrative termination review cases for the review board.
 */
export const getTerminationCases = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      req.branchFilter ||
      (admin.isOwner && req.query.branch && req.query.branch !== "all"
        ? req.query.branch
        : null);

    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const cases = await TerminationReview.find(filter)
      .populate("tenantId", "firstName lastName email phone")
      .populate("reservationId", "roomNumber branch moveInDate moveOutDate")
      .populate("openedBy", "firstName lastName email")
      .populate("triggeredByViolationId", "violationType penaltyApplied createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = cases.map((c) => {
      const tenant = c.tenantId || {};
      return {
        ...c,
        tenantName: `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "Tenant",
        tenantEmail: tenant.email || "",
        caseNumber: c._id.toString().slice(-6).toUpperCase(),
        reason: c.triggerReason || (c.triggerType === "overdue_escalation" ? "Overdue Account Escalation" : c.triggerType === "violation_escalation" ? "Rule Infraction Escalation" : "Overdue Notice Escalation"),
        balanceSnapshot: c.totalOutstandingAtOpen || 0,
        outcome: c.decision?.outcome || c.status,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error("[TenantViolation] getTerminationCases error:", error);
    next(error);
  }
};

/**
 * POST /api/billing/termination-reviews
 * Open a manual termination review case.
 */
export const createTerminationCase = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const adminUserId = await resolveAdminUserId(req, admin);
    const {
      tenantId,
      reservationId: reqReservationId,
      branch: reqBranch,
      triggerReason,
      billId,
      totalOutstandingAtOpen,
      penaltyAmountAtOpen,
      daysOverdueAtOpen,
    } = req.body;

    let targetReservationId = reqReservationId;
    let targetBranch = reqBranch;
    let linkedBill = null;

    if (billId && mongoose.Types.ObjectId.isValid(billId)) {
      linkedBill = await Bill.findById(billId);
      if (linkedBill) {
        if (!targetReservationId && linkedBill.reservationId) {
          targetReservationId = linkedBill.reservationId._id || linkedBill.reservationId;
        }
        if (!targetBranch && linkedBill.branch) {
          targetBranch = linkedBill.branch;
        }
      }
    }

    if (!tenantId || !targetReservationId || !targetBranch) {
      return res.status(400).json({
        success: false,
        error: "tenantId, reservationId, and branch are required.",
      });
    }

    if (!triggerReason || !triggerReason.trim()) {
      return res.status(400).json({
        success: false,
        error: "A reason is required when manually opening a review case.",
      });
    }

    const outstandingBalance =
      totalOutstandingAtOpen != null && !isNaN(Number(totalOutstandingAtOpen))
        ? Number(totalOutstandingAtOpen)
        : linkedBill
        ? Number(linkedBill.remainingAmount || linkedBill.totalAmount || 0)
        : undefined;

    const penaltyAmount =
      penaltyAmountAtOpen != null && !isNaN(Number(penaltyAmountAtOpen))
        ? Number(penaltyAmountAtOpen)
        : linkedBill
        ? Number(linkedBill.charges?.penalty || 0)
        : undefined;

    const daysOverdue =
      daysOverdueAtOpen != null && !isNaN(Number(daysOverdueAtOpen))
        ? Number(daysOverdueAtOpen)
        : linkedBill && linkedBill.dueDate
        ? Math.max(0, dayjs().diff(dayjs(linkedBill.dueDate), "day"))
        : undefined;

    const review = new TerminationReview({
      tenantId,
      reservationId: targetReservationId,
      branch: targetBranch,
      triggerType: linkedBill ? "overdue_escalation" : "manual",
      triggerReason: triggerReason.trim(),
      triggeredByBillId: linkedBill ? linkedBill._id : undefined,
      totalOutstandingAtOpen: outstandingBalance,
      penaltyAmountAtOpen: penaltyAmount,
      daysOverdueAtOpen: daysOverdue,
      openedBy: adminUserId,
      openedAt: new Date(),
      status: "open",
    });

    await createExclusiveTenancyRecord(targetReservationId, session => review.save({ session }));

    if (linkedBill) {
      linkedBill.overdueEscalatedToReviewId = review._id;
      await linkedBill.save();
    }

    res.status(201).json({
      success: true,
      message: "Termination review case opened successfully.",
      data: review,
    });
  } catch (error) {
    logger.error("[TenantViolation] createTerminationCase error:", error);
    next(error);
  }
};

/**
 * DELETE /api/billing/termination-reviews/:id
 * Soft-delete / archive an administrative termination review case.
 */
export const deleteTerminationCase = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid review case ID format." });
    }

    const review = await TerminationReview.findById(id);
    if (!review || review.isArchived) {
      return res.status(404).json({ success: false, error: "Termination review case not found." });
    }

    if (!admin.isOwner && admin.branch && review.branch !== admin.branch) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Review case belongs to a different branch.",
      });
    }

    review.isArchived = true;
    review.archivedAt = new Date();
    await review.save();

    res.json({
      success: true,
      message: "Termination review case deleted successfully.",
    });
  } catch (error) {
    logger.error("[TenantViolation] deleteTerminationCase error:", error);
    next(error);
  }
};

/**
 * PUT /api/billing/violations/:id
 * Admin updates violation details during in-office review.
 */
export const updateViolation = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid violation ID format." });
    }

    const violation = await TenantViolation.findById(id);
    if (!violation || violation.isArchived) {
      return res.status(404).json({ success: false, error: "Violation record not found." });
    }

    if (!admin.isOwner && admin.branch && violation.branch !== admin.branch) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Violation belongs to a different branch.",
      });
    }

    const {
      violationType,
      customViolationDescription,
      dateOfIncident,
      timeOfIncident,
      locationOfIncident,
      evidenceNotes,
      evidenceUrls,
      penaltyApplied,
      penaltyReason,
    } = req.body;

    const oldPenalty = Number(violation.penaltyApplied || 0);
    const newPenalty = penaltyApplied === null ? 0 : Number(penaltyApplied !== undefined ? penaltyApplied : oldPenalty);

    if (violationType) violation.violationType = violationType;
    if (customViolationDescription !== undefined) violation.customViolationDescription = sanitizeText(customViolationDescription);
    if (dateOfIncident) violation.dateOfIncident = new Date(dateOfIncident);
    if (timeOfIncident !== undefined) violation.timeOfIncident = sanitizeText(timeOfIncident);
    if (locationOfIncident !== undefined) violation.locationOfIncident = sanitizeText(locationOfIncident);
    if (evidenceNotes !== undefined) violation.evidenceNotes = sanitizeText(evidenceNotes);
    if (Array.isArray(evidenceUrls)) violation.evidenceUrls = evidenceUrls;
    if (penaltyApplied !== undefined) violation.penaltyApplied = penaltyApplied === null ? null : Number(penaltyApplied);
    if (penaltyReason !== undefined) violation.penaltyReason = sanitizeText(penaltyReason);

    await violation.save();

    // Synchronize penalty fee changes to attached bill or standalone bill
    if (penaltyApplied !== undefined && newPenalty !== oldPenalty) {
      try {
        await syncViolationPenaltyToBill({
          violation,
          previousPenalty: oldPenalty,
          newPenalty,
          action: newPenalty > 0 ? "sync" : "reverse",
        });
      } catch (syncErr) {
        logger.warn("[TenantViolation] Failed to sync penalty delta to bill on update:", syncErr);
      }
    }

    // Log billing audit
    try {
      const adminUserId = await resolveAdminUserId(req, admin);
      await logBillingAudit({
        action: "violation_updated",
        entityType: "violation",
        entityId: violation._id,
        actorId: adminUserId,
        branch: violation.branch,
        notes: "Violation details modified during in-office administrative review.",
      });
    } catch (auditErr) {
      logger.warn("[TenantViolation] Failed to log violation update audit:", auditErr);
    }

    // Notify tenant
    try {
      if (violation.tenantId) {
        await createNotification(
          violation.tenantId,
          "violation_updated",
          "Violation Record Updated",
          "Your violation record details have been updated following in-office administrative review.",
          { entityType: "violation", entityId: violation._id },
        );
      }
    } catch (notifErr) {
      logger.warn("[TenantViolation] Failed to notify tenant on update:", notifErr);
    }

    res.json({
      success: true,
      message: "Violation record updated successfully.",
      data: violation,
    });
  } catch (error) {
    logger.error("[TenantViolation] updateViolation error:", error);
    next(error);
  }
};

/**
 * DELETE /api/billing/violations/:id
 * Admin archives a violation record.
 */
export const archiveViolation = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid violation ID format." });
    }

    const violation = await TenantViolation.findById(id);
    if (!violation) {
      return res.status(404).json({ success: false, error: "Violation record not found." });
    }

    if (!admin.isOwner && admin.branch && violation.branch !== admin.branch) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Violation belongs to a different branch.",
      });
    }

    const adminUserId = await resolveAdminUserId(req, admin);
    violation.isArchived = true;
    violation.archivedAt = new Date();
    violation.archivedBy = adminUserId;
    await violation.save();
    if (violation.tenantId) {
      await reconcileTenantViolations(violation.tenantId);
    }

    // Reverse any attached penalties from monthly bills and void unpaid standalone penalty bills
    if (violation.penaltyApplied > 0) {
      try {
        await syncViolationPenaltyToBill({
          violation,
          previousPenalty: violation.penaltyApplied,
          action: "reverse",
        });
      } catch (stErr) {
        logger.warn("[TenantViolation] Failed to reverse penalty bills on archival:", stErr);
      }
    }

    // Log audit
    try {
      await logBillingAudit({
        action: "violation_archived",
        entityType: "violation",
        entityId: violation._id,
        actorId: adminUserId,
        branch: violation.branch,
        notes: "Violation record archived by administrator.",
      });
    } catch (auditErr) {
      logger.warn("[TenantViolation] Failed to log violation archive audit:", auditErr);
    }

    res.json({
      success: true,
      message: "Violation record archived successfully.",
    });
  } catch (error) {
    logger.error("[TenantViolation] archiveViolation error:", error);
    next(error);
  }
};


