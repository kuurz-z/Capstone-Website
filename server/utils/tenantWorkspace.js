import dayjs from "dayjs";
import { getVisibleBillSnapshot, roundMoney } from "./billingPolicy.js";
import {
  hasReservationStatus,
  readMoveInDate,
  readMoveOutDate,
} from "./lifecycleNaming.js";

export const LEASE_EXPIRING_SOON_DAYS = 30;

const NEXT_ACTION_LABELS = Object.freeze({
  verify_payment: "Verify payment",
  review_overdue_account: "Review overdue account",
  process_move_out: "Process move-out",
  renew_lease: "Renew lease",
  none: "No action needed",
});

const WARNING_SEVERITY = Object.freeze({
  info: "info",
  warning: "warning",
  error: "error",
});

export function computeLeaseEndDate(reservation) {
  const moveInDate = readMoveInDate(reservation);
  if (!moveInDate) return null;
  const leaseDuration = Number(reservation?.leaseDuration || 0);
  if (!Number.isFinite(leaseDuration) || leaseDuration <= 0) return null;

  const end = dayjs(moveInDate).add(leaseDuration, "month");
  return end.isValid() ? end.toDate() : null;
}

export function computeDaysUntil(dateLike, now = new Date()) {
  if (!dateLike) return null;
  const target = dayjs(dateLike).startOf("day");
  const anchor = dayjs(now).startOf("day");
  if (!target.isValid() || !anchor.isValid()) return null;
  return target.diff(anchor, "day");
}

export function buildBillingSummary(bills = [], now = new Date()) {
  const visibleBills = bills
    .filter((bill) => bill && bill.isArchived !== true && bill.status !== "draft")
    .map((bill) => ({
      bill,
      snapshot: getVisibleBillSnapshot(bill, now),
    }));

  const currentBalance = roundMoney(
    visibleBills.reduce(
      (sum, entry) => sum + Number(entry.snapshot?.remainingAmount || 0),
      0,
    ),
  );
  const hasOverdue = visibleBills.some(
    (entry) => entry.snapshot?.status === "overdue",
  );
  const hasOutstanding = currentBalance > 0;
  const hasPendingVerification = visibleBills.some(
    (entry) =>
      entry.bill?.paymentProof?.verificationStatus === "pending-verification",
  );

  let paymentStatus = "paid";
  if (hasOverdue) paymentStatus = "overdue";
  else if (hasOutstanding) paymentStatus = "partial";

  return {
    currentBalance,
    paymentStatus,
    hasOverdue,
    hasOutstanding,
    hasPendingVerification,
    visibleBills,
  };
}

export function buildStayStatus(reservation, now = new Date()) {
  const moveOutDate = readMoveOutDate(reservation);
  if (
    hasReservationStatus(reservation?.status, "moveOut") ||
    (moveOutDate && !dayjs(moveOutDate).isAfter(dayjs(now)))
  ) {
    return "moved_out";
  }

  if (moveOutDate && dayjs(moveOutDate).isAfter(dayjs(now))) {
    return "moving_out";
  }

  return "active";
}

export function normalizeTenantStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "moved_out") return "moved_out";
  if (normalized === "inactive") return "inactive";
  if (normalized === "active") return "active";
  return normalized || "applicant";
}

export function buildLeaseStatus(daysUntilLeaseEnd) {
  if (daysUntilLeaseEnd == null) return "active";
  if (daysUntilLeaseEnd <= 0) return "expired";
  if (daysUntilLeaseEnd <= LEASE_EXPIRING_SOON_DAYS) return "expiring_soon";
  return "active";
}

export function buildWarningFlags({
  leaseStatus,
  billingSummary,
  hasRoomHistory,
  moveOutDate,
}) {
  const flags = [];

  if (leaseStatus === "expired") {
    flags.push({
      code: "lease_expired",
      severity: WARNING_SEVERITY.error,
      message: "Lease has expired.",
    });
  } else if (leaseStatus === "expiring_soon") {
    flags.push({
      code: "lease_expiring_soon",
      severity: WARNING_SEVERITY.warning,
      message: "Lease is expiring soon.",
    });
  }

  if (billingSummary.hasOverdue) {
    flags.push({
      code: "overdue_balance",
      severity: WARNING_SEVERITY.error,
      message: "Tenant has overdue billing.",
    });
  } else if (billingSummary.hasOutstanding) {
    flags.push({
      code: "outstanding_balance",
      severity: WARNING_SEVERITY.warning,
      message: "Tenant has an outstanding balance.",
    });
  }

  if (billingSummary.hasPendingVerification) {
    flags.push({
      code: "pending_payment_verification",
      severity: WARNING_SEVERITY.warning,
      message: "Legacy offline payment proof is pending verification.",
    });
  }

  if (!hasRoomHistory) {
    flags.push({
      code: "room_history_incomplete",
      severity: WARNING_SEVERITY.warning,
      message: "Room history is incomplete for this stay.",
    });
  }

  if (moveOutDate) {
    flags.push({
      code: "billing_impact_warning",
      severity: WARNING_SEVERITY.info,
      message: "Room history affects billing calculations for this stay.",
    });
  }

  return flags;
}

export function buildNextAction({
  stayStatus,
  leaseStatus,
  billingSummary,
}) {
  if (billingSummary.hasPendingVerification) return "verify_payment";
  if (billingSummary.hasOverdue) return "review_overdue_account";
  if (stayStatus === "moving_out") return "process_move_out";
  if (stayStatus === "active" && leaseStatus !== "active") return "renew_lease";
  return "none";
}

export function buildAllowedActions({
  reservation,
  currentStay = null,
  stayStatus,
  billingSummary,
  tenantStatus = "",
  hasAvailableBedsInBranch = true,
  hasFutureRenewal = false,
}) {
  const isMovedInReservation = hasReservationStatus(reservation?.status, "moveIn");
  const normalizedTenantStatus = normalizeTenantStatus(tenantStatus);
  const hasActiveStay = currentStay ? currentStay.status === "active" : isMovedInReservation;
  const canManageStay =
    isMovedInReservation &&
    hasActiveStay &&
    stayStatus !== "moved_out" &&
    !["inactive", "moved_out"].includes(normalizedTenantStatus);

  const withReason = (enabled, reason = "", blockingCodes = [], extra = {}) => ({
    enabled,
    reason,
    blockingCodes,
    ...extra,
  });

  return {
    renew: !canManageStay
      ? withReason(false, "Only active moved-in stays can be renewed.", ["NO_ACTIVE_STAY"])
      : hasFutureRenewal
        ? withReason(false, "A future renewal already exists for this tenant.", ["FUTURE_RENEWAL_EXISTS"])
        : withReason(true),
    transfer: !canManageStay
      ? withReason(false, "Only active moved-in stays can be transferred.", ["NO_ACTIVE_STAY"], { hasAvailableBedsInBranch })
      : !hasAvailableBedsInBranch
        ? withReason(false, "No available same-branch bed is available for transfer.", ["NO_AVAILABLE_BED"], { hasAvailableBedsInBranch })
        : withReason(true, "", [], { hasAvailableBedsInBranch }),
    moveOut: !canManageStay
      ? withReason(false, "Only active moved-in stays can be moved out.", ["NO_ACTIVE_STAY"])
      : withReason(
          true,
          billingSummary.hasOutstanding || billingSummary.hasPendingVerification
            ? "Outstanding billing will remain for final settlement after move-out."
            : "",
          [],
        ),
  };
}

function buildRoomHistoryEntries({ reservation, bedHistoryRecords = [] }) {
  if (bedHistoryRecords.length > 0) {
    return bedHistoryRecords.map((record) => ({
      id: String(record._id),
      roomName: record.roomId?.name || reservation.roomId?.name || "Unknown room",
      branch: record.roomId?.branch || reservation.roomId?.branch || "",
      bedId: record.bedId || "",
      bedLabel: record.bedId || record.bedId === 0 ? String(record.bedId) : "",
      moveInDate: record.moveInDate || null,
      moveOutDate: record.moveOutDate || null,
      source: "history",
    }));
  }

  const moveInDate = readMoveInDate(reservation);
  if (!moveInDate) return [];

  return [
    {
      id: `fallback:${reservation?._id || reservation?.id || "stay"}`,
      roomName: reservation.roomId?.name || "Unknown room",
      branch: reservation.roomId?.branch || "",
      bedId: reservation.selectedBed?.id || "",
      bedLabel: reservation.selectedBed?.position || reservation.selectedBed?.id || "",
      moveInDate,
      moveOutDate: readMoveOutDate(reservation),
      source: "reservation_fallback",
    },
  ];
}

export function buildTenantWorkspaceEntry({
  reservation,
  currentStay = null,
  stayHistory = [],
  bills = [],
  bedHistoryRecords = [],
  tenantStatus = "",
  hasAvailableBedsInBranch = true,
  now = new Date(),
}) {
  const leaseEndDate = currentStay?.leaseEndDate || computeLeaseEndDate(reservation);
  const daysUntilLeaseEnd = computeDaysUntil(leaseEndDate, now);
  const billingSummary = buildBillingSummary(bills, now);
  const stayStatus =
    currentStay?.status === "completed" || currentStay?.status === "terminated"
      ? "moved_out"
      : buildStayStatus(reservation, now);
  const leaseStatus = buildLeaseStatus(daysUntilLeaseEnd);
  const roomHistory = buildRoomHistoryEntries({ reservation, bedHistoryRecords });
  const warningFlags = buildWarningFlags({
    leaseStatus,
    billingSummary,
    hasRoomHistory: bedHistoryRecords.length > 0,
    moveOutDate: readMoveOutDate(reservation),
  });
  const nextAction = buildNextAction({
    stayStatus,
    leaseStatus,
    billingSummary,
  });
  const hasFutureRenewal = stayHistory.some((stay) =>
    currentStay?._id &&
    String(stay.previousStayId || "") === String(currentStay._id) &&
    ["active", "ending_soon"].includes(String(stay.status || "")),
  );
  const allowedActions = buildAllowedActions({
    reservation,
    currentStay,
    stayStatus,
    billingSummary,
    tenantStatus,
    hasAvailableBedsInBranch,
    hasFutureRenewal,
  });

  const tenantUser = reservation.userId || {};
  const fullName =
    `${tenantUser.firstName || reservation.firstName || ""} ${tenantUser.lastName || reservation.lastName || ""}`.trim() ||
    tenantUser.email ||
    reservation.email ||
    "Unknown tenant";

  return {
    id: String(reservation._id || reservation.id),
    reservationId: String(reservation._id || reservation.id),
    tenantId: String(tenantUser._id || reservation.userId || ""),
    reservationCode: reservation.reservationCode || "",
    tenantName: fullName,
    contact: {
      email: tenantUser.email || reservation.email || "",
      phone: tenantUser.phone || reservation.mobileNumber || "",
    },
    branch: reservation.roomId?.branch || "",
    room: reservation.roomId?.name || reservation.roomId?.roomNumber || "",
    roomId: currentStay?.roomId ? String(currentStay.roomId) : reservation.roomId?._id ? String(reservation.roomId._id) : "",
    bed: reservation.selectedBed?.position || reservation.selectedBed?.id || "",
    bedId: currentStay?.bedId || reservation.selectedBed?.id || "",
    moveInDate: currentStay?.leaseStartDate || readMoveInDate(reservation),
    moveOutDate: readMoveOutDate(reservation),
    leaseEndDate,
    daysUntilLeaseEnd,
    currentBalance: billingSummary.currentBalance,
    currentStayId: currentStay?._id ? String(currentStay._id) : String(reservation.currentStayId || ""),
    tenantStatus: normalizeTenantStatus(tenantStatus),
    stayStatus,
    leaseStatus,
    paymentStatus: billingSummary.paymentStatus,
    nextAction,
    nextActionLabel: NEXT_ACTION_LABELS[nextAction] || NEXT_ACTION_LABELS.none,
    allowedActions,
    warningFlags,
    paymentFlags: {
      pendingVerification: billingSummary.hasPendingVerification,
      hasOutstandingBalance: billingSummary.hasOutstanding,
      hasOverdueBalance: billingSummary.hasOverdue,
    },
    basicInfo: {
      name: fullName,
      email: tenantUser.email || reservation.email || "",
      phone: tenantUser.phone || reservation.mobileNumber || "",
      branch: reservation.roomId?.branch || "",
      room: reservation.roomId?.name || reservation.roomId?.roomNumber || "",
      bed: reservation.selectedBed?.position || reservation.selectedBed?.id || "",
    },
    leaseInfo: {
      moveInDate: currentStay?.leaseStartDate || readMoveInDate(reservation),
      leaseEndDate,
      daysUntilLeaseEnd,
      extensionHistory:
        stayHistory.length > 0
          ? stayHistory.map((stay) => ({
              id: String(stay._id || stay.id),
              addedMonths: null,
              previousDuration: null,
              newDuration: null,
              extendedAt: stay.createdAt || null,
              notes: stay.renewalNotes || "",
              leaseStartDate: stay.leaseStartDate || null,
              leaseEndDate: stay.leaseEndDate || null,
              status: stay.status || "",
            }))
          : (reservation.leaseExtensions || []).map((entry, index) => ({
              id: `${reservation._id || reservation.id}:extension:${index}`,
              addedMonths: Number(entry.addedMonths || 0),
              previousDuration: Number(entry.previousDuration || 0),
              newDuration: Number(entry.newDuration || 0),
              extendedAt: entry.extendedAt || null,
              notes: entry.notes || "",
            })),
    },
    paymentInfo: {
      currentBalance: billingSummary.currentBalance,
      paymentStatus: billingSummary.paymentStatus,
      pendingVerification: billingSummary.hasPendingVerification,
      billCount: billingSummary.visibleBills.length,
    },
    roomHistory,
    systemWarnings: warningFlags,
  };
}

export function buildTenantWorkspaceStats(entries = []) {
  return {
    totalResidents: entries.length,
    activeTenants: entries.filter((entry) => entry.stayStatus === "active").length,
    expiringSoon: entries.filter((entry) => entry.leaseStatus === "expiring_soon").length,
    overduePayments: entries.filter((entry) => entry.paymentStatus === "overdue").length,
  };
}
