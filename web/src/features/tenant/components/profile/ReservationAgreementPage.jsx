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
 AlertCircle,
 Lock,
 ChevronDown,
 ChevronUp,
} from "lucide-react";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { generateDepositReceipt, viewDepositReceipt, generateMoveInStatementPDF } from "../../../../shared/utils/receiptGenerator";
import { getBedDisplayLabel } from "../../../../shared/utils/bedIdentifier";
import { useCurrentUser } from "../../../../shared/hooks/queries/useUsers";
import { reservationApi } from "../../../../shared/api/reservationApi";
import { showNotification } from "../../../../shared/utils/notification";
import { getFriendlyError } from "../../../../shared/utils/friendlyError";
import {
 canReservationAccessPayment,
 hasReservationStatus,
 readMoveInDate,
} from "../../../../shared/utils/lifecycleNaming";
import {
  RESERVATION_FEE_NON_REFUNDABLE_NOTICE,
  MAX_CANCELLATION_REASON_LENGTH,
  PREDEFINED_CANCELLATION_REASONS,
  getReservationCancellationUiState,
} from "./reservationCancellationUi";
import { getRoomImages } from "../../pages/check-availability/checkAvailabilityConstants";
import { getResolvedMonthlyRate } from "../../utils/pricingDisplayHelpers";
import { resolveReservationFinancials } from "../../../../shared/utils/depositUtils";
import "../../../admin/styles/design-tokens.css";

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

// The final monthly rate is authoritative only from the server: either the
// immutable approved pricingSnapshot (post-approval) or the server-computed
// lease-duration-aware preview (pre-approval), both surfaced as
// reservation.pricingDisplay (see contractPricingResolver.js#buildPricingDisplay
// on the backend). This function intentionally no longer reinvents the
// discount formula client-side — returns null when no resolved rate exists.
function getEffectiveMonthlyRent(reservation) {
  return getResolvedMonthlyRate(reservation?.pricingDisplay);
}

/* ── Main Component ────────────────────────────────── */
const ReservationAgreementPage = ({ reservation, onBack, onReservationUpdated }) => {
 const navigate = useNavigate();
 const queryClient = useQueryClient();
 const { data: profile } = useCurrentUser();
 const [selectedImage, setSelectedImage] = useState(0);
 const [showCancellationModal, setShowCancellationModal] = useState(false);
 const [isRequestingCancellation, setIsRequestingCancellation] = useState(false);
 const [showWithdrawModal, setShowWithdrawModal] = useState(false);
 const [isWithdrawingCancellation, setIsWithdrawingCancellation] = useState(false);
 const [cancellationReason, setCancellationReason] = useState("");
 const [acknowledgedCancellationPolicy, setAcknowledgedCancellationPolicy] = useState(false);
 const [isMoveInScheduleOpen, setIsMoveInScheduleOpen] = useState(false);

 if (!reservation) {
 return (
 <div style={{ width: "100%" }}>
 <div style={{ marginBottom: 24 }}>
 <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>My Reservation</h1>
 <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>Your active reservation details</p>
 </div>
 <div style={{
 display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
 textAlign: "center", padding: "56px 24px",
 background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)",
}}>
 <Building size={48} color="var(--neutral)" />
 <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: "16px 0 8px" }}>
 No Reservation Yet
 </h3>
 <p style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 300, margin: "0 0 24px", lineHeight: 1.6 }}>
 You don't have an active reservation. Browse available rooms and start your application.
 </p>
 <button
 onClick={() => navigate("/applicant/check-availability")}
 style={{
 padding: "12px 28px", background: "var(--primary)", color: "var(--primary-foreground)",
 border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
 cursor: "pointer", transition: "all 0.15s",
 }}
 onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ring)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
 onMouseLeave={(e) => { e.currentTarget.style.background = "var(--primary)"; e.currentTarget.style.transform = "translateY(0)"; }}
 >
 Browse Available Rooms
 </button>
 </div>
 </div>
 );
 }

  const room = reservation.roomId || {};
  const storedImages = Array.isArray(room.images)
    ? room.images.filter((img) => typeof img === "string" && img.trim())
    : [];
  const images =
    storedImages.length > 0
      ? storedImages
      : getRoomImages(room.type, room.branch);
  const amenities = room.amenities || [];
  const heroImage = images[selectedImage] || images[0] || null;
  const code = reservation.reservationCode || reservation.code || reservation.visitCode || "—";
 const bookedOn = dayjs(reservation.createdAt).format("MMMM D, YYYY [at] h:mm A");
 const moveInDate = readMoveInDate(reservation) || reservation.targetMoveInDate;
 const moveInDateLabel = moveInDate
 ? dayjs(moveInDate).format("MMMM D, YYYY")
 : "TBD";
 const reservationStatus = reservation.reservationStatus || reservation.status || "pending";
 const isFullTenantReservation = hasReservationStatus(reservationStatus, "moveIn", "moveOut");
 const personLabel = isFullTenantReservation ? "Tenant" : "Applicant";
 const resFirstName = reservation.firstName || profile?.firstName || "";
 const resLastName = reservation.lastName || profile?.lastName || "";
 const personName =
 `${resFirstName} ${resLastName}`.trim() ||
 personLabel;
 const reservationFeeLabel = isFullTenantReservation ? "Deposit" : "Reservation Fee";
 const paymentDescriptor = isFullTenantReservation ? "deposit" : "reservation fee";
 const statusDisplay = (() => {
  const s = reservationStatus;
  if (s === "cancelled") return { label: "Cancelled", bg: "var(--danger)" };
  if (hasReservationStatus(s, "moveOut")) return { label: "Completed", bg: "var(--neutral)" };
  if (hasReservationStatus(s, "moveIn")) return { label: "Move In", bg: "var(--success)" };
  return { label: "Reserved", bg: "var(--success)" };
 })();

 const monthlyRent = getEffectiveMonthlyRent(reservation);
 const reservationFeeAmount = reservation.reservationFeeAmount || 2000;
 const paymentDate = reservation.paymentDate
 ? dayjs(reservation.paymentDate).format("MMMM D, YYYY [at] h:mm A")
 : null;
 const cancellationUi = getReservationCancellationUiState(reservation);
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
 background: "var(--card)",
 borderRadius: 12,
 border: "1px solid var(--border)",
 padding: 24,
 marginBottom: 16,
 };
 const sectionTitle = {
 fontSize: 15,
 fontWeight: 700,
 color: "var(--foreground)",
 margin: "0 0 16px",
 };
 const detailRow = {
 display: "flex",
 justifyContent: "space-between",
 alignItems: "center",
 padding: "10px 0",
 borderBottom: "1px solid var(--border)",
 fontSize: 13,
 };

 const resetCancellationModal = () => {
 setShowCancellationModal(false);
 setCancellationReason("");
 setAcknowledgedCancellationPolicy(false);
 };

 const handleRequestCancellation = async () => {
 if (!reservation?._id || isRequestingCancellation) return;
 if (!acknowledgedCancellationPolicy) {
 showNotification("Please acknowledge that the reservation fee is non-refundable.", "warning", 4000);
 return;
 }

 setIsRequestingCancellation(true);
 try {
 await reservationApi.requestCancellation(reservation._id, cancellationReason.trim());
 resetCancellationModal();
 showNotification(
 "Cancellation request submitted. Your reservation fee is non-refundable and the request is pending admin review.",
 "success",
 5000,
 );
 await Promise.all([
 queryClient.invalidateQueries({ queryKey: ["reservations"] }),
 queryClient.invalidateQueries({ queryKey: ["users", "currentUser"] }),
 ]);
 await onReservationUpdated?.();
 } catch (error) {
 const errorCode = error?.response?.data?.code;
 if (errorCode === "CANCELLATION_REQUEST_ALREADY_PENDING") {
 resetCancellationModal();
 showNotification("Cancellation request is already pending admin review.", "info", 5000);
 await queryClient.invalidateQueries({ queryKey: ["reservations"] });
 await onReservationUpdated?.();
 return;
 }

    console.error("Cancellation request failed:", error);
    showNotification(
      getFriendlyError(error, "Failed to submit cancellation request. Please try again."),
      "error",
      5000,
    );
  } finally {
 setIsRequestingCancellation(false);
 }
 };

  const handleWithdrawCancellation = async () => {
    if (!reservation?._id || isWithdrawingCancellation) return;

    setIsWithdrawingCancellation(true);
    try {
      await reservationApi.withdrawCancellationRequest(reservation._id);
      setShowWithdrawModal(false);
      showNotification(
        "Cancellation request withdrawn. Your reservation remains active.",
        "success",
        5000,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["users", "currentUser"] }),
      ]);
      await onReservationUpdated?.();
    } catch (error) {
      console.error("Withdraw cancellation request failed:", error);
      showNotification(
        getFriendlyError(error, "Failed to withdraw cancellation request. Please try again."),
        "error",
        5000,
      );
      await queryClient.invalidateQueries({ queryKey: ["reservations"] });
      await onReservationUpdated?.();
      setShowWithdrawModal(false);
    } finally {
      setIsWithdrawingCancellation(false);
    }
  };

 return (
 <div style={{ width: "100%" }}>

 {/* ── Hero Image ──────────────────────────────── */}
 <div
 style={{
 position: "relative",
 borderRadius: 14,
 overflow: "hidden",
 marginBottom: 20,
 background: "var(--muted)",
 }}
 >
 {heroImage ? (
 <img
 src={heroImage}
 alt={room.name || "Room"}
 style={{ width: "100%", height: 480, objectFit: "cover", display: "block" }}
 onError={(e) => {
 // Replace with the no-photo fallback if URL is invalid
 e.currentTarget.style.display = "none";
 const parent = e.currentTarget.parentElement;
 const fallback = parent.querySelector("[data-photo-fallback]");
 if (fallback) fallback.style.display = "flex";
 }}
 />
 ) : (
 <div
 data-photo-fallback
 style={{
 width: "100%",
 height: 240,
 display: "flex",
 flexDirection: "column",
 alignItems: "center",
 justifyContent: "center",
 color: "var(--muted-foreground)",
 gap: 8,
 background: "linear-gradient(135deg, var(--background) 0%, var(--muted) 100%)",
 }}
 >
 <Building size={32} style={{ opacity: 0.3, color: "var(--muted-foreground)" }} />
 <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>
 Room photos not yet available
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
 background: "linear-gradient(transparent, color-mix(in srgb, var(--foreground) 70%, transparent))",
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
 color: "var(--text-inverse)",
 letterSpacing: "0.02em",
 }}
 >
 {code}
 </span>
 <span
 style={{
 background: statusDisplay.bg,
 color: "var(--text-inverse)",
 fontSize: 12,
 fontWeight: 600,
 padding: "4px 12px",
 borderRadius: 20,
 }}
 >
 {statusDisplay.label}
 </span>
 </div>
 </div>

 {/* ── Two Column Layout ──────────────────────── */}
 <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
 {/* LEFT: Room Details ────────────────────────── */}
 <div style={{ flex: "1 1 520px", minWidth: 300 }}>
 {/* Room Info Card */}
 <div style={card}>
 <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)", margin: "0 0 12px" }}>
 {room.name || "Room"}
 </h2>

 {/* Tags */}
 <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
 {[
 branchDisplay,
 `${ordinal(room.floor || 1)} Floor`,
 roomType,
 (() => {
 const cap = room.capacity || (
 room.type === "private" ? 1
 : room.type === "double-sharing" ? 2
 : room.type === "quadruple-sharing" ? 4
 : null
 );
 return cap ? `${cap} ${cap === 1 ? "person" : "persons"}` : null;
 })(),
 ].filter(Boolean).map((tag) => (
 <span
 key={tag}
 style={{
 background: "var(--muted)",
 color: "var(--muted-foreground)",
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
 <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
 <MapPin size={14} /> Branch
 </span>
 <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{branchDisplay}</span>
 </div>
 <div style={detailRow}>
 <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
 <Layers size={14} /> Floor
 </span>
 <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{ordinal(room.floor || 1)} Floor</span>
 </div>
 <div style={detailRow}>
 <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
 <DoorOpen size={14} /> Room Type
 </span>
 <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{roomType}</span>
 </div>
 <div style={detailRow}>
 <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
 <Users size={14} /> Capacity
 </span>
 <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
 {(() => {
 const cap = room.capacity || (
 room.type === "private" ? 1
 : room.type === "double-sharing" ? 2
 : room.type === "quadruple-sharing" ? 4
 : null
 );
 if (!cap) return "N/A";
 return `${cap} ${cap === 1 ? "person" : "persons"}`;
 })()}
 </span>
 </div>
 {room.type !== "private" && (
 <div style={detailRow}>
 <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
 <Bed size={14} /> Assigned Bed
 </span>
 <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
 {reservation.selectedBed ? getBedDisplayLabel(reservation.selectedBed) : "TBD"}
 </span>
 </div>
 )}
 {room.description && (
 <div style={{ ...detailRow, borderBottom: "none", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
 <span style={{ color: "var(--muted-foreground)", fontSize: 12, fontWeight: 500 }}>Description</span>
 <span style={{ color: "var(--foreground)", fontSize: 13, lineHeight: 1.5 }}>{room.description}</span>
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
 selectedImage === i ? "2px solid var(--primary)" : "2px solid transparent",
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
 background: "var(--muted)",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 }}
 >
 <Icon size={18} color="var(--muted-foreground)" />
 </div>
 <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500, textAlign: "center" }}>
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
 {(() => {
   const resolvedLeaseDuration =
     reservation.leaseDuration || reservation.applicationForm?.leaseDuration;
   const leaseDurationText = resolvedLeaseDuration
     ? (Number(resolvedLeaseDuration) === 12
         ? "12 months (1 year)"
         : `${resolvedLeaseDuration} ${Number(resolvedLeaseDuration) === 1 ? "month" : "months"}`)
     : "Pending review";

   const summaryRows = [
     { label: personLabel, value: personName },
     { label: "Booked On", value: bookedOn },
     { label: "Move-in Date", value: moveInDateLabel },
     { label: "Lease Duration", value: leaseDurationText },
     {
       label: "Monthly Rent",
       value: monthlyRent === null ? "Pricing will be confirmed during review" : `₱${monthlyRent.toLocaleString()}`,
       highlight: true,
     },
     {
       label: reservationFeeLabel,
       value: paymentDate ? `PHP ${reservationFeeAmount.toLocaleString("en-PH")} — Paid ✓` : "Pending",
       paid: !!paymentDate,
     },
   ];

   return summaryRows.map(({ label, value, highlight, paid }) => (
     <div key={label} style={detailRow}>
       <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>{label}</span>
       <span
          style={{
            color: highlight ? "var(--primary)" : paid ? "var(--success)" : "var(--foreground)",
            fontWeight: 600,
          }}
        >
          {value}
        </span>
      </div>
    ));
 })()}
 </div>

 {/* Move-In Financial Schedule Card (Collapsible) */}
 {(hasReservationStatus(reservationStatus, "reserved", "moveIn", "moveOut") || paymentDate) && (() => {
   const {
     monthlyRent: resolvedRent,
     advanceRent,
     securityDeposit,
     grossTotal,
     reservationFeeAmount: resolvedFee,
     remainingDue: netDue,
     isSettled,
   } = resolveReservationFinancials(reservation);

   return (
     <div style={{ ...card, padding: "16px 20px", marginBottom: 12 }}>
       <div
         onClick={() => setIsMoveInScheduleOpen((prev) => !prev)}
         style={{
           display: "flex",
           alignItems: "center",
           justifyContent: "space-between",
           cursor: "pointer",
           userSelect: "none",
         }}
       >
         <h3 style={{ ...sectionTitle, margin: 0, fontSize: 14 }}>Move-In Financial Schedule</h3>
         <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
           <span style={{ fontSize: 13, fontWeight: 700, color: isSettled ? "var(--success)" : "var(--text-heading, var(--primary))" }}>
             {isSettled ? "₱0 (Settled)" : `₱${netDue.toLocaleString()}`}
           </span>
           {isMoveInScheduleOpen ? (
             <ChevronUp size={16} color="var(--muted-foreground)" />
           ) : (
             <ChevronDown size={16} color="var(--muted-foreground)" />
           )}
         </div>
       </div>

       {isMoveInScheduleOpen && (
         <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
           <div style={detailRow}>
             <span style={{ color: "var(--muted-foreground)" }}>1-Month Advance Rent</span>
             <span style={{ fontWeight: 600 }}>{advanceRent ? `₱${advanceRent.toLocaleString()}` : "—"}</span>
           </div>
           <div style={detailRow}>
             <span style={{ color: "var(--muted-foreground)" }}>1-Month Security Deposit</span>
             <span style={{ fontWeight: 600 }}>{securityDeposit ? `₱${securityDeposit.toLocaleString()}` : "—"}</span>
           </div>
           <div style={{ ...detailRow, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
             <span style={{ fontWeight: 600 }}>Total Move-In Requirements</span>
             <span style={{ fontWeight: 700 }}>₱{grossTotal.toLocaleString()}</span>
           </div>
           <div style={detailRow}>
             <span style={{ color: "var(--success)" }}>Less: Slot Reservation Fee (Paid)</span>
             <span style={{ color: "var(--success)", fontWeight: 700 }}>-₱{reservationFeeAmount.toLocaleString()}</span>
           </div>
           <div style={{ ...detailRow, borderBottom: "none", paddingTop: 10, marginTop: 4 }}>
             <span style={{ fontWeight: 700, fontSize: 13 }}>Remaining Move-In Due</span>
             <span style={{ fontWeight: 800, fontSize: 14, color: isSettled ? "var(--success)" : "var(--text-heading, var(--primary))" }}>
               {isSettled ? "₱0 (Settled)" : `₱${netDue.toLocaleString()}`}
             </span>
           </div>
           <div style={{ marginTop: 12 }}>
             <button
               onClick={() => generateMoveInStatementPDF(reservation, profile)}
               style={{
                 width: "100%",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 gap: 6,
                 padding: "8px 14px",
                 background: "transparent",
                 color: "var(--foreground)",
                 border: "1px solid var(--border)",
                 borderRadius: 8,
                 fontSize: 12,
                 fontWeight: 600,
                 cursor: "pointer",
                 transition: "all 0.15s",
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.background = "var(--muted)";
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.background = "transparent";
               }}
             >
               <Download size={13} /> Download Move-In Statement
             </button>
           </div>
         </div>
       )}
     </div>
   );
 })()}

 {/* Receipt Download Card */}
 <div style={{ ...card, background: "var(--muted)", padding: "16px 20px", marginBottom: 12 }}>
   <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
     <FileText size={15} color="var(--muted-foreground)" />
     <h3 style={{ ...sectionTitle, margin: 0, fontSize: 14 }}>
       {isFullTenantReservation ? "Payment Receipt" : "Reservation Fee Payment"}
     </h3>
   </div>

   {paymentDate ? (
     <>
       <p style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
         Your {paymentDescriptor} payment of <strong>{`PHP ${reservationFeeAmount.toLocaleString("en-PH")}`}</strong> was confirmed on{" "}
         <strong>{paymentDate}</strong>.
       </p>
       <div style={{ display: "flex", gap: 8 }}>
         <button
           onClick={() => generateDepositReceipt(reservation, profile)}
           style={{
             flex: 1,
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             gap: 6,
             padding: "8px 12px",
             background: "var(--success)",
             color: "var(--success-foreground)",
             border: "1px solid var(--success)",
             borderRadius: 8,
             fontSize: 12,
             fontWeight: 600,
             cursor: "pointer",
             transition: "all 0.15s",
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.background = "var(--success-dark)";
             e.currentTarget.style.transform = "translateY(-1px)";
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.background = "var(--success)";
             e.currentTarget.style.transform = "translateY(0)";
           }}
         >
           <Download size={13} /> Download PDF
         </button>
         <button
           onClick={() => viewDepositReceipt(reservation, profile)}
           style={{
             flex: 1,
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             gap: 6,
             padding: "8px 12px",
             background: "var(--card)",
             color: "var(--foreground)",
             border: "1px solid var(--border)",
             borderRadius: 8,
             fontSize: 12,
             fontWeight: 600,
             cursor: "pointer",
             transition: "all 0.15s",
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.background = "var(--muted)";
             e.currentTarget.style.borderColor = "var(--border)";
             e.currentTarget.style.color = "var(--foreground)";
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.background = "var(--card)";
             e.currentTarget.style.borderColor = "var(--border)";
             e.currentTarget.style.color = "var(--foreground)";
           }}
         >
           <Eye size={13} /> View Receipt
         </button>
       </div>
     </>
   ) : (
     <p style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.5, margin: 0 }}>
       Your receipt will appear here once your Reservation Fee is confirmed.
     </p>
   )}
 </div>

 {/* Cancellation Request Card */}
 {cancellationUi.visible && (
   <div style={{ ...card, padding: "14px 18px", marginBottom: 12, borderColor: "var(--border-card, #CBD5E1)" }}>
     {cancellationUi.isSettledLocked ? (
       <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
         <Lock size={16} color="var(--primary, #0284C7)" style={{ marginTop: 2, flexShrink: 0 }} />
         <div>
           <h3 style={{ ...sectionTitle, margin: 0, fontSize: 13, color: "var(--foreground)" }}>
             Reservation Confirmed &amp; Cancellation Locked
           </h3>
           <p style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.5, margin: "4px 0 0" }}>
             Cancellation is no longer permitted because your 1-month advance rent and security deposit have been settled and your contract is confirmed. If you are unable to proceed with your stay, please contact dorm management to discuss Early Termination or Move-Out.
           </p>
         </div>
       </div>
     ) : (
       <>
         <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
           <AlertCircle size={16} color={cancellationUi.isPending ? "#D97706" : "#DC2626"} style={{ marginTop: 1, flexShrink: 0 }} />
           <div>
             <h3 style={{ ...sectionTitle, margin: 0, fontSize: 13 }}>
               {cancellationUi.isPending ? "Cancellation Request Pending" : "Request Reservation Cancellation"}
             </h3>
             <p style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.45, margin: "4px 0 0" }}>
               {cancellationUi.isPending
                 ? "Your cancellation request is waiting for admin review. Your bed remains reserved until admin approves the request."
                 : RESERVATION_FEE_NON_REFUNDABLE_NOTICE}
             </p>
           </div>
         </div>

      {cancellationUi.isPending ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--warning-dark, #B45309)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D97706", display: "inline-block" }} />
            Pending admin review
          </div>
          <button
            type="button"
            onClick={() => setShowWithdrawModal(true)}
            disabled={isWithdrawingCancellation}
            style={{
              padding: "7px 14px",
              background: "var(--surface-card, #FFFFFF)",
              color: "var(--text-heading, #0F172A)",
              border: "1px solid var(--border-card, #CBD5E1)",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: isWithdrawingCancellation ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isWithdrawingCancellation) {
                e.currentTarget.style.background = "var(--surface-hover, #F8FAFC)";
                e.currentTarget.style.borderColor = "var(--text-secondary, #94A3B8)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-card, #FFFFFF)";
              e.currentTarget.style.borderColor = "var(--border-card, #CBD5E1)";
            }}
          >
            Withdraw Request
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCancellationModal(true)}
          style={{
            width: "100%",
            padding: "9px 14px",
            background: "var(--color-danger, #DC2626)",
            color: "#FFFFFF",
            border: "1px solid var(--color-danger, #DC2626)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease",
            boxShadow: "0 1px 3px rgba(220, 38, 38, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#B91C1C";
            e.currentTarget.style.borderColor = "#991B1B";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 3px 8px rgba(220, 38, 38, 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-danger, #DC2626)";
            e.currentTarget.style.borderColor = "var(--color-danger, #DC2626)";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(220, 38, 38, 0.2)";
          }}
        >
          Request Cancellation
        </button>
     )}
       </>
     )}
   </div>
 )}
 </div>
 </div>
  {showCancellationModal && (
    <div
      onClick={() => {
        if (!isRequestingCancellation) resetCancellationModal();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 22, 40, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          background: "var(--surface-card, #FFFFFF)",
          border: "1px solid var(--border-card, #E2E8F0)",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
          padding: 28,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#FEF2F2",
              border: "1px solid #FEE2E2",
              color: "#DC2626",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <AlertCircle size={22} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "var(--text-heading, #0F172A)" }}>
              Request Reservation Cancellation?
            </h3>
            <p style={{ margin: 0, color: "var(--text-secondary, #64748B)", fontSize: 13, lineHeight: 1.5 }}>
              The reservation fee is non-refundable. If approved by the admin, your slot will be released and the reservation fee will not be returned.
            </p>
          </div>
        </div>

        {/* Reason Selection */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "var(--text-heading, #0F172A)", fontSize: 13, fontWeight: 600 }}>
              Reason for cancellation <span style={{ fontWeight: 400, color: "var(--text-muted, #94A3B8)" }}>(optional)</span>
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: cancellationReason.length >= MAX_CANCELLATION_REASON_LENGTH ? "#DC2626" : "var(--text-muted, #94A3B8)",
              }}
            >
              {cancellationReason.length} / {MAX_CANCELLATION_REASON_LENGTH}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {PREDEFINED_CANCELLATION_REASONS.map((reasonText) => {
              const isSelected = cancellationReason === reasonText;
              return (
                <button
                  key={reasonText}
                  type="button"
                  disabled={isRequestingCancellation}
                  onClick={() => setCancellationReason(isSelected ? "" : reasonText)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 500,
                    border: isSelected ? "1px solid var(--color-primary, #0A1628)" : "1px solid var(--border-card, #E2E8F0)",
                    background: isSelected ? "var(--color-primary, #0A1628)" : "var(--surface-card, #FFFFFF)",
                    color: isSelected ? "#FFFFFF" : "var(--text-heading, #0F172A)",
                    cursor: isRequestingCancellation ? "default" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {reasonText}
                </button>
              );
            })}
          </div>

          <textarea
            rows={3}
            maxLength={MAX_CANCELLATION_REASON_LENGTH}
            value={cancellationReason}
            onChange={(event) =>
              setCancellationReason(event.target.value.slice(0, MAX_CANCELLATION_REASON_LENGTH))
            }
            disabled={isRequestingCancellation}
            placeholder="Tell us why or select an option above..."
            style={{
              width: "100%",
              resize: "vertical",
              border: "1px solid var(--border-card, #E2E8F0)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--text-heading, #0F172A)",
              backgroundColor: "var(--surface-page, #F8FAFC)",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Policy Acknowledgement Box (Clean, Neutral, 0 Yellow) */}
        <label
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            marginTop: 18,
            padding: "12px 14px",
            background: "var(--surface-page, #F8FAFC)",
            border: "1px solid var(--border-card, #E2E8F0)",
            borderRadius: 10,
            fontSize: 13,
            lineHeight: 1.5,
            cursor: isRequestingCancellation ? "default" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={acknowledgedCancellationPolicy}
            onChange={(event) => setAcknowledgedCancellationPolicy(event.target.checked)}
            disabled={isRequestingCancellation}
            style={{ marginTop: 2, accentColor: "var(--color-primary, #0A1628)", width: 16, height: 16, cursor: isRequestingCancellation ? "default" : "pointer" }}
          />
          <span style={{ color: "var(--text-secondary, #334155)" }}>
            I understand that the <strong style={{ color: "var(--text-heading, #0F172A)" }}>reservation fee is non-refundable</strong> even if my cancellation request is approved.
          </span>
        </label>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            type="button"
            onClick={resetCancellationModal}
            disabled={isRequestingCancellation}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid var(--border-card, #CBD5E1)",
              background: "var(--surface-card, #FFFFFF)",
              color: "var(--text-heading, #0F172A)",
              fontSize: 13,
              fontWeight: 600,
              cursor: isRequestingCancellation ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isRequestingCancellation) {
                e.currentTarget.style.background = "var(--surface-hover, #F8FAFC)";
                e.currentTarget.style.borderColor = "var(--text-secondary, #94A3B8)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-card, #FFFFFF)";
              e.currentTarget.style.borderColor = "var(--border-card, #CBD5E1)";
            }}
          >
            Keep Reservation
          </button>
          <button
            type="button"
            onClick={handleRequestCancellation}
            disabled={isRequestingCancellation || !acknowledgedCancellationPolicy}
            title={!acknowledgedCancellationPolicy ? "Please check the non-refundable fee agreement box before submitting" : undefined}
            style={{
              padding: "10px 22px",
              borderRadius: 8,
              border: "none",
              background: acknowledgedCancellationPolicy ? "var(--color-danger, #DC2626)" : "var(--surface-muted, #E2E8F0)",
              color: acknowledgedCancellationPolicy ? "#FFFFFF" : "var(--text-muted, #94A3B8)",
              fontSize: 13,
              fontWeight: 600,
              cursor: isRequestingCancellation || !acknowledgedCancellationPolicy ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (acknowledgedCancellationPolicy && !isRequestingCancellation) {
                e.currentTarget.style.background = "#B91C1C";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              if (acknowledgedCancellationPolicy) {
                e.currentTarget.style.background = "var(--color-danger, #DC2626)";
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >
            {isRequestingCancellation ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Withdraw Cancellation Request Modal */}
  {showWithdrawModal && (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        zIndex: 1050,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isWithdrawingCancellation) {
          setShowWithdrawModal(false);
        }
      }}
    >
      <div
        style={{
          background: "var(--surface-card, #FFFFFF)",
          borderRadius: 14,
          border: "1px solid var(--border-card, #E2E8F0)",
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <ShieldCheck size={26} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "var(--text-heading, #0F172A)" }}>
              Withdraw Cancellation Request?
            </h3>
            <p style={{ margin: 0, color: "var(--text-secondary, #64748B)", fontSize: 13, lineHeight: 1.5 }}>
              Withdrawing will cancel your pending cancellation request. Your reservation for <strong>{room.name || "your selected room"}</strong> and held bed will remain active and secure.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setShowWithdrawModal(false)}
            disabled={isWithdrawingCancellation}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid var(--border-card, #CBD5E1)",
              background: "var(--surface-card, #FFFFFF)",
              color: "var(--text-heading, #0F172A)",
              fontSize: 13,
              fontWeight: 600,
              cursor: isWithdrawingCancellation ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isWithdrawingCancellation) {
                e.currentTarget.style.background = "var(--surface-hover, #F8FAFC)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-card, #FFFFFF)";
            }}
          >
            Keep Pending
          </button>
          <button
            type="button"
            onClick={handleWithdrawCancellation}
            disabled={isWithdrawingCancellation}
            style={{
              padding: "10px 22px",
              borderRadius: 8,
              border: "none",
              background: "#059669",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              cursor: isWithdrawingCancellation ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isWithdrawingCancellation) {
                e.currentTarget.style.background = "#047857";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#059669";
            }}
          >
            {isWithdrawingCancellation ? "Withdrawing..." : "Confirm Withdrawal"}
          </button>
        </div>
      </div>
    </div>
  )}
 </div>
 );
};

export default ReservationAgreementPage;
