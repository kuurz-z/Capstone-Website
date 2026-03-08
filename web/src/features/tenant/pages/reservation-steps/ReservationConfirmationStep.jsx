import React, { useRef } from "react";

/**
 * Step 5 — Reservation Confirmed
 * Comprehensive summary receipt with Print/Download capability.
 */
const ReservationConfirmationStep = ({
  reservationData,
  reservationCode,
  finalMoveInDate,
  leaseDuration,
  paymentMethod,
  applicantName,
  applicantEmail,
  applicantPhone,
  visitDate,
  visitTime,
  onViewDetails,
  onReturnHome,
}) => {
  const receiptRef = useRef(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatPaymentMethod = (method) => {
    const methods = {
      bank: "Bank Transfer",
      gcash: "GCash",
      card: "Credit/Debit Card",
      check: "Check",
    };
    return methods[method] || method || "N/A";
  };

  const formatBranch = (branch) => {
    if (!branch) return "N/A";
    if (branch.includes(" ") && !branch.includes("-")) return branch;
    return branch
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Reservation Receipt - ${reservationCode || "Lilycrest"}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1F2937; max-width: 700px; margin: 0 auto; }
            .receipt-header { text-align: center; border-bottom: 2px solid #1F2937; padding-bottom: 20px; margin-bottom: 24px; }
            .receipt-header h1 { font-size: 22px; margin: 0 0 4px; }
            .receipt-header p { margin: 0; color: #6B7280; font-size: 13px; }
            .receipt-code { text-align: center; background: #F3F4F6; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
            .receipt-code .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; margin-bottom: 4px; }
            .receipt-code .code { font-size: 28px; font-weight: 700; letter-spacing: 3px; }
            .receipt-section { margin-bottom: 20px; }
            .receipt-section h3 { font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-bottom: 12px; }
            .receipt-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .receipt-row .label { color: #6B7280; }
            .receipt-row .value { font-weight: 500; text-align: right; }
            .receipt-total { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #1F2937; font-size: 16px; font-weight: 700; margin-top: 8px; }
            .receipt-footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1>Lilycrest Dormitory</h1>
            <p>Reservation Confirmation Receipt</p>
            <p>Date Issued: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          <div class="receipt-code">
            <div class="label">Reservation Code</div>
            <div class="code">${reservationCode || "—"}</div>
          </div>
          <div class="receipt-section">
            <h3>Applicant Information</h3>
            <div class="receipt-row"><span class="label">Name</span><span class="value">${applicantName || "N/A"}</span></div>
            <div class="receipt-row"><span class="label">Email</span><span class="value">${applicantEmail || "N/A"}</span></div>
            <div class="receipt-row"><span class="label">Phone</span><span class="value">${applicantPhone || "N/A"}</span></div>
          </div>
          <div class="receipt-section">
            <h3>Room Details</h3>
            <div class="receipt-row"><span class="label">Room</span><span class="value">${reservationData?.room?.roomNumber || reservationData?.room?.name || "N/A"}</span></div>
            <div class="receipt-row"><span class="label">Branch</span><span class="value">${formatBranch(reservationData?.room?.branch)}</span></div>
            <div class="receipt-row"><span class="label">Type</span><span class="value">${(reservationData?.room?.type || "N/A").charAt(0).toUpperCase() + (reservationData?.room?.type || "").slice(1)}</span></div>
            <div class="receipt-row"><span class="label">Monthly Rate</span><span class="value">₱${(reservationData?.room?.price || 0).toLocaleString()}</span></div>
            <div class="receipt-row"><span class="label">Lease Duration</span><span class="value">${leaseDuration || 12} months</span></div>
          </div>
          <div class="receipt-section">
            <h3>Schedule</h3>
            <div class="receipt-row"><span class="label">Move-In Date</span><span class="value">${formatDate(finalMoveInDate)}</span></div>
            ${visitDate ? `<div class="receipt-row"><span class="label">Visit Date</span><span class="value">${formatDate(visitDate)} at ${visitTime || ""}</span></div>` : ""}
          </div>
          <div class="receipt-section">
            <h3>Payment</h3>
            <div class="receipt-row"><span class="label">Method</span><span class="value">${formatPaymentMethod(paymentMethod)}</span></div>
            <div class="receipt-row"><span class="label">Status</span><span class="value" style="color: #059669;">✓ Paid</span></div>
            <div class="receipt-total"><span>Reservation Fee</span><span>₱2,000</span></div>
          </div>
          <div class="receipt-footer">
            <p>This is an official receipt from Lilycrest Dormitory Management System.</p>
            <p>For inquiries, contact reservations@lilycrest.com</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const room = reservationData?.room || {};

  return (
    <div className="reservation-card confirmation-card" ref={receiptRef}>
      {/* Success Icon */}
      <div className="success-icon">✓</div>

      {/* Header */}
      <div className="main-header" style={{ textAlign: "center" }}>
        <div className="main-header-badge">
          <span>Step 5 · Finalization</span>
        </div>
        <h2 className="main-header-title">Reservation Confirmed!</h2>
        <p className="main-header-subtitle">
          Your dormitory reservation has been successfully secured. Below is
          your complete reservation summary.
        </p>
      </div>

      {/* Reservation Code */}
      <div className="reservation-code">
        <div className="code-label">Your Reservation Code</div>
        <div className="code-value">{reservationCode || "—"}</div>
      </div>

      {/* Applicant Summary */}
      <div className="content-card" style={{ textAlign: "left" }}>
        <div className="card-section-title">
          <div className="icon"></div>
          Applicant Information
        </div>
        <div className="detail-list">
          <div className="detail-item">
            <span className="detail-label">Name</span>
            <span className="detail-value">{applicantName || "N/A"}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Email</span>
            <span className="detail-value">{applicantEmail || "N/A"}</span>
          </div>
          {applicantPhone && (
            <div className="detail-item">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{applicantPhone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Room Summary */}
      <div className="content-card" style={{ textAlign: "left" }}>
        <div className="card-section-title">
          <div className="icon"></div>
          Room Details
        </div>
        <div className="detail-list">
          <div className="detail-item">
            <span className="detail-label">Room</span>
            <span className="detail-value" style={{ fontWeight: "600" }}>
              {room.roomNumber || room.name || room.title || room.id || "N/A"}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Branch</span>
            <span className="detail-value">{formatBranch(room.branch)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Room Type</span>
            <span className="detail-value">
              {room.type
                ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
                : "N/A"}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Monthly Rate</span>
            <span
              className="detail-value"
              style={{ color: "var(--rf-accent)", fontWeight: "600" }}
            >
              ₱{(room.price || 0).toLocaleString()}
            </span>
          </div>
          {reservationData?.selectedBed && (
            <div className="detail-item">
              <span className="detail-label">Selected Bed</span>
              <span className="detail-value">
                {reservationData.selectedBed.position} (
                {reservationData.selectedBed.id})
              </span>
            </div>
          )}
          <div className="detail-item">
            <span className="detail-label">Lease Duration</span>
            <span className="detail-value">{leaseDuration || 12} months</span>
          </div>
        </div>
      </div>

      {/* Schedule Summary */}
      <div className="content-card" style={{ textAlign: "left" }}>
        <div className="card-section-title">
          <div className="icon"></div>
          Schedule
        </div>
        <div className="detail-list">
          <div className="detail-item">
            <span className="detail-label">Move-In Date</span>
            <span className="detail-value">{formatDate(finalMoveInDate)}</span>
          </div>
          {visitDate && (
            <div className="detail-item">
              <span className="detail-label">Visit Date</span>
              <span className="detail-value">
                {formatDate(visitDate)} {visitTime ? `at ${visitTime}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Summary */}
      <div className="content-card" style={{ textAlign: "left" }}>
        <div className="card-section-title">
          <div className="icon"></div>
          Payment Details
        </div>
        <div className="detail-list">
          <div className="detail-item">
            <span className="detail-label">Payment Method</span>
            <span className="detail-value">
              {formatPaymentMethod(paymentMethod)}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Reservation Fee</span>
            <span className="detail-value" style={{ fontWeight: "600" }}>
              ₱2,000
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Payment Status</span>
            <span
              className="detail-value"
              style={{ color: "var(--rf-success)", fontWeight: "600" }}
            >
              ✓ Paid & Confirmed
            </span>
          </div>
        </div>
      </div>

      {/* What's Next */}
      <div className="content-card" style={{ textAlign: "left" }}>
        <div className="card-section-title">
          <div className="icon"></div>
          What's Next
        </div>

        <div className="info-box">
          <div className="info-box-title">Prepare for Move-In</div>
          <div className="info-text">
            <strong>Move-In Date:</strong> {formatDate(finalMoveInDate)}
            <br />
            <strong>Reservation Valid Until:</strong>{" "}
            {new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toLocaleDateString()}
            <br />
            <br />
            <strong>Required Documents for Check-In:</strong>
            <br />• Valid Government-issued ID
            <br />• This reservation code
            <br />• First month's rent payment
            <br />
            <br />
            <strong>Contact:</strong> reservations@lilycrest.com
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="action-buttons">
        <button
          onClick={handlePrint}
          className="btn btn-secondary btn-full"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          Print / Download Receipt
        </button>
        <button onClick={onViewDetails} className="btn btn-primary btn-full">
          View Reservation Details
        </button>
        <button onClick={onReturnHome} className="btn btn-secondary btn-full">
          Return to Home
        </button>
      </div>
    </div>
  );
};

export default ReservationConfirmationStep;
