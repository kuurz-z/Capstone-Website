import React, { useState, useEffect } from "react";
import ReservationDashboard from "../ReservationDashboard";
import ProfileCompletionCard from "./ProfileCompletionCard";
import ReservationSidePanel from "./ReservationSidePanel";



/**
 * DashboardTab — CSS Grid layout
 *
 *  DESKTOP (>768px):
 *  ┌── Profile Completion ──────────┐ ┌── Side Panel ─────────┐
 *  │  ████░░░ 44%                   │ │                        │
 *  └────────────────────────────────┘ │  Reservation details   │
 *  ┌── Reservation Progress ────────┐ │  or empty state        │
 *  │  Stepper, action, footer       │ │  (spans both rows)     │
 *  └────────────────────────────────┘ └────────────────────────┘
 *
 *  MOBILE (≤768px): single column, side panel below reservation
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
          <ReservationSidePanel reservation={selectedReservation} />
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

  /* Desktop grid */
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gridTemplateRows: "auto 1fr",
    gap: 16,
    minHeight: 440,
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

  /* Mobile — single column */
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
