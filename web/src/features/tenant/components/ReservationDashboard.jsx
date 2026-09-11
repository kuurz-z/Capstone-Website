import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import BaseModal from "../../../shared/components/BaseModal";

import {
  Home,
  Calendar,
  FileText,
  CreditCard,
  CheckCircle,
  Clock,
  ArrowRight,
  AlertCircle,
  MapPin,
  RotateCcw,
} from "lucide-react";
import {
  canReservationAccessPayment,
  hasReservationStatus,
  isReservationMoveInReady,
  readMoveInDate,
} from "../../../shared/utils/lifecycleNaming";
import {
  getReservationFeeStatusLabel,
  getMoveInReadinessLabel,
  resolveDisplayMoveInDate,
} from "../utils/reservationReadiness";
import {
  getPhysicalVisitApplicantState,
  getReservationVisitStatus,
  getReservationViewingPreference,
  isPhysicalVisitPreference,
} from "../utils/physicalVisitFlow";
import { fmtShortDate, APP_LOCALE } from "../../../shared/utils/dateFormat";
import CheckoutLockBanner from "./CheckoutLockBanner";
import MoveInSettlementCard from "./profile/MoveInSettlementCard";
import { useReservationInactivity } from "../hooks/useReservationInactivity";
import ReservationInactivityModal from "./ReservationInactivityModal";

const getReservationStatus = (reservation) =>
  reservation?.reservationStatus || reservation?.status || "pending";

const getViewingPreferenceLabel = (reservation) => {
  const preference = getReservationViewingPreference(reservation);

  switch (preference) {
    case "physical_visit":
      return "Physical Visit";
    case "remote_2d_viewing":
      return "Remote Viewing";
    case "urgent_move_in_review":
      return "Priority Viewing Review";
    default:
      return "Viewing Preference";
  }
};

const hasViewingPreference = (reservation) =>
  Boolean(
    reservation?.viewingPreference ||
      reservation?.viewingType ||
      reservation?.visitDate ||
      reservation?.visitTime ||
      reservation?.remoteViewingAcknowledged ||
      reservation?.isUrgentMoveIn,
  );

const hasSubmittedApplication = (reservation) =>
  Boolean(
    reservation?.applicationSubmittedAt ||
      (reservation?.agreedToCertification &&
        reservation?.firstName &&
        reservation?.lastName) ||
      hasReservationStatus(
        getReservationStatus(reservation),
        "pending_application_review",
        "needs_revision",
        "approved_for_payment",
        "payment_pending",
        "reserved",
        "moveIn",
        "moveOut",
        "rejected",
      ),
  );

const STEPS = [
  {
    key: "room_selected",
    label: "Room Selection",
    desc: "Review and confirm your chosen room",
    icon: Home,
    stage: 1,
    category: "Getting Started",
  },
  {
    key: "viewing_preference",
    label: "Viewing Preference",
    desc: "Choose a physical visit, remote viewing, or priority review",
    icon: Calendar,
    stage: 2,
    category: "Getting Started",
  },
  {
    key: "application_review",
    label: "Application Review",
    desc: "Submit your application and documents for admin review",
    icon: FileText,
    stage: 3,
    category: "Verification",
  },
  {
    key: "payment_submitted",
    label: "Payment",
    desc: "Available after your application is approved",
    icon: CreditCard,
    stage: 4,
    category: "Finalization",
  },
  {
    key: "reserved",
    label: "Confirmation",
    desc: "Reservation secured and ready",
    icon: CheckCircle,
    stage: 5,
    category: "Finalization",
  },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function resolveCurrentStage(reservation) {
  if (!reservation) return 0;
  const status = getReservationStatus(reservation);
  const physicalVisitState = getPhysicalVisitApplicantState(reservation);

  if (hasReservationStatus(status, "reserved", "moveIn", "moveOut")) return 5;
  if (canReservationAccessPayment(status)) return 4;
  if (hasReservationStatus(status, "payment_pending")) return 4;
  if (hasSubmittedApplication(reservation)) return 3;
  if (physicalVisitState && !physicalVisitState.canFillApplication) return 2;
  if (
    hasViewingPreference(reservation) ||
    hasReservationStatus(
      status,
      "viewing_preference_selected",
      "visit_pending",
      "visit_approved",
    )
  ) {
    return 3;
  }

  // room confirmed — ready for visit scheduling
  if (reservation.roomConfirmed) return 2;

  // room selected (reservation exists but not yet reserved)
  return 1;
}

function getStepStatus(stepStage, currentStage, reservation) {
  const status = getReservationStatus(reservation);
  const physicalVisitState = getPhysicalVisitApplicantState(reservation);
  if (stepStage < currentStage) return "complete";
  if (stepStage === currentStage) {
    // Step 5 is the final step — if reservation is confirmed, mark as complete (green)
    if (
      stepStage === 5 &&
      reservation &&
      hasReservationStatus(status, "reserved", "moveIn", "moveOut")
    ) {
      return "complete";
    }
    if (stepStage === 3 && hasReservationStatus(status, "pending_application_review")) {
      return "waiting";
    }
    if (stepStage === 3 && hasReservationStatus(status, "needs_revision", "rejected")) {
      return "rejected";
    }
    if (stepStage === 4 && hasReservationStatus(status, "payment_pending")) {
      return "waiting";
    }
    if (stepStage === 2 && physicalVisitState && !physicalVisitState.canFillApplication) {
      return physicalVisitState.isRejected ? "rejected" : "waiting";
    }
    // Step 4: PayMongo is instant — never show "waiting"; payment is either
    // pending (user still needs to pay) or confirmed (reservation = reserved).
    return "current";
  }
  return "locked";
}

function getNextAction(reservation, currentStage) {
  const reservationFeeAmount = reservation?.reservationFeeAmount || 2000;
  if (!reservation) {
    return {
      title: "Start Your Reservation",
      description: "Browse rooms to begin your application",
      buttonLabel: "Browse Rooms",
      route: "/applicant/rooms",
      isWaiting: false,
    };
  }

  const status = getReservationStatus(reservation);
  const physicalVisitState = getPhysicalVisitApplicantState(reservation);

  if (hasReservationStatus(status, "reserved", "moveIn", "moveOut")) {
    const isSettled =
      isReservationMoveInReady(reservation) ||
      reservation.initialPaymentStatus === "paid" ||
      reservation.paymentStatus === "paid_in_full" ||
      Boolean(reservation.initialPaymentSettledAt) ||
      Boolean(reservation.initialPaymentPaidAt);

    if (isSettled) {
      const moveInDate = readMoveInDate(reservation);
      const moveInText = moveInDate
        ? ` Target move-in date: ${formatDate(moveInDate)}.`
        : "";
      return {
        title: "Move-In Ready — Fully Settled",
        description: `Advance rent and security deposit are fully settled.${moveInText} You can now review your official lease contract.`,
        buttonLabel: "Review Lease Contract",
        route: "/applicant/contracts",
        isWaiting: false,
      };
    }

    return {
      title: "Reservation Secured",
      description: "Your room slot is locked! Settle your Advance Rent and Security Deposit below to complete move-in requirements.",
      buttonLabel: null,
      route: null,
      isWaiting: false,
    };
  }

  if (hasReservationStatus(status, "rejected")) {
    return {
      title: "Application Rejected",
      description:
        reservation.applicationReviewReason ||
        "Your application was not approved. Payment remains locked.",
      buttonLabel: null,
      route: null,
      isWaiting: false,
      isRejected: true,
    };
  }

  if (hasReservationStatus(status, "needs_revision")) {
    return {
      title: "Application Needs Revision",
      description:
        reservation.applicationReviewReason ||
        "Please update your application or documents so admin can review them again.",
      buttonLabel: "Update Application",
      route: "/applicant/reservation?step=3",
      isWaiting: false,
      isRejected: true,
    };
  }

  if (hasReservationStatus(status, "pending_application_review")) {
    return {
      title: "Application Under Review",
      description:
        "Payment will be available once your application and documents are approved.",
      buttonLabel: null,
      route: null,
      isWaiting: true,
    };
  }

  if (hasReservationStatus(status, "payment_pending")) {
    return {
      title: "Payment In Progress",
      description:
        "Your checkout was started. We'll confirm the reservation once payment is completed.",
      buttonLabel: "Review Payment",
      route: "/applicant/reservation?step=4",
      isWaiting: true,
      isPayment: true,
    };
  }

  if (canReservationAccessPayment(status)) {
    return {
      title: "Pay Reservation Fee",
      description: `Pay PHP ${reservationFeeAmount.toLocaleString("en-PH")} online to secure your reservation.`,
      buttonLabel: "Pay Reservation Fee",
      route: "/applicant/reservation?step=4",
      isWaiting: false,
      isPayment: true,
    };
  }

  if (
    physicalVisitState &&
    !physicalVisitState.canFillApplication &&
    !hasSubmittedApplication(reservation)
  ) {
    return {
      title: physicalVisitState.title,
      description: physicalVisitState.message,
      buttonLabel: physicalVisitState.buttonLabel,
      route: physicalVisitState.route,
      isWaiting: physicalVisitState.isWaiting,
      isRejected: physicalVisitState.isRejected,
    };
  }

  switch (currentStage) {
    case 1:
      return {
        title: "Confirm Room & Continue",
        description: "Review your selected room and confirm your choice",
        buttonLabel: "Continue",
        route: `/applicant/reservation?step=1`,
        isWaiting: false,
      };
    case 2: {
      const viewPref = getReservationViewingPreference(reservation);
      const hasSchedule = reservation.visitDate || viewPref;
      if (physicalVisitState && !physicalVisitState.canFillApplication) {
        return {
          title: physicalVisitState.title,
          description: physicalVisitState.message,
          buttonLabel: physicalVisitState.buttonLabel,
          route: physicalVisitState.route,
          isWaiting: physicalVisitState.isWaiting,
          isRejected: physicalVisitState.isRejected,
        };
      }
      if (hasSchedule) {
        if (viewPref === "remote_2d_viewing") {
          return {
            title: "Remote Viewing Requested",
            description:
              "Your remote viewing request was saved. You may now complete your tenant application.",
            buttonLabel: "Fill Application",
            route: `/applicant/reservation?step=3`,
            isWaiting: false,
          };
        }
        if (viewPref === "urgent_move_in_review") {
          return {
            title: "Priority Review Requested",
            description:
              "Your priority viewing request has been saved. Proceed to complete your application.",
            buttonLabel: "Fill Application",
            route: `/applicant/reservation?step=3`,
            isWaiting: false,
          };
        }
        const fDate = reservation.visitDate
          ? fmtShortDate(reservation.visitDate)
          : "";
        return {
          title: "Physical Visit Complete",
          description: `Your visit${fDate ? ` on ${fDate}` : ""} is complete. You may now proceed with your tenant application.`,
          buttonLabel: "Fill Application",
          route: `/applicant/reservation?step=3`,
          isWaiting: false,
        };
      }
      return {
        title: "Choose Your Viewing Preference",
        description:
          "Select a physical visit, remote viewing, or priority review before submitting your application.",
        buttonLabel: "Continue",
        route: `/applicant/reservation?step=2`,
        isWaiting: false,
      };
    }
    case 3:
      return {
        title: "Complete Your Application",
        description: "Fill in personal details and upload required documents",
        buttonLabel: "Fill Application",
        route: `/applicant/reservation?step=3`,
        isWaiting: false,
      };
    case 4: {
      return {
        title: "Pay Reservation Fee",
        description: `Pay PHP ${reservationFeeAmount.toLocaleString("en-PH")} online via GCash, Maya, or Card to secure your reservation`,
        buttonLabel: "Pay Reservation Fee",
        route: `/applicant/reservation?step=4`,
        isWaiting: false,
        isPayment: true,
      };
    }
    default:
      return {
        title: "Reservation Complete",
        description: "All steps are done!",
        buttonLabel: null,
        route: null,
        isWaiting: false,
      };
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return fmtShortDate(dateStr);
  } catch {
    return "—";
  }
}

function getStepDesc(step, status, reservation) {
  if (!reservation || status === "locked") return step.desc;

  const room = reservation.roomId || {};
  const roomName = room.name || "Room";
  const reservationStatus = getReservationStatus(reservation);
  const viewingPreferenceLabel = getViewingPreferenceLabel(reservation);

  switch (step.stage) {
    case 1:
      if (
        status === "complete" ||
        status === "current" ||
        status === "waiting"
      ) {
        return `${roomName} selected`;
      }
      return step.desc;
    case 2: {
      const physicalVisitState = getPhysicalVisitApplicantState(reservation);
      if (status === "rejected") {
        return physicalVisitState?.title || "Physical visit needs rescheduling";
      }
      if (status === "waiting") {
        const vp = getReservationViewingPreference(reservation);
        if (vp === "remote_2d_viewing") return "Remote viewing requested";
        if (vp === "urgent_move_in_review") return "Priority review pending";
        if (physicalVisitState?.statusKey === "rescheduled") {
          return `Rescheduled to ${formatDate(reservation.visitDate)}`;
        }
        if (physicalVisitState?.statusKey === "no_show") {
          return "No-show recorded";
        }
        if (physicalVisitState?.statusKey === "visit_cancelled") {
          return "Visit schedule cancelled";
        }
        return reservation.visitDate
          ? `Physical visit on ${formatDate(reservation.visitDate)}`
          : "Viewing preference saved";
      }
      if (status === "complete") {
        return physicalVisitState?.title || viewingPreferenceLabel;
      }
      return step.desc;
    }
    case 3:
      if (status === "waiting") {
        return "Pending admin review";
      }
      if (status === "rejected") {
        return hasReservationStatus(reservationStatus, "rejected")
          ? "Application rejected"
          : "Revision requested";
      }
      if (status === "complete") {
        return hasReservationStatus(
          reservationStatus,
          "approved_for_payment",
          "payment_pending",
          "reserved",
          "moveIn",
          "moveOut",
        )
          ? "Approved for payment"
          : "Application submitted";
      }
      return step.desc;
    case 4:
      if (status === "waiting") {
        return "Payment processing";
      }
      if (status === "current") {
        return "Ready for payment";
      }
      if (status === "complete") {
        return getReservationFeeStatusLabel(reservation);
      }
      return step.desc;
    case 5:
      if (status === "complete") {
        // getMoveInReadinessLabel only claims "Move-in ready!" once the
        // server's authoritative reservation.moveInReadiness confirms every
        // backend blocker (Bill, documents, room/bed assignment, occupancy
        // conflicts) is clear — applicant-side completeness alone is not
        // enough. See reservationReadiness.js for the full contract.
        return getMoveInReadinessLabel(reservation);
      }
      return step.desc;
    default:
      return step.desc;
  }
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function ReservationDashboard({
  reservation,
  profileData,
  visits = [],
  feedback = null,
  onDismissFeedback,
  onGoToReservation,
}) {
  const navigate = useNavigate();
  const goToFlow = (to) => {
    if (reservation?._id) {
      sessionStorage.setItem("activeReservationId", reservation._id);
    }
    navigate(to, { state: { continueFlow: true, reservationId: reservation?._id } });
  };
  const queryClient = useQueryClient();
  const currentStage = resolveCurrentStage(reservation);
  const totalSegments = Math.max(STEPS.length - 1, 1);
  const progressSegments = Math.max(0, Math.min(totalSegments, currentStage - 1));
  const stepperProgressPercent = (progressSegments / totalSegments) * 100;
  const action = getNextAction(reservation, currentStage);
  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [showRequestCancelModal, setShowRequestCancelModal] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = React.useState(false);
  const [isWithdrawing, setIsWithdrawing] = React.useState(false);

  const isHoldMonitored =
    Boolean(reservation?._id) &&
    getReservationStatus(reservation) === "pending" &&
    !hasSubmittedApplication(reservation);

  const handleInactivityExpired = React.useCallback(async () => {
    // Defense-in-depth: only cancel/redirect if this specific reservation is strictly an unsubmitted draft
    const status = getReservationStatus(reservation);
    if (!reservation?._id || status !== "pending" || hasSubmittedApplication(reservation)) {
      return;
    }
    try {
      const { reservationApi } = await import("../../../shared/api/reservationApi");
      await reservationApi.updateByUser(reservation._id, {
        cancelReservation: true,
      });
    } catch (err) {
      console.warn("Auto-cancellation on inactivity expired failed:", err);
    }
    showNotification("Your room hold expired due to 30 minutes of inactivity.", "info", 5000);
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    navigate("/applicant/check-availability");
  }, [reservation, queryClient, navigate]);

  const {
    isWarningOpen: isInactivityWarningOpen,
    secondsRemaining: inactivitySecondsRemaining,
    isExtending: isExtendingInactivity,
    extendHold: extendInactivityHold,
    releaseNow: releaseInactivityNow,
  } = useReservationInactivity({
    reservationId: reservation?._id,
    updatedAt: reservation?.updatedAt,
    isActive: isHoldMonitored,
    onExpired: handleInactivityExpired,
  });

  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768
  );

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    if (!showCancelModal) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isCancelling) {
        setShowCancelModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCancelModal, isCancelling]);

  /* ── no reservation ──────────────────────────────────────────────────── */
  if (!reservation) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <Home size={32} color="#94A3B8" />
          </div>
          <h3 style={styles.emptyTitle}>No Active Reservation</h3>
          <p style={styles.emptyDescription}>
            You don't have a reservation yet. Start by browsing available rooms.
          </p>
          <button
            type="button"
            onClick={() => navigate("/applicant/check-availability")}
            style={styles.primaryButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-accent-hover, #B9921F)";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 3px 8px rgba(212, 175, 55, 0.28)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-accent, #D4AF37)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
          >
            Browse Rooms
            <ArrowRight
              size={16}
              style={{ marginLeft: 8, color: "inherit" }}
            />
          </button>
        </div>
      </div>
    );
  }

  /* ── reservation details ─────────────────────────────────────────────── */
  const room = reservation.roomId || {};
  const roomName = room.name || "Room";
  const branch = room.branch || "Lilycrest";
  const code = reservation.reservationCode || "—";
  const physicalVisitState = getPhysicalVisitApplicantState(reservation);
  const visitStatusKey = getReservationVisitStatus(reservation);
  const isConfirmed = hasReservationStatus(
    getReservationStatus(reservation),
    "reserved",
    "moveIn",
    "moveOut",
  );
  const isMoveInSettled =
    isReservationMoveInReady(reservation) ||
    reservation.initialPaymentStatus === "paid" ||
    reservation.paymentStatus === "paid_in_full" ||
    Boolean(reservation.initialPaymentSettledAt) ||
    Boolean(reservation.initialPaymentPaidAt);

  return (
    <div style={styles.card}>
      {/* ── Checkout Lock Banner ── */}
      {getReservationStatus(reservation) === "payment_pending" && (
        <CheckoutLockBanner
          roomId={roomName}
          bedId={reservation.bedId || "1"}
          expiresAt={reservation.paymentExpiresAt}
        />
      )}

      {/* ── Header — full width ──────────────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerRow}>
            <h3 style={styles.roomTitle}>{roomName}</h3>
            {isConfirmed ? (
              <span style={styles.confirmedBadge}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
                {isMoveInSettled ? "Ready for Move-In" : "Reserved"}
              </span>
            ) : (
              <span style={styles.pendingBadge}>
                <span
                  className="animate-pulse"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }}
                />
                In Progress
              </span>
            )}
          </div>
          <div style={styles.headerMeta}>
            <span style={styles.metaItem}>
              <MapPin size={13} style={{ marginRight: 4 }} />
              {branch}
            </span>

            {(() => {
              const { primaryDate, dateType } = resolveDisplayMoveInDate(
                reservation,
                readMoveInDate,
                formatDate,
              );
              if (!primaryDate) {
                return (
                  <>
                    <span style={styles.metaDot}>·</span>
                    <span style={styles.metaItem}>Move-in: To be scheduled</span>
                  </>
                );
              }
              const label = dateType === "confirmed" ? "Move-in" : "Preferred Move-in";
              return (
                <>
                  <span style={styles.metaDot}>·</span>
                  <span style={styles.metaItem}>{label}: {formatDate(primaryDate)}</span>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Viewing Preference Receipt ───────────────────────────────────── */}
      {feedback && (
        <div style={styles.receiptCard}>
          <div style={styles.receiptCardHeader}>
            <div style={styles.receiptCardHeaderLeft}>
              <span style={styles.receiptCardTitle}>Viewing Preference Saved</span>
              <span
                style={{
                  ...styles.receiptStatusPill,
                  ...(feedback.viewingPreference === "physical_visit"
                    ? styles.receiptPillPhysical
                    : feedback.viewingPreference === "urgent_move_in_review"
                      ? styles.receiptPillUrgent
                      : styles.receiptPillRemote),
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background:
                      feedback.viewingPreference === "physical_visit"
                        ? "#F59E0B"
                        : feedback.viewingPreference === "urgent_move_in_review"
                          ? "#D97706"
                          : "#3B82F6",
                  }}
                />
                {feedback.viewingPreference === "physical_visit"
                  ? "Physical Visit"
                  : feedback.viewingPreference === "urgent_move_in_review"
                    ? "Priority Review"
                    : "Remote Viewing"}
              </span>
            </div>
            {onDismissFeedback && (
              <button
                type="button"
                onClick={onDismissFeedback}
                style={styles.receiptDismissBtn}
              >
                ✕
              </button>
            )}
          </div>
          <div style={styles.receiptRows}>
            <div style={styles.receiptRow}>
              <span style={styles.receiptRowLabel}>Room</span>
              <span style={styles.receiptRowValue}>{roomName}</span>
            </div>
            <div style={styles.receiptRow}>
              <span style={styles.receiptRowLabel}>Branch</span>
              <span style={styles.receiptRowValue}>{branch}</span>
            </div>
            {feedback.viewingPreference === "physical_visit" ? (
              <>
                {feedback.visitDate && (
                  <div style={styles.receiptRow}>
                    <span style={styles.receiptRowLabel}>Preferred Date</span>
                    <span style={styles.receiptRowValue}>
                      {formatDate(feedback.visitDate)}
                    </span>
                  </div>
                )}
                {feedback.visitTime && (
                  <div style={styles.receiptRow}>
                    <span style={styles.receiptRowLabel}>Preferred Time</span>
                    <span style={styles.receiptRowValue}>{feedback.visitTime}</span>
                  </div>
                )}
                {feedback.visitCode && (
                  <div style={styles.receiptRow}>
                    <span style={styles.receiptRowLabel}>Visit Code</span>
                    <span
                      style={{ ...styles.receiptRowValue, ...styles.receiptCode }}
                    >
                      {feedback.visitCode}
                    </span>
                  </div>
                )}
              </>
            ) : feedback.viewingPreference === "urgent_move_in_review" ? (
              <div style={styles.receiptRow}>
                <span style={styles.receiptRowLabel}>Request Type</span>
                <span style={styles.receiptRowValue}>Priority Viewing Review</span>
              </div>
            ) : (
              <div style={styles.receiptRow}>
                <span style={styles.receiptRowLabel}>Viewing Type</span>
                <span style={styles.receiptRowValue}>Remote Viewing</span>
              </div>
            )}
            <div style={styles.receiptRow}>
              <span style={styles.receiptRowLabel}>Status</span>
              <span style={styles.receiptRowValue}>
                {feedback.viewingPreference === "physical_visit"
                  ? physicalVisitState?.title || "Physical Visit Scheduled"
                  : "Application Ready"}
              </span>
            </div>
          </div>
          <div style={styles.receiptNote}>
            {feedback.viewingPreference === "physical_visit"
              ? "Please attend your scheduled room visit first. You may continue to the tenant application after admin confirms your visit or allows you to proceed. Payment will remain locked until your application and documents are approved."
              : "Payment is locked until your application and documents are reviewed and approved by admin."}
          </div>
          <div style={styles.receiptActions}>
            {feedback.viewingPreference === "physical_visit" ? (
              <button
                type="button"
                onClick={() => goToFlow("/applicant/reservation?step=2")}
                style={styles.receiptPrimaryBtn}
              >
                Review Visit Schedule
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToFlow("/applicant/reservation?step=3")}
                style={styles.receiptPrimaryBtn}
              >
                Complete Application
              </button>
            )}
            <button
              type="button"
              onClick={() => goToFlow("/applicant/reservation?step=2&edit=1")}
              style={styles.receiptSecondaryBtn}
            >
              Change Viewing Preference
            </button>
          </div>
        </div>
      )}


      {/* ── Step Indicator ────────────────────────────────────────────────── */}
      <div
        style={{
          ...styles.stepperWrapper,
          ...(isMobile ? { width: "100%", margin: "0 0 16px", padding: "8px 0" } : {}),
        }}
      >
        <div
          style={{
            ...styles.stepperProgressRail,
            ...(isMobile
              ? {
                  top: 18,
                  left: "calc(10% + 2px)",
                  right: "calc(10% + 2px)",
                }
              : {}),
          }}
        >
          <div
            style={{
              ...styles.stepperTrackProgress,
              width: `${stepperProgressPercent}%`,
            }}
          />
        </div>
        <div
          style={{
            ...styles.stepperInner,
            ...(isMobile ? { padding: 0 } : {}),
          }}
        >
          {STEPS.map((step, i) => {
            const status = getStepStatus(step.stage, currentStage, reservation);
            const Icon = step.icon;
            const isFirst = i === 0;
            const isLast = i === STEPS.length - 1;
            return (
              <div
                key={step.key}
                style={{
                  ...styles.stepItem,
                  ...(isFirst && !isMobile ? styles.stepItemFirst : {}),
                  ...(isLast && !isMobile ? styles.stepItemLast : {}),
                  ...(isMobile
                    ? {
                        flex: "1 1 0%",
                        width: "20%",
                        maxWidth: "20%",
                        padding: "2px 1px",
                        gap: 4,
                        transform: "none",
                      }
                    : {}),
                  cursor:
                    status === "complete" ||
                    status === "current" ||
                    status === "waiting" ||
                    status === "rejected"
                      ? "pointer"
                      : "default",
                  borderRadius: 8,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  if (!isMobile && status !== "locked") {
                    e.currentTarget.style.transform = isFirst
                      ? "translateX(-18px) translateY(-2px)"
                      : isLast
                        ? "translateX(18px) translateY(-2px)"
                        : "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isMobile && status !== "locked") {
                    e.currentTarget.style.transform = isFirst
                      ? "translateX(-18px)"
                      : isLast
                        ? "translateX(18px)"
                        : "translateY(0)";
                  }
                }}
                onClick={() => {
                  if (
                    step.stage === 1 &&
                    (status === "complete" || status === "waiting")
                  ) {
                    goToFlow(`/applicant/reservation?step=${step.stage}`);
                    return;
                  }
                  if (status === "current" && action.route) {
                    goToFlow(action.route);
                  } else if (status === "complete" || status === "waiting") {
                    goToFlow(`/applicant/reservation?step=${step.stage}`);
                  }
                }}
                title={
                  status === "locked"
                    ? "Complete previous steps first"
                    : `Step ${step.stage}: ${step.label} — ${step.desc}`
                }
              >
                <div
                  style={{
                    ...styles.stepCircle,
                    ...(isMobile ? { width: 36, height: 36 } : {}),
                    ...(status === "complete"
                      ? styles.stepComplete
                      : status === "current"
                        ? styles.stepCurrent
                        : status === "waiting"
                          ? styles.stepWaiting
                          : status === "rejected"
                            ? styles.stepRejected
                            : styles.stepLocked),
                  }}
                >
                  {status === "complete" ? (
                    <CheckCircle size={isMobile ? 16 : 20} color="#fff" />
                  ) : status === "waiting" ? (
                    <Clock size={isMobile ? 16 : 20} color="#fff" />
                  ) : status === "rejected" ? (
                    <AlertCircle size={isMobile ? 16 : 20} color="#fff" />
                  ) : (
                    <Icon
                      size={isMobile ? 16 : 20}
                      color={status === "current" ? "#fff" : "#94A3B8"}
                    />
                  )}
                </div>
                <span
                  style={{
                    ...styles.stepLabel,
                    ...(isMobile
                      ? {
                          fontSize: 11,
                          lineHeight: 1.15,
                          width: "100%",
                          maxWidth: "100%",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }
                      : {}),
                    color:
                      status === "complete"
                        ? "#059669"
                        : status === "current"
                          ? "#B48208"
                          : status === "waiting"
                            ? "#2563EB"
                            : status === "rejected"
                              ? "#DC2626"
                              : "#94A3B8",
                    fontWeight:
                      status === "current" ||
                      status === "waiting" ||
                      status === "rejected"
                        ? 500
                        : 400,
                  }}
                >
                  {step.label}
                </span>
                <span
                  style={{
                    ...styles.stepDesc,
                    ...(isMobile
                      ? {
                          fontSize: 9.5,
                          lineHeight: 1.1,
                          width: "100%",
                          maxWidth: "100%",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          marginTop: 2,
                        }
                      : {}),
                    color:
                      status === "rejected"
                        ? "#DC2626"
                        : status === "locked"
                          ? "#94A3B8"
                          : "var(--text-secondary, #64748B)",
                  }}
                >
                  {getStepDesc(step, status, reservation)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Next Action Row ──────────────────────────────────────────────── */}
      {action.title && (!isConfirmed || Boolean(action.buttonLabel)) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "14px 18px",
            borderRadius: 10,
            background: "var(--surface-card, #FFFFFF)",
            border: "1px solid var(--border-card, #E2E8F0)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: action.isRejected
                  ? "#DC2626"
                  : action.isWaiting
                    ? "#2563EB"
                    : "#059669",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: action.isRejected
                    ? "#DC2626"
                    : action.isWaiting
                      ? "#1D4ED8"
                      : "var(--text-heading, #0F172A)",
                  marginRight: 8,
                  display: "inline-block",
                }}
              >
                {action.title}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: action.isRejected
                    ? "#991B1B"
                    : "var(--text-secondary, #64748B)",
                  lineHeight: 1.4,
                }}
              >
                {action.description}
              </span>
            </div>
          </div>
          {action.buttonLabel && action.route && (
            <button
              onClick={() => goToFlow(action.route)}
              style={{
                flexShrink: 0,
                padding: "8px 20px",
                background: action.isRejected
                  ? "#DC2626"
                  : action.isWaiting
                    ? "#2563EB"
                    : "#059669",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                if (action.isRejected) {
                  e.currentTarget.style.backgroundColor = "#B91C1C";
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(220, 38, 38, 0.3)";
                } else if (action.isWaiting) {
                  e.currentTarget.style.backgroundColor = "#1D4ED8";
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(37, 99, 235, 0.25)";
                } else {
                  e.currentTarget.style.backgroundColor = "#047857";
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(5, 150, 105, 0.25)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                if (action.isRejected) {
                  e.currentTarget.style.backgroundColor = "#DC2626";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                } else if (action.isWaiting) {
                  e.currentTarget.style.backgroundColor = "#2563EB";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                } else {
                  e.currentTarget.style.backgroundColor = "#059669";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                }
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
            >
              {action.buttonLabel.replace(/\s*(->|→)\s*$/, "")}
            </button>
          )}
        </div>
      )}

      {/* ── Post-Confirmation Dashboard ─────────────────────────────────── */}
      {isConfirmed && (
        <div style={styles.confirmedDashboard}>
          {/* Move-In Settlement Hub Card */}
          <MoveInSettlementCard
            reservation={reservation}
            profileData={profileData}
          />
        </div>
      )}

      {/* ── Footer — full width ───────────────────────────────────────────── */}
      {(reservation.reservationStatus || reservation.status) !== "cancelled" &&
        (reservation.reservationStatus || reservation.status) !== "moveIn" && (
          <div style={styles.footer}>
            <div style={styles.footerLeft}>
              {isConfirmed ? (
                <span style={{ fontSize: 12, color: "var(--text-secondary, #64748B)" }}>
                  Need to cancel or forfeit this slot?
                </span>
              ) : (
                currentStage <= 2 &&
                !reservation.viewingPreference &&
                !reservation.viewingType &&
                !reservation.visitApproved &&
                !reservation.scheduleApproved && (
                  <button
                    onClick={() =>
                      navigate(
                        `/applicant/check-availability?changeRoom=1&reservationId=${reservation._id}`,
                      )
                    }
                    style={styles.footerLinkSecondary}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--surface-muted, #F8FAFC)";
                      e.currentTarget.style.borderColor =
                        "var(--border-strong, #94A3B8)";
                      e.currentTarget.style.color =
                        "var(--text-heading, #0F172A)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 2px 4px rgba(0, 0, 0, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--surface-card, #FFFFFF)";
                      e.currentTarget.style.borderColor =
                        "var(--border-card, #CBD5E1)";
                      e.currentTarget.style.color =
                        "var(--text-secondary, #475569)";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 1px 2px rgba(0, 0, 0, 0.04)";
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = "scale(0.98)";
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                  >
                    <RotateCcw size={13} style={{ flexShrink: 0 }} />
                    Change Room
                  </button>
                )
              )}
            </div>
            {isConfirmed ? (
              reservation.cancellationRequested &&
              reservation.cancellationStatus === "pending" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onGoToReservation) {
                      onGoToReservation();
                    } else {
                      setShowWithdrawModal(true);
                    }
                  }}
                  style={{
                    ...styles.footerLinkDanger,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--surface-hover, #F8FAFC)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Withdraw Cancellation Request
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (onGoToReservation) {
                      onGoToReservation();
                    } else {
                      setShowRequestCancelModal(true);
                    }
                  }}
                  style={styles.footerLinkDanger}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-danger, #DC2626)";
                    e.currentTarget.style.borderColor = "var(--color-danger, #DC2626)";
                    e.currentTarget.style.color = "#FFFFFF";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 3px 8px rgba(220, 38, 38, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-danger-bg, rgba(220, 38, 38, 0.08))";
                    e.currentTarget.style.borderColor = "var(--color-danger, #DC2626)";
                    e.currentTarget.style.color = "var(--color-danger-text, #DC2626)";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Request Cancellation
                </button>
              )
            ) : (
              <button
                onClick={() => {
                  setShowCancelModal(true);
                }}
                style={styles.footerLinkDanger}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-danger, #DC2626)";
                  e.currentTarget.style.borderColor = "var(--color-danger, #DC2626)";
                  e.currentTarget.style.color = "#FFFFFF";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 3px 8px rgba(220, 38, 38, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-danger-bg, rgba(220, 38, 38, 0.08))";
                  e.currentTarget.style.borderColor = "var(--color-danger, #DC2626)";
                  e.currentTarget.style.color = "var(--color-danger-text, #DC2626)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Cancel reservation process
              </button>
            )}
          </div>
        )}

      {/* ── Cancel Confirmation Modal ─────────────────────────────────────── */}
      <BaseModal
        isOpen={showCancelModal}
        onClose={() => {
          if (!isCancelling) setShowCancelModal(false);
        }}
        title="Cancel Reservation Process?"
        subtitle={`Room: ${roomName}`}
        variant="danger"
        size="sm"
        cancelText="Keep process"
        confirmText={isCancelling ? "Cancelling Process..." : "Cancel Process"}
        loading={isCancelling}
        onConfirm={async () => {
          setIsCancelling(true);
          try {
            const { reservationApi } = await import(
              "../../../shared/api/reservationApi"
            );
            await reservationApi.updateByUser(reservation._id, {
              cancelReservation: true,
            });
            setShowCancelModal(false);
            showNotification(
              "Reservation process cancelled.",
              "success",
              3000,
            );
            queryClient.invalidateQueries({
              queryKey: ["reservations"],
            });
          } catch (err) {
            console.error("Cancel failed:", err);
            setIsCancelling(false);
            setShowCancelModal(false);
            showNotification(
              "Failed to cancel reservation process. Please try again.",
              "error",
              4000,
            );
          }
        }}
      >
        <p style={{ margin: 0, color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
          This will cancel your current room reservation process for <strong>{roomName}</strong> and release your selected room. You can select another room at any time.
        </p>
      </BaseModal>

      {/* ── Reservation Inactivity Warning Modal ── */}
      <ReservationInactivityModal
        isOpen={isInactivityWarningOpen}
        roomName={roomName}
        secondsRemaining={inactivitySecondsRemaining}
        isExtending={isExtendingInactivity}
        onExtend={extendInactivityHold}
        onRelease={releaseInactivityNow}
      />

      {/* ── Request Cancellation Modal (paid reservations) ───────────────── */}
      <BaseModal
        isOpen={showRequestCancelModal}
        onClose={() => {
          if (!isRequesting) {
            setShowRequestCancelModal(false);
            setCancelReason("");
          }
        }}
        title="Request Cancellation?"
        subtitle={`Room: ${roomName}`}
        variant="warning"
        size="sm"
        cancelText="Keep it"
        confirmText={isRequesting ? "Submitting..." : "Submit Request"}
        loading={isRequesting}
        onConfirm={async () => {
          setIsRequesting(true);
          try {
            const { reservationApi } = await import(
              "../../../shared/api/reservationApi"
            );
            await reservationApi.requestCancellation(reservation._id, cancelReason.trim());
            setShowRequestCancelModal(false);
            setCancelReason("");
            showNotification(
              "Cancellation request submitted. Pending admin review.",
              "success",
              4000,
            );
            queryClient.invalidateQueries({
              queryKey: ["reservations"],
            });
          } catch (err) {
            console.error("Cancellation request failed:", err);
            setIsRequesting(false);
            setShowRequestCancelModal(false);
            showNotification(
              "Failed to submit cancellation request. Please try again.",
              "error",
              4000,
            );
          }
        }}
      >
        <p style={{ margin: "0 0 12px", color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
          Your reservation fee for <strong>{roomName}</strong> is{" "}
          <strong>non-refundable</strong>. Submitting this request will
          place it under admin review. Your bed will only be released once an admin approves.
        </p>
        <div style={{ marginTop: 12 }}>
          <label
            htmlFor="tenant-cancellation-reason-input"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary, #1e293b)",
              marginBottom: 6,
            }}
          >
            Reason for Cancellation (Optional)
          </label>
          <textarea
            id="tenant-cancellation-reason-input"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Let us know why you are requesting cancellation..."
            rows={3}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border, #cbd5e1)",
              background: "var(--card-bg, #ffffff)",
              color: "var(--text-primary, #1e293b)",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
      </BaseModal>

      <BaseModal
        isOpen={showWithdrawModal}
        onClose={() => {
          if (!isWithdrawing) setShowWithdrawModal(false);
        }}
        title="Withdraw Cancellation Request?"
        subtitle={`Room: ${roomName}`}
        variant="info"
        size="sm"
        cancelText="Keep Pending"
        confirmText={isWithdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
        loading={isWithdrawing}
        onConfirm={async () => {
          setIsWithdrawing(true);
          try {
            const { reservationApi } = await import(
              "../../../shared/api/reservationApi"
            );
            await reservationApi.withdrawCancellationRequest(reservation._id);
            setShowWithdrawModal(false);
            showNotification(
              "Cancellation request withdrawn. Your reservation remains active.",
              "success",
              4000,
            );
            queryClient.invalidateQueries({
              queryKey: ["reservations"],
            });
          } catch (err) {
            console.error("Withdraw cancellation request failed:", err);
            setShowWithdrawModal(false);
            showNotification(
              "Failed to withdraw cancellation request. Please try again.",
              "error",
              4000,
            );
          } finally {
            setIsWithdrawing(false);
          }
        }}
      >
        <p style={{ margin: 0, color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
          Withdrawing will cancel your pending cancellation request. Your reservation for{" "}
          <strong>{roomName}</strong> and held bed will remain active and secure.
        </p>
      </BaseModal>
    </div>
  );
}

/* ── styles ──────────────────────────────────────────────────────────────── */

const styles = {
  card: {
    background: "var(--surface-card, #FFFFFF)",
    borderRadius: 16,
    border: "1px solid var(--border-card, #E2E8F0)",
    padding: "24px 28px",
    marginBottom: 0,
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },

  /* empty state */
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #E2E8F0)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-heading, #0F172A)",
    margin: "0 0 8px",
  },
  emptyDescription: {
    fontSize: 14,
    color: "var(--text-secondary, #64748B)",
    margin: "0 0 24px",
    lineHeight: 1.5,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 24px",
    background: "var(--color-accent, #D4AF37)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    transition: "background-color 0.2s ease, transform 0.15s ease, box-shadow 0.15s ease",
  },

  /* header */
  header: {
    marginBottom: 20,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  roomTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-heading, #0F172A)",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  confirmedBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: "#059669",
    background: "transparent",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  pendingBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: "#D97706",
    background: "transparent",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  headerMeta: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  metaItem: {
    fontSize: 13,
    color: "var(--text-secondary, #64748B)",
    display: "inline-flex",
    alignItems: "center",
  },
  metaDot: {
    fontSize: 13,
    color: "#CBD5E1",
    margin: "0 4px",
  },

  /* receipt card */
  receiptCard: {
    marginBottom: 18,
    padding: "16px 18px",
    borderRadius: 10,
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #E2E8F0)",
  },
  receiptCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  receiptCardHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  receiptCardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-heading, #0F172A)",
    letterSpacing: "-0.01em",
  },
  receiptStatusPill: {
    fontSize: 12,
    fontWeight: 600,
    padding: 0,
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  receiptPillPhysical: {
    color: "#D97706",
  },
  receiptPillRemote: {
    color: "#2563EB",
  },
  receiptPillUrgent: {
    color: "#4F46E5",
  },
  receiptPillSuccess: {
    color: "#059669",
  },
  receiptPillDanger: {
    color: "#DC2626",
  },
  receiptDismissBtn: {
    background: "transparent",
    border: "none",
    color: "#94A3B8",
    fontSize: 13,
    cursor: "pointer",
    padding: "2px 4px",
    lineHeight: 1,
  },
  receiptRows: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    marginBottom: 12,
  },
  receiptRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 13,
    padding: "6px 0",
    borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
  },
  receiptRowLabel: {
    color: "var(--text-secondary, #64748B)",
    fontWeight: 500,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  receiptRowValue: {
    color: "var(--text-heading, #0F172A)",
    fontWeight: 600,
    textAlign: "right",
  },
  receiptCode: {
    fontFamily: "monospace",
    fontSize: 12,
    letterSpacing: "0.05em",
  },
  receiptNote: {
    fontSize: 12,
    color: "var(--text-secondary, #64748B)",
    lineHeight: 1.5,
    marginBottom: 12,
    paddingTop: 2,
  },
  receiptSubnote: {
    fontSize: 12,
    color: "var(--text-body, #334155)",
    lineHeight: 1.5,
    marginBottom: 12,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #E2E8F0)",
  },
  receiptActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  receiptPrimaryBtn: {
    flex: 1,
    minWidth: 140,
    padding: "8px 16px",
    background: "#059669",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    transition: "all 0.15s ease",
  },
  receiptSecondaryBtn: {
    flex: 1,
    minWidth: 140,
    padding: "8px 16px",
    background: "var(--surface-card, #FFFFFF)",
    color: "var(--text-secondary, #475569)",
    border: "1px solid var(--border-card, #E2E8F0)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.15s ease",
  },

  /* category row */
  categoryRow: {
    display: "flex",
    justifyContent: "center",
    gap: 0,
    marginBottom: 8,
  },
  categoryGroup: {
    textAlign: "center",
  },
  categoryLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontWeight: 700,
    color: "#94A3B8",
    paddingBottom: 6,
    borderBottom: "1px solid #E2E8F0",
    display: "inline-block",
  },

  /* stepper */
  stepperWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "min(100%, 980px)",
    margin: "0 auto 20px",
    padding: "16px 0",
    gap: 0,
  },
  stepperProgressRail: {
    position: "absolute",
    top: 42,
    left: "calc(10% - 18px)",
    right: "calc(10% - 18px)",
    height: 2,
    borderRadius: 999,
    overflow: "hidden",
    zIndex: 0,
    background: "var(--border-card, #E2E8F0)",
  },
  stepperTrackProgress: {
    height: "100%",
    borderRadius: 999,
    background: "#10B981",
    transition: "width 0.25s ease",
  },
  stepperInner: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 0,
    width: "100%",
    padding: "0 8px",
  },
  stepItem: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    flex: "1 1 0",
    minWidth: 0,
    padding: "0 8px",
  },
  stepItemFirst: {
    transform: "translateX(-18px)",
  },
  stepItemLast: {
    transform: "translateX(18px)",
  },
  stepCircle: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
    background: "var(--surface-card, #FFFFFF)",
    transition: "all 0.2s",
  },
  stepComplete: {
    background: "#059669",
    boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.2)",
  },
  stepCurrent: {
    background: "#D4AF37",
    boxShadow: "0 0 0 3px rgba(212, 175, 55, 0.28)",
  },
  stepWaiting: {
    background: "#2563EB",
    boxShadow: "0 0 0 2px rgba(37, 99, 235, 0.2)",
  },
  stepRejected: {
    background: "#DC2626",
    boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.2)",
  },
  stepLocked: {
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #E2E8F0)",
  },
  stepLabel: {
    fontSize: 14,
    textAlign: "center",
    whiteSpace: "normal",
    lineHeight: 1.3,
    maxWidth: 170,
  },
  stepDesc: {
    fontSize: 12,
    textAlign: "center",
    whiteSpace: "normal",
    lineHeight: 1.3,
    maxWidth: 190,
    marginTop: 0,
  },

  /* action card */
  actionCard: {
    background: "var(--surface-card, #FFFFFF)",
    borderRadius: 10,
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    border: "1px solid var(--border-card, #E2E8F0)",
  },
  actionContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  actionIconWrap: {
    marginTop: 2,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 600,
    margin: "0 0 4px",
  },
  actionDescription: {
    fontSize: 13,
    color: "var(--text-secondary, #64748B)",
    margin: 0,
    lineHeight: 1.5,
  },
  actionButton: {
    padding: "8px 20px",
    background: "#059669",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    transition: "all 0.15s ease",
  },

  /* post-confirmation dashboard */
  confirmedDashboard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  /* footer */
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid var(--border-divider, var(--border-card, #E2E8F0))",
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  footerLinkSecondary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #CBD5E1)",
    color: "var(--text-secondary, #475569)",
    fontSize: 12,
    cursor: "pointer",
    padding: "7px 14px",
    borderRadius: 6,
    fontWeight: 600,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
    transition: "all 0.15s ease",
  },
  footerLinkDanger: {
    background: "var(--color-danger-bg, rgba(220, 38, 38, 0.08))",
    border: "1px solid var(--color-danger, #DC2626)",
    color: "var(--color-danger-text, #DC2626)",
    fontSize: 12,
    cursor: "pointer",
    padding: "7px 14px",
    borderRadius: 6,
    fontWeight: 600,
    transition: "all 0.15s ease",
  },
  cancelLink: {
    background: "none",
    border: "none",
    color: "#94A3B8",
    fontSize: 13,
    cursor: "pointer",
    padding: 4,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },

  /* cancel modal */
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalCard: {
    background: "var(--surface-card, #FFFFFF)",
    borderRadius: 16,
    padding: "32px",
    maxWidth: 400,
    width: "90%",
    boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
    textAlign: "center",
  },
  modalIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-heading, #0F172A)",
    margin: "0 0 8px",
  },
  modalDesc: {
    fontSize: 14,
    color: "var(--text-secondary, #64748B)",
    margin: "0 0 24px",
    lineHeight: 1.5,
  },
  modalActions: {
    display: "flex",
    gap: 12,
  },
  modalHint: {
    fontSize: 13,
    color: "var(--text-secondary, #64748B)",
    margin: "14px 0 0",
  },
  modalBtnSecondary: {
    flex: 1,
    padding: "12px",
    background: "var(--surface-card, #FFFFFF)",
    color: "var(--text-body, #374151)",
    border: "1px solid var(--border-card, #E2E8F0)",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 14,
  },
  modalBtnDanger: {
    flex: 1,
    padding: "12px",
    background: "#DC2626",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
};
