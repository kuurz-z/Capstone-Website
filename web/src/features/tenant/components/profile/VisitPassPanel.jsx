import React, { useState, useEffect } from "react";
import { Calendar, Clock, MapPin, QrCode, X } from "lucide-react";

/* ─── helpers ──────────────────────────────────────────────── */
// Safely parse a date string that may be a bare date (YYYY-MM-DD) or
// a full ISO string from the DB (2026-03-27T00:00:00.000Z).
// Parsing at noon avoids timezone-driven day shifts.
function parseSafeDate(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).split("T")[0]; // strip time if present
  const d = new Date(clean + "T12:00:00");
  return isNaN(d) ? null : d;
}

function fmtDateFull(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return "N/A";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isToday(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isTomorrow(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  );
}

/* ─── VisitPassPanel ────────────────────────────────────────── */
/**
 * Shown on the Dashboard tab when a visit is scheduled but not yet approved.
 * Provides both a compact card and a full-screen "Show Pass" mode for
 * on-site verification at the dormitory front desk.
 */
const VisitPassPanel = ({ reservation }) => {
  const [showPass, setShowPass] = useState(false);

  // Escape key exits full-screen pass
  useEffect(() => {
    if (!showPass) return;
    const handler = (e) => { if (e.key === "Escape") setShowPass(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showPass]);

  // Only show when visit is scheduled and not yet approved
  if (!reservation) return null;
  const { visitDate, visitTime, visitApproved, visitCode, reservationCode, roomId } = reservation;
  if (!visitDate || !visitTime || visitApproved) return null;

  const dateLabel = isToday(visitDate)
    ? "Today"
    : isTomorrow(visitDate)
    ? "Tomorrow"
    : null;

  const roomName = roomId?.name || roomId?.roomNumber || "N/A";
  const branch = roomId?.branch || "N/A";

  return (
    <>
      {/* ── Compact card ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0F2A4A 0%, #1A4A7A 100%)",
          borderRadius: "16px",
          padding: "20px 24px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          boxShadow: "0 4px 20px rgba(10,22,40,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background decoration */}
        <div style={{
          position: "absolute", top: "-40px", right: "-40px",
          width: "150px", height: "150px", borderRadius: "50%",
          background: "rgba(255,140,66,0.08)",
        }} />

        {/* Left: date + time info */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1 }}>
          {/* Icon block */}
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "rgba(255,140,66,0.15)", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Calendar size={22} color="#FF8C42" />
          </div>

          <div>
            {/* Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                color: "#34D399", textTransform: "uppercase",
                background: "rgba(52,211,153,0.12)", padding: "2px 8px",
                borderRadius: "20px",
              }}>
                Upcoming Visit
              </span>
              {dateLabel && (
                <span style={{
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
                  color: "#FF8C42", textTransform: "uppercase",
                  background: "rgba(255,140,66,0.12)", padding: "2px 8px",
                  borderRadius: "20px",
                }}>
                  {dateLabel}
                </span>
              )}
            </div>

            {/* Date */}
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "2px" }}>
              {fmtDateFull(visitDate + "T00:00:00")}
            </div>

            {/* Time + room */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#FF8C42", fontWeight: 600 }}>
                <Clock size={12} />{visitTime}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "rgba(255,255,255,0.55)" }}>
                <MapPin size={12} />{roomName} · {branch}
              </span>
            </div>
          </div>
        </div>

        {/* Right: codes + button */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", zIndex: 1 }}>
          <div style={{ textAlign: "right" }}>
            {/* User visit code — primary */}
            {visitCode && (
              <div style={{ marginBottom: reservationCode ? "6px" : 0 }}>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "1px" }}>
                  Visit Code
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#FF8C42", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                  {visitCode}
                </div>
              </div>
            )}
            {/* System reservation code — secondary, only if already generated */}
            {reservationCode && (
              <div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "1px" }}>
                  Reservation
                </div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                  {reservationCode}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowPass(true)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "10px 16px", borderRadius: "10px",
              background: "#FF8C42", border: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: 600, color: "#fff",
              whiteSpace: "nowrap", transition: "all 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#e87b35"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#FF8C42"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <QrCode size={14} />
            Show Pass
          </button>
        </div>
      </div>

      {/* ── Full-screen pass modal ── */}
      {showPass && (
        <FullScreenPass
          visitDate={visitDate}
          visitTime={visitTime}
          visitCode={visitCode}
          reservationCode={reservationCode}
          roomName={roomName}
          branch={branch}
          onClose={() => setShowPass(false)}
        />
      )}
    </>
  );
};

/* ─── FullScreenPass ─────────────────────────────────────────── */
function FullScreenPass({ visitDate, visitTime, visitCode, reservationCode, roomName, branch, onClose }) {
  const dateLabel = isToday(visitDate) ? "Today's Pass" : isTomorrow(visitDate) ? "Tomorrow's Pass" : "Visit Pass";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#050E1C",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      {/* Close button */}
      <button
        style={{
          position: "absolute", top: "20px", right: "20px",
          background: "rgba(255,255,255,0.08)", border: "none",
          borderRadius: "10px", padding: "8px", cursor: "pointer",
          color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center",
        }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X size={20} />
      </button>

      {/* Branding */}
      <div style={{ fontSize: "11px", letterSpacing: "0.16em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: "32px" }}>
        Lilycrest Dormitory System
      </div>

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0A1628",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "24px",
          padding: "36px 32px",
          width: "100%",
          maxWidth: "400px",
          textAlign: "center",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Status badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "rgba(52,211,153,0.12)", borderRadius: "20px",
          padding: "4px 12px", marginBottom: "20px",
        }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34D399" }} />
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#34D399", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {dateLabel}
          </span>
        </div>

        {/* Date */}
        <div style={{ fontSize: "26px", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "8px" }}>
          {fmtDateFull(visitDate + "T00:00:00")}
        </div>

        {/* Time */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "20px", fontWeight: 700, color: "#FF8C42", marginBottom: "28px" }}>
          <Clock size={18} />{visitTime}
        </div>

        {/* Code box — visit code is hero, system ref is secondary */}
        <div style={{
          background: "#0F2440",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "14px",
          padding: "20px",
          marginBottom: "20px",
        }}>
          {/* Primary: Visit Code */}
          <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: "6px" }}>
            Visit Code
          </div>
          <div style={{
            fontSize: "30px", fontWeight: 800, color: "#FF8C42",
            fontFamily: "'Courier New', monospace",
            letterSpacing: "0.12em", marginBottom: reservationCode ? "12px" : 0,
          }}>
            {visitCode || "—"}
          </div>
          {/* Secondary: System reservation code */}
          {reservationCode && (
            <>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "10px 0" }} />
              <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: "4px" }}>
                System Reference
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.4)", fontFamily: "'Courier New', monospace", letterSpacing: "0.08em" }}>
                {reservationCode}
              </div>
            </>
          )}
        </div>

        {/* Room + branch */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "12px", marginBottom: "24px",
        }}>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Room</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{roomName}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Branch</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", textTransform: "capitalize" }}>{branch}</div>
          </div>
        </div>

        {/* Status chip */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "rgba(37,99,235,0.15)", borderRadius: "8px",
          padding: "6px 12px",
        }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3B82F6" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#60A5FA" }}>Visit Scheduled · Pending Approval</span>
        </div>
      </div>

      {/* Tap to close hint */}
      <div style={{ marginTop: "24px", fontSize: "12px", color: "rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
        Tap anywhere or press Esc to exit
      </div>
    </div>
  );
}

export default VisitPassPanel;
