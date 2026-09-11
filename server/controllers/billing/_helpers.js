import { projectWaterPeriod } from '../../services/billing/waterProjection.js';
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { Bill, Payment, Reservation, Room, User, UtilityPeriod } from "../../models/index.js";

export const RoomBill = mongoose.models.RoomBill || mongoose.model("RoomBill", new mongoose.Schema({}, { strict: false }));
import logger from "../../middleware/logger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../../middleware/errorHandler.js";
import {
  sendBillGeneratedEmail,
  sendOverdueNoticeEmail,
  sendPaymentApprovedEmail,
  sendPaymentReminderEmail,
  sendPaymentRejectedEmail,
} from "../../config/email.js";
import { applyBillPayment } from "../../utils/paymentLedger.js";
import { formatDisplayReference } from "../../utils/referenceGenerator.js";
import { ensureCurrentCycleRentBill } from "../../utils/rentGenerator.js";
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
} from "../../utils/billingPolicy.js";
export {
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
};
import { computePenalty, fetchPenaltySettings } from "../../utils/penaltyCalculator.js";
import notify from "../../utils/notificationService.js";
import { sendDraftUtilityBills } from "../../utils/utilityBillFlow.js";
import { generateBillPdf, generateBillReceiptPdf } from "../../utils/pdfGenerator.js";
import { recordBillPdfGeneration } from "../../services/billPdfCache.js";
import {
  buildBillReceiptSourceVersion,
  isBillReceiptStale,
  recordBillReceiptGeneration,
  SETTLED_PAYMENT_STATUSES,
} from "../../services/billReceiptCache.js";
import { logBillingAudit } from "../../utils/billingAudit.js";
import { isWaterBillableRoom } from "../../utils/utilityFlowRules.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "../../utils/lifecycleNaming.js";

export { CURRENT_RESIDENT_STATUS_QUERY, readMoveInDate };
import { resolveAdminAccessContext } from "../../utils/adminAccess.js";
import { isOwnerRole, isAdminRole } from "../../config/roles.js";
import { usesStructuredInitialPayment } from "../../config/structuredInitialPayment.js";
import {
  buildRollingRentalPeriod,
  resolveVisibleStructuredRentPeriod,
} from "../../services/structuredInitialPaymentPolicy.js";
import { isPathInsideRoot } from "../../services/billingDocumentPath.js";

export const getAdminInfo = resolveAdminAccessContext;

export async function resolveAdminUserId(req, adminContext = null) {
  if (adminContext?._id) return adminContext._id;
  if (req.user?._id) return req.user._id;
  if (req.user?.id) return req.user.id;
  if (req.user?.uid || req.user?.email) {
    const user = await User.findOne({
      $or: [
        ...(req.user.uid ? [{ firebaseUid: req.user.uid }] : []),
        ...(req.user.email ? [{ email: req.user.email }] : []),
      ],
    }).select("_id").lean();
    if (user?._id) return user._id;
  }
  return null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SERVER_ROOT = path.join(__dirname, "..", "..");
export const BILL_PDF_ROOT = path.join(SERVER_ROOT, "uploads", "bills");

export function isPathInsideBillingPdfRoot(candidatePath) {
  return isPathInsideRoot(BILL_PDF_ROOT, candidatePath);
}

export function resolveManualPaymentMethod(note = "") {
  const normalized = String(note || "").trim().toLowerCase();

  if (normalized.includes("gcash")) return "gcash";
  if (normalized.includes("maya") || normalized.includes("paymaya")) return "paymaya";
  if (normalized.includes("grab")) return "grab_pay";
  if (normalized.includes("bank")) return "bank";
  if (normalized.includes("card") || normalized.includes("credit") || normalized.includes("debit")) {
    return "card";
  }
  if (normalized.includes("check") || normalized.includes("cheque")) return "check";

  return "paymongo";
}

export function resolveProofPaymentMethod(bill) {
  const existingMethod = String(bill?.paymentMethod || "").trim().toLowerCase();
  if (
    ["bank", "gcash", "card", "check", "paymongo", "paymaya", "grab_pay", "maya", "online"].includes(
      existingMethod,
    )
  ) {
    return existingMethod;
  }

  return "bank";
}

export function isPaymentValidationError(error) {
  return (
    error?.message === "Bill has no remaining balance." ||
    error?.message === "Payment amount must be greater than zero."
  );
}

export function buildBillPaymentFlow(bill, visibleSnapshot = null) {
  const visible = visibleSnapshot || getVisibleBillSnapshot(bill);
  const proofStatus = bill?.paymentProof?.verificationStatus || "none";

  let tenantMessage = "Use online checkout from the Billing page to pay this statement.";
  let adminMessage =
    "Prospective payments must be completed through PayMongo.";

  if (proofStatus === "pending-verification") {
    tenantMessage =
      "A previously submitted offline payment proof is awaiting staff review. New proof uploads are disabled; use online checkout for future payments.";
    adminMessage =
      "Review this proof only because it was submitted before online checkout became the standard monthly-billing flow.";
  } else if (proofStatus === "approved" || proofStatus === "rejected") {
    tenantMessage =
      "Offline payment proof uploads are no longer used for monthly bills. Use online checkout for future payments.";
    adminMessage =
      "This proof record is legacy billing history. New monthly payments must go through PayMongo checkout.";
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

/** Auto-mark overdue bills */
export async function markOverdueBills(bills) {
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

/**
 * Phase 5 — Published Bill Immutability Guard
 *
 * Throws an AppError (409 BILL_IMMUTABLE) if a caller attempts to silently
 * mutate the charge composition of a published bill.
 *
 * Pass `{ allowAdjustment: true }` only when the caller is explicitly creating
 * an audit-tracked adjustment (e.g. discount, manual correction).
 *
 * @param {Object} bill - Mongoose Bill document
 * @param {{ allowAdjustment?: boolean }} [options]
 * @throws {AppError} 409 BILL_IMMUTABLE
 */
export function assertBillMutable(bill, { allowAdjustment = false } = {}) {
  if (
    (bill.publicationState === "published" || bill.sentAt || bill.issuedAt) &&
    !allowAdjustment &&
    !bill.isManuallyAdjusted
  ) {
    throw new AppError(
      "Published bills cannot be silently mutated. Create an explicit adjustment record instead.",
      409,
      "BILL_IMMUTABLE",
    );
  }
}

/** Map a Bill document to API response shape */
export const formatBill = (bill) => {
  const visible = getVisibleBillSnapshot(bill);
  const roomId = bill.roomId?._id || bill.roomId || bill.reservationId?.roomId || null;
  const roomName =
    bill.roomId?.name ||
    bill.roomId?.roomNumber ||
    bill.reservationId?.roomName ||
    "N/A";
  return {
    id: bill._id,
    _id: bill._id,
    tenant: bill.userId
      ? {
          id: bill.userId._id,
          name: `${bill.userId.firstName || ""} ${bill.userId.lastName || ""}`.trim(),
          email: bill.userId.email,
        }
      : null,
    // Expose userId as a populated object for frontend consumers that use bill.userId directly
    userId: bill.userId || null,
    roomId: bill.roomId || null,
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
    waterAllocations: bill.waterAllocations || [],
    grossAmount: visible.grossAmount,
    reservationCreditApplied: bill.reservationCreditApplied || 0,
    structuredWorkflowVersion: bill.structuredWorkflowVersion || null,
    pricingSnapshotVersion: bill.pricingSnapshotVersion || null,
    initialPaymentBreakdown: bill.initialPaymentBreakdown || null,
    totalAmount: visible.totalAmount,
    paidAmount: bill.paidAmount || 0,
    remainingAmount: visible.remainingAmount,
    isFirstCycleBill: !!bill.isFirstCycleBill,
    // Preserve the original billType from MongoDB; only fall back to charge-based
    // resolution when the stored field is missing (e.g. legacy documents).
    billType: bill.billType || resolveRentBillType(bill),
    proRataDays: bill.proRataDays ?? null,
    // Transfer settlement snapshot — required for billing timeline events and PDF receipts.
    transferSnapshot: bill.transferSnapshot
      ? {
          fromRoomName: bill.transferSnapshot.fromRoomName || null,
          fromRoomType: bill.transferSnapshot.fromRoomType || null,
          fromRoomPrice: bill.transferSnapshot.fromRoomPrice ?? null,
          toRoomName: bill.transferSnapshot.toRoomName || null,
          toRoomType: bill.transferSnapshot.toRoomType || null,
          toRoomPrice: bill.transferSnapshot.toRoomPrice ?? null,
          effectiveTransferDate: bill.transferSnapshot.effectiveTransferDate || null,
          proRataRent: bill.transferSnapshot.proRataRent ?? null,
          proRataDays: bill.transferSnapshot.proRataDays ?? null,
          estimatedElectricityKwh: bill.transferSnapshot.estimatedElectricityKwh ?? null,
          estimatedElectricityCharge: bill.transferSnapshot.estimatedElectricityCharge ?? null,
          outstandingBalanceAtTransfer: bill.transferSnapshot.outstandingBalanceAtTransfer ?? null,
        }
      : null,
    status: visible.status,
    paymentMethod: bill.paymentMethod || null,
    paymentDate: bill.paymentDate || null,
    paymentReference: formatDisplayReference(bill.paymentReference || bill.paymongoPaymentId) || null,
    paymongoPaymentId: bill.paymongoPaymentId || null,
    penaltyDetails: bill.penaltyDetails || { daysLate: 0, ratePerDay: null, appliedAt: null },
    legacyPaymentFallbackLabel:
      visible.status === "paid" ? "Paid — legacy/no ledger record" : null,
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

export async function getReservationBillingContext(
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

  const structured = usesStructuredInitialPayment(reservation);
  const structuredPeriod = structured
    ? resolveVisibleStructuredRentPeriod(moveInDate, referenceDate)
    : null;
  const cycle = structuredPeriod
    ? {
        billingMonth: structuredPeriod.coverageStart,
        billingCycleStart: structuredPeriod.coverageStart,
        billingCycleEnd: structuredPeriod.coverageEndExclusive,
        dueDate: structuredPeriod.dueDate,
        generationDate: structuredPeriod.generationDate,
        cycleIndex: structuredPeriod.cycleIndex,
        structured: true,
      }
    : structured
      ? null
      : resolveCurrentRentBillingCycle(moveInDate, referenceDate);
  return {
    reservation,
    existingCount,
    cycle,
    isFirstCycleBill: existingCount === 0,
    creditAvailable: 0,
  };
}

export function sortReservationsByMoveIn(reservations = []) {
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

export async function getActiveReservationForUser(userId, { populateBilling = false } = {}) {
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

export async function ensureTenantCurrentRentBill(userId, referenceDate = new Date()) {
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

export async function getTenantBillForRequest(req, billId) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
  if (!dbUser) return { dbUser: null, bill: null };

  const bill = await Bill.findOne({
    _id: billId,
    userId: dbUser._id,
    isArchived: false,
  }).lean();

  return { dbUser, bill };
}

export async function findUtilityPeriodForBill({ bill, utilityType }) {
  if (!bill) return null;
  const roomId = bill.roomId?._id || bill.roomId;
  if (!roomId) return null;

  let period = null;
  const dispatchPeriodId = bill?.utilityDispatch?.[utilityType]?.periodId;
  if (dispatchPeriodId) {
    period = await UtilityPeriod.findById(dispatchPeriodId).lean();
    if (period) return period;
  }
  if (bill.utilityPeriodId) {
    period = await UtilityPeriod.findById(bill.utilityPeriodId).lean();
    if (period) return period;
  }

  period = await UtilityPeriod.findOne({
    roomId,
    utilityType,
    isArchived: false,
    "tenantSummaries.billId": bill._id,
  }).lean();

  if (period) return period;

  const cycleFilter = {
    roomId,
    utilityType,
    isArchived: false,
  };
  if (bill.utilityCycleStart) cycleFilter.startDate = bill.utilityCycleStart;
  if (bill.utilityCycleEnd) cycleFilter.endDate = bill.utilityCycleEnd;

  period = await UtilityPeriod.findOne(cycleFilter).lean();
  return period || null;
}

export async function buildTenantUtilityBreakdown({ dbUser, bill, utilityType }) {
  const chargeAmount = utilityType === "electricity"
    ? Number(bill?.charges?.electricity || 0)
    : Number(bill?.charges?.water || 0);
  if (!bill || chargeAmount <= 0) return null;

  if (utilityType === 'water' && bill.waterAllocations?.length) {
    const visible= bill.waterAllocations.filter(a=>a.state==='sent');
    const periods=await UtilityPeriod.find({_id:{$in:visible.map(a=>a.utilityPeriodId).filter(Boolean)}}).populate('roomId','name roomNumber').lean();
    const allocations=visible.map(a=>{
      const snapshot=periods.find(p=>String(p._id)===String(a.utilityPeriodId));
      return projectWaterPeriod(snapshot || {_id:a.utilityPeriodId,roomId:a.roomId,startDate:a.cycleStart,endDate:a.cycleEnd,computedTotalCost:a.amount},dbUser._id,a.amount,a.allocationId,a);
    });
    if (!allocations.length) return null;
    const tenantAmount=allocations.reduce((sum,a)=>sum+Number(a.tenantAmount || 0),0);
    if (allocations.length===1) return {...allocations[0],allocations,tenantAmount};
    return {calculationVersion:'water-multi-allocation-v1',unit:null,allocations,tenantAmount,
      openingReading:null,closingReading:null,consumption:null,ratePerCubicMeter:null,totalWaterAmount:null,tenantUsageShare:null,
      billingBasis:'Independent water allocations; see each period for physical readings and the saved price.',
      record:{cycleStart:bill.utilityCycleStart,cycleEnd:bill.utilityCycleEnd,readingFrom:null,readingTo:null,usage:null,ratePerUnit:null,roomTotal:null,myShare:tenantAmount}};
  }
  const period = await findUtilityPeriodForBill({ bill, utilityType });
  if (!period) return null;

  const tenantSummary =
    (period.tenantSummaries || []).find((summary) => String(summary.billId) === String(bill._id)) ||
    (period.tenantSummaries || []).find((summary) => String(summary.tenantId) === String(dbUser._id)) ||
    null;

  if (utilityType === "electricity") {
    let activeSegments = (period.segments || []).filter((segment) =>
      (segment.activeTenantIds || []).some((tenantId) => String(tenantId) === String(dbUser._id)),
    );
    if (activeSegments.length === 0 && (period.segments || []).length > 0) {
      activeSegments = period.segments;
    }

    return {
      period: {
        id: period._id,
        startDate: period.startDate,
        endDate: period.endDate,
      },
      ratePerKwh: period.ratePerUnit,
      totalRoomKwh: period.computedTotalUsage,
      totalRoomCost: period.computedTotalCost,
      myTotalKwh: tenantSummary?.totalUsage || 0,
      myBillAmount: tenantSummary?.billAmount || chargeAmount,
      segments: activeSegments.map((segment) => ({
        periodLabel: segment.periodLabel,
        startDate: segment.startDate,
        endDate: segment.endDate,
        readingFrom: segment.readingFrom,
        readingTo: segment.readingTo,
        segmentTotalKwh: segment.unitsConsumed,
        segmentTotalCost: segment.totalCost,
        activeTenantCount: segment.activeTenantCount,
        sharePerTenantKwh: segment.sharePerTenantUnits,
        sharePerTenantCost: segment.sharePerTenantCost,
      })),
    };
  }

  return projectWaterPeriod(period,dbUser._id,tenantSummary?.billAmount ?? chargeAmount);
}

export function hasDraftLinkedSummary(period, draftBillIds) {
  return (period?.tenantSummaries || []).some((summary) =>
    summary.billId && draftBillIds.has(String(summary.billId)),
  );
}

export function buildPublishResultFromPeriod(period) {
  if (!period) return null;
  return {
    computedTotalUsage: period.computedTotalUsage,
    computedTotalCost: period.computedTotalCost,
    ratePerUnit: period.ratePerUnit,
    segments: period.segments || [],
    tenantSummaries: period.tenantSummaries || [],
  };
}

export async function getRoomPublishState(room) {
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

/** Build paginated bill response */
export async function fetchBills(filter, query) {
  const { status, month, page = 1, limit = 20, search, roomId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  if (status && status !== "all") filter.status = status;
  if (month && month !== "all") {
    const d = dayjs(month);
    if (d.isValid()) {
      filter.billingMonth = {
        $gte: d.startOf("month").toDate(),
        $lt: d.add(1, "month").startOf("month").toDate(),
      };
    }
  }

  // When filtering by roomId, also pull in transfer_settlement bills whose
  // reservation was attached to that room (they carry the OLD roomId).
  if (roomId) {
    const { Reservation } = await import("../../models/index.js");
    const reservationIds = await Reservation
      .find({ roomId, isArchived: { $ne: true } })
      .select("_id")
      .lean()
      .then((docs) => docs.map((d) => d._id));

    filter.$or = [
      { roomId },
      { reservationId: { $in: reservationIds }, billType: "transfer_settlement" },
    ];
  }

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
export const r2 = (n) => Math.round(n * 100) / 100;

export const computeWaterShare = (roomType, totalWater, tenantCount) => {
  if (!totalWater || totalWater <= 0) return 0;
  switch (roomType) {
    case "quadruple-sharing":
      return 0;
    case "double-sharing":
      return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
    case "private":
      return r2(totalWater);
    default:
      return tenantCount > 0 ? r2(totalWater / tenantCount) : 0;
  }
};

export const suggestRent = (reservation, room, moveInDate) => {
  if (reservation.monthlyRent) return reservation.monthlyRent;
  if (reservation.totalPrice) return reservation.totalPrice;
  const months = dayjs().diff(dayjs(moveInDate), "month", true);
  const isLongTerm = months >= 6;
  return isLongTerm ? (room.monthlyPrice ?? room.price ?? 0) : (room.price ?? 0);
};

export function parseRequiredDate(value, label) {
  const parsed = dayjs(value);
  if (!value || !parsed.isValid()) {
    const error = new Error(`${label} is required`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.startOf("day");
}

export function createBillingError(message, statusCode = 400, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function getBillDaysOverdue(bill, referenceDate = new Date()) {
  const dueDate = bill?.dueDate ? dayjs(bill.dueDate) : null;
  if (!dueDate?.isValid()) return 0;
  const daysOverdue = dayjs(referenceDate)
    .startOf("day")
    .diff(dueDate.startOf("day"), "day");
  return daysOverdue > 0 ? daysOverdue : 0;
}

export function canSendBillReminder(bill) {
  const visible = getVisibleBillSnapshot(bill);
  return Boolean(
    visible?.dueDate &&
      ["pending", "partially-paid", "overdue"].includes(visible?.status),
  );
}

export function formatBillReference(bill = {}) {
  const id = String(bill?._id || bill?.id || "").slice(-6).toUpperCase();
  const month = bill?.billingMonth && dayjs(bill.billingMonth).isValid()
    ? dayjs(bill.billingMonth).format("YYYYMM")
    : dayjs().format("YYYYMM");
  const prefix = bill?.billType === "initial_payment" ? "LC-IP" : "LC-RB";
  return `${prefix}-${month}-${id || "DRAFT"}`;
}

export function resolveRentCycleForBillingMonth(reservation, billingMonth) {
  const moveInDate = readMoveInDate(reservation);
  if (!moveInDate) {
    throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
  }

  const selectedMonth = parseRequiredDate(billingMonth, "Billing month").startOf("month");
  const monthEnd = selectedMonth.endOf("month");
  const anchor = dayjs(moveInDate).startOf("day");

  if (usesStructuredInitialPayment(reservation)) {
    if (
      !reservation.advanceCoverageStart ||
      !reservation.advanceCoverageEndExclusive ||
      !reservation.nextRegularBillingDate
    ) {
      throw createBillingError(
        "Advance-rent coverage is not finalized.",
        409,
        "STRUCTURED_ADVANCE_COVERAGE_MISSING",
      );
    }
    let cycleIndex = Math.max(1, selectedMonth.diff(anchor, "month"));
    let period = buildRollingRentalPeriod(anchor.toDate(), cycleIndex);
    while (dayjs(period.coverageStart).isBefore(selectedMonth, "day")) {
      cycleIndex += 1;
      period = buildRollingRentalPeriod(anchor.toDate(), cycleIndex);
    }
    if (dayjs(period.coverageStart).isAfter(monthEnd, "day")) {
      throw createBillingError("No active tenant", 400, "NO_ACTIVE_TENANT");
    }
    return {
      billingMonth: period.coverageStart,
      billingCycleStart: period.coverageStart,
      billingCycleEnd: period.coverageEndExclusive,
      dueDate: period.dueDate || dayjs(period.coverageStart).toDate(),
      generationDate: period.generationDate || dayjs(period.coverageStart).subtract(14, "day").toDate(),
      cycleIndex,
      structured: true,
    };
  }

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

export function resolveRentDueDate(cycle, dueDate) {
  if (cycle.structured) {
    const requiredDueDate = dayjs(cycle.dueDate || dayjs(cycle.billingCycleStart)).startOf("day");
    if (dueDate && !parseRequiredDate(dueDate, "Due date").isSame(requiredDueDate, "day")) {
      throw createBillingError(
        "Structured rent is due on the 1st day of its rolling rental period.",
        400,
        "INVALID_STRUCTURED_DUE_DATE",
      );
    }
    return requiredDueDate.toDate();
  }
  const resolved = dueDate
    ? parseRequiredDate(dueDate, "Due date")
    : dayjs(cycle.dueDate || dayjs(cycle.billingCycleStart)).startOf("day");

  return resolved.toDate();
}

export function resolveRentAmountForBilling(reservation, room, cycle, rentAmount) {
  if (usesStructuredInitialPayment(reservation)) {
    const frozenRate = Number(reservation?.pricingSnapshot?.finalMonthlyRate);
    if (!Number.isFinite(frozenRate) || frozenRate <= 0) {
      throw createBillingError("Approved pricing snapshot is missing.", 409, "PRICING_SNAPSHOT_MISSING");
    }
    return roundMoney(frozenRate);
  }
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

export function buildRentDuplicateFilter(reservationId, cycle, billingMonth) {
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

export function getBedLabel(reservation = {}) {
  return (
    reservation?.selectedBed?.position ||
    reservation?.selectedBed?.id ||
    reservation?.bedDetails?.position ||
    reservation?.bedDetails?.id ||
    ""
  );
}

export function getRoomLabel(room = {}) {
  return room?.name || room?.roomNumber || "Room";
}

export async function loadRentReservationForAdmin({ reservationId, branch }) {
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

export async function loadRentBillForAdmin({ billId, branch }) {
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

export async function loadBillForAdmin({ billId, branch }) {
  if (!billId) {
    throw createBillingError("Bill not found", 404, "BILL_NOT_FOUND");
  }

  const bill = await Bill.findOne({
    _id: billId,
    isArchived: false,
  });

  if (!bill) {
    throw createBillingError("Bill not found", 404, "BILL_NOT_FOUND");
  }

  if (branch && bill.branch !== branch) {
    throw createBillingError("Access denied.", 403, "ACCESS_DENIED");
  }

  return bill;
}

export async function buildRentBillDraft({
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

  if (duplicate && (!allowDuplicate || usesStructuredInitialPayment(reservation))) {
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
  const structured = usesStructuredInitialPayment(reservation);
  const reservationCreditApplied = 0;

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
    structuredWorkflowVersion: structured
      ? reservation.financialWorkflowVersion
      : null,
    pricingSnapshotVersion: structured
      ? reservation.pricingSnapshotVersion
      : null,
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

export function formatRentBillPreview({ reservation, bill, duplicate = null, cycle }) {
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

export async function resolveInitialPaymentBreakdownFallback(bill, reservation, room) {
  if (bill?.billType !== "initial_payment") return null;
  const embedded = bill.initialPaymentBreakdown || {};
  const resObj = reservation || {};
  const snapshot = resObj.pricingSnapshot || {};
  const roomObj = room || resObj.roomId || bill.roomId || {};
  const roomPrice = Number(roomObj.monthlyPrice || roomObj.price || 0);

  const rawAdvance = Number(
    embedded.advanceRent ||
      snapshot.advanceRentAmount ||
      snapshot.finalMonthlyRate ||
      resObj.advanceRent ||
      resObj.monthlyRent ||
      roomPrice ||
      0,
  );

  const rawDeposit = Number(
    embedded.securityDeposit ||
      snapshot.securityDepositAmount ||
      snapshot.finalMonthlyRate ||
      resObj.securityDeposit ||
      resObj.monthlyRent ||
      roomPrice ||
      0,
  );

  const rawInitialCharges = Number(
    embedded.approvedInitialCharges ||
      snapshot.approvedInitialCharges ||
      0,
  );

  const rawCredit = Number(
    embedded.reservationFeeCredit ||
      bill.reservationCreditApplied ||
      snapshot.reservationFeeAmount ||
      resObj.reservationFeeAmount ||
      0,
  );

  const grossInitial = Number(
    embedded.grossInitialAmount ||
      bill.grossAmount ||
      (rawAdvance + rawDeposit + rawInitialCharges) ||
      0,
  );

  const initialTotal = Number(
    embedded.initialPaymentTotal ||
      bill.totalAmount ||
      Math.max(grossInitial - rawCredit, 0) ||
      0,
  );

  return {
    advanceRent: rawAdvance,
    securityDeposit: rawDeposit,
    approvedInitialCharges: rawInitialCharges,
    reservationFeeCredit: rawCredit,
    grossInitialAmount: grossInitial,
    initialPaymentTotal: initialTotal,
  };
}

export async function generateRentBillPdf({ bill, reservation }) {
  const room = reservation?.roomId || bill.roomId;
  const tenant = reservation?.userId || bill.userId;
  const isInitial = bill.billType === "initial_payment";
  const initialBreakdown = isInitial
    ? await resolveInitialPaymentBreakdownFallback(bill, reservation, room)
    : null;

  const visible = getVisibleBillSnapshot({
    ...(bill.toObject ? bill.toObject() : bill),
    initialPaymentBreakdown: initialBreakdown || bill.initialPaymentBreakdown,
  });

  const billPayload = {
    ...(bill.toObject ? bill.toObject() : bill),
    billReference: formatBillReference(bill),
    charges: visible.charges,
    totalAmount: visible.totalAmount,
    grossAmount: visible.grossAmount,
    remainingAmount: visible.remainingAmount,
    dueDate: visible.dueDate,
    issuedAt: visible.issuedAt,
    initialPaymentBreakdown: initialBreakdown || bill.initialPaymentBreakdown || null,
  };
  const electricityBreakdown = Number(billPayload.charges?.electricity || 0) > 0
    ? await buildTenantUtilityBreakdown({ dbUser: { _id: bill.userId?._id || bill.userId }, bill, utilityType: "electricity" })
    : null;
  const pdfPath = await generateBillPdf({
    bill: billPayload,
    billingResult: null,
    electricityBreakdown,
    waterBreakdown: Number(billPayload.charges?.water || 0) > 0
      ? await buildTenantUtilityBreakdown({dbUser:{_id:bill.userId?._id || bill.userId},bill,utilityType:'water'}) : null,
    period: {
      startDate: bill.billingCycleStart || bill.billingMonth,
      endDate: bill.billingCycleEnd || bill.dueDate,
      branch: bill.branch,
    },
    room,
    tenant,
  });

  await recordBillPdfGeneration(bill, pdfPath);
  return pdfPath;
}

export async function loadSettledBillPayments(bill) {
  return Payment.find({
    billId: bill._id,
    tenantId: bill.userId?._id || bill.userId,
    status: { $in: SETTLED_PAYMENT_STATUSES },
  }).sort({ settlementTimestamp: 1, processedAt: 1, createdAt: 1 }).lean();
}

/** Generate/reuse one canonical receipt projection for mobile and web. */
export async function generateCanonicalBillReceiptPdf({ bill, tenant, room = null }) {
  const payments = await loadSettledBillPayments(bill);
  const sourceVersion = buildBillReceiptSourceVersion(bill, payments);
  let absolutePath = bill.receiptPath ? path.resolve(SERVER_ROOT, bill.receiptPath) : null;
  if (
    !absolutePath
    || !isPathInsideBillingPdfRoot(absolutePath)
    || !fs.existsSync(absolutePath)
    || isBillReceiptStale(bill, sourceVersion)
  ) {
    const isInitial = bill.billType === "initial_payment";
    const initialBreakdown = isInitial
      ? await resolveInitialPaymentBreakdownFallback(bill, bill.reservationId, room)
      : null;

    const visible = getVisibleBillSnapshot({
      ...(bill.toObject ? bill.toObject() : bill),
      initialPaymentBreakdown: initialBreakdown || bill.initialPaymentBreakdown,
    });

    const receiptPath = await generateBillReceiptPdf({
      bill: {
        ...(bill.toObject ? bill.toObject() : bill),
        initialPaymentBreakdown: initialBreakdown || bill.initialPaymentBreakdown || null,
      },
      tenant,
      room,
      billReference: formatBillReference(bill),
      payments,
      legacyPayment: payments.length === 0 ? {
        amount: Number(bill.paidAmount || visible.totalAmount || initialBreakdown?.initialPaymentTotal || 0),
        method: bill.paymentMethod || null,
        settledAt: bill.paymentDate || null,
        reference: formatDisplayReference(bill.paymentReference || bill.paymongoPaymentId) || null,
      } : null,
      remainingAmount: visible.remainingAmount,
    });
    await recordBillReceiptGeneration(bill, receiptPath, sourceVersion);
    absolutePath = path.resolve(SERVER_ROOT, receiptPath);
  }

  return { absolutePath, payments, sourceVersion };
}

export async function finalizeRentBill({
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

export function summarizeRentTenantRows(tenants = []) {
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

export function resolveRentBillType(bill = {}) {
  if (bill.billType === "initial_payment") return "initial_payment";
  const charges = bill.charges || {};
  if (Number(charges.rent || 0) > 0) return "rent";
  if (Number(charges.water || 0) > 0 && Number(charges.electricity || 0) > 0) {
    return "utilities";
  }
  if (Number(charges.water || 0) > 0) return "water";
  if (Number(charges.electricity || 0) > 0) return "electricity";
  return "bill";
}

export function formatBillTypeLabel(bill = {}) {
  const billType = resolveRentBillType(bill);
  if (billType === "initial_payment") return "Initial Payment";
  if (billType === "rent") return "Rent";
  if (billType === "water") return "Water";
  if (billType === "electricity") return "Electricity";
  if (billType === "utilities") return "Utilities";
  return "Bill";
}

export function buildPenaltyNoticeReason(bill = {}) {
  const penaltyAmount = Number(bill?.charges?.penalty || 0);
  if (penaltyAmount <= 0) return "";

  const daysLate = Number(bill?.penaltyDetails?.daysLate || 0);
  const ratePerDay = Number(bill?.penaltyDetails?.ratePerDay || 0);

  if (daysLate > 0 && ratePerDay > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} at PHP ${ratePerDay.toFixed(2)} per day.`;
  }
  if (daysLate > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} overdue.`;
  }
  return "Late payment penalty applied to the bill.";
}

export async function deliverBillNotification({ bill, tenant, room, billType = null }) {
  const visible = getVisibleBillSnapshot(bill);
  const tenantName =
    [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() ||
    "Tenant";
  const billingMonthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");
  const dueDateLabel = visible.dueDate
    ? dayjs(visible.dueDate).format("MMMM D, YYYY")
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
      totalAmount: visible.totalAmount,
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
      visible.totalAmount,
      dueDateLabel,
      {
        billType: billType || resolveRentBillType(bill),
        billId: bill._id,
        actionUrl: "/billing",
        eventId: `invoice:${Number(bill.invoiceVersion || 1)}`,
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

export async function deliverBillReminder({ bill, tenant, room, noticeType = "reminder" }) {
  const visible = getVisibleBillSnapshot(bill);
  const reminderAmount = Number(
    visible?.remainingAmount ?? visible?.totalAmount ?? bill.totalAmount ?? 0,
  );
  const penaltyAmount = Number(visible?.charges?.penalty || 0);
  const billTypeLabel = formatBillTypeLabel(bill);
  const tenantName =
    [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() ||
    "Tenant";
  const billingMonthLabel = dayjs(bill.billingMonth).format("MMMM YYYY");
  const dueDateLabel = bill.dueDate
    ? dayjs(bill.dueDate).format("MMMM D, YYYY")
    : "the due date";
  const daysOverdue = getBillDaysOverdue(bill);
  const penaltyReason = buildPenaltyNoticeReason(bill);
  const resolvedNoticeType =
    noticeType === "penalty" ? "penalty" : daysOverdue > 0 ? "overdue" : "reminder";
  const delivery = {
    email: { status: "not_attempted", sentAt: null, error: "" },
    notification: { status: "not_attempted", sentAt: null, error: "" },
    daysOverdue,
    noticeType: resolvedNoticeType,
    penaltyAmount,
  };

  if (tenant?.email) {
    const emailResult =
      resolvedNoticeType === "reminder"
        ? await sendPaymentReminderEmail({
            to: tenant.email,
            tenantName,
            billingMonth: billingMonthLabel,
            totalAmount: reminderAmount,
            dueDate: dueDateLabel,
            billType: billTypeLabel,
            branchName: room?.branch || bill.branch || "Lilycrest",
          })
        : await sendOverdueNoticeEmail({
            to: tenant.email,
            tenantName,
            billingMonth: billingMonthLabel,
            totalAmount: reminderAmount,
            daysLate: daysOverdue,
            penalty: penaltyAmount,
            dueDate: dueDateLabel,
            billType: billTypeLabel,
            reason: resolvedNoticeType === "penalty" ? penaltyReason : "",
            noticeVariant: resolvedNoticeType,
            branchName: room?.branch || bill.branch || "Lilycrest",
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
    const baseMessage = `Your ${billTypeLabel.toLowerCase()} bill for ${billingMonthLabel} has a remaining balance of PHP ${reminderAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Due date: ${dueDateLabel}.`;
    const overdueMessage =
      daysOverdue > 0
        ? ` Overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}.`
        : "";

    if (resolvedNoticeType === "penalty") {
      await notify.billingNotice(bill.userId, {
        notificationType: "penalty_applied",
        title: "Penalty Notice",
        message: `${baseMessage}${overdueMessage} Penalty amount: PHP ${penaltyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.${penaltyReason ? ` Reason: ${penaltyReason}` : ""}`,
        billId: bill._id,
        actionUrl: "/billing",
        pushType: "billing_penalty_notice",
      });
    } else if (resolvedNoticeType === "overdue") {
      await notify.billingNotice(bill.userId, {
        notificationType: "bill_due_reminder",
        title: "Overdue Bill Notice",
        message: `${baseMessage}${overdueMessage}`,
        billId: bill._id,
        actionUrl: "/billing",
        pushType: "billing_overdue_notice",
      });
    } else {
      await notify.billingNotice(bill.userId, {
        notificationType: "bill_due_reminder",
        title: "Payment Reminder",
        message: baseMessage,
        billId: bill._id,
        actionUrl: "/billing",
        pushType: "billing_due_notice",
      });
    }
    delivery.notification.status = "sent";
    delivery.notification.sentAt = new Date();
  } catch (error) {
    delivery.notification.status = "failed";
    delivery.notification.error = error.message || "Notification failed";
  }

  return delivery;
}

export function formatActiveRentTenant(
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
