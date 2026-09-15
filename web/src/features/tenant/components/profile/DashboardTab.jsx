import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CreditCard, ChevronRight } from "lucide-react";
import ReservationDashboard from "../ReservationDashboard";
import ProfileCompletionCard from "./ProfileCompletionCard";
import ReservationSidePanel from "./ReservationSidePanel";



/**
 * DashboardTab — CSS Grid layout
 *
 * DESKTOP (>768px):
 * ┌── Profile Completion ──────────┐ ┌── Side Panel ─────────┐
 * │ ████░░░ 44% │ │ │
 * └────────────────────────────────┘ │ Reservation details │
 * ┌── Reservation Progress ────────┐ │ or empty state │
 * │ Stepper, action, footer │ │ (spans both rows) │
 * └────────────────────────────────┘ └────────────────────────┘
 *
 * MOBILE (≤768px): single column, side panel below reservation
 */
const DashboardTab = ({
 profileData,
 activeReservation,
 selectedReservation,
 visits,
 onGoToPersonal,
 onGoToReservation,
}) => {
 const navigate = useNavigate();
 const res = selectedReservation;
 const room = res?.roomId || {};
 const roomName = room.name;
 const hasReservation = Boolean(selectedReservation || activeReservation);
 const canViewTenantModules =
 profileData?.role === "tenant" || profileData?.tenantStatus === "active";
 const showBrowseRoomsShortcut = hasReservation;
 const showShortcutsGrid = showBrowseRoomsShortcut || canViewTenantModules;

 const [isDark, setIsDark] = useState(() => {
 const root = document.documentElement;
 return root.getAttribute("data-theme") === "dark" || root.classList.contains("dark");
 });

 useEffect(() => {
 const root = document.documentElement;
 const syncTheme = () => {
 setIsDark(root.getAttribute("data-theme") === "dark" || root.classList.contains("dark"));
 };

 const observer = new MutationObserver(syncTheme);
 observer.observe(root, {
 attributes: true,
 attributeFilter: ["data-theme", "class"],
 });

 syncTheme();
 return () => observer.disconnect();
 }, []);

 const shortcutCardStyle = {
 ...S.shortcutCardBase,
 background: isDark ? "var(--surface-card, #0F1B2D)" : "#FFFFFF",
 border: `1px solid ${isDark ? "var(--border-card, #2A3B57)" : "var(--border-card, #E2E8F0)"}`,
 };
 const shortcutTitleStyle = {
 ...S.shortcutTitle,
 color: isDark ? "#F8FAFC" : "var(--text-heading, #0F172A)",
 };
 const shortcutSubtitleStyle = {
 ...S.shortcutSubtitle,
 color: isDark ? "#9FB0C8" : "var(--text-secondary, #64748B)",
 };
 const shortcutChevronColor = isDark ? "#8FA4C2" : "#9CA3AF";

 return (
 <div style={S.root}>

 {/* ── Page header ─────────────────────────────────────── */}
 <div style={S.pageHeader}>
 <h2 style={{ ...S.pageTitle, color: isDark ? "#FFFFFF" : "#0F172A" }}>
 {activeReservation
 ? roomName
 ? `Reservation · ${roomName}`
 : "My Reservation"
 : "Dashboard"}
 </h2>
 <p style={{ ...S.pageSubtitle, color: isDark ? "#CBD5E1" : "#94A3B8" }}>
 {activeReservation
 ? "Track your progress and manage your reservation below."
 : "Browse available rooms to start your reservation."}
 </p>
 </div>



      {/* ── Main grid: left stacks, right spans ─────────────── */}
      <div className="dashboard-tab-grid">

        {/* Left column stack */}
        <div className="dashboard-tab-left-col">
          <ProfileCompletionCard
            profileData={profileData}
            onGoToPersonal={onGoToPersonal}
          />
          <ReservationDashboard
            reservation={selectedReservation}
            profileData={profileData}
            visits={visits}
            onGoToReservation={onGoToReservation}
          />
          {showShortcutsGrid && (
            <div style={S.shortcutsGrid}>
              {showBrowseRoomsShortcut && (
                <button
                  type="button"
                  onClick={() => navigate("/applicant/check-availability")}
                  style={shortcutCardStyle}
                >
                  <span style={S.shortcutIconWrap}>
                    <Search size={20} color={isDark ? "#F8FAFC" : "var(--text-heading, #0A1628)"} />
                  </span>
                  <span style={S.shortcutContent}>
                    <span style={shortcutTitleStyle}>Browse Rooms</span>
                    <span style={shortcutSubtitleStyle}>View available rooms</span>
                  </span>
                  <ChevronRight size={18} color={shortcutChevronColor} />
                </button>
              )}

              {canViewTenantModules && (
                <button
                  type="button"
                  onClick={() => navigate("/applicant/billing")}
                  style={shortcutCardStyle}
                >
                  <span style={S.shortcutIconWrap}>
                    <CreditCard size={20} color={isDark ? "#F8FAFC" : "var(--text-heading, #0A1628)"} />
                  </span>
                  <span style={S.shortcutContent}>
                    <span style={shortcutTitleStyle}>My Bills</span>
                    <span style={shortcutSubtitleStyle}>View billing details</span>
                  </span>
                  <ChevronRight size={18} color={shortcutChevronColor} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right col: spans both rows on desktop, below on mobile */}
        <div className="dashboard-tab-right-col">
          <ReservationSidePanel
            reservation={selectedReservation}
            profileData={profileData}
          />
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
  shortcutsGrid: {
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
 gap: 12,
 marginTop: 12,
 },
 shortcutCardBase: {
 borderRadius: 16,
 padding: "14px 16px",
 minHeight: 82,
 display: "flex",
 alignItems: "center",
 gap: 12,
 textAlign: "left",
 cursor: "pointer",
 boxShadow: "0 4px 14px rgba(0, 0, 0, 0.04)",
 transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease",
 },
  shortcutIconWrap: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "transparent",
  },
 shortcutContent: {
 minWidth: 0,
 display: "flex",
 flexDirection: "column",
 gap: 2,
 flex: 1,
 },
 shortcutTitle: {
 fontSize: 15,
 fontWeight: 600,
 color: "var(--text-heading, #0F172A)",
 whiteSpace: "nowrap",
 overflow: "hidden",
 textOverflow: "ellipsis",
 },
 shortcutSubtitle: {
 fontSize: 12,
 color: "var(--text-secondary, #64748B)",
 whiteSpace: "nowrap",
 overflow: "hidden",
 textOverflow: "ellipsis",
 },
};

export default DashboardTab;
