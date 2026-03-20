import React from "react";
import {
  formatBranch,
  formatRoomType,
  fmtDate,
} from "../../../../shared/utils/formatDate";
import { CreditCard } from "lucide-react";

/**
 * Step 4 — Reservation Fee Payment
 * PayMongo online checkout only (GCash, Maya, Card).
 */

const ReservationPaymentStep = ({
  reservationData,
  leaseDuration,
  finalMoveInDate,
  setFinalMoveInDate,
  onMoveInDateUpdate,
  isLoading,
  onPayOnline,
  payingOnline,
  readOnly,
}) => {
  const room = reservationData?.room || {};
  const roomName =
    room.name || room.roomNumber || room.title || room.id || "N/A";

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge">
          <span>Step 4 · Finalization</span>
        </div>
        <h2 className="main-header-title">Reservation Fee Payment</h2>
        <p className="main-header-subtitle">
          Review your reservation breakdown and pay the one-time reservation fee
          of ₱2,000 to secure your room.
        </p>
      </div>

      {/* Read-Only Banner */}
      {readOnly && (
        <div
          className="info-box"
          style={{
            background: "#ECFDF5",
            borderColor: "#10B981",
            marginBottom: "20px",
          }}
        >
          <div className="info-box-title" style={{ color: "#065F46" }}>
            Payment Complete
          </div>
          <div className="info-text" style={{ color: "#047857" }}>
            Your reservation fee has been paid and your room is reserved.
          </div>
        </div>
      )}

      {/* Form content wrapper */}
      <div
        style={{
          pointerEvents: readOnly ? "none" : "auto",
          opacity: readOnly ? 0.7 : 1,
        }}
      >
        {/* Reservation Breakdown */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Reservation Breakdown
          </div>

          <div className="summary-section">
            <div className="summary-row">
              <span className="summary-label">Room</span>
              <span className="summary-value" style={{ fontWeight: "600" }}>
                {roomName}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Branch</span>
              <span className="summary-value">{formatBranch(room.branch)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Room Type</span>
              <span className="summary-value">
                {formatRoomType(room.type)}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Monthly Rent</span>
              <span
                className="summary-value"
                style={{ color: "var(--rf-accent)" }}
              >
                ₱{(room.price || 0).toLocaleString()}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Lease Duration</span>
              <span className="summary-value">
                {leaseDuration || 12} months
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Target Move-In Date</span>
              <span className="summary-value">{fmtDate(finalMoveInDate)}</span>
            </div>
            {reservationData?.selectedBed && (
              <div className="summary-row">
                <span className="summary-label">Selected Bed</span>
                <span className="summary-value">
                  {reservationData.selectedBed.position} (
                  {reservationData.selectedBed.id})
                </span>
              </div>
            )}
            <div className="total-section">
              <span>Reservation Fee (One-time)</span>
              <span className="total-amount">₱2,000</span>
            </div>
          </div>
        </div>

        {/* Move-In Date Adjustment */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Adjust Move-In Date
            <span
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: "var(--rf-text-muted)",
                marginLeft: "auto",
              }}
            >
              Optional
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Move-In Date</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="date"
                className="form-input"
                value={finalMoveInDate}
                onChange={(e) => setFinalMoveInDate(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onMoveInDateUpdate}
                style={{ whiteSpace: "nowrap" }}
              >
                Re-Check Availability
              </button>
            </div>
            <div className="form-helper">
              If you need to change your move-in date, select a new date and
              click "Re-Check" to verify room availability.
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Secure Online Payment
          </div>

          <div
            className="info-box"
            style={{
              background: "#ECFDF5",
              borderColor: "#10B981",
              marginBottom: "0",
            }}
          >
            <div className="info-box-title" style={{ color: "#065F46" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CreditCard size={15} /> Pay via GCash, Maya, or Card</span>
            </div>
            <div className="info-text" style={{ color: "#047857" }}>
              You'll be redirected to PayMongo's secure checkout to pay ₱2,000.
              Your reservation will be automatically confirmed once payment is
              received. A receipt will be available after payment.
            </div>
          </div>
        </div>
      </div>

      {/* Pay Online Button */}
      {!readOnly && (
      <div className="stage-buttons" style={{ justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button
            onClick={onPayOnline}
            className="btn btn-primary btn-pay-online-reservation"
            disabled={isLoading || payingOnline}
          >
            {payingOnline
              ? "Redirecting to PayMongo…"
              : <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><CreditCard size={16} /> Pay ₱2,000 Online</span>}
          </button>
          <span style={{ fontSize: 12, color: "#94A3B8", textAlign: "right" }}>
            Didn't finish paying? No worries — clicking the button will resume your session.
          </span>
        </div>
      )}
    </div>
  );
};

export default ReservationPaymentStep;
