import React, { useRef, useState, useEffect, useCallback } from "react";
import { formatBranch, fmtDate } from "../../../../shared/utils/formatDate";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";
import { Home, Calendar, CreditCard, ClipboardList, Printer, CheckCircle } from "lucide-react";

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

  // Auto-redirect countdown
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
    <div ref={receiptRef} style={s.wrapper}>
      {/* ── Celebration Header ────────────────────────────────── */}
      <div style={s.celebrationBanner}>
        <div style={s.checkCircle}>
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
        <h1 style={s.celebrationTitle}>You're All Set!</h1>
        <p style={s.celebrationSubtitle}>
          Your room has been reserved. Here's a summary of your reservation.
        </p>
      </div>

      {/* ── Reservation Code ──────────────────────────────────── */}
      <div style={s.codeCard}>
        <div style={s.codeLabel}>Your Reservation Code</div>
        <div style={s.codeValue}>{reservationCode || "—"}</div>
        <div style={s.codeHint}>
          Save this code — you'll need it on your move-in day
        </div>
      </div>

      {/* ── Quick Summary Grid ────────────────────────────────── */}
      <div style={s.summaryGrid}>
        <div style={s.summaryCard}>
          <div style={s.summaryIcon}><Home size={22} color="#6B7280" /></div>
          <div style={s.summaryLabel}>Room</div>
          <div style={s.summaryValue}>
            {room.roomNumber || room.name || room.title || "—"}
          </div>
          <div style={s.summaryMeta}>{formatBranch(room.branch)}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryIcon}><Calendar size={22} color="#6B7280" /></div>
          <div style={s.summaryLabel}>Move-In Date</div>
          <div style={s.summaryValue}>{fmtDate(finalMoveInDate)}</div>
          <div style={s.summaryMeta}>{leaseDuration || 12}-month lease</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryIcon}><CreditCard size={22} color="#6B7280" /></div>
          <div style={s.summaryLabel}>Payment</div>
          <div style={{ ...s.summaryValue, color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><CheckCircle size={14} color="#059669" /> Paid</div>
          <div style={s.summaryMeta}>
            {formatPaymentMethod(paymentMethod)}
          </div>
        </div>
      </div>

      {/* ── What Happens Next ─────────────────────────────────── */}
      <div style={s.nextStepsCard}>
        <h3 style={{ ...s.nextStepsTitle, display: "flex", alignItems: "center", gap: 8 }}><ClipboardList size={16} color="#9A3412" /> What happens next?</h3>
        <div style={s.stepsList}>
          <div style={s.nextStep}>
            <div style={s.stepNumber}>1</div>
            <div>
              <div style={s.stepText}>
                <strong>Wait for your move-in day</strong>
              </div>
              <div style={s.stepDetail}>
                Your room is reserved for{" "}
                <strong>{fmtDate(finalMoveInDate)}</strong>
              </div>
            </div>
          </div>
          <div style={s.nextStep}>
            <div style={s.stepNumber}>2</div>
            <div>
              <div style={s.stepText}>
                <strong>Bring your documents</strong>
              </div>
              <div style={s.stepDetail}>
                Valid ID, reservation code, and first month's rent
              </div>
            </div>
          </div>
          <div style={s.nextStep}>
            <div style={s.stepNumber}>3</div>
            <div>
              <div style={s.stepText}>
                <strong>Admin will check you in</strong>
              </div>
              <div style={s.stepDetail}>
                The admin will verify your arrival and complete your check-in
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ────────────────────────────────────── */}
      <div style={s.buttonsRow}>
        <button
          onClick={() => {
            pauseRedirect();
            onViewDetails?.();
          }}
          style={s.primaryBtn}
        >
          View My Reservation →
        </button>
        <button
          onClick={() => {
            pauseRedirect();
            onReturnHome?.();
          }}
          style={s.secondaryBtn}
        >
          Go to Dashboard
        </button>
      </div>

      {/* ── Print Receipt Link ────────────────────────────────── */}
      <div style={s.printRow}>
        <button onClick={handlePrint} style={s.printLink}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Printer size={14} /> Print / Download Receipt</span>
        </button>
      </div>

      {/* ── Auto-redirect countdown ──────────────────────────── */}
      {isPaymentReturn && !paused && countdown > 0 && (
        <div style={s.redirectRow}>
          <span style={s.redirectText}>
            Taking you to your reservation in{" "}
            <strong>{countdown}s</strong>...
          </span>
          <button onClick={pauseRedirect} style={s.redirectCancel}>
            Stay here
          </button>
        </div>
      )}
    </div>
  );
};

/* ── styles ──────────────────────────────────────────────────── */
const s = {
  wrapper: {
    maxWidth: 640,
    margin: "0 auto",
    padding: "8px 0 32px",
  },

  /* celebration */
  celebrationBanner: {
    textAlign: "center",
    padding: "32px 20px 24px",
    background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #fefce8 100%)",
    borderRadius: 16,
    marginBottom: 20,
    border: "1px solid rgba(16, 185, 129, 0.2)",
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.3)",
    animation: "scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },
  celebrationTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: "#065f46",
    margin: "0 0 8px",
    letterSpacing: "-0.02em",
  },
  celebrationSubtitle: {
    fontSize: 15,
    color: "#047857",
    margin: 0,
    lineHeight: 1.5,
  },

  /* code card */
  codeCard: {
    textAlign: "center",
    padding: "20px 24px",
    background: "var(--surface-card, #fff)",
    borderRadius: 12,
    border: "2px dashed #d1d5db",
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: "#6B7280",
    fontWeight: 600,
    marginBottom: 6,
  },
  codeValue: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "4px",
    color: "var(--text-heading, #111827)",
    fontFamily: "'Courier New', monospace",
    marginBottom: 8,
  },
  codeHint: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  /* summary grid */
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    textAlign: "center",
    padding: "16px 12px",
    background: "var(--surface-card, #fff)",
    borderRadius: 12,
    border: "1px solid var(--border-card, #E5E7EB)",
  },
  summaryIcon: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#9CA3AF",
    fontWeight: 600,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-heading, #111827)",
    marginBottom: 2,
  },
  summaryMeta: {
    fontSize: 12,
    color: "#6B7280",
  },

  /* next steps */
  nextStepsCard: {
    padding: "20px 24px",
    background: "rgba(255, 140, 66, 0.08)",
    borderRadius: 12,
    border: "1px solid rgba(255, 140, 66, 0.25)",
    marginBottom: 24,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#9A3412",
    margin: "0 0 16px",
  },
  stepsList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  nextStep: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: "50%",
    background: "#E0752E",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 1,
  },
  stepText: {
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 1.3,
  },
  stepDetail: {
    fontSize: 13,
    color: "#78716C",
    marginTop: 2,
    lineHeight: 1.4,
  },

  /* buttons */
  buttonsRow: {
    display: "flex",
    gap: 12,
    marginBottom: 12,
  },
  primaryBtn: {
    flex: 2,
    padding: "14px 24px",
    background: "linear-gradient(135deg, #FF8C42 0%, #FF8C2E 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.15s, box-shadow 0.15s",
    boxShadow: "0 2px 12px rgba(255, 140, 66, 0.3)",
  },
  secondaryBtn: {
    flex: 1,
    padding: "14px 16px",
    background: "var(--surface-card, #fff)",
    color: "#374151",
    border: "1px solid var(--border-card, #D1D5DB)",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },

  /* print */
  printRow: {
    textAlign: "center",
    marginBottom: 16,
  },
  printLink: {
    background: "none",
    border: "none",
    fontSize: 13,
    color: "#6B7280",
    cursor: "pointer",
    textDecoration: "underline",
    padding: "8px 16px",
  },

  /* redirect */
  redirectRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "10px 16px",
    background: "var(--surface-muted, #F3F4F6)",
    borderRadius: 8,
  },
  redirectText: {
    fontSize: 13,
    color: "#6B7280",
  },
  redirectCancel: {
    background: "none",
    border: "none",
    fontSize: 13,
    color: "#FF8C42",
    cursor: "pointer",
    fontWeight: 600,
    textDecoration: "underline",
    padding: 0,
  },
};

export default ReservationConfirmationStep;
