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
 onGoToBilling,
}) => {
 const navigate = useNavigate();
 const res = selectedReservation;
 const room = res?.roomId || {};
 const roomName = room.name;

 // Responsive: detect if we're on mobile
 const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
 const [isDark, setIsDark] = useState(() => {
 const root = document.documentElement;
 return root.getAttribute("data-theme") === "dark" || root.classList.contains("dark");
 });

 useEffect(() => {
 const handler = () => setIsMobile(window.innerWidth <= 768);
 window.addEventListener("resize", handler);
 return () => window.removeEventListener("resize", handler);
 }, []);

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

 const gridStyle = isMobile
 ? S.gridMobile
 : S.grid;

 const rightColStyle = isMobile
 ? S.rightColMobile
 : S.rightCol;
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
 <div style={S.shortcutsGrid}>
 <button
 type="button"
 onClick={() => navigate("/applicant/check-availability")}
 style={shortcutCardStyle}
 >
 <span
 style={{
 ...S.shortcutIconWrap,
 background: isDark ? "rgba(212, 175, 55, 0.22)" : "rgba(212, 175, 55, 0.14)",
 }}
 >
 <Search size={19} color="var(--color-primary, #D4AF37)" />
 </span>
 <span style={S.shortcutContent}>
 <span style={shortcutTitleStyle}>Browse Rooms</span>
 <span style={shortcutSubtitleStyle}>View available rooms</span>
 </span>
 <ChevronRight size={18} color={shortcutChevronColor} />
 </button>

 <button
 type="button"
 onClick={() => {
 if (onGoToBilling) {
 onGoToBilling();
 return;
 }
 navigate("/applicant/profile", { state: { tab: "billing" } });
 }}
 style={shortcutCardStyle}
 >
 <span
 style={{
 ...S.shortcutIconWrap,
 background: isDark ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.16)",
 }}
 >
 <CreditCard size={18} color={isDark ? "#34D399" : "#059669"} />
 </span>
 <span style={S.shortcutContent}>
 <span style={shortcutTitleStyle}>My Bills</span>
 <span style={shortcutSubtitleStyle}>View billing details</span>
 </span>
 <ChevronRight size={18} color={shortcutChevronColor} />
 </button>
 </div>
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
 transition: "transform 0.16s ease, box-shadow 0.16s ease",
 },
 shortcutIconWrap: {
 width: 46,
 height: 46,
 borderRadius: 14,
 display: "inline-flex",
 alignItems: "center",
 justifyContent: "center",
 flexShrink: 0,
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
