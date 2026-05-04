import React, { useState, useRef } from "react";

/* ─── safe date helpers ─────────────────────────────────────── */
function parseSafeDate(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).split("T")[0];
  const d = new Date(clean + "T12:00:00");
  return isNaN(d) ? null : d;
}
function fmtDateFull(dateStr) {
  const d = parseSafeDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

/* ─── VisitPassCard3D ────────────────────────────────────────── */
/**
 * A tilt-on-hover visit pass card for the dashboard right column.
 * No flip — just a smooth 3D perspective tilt that follows the mouse.
 * Only renders when visit is scheduled and not yet approved.
 */
export default function VisitPassCard3D({ reservation }) {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  if (!reservation) return null;
  const { visitDate, visitTime, visitApproved, visitCode, reservationCode, roomId } = reservation;
  if (!visitDate || !visitTime) return null;

  const isApproved = !!visitApproved;

  const roomName = roomId?.name || "—";
  const branch   = roomId?.branch || "Lilycrest";

  const handleMouseMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    // Max tilt ±12°
    const rotY =  ((e.clientX - cx) / (rect.width  / 2)) * 12;
    const rotX = -((e.clientY - cy) / (rect.height / 2)) * 12;
    setTilt({ x: rotX, y: rotY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setHovered(false);
  };

  return (
    <div style={S.wrapper}>

      {/* 3D scene */}
      <div style={S.scene}>
        <div
          ref={cardRef}
          style={{
            ...S.card,
            transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${hovered ? "translateY(-4px)" : "translateY(0)"}`,
            boxShadow: hovered
              ? "0 28px 56px rgba(10,22,40,0.5), 0 0 0 1px rgba(255,140,66,0.15)"
              : "0 16px 36px rgba(10,22,40,0.35), 0 0 0 1px rgba(255,140,66,0.1)",
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
        >
          {/* Shine layer follows tilt */}
          <div style={{
            ...S.shine,
            background: `radial-gradient(circle at ${50 + tilt.y * 2}% ${50 - tilt.x * 2}%, rgba(255,255,255,0.07) 0%, transparent 65%)`,
          }} />

          {/* Top strip */}
          <div style={S.topStrip}>
            <span style={{ ...S.property, color: isApproved ? "#10B981" : "#FF8C42" }}>
              {isApproved ? "ADMIN APPROVED" : "LILYCREST DORMITORY"}
            </span>
            <span style={{
              ...S.statusDot,
              background: isApproved ? "#10B981" : "#3B82F6",
              boxShadow: isApproved ? "0 0 6px rgba(16,185,129,0.8)" : "0 0 6px rgba(59,130,246,0.8)",
            }} />
          </div>

          {/* Visit code — hero */}
          <div style={S.codeLabel}>VISIT CODE</div>
          <div style={S.codeValue}>{visitCode || "—"}</div>

          {/* Divider */}
          <div style={S.divider} />

          {/* Date & Time */}
          <div style={S.dateRow}>
            <div>
              <div style={S.fieldLabel}>DATE</div>
              <div style={S.fieldValue}>{fmtDateFull(visitDate)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={S.fieldLabel}>TIME</div>
              <div style={S.fieldValue}>{visitTime}</div>
            </div>
          </div>

          {/* Room */}
          <div style={{ marginTop: 12 }}>
            <div style={S.fieldLabel}>ROOM · BRANCH</div>
            <div style={{ ...S.fieldValue, opacity: 0.75 }}>
              {roomName} · {branch}
            </div>
          </div>

          {/* System ref — muted, shown only once generated */}
          {reservationCode && (
            <div style={{ marginTop: 10 }}>
              <div style={S.fieldLabel}>SYSTEM REFERENCE</div>
              <div style={{ ...S.fieldValue, opacity: 0.4, fontFamily: "monospace", fontSize: 11 }}>
                {reservationCode}
              </div>
            </div>
          )}

          {/* Bottom */}
          <div style={S.bottomRow}>
            {isApproved ? (
            <span style={{
              ...S.pendingBadge,
              color: "#059669",
              background: "rgba(16,185,129,0.15)",
            }}>VISIT VERIFIED ✓</span>
          ) : (
            <span style={S.pendingBadge}>PENDING VERIFICATION</span>
          )}
            <QRIcon />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── tiny QR corner icon ───────────────────────────────────── */
function QRIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" opacity="0.3">
      <rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <rect x="4.5" y="4.5" width="5" height="5" rx="0.5" fill="white"/>
      <rect x="16" y="2" width="10" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <rect x="18.5" y="4.5" width="5" height="5" rx="0.5" fill="white"/>
      <rect x="2" y="16" width="10" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <rect x="4.5" y="18.5" width="5" height="5" rx="0.5" fill="white"/>
      <rect x="16" y="16" width="4" height="4" rx="0.5" fill="white" opacity="0.6"/>
      <rect x="22" y="16" width="4" height="4" rx="0.5" fill="white" opacity="0.6"/>
      <rect x="16" y="22" width="4" height="4" rx="0.5" fill="white" opacity="0.6"/>
      <rect x="22" y="22" width="4" height="4" rx="0.5" fill="white" opacity="0.6"/>
    </svg>
  );
}

/* ─── styles ────────────────────────────────────────────────── */
const S = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    width: "100%",
    flex: 1,
    height: "100%",
  },

  scene: {
    width: "100%",
    maxWidth: 280,
    padding: "12px 16px 20px",
  },
  card: {
    width: "100%",
    borderRadius: 18,
    background: "linear-gradient(160deg, #132035 0%, #0A1628 55%, #0E2244 100%)",
    padding: "22px 22px 18px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(255,140,66,0.18)",
    boxShadow: "inset 0 2px 0 rgba(255,140,66,0.45)",
    position: "relative",
    overflow: "hidden",
    transition: "transform 0.08s ease-out, box-shadow 0.2s ease",
    cursor: "default",
  },
  shine: {
    position: "absolute",
    inset: 0,
    borderRadius: 18,
    pointerEvents: "none",
    transition: "background 0.1s ease",
  },
  topStrip: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    position: "relative",
    zIndex: 1,
  },
  property: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "#FF8C42",
    textTransform: "uppercase",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#3B82F6",
    boxShadow: "0 0 6px rgba(59,130,246,0.8)",
  },
  codeLabel: {
    fontSize: 9,
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
    marginBottom: 4,
    position: "relative",
    zIndex: 1,
  },
  codeValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#FF8C42",
    fontFamily: "'Courier New', monospace",
    letterSpacing: "0.1em",
    lineHeight: 1,
    marginBottom: 18,
    position: "relative",
    zIndex: 1,
  },
  divider: {
    borderTop: "1px dashed rgba(255,255,255,0.08)",
    marginBottom: 14,
  },
  dateRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    position: "relative",
    zIndex: 1,
  },
  fieldLabel: {
    fontSize: 8,
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    lineHeight: 1.3,
  },
  bottomRow: {
    marginTop: "auto",
    paddingTop: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  pendingBadge: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#60A5FA",
    background: "rgba(37,99,235,0.15)",
    padding: "3px 8px",
    borderRadius: 999,
    textTransform: "uppercase",
  },
};
