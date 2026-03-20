import React, { useState, useEffect } from "react";
import ReservationDashboard from "../ReservationDashboard";
import ProfileCompletionCard from "./ProfileCompletionCard";
import VisitPassCard3D from "./VisitPassCard3D";
import VisitPassEmpty from "./VisitPassEmpty";
import { Calendar, Clock, AlertCircle } from "lucide-react";

/* ── Status Banner — contextual info based on reservation state ── */
const StatusBanner = ({ reservation }) => {
  if (!reservation) return null;

  const status = reservation.reservationStatus || reservation.status;
  const isConfirmed = status === "reserved" || reservation.paymentStatus === "paid";
  const visitDate = reservation.visitDate;
  const visitApproved = reservation.visitApproved || reservation.scheduleApproved;
  const hasApplication = reservation.firstName && reservation.lastName && reservation.mobileNumber;


  // Visit scheduled but not approved — countdown
  if (visitDate && !visitApproved) {
    const daysUntil = Math.ceil((new Date(visitDate) - new Date()) / (1000 * 60 * 60 * 24));
    const dateStr = new Date(visitDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <div style={{ ...bannerBase, background: "rgba(37, 99, 235, 0.08)", borderColor: "rgba(37, 99, 235, 0.2)" }}>
        <Calendar size={18} color="#2563EB" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading, #1E40AF)" }}>
            {daysUntil > 0
              ? `Visit in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`
              : daysUntil === 0
                ? "Visit is today!"
                : `Visit was on ${dateStr}`}
          </span>
          <span style={{ fontSize: 12, color: "#3B82F6", marginLeft: 8 }}>
            {dateStr}{reservation.visitTime ? ` · ${reservation.visitTime}` : ""}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600, background: "rgba(217, 119, 6, 0.1)", padding: "3px 10px", borderRadius: 12 }}>
          Pending Approval
        </span>
      </div>
    );
  }

  // Visit approved, application not yet submitted
  if (visitApproved && !hasApplication) {
    return (
      <div style={{ ...bannerBase, background: "rgba(234, 88, 12, 0.08)", borderColor: "rgba(234, 88, 12, 0.2)" }}>
        <AlertCircle size={18} color="#EA580C" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#9A3412" }}>
          Visit approved — complete your application to continue
        </span>
      </div>
    );
  }

  // Application submitted, payment pending
  if (hasApplication && !isConfirmed) {
    return (
      <div style={{ ...bannerBase, background: "rgba(217, 119, 6, 0.08)", borderColor: "rgba(217, 119, 6, 0.2)" }}>
        <Clock size={18} color="#D97706" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>
          Application submitted — pay the reservation fee to secure your spot
        </span>
      </div>
    );
  }

  return null;
};

const bannerBase = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid",
  marginBottom: 16,
};

/**
 * DashboardTab — CSS Grid layout
 *
 *  DESKTOP (>768px):
 *  ┌── Profile Completion ──────────┐ ┌── Visit Pass ─────────┐
 *  │  ████░░░ 44%                   │ │                        │
 *  └────────────────────────────────┘ │  3D card or empty      │
 *  ┌── Reservation Progress ────────┐ │  (spans both rows)     │
 *  │  Stepper, action, footer       │ │                        │
 *  └────────────────────────────────┘ └────────────────────────┘
 *
 *  MOBILE (≤768px): single column, visit pass below reservation
 */
const DashboardTab = ({
  profileData,
  activeReservation,
  selectedReservation,
  visits,
  onGoToPersonal,
}) => {
  const res = selectedReservation;
  const room = res?.roomId || {};
  const roomName = room.name;

  // 3D card appears when a visit date+time exist (pending or approved)
  const showCard = !!(res?.visitDate && res?.visitTime);

  // Responsive: detect if we're on mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const gridStyle = isMobile
    ? S.gridMobile
    : S.grid;

  const rightColStyle = isMobile
    ? S.rightColMobile
    : S.rightCol;

  return (
    <div style={S.root}>

      {/* ── Page header ─────────────────────────────────────── */}
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>
          {activeReservation
            ? roomName
              ? `Reservation · ${roomName}`
              : "My Reservation"
            : "Dashboard"}
        </h2>
        <p style={S.pageSubtitle}>
          {activeReservation
            ? "Track your progress and manage your reservation below."
            : "Browse available rooms to start your reservation."}
        </p>
      </div>

      {/* ── Context-aware status banner ─────────────────────── */}
      <StatusBanner reservation={selectedReservation} />

      {/* ── Main grid: left stacks, right spans ─────────────── */}
      <div style={gridStyle}>

        {/* Left col, row 1: Profile Completion */}
        <div style={isMobile ? {} : S.leftTop}>
          <ProfileCompletionCard
            profileData={profileData}
            onGoToPersonal={onGoToPersonal}
          />
        </div>

        {/* Left col, row 2: Reservation progress */}
        <div style={isMobile ? {} : S.leftBottom}>
          <ReservationDashboard
            reservation={selectedReservation}
            visits={visits}
          />
        </div>

        {/* Right col: spans both rows on desktop, below on mobile */}
        <div style={rightColStyle}>
          {showCard
            ? <VisitPassCard3D reservation={selectedReservation} />
            : <VisitPassEmpty />
          }
        </div>

      </div>

    </div>
  );
};

/* ── styles ─────────────────────────────────────────────── */
const S = {
  root: {
    width: "100%",
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0F172A",
    margin: "0 0 2px",
    letterSpacing: "-0.01em",
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    margin: "0 0 16px",
  },

  /* Desktop grid — enforces same proportions regardless of content height */
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gridTemplateRows: "auto 1fr",
    gap: 16,
    minHeight: 440,   // ← locks right column height to match "active" state
  },
  leftTop: {
    gridColumn: 1,
    gridRow: 1,
  },
  leftBottom: {
    gridColumn: 1,
    gridRow: 2,
  },
  rightCol: {
    gridColumn: 2,
    gridRow: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
  },

  /* Mobile — single column, visit pass sits below */
  gridMobile: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  rightColMobile: {
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
  },
};

export default DashboardTab;
