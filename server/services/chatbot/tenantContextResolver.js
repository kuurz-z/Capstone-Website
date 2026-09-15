import mongoose from "mongoose";
import User from "../../models/User.js";
import Reservation from "../../models/Reservation.js";
import Bill from "../../models/Bill.js";
import Stay from "../../models/Stay.js";
import MaintenanceRequest from "../../models/MaintenanceRequest.js";
import ChatConversation from "../../models/ChatConversation.js";
import announcementAudience from "../../mobile/services/announcementAudience.service.js";
import {
  NON_DRAFT_BILL_FILTER,
  CURRENT_BILL_SORT,
  selectCurrentBillFromList,
} from "../billing/currentBillResolver.js";
import { toMobileBill } from "../mobileBillingBridge.js";
import { resolveTenantCanonicalContract } from "../tenantContractSelectionService.js";
import { toTenantContractView } from "../tenantContractViewService.js";

const {
  PRESENT_STAY_STATUSES,
  buildTenantContext: buildAnnouncementTenantContext,
  canTenantViewAnnouncement,
} = announcementAudience;

const CURRENT_RESERVATION_STATUSES = Object.freeze([
  "moveIn",
  "reserved",
  "move_in_overdue",
  "payment_pending",
  "approved_for_payment",
]);

function formatBranchName(rawBranch) {
  if (!rawBranch) return "Lilycrest Residence";
  if (rawBranch === "gil-puyat") return "Gil Puyat";
  if (rawBranch === "guadalupe") return "Guadalupe";
  return String(rawBranch)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function tenantName(user = {}) {
  return (
    `${user.firstName || ""} ${user.lastName || ""}`.trim()
    || user.name
    || user.fullName
    || "Tenant"
  );
}

function selectedBedLabel(reservation = {}) {
  const selectedBed = reservation?.selectedBed || {};
  return selectedBed.position || selectedBed.code || selectedBed.id || null;
}

function resolveRoom(stay, reservation) {
  const stayRoom = stay?.roomId && typeof stay.roomId === "object" ? stay.roomId : null;
  const reservationRoom = reservation?.roomId && typeof reservation.roomId === "object"
    ? reservation.roomId
    : null;
  return stayRoom || reservationRoom || null;
}

function toCurrentBillContext(bill) {
  if (!bill) return null;
  const mobileBill = toMobileBill(bill);
  const utilityDeadlines = mobileBill.utility_deadlines || {};
  return {
    billId: mobileBill.billing_id,
    month: bill.billingMonth || null,
    billingPeriod: mobileBill.billing_period,
    billType: bill.billType || "monthly",
    totalAmount: mobileBill.total,
    remainingAmount: mobileBill.remaining_amount,
    paidAmount: mobileBill.paid_amount,
    rentAmount: mobileBill.rent,
    electricityAmount: mobileBill.electricity,
    waterAmount: mobileBill.water,
    applianceAmount: Number(bill.charges?.applianceFees || 0),
    penaltyAmount: Number(bill.charges?.penalty || 0),
    discountAmount: Number(bill.charges?.discount || 0),
    penaltyDetails: bill.penaltyDetails || null,
    charges: bill.charges || {},
    status: mobileBill.status,
    statusLabel: mobileBill.status_label,
    dueDate: mobileBill.due_date,
    releasedAt: mobileBill.release_date,
    utilityReleased: Object.keys(utilityDeadlines).length > 0,
    utilityDeadlines,
    proRataDays: bill.proRataDays || null,
  };
}

function toContractContext(contract, now) {
  if (!contract) return null;
  const view = toTenantContractView(contract, now, {
    documentBasePath: "/api/m/contracts",
  });
  return {
    contractId: view.id,
    contractNumber: view.contractNumber || null,
    status: view.status,
    displayStatus: view.displayStatus,
    startDate: view.leaseStartDate,
    endDate: view.leaseEndDate,
    daysRemaining: view.daysRemaining,
    monthlyRate: view.approvedMonthlyRate,
    depositAmount: view.securityDepositAmount,
    roomNumber: view.roomNumber || null,
    bedPosition: view.bedLabel || null,
    roomType: view.roomType || null,
    tenantDocument: view.tenantDocument,
  };
}

function toMaintenanceContext(request) {
  return {
    ticketCode: request.ticketNumber || request.request_id || String(request._id),
    category: request.request_type || request.type || "Maintenance Issue",
    urgency: request.urgency || "normal",
    status: request.status || "pending",
    description: request.description?.slice(0, 150) || "",
    providerName: request.providerDetails?.tenantVisibleLabel || request.providerName || null,
    scheduledDate: request.schedule?.scheduledDate || request.scheduledDate || null,
    submittedDate: request.createdAt || null,
  };
}

function toInquiryContext(conversation) {
  return {
    conversationId: String(conversation._id),
    category: conversation.category,
    priority: conversation.priority,
    status: conversation.status,
    lastMessage: conversation.lastMessage || "",
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || null,
  };
}

function toAnnouncementContext(announcement) {
  return {
    announcementId: String(announcement._id || announcement.announcement_id || ""),
    title: announcement.title || announcement.subject || "Announcement",
    content: String(
      announcement.content || announcement.message || announcement.body || "",
    ).slice(0, 180),
    createdAt: announcement.createdAt || announcement.created_at || announcement.publishedAt || null,
  };
}

async function loadVisibleAnnouncements(db, audienceContext, now) {
  if (!db || !audienceContext?.authenticated) return [];
  const candidates = await db.collection("announcements")
    .find({ isArchived: { $ne: true } })
    .sort({ createdAt: -1, created_at: -1 })
    .limit(25)
    .toArray();
  return candidates
    .filter((announcement) => canTenantViewAnnouncement({
      announcement,
      tenantContext: audienceContext,
      now,
    }))
    .slice(0, 3)
    .map(toAnnouncementContext);
}

function buildNeutralContext(fallbackAuthUser = null) {
  const user = fallbackAuthUser || {};
  return {
    tenantName: tenantName(user),
    tenantEmail: user.email || null,
    branch: "Lilycrest Residence",
    branchRaw: null,
    branchSource: "unresolved",
    roomNumber: null,
    bedPosition: null,
    tenancy: {
      status: "unknown",
      isCurrentResident: false,
      occupancyStartedAt: null,
      scheduledMoveInDate: null,
    },
    currentBill: null,
    billingSummary: {
      totalOutstandingBalance: 0,
      unpaidStatementsCount: 0,
      hasPendingBalance: false,
      totalPenaltyDue: 0,
    },
    unpaidBills: [],
    activeUnpaidBill: null,
    recentBills: [],
    contract: null,
    activeMaintenance: [],
    inquiries: [],
    recentAnnouncements: [],
    hasActiveMaintenance: false,
    hasPendingBill: false,
  };
}

/**
 * Resolve the single tenant-state snapshot shared by Lily's web and mobile
 * consumers. Every business domain delegates to its canonical resolver:
 * occupancy-backed announcement audience, current-cycle billing, canonical
 * Contract selection/document view, and shared support conversations.
 */
export async function resolveTenantAIContext(
  userId,
  fallbackAuthUser = null,
  {
    db = mongoose.connection?.db || null,
    now = new Date(),
    domains = null,
  } = {},
) {
  if (!userId && !fallbackAuthUser) return null;

  // Once an authenticated user object exists it is the only identity
  // authority. `userId` is retained for internal callers that do not yet have
  // a hydrated auth user, but it can never override an authenticated tenant.
  const candidateId = fallbackAuthUser?._id || userId;
  const validObjectId = mongoose.Types.ObjectId.isValid(candidateId)
    ? new mongoose.Types.ObjectId(candidateId)
    : null;
  const identityClauses = [
    ...(validObjectId ? [{ _id: validObjectId }] : []),
    ...(fallbackAuthUser?.user_id ? [{ user_id: fallbackAuthUser.user_id }] : []),
    ...(fallbackAuthUser?.firebaseUid ? [{ firebaseUid: fallbackAuthUser.firebaseUid }] : []),
  ];

  const dbUser = identityClauses.length
    ? await User.findOne({ $or: identityClauses })
      .select("firstName lastName name fullName email user_id firebaseUid role tenantStatus branch phone")
      .lean()
      .catch(() => null)
    : null;
  const user = dbUser ? { ...fallbackAuthUser, ...dbUser } : fallbackAuthUser;
  const tenantIdValue = dbUser?._id || validObjectId || fallbackAuthUser?._id;
  if (!user || !mongoose.Types.ObjectId.isValid(tenantIdValue)) {
    return buildNeutralContext(user);
  }
  const tenantId = new mongoose.Types.ObjectId(tenantIdValue);
  const requestedDomains = domains == null
    ? new Set(["billing", "contract", "maintenance", "support", "announcements"])
    : new Set(Array.isArray(domains) ? domains : []);

  const audienceContextPromise = db
    ? buildAnnouncementTenantContext(db, {
      tenant: { ...user, _id: tenantId },
      userId: user.user_id || fallbackAuthUser?.user_id || null,
      userMongoId: tenantId,
    })
    : Promise.resolve({
      authenticated: true,
      mongoId: tenantId,
      userId: user.user_id || null,
      branch: null,
      branchSource: "unresolved",
    });

  const [
    audienceContext,
    activeStay,
    currentReservation,
    canonicalContract,
    billingResolution,
    maintenanceRequests,
    conversations,
  ] = await Promise.all([
    audienceContextPromise,
    Stay.findOne({
      tenantId,
      status: { $in: PRESENT_STAY_STATUSES },
    })
      .sort({ leaseStartDate: -1, createdAt: -1 })
      .populate("roomId", "name roomNumber branch type")
      .lean()
      .catch(() => null),
    Reservation.findOne({
      userId: tenantId,
      isArchived: { $ne: true },
      status: { $in: CURRENT_RESERVATION_STATUSES },
    })
      .sort({ confirmedMoveInDate: -1, moveInDate: -1, createdAt: -1 })
      .populate("roomId", "name roomNumber branch type")
      .lean()
      .catch(() => null),
    requestedDomains.has("contract")
      ? resolveTenantCanonicalContract(tenantId, { includeEarlyStages: true }).catch(() => null)
      : Promise.resolve(null),
    requestedDomains.has("billing")
      ? Bill.find({
        $or: [{ userId: tenantId }, { tenantId: tenantId }],
        ...NON_DRAFT_BILL_FILTER,
      })
        .sort(CURRENT_BILL_SORT)
        .limit(10)
        .lean()
        .then((bills) => {
          const eligibleBills = (bills || []).filter(
            (b) => b && b.status !== "draft" && !b.isArchived,
          );
          return {
            currentBill: selectCurrentBillFromList(eligibleBills, now),
            bills: eligibleBills,
          };
        })
        .catch(() => ({ currentBill: null, bills: [] }))
      : Promise.resolve({ currentBill: null, bills: [] }),
    requestedDomains.has("maintenance")
      ? MaintenanceRequest.find({
        $or: [
          { userId: tenantId },
          { user_id: String(user.user_id || fallbackAuthUser?.user_id || "") },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .catch(() => [])
      : Promise.resolve([]),
    requestedDomains.has("support")
      ? ChatConversation.find({ tenantId })
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .limit(3)
        .lean()
        .catch(() => [])
      : Promise.resolve([]),
  ]);

  const hasMovedInReservation = currentReservation?.status === "moveIn";
  const hasActiveContract = Boolean(
    canonicalContract && ["active", "signed"].includes(canonicalContract.status)
  );
  const isExplicitTenant = user?.role === "tenant" || user?.tenantStatus === "active";
  const currentResident = Boolean(
    activeStay ||
    hasMovedInReservation ||
    hasActiveContract ||
    isExplicitTenant
  );

  const room = resolveRoom(activeStay, currentReservation);
  const branchRaw = audienceContext.branch
    || activeStay?.branch
    || currentReservation?.branch
    || currentReservation?.roomId?.branch
    || user?.branch
    || null;
  const scheduledMoveInDate = currentResident
    ? null
    : (
      currentReservation?.confirmedMoveInDate
      || currentReservation?.moveInDate
      || currentReservation?.targetMoveInDate
      || null
    );
  const tenancyStatus = currentResident
    ? "active"
    : (currentReservation?.status || "unknown");

  const bills = billingResolution?.bills || [];
  const currentBill = toCurrentBillContext(billingResolution?.currentBill);
  const totalOutstandingBalance = bills.reduce((sum, b) => {
    if (b.status === "voided" || b.status === "waived") return sum;
    return sum + (Number(b.remainingAmount !== undefined ? b.remainingAmount : b.totalAmount) || 0);
  }, 0);
  const unpaidBills = bills
    .filter((b) => b.status !== "voided" && b.status !== "waived" && Number(b.remainingAmount !== undefined ? b.remainingAmount : b.totalAmount) > 0)
    .map(toCurrentBillContext);
  const totalPenaltyDue = bills.reduce((sum, b) => {
    if (b.status === "voided" || b.status === "waived" || Number(b.remainingAmount || 0) <= 0) return sum;
    return sum + (Number(b.charges?.penalty) || 0);
  }, 0);
  const activeUnpaidBill = unpaidBills.find((b) => b.penaltyAmount > 0) || unpaidBills[0] || null;
  const recentBills = bills.slice(0, 5).map(toCurrentBillContext);
  const billingSummary = {
    totalOutstandingBalance,
    unpaidStatementsCount: unpaidBills.length,
    hasPendingBalance: totalOutstandingBalance > 0,
    totalPenaltyDue,
  };
  const hasPendingBill = Boolean(
    totalOutstandingBalance > 0
    || unpaidBills.length > 0
    || (currentBill && currentBill.remainingAmount > 0),
  );
  const contract = toContractContext(canonicalContract, now);
  const recentAnnouncements = requestedDomains.has("announcements")
    ? await loadVisibleAnnouncements(db, audienceContext, now).catch(() => [])
    : [];

  const isApplicant = !currentResident && (
    user?.role === "applicant" ||
    (Boolean(currentReservation) && currentReservation?.status !== "moveIn")
  );

  const reservationContext = currentReservation ? {
    reservationId: String(currentReservation._id),
    status: currentReservation.status,
    branch: formatBranchName(currentReservation.branch || currentReservation.roomId?.branch || branchRaw),
    roomNumber: currentReservation.roomId?.roomNumber || currentReservation.roomNumber || null,
    roomType: currentReservation.roomId?.type || currentReservation.roomType || null,
    bedPosition: selectedBedLabel(currentReservation),
    intendedMoveInDate: currentReservation.intendedMoveInDate || currentReservation.preferredMoveInDate || currentReservation.moveInDate || null,
    viewingDate: currentReservation.viewingDate || currentReservation.viewingSchedule?.date || null,
    viewingStatus: currentReservation.viewingStatus || (currentReservation.viewingDate ? "scheduled" : null),
    paymentStatus: currentReservation.paymentStatus || (currentReservation.depositPaid ? "paid" : "pending"),
    totalPrice: currentReservation.totalPrice || currentReservation.monthlyRate || null,
  } : null;

  return {
    tenantName: tenantName(user),
    tenantEmail: user.email || null,
    userRole: user.role || (currentResident ? "tenant" : "applicant"),
    isApplicant,
    branch: formatBranchName(branchRaw),
    branchRaw,
    branchSource: audienceContext.branchSource || "unresolved",
    roomNumber: room?.roomNumber || room?.name || currentReservation?.roomNumber || contract?.roomNumber || null,
    bedPosition: activeStay?.bedCode || activeStay?.bedId
      || selectedBedLabel(currentReservation)
      || contract?.bedPosition
      || null,
    tenancy: {
      status: tenancyStatus,
      isCurrentResident: currentResident,
      occupancyStartedAt: activeStay?.leaseStartDate
        || (hasMovedInReservation ? (currentReservation?.confirmedMoveInDate || currentReservation?.moveInDate || null) : null)
        || contract?.startDate
        || null,
      scheduledMoveInDate,
    },
    reservation: reservationContext,
    currentBill,
    billingSummary,
    unpaidBills,
    activeUnpaidBill,
    recentBills,
    contract,
    activeMaintenance: maintenanceRequests.map(toMaintenanceContext),
    inquiries: conversations.map(toInquiryContext),
    recentAnnouncements,
    hasActiveMaintenance: maintenanceRequests.length > 0,
    hasPendingBill,
  };
}

export { buildNeutralContext };
