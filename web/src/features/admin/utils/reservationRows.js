import { BRANCH_DISPLAY_NAMES } from "../../../shared/utils/constants";
import {
  RESERVATION_STAGE_MAP,
  hasReservationStatus,
} from "../../../shared/utils/lifecycleNaming";

export const IN_PROGRESS_STATUSES = [
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
];

export { RESERVATION_STAGE_MAP };

export function getBranchLabel(branch) {
  return BRANCH_DISPLAY_NAMES[branch] || branch || "Unknown";
}

export function mapReservationAdminRow(reservation) {
  const branchCode = reservation.roomId?.branch || "";

  return {
    id: reservation._id,
    reservationCode: reservation.reservationCode || "-",
    customer:
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
      "Unknown",
    email: reservation.userId?.email || "-",
    phone: reservation.mobileNumber || reservation.phone || "-",
    room: reservation.roomId?.name || reservation.roomId?.roomNumber || "-",
    roomType: reservation.roomId?.type || "",
    branchCode,
    branch: getBranchLabel(branchCode),
    moveInDate: reservation.moveInDate,
    status: reservation.status || "pending",
    totalPrice: reservation.totalPrice,
    paymentStatus: reservation.paymentStatus,
    createdAt: reservation.createdAt,
    _raw: reservation,
  };
}

export function checkOverdueReservation(reservation, now = new Date()) {
  if (!hasReservationStatus(reservation.status, "pending", "payment_pending", "reserved")) {
    return false;
  }
  const moveIn = new Date(reservation.moveInDate);
  return !Number.isNaN(moveIn.getTime()) && moveIn < now;
}

export function mapVisitScheduleRows(rawReservations = []) {
  const rows = [];

  rawReservations
    .filter(
      (reservation) =>
        reservation.status === "visit_pending" ||
        (reservation.visitDate && reservation.visitApproved) ||
        reservation.scheduleRejected ||
        (reservation.visitHistory && reservation.visitHistory.length > 0),
    )
    .forEach((reservation) => {
      const baseReservation = mapReservationAdminRow(reservation);
      const base = {
        ...baseReservation,
        reservationId: reservation._id,
        phone: reservation.mobileNumber || reservation.userId?.phone || "-",
        viewingType: reservation.viewingType,
        isOutOfTown: reservation.isOutOfTown,
        currentLocation: reservation.currentLocation,
        billingEmail: reservation.billingEmail,
        visitHistory: reservation.visitHistory || [],
      };

      if (reservation.visitHistory && reservation.visitHistory.length > 0) {
        reservation.visitHistory.forEach((historyEntry, index) => {
          const actionedAt =
            historyEntry.approvedAt || historyEntry.rejectedAt || null;
          const actionedLabel =
            historyEntry.status === "approved"
              ? "Approved"
              : historyEntry.status === "rejected"
                ? "Rejected"
                : historyEntry.status === "cancelled"
                  ? "Cancelled"
                  : null;

          rows.push({
            ...base,
            id: `${reservation._id}-history-${index}`,
            visitDate: historyEntry.visitDate,
            visitTime: historyEntry.visitTime || "-",
            visitApproved: historyEntry.status === "approved",
            scheduleApproved: historyEntry.status === "approved",
            scheduleRejected: historyEntry.status === "rejected",
            scheduleRejectionReason: historyEntry.rejectionReason || "",
            scheduledDate:
              historyEntry.scheduledAt ||
              reservation.visitScheduledAt ||
              reservation.createdAt,
            actionedAt,
            actionedLabel,
            historyStatus: historyEntry.status,
            isHistorical: true,
            historyIndex: index,
            attemptNumber: historyEntry.attemptNumber || null,
          });
        });
      }

      if (
        reservation.visitDate &&
        !reservation.scheduleRejected &&
        !reservation.visitApproved &&
        reservation.status !== "cancelled"
      ) {
        rows.push({
          ...base,
          id: reservation._id,
          visitDate: reservation.visitDate,
          visitTime: reservation.visitTime || "-",
          visitApproved: reservation.visitApproved,
          scheduleApproved: reservation.scheduleApproved,
          scheduleRejected: false,
          scheduleRejectionReason: "",
          status: reservation.status,
          scheduledDate: reservation.visitScheduledAt || reservation.createdAt,
          actionedAt: null,
          actionedLabel: null,
          isHistorical: false,
          attemptNumber: (reservation.visitHistory?.length || 0) + 1,
        });
      }
    });

  rows.sort(
    (left, right) =>
      new Date(right.scheduledDate || 0) - new Date(left.scheduledDate || 0),
  );

  return rows;
}
