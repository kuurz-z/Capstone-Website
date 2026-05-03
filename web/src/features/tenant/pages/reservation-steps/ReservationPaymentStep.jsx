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
  agreedToFeePolicy = false,
  setAgreedToFeePolicy,
}) => {
  const room = reservationData?.room || {};
  const roomName = room.name || room.roomNumber || room.title || room.id || "N/A";
  const reservationFeeAmount = Number(reservationData?.reservationFeeAmount || 2000);

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge"><span>Step 4 · Finalization</span></div>
        <h2 className="main-header-title">Reservation Fee Payment</h2>
        <p className="main-header-subtitle">
          Review your reservation breakdown and pay the one-time reservation fee
          of ₱{reservationFeeAmount.toLocaleString()} to secure your room.
        </p>
      </div>

      {/* Read-Only Banner — Payment Complete */}
      {readOnly && (
        <div className="rf-success-banner">
          <div className="info-box-title">Payment Complete</div>
          <div className="info-text">Your reservation fee has been paid and your room is reserved.</div>
        </div>
      )}

      {/* Form content wrapper */}
      <div className={readOnly ? "rf-readonly-wrapper" : ""}>
        {/* Reservation Breakdown */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Reservation Breakdown
          </div>

          <div className="summary-section">
            <div className="summary-row">
              <span className="summary-label">Room</span>
              <span className="summary-value">{roomName}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Branch</span>
              <span className="summary-value">{formatBranch(room.branch)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Room Type</span>
              <span className="summary-value">{formatRoomType(room.type)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Monthly Rent</span>
              <span className="summary-value" style={{ color: "var(--rf-accent)" }}>
                ₱{(room.price || 0).toLocaleString()}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Lease Duration</span>
              <span className="summary-value">{leaseDuration || 12} months</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Target Move-In Date</span>
              <span className="summary-value">{fmtDate(finalMoveInDate)}</span>
            </div>
            {reservationData?.selectedBed && (
              <div className="summary-row">
                <span className="summary-label">Selected Bed</span>
                <span className="summary-value">
                  {reservationData.selectedBed.position} ({reservationData.selectedBed.id})
                </span>
              </div>
            )}
            <div className="total-section">
              <span>Reservation Fee (One-time)</span>
              <span className="total-amount">₱{reservationFeeAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Move-In Date Adjustment */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Adjust Move-In Date
            <span className="rf-optional-label">Optional</span>
          </div>
          <div className="form-group">
            <label className="form-label">Move-In Date</label>
            <div className="rf-date-input-row">
              <input
                type="date"
                className="form-input"
                value={finalMoveInDate}
                onChange={(e) => setFinalMoveInDate(e.target.value)}
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

        {/* Non-Refundable Fee Policy Notice */}
        {!readOnly && (
          <div className="content-card" style={{ border: "1px solid #fed7aa", background: "#fff7ed" }}>
            <div className="card-section-title" style={{ color: "#9a3412" }}>
              <div className="icon"></div>
              Reservation Fee Policy
            </div>
            <div style={{ fontSize: "14px", color: "#9a3412", lineHeight: 1.6, marginBottom: "14px" }}>
              <strong>Reservation fee is ₱{reservationFeeAmount.toLocaleString()}.</strong>
              <br />
              This will be <strong>deducted from your first monthly rent</strong> once you move in.
              <br />
              If you cancel your reservation, the reservation fee is <strong>non-refundable</strong>.
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "13px", color: "#7c2d12" }}>
              <input
                type="checkbox"
                checked={agreedToFeePolicy}
                onChange={(e) => setAgreedToFeePolicy?.(e.target.checked)}
                style={{ marginTop: "2px", accentColor: "#ea580c", width: "16px", height: "16px", flexShrink: 0 }}
              />
              <span>
                I understand that the reservation fee of ₱{reservationFeeAmount.toLocaleString()} is{" "}
                <strong>non-refundable</strong> if I cancel my reservation.
              </span>
            </label>
          </div>
        )}

        {/* Payment Info */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Secure Online Payment
          </div>
          <div className="rf-payment-info-box">
            <div className="info-box-title">
              <span className="rf-pay-btn-icon"><CreditCard size={15} /> Pay via GCash, Maya, or Card</span>
            </div>
            <div className="info-text">
              You'll be redirected to PayMongo's secure checkout to pay ₱{reservationFeeAmount.toLocaleString()}.
              Your reservation will be automatically confirmed once payment is
              received. A receipt will be available after payment.
            </div>
          </div>
        </div>
      </div>

      {/* Pay Online Button */}
      {!readOnly && (
        <div className="stage-buttons" style={{ justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {!agreedToFeePolicy && (
            <p style={{ fontSize: "12px", color: "#9a3412", margin: 0, textAlign: "right" }}>
              Please acknowledge the fee policy above before paying.
            </p>
          )}
          <button
            onClick={onPayOnline}
            className="btn btn-primary btn-pay-online-reservation"
            disabled={isLoading || payingOnline || !agreedToFeePolicy}
          >
            {payingOnline
              ? "Redirecting to PayMongo…"
              : <span className="rf-pay-btn-icon"><CreditCard size={16} /> Pay ₱{reservationFeeAmount.toLocaleString()} Online</span>
            }
          </button>
          <span className="rf-pay-hint">
            Didn't finish paying? No worries — clicking the button will resume your session.
          </span>
        </div>
      )}
    </div>
  );
};

export default ReservationPaymentStep;
