import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, FileText, X, CheckCircle, AlertTriangle } from "lucide-react";
import { showNotification } from "../../../../shared/utils/notification";
import { PoliciesTermsModal } from "../../modals/PoliciesAndConsent";

/* ── Available time slots ─────────────────────────────────────────────── */
const TIME_SLOTS = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM",
];

/* ── Helper: generate next N weekdays ───────────────────────────────── */
function getAvailableDates(count = 10) {
  const dates = [];
  const d = new Date();
  d.setDate(d.getDate() + 1); // start from tomorrow
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function fmtDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateFull(dateStr) {
  if (!dateStr) return "N/A";
  const cleanDate = String(dateStr).split("T")[0];
  return new Date(cleanDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function toISODate(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Step 2 — Visit Scheduling & Policies
 */
const ReservationVisitStep = ({
  targetMoveInDate, viewingType, setViewingType,
  isOutOfTown, setIsOutOfTown, currentLocation, setCurrentLocation,
  visitApproved, onPrev, onNext,
  visitorName, setVisitorName, visitorPhone, setVisitorPhone, visitorEmail, setVisitorEmail,
  visitDate, setVisitDate, visitTime, setVisitTime,
  reservationData, reservationCode, visitCode,
  onSaveVisit, onAfterClose, readOnly, agreedToPrivacy,
  scheduleRejected, scheduleRejectionReason,
}) => {
  const navigate = useNavigate();
  const [policiesAccepted, setPoliciesAccepted] = useState(agreedToPrivacy || readOnly || false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resolvedVisitCode, setResolvedVisitCode] = useState(visitCode || null);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoveredTime, setHoveredTime] = useState(null);

  const availableDates = useMemo(() => getAvailableDates(10), []);

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    try {
      const code = onSaveVisit ? await onSaveVisit() : null;
      setResolvedVisitCode(code || visitCode || null);
    } catch (err) {
      console.error("Failed to save visit:", err);
    } finally {
      setIsSaving(false);
    }
    setIsSubmitted(true);
    setShowReceiptModal(true);
  };

  const handleReturnToDashboard = () => {
    setShowReceiptModal(false);
    if (onAfterClose) onAfterClose();
    else navigate("/applicant/profile");
  };

  const canSubmit = policiesAccepted && visitDate && visitTime && !isSubmitted;

  const ctaLabel = useCallback(() => {
    if (!visitDate) return "Select a date to continue";
    if (!visitTime) return "Select a time to continue";
    if (!policiesAccepted) return "Accept policies to continue";
    return "Confirm Visit";
  }, [visitDate, visitTime, policiesAccepted]);

  const handleSubmitWithValidation = () => {
    if (!visitDate) {
      showNotification("Please select a visit date to continue.", "error", 3000);
      document.getElementById("visit-date-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!visitTime) {
      showNotification("Please select a time slot for your visit.", "error", 3000);
      document.getElementById("visit-time-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!policiesAccepted) {
      showNotification("Please agree to the policies and terms to continue.", "error", 3000);
      document.getElementById("visit-policies-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setShowConfirmModal(true);
  };

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge"><span>Step 2 · Verification</span></div>
        <h2 className="main-header-title">Schedule Your Visit</h2>
        <p className="main-header-subtitle">
          Pick an available date and time to visit the dormitory. Review our
          policies before confirming your booking.
        </p>
      </div>

      {/* Rejection Banner */}
      {scheduleRejected && (
        <div className="rf-rejection-banner">
          <AlertTriangle size={20} color="var(--rf-error-text)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="rf-rejection-banner__title">Your previous visit schedule was rejected</div>
            {scheduleRejectionReason && (
              <div className="rf-rejection-banner__reason">
                <strong>Reason:</strong> {scheduleRejectionReason}
              </div>
            )}
            <div className="rf-rejection-banner__hint">
              Please select a new date and time below to reschedule your visit.
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Banner */}
      {readOnly && (
        <div className="rf-locked-banner">
          <div className="info-box-title">This section is locked</div>
          <div className="info-text">Your visit has been scheduled. This step can no longer be edited.</div>
        </div>
      )}

      {/* Form content wrapper */}
      <div className={readOnly ? "rf-readonly-wrapper" : ""}>
        {/* ── Card 1: Select Date ── */}
        <div className="content-card" id="visit-date-section">
          <div className="card-section-title">
            <Calendar size={15} style={{ marginRight: 6, flexShrink: 0 }} />
            Choose a Date
          </div>
          <p className="rf-section-hint">Available weekdays for the next 2 weeks</p>
          <div className="rf-date-grid">
            {availableDates.map((date, idx) => {
              const iso = toISODate(date);
              const selected = visitDate === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  className="rf-date-btn"
                  onClick={() => { setVisitDate(iso); if (visitTime) setVisitTime(""); }}
                  onMouseEnter={() => setHoveredDate(iso)}
                  onMouseLeave={() => setHoveredDate(null)}
                  aria-pressed={selected}
                  aria-label={date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                >
                  <div className={`rf-date-card${selected ? " selected" : ""}`}>
                    {idx === 0 && <span className="rf-today-pill">Tomorrow</span>}
                    <div className="rf-date-day">
                      {date.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className="rf-date-num">
                      {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Card 2: Select Time ── */}
        <div
          className="content-card"
          id="visit-time-section"
          style={{ opacity: visitDate ? 1 : 0.45, transition: "opacity 0.2s ease", pointerEvents: readOnly ? "none" : (visitDate ? "auto" : "none") }}
        >
          <div className="card-section-title">
            <Clock size={15} style={{ marginRight: 6, flexShrink: 0 }} />
            Choose a Time
          </div>
          <p className="rf-section-hint">
            {visitDate
              ? <><span>Available time slots for </span><strong>{fmtDate(new Date(visitDate + "T00:00:00"))}</strong></>
              : "Select a date first to see available times"}
          </p>
          <div className="rf-time-grid">
            {TIME_SLOTS.map((slot) => {
              const selected = visitTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  className="rf-time-btn"
                  onClick={() => setVisitTime(slot)}
                  onMouseEnter={() => setHoveredTime(slot)}
                  onMouseLeave={() => setHoveredTime(null)}
                  aria-pressed={selected}
                  aria-label={slot}
                >
                  <div className={`rf-time-slot${selected ? " selected" : ""}`}>{slot}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Card 3: Policies & Terms ── */}
        <div className="content-card" id="visit-policies-section">
          <div className="card-section-title">
            <FileText size={15} style={{ marginRight: 6, flexShrink: 0 }} />
            Policies, Terms & Conditions
          </div>
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="policies-accepted"
              checked={policiesAccepted || readOnly}
              onChange={(e) => setPoliciesAccepted(e.target.checked)}
            />
            <label htmlFor="policies-accepted" className="checkbox-label">
              I have read and agree to the{" "}
              <span className="rf-policies-link" onClick={() => setShowPoliciesModal(true)}>
                dormitory policies, terms & conditions, and privacy policy
              </span>
            </label>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button
            onClick={handleSubmitWithValidation}
            className="btn btn-primary"
            disabled={isSubmitted || isSaving}
          >
            {isSaving ? "Booking..." : ctaLabel()}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          visitDate={visitDate}
          visitTime={visitTime}
          onConfirm={handleConfirmSubmit}
          onClose={() => setShowConfirmModal(false)}
        />
      )}

      {/* Receipt Modal */}
      {showReceiptModal && (
        <ReceiptModal
          visitDate={visitDate}
          visitTime={visitTime}
          visitCode={resolvedVisitCode}
          reservationCode={reservationCode}
          reservationData={reservationData}
          onClose={handleReturnToDashboard}
        />
      )}

      {/* Policies Modal */}
      <PoliciesTermsModal
        isOpen={showPoliciesModal}
        onClose={() => setShowPoliciesModal(false)}
      />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   ConfirmModal — extracted sub-component
   ══════════════════════════════════════════════════════════════ */
function ConfirmModal({ visitDate, visitTime, onConfirm, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="rf-modal-overlay" onClick={onClose}>
      <div
        className="rf-modal-card"
        style={{ maxWidth: "420px", textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="rf-modal-close-btn" aria-label="Close">
          <X size={18} />
        </button>

        <div className="rf-modal-icon-wrap">
          <Calendar size={24} color="#3B82F6" />
        </div>

        <h3 className="rf-modal-title">Confirm Your Visit</h3>
        <p className="rf-modal-subtitle">You're booking a visit on:</p>

        <div className="rf-confirm-date-box">
          <div className="rf-confirm-date-box__date">
            {visitDate && fmtDateFull(visitDate + "T00:00:00")}
          </div>
          <div className="rf-confirm-date-box__time">
            <Clock size={13} />{visitTime}
          </div>
        </div>

        <div className="rf-modal-actions">
          <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Go Back</button>
          <button onClick={onConfirm} className="btn btn-primary" style={{ flex: 1 }}>Yes, Book Visit</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ReceiptModal — extracted sub-component
   ══════════════════════════════════════════════════════════════ */
function ReceiptModal({ visitDate, visitTime, visitCode, reservationCode, reservationData, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const room   = reservationData?.room?.roomNumber || reservationData?.room?.name || reservationData?.room?.title || "N/A";
  const branch = reservationData?.room?.branch || "N/A";

  return (
    <div className="rf-modal-overlay">
      <div className="rf-modal-card" style={{ maxWidth: 420 }}>
        <button type="button" onClick={onClose} className="rf-modal-close-btn" aria-label="Close">
          <X size={18} />
        </button>

        {/* Success header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(22,163,74,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <CheckCircle size={28} color="#16A34A" strokeWidth={2.5} />
          </div>
          <h3 className="rf-modal-title">Visit Confirmed!</h3>
          <p className="rf-modal-subtitle">Your visit has been booked successfully</p>
        </div>

        {/* Receipt card */}
        <div className="rf-receipt-card">
          <div className="rf-receipt-header">
            <span className="rf-receipt-header__label">Booking Summary</span>
            <span className="rf-receipt-header__badge">Visit Scheduled</span>
          </div>
          <div className="rf-receipt-rows">
            {/* Visit code — highlighted row */}
            <div className="rf-receipt-row rf-receipt-row--highlighted">
              <span className="rf-receipt-row__label">Visit Code</span>
              {visitCode
                ? <span className="rf-receipt-row__code">{visitCode}</span>
                : <span className="rf-receipt-row__code rf-receipt-row__code--pending">Generating…</span>
              }
            </div>
            {[
              { label: "Date",   value: fmtDateFull(visitDate), capitalize: false },
              { label: "Time",   value: visitTime,              capitalize: false },
              { label: "Room",   value: room,                   capitalize: false },
              { label: "Branch", value: branch,                 capitalize: true  },
            ].map((row) => (
              <div key={row.label} className="rf-receipt-row">
                <span className="rf-receipt-row__label">{row.label}</span>
                <span
                  className="rf-receipt-row__value"
                  style={{ textTransform: row.capitalize ? "capitalize" : "none" }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="rf-visit-note">
          <Clock size={15} color="var(--rf-info-icon)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p className="rf-visit-note__text">
            Please arrive on time. After your visit, the admin will verify your attendance and approve your reservation to proceed.
          </p>
        </div>

        <button onClick={onClose} className="btn btn-primary btn-full">Return to Dashboard</button>
      </div>
    </div>
  );
}

export default ReservationVisitStep;
