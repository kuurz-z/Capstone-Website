import { useState } from "react";
import { createPortal } from "react-dom";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import {
  CalendarDays, User, Home, MapPin, Clock, Ban, Check, X,
} from "lucide-react";
import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";
import "../styles/reservation-details-modal.css";

/* ─── helpers ────────────────────────────────────────── */
const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : v);

const formatDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const STATUS_CONFIGS = [
  { test: (s) => s.visitApproved,    bg: "#D1FAE5", color: "#047857", dot: "#10b981", label: "Visit Completed" },
  { test: (s) => s.scheduleApproved, bg: "#E0EBF5", color: "#0A5C9B", dot: "#3b82f6", label: "Awaiting Visit"  },
  { test: (s) => s.scheduleRejected, bg: "#FEE2E2", color: "#DC2626", dot: "#ef4444", label: "Schedule Rejected" },
];

const getStatusCfg = (schedule) =>
  STATUS_CONFIGS.find((c) => c.test(schedule)) || {
    bg: "#FEF3C7", color: "#92400E", dot: "#f59e0b", label: "Pending Approval",
  };

/* ─── sub-components ─────────────────────────────────── */
const InfoRow = ({ label, value, wide }) => (
  <div className="rdm-info-item" style={wide ? { gridColumn: "span 2" } : {}}>
    <span className="rdm-info-label">{label}</span>
    <span className="rdm-info-value">{value || "—"}</span>
  </div>
);

const SectionCard = ({ icon: Icon, title, children }) => (
  <div className="rdm-section" style={{ marginBottom: 14 }}>
    <h4 className="rdm-section-title" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
      {Icon && <Icon size={13} />}
      {title}
    </h4>
    <div
      style={{
        background: "var(--bg-inset)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-light)",
        padding: "14px 16px",
      }}
    >
      <div className="rdm-info-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
        {children}
      </div>
    </div>
  </div>
);

/* ─── main component ──────────────────────────────────── */
export default function VisitDetailsModal({ schedule, onClose, onUpdate }) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useBodyScrollLock(!!schedule);
  useEscapeClose(!!schedule, onClose);

  if (!schedule) return null;

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      showNotification("Please enter a rejection reason", "warning");
      return;
    }
    setIsSubmitting(true);
    try {
      await reservationApi.update(schedule.id, {
        scheduleRejected: true,
        scheduleRejectionReason: rejectReason.trim(),
        scheduleRejectedAt: new Date().toISOString(),
        viewingType: null,
        agreedToPrivacy: false,
        scheduleApproved: false,
      });
      showNotification("Visit schedule rejected successfully", "success");
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error("Error rejecting schedule:", error);
      showNotification("Failed to reject schedule", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showRejectBtn = !schedule.visitApproved && !schedule.scheduleRejected;
  const cfg = getStatusCfg(schedule);

  const REJECT_PRESETS = [
    { label: "Schedule conflict",  text: "The selected date/time conflicts with an existing schedule. Please choose a different slot." },
    { label: "Branch unavailable", text: "The branch is temporarily unavailable for visits on the selected date. Please pick another date." },
    { label: "Capacity reached",   text: "Visit capacity has been reached for this date. Please select an alternative date." },
    { label: "Incomplete info",    text: "We need additional information before approving your visit. Please update your reservation details." },
  ];

  return createPortal(
    <div className="rdm-overlay" onClick={onClose}>
      <div className="rdm" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="rdm-header">
          <div>
            <h2 className="rdm-title">{fmt(schedule.customer)}</h2>
            <div className="rdm-header-meta">
              <span className="rdm-code">{schedule.reservationCode || "—"}</span>
              <span className="rdm-header-sep">·</span>
              <span className="rdm-header-detail">{fmt(schedule.email)}</span>
            </div>
          </div>
          <button className="rdm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="rdm-body">

          {/* Status chip */}
          <div className="rdm-status-row">
            <div
              className="rdm-status-chip"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              <span className="rdm-status-dot" style={{ background: cfg.dot }} />
              {cfg.label}
            </div>
          </div>

          {/* Rejection reason banner */}
          {schedule.scheduleRejected && schedule.scheduleRejectionReason && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderLeft: "3px solid #DC2626",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                marginBottom: 14,
              }}
            >
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#DC2626", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rejection Reason
              </p>
              <p style={{ fontSize: "14px", color: "#7F1D1D", margin: 0, lineHeight: 1.5 }}>
                {schedule.scheduleRejectionReason}
              </p>
            </div>
          )}

          {/* Customer Information */}
          <SectionCard icon={User} title="Customer Information">
            <InfoRow label="Full Name"     value={fmt(schedule.customer)} />
            <InfoRow label="Email"         value={fmt(schedule.email)} />
            <InfoRow label="Phone"         value={fmt(schedule.phone)} />
            <InfoRow label="Billing Email" value={fmt(schedule.billingEmail)} />
          </SectionCard>

          {/* Room Information */}
          <SectionCard icon={Home} title="Room Information">
            <InfoRow label="Room"   value={fmt(schedule.room)} />
            <InfoRow label="Branch" value={fmt(schedule.branch)} />
          </SectionCard>

          {/* Visit Details */}
          <SectionCard icon={CalendarDays} title="Visit Details">
            <div className="rdm-info-item">
              <span className="rdm-info-label">Visit Type</span>
              <span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 20,
                    fontSize: "12px",
                    fontWeight: 600,
                    background: schedule.viewingType === "inperson" ? "#E0EBF5" : "#F3E8FF",
                    color: "#1a1a1a",
                    marginTop: 2,
                  }}
                >
                  {schedule.viewingType === "inperson" ? "In-Person" : "Virtual"}
                </span>
              </span>
            </div>
            <InfoRow label="Requested Date" value={formatDate(schedule.scheduledDate)} />
            <InfoRow label="Visit Date"     value={formatDate(schedule.visitDate)} />
            <InfoRow label="Visit Time"     value={fmt(schedule.visitTime)} />
            {schedule.isOutOfTown && (
              <div className="rdm-info-item" style={{ gridColumn: "span 2" }}>
                <span className="rdm-info-label">Current Location (Out of Town)</span>
                <span className="rdm-info-value" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  {schedule.currentLocation || "Not specified"}
                </span>
              </div>
            )}
          </SectionCard>

          {/* Visit History Timeline */}
          {schedule.visitHistory && schedule.visitHistory.length > 0 && (
            <div className="rdm-section">
              <h4 className="rdm-section-title" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
                <Clock size={13} />
                Visit Schedule History
              </h4>
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)",
                  padding: "4px 16px",
                }}
              >
                {schedule.visitHistory
                  .slice()
                  .sort((a, b) => new Date(b.scheduledAt || b.rejectedAt || 0) - new Date(a.scheduledAt || a.rejectedAt || 0))
                  .map((entry, idx) => {
                    const MAP = {
                      pending:   { bg: "#FEF3C7", color: "#92400E", label: "Scheduled" },
                      rejected:  { bg: "#FEE2E2", color: "#DC2626", label: "Rejected"  },
                      approved:  { bg: "#D1FAE5", color: "#047857", label: "Approved"  },
                      cancelled: { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
                    };
                    const s = MAP[entry.status] || MAP.pending;
                    const entryDate = entry.visitDate
                      ? new Date(entry.visitDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "N/A";
                    const actionDate = entry.rejectedAt || entry.approvedAt || entry.scheduledAt;
                    const actionDateStr = actionDate
                      ? new Date(actionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "";

                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "12px 0",
                          borderBottom: idx < schedule.visitHistory.length - 1 ? "1px solid var(--border-light)" : "none",
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: s.color, marginTop: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              Visit on {entryDate}{entry.visitTime ? ` at ${entry.visitTime}` : ""}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color }}>
                              {s.label}
                            </span>
                          </div>
                          {entry.rejectionReason && (
                            <div style={{ fontSize: "12px", color: "#7F1D1D", marginTop: 2 }}>
                              Reason: {entry.rejectionReason}
                            </div>
                          )}
                          {actionDateStr && (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>{actionDateStr}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Rejection form */}
          {rejectMode && showRejectBtn && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "var(--radius-lg)",
                padding: 16,
                marginTop: 8,
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, color: "#DC2626", margin: "0 0 4px" }}>
                Reject Visit Schedule
              </h4>
              <p style={{ fontSize: 12, color: "#7F1D1D", margin: "0 0 10px" }}>
                Select a preset or type a custom message:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {REJECT_PRESETS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setRejectReason(t.text)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 20,
                      border: rejectReason === t.text ? "1.5px solid #DC2626" : "1px solid #FECACA",
                      background: rejectReason === t.text ? "#FEE2E2" : "white",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#7F1D1D",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                className="rdm-notes-input"
                style={{ minHeight: 90, marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setRejectMode(false); setRejectReason(""); }}
                  className="rdm-extend-dialog-cancel"
                  style={{ flex: "unset", padding: "8px 16px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={isSubmitting || !rejectReason.trim()}
                  style={{
                    padding: "8px 20px",
                    background: "#DC2626",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isSubmitting || !rejectReason.trim() ? "not-allowed" : "pointer",
                    opacity: isSubmitting || !rejectReason.trim() ? 0.55 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {isSubmitting ? "Rejecting…" : "Confirm Rejection"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            padding: "14px 24px",
            borderTop: "1px solid var(--border-light)",
            background: "var(--bg-inset)",
            flexShrink: 0,
          }}
        >
          {showRejectBtn && !rejectMode && (
            <button
              onClick={() => setRejectMode(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
                background: "white",
                color: "#DC2626",
                border: "1.5px solid rgba(220,38,38,0.35)",
                borderRadius: "var(--radius-lg)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              <Ban size={14} />
              Reject Schedule
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px",
              background: "var(--text-secondary, #6B7280)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-lg)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}
