import React, { useMemo, useState, useEffect } from "react";
import {
  Calendar,
  CreditCard,
  FileText,
  CheckCircle,
  Home,
  UserCheck,
  ClipboardCheck,
  Clock,
  History,
  XCircle,
  ChevronDown,
  MapPin,
  Bed,
} from "lucide-react";
import dayjs from "dayjs";

/* ── Date helpers ────────────────────────────────── */
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

const fmtDateTime = (d) =>
  new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

const formatMethod = (m) => {
  const map = {
    gcash: "GCash", maya: "Maya", paymaya: "PayMaya", grab_pay: "GrabPay",
    card: "Credit/Debit Card", bank: "Bank Transfer", paymongo: "PayMongo",
    cash: "Cash", online: "Online Payment",
  };
  return map[m] || m || "Online";
};

/* ── Build timeline from a single reservation ────── */
const buildTimeline = (r) => {
  if (!r) return [];
  const events = [];

  if (r.createdAt) {
    events.push({
      id: "created", icon: Home, iconBg: "#EEF2FF", iconColor: "#0A1628",
      title: "Reservation Created",
      description: `Room ${r.roomId?.name || r.roomId?.roomNumber || "—"} selected`,
      date: r.createdAt, status: "Completed", statusColor: "#059669", statusBg: "#F0FDF4",
    });
  }

  if (r.visitHistory && r.visitHistory.length > 0) {
    r.visitHistory.forEach((attempt, idx) => {
      const suffix = r.visitHistory.length > 1 ? ` (Attempt ${idx + 1})` : "";
      const viewType = attempt.viewingType === "virtual" ? "Virtual" : "In-person";
      const visitDateStr = attempt.visitDate
        ? fmtDate(attempt.visitDate) + (attempt.visitTime ? ` at ${attempt.visitTime}` : "")
        : "Date not set";

      // Event 1: Tenant scheduled the visit
      if (attempt.status !== "cancelled") {
        events.push({
          id: `visit-${idx}-scheduled`,
          icon: Calendar, iconBg: "#DBEAFE", iconColor: "#2563EB",
          title: `Visit Scheduled${suffix}`,
          description: `${viewType} visit booked for ${visitDateStr}`,
          date: attempt.scheduledAt || r.createdAt,
          status: "Scheduled", statusColor: "#D97706", statusBg: "#FFFBEB",
        });
      }

      // Event 2: Admin outcome
      if (attempt.status === "approved") {
        events.push({
          id: `visit-${idx}-approved`,
          icon: CheckCircle, iconBg: "#F0FDF4", iconColor: "#059669",
          title: `Visit Approved${suffix}`,
          description: `Admin confirmed your ${viewType.toLowerCase()} visit on ${visitDateStr}`,
          date: attempt.approvedAt || attempt.scheduledAt || r.createdAt,
          status: "Approved", statusColor: "#059669", statusBg: "#F0FDF4",
        });
      } else if (attempt.status === "rejected") {
        events.push({
          id: `visit-${idx}-rejected`,
          icon: XCircle, iconBg: "#FEF2F2", iconColor: "#DC2626",
          title: `Visit Rejected${suffix}`,
          description: attempt.rejectionReason || "Admin rejected the schedule. Please reschedule.",
          date: attempt.rejectedAt || attempt.scheduledAt || r.createdAt,
          status: "Rejected", statusColor: "#DC2626", statusBg: "#FEF2F2",
        });
      } else if (attempt.status === "cancelled") {
        events.push({
          id: `visit-${idx}-cancelled`,
          icon: XCircle, iconBg: "#F3F4F6", iconColor: "#6B7280",
          title: `Visit Skipped${suffix}`,
          description: `${viewType} visit on ${visitDateStr} was not pushed through`,
          date: attempt.scheduledAt || r.createdAt,
          status: "Skipped", statusColor: "#6B7280", statusBg: "#F3F4F6",
        });
      }
    });

    const terminalStatuses = ["cancelled", "checked-out", "archived"];
    if (r.visitDate && !r.scheduleRejected && !r.visitApproved && !terminalStatuses.includes(r.status)) {
      const attemptNum = r.visitHistory.length + 1;
      const visitDateStr = fmtDate(r.visitDate) + (r.visitTime ? ` at ${r.visitTime}` : "");
      events.push({
        id: "visit-current", icon: Calendar, iconBg: "#DBEAFE", iconColor: "#2563EB",
        title: attemptNum > 1 ? `Visit Scheduled (Attempt ${attemptNum})` : "Visit Scheduled",
        description: `${r.viewingType === "virtual" ? "Virtual" : "In-person"} visit booked for ${visitDateStr}`,
        date: r.visitScheduledAt || r.updatedAt || r.createdAt,
        status: "Pending", statusColor: "#D97706", statusBg: "#FFFBEB",
      });
    }
  } else {
    if (r.visitDate) {
      events.push({
        id: "visit-scheduled", icon: Calendar, iconBg: "#DBEAFE", iconColor: "#2563EB",
        title: "Visit Scheduled",
        description: `${r.viewingType === "virtual" ? "Virtual" : "In-person"} visit on ${fmtDate(r.visitDate)}${r.visitTime ? ` at ${r.visitTime}` : ""}`,
        date: r.visitScheduledAt || r.updatedAt || r.createdAt,
        status: r.scheduleRejected ? "Rejected" : r.scheduleApproved ? "Approved" : "Pending",
        statusColor: r.scheduleRejected ? "#DC2626" : r.scheduleApproved ? "#059669" : "#D97706",
        statusBg: r.scheduleRejected ? "#FEF2F2" : r.scheduleApproved ? "#F0FDF4" : "#FFFBEB",
      });
    }
    if (r.scheduleRejected && r.scheduleRejectedAt) {
      events.push({
        id: "schedule-rejected", icon: XCircle, iconBg: "#FEF2F2", iconColor: "#DC2626",
        title: "Visit Schedule Rejected",
        description: r.scheduleRejectionReason || "Admin requested reschedule",
        date: r.scheduleRejectedAt, status: "Rejected", statusColor: "#DC2626", statusBg: "#FEF2F2",
      });
    }
  }

  if (r.scheduleApproved && r.scheduleApprovedAt) {
    events.push({
      id: "visit-approved", icon: CheckCircle, iconBg: "#F0FDF4", iconColor: "#059669",
      title: "Visit Approved",
      description: "Admin verified your visit. Proceed with application.",
      date: r.scheduleApprovedAt, status: "Approved", statusColor: "#059669", statusBg: "#F0FDF4",
    });
  }

  if (r.firstName && r.lastName && r.agreedToCertification) {
    events.push({
      id: "application", icon: FileText, iconBg: "#FFF7ED", iconColor: "#EA580C",
      title: "Application Submitted",
      description: "Personal details and documents submitted.",
      date: r.applicationSubmittedAt || r.updatedAt || r.createdAt,
      status: "Submitted", statusColor: "#EA580C", statusBg: "#FFF7ED",
    });
  }

  if (r.paymentStatus === "paid" || r.paymentDate) {
    events.push({
      id: "payment", icon: CreditCard, iconBg: "#F0FDF4", iconColor: "#059669",
      title: "Payment Confirmed",
      description: `₱2,000 deposit paid${r.paymentMethod ? ` via ${formatMethod(r.paymentMethod)}` : ""}`,
      date: r.paymentDate || r.updatedAt, status: "Paid", statusColor: "#059669", statusBg: "#F0FDF4",
    });
  }

  if (r.status === "reserved") {
    events.push({
      id: "reserved", icon: ClipboardCheck, iconBg: "#F0FDF4", iconColor: "#059669",
      title: "Reservation Confirmed",
      description: `Reservation secured. Code: ${r.reservationCode || "—"}`,
      date: r.reservedAt || r.paymentDate || r.updatedAt,
      status: "Reserved", statusColor: "#059669", statusBg: "#F0FDF4",
    });
  }

  if (r.status === "checked-in") {
    events.push({
      id: "checkin", icon: UserCheck, iconBg: "#EEF2FF", iconColor: "#6366F1",
      title: "Checked In",
      description: "You have officially moved into your room.",
      date: r.checkInDate || r.updatedAt,
      status: "Active", statusColor: "#6366F1", statusBg: "#EEF2FF",
    });
  }

  if (r.status === "checked-out") {
    events.push({
      id: "checkout", icon: Home, iconBg: "#F3F4F6", iconColor: "#6B7280",
      title: "Checked Out",
      description: "Your stay has ended.",
      date: r.checkOutDate || r.updatedAt,
      status: "Completed", statusColor: "#059669", statusBg: "#F0FDF4",
    });
  }

  if (r.status === "cancelled" || r.reservationStatus === "cancelled") {
    events.push({
      id: "cancelled", icon: XCircle, iconBg: "#FEF2F2", iconColor: "#DC2626",
      title: "Reservation Cancelled",
      description: "You cancelled your reservation",
      date: r.updatedAt, status: "Cancelled", statusColor: "#DC2626", statusBg: "#FEF2F2",
    });
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  return events;
};

/* ── Derive granular stage from reservation fields ── */
const deriveStage = (r) => {
  const s = r.status || r.reservationStatus || "pending";

  // Terminal states
  if (s === "cancelled")    return { color: "#EF4444", bg: "#FEF2F2", label: "Cancelled" };
  if (s === "checked-out") return { color: "#6B7280", bg: "#F3F4F6", label: "Completed" };
  if (s === "checked-in")  return { color: "#6366F1", bg: "#EEF2FF", label: "Checked In" };
  if (s === "reserved" || r.paymentStatus === "paid")
    return { color: "#059669", bg: "#D1FAE5", label: "Reserved" };

  // Step 4 — Payment
  if (s === "payment_pending")
    return { color: "#D97706", bg: "#FFFBEB", label: "Payment Pending" };

  // Step 2-3 — Visit pipeline
  if (s === "visit_approved" || r.scheduleApproved || r.visitApproved)
    return { color: "#7C3AED", bg: "#EDE9FE", label: "Visit Approved" };

  if (s === "visit_pending" || (r.visitDate && !r.scheduleRejected))
    return { color: "#2563EB", bg: "#DBEAFE", label: "Visit Pending" };

  if (r.scheduleRejected)
    return { color: "#DC2626", bg: "#FEF2F2", label: "Reschedule Needed" };

  // Step 1 — Room picked, not yet at visit stage
  return { color: "#0EA5E9", bg: "#E0F2FE", label: "Room Selected" };
};

/* ── Single accordion card ───────────────────────── */
const ReservationCard = ({ reservation, isOpen, onToggle }) => {
  const r = reservation;
  const room = r.roomId || {};
  const timeline = useMemo(() => buildTimeline(r), [r]);
  const statusCfg = deriveStage(r);
  const branchDisplay =
    room.branch === "gil-puyat" ? "Gil Puyat"
    : room.branch === "guadalupe" ? "Guadalupe"
    : room.branch || "—";
  const monthlyRent = r.monthlyRent || r.totalPrice || room.price || 0;

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${isOpen ? "var(--border-subtle, #CBD5E1)" : "var(--border-card, #E8EBF0)"}`,
      background: "var(--surface-card, #fff)",
      overflow: "hidden",
      boxShadow: isOpen ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}>

      {/* ── Header ── */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 20px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Room thumbnail */}
        <div style={{
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          background: "var(--surface-muted, #F1F5F9)", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {room.images?.[0]
            ? <img src={room.images[0]} alt={room.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            : <Home size={20} color="#94A3B8" />
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0A1628" }}>
              {room.name || "—"}
            </span>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94A3B8", letterSpacing: "0.03em" }}>
              {r.reservationCode || "—"}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
              color: statusCfg.color, background: statusCfg.bg,
            }}>
              {statusCfg.label}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
              <MapPin size={11} /> {branchDisplay}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
              <Bed size={11} /> {room.type || "—"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
              <Calendar size={11} /> {dayjs(r.createdAt).format("MMM D, YYYY")}
            </span>
          </div>
        </div>

        {/* Price + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {monthlyRent > 0 && (
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#E8734A" }}>
                ₱{monthlyRent.toLocaleString()}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "#94A3B8" }}>/month</span>
            </div>
          )}
          <ChevronDown size={16} color="#94A3B8" style={{
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }} />
        </div>
      </button>

      {/* ── Expanded Timeline ── */}
      {isOpen && (
        <div style={{ borderTop: "1px solid var(--border-subtle, #F1F5F9)", padding: "20px" }}>
          {timeline.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted, #94A3B8)", margin: 0 }}>No activity recorded yet.</p>
          ) : (
            <div style={{ position: "relative" }}>
              {timeline.map((ev, i) => (
                <div key={ev.id} style={{
                  display: "flex", gap: 12, position: "relative",
                  paddingBottom: i < timeline.length - 1 ? 20 : 0,
                }}>
                  {/* connector */}
                  {i < timeline.length - 1 && (
                    <div style={{
                      position: "absolute", left: 15, top: 32, bottom: 0,
                      width: 2, background: "var(--border-card, #E8EBF0)", borderRadius: 1,
                    }} />
                  )}
                  {/* icon */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: ev.iconBg, position: "relative", zIndex: 1,
                  }}>
                    <ev.icon size={15} color={ev.iconColor} />
                  </div>
                  {/* content */}
                  <div style={{
                    flex: 1, background: "var(--surface-muted, #FAFAFA)", borderRadius: 8,
                    border: "1px solid var(--border-subtle, #F1F5F9)", padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading, #0A1628)", margin: 0 }}>
                          {ev.title}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--text-secondary, #6B7280)", margin: "2px 0 0", lineHeight: 1.4 }}>
                          {ev.description}
                        </p>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        whiteSpace: "nowrap", background: ev.statusBg, color: ev.statusColor,
                      }}>
                        {ev.status}
                      </span>
                    </div>
                    <p style={{ display: "flex", alignItems: "center", fontSize: 11, color: "var(--text-muted, #9CA3AF)", margin: "8px 0 0" }}>
                      <Clock size={10} style={{ marginRight: 4 }} />
                      {fmtDateTime(ev.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Main Component ──────────────────────────────── */
const ActivityHistoryTab = ({ reservations = [] }) => {
  const sorted = useMemo(
    () => [...reservations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [reservations]
  );

  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    if (sorted.length > 0 && !openId) setOpenId(sorted[0]._id);
  }, [sorted]);

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  const IN_PROGRESS = ["pending", "visit_pending", "visit_approved", "payment_pending", "reserved"];
  const stats = useMemo(() => ({
    total:     reservations.length,
    active:    reservations.filter((r) => IN_PROGRESS.includes(r.status)).length,
    completed: reservations.filter((r) => r.status === "checked-out").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
  }), [reservations]);

  if (sorted.length === 0) {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 4px" }}>My History</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>Your reservation history and activity log</p>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", textAlign: "center", padding: "56px 24px",
          background: "var(--surface-card, #fff)", borderRadius: 10, border: "1px solid var(--border-card, #E8EBF0)",
        }}>
          <History size={48} color="#D1D5DB" />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-heading, #374151)", margin: "12px 0 4px" }}>
            No history yet
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", maxWidth: 280, textAlign: "center", margin: 0 }}>
            Your reservations and activity milestones will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 4px" }}>My History</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>Your reservation history and activity log</p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Reservations", value: stats.total,     color: "#0A1628", bg: "#F8FAFC" },
          { label: "In Progress",        value: stats.active,    color: "#FF8C42", bg: "#FFF7ED" },
          { label: "Completed",          value: stats.completed, color: "#059669", bg: "#F0FDF4" },
          { label: "Cancelled",          value: stats.cancelled, color: "#EF4444", bg: "#FEF2F2" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{
            flex: "1 1 120px", background: "var(--surface-card, " + bg + ")", borderRadius: 10,
            border: "1px solid var(--border-card, #E8EBF0)", padding: "14px 18px",
          }}>
            <p style={{ fontSize: 22, fontWeight: 700, color, margin: "0 0 2px" }}>{value}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted, #94A3B8)", fontWeight: 500, margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Accordion list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((r) => (
          <ReservationCard
            key={r._id}
            reservation={r}
            isOpen={openId === r._id}
            onToggle={() => toggle(r._id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ActivityHistoryTab;
