import React from "react";
import {
  formatBranch,
  formatRoomType,
  fmtDate,
} from "../../../../shared/utils/formatDate";

/**
 * Step 4 — Reservation Fee Payment
 * User reviews a breakdown of costs and uploads proof of payment.
 */

const ReservationPaymentStep = ({
  reservationData,
  leaseDuration,
  finalMoveInDate,
  setFinalMoveInDate,
  onMoveInDateUpdate,
  paymentMethod,
  setPaymentMethod,
  proofOfPayment,
  setProofOfPayment,
  isLoading,
  onPrev,
  onNext,
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
          Review your reservation breakdown and upload proof of payment to
          secure your room. A one-time reservation fee of ₱2,000 is required.
        </p>
      </div>

      {/* Read-Only Banner */}
      {readOnly && (
        <div
          className="info-box"
          style={{
            background: "#FEF3C7",
            borderColor: "#F59E0B",
            marginBottom: "20px",
          }}
        >
          <div className="info-box-title" style={{ color: "#92400E" }}>
            This section is locked
          </div>
          <div className="info-text" style={{ color: "#78350F" }}>
            Payment has been submitted and is being processed by admin.
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
              <span className="summary-value">{formatRoomType(room.type)}</span>
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

        {/* Payment Method & Upload */}
        <div className="content-card">
          <div className="card-section-title">
            <div className="icon"></div>
            Payment Information
          </div>

          {/* Bank Details */}
          <div className="info-box" style={{ marginBottom: "20px" }}>
            <div className="info-box-title">Payment Details</div>
            <div className="info-text">
              <strong>Bank Account:</strong> BDO — 1234-5678-9012
              <br />
              <strong>Account Name:</strong> Dormitory Services Inc.
              <br />
              <strong>Amount Due:</strong> ₱2,000 (Reservation Fee)
            </div>
          </div>

          {/* Payment Method */}
          <div className="form-group">
            <label className="form-label">Payment Method</label>
            <select
              className="form-select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="bank">Bank Transfer</option>
              <option value="gcash">GCash</option>
              <option value="card">Credit/Debit Card</option>
              <option value="check">Check</option>
            </select>
          </div>

          {/* Proof of Payment */}
          <div className="form-group">
            <label className="form-label">Upload Proof of Payment</label>
            <label className="file-upload" htmlFor="payment-file">
              <input
                id="payment-file"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setProofOfPayment(e.target.files?.[0] || null)}
              />
              <div className="file-icon"></div>
              <div className="file-text">
                {proofOfPayment
                  ? `${proofOfPayment.name}`
                  : "Click to upload receipt or screenshot"}
              </div>
            </label>
            <div className="form-helper">
              Accepted formats: JPG, PNG, PDF. Max file size: 10MB.
            </div>
          </div>
        </div>

        {/* Close pointer-events wrapper */}
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button
            onClick={onNext}
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? "Processing…" : "Confirm Payment & Reserve"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ReservationPaymentStep;
