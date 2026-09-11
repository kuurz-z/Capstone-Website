import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  Download,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import PaymentTimerBanner from "../../../../shared/components/PaymentTimerBanner";
import { billingApi } from "../../../../shared/api/billingApi";
import { showNotification } from "../../../../shared/utils/notification";
import {
  generateMoveInStatementPDF,
  viewMoveInReceipt,
} from "../../../../shared/utils/receiptGenerator";
import { resolveReservationFinancials } from "../../../../shared/utils/depositUtils";

const fmt = (val) =>
  `PHP ${Number.isFinite(Number(val)) ? Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;

export default function MoveInSettlementCard({
  reservation,
  profileData,
  defaultExpanded = false,
}) {
  const navigate = useNavigate();
  const [payingOnline, setPayingOnline] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);

  if (!reservation) return null;

  const {
    monthlyRent,
    advanceRent,
    securityDeposit,
    grossTotal,
    reservationFeeAmount,
    appliedReservationCredit,
    isReservationFeePaid,
    remainingDue,
    isSettled,
  } = resolveReservationFinancials(reservation, profileData);

  const handleOpenPayModal = (e) => {
    if (e) e.stopPropagation();
    setIsReviewModalOpen(true);
  };

  const handleClosePayModal = () => {
    if (!payingOnline) {
      setIsReviewModalOpen(false);
    }
  };

  const handleProceedToCheckout = async () => {
    if (payingOnline) return;
    setPayingOnline(true);
    try {
      const res = await billingApi.createMoveInCheckout(reservation._id);
      if (res?.checkoutUrl) {
        if (res?.sessionId) {
          try {
            sessionStorage.setItem("lilycrest_movein_session_id", res.sessionId);
            localStorage.setItem("lilycrest_movein_session_id", res.sessionId);
          } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
        window.location.href = res.checkoutUrl;
      } else {
        throw new Error("Unable to obtain PayMongo checkout URL");
      }
    } catch (err) {
      console.error("PayMongo move-in checkout error:", err);
      showNotification(
        err?.message || "Failed to initiate PayMongo online checkout.",
        "error",
        5000,
      );
      setPayingOnline(false);
      setIsReviewModalOpen(false);
    }
  };

  const handleViewReceipt = async (e) => {
    if (e) e.stopPropagation();
    if (viewingReceipt) return;
    setViewingReceipt(true);
    try {
      await viewMoveInReceipt(reservation, profileData);
    } catch (err) {
      console.error("View move-in receipt error:", err);
      showNotification("Failed to open receipt preview.", "error", 4000);
    } finally {
      setViewingReceipt(false);
    }
  };

  const handleDownloadStatement = async (e) => {
    if (e) e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      await generateMoveInStatementPDF(reservation, profileData);
      showNotification("Move-In Statement downloaded successfully!", "success", 3000);
    } catch (err) {
      console.error("Download statement error:", err);
      showNotification("Failed to download statement.", "error", 4000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        background: "var(--surface-card, #ffffff)",
        border: "1px solid var(--border-card, #E2E8F0)",
        borderRadius: 10,
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* Interactive Header Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        aria-expanded={isExpanded}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 16px",
          background: "var(--surface-card, #FFFFFF)",
          borderBottom: isExpanded ? "1px solid var(--border-divider, #E2E8F0)" : "none",
          cursor: "pointer",
          userSelect: "none",
          gap: 10,
          flexWrap: "wrap",
          transition: "background-color 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220, flex: "1 1 auto" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: isSettled
                ? "rgba(5, 150, 105, 0.1)"
                : "rgba(212, 175, 55, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isSettled
                ? "var(--color-success, #059669)"
                : "var(--color-accent, #D4AF37)",
              flexShrink: 0,
            }}
          >
            <CreditCard size={16} />
          </div>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--text-heading, #0F172A)",
                }}
              >
                Move-In Financial Schedule
              </h3>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 11.5,
                color: "var(--text-secondary, #64748B)",
              }}
            >
              1-Mo Advance Rent + 1-Mo Security Deposit less Slot Credit
            </p>
          </div>
        </div>

        {/* Right side status badge, quick actions & collapse toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Status Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 700,
              background: isSettled ? "var(--color-success-bg, #ECFDF5)" : "var(--color-warning-bg, #FFFBEB)",
              color: isSettled ? "var(--color-success, #059669)" : "var(--color-warning-text, #D97706)",
              border: `1px solid ${isSettled ? "rgba(5, 150, 105, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
              whiteSpace: "nowrap",
            }}
          >
            {isSettled ? <CheckCircle2 size={13} /> : <Clock size={13} />}
            <span>{isSettled ? "Settled" : "Due Before Move-In"}</span>
          </div>

          {/* Quick Action in Header (only shown when collapsed to prevent redundancy with expanded actions) */}
          {!isExpanded && (
            isSettled ? (
              <button
                onClick={handleViewReceipt}
                disabled={viewingReceipt}
                title="View Official Receipt"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  background: "var(--color-success, #059669)",
                  color: "#ffffff",
                  border: "1px solid #047857",
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: viewingReceipt ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!viewingReceipt) e.currentTarget.style.background = "#047857";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-success, #059669)";
                }}
              >
                <FileText size={13} />
                <span>{viewingReceipt ? "Opening..." : "View Receipt"}</span>
              </button>
            ) : (
              <button
                onClick={handleOpenPayModal}
                disabled={payingOnline}
                title={`Pay ${fmt(remainingDue)} Online`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  background: "var(--color-success, #059669)",
                  color: "#ffffff",
                  border: "1px solid #047857",
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: payingOnline ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!payingOnline) e.currentTarget.style.background = "#047857";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-success, #059669)";
                }}
              >
                <CreditCard size={13} />
                <span>Pay {fmt(remainingDue)}</span>
              </button>
            )
          )}

          {/* Expand/Collapse Chevron Button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "Collapse breakdown" : "Expand breakdown"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 8px",
              background: "var(--surface-card, #FFFFFF)",
              color: "var(--text-secondary, #64748B)",
              border: "1px solid var(--border-card, #E2E8F0)",
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-muted, #F1F5F9)";
              e.currentTarget.style.color = "var(--text-heading, #0F172A)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-card, #FFFFFF)";
              e.currentTarget.style.color = "var(--text-secondary, #64748B)";
            }}
          >
            <span>{isExpanded ? "Hide" : "Details"}</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div style={{ padding: "14px 16px", background: "var(--surface-card, #FFFFFF)" }}>
          {/* Itemized Breakdown Table (Clean white container with crisp high-contrast lines) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              marginBottom: 12,
              background: "var(--surface-card, #FFFFFF)",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-card, #E2E8F0)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ color: "var(--text-heading, #1E293B)", fontWeight: 500 }}>
                  • 1-Month Advance Rent <span style={{ fontSize: 11, color: "var(--text-muted, #64748B)", fontWeight: 400 }}>(Month 1 Rent)</span>
                </span>
                {isSettled && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      background: "#DCFCE7",
                      color: "#15803D",
                      padding: "1px 6px",
                      borderRadius: 4,
                      border: "1px solid #BBF7D0",
                    }}
                  >
                    PAID
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 600, color: "var(--text-heading, #0F172A)" }}>{fmt(advanceRent)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ color: "var(--text-heading, #1E293B)", fontWeight: 500 }}>
                  • 1-Month Security Deposit <span style={{ fontSize: 11, color: "var(--text-muted, #64748B)", fontWeight: 400 }}>(Refundable)</span>
                </span>
                {isSettled && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      background: "#DCFCE7",
                      color: "#15803D",
                      padding: "1px 6px",
                      borderRadius: 4,
                      border: "1px solid #BBF7D0",
                    }}
                  >
                    PAID
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 600, color: "var(--text-heading, #0F172A)" }}>{fmt(securityDeposit)}</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12.5,
                paddingTop: 6,
                borderTop: "1px dashed var(--border-divider, #E2E8F0)",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--text-heading, #0F172A)" }}>Total Move-In Requirements:</span>
              <span style={{ fontWeight: 700, color: "var(--text-heading, #0F172A)" }}>{fmt(grossTotal)}</span>
            </div>

            {isReservationFeePaid ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ color: "var(--color-success, #059669)", fontWeight: 600 }}>
                    Less: Slot Reservation Fee Credit <span style={{ fontSize: 11, fontWeight: 400 }}>(Online)</span>
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      background: "transparent",
                      color: "var(--color-success, #059669)",
                      padding: "1px 6px",
                      borderRadius: 4,
                      border: "1px solid var(--border-card, #E2E8F0)",
                    }}
                  >
                    CREDITED
                  </span>
                </div>
                <span style={{ color: "var(--color-success, #059669)", fontWeight: 700 }}>
                  -{fmt(appliedReservationCredit || reservationFeeAmount)}
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: "var(--text-secondary, #64748B)" }}>
                <span>Slot Reservation Fee:</span>
                <span style={{ fontStyle: "italic" }}>Pending payment ({fmt(reservationFeeAmount)})</span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 7,
                marginTop: 2,
                borderTop: "1px solid var(--border-divider, #E2E8F0)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-heading, #0F172A)" }}>
                Remaining Balance (Due Before Move-In):
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: isSettled ? "var(--color-success, #059669)" : "var(--text-heading, #0F172A)",
                }}
              >
                {isSettled ? "Settled in Full" : fmt(remainingDue)}
              </span>
            </div>
          </div>

          {/* Settled Compact Confirmation Banner */}
          {isSettled && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 6,
                marginBottom: 12,
                fontSize: 12,
                color: "#15803D",
              }}
            >
              <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>
                Advance rent & deposit verified with zero remaining balance.
              </span>
            </div>
          )}

          {/* Action Controls Bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            {!isSettled ? (
              <>
                <button
                  onClick={handleOpenPayModal}
                  disabled={payingOnline}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    background: "var(--color-success, #059669)",
                    color: "#ffffff",
                    border: "1px solid #047857",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: payingOnline ? "not-allowed" : "pointer",
                    boxShadow: "0 1px 2px rgba(5, 150, 105, 0.2)",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!payingOnline) e.currentTarget.style.background = "#047857";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--color-success, #059669)";
                  }}
                >
                  <CreditCard size={14} />
                  <span>Pay {fmt(remainingDue)} Online</span>
                </button>

                <button
                  onClick={handleDownloadStatement}
                  disabled={downloading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    background: "var(--surface-card, #FFFFFF)",
                    color: "var(--text-heading, #0F172A)",
                    border: "1px solid var(--border-card, #CBD5E1)",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: downloading ? "not-allowed" : "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!downloading) e.currentTarget.style.background = "var(--surface-muted, #F8FAFC)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--surface-card, #FFFFFF)";
                  }}
                >
                  <Download size={13} />
                  {downloading ? "Preparing Statement..." : "Download Statement"}
                </button>
              </>
            ) : (
              <button
                onClick={handleViewReceipt}
                disabled={viewingReceipt}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 16px",
                  background: "var(--color-success, #059669)",
                  color: "#ffffff",
                  border: "1px solid #047857",
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: viewingReceipt ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 2px rgba(5, 150, 105, 0.2)",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!viewingReceipt) e.currentTarget.style.background = "#047857";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-success, #059669)";
                }}
              >
                <FileText size={14} />
                <span>{viewingReceipt ? "Opening..." : "View Official Receipt"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Move-In Payment Confirmation Dialog */}
      <ConfirmModal
        isOpen={isReviewModalOpen}
        onClose={handleClosePayModal}
        onConfirm={handleProceedToCheckout}
        title="Proceed to Online Payment?"
        message={`Are you sure you want to proceed with paying ${fmt(remainingDue)}? You will be redirected to PayMongo to complete your payment.`}
        confirmText="Proceed to PayMongo"
        loadingText="Connecting..."
        cancelText="Cancel"
        variant="success"
        loading={payingOnline}
      >
        <PaymentTimerBanner
          title="Payment Checkout Window"
          subtitle="Your move-in payment session is active for 15 minutes."
          className="mt-3 text-left"
        />
      </ConfirmModal>
    </div>
  );
}
