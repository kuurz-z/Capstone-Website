import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Bed, ArrowRight } from "lucide-react";
import ReservationDashboard from "../ReservationDashboard";

/**
 * Dashboard tab content for ProfilePage.
 * Shows welcome banner, quick action cards, and ReservationDashboard.
 */
const DashboardTab = ({
  profileData,
  activeReservation,
  selectedReservation,
  visits,
  nextAction,
}) => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl">
      {/* Welcome Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0C375F 0%, #1E5A8E 100%)",
          borderRadius: "16px",
          padding: "28px 32px",
          marginBottom: "28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-30px",
            right: "-30px",
            width: "160px",
            height: "160px",
            borderRadius: "50%",
            background: "rgba(231,113,15,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20px",
            right: "60px",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
          }}
        />
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#fff",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          Welcome back, {profileData.firstName || "there"}!
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.7)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {activeReservation
            ? "Your reservation is in progress. Continue where you left off."
            : "Start your reservation by browsing available rooms."}
        </p>
      </div>

      {/* Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <QuickActionCard
          to="/tenant/check-availability"
          icon={<Bed className="w-5 h-5" style={{ color: "#E7710F" }} />}
          iconBg="#FFF7ED"
          hoverColor="#E7710F"
          title="Browse Rooms"
          subtitle="View available rooms"
        />

        {activeReservation ? (
          <QuickActionButton
            onClick={() => {
              if (nextAction.reservationId && nextAction.step) {
                navigate("/tenant/reservation-flow", {
                  state: {
                    reservationId: nextAction.reservationId,
                    continueFlow: true,
                    step: nextAction.step,
                  },
                });
              }
            }}
            icon={
              <ArrowRight className="w-5 h-5" style={{ color: "#10B981" }} />
            }
            iconBg="#ECFDF5"
            hoverColor="#10B981"
            title={nextAction.title}
            subtitle="Continue your application"
          />
        ) : (
          <QuickActionButton
            onClick={() =>
              navigate("/tenant/profile", { state: { tab: "personal" } })
            }
            icon={<User className="w-5 h-5" style={{ color: "#6366F1" }} />}
            iconBg="#EEF2FF"
            hoverColor="#6366F1"
            title="Complete Profile"
            subtitle="Update your info"
          />
        )}
      </div>

      {/* Reservation Dashboard */}
      <ReservationDashboard reservation={selectedReservation} visits={visits} />
    </div>
  );
};

// ─── Shared quick-action primitives ──────────────────────────

const cardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "18px 20px",
  backgroundColor: "#fff",
  borderRadius: "12px",
  border: "1px solid #E8EBF0",
  textDecoration: "none",
  textAlign: "left",
  cursor: "pointer",
  transition: "all 0.2s",
};

const hoverIn = (e, color) => {
  e.currentTarget.style.borderColor = color;
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
};

const hoverOut = (e) => {
  e.currentTarget.style.borderColor = "#E8EBF0";
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
};

const IconBox = ({ bg, children }) => (
  <div
    style={{
      width: "42px",
      height: "42px",
      borderRadius: "10px",
      backgroundColor: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

const QuickActionCard = ({ to, icon, iconBg, hoverColor, title, subtitle }) => (
  <Link
    to={to}
    style={cardStyle}
    onMouseEnter={(e) => hoverIn(e, hoverColor)}
    onMouseLeave={hoverOut}
  >
    <IconBox bg={iconBg}>{icon}</IconBox>
    <div>
      <p
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#1F2937",
          margin: 0,
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: "12px", color: "#94A3B8", margin: "2px 0 0" }}>
        {subtitle}
      </p>
    </div>
  </Link>
);

const QuickActionButton = ({
  onClick,
  icon,
  iconBg,
  hoverColor,
  title,
  subtitle,
}) => (
  <button
    onClick={onClick}
    style={cardStyle}
    onMouseEnter={(e) => hoverIn(e, hoverColor)}
    onMouseLeave={hoverOut}
  >
    <IconBox bg={iconBg}>{icon}</IconBox>
    <div>
      <p
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#1F2937",
          margin: 0,
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: "12px", color: "#94A3B8", margin: "2px 0 0" }}>
        {subtitle}
      </p>
    </div>
  </button>
);

export default DashboardTab;
