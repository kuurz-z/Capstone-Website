import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PoliciesTermsModal } from "../../modals/PoliciesAndConsent";

/* ── Available time slots ────────────────────────────────────────────── */
const TIME_SLOTS = [
  "08:00 AM",
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
];

/* ── Helper: generate next N weekdays ────────────────────────────────── */
function getAvailableDates(count = 10) {
  const dates = [];
  const d = new Date();
  d.setDate(d.getDate() + 1); // start from tomorrow
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      // skip weekends
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function fmtDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtDateFull(dateStr) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function toISODate(date) {
  return date.toISOString().split("T")[0];
}

/* ── Inline styles ───────────────────────────────────────────────────── */
const S = {
  dateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "10px",
    marginBottom: "8px",
  },
  dateCard: (selected) => ({
    padding: "12px 10px",
    borderRadius: "10px",
    border: selected ? "2px solid #E7710F" : "2px solid #E2E8F0",
    background: selected ? "rgba(231,113,15,0.06)" : "#fff",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.15s ease",
  }),
  dateDay: (selected) => ({
    fontSize: "11px",
    fontWeight: 600,
    color: selected ? "#E7710F" : "#94A3B8",
    textTransform: "uppercase",
    marginBottom: "4px",
  }),
  dateNum: (selected) => ({
    fontSize: "16px",
    fontWeight: 700,
    color: selected ? "#0C375F" : "#334155",
  }),
  timeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: "8px",
  },
  timeSlot: (selected) => ({
    padding: "10px 12px",
    borderRadius: "8px",
    border: selected ? "2px solid #E7710F" : "2px solid #E2E8F0",
    background: selected ? "rgba(231,113,15,0.06)" : "#fff",
    cursor: "pointer",
    textAlign: "center",
    fontSize: "14px",
    fontWeight: selected ? 600 : 500,
    color: selected ? "#E7710F" : "#475569",
    transition: "all 0.15s ease",
  }),
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalCard: {
    background: "white",
    borderRadius: "16px",
    padding: "32px",
    maxWidth: "480px",
    width: "90%",
    maxHeight: "90vh",
    overflow: "auto",
    boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
  },
};

/**
 * Step 2 — Visit Scheduling & Policies
 * User picks an available date + time slot, reviews policies, then confirms.
 * After confirmation, a receipt is shown and user returns to the dashboard.
 */
const ReservationVisitStep = ({
  targetMoveInDate,
  viewingType,
  setViewingType,
  isOutOfTown,
  setIsOutOfTown,
  currentLocation,
  setCurrentLocation,
  visitApproved,
  onPrev,
  onNext,
  visitorName,
  setVisitorName,
  visitorPhone,
  setVisitorPhone,
  visitorEmail,
  setVisitorEmail,
  visitDate,
  setVisitDate,
  visitTime,
  setVisitTime,
  reservationData,
  reservationCode,
  readOnly,
}) => {
  const navigate = useNavigate();
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const availableDates = useMemo(() => getAvailableDates(10), []);

  /* ── handlers ── */
  const handleConfirmSubmit = () => {
    setShowConfirmModal(false);
    setIsSubmitted(true);
    setShowReceiptModal(true);
  };

  const handleReturnToDashboard = () => {
    setShowReceiptModal(false);
    onNext(); // save the visit data first
  };

  const canSubmit = policiesAccepted && visitDate && visitTime && !isSubmitted;

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge">
          <span>Step 2 · Verification</span>
        </div>
        <h2 className="main-header-title">Schedule Your Visit</h2>
        <p className="main-header-subtitle">
          Pick an available date and time to visit the dormitory. Review our
          policies before confirming your booking.
        </p>
      </div>

      {/* Read-Only Banner */}
      {readOnly && (
        <div
          className="info-box"
          style={{
            background: "#FEF3C7",
            borderColor: "#F59E0B",
            marginBottom: "16px",
          }}
        >
          <div className="info-box-title" style={{ color: "#92400E" }}>
            This section is locked
          </div>
          <div className="info-text" style={{ color: "#78350F" }}>
            Your visit has been scheduled. This step can no longer be edited.
          </div>
        </div>
      )}

      {/* Form content wrapper — disable interaction when readOnly */}
      <div
        style={{
          pointerEvents: readOnly ? "none" : "auto",
          opacity: readOnly ? 0.7 : 1,
        }}
      >
        {/* ── Card 1: Select Date ── */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Choose a Date
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "#64748B",
              marginBottom: "14px",
              marginTop: "-8px",
            }}
          >
            Available weekdays for the next 2 weeks
          </p>
          <div style={S.dateGrid}>
            {availableDates.map((date) => {
              const iso = toISODate(date);
              const selected = visitDate === iso;
              return (
                <div
                  key={iso}
                  style={S.dateCard(selected)}
                  onClick={() => {
                    setVisitDate(iso);
                    if (visitTime) setVisitTime(""); // reset time on date change
                  }}
                >
                  <div style={S.dateDay(selected)}>
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div style={S.dateNum(selected)}>
                    {date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Card 2: Select Time ── */}
        {visitDate && (
          <div className="content-card">
            <div className="card-section-title">
              <div className="icon"></div>
              Choose a Time
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "#64748B",
                marginBottom: "14px",
                marginTop: "-8px",
              }}
            >
              Available time slots for{" "}
              <strong>{fmtDate(new Date(visitDate + "T00:00:00"))}</strong>
            </p>
            <div style={S.timeGrid}>
              {TIME_SLOTS.map((slot) => {
                const selected = visitTime === slot;
                return (
                  <div
                    key={slot}
                    style={S.timeSlot(selected)}
                    onClick={() => setVisitTime(slot)}
                  >
                    {slot}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Selected Summary ── */}
        {visitDate && visitTime && (
          <div
            className="content-card"
            style={{ background: "#F0F9FF", borderColor: "#BAE6FD" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#0C375F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  color: "white",
                  flexShrink: 0,
                }}
              >
                ✓
              </div>
              <div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0C375F",
                  }}
                >
                  {fmtDate(new Date(visitDate + "T00:00:00"))} at {visitTime}
                </div>
                <div style={{ fontSize: "12px", color: "#64748B" }}>
                  Your selected visit slot
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Card 3: Policies & Terms ── */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Policies, Terms & Conditions
          </div>

          <div className="info-box" style={{ marginBottom: "16px" }}>
            <div className="info-box-title">Required Reading</div>
            <div className="info-text">
              Please review all dormitory policies and terms before confirming
              your visit schedule.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPoliciesModal(true)}
            className="btn btn-secondary"
            style={{ marginBottom: "16px" }}
          >
            Read Full Policies & Terms
          </button>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="policies-accepted"
              checked={policiesAccepted}
              onChange={(e) => setPoliciesAccepted(e.target.checked)}
            />
            <label htmlFor="policies-accepted" className="checkbox-label">
              I have read and agree to the dormitory policies, terms &
              conditions, and privacy policy
            </label>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="btn btn-primary"
            disabled={!canSubmit}
          >
            Confirm Visit
          </button>
        </div>

        {/* ════════ Confirmation Modal ════════ */}
        {showConfirmModal && (
          <div style={S.modalOverlay}>
            <div
              style={{ ...S.modalCard, maxWidth: "420px", textAlign: "center" }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#EFF6FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: "24px",
                }}
              >
                Date
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#1F2937",
                  margin: "0 0 8px",
                }}
              >
                Confirm Your Visit
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
                  margin: "0 0 8px",
                  lineHeight: "1.5",
                }}
              >
                You're booking a visit on:
              </p>
              <div
                style={{
                  background: "#F8FAFC",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#0C375F",
                  }}
                >
                  {visitDate && fmtDateFull(visitDate + "T00:00:00")}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#E7710F",
                    fontWeight: 600,
                  }}
                >
                  {visitTime}
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSubmit}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Yes, Book Visit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════ Receipt Modal ════════ */}
        {showReceiptModal && (
          <div style={S.modalOverlay}>
            <div style={S.modalCard}>
              {/* Receipt Header */}
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div
                  className="success-icon"
                  style={{
                    margin: "0 auto 12px",
                    width: "48px",
                    height: "48px",
                    fontSize: "22px",
                  }}
                >
                  ✓
                </div>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    color: "#1F2937",
                    margin: "0 0 4px",
                  }}
                >
                  Visit Confirmed!
                </h3>
                <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
                  Your visit has been booked successfully
                </p>
              </div>

              {/* Reference Code */}
              <div
                className="reservation-code"
                style={{ marginBottom: "20px" }}
              >
                <div className="code-label">Reference Code</div>
                <div className="code-value" style={{ fontSize: "18px" }}>
                  {reservationCode || "PENDING"}
                </div>
              </div>

              {/* Receipt Details */}
              <div className="detail-list">
                <div className="detail-item">
                  <span className="detail-label">Visit Date</span>
                  <span className="detail-value">
                    {fmtDateFull(visitDate + "T00:00:00")}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Visit Time</span>
                  <span className="detail-value">{visitTime}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Room</span>
                  <span className="detail-value">
                    {reservationData?.room?.roomNumber ||
                      reservationData?.room?.name ||
                      reservationData?.room?.title ||
                      "N/A"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Branch</span>
                  <span
                    className="detail-value"
                    style={{ textTransform: "capitalize" }}
                  >
                    {reservationData?.room?.branch || "N/A"}
                  </span>
                </div>
                <div className="detail-item" style={{ borderBottom: "none" }}>
                  <span className="detail-label">Status</span>
                  <span
                    className="detail-value"
                    style={{ color: "#2563EB", fontWeight: "600" }}
                  >
                    Visit Scheduled
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="info-box" style={{ margin: "16px 0 0" }}>
                <div className="info-text">
                  Please arrive on time. After your visit, the admin will verify
                  your attendance and approve your reservation to proceed.
                </div>
              </div>

              {/* Return to Dashboard Button */}
              <div style={{ marginTop: "20px" }}>
                <button
                  onClick={handleReturnToDashboard}
                  className="btn btn-primary btn-full"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Close pointer-events wrapper */}
      </div>

      {/* Policies Modal */}
      <PoliciesTermsModal
        isOpen={showPoliciesModal}
        onClose={() => setShowPoliciesModal(false)}
      />
    </div>
  );
};

export default ReservationVisitStep;
