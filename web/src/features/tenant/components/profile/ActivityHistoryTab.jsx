import React, { useMemo, useState, useEffect, useRef } from "react";
import {
 Calendar,
 CalendarDays,
 CreditCard,
 FileText,
 CheckCircle,
 CheckCircle2,
 Home,
 Building2,
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
import {
 canReservationAccessPayment,
 hasReservationStatus,
 readMoveInDate,
 readMoveOutDate,
} from "../../../../shared/utils/lifecycleNaming";
import Pagination from "../../../../shared/components/Pagination";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";
import { getRoomImages } from "../../pages/check-availability/checkAvailabilityConstants";
import RoomTransferRequestPanel from "./RoomTransferRequestPanel.jsx";
import { generateReservationCode } from "../../../../shared/utils/reservationCode";

/* ── Defensive Date helpers ──────────────────────── */
const isValidDate = (d) => {
  if (!d) return false;
  const time = new Date(d).getTime();
  return !Number.isNaN(time);
};

const fmtDate = (d) => {
  if (!isValidDate(d)) return "—";
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
};

const fmtDateTime = (d) => {
  if (!isValidDate(d)) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const formatMethod = (m) => {
 const map = {
 gcash: "GCash", maya: "Maya", paymaya: "PayMaya", grab_pay: "GrabPay",
 card: "Credit/Debit Card", bank: "Bank Transfer", paymongo: "PayMongo",
 cash: "Legacy payment method", online: "Online Payment (PayMongo)",
 };
 return map[m] || m || "Online";
};

const getViewingPreferenceLabel = (reservationLike) => {
 const preference =
 reservationLike?.viewingPreference ||
 (reservationLike?.viewingType === "virtual"
 ? "remote_2d_viewing"
 : reservationLike?.viewingType === "inperson"
 ? "physical_visit"
 : reservationLike?.isUrgentMoveIn
 ? "urgent_move_in_review"
 : null);

 switch (preference) {
 case "physical_visit":
  return "Physical Visit";
 case "remote_2d_viewing":
  return "2D Remote Viewing";
 case "urgent_move_in_review":
  return "Urgent Move-in Review";
 default:
  return "Viewing Preference";
 }
};

/* ── Build timeline from a single reservation ───── */
const buildTimeline = (r, direction = "desc") => {
  if (!r) return [];
  const events = [];

  if (r.createdAt) {
    events.push({
      id: "created", icon: Home, iconColor: "#0A1628",
      title: "Reservation Selection",
      description: `Room ${r.roomId?.name || r.roomId?.roomNumber || "—"} selected`,
      date: r.createdAt, status: "Initiated", statusColor: "#059669",
    });
  }

  if (r.visitHistory && r.visitHistory.length > 0) {
    r.visitHistory.forEach((attempt, idx) => {
      const suffix = r.visitHistory.length > 1 ? ` (Attempt ${idx + 1})` : "";
      const viewType =
        attempt.viewingType === "virtual" ? "2D Remote Viewing" : "Physical Visit";
      const visitDateStr = attempt.visitDate
        ? fmtDate(attempt.visitDate) + (attempt.visitTime ? ` at ${attempt.visitTime}` : "")
        : "Date not set";

      // Event 1: Tenant submitted the visit schedule request
      if (attempt.status !== "cancelled") {
        events.push({
          id: `visit-${idx}-scheduled`,
          icon: Calendar, iconColor: "#2563EB",
          title: `Physical Visit Request${suffix}`,
          description: `Requested ${viewType.toLowerCase()} schedule for ${visitDateStr}`,
          // scheduledAt = when the tenant submitted the schedule form (visitScheduledAt)
          date: attempt.scheduledAt,
          status: "Scheduled", statusColor: "#D97706",
        });
      }

      // Event 2: Admin outcome
      if (attempt.status === "approved") {
        events.push({
          id: `visit-${idx}-approved`,
          icon: CheckCircle, iconColor: "#059669",
          title: `Visit Schedule Confirmation${suffix}`,
          description: `Administration confirmed your ${viewType.toLowerCase()} schedule for ${visitDateStr}`,
          date: attempt.approvedAt,
          status: "Confirmed", statusColor: "#059669",
        });
      } else if (attempt.status === "rejected") {
        events.push({
          id: `visit-${idx}-rejected`,
          icon: XCircle, iconColor: "#DC2626",
          title: `Visit Schedule Update${suffix}`,
          description: attempt.rejectionReason || "The requested visit schedule is unavailable. Please select another date or time.",
          date: attempt.rejectedAt,
          status: "Reschedule Needed", statusColor: "#DC2626",
        });
      } else if (attempt.status === "cancelled") {
        events.push({
          id: `visit-${idx}-cancelled`,
          icon: XCircle, iconColor: "#6B7280",
          title: `Physical Visit Summary${suffix}`,
          description: `The scheduled ${viewType.toLowerCase()} on ${visitDateStr} was not conducted`,
          date: attempt.scheduledAt,
          status: "Skipped", statusColor: "#6B7280",
        });
      }
    });

    const terminalStatuses = ["cancelled", "moveOut", "archived"];
    if (
      r.visitDate &&
      !r.scheduleRejected &&
      !r.visitApproved &&
      !terminalStatuses.includes(r.status)
    ) {
      const attemptNum = r.visitHistory.length + 1;
      const visitDateStr = fmtDate(r.visitDate) + (r.visitTime ? ` at ${r.visitTime}` : "");
      events.push({
        id: "visit-current", icon: Calendar, iconColor: "#2563EB",
        title: attemptNum > 1 ? `Physical Visit Request (Attempt ${attemptNum})` : "Physical Visit Request",
        description: `Physical visit requested for ${visitDateStr}`,
        // visitScheduledAt = when the tenant submitted this schedule (not updatedAt/createdAt)
        date: r.visitScheduledAt,
        status: "Pending Review", statusColor: "#D97706",
      });
    }
  } else {
    if (r.viewingPreference || r.viewingType || r.isUrgentMoveIn) {
      events.push({
        id: "viewing-preference",
        icon: Calendar,
        iconColor: "#2563EB",
        title: "Viewing Preference Saved",
        description:
          getViewingPreferenceLabel(r) === "Physical Visit" && r.visitDate
            ? `Physical visit requested for ${fmtDate(r.visitDate)}${r.visitTime ? ` at ${r.visitTime}` : ""}`
            : getViewingPreferenceLabel(r),
        date: r.visitScheduledAt || r.updatedAt || r.createdAt,
        status: r.scheduleRejected ? "Reschedule Needed" : "Saved",
        statusColor: r.scheduleRejected ? "#DC2626" : "#2563EB",
      });
    }
    if (r.visitDate) {
      events.push({
        id: "visit-scheduled", icon: Calendar, iconColor: "#2563EB",
        title: "Physical Visit Request",
        description: `Physical visit requested for ${fmtDate(r.visitDate)}${r.visitTime ? ` at ${r.visitTime}` : ""}`,
        // visitScheduledAt = when the tenant submitted the schedule form
        date: r.visitScheduledAt || r.updatedAt || r.createdAt,
        status: r.scheduleRejected ? "Reschedule Needed" : r.scheduleApproved ? "Confirmed" : "Pending Review",
        statusColor: r.scheduleRejected ? "#DC2626" : r.scheduleApproved ? "#059669" : "#D97706",
      });
    }
    if (r.scheduleRejected && r.scheduleRejectedAt) {
      events.push({
        id: "schedule-rejected", icon: XCircle, iconColor: "#DC2626",
        title: "Visit Schedule Update",
        description: r.scheduleRejectionReason || "Administration requested a schedule adjustment.",
        date: r.scheduleRejectedAt,
        status: "Reschedule Needed", statusColor: "#DC2626",
      });
    }
  }

  // Visit approved by admin (non-history path)
  // Only show if visitHistory doesn't already contain an approved entry (avoids duplicate)
  const hasApprovedInHistory = r.visitHistory?.some((a) => a.status === "approved");
  if (r.scheduleApproved && r.scheduleApprovedAt && !hasApprovedInHistory) {
    events.push({
      id: "visit-approved", icon: CheckCircle, iconColor: "#059669",
      title: "Visit Schedule Confirmation",
      description: "Administration confirmed your physical visit schedule for viewing coordination.",
      date: r.scheduleApprovedAt,
      status: "Confirmed", statusColor: "#059669",
    });
  }

  if (r.firstName && r.lastName && r.agreedToCertification) {
    const appDate = r.applicationSubmittedAt || r.updatedAt || r.createdAt;
    events.push({
      id: "application", icon: FileText, iconColor: "#D97706",
      title: "Application Submission",
      description: "Personal details and required documents submitted for review.",
      date: appDate,
      status: "Submitted", statusColor: "#D97706",
    });
  }

  if (r.applicationReviewedAt && hasReservationStatus(r.status, "approved_for_payment")) {
    events.push({
      id: "application-approved",
      icon: ClipboardCheck,
      iconColor: "#059669",
      title: "Application Approval",
      description: "Administration approved your application and supporting documents. Payment access is now unlocked.",
      date: r.applicationReviewedAt,
      status: "Approved for Payment",
      statusColor: "#059669",
    });
  }

  if (r.applicationReviewedAt && hasReservationStatus(r.status, "needs_revision")) {
    events.push({
      id: "application-revision",
      icon: Clock,
      iconColor: "#D97706",
      title: "Application Revision Request",
      description: r.applicationReviewReason || "Administrative updates are requested for your application or supporting documents.",
      date: r.applicationReviewedAt,
      status: "Action Required",
      statusColor: "#D97706",
    });
  }

  if (r.applicationReviewedAt && hasReservationStatus(r.status, "rejected")) {
    events.push({
      id: "application-rejected",
      icon: XCircle,
      iconColor: "#DC2626",
      title: "Application Status Update",
      description: r.applicationReviewReason || "Regrettably, your application could not be approved at this time.",
      date: r.applicationReviewedAt,
      status: "Application Declined",
      statusColor: "#DC2626",
    });
  }

  if (r.paymentStatus === "paid" || r.paymentDate || r.status === "reserved") {
    events.push({
      id: "payment", icon: CreditCard, iconColor: "#059669",
      title: "Payment Confirmation",
      description: `PHP ${(r.reservationFeeAmount || 2000).toLocaleString("en-PH")} reservation fee received${r.paymentMethod ? ` via ${formatMethod(r.paymentMethod)}` : ""}. Thank you!`,
      date: r.paymentDate || r.reservedAt || r.updatedAt,
      status: "Payment Received", statusColor: "#059669",
    });
  }

  if (r.status === "reserved") {
    events.push({
      id: "reserved", icon: ClipboardCheck, iconColor: "#059669",
      title: "Reservation Confirmation",
      description: `Reservation secured under code ${r.reservationCode || "—"}.`,
      date: r.reservedAt || r.paymentDate || r.updatedAt,
      status: "Reservation Active", statusColor: "#059669",
    });
  }

  if (hasReservationStatus(r.status, "moveIn")) {
    events.push({
      id: "movein", icon: UserCheck, iconColor: "#059669",
      title: "Move-in Confirmation",
      description: "Welcome! You have officially moved into your room.",
      date: readMoveInDate(r) || r.updatedAt,
      status: "Official Tenant", statusColor: "#059669", statusBg: "#DCFCE7",
    });
  }

  if (hasReservationStatus(r.status, "moveOut")) {
    events.push({
      id: "moveout", icon: Home, iconColor: "#6B7280",
      title: "Move-out Summary",
      description: "Your stay at Lilycrest Dormitory has concluded.",
      date: readMoveOutDate(r) || r.updatedAt,
      status: "Stay Completed", statusColor: "#059669",
    });
  }

  if (r.status === "cancelled" || r.reservationStatus === "cancelled") {
    events.push({
      id: "cancelled", icon: XCircle, iconColor: "#DC2626",
      title: "Reservation Cancellation",
      description: r.cancellationReason || r.cancelReason ? `Reservation cancelled. Reason: ${r.cancellationReason || r.cancelReason}` : "Your reservation was successfully cancelled at your request.",
      date: r.cancelledAt || r.updatedAt,
      status: "Cancelled", statusColor: "#DC2626",
    });
  }

  // Logical step order for tie-breaking when timestamps are identical
  const stepOrder = {
    created: 0,
    "viewing-preference": 1, "visit-scheduled": 1, "visit-current": 1,
    "visit-approved": 2, "schedule-rejected": 2,
    application: 3,
    "application-approved": 4,
    "application-revision": 4,
    "application-rejected": 4,
    payment: 5,
    reserved: 6,
    movein: 7,
    moveout: 8,
    cancelled: 9,
  };
  const getOrder = (id) => {
    // Handle visit-history IDs like "visit-0-scheduled", "visit-1-approved"
    if (id.startsWith("visit-") && id !== "visit-current") {
      if (id.endsWith("-scheduled")) return 1;
      if (id.endsWith("-approved") || id.endsWith("-rejected") || id.endsWith("-cancelled")) return 2;
    }
    return stepOrder[id] ?? 99;
  };
  events.sort((a, b) => {
    const timeA = isValidDate(a.date) ? new Date(a.date).getTime() : 0;
    const timeB = isValidDate(b.date) ? new Date(b.date).getTime() : 0;
    const timeDiff = timeA - timeB;
    return timeDiff !== 0 ? timeDiff : getOrder(a.id) - getOrder(b.id);
  });
  return direction === "desc" ? [...events].reverse() : events;
};

/* ── Derive granular stage from reservation fields ── */
const deriveStage = (r) => {
  const s = r.status || r.reservationStatus || "pending";

  // Terminal states
  if (s === "cancelled") return { color: "#DC2626", label: "Cancelled" };
  if (hasReservationStatus(s, "moveOut")) return { color: "#6B7280", label: "Completed" };
  if (hasReservationStatus(s, "moveIn")) return { color: "#059669", bg: "#DCFCE7", label: "Move In" };
  if (s === "reserved" || r.paymentStatus === "paid")
    return { color: "#059669", label: "Reserved" };

  if (hasReservationStatus(s, "rejected"))
    return { color: "#DC2626", label: "Rejected" };

  if (hasReservationStatus(s, "needs_revision"))
    return { color: "#D97706", label: "Needs Revision" };

  if (hasReservationStatus(s, "pending_application_review"))
    return { color: "#D97706", label: "Pending Review" };

  if (canReservationAccessPayment(s))
    return { color: "#059669", label: "Approved for Payment" };

  // Step 4 — Payment
  if (s === "payment_pending")
    return { color: "#D97706", label: "Payment Pending" };

  // Step 2-3 — Visit pipeline
  if (s === "visit_approved" || r.scheduleApproved || r.visitApproved)
    return { color: "#059669", label: "Visit Approved" };

  if (s === "visit_pending" || (r.visitDate && !r.scheduleRejected))
    return { color: "#2563EB", label: "Visit Scheduled" };

  if (hasReservationStatus(s, "viewing_preference_selected") || r.viewingPreference)
    return { color: "#2563EB", label: "Viewing Preference Selected" };

  if (r.scheduleRejected)
    return { color: "#DC2626", label: "Reschedule Needed" };

  // Step 1 — Room picked, not yet at visit stage
  return { color: "#2563EB", label: "Room Selected" };
};

/* ── Single accordion card ───────────────────────── */
const ReservationCard = ({ reservation, isOpen, onToggle, timelineSort, onTimelineSortChange }) => {
 const r = reservation;
 const room = r.roomId || {};
 const timeline = useMemo(() => buildTimeline(r, timelineSort), [r, timelineSort]);
 const statusCfg = deriveStage(r);
 const branchDisplay =
 room.branch === "gil-puyat" ? "Gil Puyat"
 : room.branch === "guadalupe" ? "Guadalupe"
 : room.branch || "—";
 const monthlyRent = r.monthlyRent || r.totalPrice || room.price || 0;
 const reservationCodeDisplay = r.reservationCode || generateReservationCode(r._id || r.id);

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
 style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0, transition: "opacity 0.25s ease" }}
 onLoad={(e) => { e.currentTarget.style.opacity = "1"; }}
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
 {reservationCodeDisplay}
 </span>
 <span style={{
 display: "inline-flex",
 alignItems: "center",
 gap: 5,
 fontSize: 11,
 fontWeight: 600,
 color: statusCfg.color,
 background: "transparent",
 }}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: statusCfg.color }} />
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
 <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading, #0A1628)" }}>
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
 <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
 <label
 style={{
 display: "inline-flex",
 alignItems: "center",
 gap: 8,
 fontSize: 12,
 color: "var(--text-secondary, #6B7280)",
 }}
 >
 <span>Order</span>
 <select
 value={timelineSort}
 onChange={(e) => onTimelineSortChange(e.target.value)}
 style={{
 border: "1px solid var(--border-card, #E8EBF0)",
 borderRadius: 8,
 padding: "6px 10px",
 fontSize: 12,
 color: "var(--text-heading, #0A1628)",
 background: "var(--surface-card, #fff)",
 cursor: "pointer",
 }}
 >
 <option value="desc">Newest first</option>
 <option value="asc">Oldest first</option>
 </select>
 </label>
 </div>
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
    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--surface-card, #fff)",
    border: "1px solid var(--border-card, #E2E8F0)",
    position: "relative", zIndex: 1,
    color: ev.iconColor || "var(--text-secondary, #475569)",
  }}>
    <ev.icon size={15} strokeWidth={1.75} />
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
 display: "inline-flex",
 alignItems: "center",
 gap: 5,
 fontSize: 11,
 fontWeight: 600,
 whiteSpace: "nowrap",
 color: ev.statusColor,
 background: "transparent",
 }}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: ev.statusColor }} />
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

/* ── Skeleton Component ───────────────────────────── */
const ReservationCardSkeleton = () => (
  <div
    style={{
      borderRadius: 12,
      border: "1px solid var(--border-card, #E8EBF0)",
      background: "var(--surface-card, #fff)",
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}
    aria-hidden="true"
  >
    {/* Room thumbnail placeholder */}
    <SkeletonPulse width="48px" height="48px" borderRadius="10px" />

    {/* Info lines placeholder */}
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SkeletonPulse width="120px" height="15px" borderRadius="4px" />
        <SkeletonPulse width="75px" height="13px" borderRadius="4px" />
        <SkeletonPulse width="80px" height="18px" borderRadius="20px" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SkeletonPulse width="75px" height="12px" borderRadius="4px" />
        <SkeletonPulse width="95px" height="12px" borderRadius="4px" />
        <SkeletonPulse width="85px" height="12px" borderRadius="4px" />
      </div>
    </div>

    {/* Price + chevron placeholder */}
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ textAlign: "right" }}>
        <SkeletonPulse width="65px" height="15px" borderRadius="4px" style={{ marginBottom: 4 }} />
        <SkeletonPulse width="40px" height="10px" borderRadius="4px" style={{ marginLeft: "auto" }} />
      </div>
      <SkeletonPulse width="16px" height="16px" borderRadius="4px" />
    </div>
  </div>
);

/* ── Current Stay Card ───────────────────────────── */
const CurrentStayCard = ({ reservation }) => {
  const room = reservation?.roomId || {};
  const branchDisplay =
    room.branch === "gil-puyat" ? "Gil Puyat"
    : room.branch === "guadalupe" ? "Guadalupe"
    : room.branch || "—";

  const storedImages = Array.isArray(room.images)
    ? room.images.filter((img) => typeof img === "string" && img.trim())
    : [];
  const roomImage =
    storedImages.length > 0
      ? storedImages[0]
      : room.type && room.branch
      ? getRoomImages(room.type, room.branch)[0]
      : null;

  const monthlyRent = reservation?.monthlyRent || reservation?.totalPrice || room.price || 0;
  const moveInDate = readMoveInDate(reservation);

  return (
    <div
      style={{
        backgroundColor: "var(--surface-card, #fff)",
        borderRadius: 12,
        border: "1px solid var(--border-card, #E8EBF0)",
        padding: "20px 24px",
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 16,
        transition: "box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--surface-muted, #F1F5F9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {roomImage ? (
          <img
            src={roomImage}
            alt={room.name || "Room"}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <Home size={22} color="var(--text-muted, #94A3B8)" />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading, #0A1628)" }}>
            {room.name || (room.roomNumber ? `Room ${room.roomNumber}` : "Active Room")}
          </span>
          {(reservation?.reservationCode || reservation?._id) && (
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted, #94A3B8)", letterSpacing: "0.03em" }}>
              {reservation.reservationCode || generateReservationCode(reservation._id || reservation.id)}
            </span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: "#059669",
              background: "transparent",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#059669" }} />
            Official Tenant
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary, #64748B)" }}>
            <MapPin size={12} /> {branchDisplay}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary, #64748B)" }}>
            <Bed size={12} /> {room.type || "—"}
          </span>
          {moveInDate && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary, #64748B)" }}>
              <Calendar size={12} /> Moved in {fmtDate(moveInDate)}
            </span>
          )}
        </div>
      </div>

      {monthlyRent > 0 && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading, #0A1628)" }}>
            ₱{monthlyRent.toLocaleString()}
          </span>
          <span style={{ display: "block", fontSize: 11, color: "var(--text-muted, #94A3B8)", marginTop: 2 }}>
            /month
          </span>
        </div>
      )}
    </div>
  );
};

/* ── Main Component ──────────────────────────────── */
const ActivityHistoryTab = ({ reservations = [], isLoading = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [openId, setOpenId] = useState(null);
  const [timelineSort, setTimelineSort] = useState("desc");
  const [historyFilter, setHistoryFilter] = useState("all");
  const listTopRef = useRef(null);

  const sorted = useMemo(
    () => [...reservations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [reservations]
  );

  const filterCounts = useMemo(() => {
    const completed = sorted.filter((r) => hasReservationStatus(r.status, "moveOut")).length;
    const cancelled = sorted.filter(
      (r) =>
        hasReservationStatus(r.status, "cancelled", "rejected") ||
        r.reservationStatus === "cancelled" ||
        r.reservationStatus === "rejected",
    ).length;
    return { all: sorted.length, completed, cancelled };
  }, [sorted]);

  const filteredReservations = useMemo(() => {
    if (historyFilter === "completed") {
      return sorted.filter((r) => hasReservationStatus(r.status, "moveOut"));
    }
    if (historyFilter === "cancelled") {
      return sorted.filter(
        (r) =>
          hasReservationStatus(r.status, "cancelled", "rejected") ||
          r.reservationStatus === "cancelled" ||
          r.reservationStatus === "rejected",
      );
    }
    return sorted;
  }, [sorted, historyFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReservations.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedReservations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReservations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReservations, currentPage, itemsPerPage]);

  useEffect(() => {
    if (paginatedReservations.length > 0) {
      setOpenId((prev) => {
        const exists = paginatedReservations.some((r) => r._id === prev);
        return exists ? prev : paginatedReservations[0]._id;
      });
    } else {
      setOpenId(null);
    }
  }, [currentPage, itemsPerPage, filteredReservations]);

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    if (listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleLimitChange = (newLimit) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);
  };

  const handleFilterChange = (filter) => {
    setHistoryFilter(filter);
    setCurrentPage(1);
  };

  const IN_PROGRESS = [
    "pending",
    "viewing_preference_selected",
    "visit_pending",
    "visit_approved",
    "pending_application_review",
    "needs_revision",
    "approved_for_payment",
    "payment_pending",
    "reserved",
  ];

  const activeStay = useMemo(
    () => reservations.find((r) => hasReservationStatus(r.status, "moveIn")),
    [reservations],
  );

  const tenantStats = useMemo(() => {
    const activeBooking = reservations.find((r) => IN_PROGRESS.includes(r.status));

    let activeStayValue = "No Active Stay";
    let activeStaySubtext = "No active booking";
    let hasActive = false;

    if (activeStay) {
      hasActive = true;
      activeStayValue =
        activeStay.roomId?.name ||
        (activeStay.roomId?.roomNumber ? `Room ${activeStay.roomId.roomNumber}` : "Move In");
      activeStaySubtext = "Active Tenant";
    } else if (activeBooking) {
      hasActive = true;
      activeStayValue =
        activeBooking.roomId?.name ||
        (activeBooking.roomId?.roomNumber ? `Room ${activeBooking.roomId.roomNumber}` : "In Progress");
      activeStaySubtext = deriveStage(activeBooking).label || "Application Active";
    }

    const totalVisits = reservations.reduce((acc, r) => {
      const historyCount = Array.isArray(r.visitHistory) ? r.visitHistory.length : 0;
      const directVisit = r.visitDate && !historyCount ? 1 : 0;
      return acc + historyCount + directVisit;
    }, 0);

    const completedStays = reservations.filter((r) => hasReservationStatus(r.status, "moveOut")).length;

    const earliestDate = reservations.reduce((earliest, r) => {
      if (!r.createdAt) return earliest;
      const d = new Date(r.createdAt);
      return !earliest || d < earliest ? d : earliest;
    }, null);
    const memberSince = earliestDate ? dayjs(earliestDate).format("MMM YYYY") : "Recent";

    return {
      activeStayValue,
      activeStaySubtext,
      hasActive,
      totalVisits,
      completedStays,
      memberSince,
    };
  }, [reservations, activeStay]);

  if (isLoading && sorted.length === 0) {
    return (
      <div style={{ width: "100%" }} aria-busy="true" aria-label="Loading activity and history">
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 4px" }}>
            Activity & History
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>
            Your current stay details, room transfer options, and reservation activity log
          </p>
        </div>

        {/* Stats row skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: "var(--surface-card, #fff)",
                borderRadius: 12,
                border: "1px solid var(--border-card, #E8EBF0)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SkeletonPulse width="70px" height="12px" borderRadius="4px" />
                <SkeletonPulse width="16px" height="16px" borderRadius="4px" />
              </div>
              <SkeletonPulse width="100px" height="20px" borderRadius="4px" />
              <SkeletonPulse width="80px" height="10px" borderRadius="4px" />
            </div>
          ))}
        </div>

        {/* Accordion list skeleton */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <ReservationCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 4px" }}>
            Activity & History
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>
            Your current stay details, room transfer options, and reservation activity log
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "56px 24px",
            background: "var(--surface-card, #fff)",
            borderRadius: 10,
            border: "1px solid var(--border-card, #E8EBF0)",
          }}
        >
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
    <div ref={listTopRef} style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 4px" }}>
          Activity & History
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>
          Your current stay details, room transfer options, and reservation activity log
        </p>
      </div>

      {/* Tenant-centric KPI summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          {
            icon: Building2,
            label: "Active Stay",
            value: tenantStats.activeStayValue,
            subtext: tenantStats.activeStaySubtext,
            iconColor: tenantStats.hasActive ? "#059669" : "#64748B",
          },
          {
            icon: CalendarDays,
            label: "Room Viewings",
            value: tenantStats.totalVisits,
            subtext: tenantStats.totalVisits === 1 ? "1 viewing booked" : `${tenantStats.totalVisits} viewings booked`,
            iconColor: "#2563EB",
          },
          {
            icon: CheckCircle2,
            label: "Completed Stays",
            value: tenantStats.completedStays,
            subtext: tenantStats.completedStays === 1 ? "1 past stay" : `${tenantStats.completedStays} past stays`,
            iconColor: "#059669",
          },
          {
            icon: Clock,
            label: "Member Since",
            value: tenantStats.memberSince,
            subtext: "First activity logged",
            iconColor: "#64748B",
          },
        ].map(({ icon: Icon, label, value, subtext, iconColor }) => (
          <div
            key={label}
            style={{
              background: "var(--surface-card, #fff)",
              borderRadius: 12,
              border: "1px solid var(--border-card, #E8EBF0)",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 8,
              cursor: "default",
              transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(0, 0, 0, 0.05)";
              e.currentTarget.style.borderColor = "var(--border-subtle, #CBD5E1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "var(--border-card, #E8EBF0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted, #94A3B8)", fontWeight: 600, letterSpacing: "0.01em" }}>
                {label}
              </span>
              <Icon size={17} strokeWidth={1.8} color={iconColor} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-heading, #0A1628)",
                  margin: "0 0 2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={typeof value === "string" ? value : undefined}
              >
                {value}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted, #94A3B8)", margin: 0, fontWeight: 500 }}>
                {subtext}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Current Stay & Room Transfer Request Panel */}
      {activeStay && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: 0 }}>
              Current Stay
            </h2>
            <span style={{ fontSize: 12, color: "var(--text-secondary, #64748B)" }}>
              Active Room Assignment
            </span>
          </div>
          <CurrentStayCard reservation={activeStay} />
          <RoomTransferRequestPanel hasCurrentStay={Boolean(activeStay)} currentStay={activeStay} />
        </div>
      )}

      {/* Complete Activity & Reservation History Section */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: "0 0 2px" }}>
              Activity Timeline
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted, #9CA3AF)", margin: 0 }}>
              Chronological log of your bookings, viewing schedules, and milestones
            </p>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-muted, #F8FAFC)", padding: 4, borderRadius: 8, border: "1px solid var(--border-card, #E2E8F0)" }}>
            {[
              { key: "all", label: "All Records", count: filterCounts.all },
              { key: "completed", label: "Completed Stays", count: filterCounts.completed },
              { key: "cancelled", label: "Cancelled", count: filterCounts.cancelled },
            ].map(({ key, label, count }) => {
              const isSelected = historyFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleFilterChange(key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? "var(--text-heading, #0A1628)" : "var(--text-secondary, #64748B)",
                    background: isSelected ? "var(--surface-card, #fff)" : "transparent",
                    border: isSelected ? "1px solid var(--border-subtle, #CBD5E1)" : "1px solid transparent",
                    boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "0 5px",
                      borderRadius: 10,
                      background: isSelected ? "#F1F5F9" : "#E2E8F0",
                      color: "var(--text-secondary, #475569)",
                      fontWeight: 600,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {paginatedReservations.length === 0 ? (
          <div
            style={{
              padding: "36px 20px",
              textAlign: "center",
              background: "var(--surface-card, #fff)",
              borderRadius: 10,
              border: "1px solid var(--border-card, #E8EBF0)",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-muted, #94A3B8)", margin: 0 }}>
              No {historyFilter === "all" ? "" : historyFilter} records found.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paginatedReservations.map((r) => (
              <ReservationCard
                key={r._id}
                reservation={r}
                isOpen={openId === r._id}
                onToggle={() => toggle(r._id)}
                timelineSort={timelineSort}
                onTimelineSortChange={setTimelineSort}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredReservations.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredReservations.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
          pageSizeOptions={[10, 20, 50]}
          itemLabel="reservations"
          variant="numbered"
          className="mt-6 pt-4 border-t border-border"
        />
      )}
    </div>
  );
};

export default ActivityHistoryTab;
