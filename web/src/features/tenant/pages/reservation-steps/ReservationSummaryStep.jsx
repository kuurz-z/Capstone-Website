import React from "react";
import {
  formatBranch,
  formatRoomType,
} from "../../../../shared/utils/formatDate";

/**
 * Step 1 — Room Selection Summary
 * Shows the selected room details before the user confirms and proceeds.
 */
const ReservationSummaryStep = ({ reservationData, onNext, readOnly }) => {
  const room = reservationData?.room || {};

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge">
          <span>Step 1 · Getting Started</span>
        </div>
        <h2 className="main-header-title">Room Summary</h2>
        <p className="main-header-subtitle">
          Review the details of your selected room below. Once confirmed, you'll
          proceed to schedule your visit.
        </p>
      </div>

      {/* Room Details Card */}
      <div className="content-card">
        <div className="card-section-title">
          <div className="icon"></div>
          Room Information
        </div>

        <div className="summary-section">
          <div className="summary-row">
            <span className="summary-label">Branch</span>
            <span className="summary-value">{formatBranch(room.branch)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Room Type</span>
            <span className="summary-value">{formatRoomType(room.type)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Room Number</span>
            <span className="summary-value">
              {room.roomNumber || room.name || room.title || room.id || "N/A"}
            </span>
          </div>
          {reservationData?.selectedBed && (
            <div className="summary-row">
              <span className="summary-label">Selected Bed</span>
              <span
                className="summary-value"
                style={{ textTransform: "capitalize" }}
              >
                {reservationData.selectedBed.position} Bed (
                {reservationData.selectedBed.id})
              </span>
            </div>
          )}
          {reservationData?.applianceFees > 0 && (
            <div className="summary-row">
              <span className="summary-label">Appliance Fees</span>
              <span className="summary-value">
                ₱{reservationData.applianceFees.toLocaleString()}/month
              </span>
            </div>
          )}
          <div className="total-section">
            <span>Monthly Rent</span>
            <span className="total-amount">
              ₱{(room.price || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="info-box">
        <div className="info-box-title">What happens next?</div>
        <div className="info-text">
          After confirming, you'll be asked to schedule a dormitory visit so you
          can see the room in person before finalizing your application.
        </div>
      </div>

      {/* Read-Only Notice */}
      {readOnly && (
        <div
          className="info-box"
          style={{ background: "#FEF3C7", borderColor: "#F59E0B" }}
        >
          <div className="info-box-title" style={{ color: "#92400E" }}>
            This step is locked
          </div>
          <div className="info-text" style={{ color: "#78350F" }}>
            Room selection has been confirmed and cannot be changed.
          </div>
        </div>
      )}

      {/* Action */}
      {!readOnly && (
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button onClick={onNext} className="btn btn-primary">
            Confirm Room & Continue
          </button>
        </div>
      )}
    </div>
  );
};

export default ReservationSummaryStep;
