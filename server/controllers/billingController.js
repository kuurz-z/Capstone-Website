/**
 * ============================================================================
 * TENANT BILLING CONTROLLER
 * ============================================================================
 *
 * Handles all billing-related operations for tenants.
 * Ensures data isolation by branch and provides forecasting data.
 * Refactored: shared helpers for bill formatting, overdue detection, pro-rata.
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import { Bill, Reservation, Room, User, UtilityPeriod } from "../models/index.js";
import logger from "../middleware/logger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";
import {
  sendBillGeneratedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
} from "../config/email.js";
import {
  buildBillingCycle,
  getBillRemainingAmount,
  getVisibleBillCharges,
  getVisibleBillSnapshot,
  isUtilityChargeVisible,
  getReservationCreditAvailable,
  resolveBillStatus,
  roundMoney,
  syncBillAmounts,
} from "../utils/billingPolicy.js";
import { getPenaltyRatePerDay } from "../utils/businessSettings.js";
import { sendDraftUtilityBills } from "../utils/utilityBillFlow.js";
import { isWaterBillableRoom } from "../utils/utilityFlowRules.js";

/* ─── shared helpers ─────────────────────────────── */

/** Get admin's role and branch from MongoDB */
async function getAdminInfo(req) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
  return {
    role: dbUser?.role || "user",
    branch: dbUser?.branch || null,
    isSuperAdmin: dbUser?.role === "owner",
    _id: dbUser?._id || null,
  };
}

/** Auto-mark overdue bills (shared by getBillsByBranch + getAllBills) */
async function markOverdueBills(bills) {
  const now = dayjs().toDate();
  for (const bill of bills) {
    const nextStatus = resolveBillStatus(bill, now);
    if (bill.status !== nextStatus) {
      bill.status = nextStatus;
      bill.remainingAmount = getBillRemainingAmount(bill);
      await bill.save();
    }
  }
}

/** Map a Bill document to API response shape (shared by getBillsByBranch + getAllBills) */
const formatBill = (bill) => {
  const visible = getVisibleBillSnapshot(bill);
  return {
    id: bill._id,
    tenant: bill.userId
      ? {
          id: bill.userId._id,
          name: `${bill.userId.firstName || ""} ${bill.userId.lastName || ""}`.trim(),
          email: bill.userId.email,
        }
      : null,
    room: bill.reservationId?.roomName || "N/A",
    branch: bill.branch,
    billingMonth: bill.billingMonth,
    dueDate: visible.dueDate,
    issuedAt: visible.issuedAt,
    billingCycleStart: bill.billingCycleStart,
    billingCycleEnd: bill.billingCycleEnd,
    utilityCycleStart: bill.utilityCycleStart || null,
    utilityCycleEnd: bill.utilityCycleEnd || null,
    utilityReadingDate: bill.utilityReadingDate || null,
    charges: visible.charges,
    grossAmount: visible.grossAmount,
    reservationCreditApplied: bill.reservationCreditApplied || 0,
    totalAmount: visible.totalAmount,
    paidAmount: bill.paidAmount || 0,
    remainingAmount: visible.remainingAmount,
    isFirstCycleBill: !!bill.isFirstCycleBill,
    status: visible.status,
    notes: bill.notes,
    createdAt: bill.createdAt,
  };
};

async function getReservationBillingContext(reservationId, currentBillId = null) {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation || !reservation.checkInDate) return null;

  const existingCount = await Bill.countDocuments({
    reservationId: reservation._id,
    isArchived: false,
    ...(currentBillId ? { _id: { $ne: currentBillId } } : {}),
  });

  const cycle = buildBillingCycle(reservation.checkInDate, existingCount);
  const creditAvailable = getReservationCreditAvailable(reservation);

  return {
    reservation,
    existingCount,
    cycle,
    isFirstCycleBill: existingCount === 0,
    creditAvailable,
  };
}

async function getTenantBillForRequest(req, billId) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
  if (!dbUser) return { dbUser: null, bill: null };

  const bill = await Bill.findOne({
    _id: billId,
    userId: dbUser._id,
    isArchived: false,
  }).lean();

  return { dbUser, bill };
}

async function findUtilityPeriodForBill({ bill, utilityType }) {
  if (!bill?.roomId) return null;

  let period = await UtilityPeriod.findOne({
    roomId: bill.roomId,
    utilityType,
    isArchived: false,
    "tenantSummaries.billId": bill._id,
  }).lean();

  if (period) return period;

  const cycleFilter = {
    roomId: bill.roomId,
    utilityType,
    isArchived: false,
  };
  if (bill.utilityCycleStart) cycleFilter.startDate = bill.utilityCycleStart;
  if (bill.utilityCycleEnd) cycleFilter.endDate = bill.utilityCycleEnd;

  period = await UtilityPeriod.findOne(cycleFilter).lean();
  return period || null;
}

async function buildTenantUtilityBreakdown({ dbUser, bill, utilityType }) {
  const chargeAmount = utilityType === "electricity"
    ? Number(bill?.charges?.electricity || 0)
    : Number(bill?.charges?.water || 0);
  if (!bill || chargeAmount <= 0) return null;

  const period = await findUtilityPeriodForBill({ bill, utilityType });
  if (!period) return null;

  const tenantSummary =
    (period.tenantSummaries || []).find((summary) => String(summary.billId) === String(bill._id)) ||
    (period.tenantSummaries || []).find((summary) => String(summary.tenantId) === String(dbUser._id)) ||
    null;

  if (utilityType === "electricity") {
    const activeSegments = (period.segments || []).filter((segment) =>
      (segment.activeTenantIds || []).some((tenantId) => String(tenantId) === String(dbUser._id)),
    );

    return {
      period: {
        id: period._id,
        startDate: period.startDate,
        endDate: period.endDate,
      },
      ratePerKwh: period.ratePerUnit,
      myTotalKwh: tenantSummary?.totalUsage || 0,
      myBillAmount: tenantSummary?.billAmount || chargeAmount,
      segments: activeSegments.map((segment) => ({
        periodLabel: segment.periodLabel,
        startDate: segment.startDate,
        endDate: segment.endDate,
        readingFrom: segment.readingFrom,
        readingTo: segment.readingTo,
        segmentTotalKwh: segment.unitsConsumed,
        activeTenantCount: segment.activeTenantCount,
        sharePerTenantKwh: segment.sharePerTenantUnits,
        sharePerTenantCost: segment.sharePerTenantCost,
      })),
    };
  }

  const firstSegment = (period.segments || [])[0] || null;
  return {
    record: {
      id: period._id,
      cycleStart: period.startDate,
      cycleEnd: period.endDate,
      usage: period.computedTotalUsage || 0,
      ratePerUnit: period.ratePerUnit,
      roomTotal: period.computedTotalCost || 0,
      tenantsSharing: firstSegment?.activeTenantCount || period.tenantSummaries?.length || 0,
      myShare: tenantSummary?.billAmount || chargeAmount,
    },
  };
}

function hasDraftLinkedSummary(period, draftBillIds) {
  return (period?.tenantSummaries || []).some((summary) =>
    summary.billId && draftBillIds.has(String(summary.billId)),
  );
}

function buildPublishResultFromPeriod(period) {
  if (!period) return null;
  return {
    computedTotalUsage: period.computedTotalUsage,
    computedTotalCost: period.computedTotalCost,
    ratePerUnit: period.ratePerUnit,
    segments: period.segments || [],
    tenantSummaries: period.tenantSummaries || [],
  };
}

async function getRoomPublishState(room) {
  const [allBills, periods] = await Promise.all([
    Bill.find({
      roomId: room._id,
      isArchived: false,
    })
      .populate("userId", "firstName lastName email")
      .sort({ createdAt: 1 }),
    UtilityPeriod.find({
      roomId: room._id,
      isArchived: false,
    })
      .sort({ endDate: -1, createdAt: -1 })
      .lean(),
  ]);

  const draftBillIds = new Set(
    allBills.filter((bill) => bill.status === "draft").map((bill) => String(bill._id)),
  );
  const electricityPeriods = periods.filter((period) => period.utilityType === "electricity");
  const waterPeriods = periods.filter((period) => period.utilityType === "water");
  const billableWater = isWaterBillableRoom(room);

  const electricityPeriod =
    electricityPeriods.find((period) => period.status !== "open" && hasDraftLinkedSummary(period, draftBillIds)) ||
    electricityPeriods.find((period) => period.status !== "open") ||
    null;
  const electricityOpenPeriod =
    electricityPeriods.find((period) => period.status === "open") || null;

  const waterPeriod =
    waterPeriods.find((period) => period.status !== "open" && hasDraftLinkedSummary(period, draftBillIds)) ||
    waterPeriods.find((period) => period.status !== "open") ||
    null;
  const waterOpenPeriod =
    waterPeriods.find((period) => period.status === "open") || null;
  const relevantDraftIds = new Set(
    [electricityPeriod, waterPeriod]
      .filter(Boolean)
      .flatMap((period) => (period.tenantSummaries || []).map((summary) => summary.billId))
      .filter(Boolean)
      .map((billId) => String(billId)),
  );
  const cycleBills = relevantDraftIds.size > 0
    ? allBills.filter((bill) => relevantDraftIds.has(String(bill._id)))
    : allBills;
  const draftBills = cycleBills.filter((bill) => bill.status === "draft");
  const issuedBills = cycleBills.filter((bill) => bill.status !== "draft");

  let blockingReason = "";
  let isReadyToPublish = true;
  let publishState = "ready";

  if (!electricityPeriod || electricityPeriod.status === "open") {
    isReadyToPublish = false;
    publishState = "blocked";
    blockingReason = electricityOpenPeriod
      ? "Electricity period is still open."
      : "Electricity drafts have not been generated.";
  } else if (billableWater && (!waterPeriod || waterPeriod.status === "open")) {
    isReadyToPublish = false;
    publishState = "blocked";
    blockingReason = waterOpenPeriod
      ? "Water period is still open."
      : "Water drafts have not been generated.";
  } else if (draftBills.length > 0) {
    publishState = "ready";
  } else if (issuedBills.length > 0) {
    isReadyToPublish = false;
    publishState = "issued";
    blockingReason = "Invoices for this cycle have already been sent.";
  } else if (draftBills.length === 0) {
    isReadyToPublish = false;
    publishState = "blocked";
    blockingReason = "No draft bills found for this room.";
  }

  return {
    roomId: room._id,
    roomName: room.name || room.roomNumber || "Room",
    branch: room.branch,
    type: room.type,
    waterApplicable: billableWater,
    cycleBills,
    draftBills,
    draftBillCount: draftBills.length,
    issuedBillCount: issuedBills.length,
    electricityStatus: electricityPeriod ? "closed" : (electricityOpenPeriod ? "open" : "pending"),
    waterStatus: billableWater
      ? (waterPeriod ? "finalized" : (waterOpenPeriod ? "open" : "pending"))
      : "n/a",
    isReadyToPublish,
    publishState,
    blockingReason,
    electricityPeriod,
    waterPeriod,
  };
}

/** Build paginated bill response (shared by getBillsByBranch + getAllBills) */
async function fetchBills(filter, query) {
  const { status, month, page = 1, limit = 20, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  if (status && status !== "all") filter.status = status;
  if (month) {
    const d = dayjs(month);
    filter.billingMonth = {
      $gte: d.startOf("month").toDate(),
      $lt: d.add(1, "month").startOf("month").toDate(),
    };
  }

  // Build search into pipeline so it runs BEFORE pagination
  let userIds = null;
  if (search) {
    const q = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    }).select("_id").lean();
    userIds = matchingUsers.map((u) => u._id);
    filter.userId = { $in: userIds };
  }

  let bills = await Bill.find(filter)
    .populate("userId", "firstName lastName email username")
    .populate("reservationId", "roomId roomName bedDetails")
    .sort({ billingMonth: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bill.countDocuments(filter);
  await markOverdueBills(bills);

  return {
    bills: bills.map(formatBill),
    pagination: {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

/** Round to 2 decimal places */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Compute per-tenant water share based on room type.
 *
 * Business rules (client-defined):
 *   - quadruple-sharing → ₱0 (water included in monthly rent)
 *   - double-sharing    → room water total ÷ number of tenants
 *   - private           → full room water charge to single tenant
 *
 * @param {string}  roomType    – Room.type enum value
 * @param {number}  totalWater  – Total water charge entered for the room
 * @param {number}  tenantCount – Number of checked-in tenants in the room
 * @returns {number} Per-tenant water amount
 */
const computeWaterShare = (roomType, totalWater, tenantCount) => {
  if (!totalWater || totalWater <= 0) return 0;
  switch (roomType) {
    case "quadruple-sharing":
      // Water is already included in monthly rent — no separate charge
      return 0;
    case "double-sharing":
      // Equal split among all tenants in the room
      return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
    case "private":
      // Full charge to the single tenant
      return r2(totalWater);
    default:
      // Fallback: equal split
      return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
  }
};

/**
 * Suggest rent amount based on lease duration.
 * >= 6 months -> long-term (monthlyPrice), else -> regular (price)
 */
const suggestRent = (reservation, room, moveInDate) => {
  if (reservation.monthlyRent) return reservation.monthlyRent;
  if (reservation.totalPrice) return reservation.totalPrice;
  // If not explicitly saved in reservation, infer from room pricing based on duration
  const months = dayjs().diff(dayjs(moveInDate), "month", true);
  const isLongTerm = months >= 6;
  return isLongTerm ? (room.monthlyPrice ?? room.price ?? 0) : (room.price ?? 0);
};

/* ─── controllers ────────────────────────────────── */

export const getCurrentBilling = async (req, res, next) => {
  try {
    const { uid, branch } = req.user;
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    const activeStay = await Reservation.findOne({
      userId: dbUser._id,
      branch,
      status: "checked-in",
    });
    if (!activeStay)
      return res.status(404).json({ error: "No active stay found" });

    const now = dayjs();
    const currentBill = await Bill.findOne({
      reservationId: activeStay._id,
      branch,
      status: { $ne: "draft" },
      billingMonth: {
        $gte: now.startOf("month").toDate(),
        $lt: now.add(1, "month").startOf("month").toDate(),
      },
    });
    if (!currentBill)
      return res.status(404).json({ error: "No current bill found" });

    const visible = getVisibleBillSnapshot(currentBill);
    res.json({
      currentBalance: visible.remainingAmount,
      totalAmount: visible.totalAmount,
      grossAmount: visible.grossAmount,
      reservationCreditApplied: currentBill.reservationCreditApplied || 0,
      paidAmount: currentBill.paidAmount || 0,
      remainingAmount: visible.remainingAmount,
      dueDate: visible.dueDate,
      issuedAt: visible.issuedAt,
      billingCycleStart: currentBill.billingCycleStart,
      billingCycleEnd: currentBill.billingCycleEnd,
      utilityCycleStart: currentBill.utilityCycleStart || null,
      utilityCycleEnd: currentBill.utilityCycleEnd || null,
      utilityReadingDate: currentBill.utilityReadingDate || null,
      status: visible.status,
      charges: visible.charges,
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingHistory = async (req, res, next) => {
  try {
    const { uid, branch } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    const stayIds = (await Reservation.find({ userId: dbUser._id, branch })).map(
      (s) => s._id,
    );

    const bills = await Bill.find({
      reservationId: { $in: stayIds },
      branch,
      status: { $ne: "draft" },
      isArchived: false,
    })
      .sort({ billingMonth: -1 })
      .limit(limit);
    res.json({
      count: bills.length,
      bills: bills.map((b) => {
        const visible = getVisibleBillSnapshot(b);
        return {
          id: b._id,
          date: b.billingMonth,
          dueDate: visible.dueDate,
          issuedAt: visible.issuedAt,
          amount: visible.totalAmount,
          grossAmount: visible.grossAmount,
          reservationCreditApplied: b.reservationCreditApplied || 0,
          paidAmount: b.paidAmount || 0,
          remainingAmount: visible.remainingAmount,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          status: visible.status,
          charges: visible.charges,
          paymentDate: b.paymentDate,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingStats = async (req, res, next) => {
  try {
    // req.branchFilter is set by filterByBranch middleware:
    //   null → superAdmin (cross-branch), string → regular admin's branch
    const isSuperAdmin = req.isSuperAdmin;
    const branch = req.branchFilter;   // null for SA, branch string for admin
    if (
      !isSuperAdmin &&
      (!branch || !["gil-puyat", "guadalupe"].includes(branch))
    )
      return res.status(403).json({ error: "Invalid branch" });
    const monthlyRevenue = await Bill.getMonthlyRevenueByBranch(branch, 12);
    const paymentStats = await Bill.getPaymentStats(branch);
    res.json({ branch, monthlyRevenue, paymentStats });
  } catch (error) {
    next(error);
  }
};

export const markBillAsPaid = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const { amount, note } = req.body;
    const admin = await getAdminInfo(req);
    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Bill not found" });
    const appliedAmount = Number(
      amount ?? bill.remainingAmount ?? bill.totalAmount,
    );
    bill.paidAmount = roundMoney(Number(bill.paidAmount || 0) + appliedAmount);
    syncBillAmounts(bill);
    if (bill.paidAmount > 0 && !bill.paymentDate) {
      bill.paymentDate = new Date();
    }
    await bill.save();
    if (note) {
      bill.notes = note;
      await bill.save();
    }
    res.json({ success: true, bill: bill.toObject() });
  } catch (error) {
    next(error);
  }
};

export const getBillsByBranch = async (req, res, next) => {
  try {
    const isSuperAdmin = req.isSuperAdmin;
    // Regular admin: req.branchFilter is their branch (enforced by middleware)
    // Super admin: req.branchFilter is null, can pass branch via query
    const branch = req.branchFilter ||
      (isSuperAdmin && req.query.branch ? req.query.branch : null);

    if (!branch) {
      if (isSuperAdmin) {
        // Super admin without branch filter — get all
        const result = await fetchBills({ isArchived: false }, req.query);
        return res.json(result);
      }
      return res.status(403).json({ error: "Invalid branch" });
    }
    if (!["gil-puyat", "guadalupe"].includes(branch))
      return res.status(403).json({ error: "Invalid branch" });

    const result = await fetchBills({ branch, isArchived: false }, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const generateRoomBill = async (req, res, next) => {
  try {
    return res.status(410).json({
      error: "Legacy room billing is disabled. Use the utility billing flow to generate drafts, then publish from Issue Invoices.",
    });
    const admin = await getAdminInfo(req);
    const { roomId, billingMonth, dueDate, charges = {} } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room is required" });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch)
      return res
        .status(403)
        .json({ error: "Cannot create bills for another branch" });

    const monthDate = dayjs(billingMonth || undefined);
    const monthStart = monthDate.startOf("month").toDate();
    const monthEnd = monthDate.endOf("month").toDate();

    // Check duplicate room bill
    if (
      await RoomBill.findOne({
        roomId: room._id,
        billingMonth: monthStart,
        isArchived: false,
      })
    ) {
      return res
        .status(409)
        .json({ error: "A bill already exists for this room and month" });
    }

    // Find checked-in tenants via occupied beds
    const occupiedBeds = room.beds.filter(
      (b) => !b.available && b.occupiedBy?.userId,
    );

    const tenantInfos = [];
    const seenUserIds = new Set();

    // Source 1: Bed occupancy data — batch fetch all reservations in one query (N+1 fix)
    const bedReservationIds = occupiedBeds
      .map((b) => b.occupiedBy?.reservationId)
      .filter(Boolean);

    const bedReservations = bedReservationIds.length > 0
      ? await Reservation.find({
          _id: { $in: bedReservationIds },
          status: "checked-in",
          isArchived: { $ne: true },
        }).populate("userId", "firstName lastName email")
      : [];

    // O(1) lookup by reservation ID
    const bedReservationMap = new Map(
      bedReservations.map((r) => [String(r._id), r]),
    );

    for (const bed of occupiedBeds) {
      if (!bed.occupiedBy.reservationId) continue;
      const reservation = bedReservationMap.get(String(bed.occupiedBy.reservationId));
      if (!reservation?.userId || reservation.status !== "checked-in") continue;
      if (seenUserIds.has(String(reservation.userId._id))) continue;
      seenUserIds.add(String(reservation.userId._id));

      const moveInDate =
        bed.occupiedBy.occupiedSince || reservation.checkInDate || monthStart;
      const rent = suggestRent(reservation, room, moveInDate);
      const customCharges = reservation.customCharges || [];
      const tenantStart = dayjs(Math.max(dayjs(moveInDate).valueOf(), dayjs(monthStart).valueOf()));
      const tenantEnd = dayjs(Math.min(Date.now(), dayjs(monthEnd).add(1, "day").valueOf()));
      const daysInRoom = Math.max(1, tenantEnd.diff(tenantStart, "day", true) | 0 || 1);

      tenantInfos.push({
        userId: reservation.userId._id,
        reservationId: reservation._id,
        userName:
          `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim() ||
          "Tenant",
        email: reservation.userId.email || "",
        rent,
        customCharges,
        daysInRoom,
        moveInDate,
      });
    }

    // Source 2: Direct reservation query fallback (if bed data is stale)
    if (tenantInfos.length === 0) {
      const checkedInReservations = await Reservation.find({
        roomId: room._id,
        status: "checked-in",
        isArchived: { $ne: true },
      }).populate("userId", "firstName lastName email");

      for (const reservation of checkedInReservations) {
        if (!reservation?.userId) continue;
        if (seenUserIds.has(String(reservation.userId._id))) continue;
        seenUserIds.add(String(reservation.userId._id));

        const moveInDate = reservation.checkInDate || monthStart;
        const rent = suggestRent(reservation, room, moveInDate);
        const customCharges = reservation.customCharges || [];
        const tenantStart = dayjs(Math.max(dayjs(moveInDate).valueOf(), dayjs(monthStart).valueOf()));
        const tenantEnd = dayjs(Math.min(Date.now(), dayjs(monthEnd).add(1, "day").valueOf()));
        const daysInRoom = Math.max(1, tenantEnd.diff(tenantStart, "day", true) | 0 || 1);

        tenantInfos.push({
          userId: reservation.userId._id,
          reservationId: reservation._id,
          userName:
            `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim() ||
            "Tenant",
          email: reservation.userId.email || "",
          rent,
          customCharges,
          daysInRoom,
          moveInDate,
        });
      }
    }

    if (tenantInfos.length === 0)
      return res.status(400).json({
        error:
          "No checked-in tenants found in this room. Only tenants with 'checked-in' status can be billed.",
      });

    // Pro-rata calculation
    const totalOccupantDays = tenantInfos.reduce((s, t) => s + t.daysInRoom, 0);
    const roomCharges = {
      electricity: Number(charges.electricity) || 0,
      water: Number(charges.water) || 0,
    };
    const totalUtilities = roomCharges.electricity + roomCharges.water;
    const adminUser = await User.findOne({ firebaseUid: req.user.uid });

    const generatedBills = [];
    const tenantBreakdown = [];

    for (const tenant of tenantInfos) {
      const share = tenant.daysInRoom / totalOccupantDays;
      const dupeFilter = {
        userId: tenant.userId,
        billingMonth: monthStart,
        isArchived: false,
      };
      if (tenant.reservationId) dupeFilter.reservationId = tenant.reservationId;
      if (await Bill.findOne(dupeFilter)) continue;

      const te = r2(roomCharges.electricity * share);
      const tw = computeWaterShare(room.type, roomCharges.water, tenantInfos.length);
      const utilityShare = te + tw;

      // Custom charges from reservation (appliance fees, etc.)
      const tenantCustomCharges = tenant.customCharges || [];
      const customChargesTotal = tenantCustomCharges.reduce(
        (sum, c) => sum + (Number(c.amount) || 0),
        0,
      );

      const utilityCustomCharges = room.branch === "guadalupe" ? 0 : customChargesTotal;
      const grossAmount = roundMoney(utilityShare + utilityCustomCharges);
      const billingContext = tenant.reservationId
        ? await getReservationBillingContext(tenant.reservationId)
        : null;
      const reservationCreditApplied = Math.min(
        grossAmount,
        billingContext?.creditAvailable || 0,
      );
      const cycleDueDate = dueDate
        ? dayjs(dueDate).toDate()
        : billingContext?.cycle?.dueDate || monthDate.add(1, "month").date(15).toDate();

      const bill = new Bill({
        reservationId: tenant.reservationId,
        userId: tenant.userId,
        branch: room.branch,
        roomId: room._id,
        billingMonth: billingContext?.cycle?.billingMonth || monthStart,
        billingCycleStart: billingContext?.cycle?.billingCycleStart || monthStart,
        billingCycleEnd: billingContext?.cycle?.billingCycleEnd || cycleDueDate,
        dueDate: cycleDueDate,
        isFirstCycleBill: !!billingContext?.isFirstCycleBill,
        proRataDays: tenant.daysInRoom,
        charges: {
          rent: 0,
          electricity: te,
          water: tw,
          applianceFees: utilityCustomCharges,
          corkageFees: 0,
          penalty: 0,
          discount: 0,
        },
        additionalCharges: room.branch === "guadalupe" ? [] : tenantCustomCharges.map((c) => ({
          name: c.name,
          amount: c.amount,
        })),
        grossAmount,
        reservationCreditApplied,
        totalAmount: grossAmount,
        remainingAmount: grossAmount,
        status: "draft",
      });
      syncBillAmounts(bill);
      await bill.save();
      if (billingContext?.reservation && reservationCreditApplied > 0) {
        billingContext.reservation.reservationCreditConsumedAt = new Date();
        billingContext.reservation.reservationCreditAppliedBillId = bill._id;
        await billingContext.reservation.save();
      }
      generatedBills.push(bill._id);
      tenantBreakdown.push({
        userId: tenant.userId,
        reservationId: tenant.reservationId,
        daysInRoom: tenant.daysInRoom,
        proRataShare: Math.round(share * 10000) / 10000,
        rent: 0,
        customCharges: room.branch === "guadalupe" ? [] : tenantCustomCharges,
        utilityShare,
        grossAmount,
        reservationCreditApplied,
        totalAmount: bill.totalAmount,
        billId: bill._id,
      });
    }

    if (generatedBills.length === 0)
      return res.status(409).json({
        error:
          "Bills already exist for all tenants in this room for the selected month",
      });

    const roomBill = new RoomBill({
      roomId: room._id,
      branch: room.branch,
      billingMonth: monthStart,
      dueDate: dueDate ? dayjs(dueDate).toDate() : null,
      charges: roomCharges,
      totalCharges: totalUtilities,
      generatedBills,
      status: "generated",
      generatedBy: adminUser?._id || null,
      tenantBreakdown,
    });
    await roomBill.save();
    await Bill.updateMany(
      { _id: { $in: generatedBills } },
      { $set: { roomBillId: roomBill._id } },
    );

    res.status(201).json({
      success: true,
      roomBill: {
        id: roomBill._id,
        room: room.name,
        billingMonth: monthStart,
        totalUtilities,
        tenantsCount: tenantBreakdown.length,
        tenantBreakdown: tenantBreakdown.map((t) => ({
          rent: 0,
          utilityShare: t.utilityShare,
          totalAmount: t.totalAmount,
          daysInRoom: t.daysInRoom,
          proRataPercent: Math.round(t.proRataShare * 100),
        })),
      },
    });

    // Send bill notification emails to all billed tenants
    return;
    const monthLabel = dayjs(monthStart).format("MMMM YYYY");
    const dueDateLabel = dayjs(billDueDate).format("MMMM D, YYYY");
    for (const tenant of tenantInfos) {
      if (!tenant.email) continue;
      try {
        // Use the pre-computed total from tenantBreakdown to avoid NaN
        const breakdown = tenantBreakdown.find(
          (t) => String(t.userId) === String(tenant.userId),
        );
        await sendBillGeneratedEmail({
          to: tenant.email,
          tenantName: tenant.userName,
          billingMonth: monthLabel,
          totalAmount: breakdown?.totalAmount || 0,
          dueDate: dueDateLabel,
          branchName: room.branch || "Lilycrest",
        });
      } catch (emailErr) {
        logger.warn(
          { err: emailErr, email: tenant.email },
          "Bill notification email failed",
        );
      }
    }
  } catch (error) {
    next(error);
  }
};

export const getRoomsWithTenants = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isSuperAdmin && req.query.branch ? req.query.branch : admin.branch;
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter)
      .select(
        "name roomNumber branch type capacity currentOccupancy beds price monthlyPrice",
      )
      .sort({ name: 1 });

    // Batch fetch ALL checked-in reservations for every room in one query (N+1 fix)
    // Was: 1 Reservation.find() per room inside Promise.all → N+1 queries
    // Now: 2 queries total regardless of number of rooms
    const roomIds = rooms.map((r) => r._id);
    const allReservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: "checked-in",
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .lean();

    // Group reservations by roomId for O(1) access
    const reservationsByRoom = new Map();
    for (const r of allReservations) {
      const key = String(r.roomId);
      if (!reservationsByRoom.has(key)) reservationsByRoom.set(key, []);
      reservationsByRoom.get(key).push(r);
    }

    res.json({
      rooms: rooms.map((room) => {
        const reservations = reservationsByRoom.get(String(room._id)) || [];

        const tenants = reservations
          .filter((r) => r.userId)
          .map((r) => {
            // Find which bed this tenant occupies
            const bed = room.beds.find(
              (b) =>
                b.occupiedBy?.reservationId?.toString() === r._id.toString(),
            );
            return {
              userId: r.userId._id,
              reservationId: r._id,
              name:
                `${r.userId.firstName || ""} ${r.userId.lastName || ""}`.trim() ||
                "Tenant",
              email: r.userId.email || "",
              checkInDate: r.checkInDate,
              monthlyRent: suggestRent(r, room, r.checkInDate),
              customCharges: r.customCharges || [],
              bedPosition: bed?.position || null,
            };
          });

        return {
          id: room._id,
          name: room.name,
          roomNumber: room.roomNumber,
          branch: room.branch,
          type: room.type,
          capacity: room.capacity,
          currentOccupancy: tenants.length,
          tenantCount: tenants.length,
          roomPrice: room.monthlyPrice || room.price || 0,
          tenants,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// TENANT: Get my bills
// ============================================================================

export const getMyBills = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bills = await Bill.find({
      userId: dbUser._id,
      status: { $ne: "draft" },
      isArchived: false,
    })
      .populate("roomId", "name branch type")
      .sort({ billingMonth: -1 })
      .lean();

    const billResponses = await Promise.all(
      bills.map(async (b) => {
        const utilityBreakdowns = {};
        const visibleCharges = getVisibleBillCharges(b);
        if (Number(visibleCharges.electricity || 0) > 0) {
          utilityBreakdowns.electricity =
            await buildTenantUtilityBreakdown({ dbUser, bill: b, utilityType: "electricity" });
        }
        if (Number(visibleCharges.water || 0) > 0) {
          utilityBreakdowns.water =
            await buildTenantUtilityBreakdown({ dbUser, bill: b, utilityType: "water" });
        }

        const visible = getVisibleBillSnapshot(b);
        return {
          id: b._id,
          billingMonth: b.billingMonth,
          billingCycleStart: b.billingCycleStart,
          billingCycleEnd: b.billingCycleEnd,
          dueDate: visible.dueDate,
          issuedAt: visible.issuedAt,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          utilityPeriodId: null,
          charges: visible.charges,
          totalAmount: visible.totalAmount,
          grossAmount: visible.grossAmount,
          reservationCreditApplied: b.reservationCreditApplied || 0,
          paidAmount: b.paidAmount || 0,
          remainingAmount: visible.remainingAmount,
          status: visible.status,
          proRataDays: b.proRataDays,
          isFirstCycleBill: !!b.isFirstCycleBill,
          room: b.roomId?.name || "N/A",
          branch: b.branch,
          paymentProof: b.paymentProof || { verificationStatus: "none" },
          penaltyDetails: b.penaltyDetails || { daysLate: 0 },
          createdAt: b.createdAt,
          utilityBreakdowns,
        };
      }),
    );

    res.json({
      bills: billResponses,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// TENANT: Submit payment proof
// ============================================================================

export const submitPaymentProof = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const { imageUrl, amount } = req.body;

    if (!imageUrl)
      return res.status(400).json({ error: "Proof image is required" });
    if (!amount || amount <= 0)
      return res
        .status(400)
        .json({ error: "Valid payment amount is required" });

    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (String(bill.userId) !== String(dbUser._id))
      return res
        .status(403)
        .json({ error: "You can only submit proof for your own bills" });
    if (getVisibleBillSnapshot(bill).status === "paid")
      return res.status(400).json({ error: "Bill is already paid" });
    if (bill.paymentProof?.verificationStatus === "pending-verification")
      return res.status(400).json({
        error: "Payment proof already submitted and pending verification",
      });

    bill.paymentProof = {
      imageUrl,
      submittedAmount: amount,
      submittedAt: new Date(),
      verificationStatus: "pending-verification",
      rejectionReason: null,
      verifiedBy: null,
      verifiedAt: null,
    };
    await bill.save();

    res.json({
      message: "Payment proof submitted successfully",
      bill: { id: bill._id, paymentProof: bill.paymentProof },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Verify payment proof
// ============================================================================

export const verifyPayment = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const { action, rejectionReason } = req.body; // action: "approve" | "reject"

    if (!["approve", "reject"].includes(action))
      return res
        .status(400)
        .json({ error: "Action must be 'approve' or 'reject'" });

    const admin = await getAdminInfo(req);
    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Access denied" });
    if (bill.paymentProof?.verificationStatus !== "pending-verification")
      return res
        .status(400)
        .json({ error: "No pending payment proof to verify" });

    if (action === "approve") {
      bill.paymentProof.verificationStatus = "approved";
      bill.paymentProof.verifiedBy = admin._id;
      bill.paymentProof.verifiedAt = new Date();
      bill.paidAmount = roundMoney(
        Number(bill.paidAmount || 0) +
          Number(bill.paymentProof.submittedAmount || bill.totalAmount || 0),
      );
      syncBillAmounts(bill);
      if (bill.paidAmount > 0) {
        bill.paymentDate = new Date();
      }
    } else {
      bill.paymentProof.verificationStatus = "rejected";
      bill.paymentProof.rejectionReason =
        rejectionReason || "Payment proof not acceptable";
      bill.paymentProof.verifiedBy = admin._id;
      bill.paymentProof.verifiedAt = new Date();
    }
    await bill.save();

    // Send email notification to tenant (non-blocking)
    try {
      const tenant = await User.findById(bill.userId).lean();
      if (tenant?.email) {
        const monthStr = dayjs(bill.billingMonth).format("MMMM YYYY");
        if (action === "approve") {
          const approvedAmount =
            bill.paymentProof?.submittedAmount || bill.totalAmount || 0;
          sendPaymentApprovedEmail({
            to: tenant.email,
            tenantName:
              `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
            billingMonth: monthStr,
            paidAmount: approvedAmount,
            branchName: bill.branch,
          }).catch((e) => logger.warn({ err: e }, "Payment approved email failed"));
        } else {
          sendPaymentRejectedEmail({
            to: tenant.email,
            tenantName:
              `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
            billingMonth: monthStr,
            rejectionReason: bill.paymentProof.rejectionReason,
            branchName: bill.branch,
          }).catch((e) => logger.warn({ err: e }, "Payment rejected email failed"));
        }
      }
    } catch (emailErr) {
      logger.warn({ err: emailErr }, "Email notification failed");
    }

    res.json({
      message: `Payment ${action}d successfully`,
      bill: {
        id: bill._id,
        status: bill.status,
        paymentProof: bill.paymentProof,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Get pending verifications
// ============================================================================

export const getPendingVerifications = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const filter = {
      "paymentProof.verificationStatus": "pending-verification",
      isArchived: false,
    };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const bills = await Bill.find(filter)
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch")
      .sort({ "paymentProof.submittedAt": -1 })
      .lean();

    res.json({
      count: bills.length,
      bills: bills.map((b) => ({
        id: b._id,
        tenant: b.userId
          ? {
              name: `${b.userId.firstName || ""} ${b.userId.lastName || ""}`.trim(),
              email: b.userId.email,
            }
          : null,
        room: b.roomId?.name || "N/A",
        branch: b.branch,
        billingMonth: b.billingMonth,
        totalAmount: getVisibleBillSnapshot(b).totalAmount,
        paymentProof: b.paymentProof,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PENALTY: Auto-apply penalties for overdue bills
// ============================================================================

export const applyPenalties = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const now = dayjs();
    const penaltyRatePerDay = await getPenaltyRatePerDay();
    const filter = {
      status: { $in: ["pending", "overdue", "partially-paid"] },
      dueDate: { $lt: now.toDate() },
      isArchived: false,
    };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const overdueBills = await Bill.find(filter);
    let updated = 0;

    for (const bill of overdueBills) {
      const daysLate = Math.max(1, now.diff(dayjs(bill.dueDate), "day"));
      const penalty = daysLate * penaltyRatePerDay;

      // Recalculate total: base charges + penalty - discount
      bill.charges.penalty = penalty;
      bill.penaltyDetails = {
        daysLate,
        ratePerDay: penaltyRatePerDay,
        appliedAt: now,
      };
      syncBillAmounts(bill);
      bill.status = "overdue";
      await bill.save();
      updated++;
    }

    res.json({ message: `Penalties applied to ${updated} bills`, updated });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Billing report
// ============================================================================

export const getBillingReport = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const filter = { isArchived: false };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const [totalBills, paidBills, overdueBills, pendingVerifications] =
      await Promise.all([
        Bill.countDocuments(filter),
        Bill.aggregate([
          { $match: { ...filter, status: "paid" } },
          {
            $group: {
              _id: null,
              total: { $sum: "$paidAmount" },
              count: { $sum: 1 },
            },
          },
        ]),
        Bill.aggregate([
          { $match: { ...filter, status: "overdue" } },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
              count: { $sum: 1 },
              penalties: { $sum: "$charges.penalty" },
            },
          },
        ]),
        Bill.countDocuments({
          ...filter,
          "paymentProof.verificationStatus": "pending-verification",
        }),
      ]);

    res.json({
      totalBills,
      collected: {
        amount: paidBills[0]?.total || 0,
        count: paidBills[0]?.count || 0,
      },
      overdue: {
        amount: overdueBills[0]?.total || 0,
        count: overdueBills[0]?.count || 0,
        penalties: overdueBills[0]?.penalties || 0,
      },
      pendingVerifications,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Delete a bill (hard delete — for orphaned / erroneous bills)
// ============================================================================

export const deleteBill = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const admin = await getAdminInfo(req);

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    // Branch isolation — admins can only delete bills from their branch
    if (!admin.isSuperAdmin && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Access denied" });

    // Guard: don't delete paid bills (audit trail matters)
    if (bill.status === "paid")
      return res.status(400).json({
        error: "Cannot delete a paid bill. Paid bills must be retained for audit purposes.",
      });

    await bill.deleteOne();

    logger.info(
      { billId, deletedBy: admin._id, branch: bill.branch },
      "Bill deleted by admin",
    );

    res.json({ success: true, message: "Bill deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Bulk-generate bills for all occupied rooms in a branch
// ============================================================================

export const generateBulkBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      billingMonth,
      dueDate,
      defaultCharges = {},
    } = req.body;

    const branch =
      admin.isSuperAdmin && req.body.branch ? req.body.branch : admin.branch;
    if (!branch)
      return res.status(400).json({ error: "Branch is required" });

    const monthDate = dayjs(billingMonth || undefined);
    const monthStart = monthDate.startOf("month").toDate();
    const monthEnd = monthDate.endOf("month").toDate();
    // Find all rooms in this branch
    const rooms = await Room.find({ branch, isArchived: false });
    const adminUser = await User.findOne({ firebaseUid: req.user.uid });

    const summary = {
      roomsProcessed: 0,
      roomsSkipped: 0,
      billsGenerated: 0,
      errors: [],
    };

    for (const room of rooms) {
      // Skip if a RoomBill already exists for this room + month
      const existing = await RoomBill.findOne({
        roomId: room._id,
        billingMonth: monthStart,
        isArchived: false,
      });
      if (existing) {
        summary.roomsSkipped++;
        continue;
      }

      // Find checked-in tenants for this room
      const checkedInReservations = await Reservation.find({
        roomId: room._id,
        status: "checked-in",
        isArchived: { $ne: true },
      }).populate("userId", "firstName lastName email");

      if (checkedInReservations.length === 0) {
        summary.roomsSkipped++;
        continue;
      }

      // Build tenant info
      const tenantInfos = [];
      const seenUserIds = new Set();

      for (const reservation of checkedInReservations) {
        if (!reservation?.userId) continue;
        if (seenUserIds.has(String(reservation.userId._id))) continue;
        seenUserIds.add(String(reservation.userId._id));

        const moveInDate = reservation.checkInDate || monthStart;
        const rent = suggestRent(reservation, room, moveInDate);
        const customCharges = reservation.customCharges || [];
        const tenantStart = dayjs(
          Math.max(dayjs(moveInDate).valueOf(), dayjs(monthStart).valueOf()),
        );
        const tenantEnd = dayjs(
          Math.min(Date.now(), dayjs(monthEnd).add(1, "day").valueOf()),
        );
        const daysInRoom =
          Math.max(1, (tenantEnd.diff(tenantStart, "day", true) | 0) || 1);

        tenantInfos.push({
          userId: reservation.userId._id,
          reservationId: reservation._id,
          userName:
            `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim() ||
            "Tenant",
          email: reservation.userId.email || "",
          rent,
          customCharges,
          daysInRoom,
          moveInDate,
        });
      }

      if (tenantInfos.length === 0) {
        summary.roomsSkipped++;
        continue;
      }

      try {
        // Use per-room charges if provided, otherwise use defaults
        const roomCharges = {
          electricity: Number(defaultCharges.electricity) || 0,
          water: Number(defaultCharges.water) || 0,
        };
        const totalUtilities = roomCharges.electricity + roomCharges.water;
        const totalOccupantDays = tenantInfos.reduce(
          (s, t) => s + t.daysInRoom,
          0,
        );

        const generatedBills = [];
        const tenantBreakdown = [];

        for (const tenant of tenantInfos) {
          const share = tenant.daysInRoom / totalOccupantDays;
          // Skip if bill already exists for this tenant+month
          const dupeFilter = {
            userId: tenant.userId,
            billingMonth: monthStart,
            isArchived: false,
          };
          if (tenant.reservationId)
            dupeFilter.reservationId = tenant.reservationId;
          if (await Bill.findOne(dupeFilter)) continue;

          // Room-type-aware water splitting
          const te = r2(roomCharges.electricity * share);
          const tw = computeWaterShare(
            room.type,
            roomCharges.water,
            tenantInfos.length,
          );
          const utilityShare = te + tw;

          const tenantCustomCharges = tenant.customCharges || [];
          const customChargesTotal = tenantCustomCharges.reduce(
            (sum, c) => sum + (Number(c.amount) || 0),
            0,
          );
          const grossAmount = roundMoney(tenant.rent + utilityShare + customChargesTotal);
          const billingContext = tenant.reservationId
            ? await getReservationBillingContext(tenant.reservationId)
            : null;
          const reservationCreditApplied = Math.min(
            grossAmount,
            billingContext?.creditAvailable || 0,
          );
          const cycleDueDate = dueDate
            ? dayjs(dueDate).toDate()
            : billingContext?.cycle?.dueDate || monthDate.add(1, "month").date(15).toDate();

          const bill = new Bill({
            reservationId: tenant.reservationId,
            userId: tenant.userId,
            branch: room.branch,
            roomId: room._id,
            billingMonth: billingContext?.cycle?.billingMonth || monthStart,
            billingCycleStart: billingContext?.cycle?.billingCycleStart || monthStart,
            billingCycleEnd: billingContext?.cycle?.billingCycleEnd || cycleDueDate,
            dueDate: cycleDueDate,
            isFirstCycleBill: !!billingContext?.isFirstCycleBill,
            proRataDays: tenant.daysInRoom,
            charges: {
              rent: tenant.rent,
              electricity: te,
              water: tw,
              applianceFees: customChargesTotal,
              corkageFees: 0,
              penalty: 0,
              discount: 0,
            },
            additionalCharges: tenantCustomCharges.map((c) => ({
              name: c.name,
              amount: c.amount,
            })),
            grossAmount,
            reservationCreditApplied,
            totalAmount: grossAmount,
            remainingAmount: grossAmount,
            status: "pending",
          });
          syncBillAmounts(bill);
          await bill.save();
          if (billingContext?.reservation && reservationCreditApplied > 0) {
            billingContext.reservation.reservationCreditConsumedAt = new Date();
            billingContext.reservation.reservationCreditAppliedBillId = bill._id;
            await billingContext.reservation.save();
          }
          generatedBills.push(bill._id);
          tenantBreakdown.push({
            userId: tenant.userId,
            reservationId: tenant.reservationId,
            daysInRoom: tenant.daysInRoom,
            proRataShare: Math.round(share * 10000) / 10000,
            rent: tenant.rent,
            utilityShare,
            grossAmount,
            reservationCreditApplied,
            totalAmount: bill.totalAmount,
            billId: bill._id,
          });
        }

        if (generatedBills.length > 0) {
          const roomBill = new RoomBill({
            roomId: room._id,
            branch: room.branch,
            billingMonth: monthStart,
            dueDate: dueDate ? dayjs(dueDate).toDate() : null,
            charges: roomCharges,
            totalCharges: totalUtilities,
            generatedBills,
            status: "generated",
            generatedBy: adminUser?._id || null,
            tenantBreakdown,
          });
          await roomBill.save();
          await Bill.updateMany(
            { _id: { $in: generatedBills } },
            { $set: { roomBillId: roomBill._id } },
          );
          summary.billsGenerated += generatedBills.length;
        }

        summary.roomsProcessed++;
      } catch (roomErr) {
        logger.error(
          { err: roomErr, roomId: String(room._id) },
          "Bulk bill generation failed for room",
        );
        summary.errors.push({
          room: room.name,
          error: roomErr.message,
        });
      }
    }

    const statusCode = summary.billsGenerated > 0 ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: `Bulk generation complete: ${summary.billsGenerated} bills created across ${summary.roomsProcessed} rooms (${summary.roomsSkipped} skipped)`,
      summary,
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomReadiness = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isSuperAdmin && req.query.branch ? req.query.branch : (req.branchFilter || admin.branch);
    const roomFilter = { isArchived: false };
    if (branch) roomFilter.branch = branch;

    const rooms = await Room.find(roomFilter)
      .select("name roomNumber branch type")
      .sort({ name: 1 })
      .lean();

    const readiness = await Promise.all(rooms.map((room) => getRoomPublishState(room)));
    const cycleSource = readiness.find((entry) => entry.electricityPeriod || entry.waterPeriod);

    res.json({
      cycleStart:
        cycleSource?.electricityPeriod?.startDate ||
        cycleSource?.waterPeriod?.startDate ||
        null,
      cycleEnd:
        cycleSource?.electricityPeriod?.endDate ||
        cycleSource?.waterPeriod?.endDate ||
        null,
      rooms: readiness.map((entry) => ({
        roomId: entry.roomId,
        roomName: entry.roomName,
        branch: entry.branch,
        type: entry.type,
        waterApplicable: entry.waterApplicable,
        draftBillCount: entry.draftBillCount,
        issuedBillCount: entry.issuedBillCount,
        electricityStatus: entry.electricityStatus,
        waterStatus: entry.waterStatus,
        isReadyToPublish: entry.isReadyToPublish,
        publishState: entry.publishState,
        blockingReason: entry.blockingReason,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getMyUtilityBreakdownByBillId = async (req, res, next) => {
  try {
    const { billId, utilityType } = req.params;
    if (!["electricity", "water"].includes(utilityType)) {
      return res.status(400).json({ error: "Invalid utility type" });
    }

    const { dbUser, bill } = await getTenantBillForRequest(req, billId);
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!isUtilityChargeVisible(bill, utilityType)) {
      return res.status(404).json({ error: `No ${utilityType} breakdown found for this bill` });
    }
    const breakdown = await buildTenantUtilityBreakdown({ dbUser, bill, utilityType });
    if (!breakdown) {
      return res.status(404).json({ error: `No ${utilityType} breakdown found for this bill` });
    }

    return res.json(breakdown);
  } catch (error) {
    next(error);
  }
};

export const publishRoomBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const room = await Room.findById(req.params.roomId).lean();
    if (!room || room.isArchived) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (!admin.isSuperAdmin && room.branch !== (req.branchFilter || admin.branch)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const readiness = await getRoomPublishState(room);
    if (readiness.draftBillCount === 0) {
      return res.status(409).json({ error: "No draft bills found for this room." });
    }
    if (!readiness.isReadyToPublish) {
      return res.status(409).json({ error: readiness.blockingReason });
    }

    const referencePeriod = readiness.electricityPeriod || readiness.waterPeriod;
    const result = buildPublishResultFromPeriod(readiness.electricityPeriod || readiness.waterPeriod);
    const sendResult = await sendDraftUtilityBills({
      bills: readiness.draftBills,
      period: referencePeriod,
      result,
    });

    res.json({
      success: true,
      roomId: room._id,
      roomName: readiness.roomName,
      published: sendResult.sent,
      issuedAt: sendResult.issuedAt,
      dueDate: sendResult.dueDate,
      deliveries: sendResult.deliveries,
      partialFailures: sendResult.deliveries.filter(
        (entry) => entry.pdfError || entry.emailError || entry.notificationError,
      ),
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCurrentBilling,
  getBillingHistory,
  getBillingStats,
  markBillAsPaid,
  getBillsByBranch,
  getMyBills,
  submitPaymentProof,
  verifyPayment,
  getPendingVerifications,
  applyPenalties,
  getBillingReport,
  deleteBill,
  getMyUtilityBreakdownByBillId,
  getRoomReadiness,
  publishRoomBills,
};
