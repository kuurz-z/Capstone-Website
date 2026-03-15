import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Bed,
  Building,
  Layers,
  Download,
  Eye,
  FileText,
  Wifi,
  Wind,
  BookOpen,
  ShieldCheck,
  Droplets,
  Video,
  Lamp,
  CookingPot,
  WashingMachine,
  ChevronLeft,
  Users,
  DoorOpen,
} from "lucide-react";
import dayjs from "dayjs";
import { generateDepositReceipt } from "../../../../shared/utils/receiptGenerator";
import { useCurrentUser } from "../../../../shared/hooks/queries/useUsers";

/* ── Ordinal suffix helper ────────────────────────── */
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ── Amenity icon mapper ──────────────────────────── */
const AMENITY_ICONS = {
  wifi: Wifi,
  "air conditioning": Wind,
  ac: Wind,
  aircon: Wind,
  "study desk": BookOpen,
  desk: BookOpen,
  security: ShieldCheck,
  cctv: Video,
  "hot shower": Droplets,
  shower: Droplets,
  water: Droplets,
  lamp: Lamp,
  kitchen: CookingPot,
  laundry: WashingMachine,
};

function getAmenityIcon(amenity) {
  const key = amenity.toLowerCase().trim();
  for (const [match, Icon] of Object.entries(AMENITY_ICONS)) {
    if (key.includes(match)) return Icon;
  }
  return ShieldCheck;
}

/* ── Main Component ────────────────────────────────── */
const ReservationAgreementPage = ({ reservation, onBack }) => {
  const navigate = useNavigate();
  const { data: profile } = useCurrentUser();
  const [selectedImage, setSelectedImage] = useState(0);

  if (!reservation) return null;

  const room = reservation.roomId || {};
  const images = room.images || [];
  const amenities = room.amenities || [];
  const heroImage = images[selectedImage] || images[0] || null;
  const code = reservation.reservationCode || "—";
  const bookedOn = dayjs(reservation.createdAt).format("MMMM D, YYYY");
  const moveInDate = reservation.targetMoveInDate
    ? dayjs(reservation.targetMoveInDate).format("MMMM D, YYYY")
    : "TBD";
  const tenantName =
    `${reservation.firstName || profile?.firstName || ""} ${reservation.lastName || profile?.lastName || ""}`.trim() ||
    "Tenant";
  const monthlyRent = reservation.monthlyRent || reservation.totalPrice || room.price || 0;
  const paymentDate = reservation.paymentDate
    ? dayjs(reservation.paymentDate).format("MMMM D, YYYY")
    : null;
  const branchDisplay =
    room.branch === "gil-puyat" ? "Gil Puyat" : room.branch === "guadalupe" ? "Guadalupe" : room.branch || "—";
  const roomType =
    room.type === "private"
      ? "Private"
      : room.type === "double-sharing"
        ? "Double Sharing"
        : room.type === "quadruple-sharing"
          ? "Quadruple Sharing"
          : room.type || "—";

  /* ── Styles ──────────────────────────────────────── */
  const card = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #E8EBF0",
    padding: 24,
    marginBottom: 16,
  };
  const sectionTitle = {
    fontSize: 15,
    fontWeight: 700,
    color: "#0A1628",
    margin: "0 0 16px",
  };
  const detailRow = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 13,
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {/* ── Back Button ─────────────────────────────── */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: "#64748B",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            marginBottom: 16,
            padding: 0,
          }}
        >
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
      )}

      {/* ── Hero Image ──────────────────────────────── */}
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 20,
          background: "#1E293B",
        }}
      >
        {heroImage ? (
          <img
            src={heroImage}
            alt={room.name || "Room"}
            style={{ width: "100%", height: 340, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 260,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#475569",
              gap: 12,
              background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
            }}
          >
            <Building size={48} style={{ opacity: 0.4, color: "#94A3B8" }} />
            <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}>
              No room photos available
            </span>
          </div>
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          }}
        />
        {/* Code + badge */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "0.02em",
            }}
          >
            {code}
          </span>
          <span
            style={{
              background: "#059669",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 20,
            }}
          >
            Reserved
          </span>
        </div>
      </div>

      {/* ── Two Column Layout ──────────────────────── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* LEFT: Room Details ────────────────────────── */}
        <div style={{ flex: "1 1 520px", minWidth: 300 }}>
          {/* Room Info Card */}
          <div style={card}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0A1628", margin: "0 0 12px" }}>
              {room.name || "Room"}
            </h2>

            {/* Tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {[
                branchDisplay,
                `${ordinal(room.floor || 1)} Floor`,
                roomType,
                `${room.capacity || "—"} beds`,
              ].map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: "#F1F5F9",
                    color: "#475569",
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "4px 12px",
                    borderRadius: 6,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Room Details List */}
            <div style={{ marginBottom: images.length > 1 ? 20 : 0 }}>
              <div style={detailRow}>
                <span style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} /> Branch
                </span>
                <span style={{ color: "#0A1628", fontWeight: 600 }}>{branchDisplay}</span>
              </div>
              <div style={detailRow}>
                <span style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={14} /> Floor
                </span>
                <span style={{ color: "#0A1628", fontWeight: 600 }}>{ordinal(room.floor || 1)} Floor</span>
              </div>
              <div style={detailRow}>
                <span style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                  <DoorOpen size={14} /> Room Type
                </span>
                <span style={{ color: "#0A1628", fontWeight: 600 }}>{roomType}</span>
              </div>
              <div style={detailRow}>
                <span style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                  <Users size={14} /> Capacity
                </span>
                <span style={{ color: "#0A1628", fontWeight: 600 }}>{room.capacity || "—"} beds</span>
              </div>
              <div style={detailRow}>
                <span style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                  <Bed size={14} /> Assigned Bed
                </span>
                <span style={{ color: "#0A1628", fontWeight: 600 }}>
                  {reservation.selectedBed?.position || "TBD"}
                </span>
              </div>
              {room.description && (
                <div style={{ ...detailRow, borderBottom: "none", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ color: "#64748B", fontSize: 12, fontWeight: 500 }}>Description</span>
                  <span style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>{room.description}</span>
                </div>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(images.length, 4)}, 1fr)`,
                  gap: 8,
                }}
              >
                {images.slice(0, 4).map((img, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    style={{
                      borderRadius: 8,
                      overflow: "hidden",
                      cursor: "pointer",
                      border:
                        selectedImage === i ? "2px solid #E8734A" : "2px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <img
                      src={img}
                      alt={`Room view ${i + 1}`}
                      style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Amenities Card */}
          {amenities.length > 0 && (
            <div style={card}>
              <h3 style={sectionTitle}>Amenities</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 16,
                }}
              >
                {amenities.map((amenity) => {
                  const Icon = getAmenityIcon(amenity);
                  return (
                    <div
                      key={amenity}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: "#F8FAFC",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={18} color="#475569" />
                      </div>
                      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500, textAlign: "center" }}>
                        {amenity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Summary + Receipt ────────────────── */}
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          {/* Reservation Summary */}
          <div style={card}>
            <h3 style={sectionTitle}>Reservation Summary</h3>
            {[
              { label: "Tenant", value: tenantName },
              { label: "Booked On", value: bookedOn },
              { label: "Move-in Date", value: moveInDate },
              { label: "Lease Duration", value: `${reservation.leaseDuration || 12} months` },
              {
                label: "Monthly Rent",
                value: `₱${monthlyRent.toLocaleString()}`,
                highlight: true,
              },
              { label: "Deposit", value: paymentDate ? "₱2,000 — Paid ✓" : "Pending", paid: !!paymentDate },
            ].map(({ label, value, highlight, paid }) => (
              <div key={label} style={detailRow}>
                <span style={{ color: "#64748B", fontWeight: 500 }}>{label}</span>
                <span
                  style={{
                    color: highlight ? "#E8734A" : paid ? "#059669" : "#0A1628",
                    fontWeight: 600,
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Receipt Download Card */}
          <div style={{ ...card, background: "#F8FAFC" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <FileText size={16} color="#475569" />
              <h3 style={{ ...sectionTitle, margin: 0 }}>Payment Receipt</h3>
            </div>

            {paymentDate ? (
              <>
                <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                  Your deposit payment of <strong>₱2,000</strong> was confirmed on{" "}
                  <strong>{paymentDate}</strong>. Download or view your official receipt below.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => generateDepositReceipt(reservation, profile)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "10px 16px",
                      background: "#E8734A",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#D4622F";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#E8734A";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <button
                    onClick={() => generateDepositReceipt(reservation, profile)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "10px 16px",
                      background: "transparent",
                      color: "#0A1628",
                      border: "1.5px solid #0A1628",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#0A1628";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#0A1628";
                    }}
                  >
                    <Eye size={14} /> View Receipt
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.6 }}>
                Your receipt will appear here once your deposit is confirmed.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationAgreementPage;
