export const IN_PROGRESS_STATUSES = [
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
];

export const RESERVATION_STAGE_MAP = {
  pending: { step: 1, label: "Room Selected" },
  visit_pending: { step: 2, label: "Visit Scheduled" },
  visit_approved: { step: 3, label: "Filling Application" },
  payment_pending: { step: 4, label: "Payment Submitted" },
  reserved: { step: 5, label: "Confirmed" },
  moveIn: { step: 5, label: "Moved In" },
  moveOut: { step: 5, label: "Completed" },
  cancelled: { step: 0, label: "Cancelled" },
};

export function getBranchLabel(branch) {
  return branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe";
}

export function mapReservationAdminRow(reservation) {
  return {
    id: reservation._id,
    reservationCode: reservation.reservationCode || "-",
    customer:
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
      "Unknown",
    email: reservation.userId?.email || "-",
    room: reservation.roomId?.name || "-",
    roomType: reservation.roomId?.type || "",
    branch: getBranchLabel(reservation.roomId?.branch),
    moveInDate: reservation.moveInDate,
    status: reservation.status || "pending",
    totalPrice: reservation.totalPrice,
    paymentStatus: reservation.paymentStatus,
    createdAt: reservation.createdAt,
    _raw: reservation,
  };
}

export function checkOverdueReservation(reservation, now = new Date()) {
  if (!["pending", "reserved", "payment_pending"].includes(reservation.status)) {
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
