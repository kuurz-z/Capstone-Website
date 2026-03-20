import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import { formatPaymentMethod } from "../../../shared/utils/formatPaymentMethod";
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
  Download,
} from "lucide-react";
import { useCurrentUser } from "../../../shared/hooks/queries/useUsers";
import { generateDepositReceipt } from "../../../shared/utils/receiptGenerator";

/**
 * ─── RESERVATION DASHBOARD ──────────────────────────────────────────────────
 * A clean, single-reservation dashboard component.
 * Replaces the old multi-reservation selector with a single-card view.
 *
 * Design principles:
 *   - ONE active reservation at a time
 *   - Horizontal step indicator
 *   - Clear next-action CTA
 *   - Formal, minimal typography
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
    key: "visit_approved",
    label: "Visit & Policies",
    desc: "Schedule a visit and review policies",
    icon: Calendar,
    stage: 2,
    category: "Getting Started",
  },
  {
    key: "application_submitted",
    label: "Tenant Application",
    desc: "Submit personal details and documents",
    icon: FileText,
    stage: 3,
    category: "Verification",
  },
  {
    key: "payment_submitted",
    label: "Payment",
    desc: "Pay reservation fee online",
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
  const status = reservation.reservationStatus || reservation.status;

  if (status === "reserved") return 5;
  if (reservation.paymentStatus === "paid") return 5;

  // application submitted
  if (
    reservation.agreedToCertification &&
    reservation.firstName &&
    reservation.lastName
  )
    return 4; // ready for payment

  // visit approved → ready for application
  if (reservation.visitApproved || reservation.scheduleApproved) return 3;

  // visit actually submitted (needs date + type, not just agreedToPrivacy)
  if (reservation.visitDate && reservation.viewingType) return 2;

  // room confirmed — ready for visit scheduling
  if (reservation.roomConfirmed) return 2;

  // room selected (reservation exists but not yet reserved)
  return 1;
}

function getStepStatus(stepStage, currentStage, reservation) {
  if (stepStage < currentStage) return "complete";
  if (stepStage === currentStage) {
    // Step 5 is the final step — if reservation is confirmed, mark as complete (green)
    if (stepStage === 5 && reservation) {
      const status = reservation.reservationStatus || reservation.status;
      if (status === "reserved" || reservation.paymentStatus === "paid") {
        return "complete";
      }
    }
    // Show "rejected" for step 2 when admin has rejected the visit schedule
    if (stepStage === 2 && reservation?.scheduleRejected) {
      return "rejected";
    }
    // Show "waiting" for step 2 only (visit pending admin check-in confirmation)
    if (stepStage === 2 && reservation) {
      const hasSchedule = reservation.visitDate || reservation.viewingType;
      const approved =
        reservation.visitApproved || reservation.scheduleApproved;
      if (hasSchedule && !approved) return "waiting";
    }
    // Step 4: PayMongo is instant — never show "waiting"; payment is either
    // pending (user still needs to pay) or confirmed (reservation = reserved).
    return "current";
  }
  return "locked";
}

function getNextAction(reservation, currentStage) {
  if (!reservation) {
    return {
      title: "Start Your Reservation",
      description: "Browse rooms to begin your application",
      buttonLabel: "Browse Rooms",
      route: "/applicant/rooms",
      isWaiting: false,
    };
  }

  const status = reservation.reservationStatus || reservation.status;
  if (status === "reserved") {
    return {
      title: "Reservation Secured",
      description: "Your reservation is secured. You're all set for move-in!",
      buttonLabel: null,
      route: null,
      isWaiting: false,
    };
  }

  switch (currentStage) {
    case 1:
      return {
        title: "Confirm Room & Continue",
        description: "Review your selected room and confirm your choice",
        buttonLabel: "Continue →",
        route: `/applicant/reservation?step=1`,
        isWaiting: false,
      };
    case 2: {
      const hasSchedule = reservation.visitDate;
      const approved =
        reservation.visitApproved || reservation.scheduleApproved;
      const rejected = reservation.scheduleRejected;
      if (rejected) {
        return {
          title: "Visit Rejected",
          description: reservation.scheduleRejectionReason || "Your visit schedule was rejected. Please reschedule.",
          buttonLabel: "Reschedule Visit →",
          route: `/applicant/reservation?step=2`,
          isWaiting: false,
          isRejected: true,
        };
      }
      if (hasSchedule && !approved) {
        const fDate = reservation.visitDate
          ? new Date(reservation.visitDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "";
        return {
          title: "Visit Scheduled",
          description: `Your visit${fDate ? ` on ${fDate}` : ""} is booked. The admin will verify your attendance on-site.`,
          buttonLabel: null,
          route: null,
          isWaiting: true,
        };
      }
      return {
        title: "Schedule Your Visit",
        description: "Pick a date and time to visit the dormitory",
        buttonLabel: "Book Visit →",
        route: `/applicant/reservation?step=2`,
        isWaiting: false,
      };
    }
    case 3:
      return {
        title: "Complete Your Application",
        description: "Fill in personal details and upload required documents",
        buttonLabel: "Fill Application →",
        route: `/applicant/reservation?step=3`,
        isWaiting: false,
      };
    case 4: {
      return {
        title: "Pay Reservation Fee",
        description:
          "Pay ₱2,000 online via GCash, Maya, or Card to secure your reservation",
        buttonLabel: "Pay Now →",
        route: `/applicant/reservation?step=4`,
        isWaiting: false,
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
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function getStepDesc(step, status, reservation) {
  if (!reservation || status === "locked") return step.desc;

  const room = reservation.roomId || {};
  const roomName = room.name || "Room";

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
    case 2:
      if (status === "rejected") {
        return "Schedule rejected";
      }
      if (status === "waiting") {
        return reservation.visitDate
          ? `Visit on ${formatDate(reservation.visitDate)}`
          : "Visit scheduled";
      }
      if (status === "complete") {
        return "Visit approved";
      }
      return step.desc;
    case 3:
      if (status === "complete") {
        return "Application submitted";
      }
      return step.desc;
    case 4:
      if (status === "complete") {
        return "Payment verified";
      }
      return step.desc; // "Pay reservation fee online" — no admin review needed
    case 5:
      if (status === "complete") {
        return "Move-in ready!";
      }
      return step.desc;
    default:
      return step.desc;
  }
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function ReservationDashboard({ reservation, visits = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useCurrentUser();
  const currentStage = resolveCurrentStage(reservation);
  const action = getNextAction(reservation, currentStage);
  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

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
            onClick={() => navigate("/applicant/rooms")}
            style={styles.primaryButton}
          >
            Browse Rooms
            <ArrowRight size={16} style={{ marginLeft: 8 }} />
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
  const isConfirmed =
    (reservation.reservationStatus || reservation.status) === "reserved" ||
    reservation.paymentStatus === "paid";

  return (
    <div style={styles.card}>

      {/* ── Header — full width ──────────────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerRow}>
            <h3 style={styles.roomTitle}>{roomName}</h3>
            {isConfirmed ? (
              <span style={styles.confirmedBadge}>✓ Reserved</span>
            ) : (
              <span style={styles.pendingBadge}>In Progress</span>
            )}
          </div>
          <div style={styles.headerMeta}>
            <span style={styles.metaItem}>
              <MapPin size={13} style={{ marginRight: 4 }} />
              {branch}
            </span>

            {reservation.targetMoveInDate && (
              <>
                <span style={styles.metaDot}>·</span>
                <span style={styles.metaItem}>
                  Move-in: {formatDate(reservation.targetMoveInDate)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Step Indicator ────────────────────────────────────────────────── */}
      <div style={styles.stepperWrapper}>
        {STEPS.map((step, i) => {
          const status = getStepStatus(step.stage, currentStage, reservation);
          const Icon = step.icon;
          const isLast = i === STEPS.length - 1;
          return (
            <React.Fragment key={step.key}>
              <div
                style={{
                  ...styles.stepItem,
                  cursor:
                    status === "complete" || status === "current" || status === "waiting" || status === "rejected"
                      ? "pointer"
                      : "default",
                  opacity: status === "locked" ? 0.4 : 1,
                }}
                onClick={() => {
                  if (step.stage === 1 && (status === "complete" || status === "waiting")) {
                    navigate(`/applicant/reservation?step=${step.stage}`);
                    return;
                  }
                  if (status === "current" && action.route) {
                    navigate(action.route);
                  } else if (status === "complete" || status === "waiting") {
                    navigate(`/applicant/reservation?step=${step.stage}`);
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
                    <CheckCircle size={16} color="#fff" />
                  ) : status === "waiting" ? (
                    <Clock size={16} color="#fff" />
                  ) : status === "rejected" ? (
                    <AlertCircle size={16} color="#fff" />
                  ) : (
                    <Icon size={16} color={status === "current" ? "#fff" : "#94A3B8"} />
                  )}
                </div>
                <span
                  style={{
                    ...styles.stepLabel,
                    color:
                      status === "complete"
                        ? "#059669"
                        : status === "current"
                          ? "#FF8C42"
                          : status === "waiting"
                            ? "#2563EB"
                            : status === "rejected"
                              ? "#DC2626"
                              : "#94A3B8",
                    fontWeight: status === "current" || status === "waiting" || status === "rejected" ? 600 : 400,
                  }}
                >
                  {step.label}
                </span>
                <span
                  style={{
                    ...styles.stepDesc,
                    color:
                      status === "complete"
                        ? "#6EE7B7"
                        : status === "current"
                          ? "#FDBA74"
                          : status === "rejected"
                            ? "#FCA5A5"
                            : "#CBD5E1",
                  }}
                >
                  {getStepDesc(step, status, reservation)}
                </span>
              </div>
              {!isLast && (
                <div
                  style={{
                    ...styles.connector,
                    backgroundColor: status === "complete" ? "#10B981" : "#E2E8F0",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Next Action Row ──────────────────────────────────────────────── */}
      {action.title && !isConfirmed && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderRadius: 8,
          background: action.isRejected ? "rgba(220, 38, 38, 0.08)" : action.isWaiting ? "rgba(37, 99, 235, 0.06)" : "rgba(255, 140, 66, 0.06)",
          border: `1px solid ${action.isRejected ? "rgba(220, 38, 38, 0.2)" : action.isWaiting ? "rgba(37, 99, 235, 0.15)" : "rgba(255, 140, 66, 0.2)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: action.isRejected ? "#DC2626" : action.isWaiting ? "#2563EB" : "#FF8C42",
            }} />
            <div>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: action.isRejected ? "#DC2626" : action.isWaiting ? "#1D4ED8" : "#C2611B",
                marginRight: 6,
              }}>
                {action.title}
              </span>
              <span style={{ fontSize: 13, color: action.isRejected ? "#7F1D1D" : "#94A3B8" }}>
                {action.description}
              </span>
            </div>
          </div>
          {action.buttonLabel && action.route && (
            <button
              onClick={() => navigate(action.route)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                background: action.isRejected ? "#DC2626" : "#FF8C42",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {action.buttonLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Confirmed celebration ─────────────────────────────────────────── */}
      {isConfirmed && (
        <div style={styles.celebrationCard}>
          <CheckCircle size={24} color="#059669" />
          <div style={{ marginLeft: 12, flex: 1 }}>
            <h4 style={styles.celebrationTitle}>Reservation Secured!</h4>
            <p style={styles.celebrationDesc}>
              Your reservation is secured. Please prepare for your move-in date.
            </p>
            {reservation.paymentDate && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#047857", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CreditCard size={13} style={{ flexShrink: 0 }} />
                    <span>Paid: ₱2,000 via {formatPaymentMethod(reservation.paymentMethod)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={13} style={{ flexShrink: 0 }} />
                    <span>Date: {formatDate(reservation.paymentDate)}</span>
                  </div>
                </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer — full width ───────────────────────────────────────────── */}
      {!isConfirmed && (
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            {currentStage <= 2 &&
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
                >
                  ↩ Change Room
                </button>
              )}
          </div>
          <button
            onClick={() => setShowCancelModal(true)}
            style={styles.footerLinkDanger}
          >
            Cancel Reservation
          </button>
        </div>
      )}

      {/* ── Cancel Confirmation Modal ─────────────────────────────────────── */}
      {showCancelModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalIcon}>⚠️</div>
            <h3 style={styles.modalTitle}>Cancel Reservation?</h3>
            <p style={styles.modalDesc}>
              This will permanently remove your reservation for{" "}
              <strong>{roomName}</strong>. This action cannot be undone.
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={styles.modalBtnSecondary}
              >
                Keep Reservation
              </button>
              <button
                onClick={async () => {
                  setIsCancelling(true);
                  try {
                    const { reservationApi } =
                      await import("../../../shared/api/reservationApi");
                    await reservationApi.updateByUser(reservation._id, { cancelReservation: true });
                    setShowCancelModal(false);
                    showNotification("Reservation cancelled successfully.", "success", 3000);
                    queryClient.invalidateQueries({ queryKey: ["reservations"] });
                  } catch (err) {
                    console.error("Cancel failed:", err);
                    setIsCancelling(false);
                    setShowCancelModal(false);
                    showNotification("Failed to cancel reservation. Please try again.", "error", 4000);
                  }
                }}
                disabled={isCancelling}
                style={{
                  ...styles.modalBtnDanger,
                  opacity: isCancelling ? 0.6 : 1,
                }}
              >
                {isCancelling ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── styles ──────────────────────────────────────────────────────────────── */

const styles = {
  card: {
    background: "var(--surface-card, #FFFFFF)",
    borderRadius: 12,
    border: "1px solid var(--border-card, #E2E8F0)",
    padding: "24px 28px",
    marginBottom: 0,
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
    background: "var(--surface-muted, #F1F5F9)",
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
    background: "#FF8C42",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
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
    background: "rgba(16, 185, 129, 0.12)",
    padding: "3px 10px",
    borderRadius: 999,
  },
  pendingBadge: {
    fontSize: 12,
    fontWeight: 500,
    color: "#FF8C42",
    background: "rgba(255, 140, 66, 0.1)",
    padding: "3px 10px",
    borderRadius: 999,
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
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "16px 0",
    gap: 0,
    marginBottom: 20,
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    minWidth: 72,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  stepComplete: {
    background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
  },
  stepCurrent: {
    background: "linear-gradient(135deg, #FF8C42 0%, #FF8C2E 100%)",
    boxShadow:
      "0 0 0 4px rgba(255, 140, 66, 0.25), 0 0 12px rgba(255, 140, 66, 0.3)",
  },
  stepWaiting: {
    background: "#2563EB",
    boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.15)",
  },
  stepRejected: {
    background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
    boxShadow: "0 0 0 4px rgba(220, 38, 38, 0.2), 0 0 12px rgba(220, 38, 38, 0.15)",
  },
  stepLocked: {
    background: "var(--surface-muted, #F1F5F9)",
    border: "1px solid var(--border-card, #E2E8F0)",
  },
  stepLabel: {
    fontSize: 12,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  stepDesc: {
    fontSize: 10,
    textAlign: "center",
    whiteSpace: "nowrap",
    marginTop: -2,
  },
  connector: {
    flex: 1,
    height: 2,
    minWidth: 32,
    maxWidth: 80,
    borderRadius: 1,
    alignSelf: "flex-start",
    marginTop: 18,
  },

  /* action card */
  actionCard: {
    background: "var(--surface-muted, #F8FAFC)",
    borderRadius: 8,
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
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
    background: "#FF8C42",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  /* celebration */
  celebrationCard: {
    display: "flex",
    alignItems: "center",
    background: "rgba(16, 185, 129, 0.08)",
    borderRadius: 8,
    padding: "16px 20px",
    border: "1px solid rgba(16, 185, 129, 0.2)",
  },
  celebrationTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#065F46",
    margin: "0 0 4px",
  },
  celebrationDesc: {
    fontSize: 13,
    color: "#047857",
    margin: 0,
  },

  /* footer */
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid var(--border-subtle, #F1F5F9)",
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  footerLinkSecondary: {
    background: "none",
    border: "none",
    color: "var(--text-secondary, #64748B)",
    fontSize: 13,
    cursor: "pointer",
    padding: "6px 10px",
    borderRadius: 6,
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
  },
  footerLinkDanger: {
    background: "none",
    border: "1px solid #FCA5A5",
    color: "#DC2626",
    fontSize: 13,
    cursor: "pointer",
    padding: "6px 12px",
    borderRadius: 6,
    fontWeight: 500,
    transition: "background 0.15s",
  },
  /* keep for any legacy references */
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
    fontSize: 36,
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
  modalBtnSecondary: {
    flex: 1,
    padding: "12px",
    background: "var(--surface-muted, #F3F4F6)",
    color: "var(--text-body, #374151)",
    border: "none",
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
