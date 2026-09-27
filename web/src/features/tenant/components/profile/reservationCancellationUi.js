import { hasReservationStatus } from "../../../../shared/utils/lifecycleNaming.js";

export const RESERVATION_FEE_NON_REFUNDABLE_NOTICE =
  "The reservation fee is non-refundable. If admin approves your cancellation request, the paid reservation fee will not be returned.";

export const MAX_CANCELLATION_REASON_LENGTH = 250;

export const PREDEFINED_CANCELLATION_REASONS = [
  "Personal / Family reasons",
  "Found alternative housing",
  "Schedule / Term changes",
  "Financial / Budget changes",
  "Distance / Location issue",
];

const CANCELLATION_REQUEST_STATUSES = new Set([
  "pending",
  "viewing_preference_selected",
  "visit_pending",
  "visit_approved",
  "pending_application_review",
  "needs_revision",
  "approved_for_payment",
  "payment_pending",
  "reserved",
]);

export const hasPaidReservationFee = (reservation = {}) => {
  const status = reservation?.reservationStatus || reservation?.status;
  return Boolean(
    reservation?.paymentStatus === "paid" ||
      reservation?.paymentDate ||
      reservation?.reservedAt ||
      hasReservationStatus(status, "reserved"),
  );
};

export const hasSettledAdvanceAndDeposit = (reservation = {}) => {
  if (!reservation) return false;
  const initialStatus = String(reservation.initialPaymentStatus || "").trim().toLowerCase();
  const paymentStatus = String(reservation.paymentStatus || "").trim().toLowerCase();
  return (
    ["paid", "paid_in_full", "settled", "completed"].includes(initialStatus) ||
    paymentStatus === "paid_in_full" ||
    Boolean(reservation.initialPaymentSettledAt) ||
    reservation.isMoveInSettled === true
  );
};

export const getReservationCancellationUiState = (reservation = null) => {
  if (!reservation) {
    return { visible: false, canRequest: false, isPending: false, isSettledLocked: false };
  }

  const status = reservation.reservationStatus || reservation.status;
  const isTerminal = hasReservationStatus(
    status,
    "cancelled",
    "rejected",
    "archived",
    "moveIn",
    "moveOut",
  );

  if (isTerminal) {
    return { visible: false, canRequest: false, isPending: false, isSettledLocked: false };
  }

  const isPending =
    reservation.cancellationRequested && reservation.cancellationStatus === "pending";

  if (isPending) {
    return { visible: true, canRequest: false, isPending: true, isSettledLocked: false };
  }

  if (hasSettledAdvanceAndDeposit(reservation)) {
    return {
      visible: true,
      canRequest: false,
      isPending: false,
      isSettledLocked: true,
    };
  }

  const statusKey = String(status || "").trim();
  const canRequest =
    hasPaidReservationFee(reservation) && CANCELLATION_REQUEST_STATUSES.has(statusKey);

  return {
    visible: canRequest,
    canRequest,
    isPending: false,
    isSettledLocked: false,
  };
};
