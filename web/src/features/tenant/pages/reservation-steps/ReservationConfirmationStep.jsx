import React, { useRef, useState, useEffect, useCallback } from "react";
import { formatBranch, fmtDate } from "../../../../shared/utils/formatDate";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";
import {
  Home,
  Calendar,
  CreditCard,
  Printer,
  CheckCircle,
} from "lucide-react";

/**
 * Step 5 — Reservation Secured
 * Celebration screen with summary, auto-redirect, and clear navigation.
 */
const REDIRECT_SECONDS = 15;

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
  isPaymentReturn = false,
}) => {
  const receiptRef = useRef(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const [paused, setPaused] = useState(!isPaymentReturn);
  const reservationFeeAmount = reservationData?.reservationFeeAmount || 2000;

  useEffect(() => {
    if (paused || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onViewDetails?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, countdown, onViewDetails]);

  const pauseRedirect = useCallback(() => setPaused(true), []);

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    pauseRedirect();
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
            <div class="receipt-row"><span class="label">Move-In Date</span><span class="value">${fmtDate(finalMoveInDate)}</span></div>
            ${visitDate ? `<div class="receipt-row"><span class="label">Visit Date</span><span class="value">${fmtDate(visitDate)} at ${visitTime || ""}</span></div>` : ""}
          </div>
          <div class="receipt-section">
            <h3>Payment</h3>
            <div class="receipt-row"><span class="label">Method</span><span class="value">${formatPaymentMethod(paymentMethod)}</span></div>
            <div class="receipt-row"><span class="label">Status</span><span class="value" style="color: #059669;">✓ Paid</span></div>
            <div class="receipt-total"><span>Reservation Fee</span><span>PHP ${reservationFeeAmount.toLocaleString("en-PH")}</span></div>
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
    <div ref={receiptRef} className="rf-confirmation-wrapper">
      {/* ── Celebration Header ── */}
      <div className="rf-celebration-banner">
        <div className="rf-check-circle">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 6L9 17l-5-5"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="rf-celebration-title">You're All Set!</h1>
        <p className="rf-celebration-subtitle">
          Your room has been reserved. Here's a summary of your reservation.
        </p>
      </div>

      {/* ── Reservation Code ── */}
      <div className="rf-code-card">
        <div className="rf-code-label">Your Reservation Code</div>
        <div className="rf-code-value">{reservationCode || "—"}</div>
        <div className="rf-code-hint">
          Save this code — you'll need it on your move-in day
        </div>
      </div>

      {/* ── Quick Summary Grid ── */}
      <div className="rf-summary-grid">
        <div className="rf-summary-card">
          <div className="rf-summary-icon">
            <Home size={22} />
          </div>
          <div className="rf-summary-label">Room</div>
          <div className="rf-summary-value">
            {room.roomNumber || room.name || room.title || "—"}
          </div>
          <div className="rf-summary-meta">{formatBranch(room.branch)}</div>
        </div>
        <div className="rf-summary-card">
          <div className="rf-summary-icon">
            <Calendar size={22} />
          </div>
          <div className="rf-summary-label">Move-In Date</div>
          <div className="rf-summary-value">{fmtDate(finalMoveInDate)}</div>
          <div className="rf-summary-meta">
            {leaseDuration || 12}-month lease
          </div>
        </div>
        <div className="rf-summary-card">
          <div className="rf-summary-icon">
            <CreditCard size={22} />
          </div>
          <div className="rf-summary-label">Payment</div>
          <div className="rf-summary-value rf-summary-value--paid">
            <CheckCircle size={14} /> Paid
          </div>
          <div className="rf-summary-meta">
            {formatPaymentMethod(paymentMethod)}
          </div>
        </div>
      </div>


      {/* ── Action Buttons ── */}
      <div className="rf-conf-buttons-row">
        <button
          onClick={() => {
            pauseRedirect();
            onViewDetails?.();
          }}
          className="rf-conf-primary-btn"
        >
          View My Reservation →
        </button>
        <button
          onClick={() => {
            pauseRedirect();
            onReturnHome?.();
          }}
          className="rf-conf-secondary-btn"
        >
          Go to Dashboard
        </button>
      </div>

      {/* ── Print Receipt ── */}
      <div className="rf-print-row">
        <button onClick={handlePrint} className="rf-print-link">
          <Printer size={14} /> Print / Download Receipt
        </button>
      </div>

      {/* ── Auto-redirect countdown ── */}
      {isPaymentReturn && !paused && countdown > 0 && (
        <div className="rf-redirect-row">
          <span className="rf-redirect-text">
            Taking you to your reservation in <strong>{countdown}s</strong>...
          </span>
          <button onClick={pauseRedirect} className="rf-redirect-cancel">
            Stay here
          </button>
        </div>
      )}
    </div>
  );
};

export default ReservationConfirmationStep;
