import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket,
  Calendar,
  Clock,
  MapPin,
  Home,
  CreditCard,
  FileText,
  Shield,
  Download,
} from "lucide-react";
import { generateDepositReceipt } from "../../../../shared/utils/receiptGenerator";
import { useCurrentUser } from "../../../../shared/hooks/queries/useUsers";

/* ─── helpers ──────────────────────────────────────────────── */
function parseSafeDate(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).split("T")[0];
  const d = new Date(clean + "T12:00:00");
  return isNaN(d) ? null : d;
}

function fmtDate(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtDateLong(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── ReservationSidePanel ──────────────────────────────────── */
/**
 * Clean side panel for the dashboard right column.
 * Shows reservation confirmation details in a professional,
 * minimal style matching the empty state card aesthetic.
 */
export default function ReservationSidePanel({ reservation, onClick }) {
  const navigate = useNavigate();
  const { data: profile } = useCurrentUser();
  if (!reservation) return <EmptyState />;

  const status = reservation.reservationStatus || reservation.status;
  const isConfirmed = status === "reserved" || reservation.paymentStatus === "paid";
  const hasVisit = !!(reservation.visitDate && reservation.visitTime);
  const visitApproved = reservation.visitApproved || reservation.scheduleApproved;
  const hasApplication = !!reservation.applicationSubmittedAt;

  const room = reservation.roomId || {};
  const roomName = room.name || "—";
  const branch = room.branch || "—";

  // Determine panel state
  let panelState = "pending"; // room selected, no visit yet
  if (isConfirmed) panelState = "confirmed";
  else if (hasApplication) panelState = "application";
  else if (visitApproved) panelState = "approved";
  else if (hasVisit) panelState = "scheduled";

  return (
    <div style={S.card} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>

      {/* Header */}
      <div style={S.header}>
        <div style={{
          ...S.statusDot,
          background: panelState === "confirmed" ? "#10B981"
            : panelState === "application" ? "#F59E0B"
            : panelState === "approved" ? "#3B82F6"
            : panelState === "scheduled" ? "#8B5CF6"
            : "#94A3B8",
        }} />
        <span style={S.statusLabel}>
          {panelState === "confirmed" ? "Reservation Details"
            : panelState === "application" ? "Payment Pending"
            : panelState === "approved" ? "Visit Approved"
            : panelState === "scheduled" ? "Visit Scheduled"
            : "Room Selected"}
        </span>
      </div>

      {/* Room info */}
      <div style={S.roomSection}>
        <div style={S.roomIconWrap}>
          <Home size={18} color="var(--text-secondary, #64748B)" />
        </div>
        <div>
          <div style={S.roomName}>{roomName}</div>
          <div style={S.roomBranch}>
            <MapPin size={11} style={{ marginRight: 3 }} />
            {branch}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={S.divider} />

      {/* Details rows */}
      <div style={S.detailsSection}>
        {/* Visit date & time */}
        {hasVisit && (
          <>
            <DetailRow
              icon={<Calendar size={14} color="var(--text-secondary, #94A3B8)" />}
              label="Visit Date"
              value={fmtDate(reservation.visitDate)}
            />
            <DetailRow
              icon={<Clock size={14} color="var(--text-secondary, #94A3B8)" />}
              label="Visit Time"
              value={reservation.visitTime}
            />
          </>
        )}

        {/* Visit code */}
        {reservation.visitCode && (
          <DetailRow
            icon={<Ticket size={14} color="var(--text-secondary, #94A3B8)" />}
            label="Visit Code"
            value={reservation.visitCode}
            mono
            highlight
          />
        )}

        {/* Move-in date */}
        {reservation.targetMoveInDate && (
          <DetailRow
            icon={<Calendar size={14} color="var(--text-secondary, #94A3B8)" />}
            label="Move-in"
            value={fmtDateLong(reservation.targetMoveInDate)}
          />
        )}

        {/* Application status */}
        {hasApplication && (
          <DetailRow
            icon={<FileText size={14} color="var(--text-secondary, #94A3B8)" />}
            label="Application"
            value="Submitted"
            success
          />
        )}

        {/* Payment status */}
        {isConfirmed && (
          <DetailRow
            icon={<CreditCard size={14} color="var(--text-secondary, #94A3B8)" />}
            label="Payment"
            value="Verified"
            success
          />
        )}

        {/* Reservation code */}
        {reservation.reservationCode && (
          <DetailRow
            icon={<Shield size={14} color="var(--text-secondary, #94A3B8)" />}
            label="Reservation"
            value={reservation.reservationCode}
            mono
          />
        )}
      </div>

      {/* Bottom status indicator */}
      {panelState === "scheduled" && (
        <div style={S.pendingBanner}>
          <Clock size={14} color="#7C3AED" />
          <span style={S.pendingText}>Awaiting admin approval</span>
        </div>
      )}

      {/* ── Confirmed: Download + Quick Link ── */}
      {isConfirmed && (
        <>
          <div style={S.divider} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateDepositReceipt(reservation, profile);
            }}
            style={S.downloadBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#D4622F";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#E8734A";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Download size={14} />
            Download Receipt
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/applicant/profile', { state: { tab: 'reservation' } });
            }}
            style={S.subtleLink}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FF8C42'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
          >
            My Reservation →
          </button>
        </>
      )}
    </div>
  );
}

/* ─── DetailRow ────────────────────────────────────────────── */
function DetailRow({ icon, label, value, mono, highlight, success }) {
  return (
    <div style={S.detailRow}>
      <div style={S.detailLeft}>
        {icon}
        <span style={S.detailLabel}>{label}</span>
      </div>
      <span style={{
        ...S.detailValue,
        ...(mono ? S.mono : {}),
        ...(highlight ? { color: "#FF8C42", fontWeight: 700 } : {}),
        ...(success ? { color: "#059669", fontWeight: 600 } : {}),
      }}>
        {value}
      </span>
    </div>
  );
}

/* ─── EmptyState ───────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={S.emptyCard}>
      <div style={S.emptyIconWrap}>
        <Ticket size={28} strokeWidth={1.5} color="var(--text-muted, #CBD5E1)" />
      </div>
      <p style={S.emptyText}>
        Your reservation details will appear here once you start your application
      </p>
    </div>
  );
}

/* ─── styles ───────────────────────────────────────────────── */
const S = {
  /* card */
  card: {
    background: "var(--surface-card, #FFFFFF)",
    border: "1px solid var(--border-card, #E2E8F0)",
    borderRadius: 14,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    cursor: "default",
  },

  /* header */
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary, #64748B)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },

  /* room */
  roomSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  roomIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "var(--surface-muted, #F1F5F9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roomName: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-heading, #0F172A)",
    lineHeight: 1.2,
    marginBottom: 2,
  },
  roomBranch: {
    fontSize: 12,
    color: "var(--text-secondary, #94A3B8)",
    display: "flex",
    alignItems: "center",
    textTransform: "capitalize",
  },

  /* divider */
  divider: {
    height: 1,
    background: "var(--border-card, #E2E8F0)",
    marginBottom: 14,
    marginTop: 14,
  },

  /* details */
  detailsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
  },
  detailRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  detailLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: "var(--text-secondary, #94A3B8)",
    fontWeight: 500,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-heading, #0F172A)",
  },
  mono: {
    fontFamily: "'Courier New', monospace",
    letterSpacing: "0.04em",
    fontSize: 12,
  },

  /* banners */
  pendingBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(124, 58, 237, 0.06)",
    border: "1px solid rgba(124, 58, 237, 0.15)",
    borderRadius: 8,
    padding: "10px 12px",
    marginTop: 16,
  },
  pendingText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#7C3AED",
  },

  /* download + quick link */
  downloadBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "10px 16px",
    background: "#E8734A",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    marginTop: 4,
  },
  subtleLink: {
    background: "none",
    border: "none",
    color: "var(--text-muted, #94A3B8)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    padding: "8px 0 0",
    transition: "color 0.15s",
    textAlign: "center",
    width: "100%",
  },

  /* empty state */
  emptyCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    border: "2px dashed var(--border-card, #E2E8F0)",
    borderRadius: 14,
    padding: "36px 24px",
    background: "var(--surface-muted, #FAFBFC)",
    flex: 1,
    height: "100%",
    boxSizing: "border-box",
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "var(--surface-card, #F1F5F9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-secondary, #94A3B8)",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: 180,
  },
};
