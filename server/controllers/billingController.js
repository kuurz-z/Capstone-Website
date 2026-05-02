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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
import { applyBillPayment } from "../utils/paymentLedger.js";
import { ensureCurrentCycleRentBill } from "../utils/rentGenerator.js";
import {
  getBillRemainingAmount,
  getReservationRecurringFees,
  getVisibleBillCharges,
  getVisibleBillSnapshot,
  isUtilityChargeVisible,
  getReservationCreditAvailable,
  buildRentBillingCycle,
  resolveCurrentRentBillingCycle,
  resolveBillStatus,
  roundMoney,
  syncBillAmounts,
} from "../utils/billingPolicy.js";
import { computePenalty, fetchPenaltySettings } from "../utils/penaltyCalculator.js";
import notify from "../utils/notificationService.js";
import { sendDraftUtilityBills } from "../utils/utilityBillFlow.js";
import { generateBillPdf } from "../utils/pdfGenerator.js";
import { logBillingAudit } from "../utils/billingAudit.js";
import { isWaterBillableRoom } from "../utils/utilityFlowRules.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "../utils/lifecycleNaming.js";
import { resolveAdminAccessContext } from "../utils/adminAccess.js";

const getAdminInfo = resolveAdminAccessContext;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.join(__dirname, "..");
const BILL_PDF_ROOT = path.join(SERVER_ROOT, "uploads", "bills");

function resolveManualPaymentMethod(note = "") {
  const normalized = String(note || "").trim().toLowerCase();

  if (normalized.includes("gcash")) return "gcash";
  if (normalized.includes("maya") || normalized.includes("paymaya")) return "paymaya";
  if (normalized.includes("grab")) return "grab_pay";
  if (normalized.includes("bank")) return "bank";
  if (normalized.includes("card") || normalized.includes("credit") || normalized.includes("debit")) {
    return "card";
  }
  if (normalized.includes("check") || normalized.includes("cheque")) return "check";

  return "cash";
}

function resolveProofPaymentMethod(bill) {
  const existingMethod = String(bill?.paymentMethod || "").trim().toLowerCase();
  if (
    ["bank", "gcash", "card", "check", "cash", "paymongo", "paymaya", "grab_pay", "maya", "online"].includes(
      existingMethod,
    )
  ) {
    return existingMethod;
  }

  return "bank";
}

function isPaymentValidationError(error) {
  return (
    error?.message === "Bill has no remaining balance." ||
    error?.message === "Payment amount must be greater than zero."
  );
}

function buildBillPaymentFlow(bill, visibleSnapshot = null) {
  const visible = visibleSnapshot || getVisibleBillSnapshot(bill);
  const proofStatus = bill?.paymentProof?.verificationStatus || "none";

  let tenantMessage = "Use online checkout from the Billing page to pay this statement.";
  let adminMessage =
    "Use manual settlement only for branch-assisted offline payments such as cash or bank transfer.";

  if (proofStatus === "pending-verification") {
    tenantMessage =
      "A previously submitted offline payment proof is awaiting staff review. New proof uploads are disabled; use online checkout for future payments.";
    adminMessage =
      "Review this proof only because it was submitted before online checkout became the standard monthly-billing flow.";
  } else if (proofStatus === "approved" || proofStatus === "rejected") {
    tenantMessage =
      "Offline payment proof uploads are no longer used for monthly bills. Use online checkout for future payments.";
    adminMessage =
      "This proof record is legacy billing history. New monthly payments should go through online checkout or an assisted offline settlement.";
  }

  return {
    primary: "online_checkout",
    onlineCheckoutEligible:
      Number(visible?.remainingAmount || 0) > 0 && visible?.status !== "paid",
    manualProofSubmissionEnabled: false,
    legacyProofStatus: proofStatus === "none" ? null : proofStatus,
    adminManualSettlementScope: "offline-only",
    tenantMessage,
    adminMessage,
  };
}

/* ─── shared helpers ─────────────────────────────── */

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
  const roomId = bill.roomId?._id || bill.roomId || bill.reservationId?.roomId || null;
  const roomName =
    bill.roomId?.name ||
    bill.roomId?.roomNumber ||
    bill.reservationId?.roomName ||
    "N/A";
  return {
    id: bill._id,
    tenant: bill.userId
      ? {
          id: bill.userId._id,
          name: `${bill.userId.firstName || ""} ${bill.userId.lastName || ""}`.trim(),
          email: bill.userId.email,
        }
      : null,
    roomId,
    room: roomName,
    roomName,
    branch: bill.branch,
    billReference: formatBillReference(bill),
    billingMonth: bill.billingMonth,
    dueDate: visible.dueDate,
    issuedAt: visible.issuedAt,
    sentAt: bill.sentAt || null,
    billingCycleStart: bill.billingCycleStart,
    billingCycleEnd: bill.billingCycleEnd,
    utilityCycleStart: bill.utilityCycleStart || null,
    utilityCycleEnd: bill.utilityCycleEnd || null,
    utilityReadingDate: bill.utilityReadingDate || null,
    additionalCharges: bill.additionalCharges || [],
    charges: visible.charges,
    grossAmount: visible.grossAmount,
    reservationCreditApplied: bill.reservationCreditApplied || 0,
    totalAmount: visible.totalAmount,
    paidAmount: bill.paidAmount || 0,
    remainingAmount: visible.remainingAmount,
    isFirstCycleBill: !!bill.isFirstCycleBill,
    status: visible.status,
    paymentProof: bill.paymentProof || { verificationStatus: "none" },
    paymentFlow: buildBillPaymentFlow(bill, visible),
    delivery: bill.delivery || {},
    pdfPath: bill.pdfPath || null,
    pdfAvailable: Boolean(bill.pdfPath),
    pdfGeneratedAt: bill.pdfGeneratedAt || null,
    notes: bill.notes,
    createdAt: bill.createdAt,
  };
};

async function getReservationBillingContext(
  reservationId,
  currentBillId = null,
  referenceDate = new Date(),
) {
  const reservation = await Reservation.findById(reservationId);
  const moveInDate = readMoveInDate(reservation);
  if (!reservation || !moveInDate) return null;

  const existingCount = await Bill.countDocuments({
    reservationId: reservation._id,
    isArchived: false,
    "charges.rent": { $gt: 0 },
    ...(currentBillId ? { _id: { $ne: currentBillId } } : {}),
  });

  const cycle = resolveCurrentRentBillingCycle(moveInDate, referenceDate);
  const creditAvailable = getReservationCreditAvailable(reservation);

  return {
    reservation,
    existingCount,
    cycle,
    isFirstCycleBill: existingCount === 0,
    creditAvailable,
  };
}

function sortReservationsByMoveIn(reservations = []) {
  return [...reservations].sort((left, right) => {
    const leftMoveIn = readMoveInDate(left)
      ? dayjs(readMoveInDate(left)).valueOf()
      : 0;
    const rightMoveIn = readMoveInDate(right)
      ? dayjs(readMoveInDate(right)).valueOf()
      : 0;
    return rightMoveIn - leftMoveIn;
  });
}

async function getActiveReservationForUser(userId, { populateBilling = false } = {}) {
  let activeReservationsQuery = Reservation.find({
    userId,
    status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
    isArchived: { $ne: true },
  });

  if (populateBilling) {
    activeReservationsQuery = activeReservationsQuery
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch price monthlyPrice type");
  } else {
    activeReservationsQuery = activeReservationsQuery.lean();
  }

  const activeReservations = await activeReservationsQuery;

  if (activeReservations.length === 0) return null;

  return sortReservationsByMoveIn(activeReservations)[0];
}

async function ensureTenantCurrentRentBill(userId, referenceDate = new Date()) {
  const activeStay = await getActiveReservationForUser(userId, {
    populateBilling: true,
  });
  if (!activeStay) return null;

  await ensureCurrentCycleRentBill({
    reservation: activeStay,
    referenceDate,
    dryRun: false,
    notifyTenant: false,
    requireGenerationDateMatch: false,
  });

  return activeStay;
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
    .populate("roomId", "name roomNumber branch type")
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
 * @param {number}  tenantCount – Number of moved-in tenants in the room
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

function parseRequiredDate(value, label) {
  const parsed = dayjs(value);
  if (!value || !parsed.isValid()) {
    const error = new Error(`${label} is required`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.startOf("day");
}

function createBillingError(message, statusCode = 400, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function formatBillReference(bill = {}) {
  const id = String(bill?._id || bill?.id || "").slice(-6).toUpperCase();
  const month = bill?.billingMonth && dayjs(bill.billingMonth).isValid()
    ? dayjs(bill.billingMonth).format("YYYYMM")
    : dayjs().format("YYYYMM");
  return `LC-RB-${month}-${id || "DRAFT"}`;
}

function resolveRentCycleForBillingMonth(reservation, billingMonth) {
  const moveInDate = readMoveInDate(reservation);
  if (!moveInDate) {
    throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
  }

  const selectedMonth = parseRequiredDate(billingMonth, "Billing month").startOf("month");
  const monthEnd = selectedMonth.endOf("month");
  const anchor = dayjs(moveInDate).startOf("day");

  if (anchor.isAfter(monthEnd)) {
    throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
  }

  let cycleIndex = Math.max(0, selectedMonth.diff(anchor, "month"));
  let cycle = buildRentBillingCycle(anchor.toDate(), cycleIndex);

  while (dayjs(cycle.billingCycleStart).isBefore(selectedMonth, "day")) {
    cycleIndex += 1;
    cycle = buildRentBillingCycle(anchor.toDate(), cycleIndex);
  }

  if (dayjs(cycle.billingCycleStart).isAfter(monthEnd, "day")) {
    throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
  }

  return cycle;
}

function resolveRentDueDate(cycle, dueDate) {
  const resolved = dueDate
    ? parseRequiredDate(dueDate, "Due date")
    : dayjs(cycle.dueDate).startOf("day");

  if (resolved.isBefore(dayjs(cycle.billingCycleEnd).startOf("day"))) {
    throw createBillingError(
      "Due date must be on or after the billing period end.",
      400,
      "INVALID_DUE_DATE",
    );
  }

  return resolved.toDate();
}

function resolveRentAmountForBilling(reservation, room, cycle, rentAmount) {
  const explicitRent =
    rentAmount === undefined || rentAmount === null || rentAmount === ""
      ? null
      : Number(rentAmount);
  const rent = explicitRent === null
    ? suggestRent(reservation, room, cycle.billingCycleStart)
    : explicitRent;

  if (!Number.isFinite(rent) || rent <= 0) {
    throw createBillingError("Invalid rent amount", 400, "INVALID_RENT_AMOUNT");
  }

  return roundMoney(rent);
}

function buildRentDuplicateFilter(reservationId, cycle, billingMonth) {
  const selectedMonth = parseRequiredDate(billingMonth, "Billing month").startOf("month");
  const nextMonthStart = selectedMonth.add(1, "month");
  const cycleStart = dayjs(cycle.billingCycleStart).startOf("day").toDate();
  const cycleEnd = dayjs(cycle.billingCycleEnd).startOf("day").toDate();

  return {
    reservationId,
    isArchived: false,
    "charges.rent": { $gt: 0 },
    $or: [
      { billingCycleStart: cycleStart },
      { billingMonth: cycleStart },
      {
        billingCycleStart: {
          $gte: cycleStart,
          $lt: cycleEnd,
        },
      },
      {
        billingMonth: {
          $gte: selectedMonth.toDate(),
          $lt: nextMonthStart.toDate(),
        },
      },
    ],
  };
}

function getBedLabel(reservation = {}) {
  return (
    reservation?.selectedBed?.position ||
    reservation?.selectedBed?.id ||
    reservation?.bedDetails?.position ||
    reservation?.bedDetails?.id ||
    ""
  );
}

function getRoomLabel(room = {}) {
  return room?.name || room?.roomNumber || "Room";
}

async function loadRentReservationForAdmin({ reservationId, branch }) {
  if (!reservationId) {
    throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
  }

  const reservation = await Reservation.findOne({
    _id: reservationId,
    status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName email")
    .populate("roomId", "name roomNumber branch type price monthlyPrice");

  if (!reservation || !reservation.userId || !reservation.roomId) {
    throw createBillingError("No active tenant", 404, "NO_ACTIVE_TENANT");
  }
  if (reservation.roomId.branch !== branch) {
    throw createBillingError("Access denied.", 403, "ACCESS_DENIED");
  }

  return reservation;
}

async function loadRentBillForAdmin({ billId, branch }) {
  if (!billId) {
    throw createBillingError("Bill not found", 404, "BILL_NOT_FOUND");
  }

  const bill = await Bill.findOne({
    _id: billId,
    isArchived: false,
    "charges.rent": { $gt: 0 },
  });

  if (!bill) {
    throw createBillingError("Bill not found", 404, "BILL_NOT_FOUND");
  }

  if (branch && bill.branch !== branch) {
    throw createBillingError("Access denied.", 403, "ACCESS_DENIED");
  }

  return bill;
}

async function buildRentBillDraft({
  reservation,
  branch,
  billingMonth,
  dueDate,
  rentAmount,
  notes = "",
  allowDuplicate = false,
}) {
  const room = reservation.roomId || {};
  const cycle = resolveRentCycleForBillingMonth(reservation, billingMonth);
  const dueDateValue = resolveRentDueDate(cycle, dueDate);
  const duplicate = await Bill.findOne(
    buildRentDuplicateFilter(reservation._id, cycle, billingMonth),
  ).populate("userId", "firstName lastName email");

  if (duplicate && !allowDuplicate) {
    const error = createBillingError("Duplicate bill exists", 409, "DUPLICATE_RENT_BILL");
    error.bill = duplicate;
    throw error;
  }

  const rent = resolveRentAmountForBilling(reservation, room, cycle, rentAmount);
  const recurring = getReservationRecurringFees(reservation);
  const applianceFees = roundMoney(recurring.applianceFees || 0);
  const grossAmount = roundMoney(rent + applianceFees);
  const priorRentBill = await Bill.findOne({
    reservationId: reservation._id,
    isArchived: false,
    "charges.rent": { $gt: 0 },
    ...(duplicate ? { _id: { $ne: duplicate._id } } : {}),
  }).select("_id");
  const isFirstCycleBill = !priorRentBill;
  const creditAvailable = getReservationCreditAvailable(reservation);
  const reservationCreditApplied = isFirstCycleBill
    ? Math.min(grossAmount, creditAvailable)
    : 0;

  const bill = new Bill({
    reservationId: reservation._id,
    userId: reservation.userId._id,
    branch,
    roomId: room._id,
    billingMonth: cycle.billingMonth,
    billingCycleStart: cycle.billingCycleStart,
    billingCycleEnd: cycle.billingCycleEnd,
    dueDate: dueDateValue,
    issuedAt: new Date(),
    sentAt: new Date(),
    isFirstCycleBill,
    proRataDays: dayjs(cycle.billingCycleEnd).diff(
      dayjs(cycle.billingCycleStart),
      "day",
    ),
    charges: {
      rent,
      electricity: 0,
      water: 0,
      applianceFees,
      corkageFees: 0,
      penalty: 0,
      discount: 0,
    },
    additionalCharges: recurring.additionalCharges,
    grossAmount,
    reservationCreditApplied,
    totalAmount: grossAmount,
    remainingAmount: grossAmount,
    status: "pending",
    notes,
  });

  syncBillAmounts(bill);

  return {
    bill,
    duplicate,
    cycle,
    recurring,
    rent,
    applianceFees,
    grossAmount,
    reservationCreditApplied,
  };
}

function formatRentBillPreview({ reservation, bill, duplicate = null, cycle }) {
  const tenant = reservation.userId || {};
  const room = reservation.roomId || {};
  return {
    reservationId: reservation._id,
    tenant: {
      id: tenant._id,
      name:
        [tenant.firstName, tenant.lastName].filter(Boolean).join(" ").trim() ||
        "Tenant",
      email: tenant.email || "",
      moveInDate: readMoveInDate(reservation),
    },
    branch: room.branch || bill.branch,
    room: {
      id: room._id || null,
      name: getRoomLabel(room),
      bed: getBedLabel(reservation),
    },
    billReference: formatBillReference(bill),
    billingMonth: bill.billingMonth,
    billingPeriod: {
      start: bill.billingCycleStart,
      end: bill.billingCycleEnd,
      cycleIndex: cycle?.cycleIndex ?? null,
    },
    dueDate: bill.dueDate,
    charges: {
      rent: bill.charges?.rent || 0,
      applianceFees: bill.charges?.applianceFees || 0,
      electricity: bill.charges?.electricity || 0,
      water: bill.charges?.water || 0,
      penalty: bill.charges?.penalty || 0,
      discount: bill.charges?.discount || 0,
    },
    additionalCharges: bill.additionalCharges || [],
    creditApplied: bill.reservationCreditApplied || 0,
    grossAmount: bill.grossAmount || 0,
    totalAmount: bill.totalAmount || 0,
    status: duplicate ? "already_billed" : "ready",
    duplicateBill: duplicate ? formatBill(duplicate) : null,
  };
}

async function generateRentBillPdf({ bill, reservation }) {
  const room = reservation.roomId || bill.roomId;
  const tenant = reservation.userId || bill.userId;
  const billPayload = {
    ...(bill.toObject ? bill.toObject() : bill),
    billReference: formatBillReference(bill),
  };
  const pdfPath = await generateBillPdf({
    bill: billPayload,
    billingResult: null,
    period: {
      startDate: bill.billingCycleStart || bill.billingMonth,
      endDate: bill.billingCycleEnd || bill.dueDate,
      branch: bill.branch,
    },
    room,
    tenant,
  });

  bill.pdfPath = pdfPath;
  bill.pdfGeneratedAt = new Date();
  await bill.save();
  return pdfPath;
}

async function finalizeRentBill({
  req,
  admin,
  reservation,
  draft,
}) {
  const { bill } = draft;
  await bill.save();

  if (bill.reservationCreditApplied > 0 && typeof reservation.save === "function") {
    reservation.reservationCreditConsumedAt = new Date();
    reservation.reservationCreditAppliedBillId = bill._id;
    await reservation.save();
  }

  let pdfError = null;
  try {
    await generateRentBillPdf({ bill, reservation });
  } catch (error) {
    pdfError = error.message || "PDF generation failed";
  }

  const delivery = await deliverBillNotification({
    bill,
    tenant: reservation.userId,
    room: reservation.roomId,
    billType: "rent",
  });

  await logBillingAudit(req, {
    admin,
    action: "Rent bill generated",
    details: `Generated rent bill ${formatBillReference(bill)} for ${bill.totalAmount}`,
    entityId: bill._id,
    branch: bill.branch,
    metadata: {
      reservationId: String(reservation._id),
      tenantId: String(reservation.userId?._id || reservation.userId),
      billingCycleStart: bill.billingCycleStart,
      billingCycleEnd: bill.billingCycleEnd,
      dueDate: bill.dueDate,
      rentAmount: bill.charges?.rent || 0,
      applianceFees: bill.charges?.applianceFees || 0,
      creditApplied: bill.reservationCreditApplied || 0,
      totalAmount: bill.totalAmount,
      emailStatus: delivery.email?.status,
      notificationStatus: delivery.notification?.status,
      pdfGenerated: Boolean(bill.pdfPath),
      pdfError,
    },
  });

  await bill.populate("userId", "firstName lastName email");
  await bill.populate("roomId", "name roomNumber branch type");
  await bill.populate("reservationId", "roomId roomName bedDetails");

  return {
    bill,
    delivery: {
      ...delivery,
      pdf: {
        status: pdfError ? "failed" : bill.pdfPath ? "generated" : "not_attempted",
        path: bill.pdfPath || null,
        generatedAt: bill.pdfGeneratedAt || null,
        error: pdfError || "",
      },
    },
  };
}

function summarizeRentTenantRows(tenants = []) {
  const alreadyBilled = tenants.filter((tenant) => tenant.currentMonthBill).length;
  const missingData = tenants.filter((tenant) => tenant.billStatus === "missing_data").length;
  const readyToGenerate = tenants.filter((tenant) => tenant.billStatus === "ready").length;
  return {
    totalTenants: tenants.length,
    alreadyBilled,
    missingData,
    readyToGenerate,
  };
}

function resolveRentBillType(bill = {}) {
  const charges = bill.charges || {};
  if (Number(charges.rent || 0) > 0) return "rent";
  if (Number(charges.water || 0) > 0 && Number(charges.electricity || 0) > 0) {
    return "utilities";
  }
  if (Number(charges.water || 0) > 0) return "water";
  if (Number(charges.electricity || 0) > 0) return "electricity";
  return "bill";
}

async function deliverBillNotification({ bill, tenant, room, billType = null }) {
  const tenantName =
    [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() ||
    "Tenant";
  const billingMonthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");
  const dueDateLabel = bill.dueDate
    ? dayjs(bill.dueDate).format("MMMM D, YYYY")
    : "the due date";
  const delivery = {
    email: { status: "not_attempted", sentAt: null, error: "" },
    notification: { status: "not_attempted", sentAt: null, error: "" },
  };

  if (tenant?.email) {
    const emailResult = await sendBillGeneratedEmail({
      to: tenant.email,
      tenantName,
      billingMonth: billingMonthLabel,
      totalAmount: bill.totalAmount,
      dueDate: dueDateLabel,
      branchName: room?.branch || bill.branch || "Lilycrest",
      billType: billType || resolveRentBillType(bill),
      roomName: room?.name || room?.roomNumber || "",
    });

    if (emailResult?.success) {
      delivery.email.status = "sent";
      delivery.email.sentAt = new Date();
    } else {
      delivery.email.status = "failed";
      delivery.email.error =
        emailResult?.error || emailResult?.message || "Email delivery failed";
    }
  }

  try {
    await notify.billGenerated(
      bill.userId,
      billingMonthLabel,
      bill.totalAmount,
      dueDateLabel,
      {
        billType: billType || resolveRentBillType(bill),
        billId: bill._id,
        actionUrl: "/billing",
      },
    );
    delivery.notification.status = "sent";
    delivery.notification.sentAt = new Date();
  } catch (error) {
    delivery.notification.status = "failed";
    delivery.notification.error = error.message || "Notification failed";
  }

  bill.delivery = delivery;
  await bill.save();
  return delivery;
}

function formatActiveRentTenant(
  reservation,
  existingBill = null,
  cycle = null,
  validationError = "",
) {
  const room = reservation.roomId || {};
  const tenant = reservation.userId || {};
  const moveInDate = readMoveInDate(reservation);
  const recurring = getReservationRecurringFees(reservation);
  const monthlyRent = suggestRent(reservation, room, moveInDate || new Date());
  const validationErrors = [];

  if (!moveInDate) validationErrors.push("No active tenant");
  if (!Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) <= 0) {
    validationErrors.push("Invalid rent amount");
  }
  if (validationError) validationErrors.push(validationError);

  const billStatus = existingBill
    ? "already_billed"
    : validationErrors.length > 0
      ? "missing_data"
      : "ready";

  return {
    reservationId: reservation._id,
    tenantId: tenant._id,
    tenantName:
      [tenant.firstName, tenant.lastName].filter(Boolean).join(" ").trim() ||
      "Tenant",
    email: tenant.email || "",
    branch: room.branch || "",
    roomId: room._id || null,
    roomName: room.name || room.roomNumber || "Room",
    roomNumber: room.roomNumber || room.name || "",
    roomType: room.type || "",
    roomCapacity: room.capacity || null,
    roomOccupancy: room.currentOccupancy || null,
    bedPosition: reservation.selectedBed?.position || reservation.selectedBed?.id || "",
    moveInDate,
    monthlyRent,
    billingCycle: cycle
      ? {
          start: cycle.billingCycleStart,
          end: cycle.billingCycleEnd,
          dueDate: cycle.dueDate,
          generationDate: cycle.generationDate,
          cycleIndex: cycle.cycleIndex,
        }
      : null,
    billingCycleStart: cycle?.billingCycleStart || null,
    billingCycleEnd: cycle?.billingCycleEnd || null,
    nextBillingDate: cycle?.generationDate || cycle?.billingCycleStart || null,
    dueDate: cycle?.dueDate || null,
    billStatus,
    validationErrors,
    customCharges: recurring.additionalCharges,
    currentMonthBill: existingBill
      ? {
          id: existingBill._id,
          status: existingBill.status,
          dueDate: existingBill.dueDate,
          totalAmount: existingBill.totalAmount,
          pdfAvailable: Boolean(existingBill.pdfPath),
        }
      : null,
  };
}

/* ─── controllers ────────────────────────────────── */

export const getCurrentBilling = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    const activeStay = await ensureTenantCurrentRentBill(dbUser._id);
    if (!activeStay)
      return res.status(404).json({ error: "No active stay found" });

    const now = dayjs();
    let currentBill = await Bill.findOne({
      reservationId: activeStay._id,
      status: { $ne: "draft" },
      isArchived: false,
      billingCycleStart: {
        $lte: now.startOf("day").toDate(),
      },
      billingCycleEnd: {
        $gt: now.startOf("day").toDate(),
      },
    }).sort({ billingCycleStart: -1, createdAt: -1 });
    if (!currentBill) {
      currentBill = await Bill.findOne({
        reservationId: activeStay._id,
        status: { $ne: "draft" },
        isArchived: false,
      }).sort({ billingCycleStart: -1, billingMonth: -1, createdAt: -1 });
    }
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
      additionalCharges: currentBill.additionalCharges || [],
      status: visible.status,
      charges: visible.charges,
      paymentProof: currentBill.paymentProof || { verificationStatus: "none" },
      paymentFlow: buildBillPaymentFlow(currentBill, visible),
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingHistory = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bills = await Bill.find({
      userId: dbUser._id,
      status: { $ne: "draft" },
      isArchived: false,
    })
      .sort({ billingCycleStart: -1, billingMonth: -1, createdAt: -1 })
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
          billingCycleStart: b.billingCycleStart,
          billingCycleEnd: b.billingCycleEnd,
          reservationCreditApplied: b.reservationCreditApplied || 0,
          paidAmount: b.paidAmount || 0,
          remainingAmount: visible.remainingAmount,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          additionalCharges: b.additionalCharges || [],
          status: visible.status,
          charges: visible.charges,
          paymentDate: b.paymentDate,
          paymentProof: b.paymentProof || { verificationStatus: "none" },
          paymentFlow: buildBillPaymentFlow(b, visible),
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
    //   null → owner scope (cross-branch), string → regular admin's branch
    const isOwner = req.isOwner;
    const branch = req.branchFilter;
    if (
      !isOwner &&
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
    if (!admin.isOwner && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Bill not found" });
    const appliedAmount = Number(
      amount ?? bill.remainingAmount ?? bill.totalAmount,
    );
    await applyBillPayment({
      bill,
      amount: appliedAmount,
      method: resolveManualPaymentMethod(note),
      source: "admin-manual",
      actorId: admin._id || null,
      notes: note || "",
      metadata: {
        action: "markBillAsPaid",
      },
      now: new Date(),
    });
    if (note) {
      bill.notes = note;
      await bill.save();
    }
    res.json({ success: true, bill: bill.toObject() });
  } catch (error) {
    if (isPaymentValidationError(error)) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

export const getBillsByBranch = async (req, res, next) => {
  try {
    const isOwner = req.isOwner;
    // Regular admin: req.branchFilter is their branch (enforced by middleware)
    // Owner: req.branchFilter is null, can pass branch via query
    const branch = req.branchFilter ||
      (isOwner && req.query.branch ? req.query.branch : null);

    if (!branch) {
      if (isOwner) {
        // Owner without branch filter — get all
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

export const getRoomsWithTenants = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isOwner && req.query.branch ? req.query.branch : admin.branch;
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter)
      .select(
        "name roomNumber branch type capacity currentOccupancy beds price monthlyPrice",
      )
      .sort({ name: 1 });

    // Batch fetch ALL moved-in reservations for every room in one query (N+1 fix)
    // Was: 1 Reservation.find() per room inside Promise.all → N+1 queries
    // Now: 2 queries total regardless of number of rooms
    const roomIds = rooms.map((r) => r._id);
    const allReservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
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
              moveInDate: readMoveInDate(r),
              monthlyRent: suggestRent(r, room, readMoveInDate(r)),
              customCharges: getReservationRecurringFees(r).additionalCharges,
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

export const getRentBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      req.branchFilter || (admin.isOwner && req.query.branch ? req.query.branch : null);
    const filter = {
      isArchived: false,
      "charges.rent": { $gt: 0 },
    };

    if (branch) filter.branch = branch;
    if (!branch && !admin.isOwner) {
      return res.status(403).json({ error: "Invalid branch" });
    }
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.tenantId) filter.userId = req.query.tenantId;

    const result = await fetchBills(filter, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getRentBillableTenants = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      req.branchFilter || (admin.isOwner && req.query.branch ? req.query.branch : null);
    if (!branch && !admin.isOwner) {
      return res.status(403).json({ error: "Invalid branch" });
    }

    const monthParam = req.query.month;
    const month = monthParam ? dayjs(monthParam, "YYYY-MM", true) : dayjs();
    if (monthParam && !month.isValid()) {
      return res.status(400).json({ error: "Invalid month format — use YYYY-MM", code: "INVALID_MONTH" });
    }
    const rooms = await Room.find({
      ...(branch ? { branch } : {}),
      isArchived: false,
    }).select("_id branch").lean();
    const roomIds = rooms.map((room) => room._id);

    const reservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch type capacity currentOccupancy price monthlyPrice")
      .sort({ moveInDate: 1 });

    const reservationCycles = reservations.map((reservation) => {
      try {
        return {
          reservation,
          cycle: resolveRentCycleForBillingMonth(reservation, month.format("YYYY-MM")),
          validationError: "",
        };
      } catch (error) {
        return {
          reservation,
          cycle: null,
          validationError: error.message || "Missing billing data",
        };
      }
    });
    const billFilters = reservationCycles
      .filter((entry) => entry.cycle)
      .map((entry) =>
        buildRentDuplicateFilter(entry.reservation._id, entry.cycle, month.format("YYYY-MM")),
      );
    const existingBills =
      billFilters.length > 0
        ? await Bill.find({ $or: billFilters })
            .select("_id reservationId status dueDate totalAmount pdfPath")
            .lean()
        : [];
    const existingByReservation = new Map(
      existingBills.map((bill) => [String(bill.reservationId), bill]),
    );
    const search = String(req.query.search || "").trim().toLowerCase();

    const tenants = reservationCycles
      .map(({ reservation, cycle, validationError }) =>
        formatActiveRentTenant(
          reservation,
          existingByReservation.get(String(reservation._id)),
          cycle,
          validationError,
        ),
      )
      .filter((tenant) => {
        if (!search) return true;
        return [tenant.tenantName, tenant.email, tenant.roomName, tenant.branch]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

    res.json({
      count: tenants.length,
      summary: summarizeRentTenantRows(tenants),
      tenants,
    });
  } catch (error) {
    next(error);
  }
};

export const getRentBillPreview = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      reservationId,
      billingMonth,
      dueDate,
      rentAmount,
      branch: requestedBranch,
    } = req.body || {};
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const reservation = await loadRentReservationForAdmin({ reservationId, branch });
    const draft = await buildRentBillDraft({
      reservation,
      branch,
      billingMonth,
      dueDate,
      rentAmount,
      allowDuplicate: true,
    });

    res.json({
      success: true,
      preview: formatRentBillPreview({
        reservation,
        bill: draft.bill,
        duplicate: draft.duplicate,
        cycle: draft.cycle,
      }),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateRentBill = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      reservationId,
      billingMonth,
      dueDate,
      rentAmount,
      branch: requestedBranch,
    } = req.body || {};

    if (!reservationId) {
      return res.status(400).json({ error: "No active tenant/contract found." });
    }

    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const reservation = await loadRentReservationForAdmin({ reservationId, branch });
    const draft = await buildRentBillDraft({
      reservation,
      branch,
      billingMonth,
      dueDate,
      rentAmount,
      notes: req.body.notes || "",
    });
    const { bill, delivery } = await finalizeRentBill({
      req,
      admin,
      reservation,
      draft,
    });

    const hasDeliveryFailure =
      delivery.email.status === "failed" || delivery.notification.status === "failed";
    const hasPdfFailure = delivery.pdf?.status === "failed";
    const warning = hasDeliveryFailure
      ? "Bill created, but email notification failed."
      : hasPdfFailure
        ? "Bill created, but PDF generation failed."
        : null;

    res.status(201).json({
      success: true,
      message: warning || "Rent bill generated successfully.",
      bill: formatBill(bill),
      delivery,
      warning,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        error: "Duplicate bill exists",
        code: error.code,
        bill: error.bill ? formatBill(error.bill) : null,
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateAllRentBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      billingMonth,
      month,
      dueDate,
      branch: requestedBranch,
    } = req.body || {};
    const targetMonth = billingMonth || month;
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    parseRequiredDate(targetMonth, "Billing month");

    const rooms = await Room.find({ branch, isArchived: false }).select("_id").lean();
    const reservations = await Reservation.find({
      roomId: { $in: rooms.map((room) => room._id) },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch type price monthlyPrice")
      .sort({ moveInDate: 1 });

    const summary = {
      totalTenants: reservations.length,
      alreadyBilled: 0,
      missingData: 0,
      readyToGenerate: 0,
      generated: 0,
      failed: 0,
    };
    const bills = [];
    const warnings = [];
    const errors = [];

    for (const reservation of reservations) {
      const tenantName =
        [reservation.userId?.firstName, reservation.userId?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Tenant";

      try {
        const draft = await buildRentBillDraft({
          reservation,
          branch,
          billingMonth: targetMonth,
          dueDate,
          rentAmount: null,
          notes: "Generated through rent batch billing.",
        });
        summary.readyToGenerate += 1;

        const result = await finalizeRentBill({
          req,
          admin,
          reservation,
          draft,
        });
        summary.generated += 1;
        bills.push(formatBill(result.bill));

        if (result.delivery.email?.status === "failed") {
          warnings.push(`${tenantName}: email notification failed.`);
        }
        if (result.delivery.pdf?.status === "failed") {
          warnings.push(`${tenantName}: PDF generation failed.`);
        }
      } catch (error) {
        if (error.statusCode === 409) {
          summary.alreadyBilled += 1;
          continue;
        }
        if (["NO_ACTIVE_TENANT", "INVALID_RENT_AMOUNT", "INVALID_DUE_DATE"].includes(error.code)) {
          summary.missingData += 1;
          errors.push({ tenantName, error: error.message });
          continue;
        }

        summary.failed += 1;
        errors.push({ tenantName, error: error.message || "Failed to generate bill" });
      }
    }

    const warning = warnings.length > 0
      ? "Bill created, but email notification failed."
      : null;

    res.status(summary.generated > 0 ? 201 : 200).json({
      success: true,
      message:
        summary.generated > 0
          ? warning || "Bills generated and sent successfully."
          : "No rent bills generated.",
      summary,
      bills,
      warnings,
      errors,
      warning,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const sendRentBill = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = req.branchFilter || (admin.isOwner ? null : admin.branch);

    if (!branch && !admin.isOwner) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const bill = await loadRentBillForAdmin({
      billId: req.params.billId,
      branch,
    });
    const [tenant, room] = await Promise.all([
      User.findById(bill.userId).select("firstName lastName email"),
      bill.roomId
        ? Room.findById(bill.roomId).select("name roomNumber branch type")
        : null,
    ]);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const delivery = await deliverBillNotification({
      bill,
      tenant,
      room,
      billType: "rent",
    });

    bill.sentAt = new Date();
    bill.issuedAt = bill.issuedAt || bill.sentAt;
    await bill.save();

    await logBillingAudit(req, {
      admin,
      action: "Rent bill sent",
      details: `Sent rent bill ${formatBillReference(bill)}`,
      entityId: bill._id,
      branch: bill.branch,
      metadata: {
        billId: String(bill._id),
        tenantId: String(bill.userId),
        emailStatus: delivery.email?.status,
        notificationStatus: delivery.notification?.status,
      },
    });

    await bill.populate("userId", "firstName lastName email username");
    await bill.populate("roomId", "name roomNumber branch type");
    await bill.populate("reservationId", "roomId roomName bedDetails");

    const warning =
      delivery.email?.status === "failed"
        ? "Bill created, but email failed."
        : null;

    res.json({
      success: true,
      message: warning || "Bill sent successfully.",
      bill: formatBill(bill),
      delivery,
      warning,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const downloadBillPdf = async (req, res, next) => {
  try {
    const { billId } = req.params;
    const requester = await User.findOne({ firebaseUid: req.user.uid })
      .select("_id role branch email firstName lastName")
      .lean();
    if (!requester) {
      return res.status(404).json({ error: "User not found" });
    }

    const bill = await Bill.findOne({ _id: billId, isArchived: false })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch")
      .populate("reservationId", "roomId roomName bedDetails selectedBed");

    if (!bill) return res.status(404).json({ error: "Bill not found" });

    const isAdmin = requester.role === "owner" || requester.role === "branch_admin";
    const isTenantOwner = String(bill.userId?._id || bill.userId) === String(requester._id);
    const canAccess =
      isTenantOwner ||
      (isAdmin && (requester.role === "owner" || requester.branch === bill.branch));

    if (!canAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    let absolutePdfPath = bill.pdfPath
      ? path.resolve(SERVER_ROOT, bill.pdfPath)
      : null;
    const safePdfRoot = path.resolve(BILL_PDF_ROOT);

    if (
      !absolutePdfPath ||
      !absolutePdfPath.startsWith(safePdfRoot) ||
      !fs.existsSync(absolutePdfPath)
    ) {
      const reservation = bill.reservationId
        ? await Reservation.findById(bill.reservationId._id || bill.reservationId)
            .populate("userId", "firstName lastName email")
            .populate("roomId", "name roomNumber branch type price monthlyPrice")
        : null;

      await generateRentBillPdf({
        bill,
        reservation: reservation || {
          userId: bill.userId,
          roomId: bill.roomId,
        },
      });
      absolutePdfPath = path.resolve(SERVER_ROOT, bill.pdfPath);
    }

    if (!absolutePdfPath.startsWith(safePdfRoot) || !fs.existsSync(absolutePdfPath)) {
      return res.status(404).json({ error: "PDF not found" });
    }

    if (isAdmin) {
      await logBillingAudit(req, {
        admin: requester,
        action: bill.pdfGeneratedAt ? "Bill PDF downloaded" : "Bill PDF generated",
        details: `Downloaded ${formatBillReference(bill)}`,
        entityId: bill._id,
        branch: bill.branch,
        metadata: {
          billId: String(bill._id),
          pdfPath: bill.pdfPath,
          tenantId: String(bill.userId?._id || bill.userId),
        },
      });
    }

    res.download(absolutePdfPath, `${formatBillReference(bill)}.pdf`);
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

    await ensureTenantCurrentRentBill(dbUser._id);

    const bills = await Bill.find({
      userId: dbUser._id,
      status: { $ne: "draft" },
      isArchived: false,
    })
      .populate("roomId", "name branch type")
      .sort({ billingCycleStart: -1, billingMonth: -1, createdAt: -1 })
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
          billReference: formatBillReference(b),
          billingMonth: b.billingMonth,
          billingCycleStart: b.billingCycleStart,
          billingCycleEnd: b.billingCycleEnd,
          dueDate: visible.dueDate,
          issuedAt: visible.issuedAt,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          utilityPeriodId: null,
          additionalCharges: b.additionalCharges || [],
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
          paymentFlow: buildBillPaymentFlow(b, visible),
          penaltyDetails: b.penaltyDetails || { daysLate: 0 },
          delivery: b.delivery || {},
          pdfPath: b.pdfPath || null,
          pdfAvailable: Boolean(b.pdfPath),
          pdfGeneratedAt: b.pdfGeneratedAt || null,
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
// TENANT: Legacy proof-upload compatibility endpoint
// ============================================================================

export const submitPaymentProof = async (req, res, next) => {
  try {
    const { billId } = req.params;

    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (String(bill.userId) !== String(dbUser._id))
      return res
        .status(403)
        .json({ error: "You can only submit proof for your own bills" });
    const visible = getVisibleBillSnapshot(bill);
    if (visible.status === "paid")
      return res.status(400).json({ error: "Bill is already paid" });
    if (bill.paymentProof?.verificationStatus === "pending-verification")
      return res.status(400).json({
        error: "Payment proof already submitted and pending verification",
      });
    return res.status(409).json({
      error:
        "Monthly bill proof uploads are no longer supported. Use online checkout from Billing or contact the branch for an assisted offline payment.",
      bill: {
        id: bill._id,
        paymentProof: bill.paymentProof || { verificationStatus: "none" },
        paymentFlow: buildBillPaymentFlow(bill, visible),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN: Verify legacy payment proof
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
    if (!admin.isOwner && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Access denied" });
    if (
      action === "approve" &&
      bill.paymentProof?.verificationStatus === "approved"
    ) {
      return res.json({
        success: true,
        message: "Payment proof already approved",
        bill,
      });
    }
    if (
      action === "reject" &&
      bill.paymentProof?.verificationStatus === "rejected"
    ) {
      return res.json({
        success: true,
        message: "Payment proof already rejected",
        bill,
      });
    }
    if (bill.paymentProof?.verificationStatus !== "pending-verification")
      return res
        .status(400)
        .json({ error: "No pending payment proof to verify" });

    if (action === "approve") {
      const approvedAmount = Number(
        bill.paymentProof.submittedAmount || bill.totalAmount || 0,
      );
      await applyBillPayment({
        bill,
        amount: approvedAmount,
        method: resolveProofPaymentMethod(bill),
        source: "tenant-proof",
        actorId: admin._id || null,
        notes: "Approved tenant payment proof",
        metadata: {
          action: "verifyPayment",
          verificationAction: "approve",
        },
        proofImageUrl: bill.paymentProof?.imageUrl || null,
        now: new Date(),
      });
      bill.paymentProof.verificationStatus = "approved";
      bill.paymentProof.verifiedBy = admin._id;
      bill.paymentProof.verifiedAt = new Date();
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
    if (isPaymentValidationError(error)) {
      return res.status(400).json({ error: error.message });
    }
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
    if (!admin.isOwner && admin.branch) filter.branch = admin.branch;

    const bills = await Bill.find(filter)
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch")
      .sort({ "paymentProof.submittedAt": -1 })
      .lean();

    res.json({
      count: bills.length,
      bills: bills.map((b) => {
        const visible = getVisibleBillSnapshot(b);
        return {
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
          totalAmount: visible.totalAmount,
          paymentProof: b.paymentProof,
          paymentFlow: buildBillPaymentFlow(b, visible),
        };
      }),
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
    const settings = await fetchPenaltySettings();
    const filter = {
      status: { $in: ["pending", "overdue", "partially-paid"] },
      dueDate: { $lt: now.toDate() },
      isArchived: false,
    };
    if (!admin.isOwner && admin.branch) filter.branch = admin.branch;

    const overdueBills = await Bill.find(filter);
    let updated = 0;

    for (const bill of overdueBills) {
      const { penalty, daysLate, ratePerDay } = await computePenalty(bill, settings, now);
      if (daysLate <= 0) continue;

      bill.charges.penalty = penalty;
      bill.penaltyDetails = { daysLate, ratePerDay, appliedAt: now.toDate() };
      syncBillAmounts(bill);
      bill.status = resolveBillStatus(bill, now.toDate());
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
    if (!admin.isOwner && admin.branch) filter.branch = admin.branch;

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
    if (!admin.isOwner && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Access denied" });

    // Guard: retain issued bills for audit/history. Only drafts are deletable.
    if (bill.status !== "draft")
      return res.status(400).json({
        error:
          "Only draft bills can be deleted. Issued bills (pending, partially-paid, overdue, paid) must be retained.",
      });

    // Guard: draft bill should not have any payment applied.
    if ((bill.paidAmount || 0) > 0)
      return res.status(400).json({
        error:
          "Cannot delete this draft bill because it already has payment activity.",
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
      admin.isOwner && req.body.branch ? req.body.branch : admin.branch;
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

      // Find moved-in tenants for this room
      const checkedInReservations = await Reservation.find({
        roomId: room._id,
        status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
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

        const moveInDate = readMoveInDate(reservation) || monthStart;
        const rent = suggestRent(reservation, room, moveInDate);
        const customCharges =
          getReservationRecurringFees(reservation).additionalCharges;
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
          const billingContext = tenant.reservationId
            ? await getReservationBillingContext(
                tenant.reservationId,
                null,
                monthStart,
              )
            : null;
          const cycleBillingMonth =
            billingContext?.cycle?.billingMonth || monthStart;

          // Skip if bill already exists for this tenant+month
          const dupeFilter = {
            userId: tenant.userId,
            billingMonth: cycleBillingMonth,
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
      admin.isOwner && req.query.branch ? req.query.branch : (req.branchFilter || admin.branch);
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
    if (!admin.isOwner && room.branch !== (req.branchFilter || admin.branch)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const readiness = await getRoomPublishState(room);
    if (readiness.draftBillCount === 0) {
      if (readiness.publishState === "issued" && readiness.issuedBillCount > 0) {
        return res.json({
          success: true,
          roomId: room._id,
          roomName: readiness.roomName,
          published: 0,
          deliveries: [],
          message: "Invoices for this cycle were already published.",
        });
      }
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
  getRentBills,
  getRentBillableTenants,
  getRentBillPreview,
  generateRentBill,
  generateAllRentBills,
  sendRentBill,
  downloadBillPdf,
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
