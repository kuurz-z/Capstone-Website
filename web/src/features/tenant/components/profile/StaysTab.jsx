/**
 * StaysTab — Room stay history for the applicant profile.
 *
 * Uses the existing useMyStays hook which calls GET /users/my-stays.
 * Shows current stays, past stays, and summary statistics.
 */

import React from "react";
import {
  Home,
  Calendar,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Bed,
} from "lucide-react";
import { useMyStays } from "../../../../shared/hooks/queries/useUsers";
import dayjs from "dayjs";

// Shared empty state style — matches My Bills
const emptyStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "56px 24px",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #E8EBF0",
};

// ── Stay Card ───────────────────────────────────────────────
const StayCard = ({ stay, isCurrent }) => {
  const room = stay.roomId || {};
  const status = stay.status || stay.reservationStatus || "unknown";

  const statusConfig = {
    "reserved": { color: "#10B981", bg: "#ECFDF5", label: "Reserved" },
    "checked-in": { color: "#6366F1", bg: "#EEF2FF", label: "Checked In" },
    "checked-out": { color: "#6B7280", bg: "#F3F4F6", label: "Completed" },
    "cancelled": { color: "#EF4444", bg: "#FEF2F2", label: "Cancelled" },
  };
  const { color, bg, label } = statusConfig[status] || statusConfig["checked-out"];

  const branchDisplay =
    room.branch === "gil-puyat" ? "Gil Puyat"
      : room.branch === "guadalupe" ? "Guadalupe"
        : room.branch || "—";

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        border: "1px solid #E8EBF0",
        padding: "20px 24px",
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Room image or icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          overflow: "hidden",
          flexShrink: 0,
          background: "#F1F5F9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {room.images?.[0] ? (
          <img
            src={room.images[0]}
            alt={room.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.innerHTML =
                `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
            }}
          />
        ) : (
          <Home size={22} style={{ color: "#94A3B8" }} />
        )}
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0A1628" }}>
            {room.name || "Room"}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              backgroundColor: bg,
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            {label}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
            <MapPin size={12} /> {branchDisplay}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
            <Bed size={12} /> {room.type || "—"}
          </span>
          {stay.createdAt && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
              <Calendar size={12} /> {dayjs(stay.createdAt).format("MMM D, YYYY")}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#E8734A" }}>
          ₱{(stay.monthlyRent || stay.totalPrice || room.price || 0).toLocaleString()}
        </span>
        <span style={{ display: "block", fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
          /month
        </span>
      </div>
    </div>
  );
};

// ── Stat Card ───────────────────────────────────────────────
const StatCard = ({ icon: Icon, iconColor, iconBg, label, value }) => (
  <div
    style={{
      backgroundColor: "#fff",
      borderRadius: 12,
      border: "1px solid #E8EBF0",
      padding: "20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}
  >
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        backgroundColor: iconBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={20} style={{ color: iconColor }} />
    </div>
    <div>
      <p style={{ fontSize: 20, fontWeight: 700, color: "#0A1628", margin: 0 }}>{value}</p>
      <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0", fontWeight: 500 }}>{label}</p>
    </div>
  </div>
);

// ── Main Component ──────────────────────────────────────────
const StaysTab = () => {
  const { data, isLoading, error } = useMyStays(true);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>My Stays</h1>
          <p style={{ fontSize: 14, color: "#94A3B8", margin: 0 }}>Loading your stay history...</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div className="animate-spin" style={{ width: 24, height: 24, border: "3px solid #E8EBF0", borderTop: "3px solid #E8734A", borderRadius: "50%" }} />
        </div>
      </div>
    );
  }

  const { currentStays = [], pastStays = [], stats = {} } = data || {};
  const hasAnyStays = currentStays.length > 0 || pastStays.length > 0;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: "0 0 4px" }}>
          My Stays
        </h1>
        <p style={{ fontSize: 14, color: "#94A3B8", margin: 0 }}>
          Your room history and stay statistics
        </p>
      </div>

      {/* Stats */}
      {hasAnyStays && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard icon={Home} iconColor="#FF8C42" iconBg="#FFF7ED" label="Total Stays" value={stats.totalStays || 0} />
          <StatCard icon={CheckCircle} iconColor="#10B981" iconBg="#ECFDF5" label="Completed" value={stats.completedStays || 0} />
          <StatCard icon={Clock} iconColor="#6366F1" iconBg="#EEF2FF" label="Total Nights" value={stats.totalNights || 0} />
        </div>
      )}

      {/* Current Stays */}
      {currentStays.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
            Current Stay
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentStays.map((stay) => (
              <StayCard key={stay._id} stay={stay} isCurrent />
            ))}
          </div>
        </div>
      )}

      {/* Past Stays */}
      {pastStays.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
            Past Stays
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pastStays.map((stay) => (
              <StayCard key={stay._id} stay={stay} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !hasAnyStays && (
        <div style={emptyStyle}>
          <Home size={48} color="#D1D5DB" />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>No Stay History</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 280, margin: 0 }}>
            Your room assignments will appear here once you've stayed at Lilycrest.
          </p>
        </div>
      )}

      {/* Empty state — only when no error */}
      {!error && !hasAnyStays && (
        <div style={emptyStyle}>
          <Home size={48} color="#D1D5DB" />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>No Stay History</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 280, margin: 0 }}>
            Your room assignments will appear here once you've stayed at Lilycrest.
          </p>
        </div>
      )}
    </div>
  );
};

export default StaysTab;
