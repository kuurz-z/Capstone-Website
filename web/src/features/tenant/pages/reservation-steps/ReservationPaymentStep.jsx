import React from "react";
import {
  formatBranch,
  fmtDate,
} from "../../../../shared/utils/formatDate";
import {
  getBedDisplayLabel,
  getBedShortCode,
} from "../../../../shared/utils/bedIdentifier";
import {
  ShieldCheck,
  CreditCard,
  Lock,
  RefreshCw,
  ChevronRight,
  Check,
  Home,
  Calendar,
  Wallet,
  ArrowLeft,
  Edit3,
  Loader2,
  BedDouble,
} from "lucide-react";
import { getAvailableLeaseOptions } from "./applicationFormConstants";
import { getEffectiveMonthlyStayRate } from "../../utils/pricingDisplayHelpers";
import { showNotification } from "../../../../shared/utils/notification";
import PaymentTimerBanner from "../../../../shared/components/PaymentTimerBanner";

const formatCurrency = (amount) =>
  `PHP ${Number.isFinite(Number(amount)) ? Number(amount).toLocaleString("en-PH") : "0"}`;

const toDisplayString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    return toDisplayString(
      value.displayName ??
        value.name ??
        value.label ??
        value.title ??
        value.roomNumber ??
        value.slug ??
        value.key ??
        value.code ??
        value.value ??
        value.id,
      fallback,
    );
  }
  return fallback;
};

/**
 * Step 4 - Slot Reservation Fee Payment (Streamlined & Responsive)
 * PayMongo online checkout (GCash, Maya, Card).
 */
const ReservationPaymentStep = ({
  reservationData,
  leaseDuration,
  targetMoveInDate,
  isLoading,
  onPrev,
  onPayOnline,
  payingOnline,
  paymentAvailable = false,
  applicationReviewReason = "",
  readOnly,
  agreedToFeePolicy = false,
  setAgreedToFeePolicy = () => {},
  paymentCancelled = false,
  paymentApproved = false,
  onUpdateStayPackage,
  roomSelectionLocked = false,
}) => {
  const [isEditingTerm, setIsEditingTerm] = React.useState(false);
  const [isUpdatingTerm, setIsUpdatingTerm] = React.useState(false);
  const [isTimerExpired, setIsTimerExpired] = React.useState(false);

  const room = reservationData?.room || {};
  const roomName = toDisplayString(room.name || room.roomNumber || room.title || room.id, "N/A");
  const reservationFeeAmount = Number.isFinite(Number(reservationData?.reservationFeeAmount))
    ? Number(reservationData.reservationFeeAmount)
    : 2000;

  const minMonths = room?.longTermLeaseMinMonths ?? 6;
  const leaseOptions = React.useMemo(() => getAvailableLeaseOptions(minMonths), [minMonths]);
  const activeLease = leaseDuration || reservationData?.leaseDuration || room?.leaseDuration || "6";
  const pricingInfo = React.useMemo(
    () => getEffectiveMonthlyStayRate(reservationData, { leaseDuration: activeLease }),
    [reservationData, activeLease]
  );

  const handleSelectTerm = async (termValue) => {
    if (String(termValue) === String(activeLease)) {
      setIsEditingTerm(false);
      return;
    }
    setIsUpdatingTerm(true);
    try {
      if (onUpdateStayPackage) {
        await onUpdateStayPackage({ leaseDuration: termValue });
        showNotification(
          `Lease duration updated to ${termValue === "12" ? "1 Year" : `${termValue} Months`}.`,
          "success"
        );
      }
      setIsEditingTerm(false);
    } catch (err) {
      console.error("Failed to update lease term:", err);
      showNotification("Failed to update lease duration. Please try again.", "error");
    } finally {
      setIsUpdatingTerm(false);
    }
  };

  const selectedBed = reservationData?.selectedBed;
  const roomNumber = toDisplayString(room.roomNumber || room.name || room.title || room.id, "");
  const bedCode =
    typeof selectedBed === "object" && selectedBed
      ? selectedBed.code || getBedShortCode(roomNumber, selectedBed)
      : typeof selectedBed === "string"
      ? selectedBed
      : "";
  const bedLabel =
    typeof selectedBed === "object" && selectedBed
      ? getBedDisplayLabel(selectedBed, 0, room?.roomType || room?.type)
      : "";

  let bedDisplay = "";
  if (bedLabel && bedCode && !bedLabel.toLowerCase().includes(bedCode.toLowerCase())) {
    bedDisplay = `${bedLabel} (${bedCode})`;
  } else {
    bedDisplay = bedCode || bedLabel || toDisplayString(selectedBed, "");
  }

  const canPay = agreedToFeePolicy && !isLoading && !payingOnline && paymentAvailable && !readOnly && !isTimerExpired;
  const payButtonLabel = payingOnline
    ? "Redirecting to PayMongo..."
    : isTimerExpired
    ? "Hold Expired — Please Refresh"
    : `Pay ${formatCurrency(reservationFeeAmount)} Securely`;

  const handlePayClick = () => {
    if (!canPay) return;
    onPayOnline();
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Main Header (Solid Colors, Standalone Icons, Room Designation Pill) */}
      <div className="space-y-2.5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center px-3 py-1 bg-transparent border border-slate-200 dark:border-slate-700 rounded-full">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Step 4 · Payment
            </span>
          </div>

          {/* Room Designation Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 self-start sm:self-auto flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {roomName} · {formatBranch(room.branch || reservationData?.branch)}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-slate-800 dark:text-slate-200 flex-shrink-0" />
            <span>Slot Reservation Fee</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1 max-w-2xl">
            Pay the one-time reservation fee to secure your room. 100% credited toward your move-in balance.
          </p>
        </div>
      </div>

      {/* 15-Minute Live Room Hold Timer Banner */}
      {!readOnly && paymentAvailable && (
        <PaymentTimerBanner
          title="Temporary Room Hold"
          subtitle="Complete your reservation fee payment before this room hold window expires."
          expiresAt={reservationData?.paymentExpiresAt}
          onExpire={() => setIsTimerExpired(true)}
          onRefresh={async () => {
            setIsTimerExpired(false);
            if (onUpdateStayPackage) await onUpdateStayPackage({});
          }}
          className="mb-2"
        />
      )}

      {/* Payment Cancelled Recovery Banner */}
      {paymentCancelled && !readOnly && (
        <div className="rf-payment-cancelled-banner" role="status" aria-live="polite">
          <div className="rf-pcb-icon-wrap">
            <ArrowLeft size={18} aria-hidden="true" />
          </div>
          <div className="rf-pcb-content">
            <strong className="rf-pcb-title">You left before completing payment.</strong>
            <p className="rf-pcb-body">
              No worries — your reservation is still held. You can retry payment below whenever you're ready.
            </p>
          </div>
        </div>
      )}

      {/* Payment Complete Banner */}
      {readOnly && (paymentApproved || reservationData?.paymentStatus === "paid") && (
        <div className="rf-success-banner rf-payment-complete-banner">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <div className="info-box-title">Payment Complete</div>
            <div className="info-text">
              Your slot reservation fee of {formatCurrency(reservationFeeAmount)} has been paid and your room is reserved.
            </div>
          </div>
        </div>
      )}

      <div className={readOnly ? "rf-readonly-wrapper" : ""}>
        <div className="rf-unified-checkout-card">
          {/* Top Hero Banner */}
          <div className="rf-uc-hero">
            <span className="rf-uc-hero-label">Slot Reservation Fee</span>
            <div className="rf-uc-hero-amount whitespace-nowrap">
              {formatCurrency(reservationFeeAmount)}
            </div>
            <div className="rf-uc-hero-subbadge">100% Credited Toward Move-In Balance</div>
          </div>


          {/* Body Content */}
          <div className="rf-uc-body">
            {/* Room Details Flat Summary List */}
            <div className="rf-uc-summary-list">
              <div className="rf-uc-summary-row">
                <div className="rf-uc-row-left">
                  <Home size={15} className="rf-uc-icon" />
                  <span className="rf-uc-label">Room</span>
                </div>  
                <div className="rf-uc-row-right">
                  <span className="rf-uc-val-primary">{roomName}</span>
                  {formatBranch(room.branch) && (
                    <span className="rf-uc-val-sub">({formatBranch(room.branch)})</span>
                  )}
                </div>
              </div>

              {bedDisplay && (
                <div className="rf-uc-summary-row">
                  <div className="rf-uc-row-left">
                    <BedDouble size={15} className="rf-uc-icon" />
                    <span className="rf-uc-label">Bed Slot</span>
                  </div>
                  <div className="rf-uc-row-right">
                    <span className="rf-uc-val-primary">{bedDisplay}</span>
                  </div>
                </div>
              )}

              {targetMoveInDate && (
                <div className="rf-uc-summary-row">
                  <div className="rf-uc-row-left">
                    <Calendar size={15} className="rf-uc-icon" />
                    <span className="rf-uc-label">Intended Move-In Date</span>
                  </div>
                  <div className="rf-uc-row-right">
                    <span className="rf-uc-val-primary whitespace-nowrap">{fmtDate(targetMoveInDate)}</span>
                  </div>
                </div>
              )}

              {/* Lease Duration Row */}
              <div className="rf-uc-summary-row">
                <div className="rf-uc-row-left">
                  <Calendar size={15} className="rf-uc-icon" />
                  <span className="rf-uc-label">Lease Duration</span>
                </div>
                <div className="rf-uc-row-right flex items-center gap-2">
                  <span className="rf-uc-val-primary">
                    {Number(activeLease) === 12
                      ? "1 Year (12 Months)"
                      : `${activeLease} ${Number(activeLease) === 1 ? "Month" : "Months"}`}
                  </span>
                  {!readOnly && !roomSelectionLocked && onUpdateStayPackage && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTerm((prev) => !prev)}
                      className="px-2 py-0.5 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditingTerm ? "Close" : "Edit"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* In-Line Lease Term Selector when editing */}
              {isEditingTerm && (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 my-2 space-y-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>Select New Lease Duration</span>
                    {isUpdatingTerm && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> Updating...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {leaseOptions.map((opt) => {
                      const isSelected = String(activeLease) === String(opt.value);
                      const isLongTerm = opt.months >= minMonths;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isUpdatingTerm}
                          onClick={() => handleSelectTerm(opt.value)}
                          className={`p-2 rounded-lg text-xs flex flex-col items-center justify-center transition-all border ${
                            isSelected
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-bold"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <span>{opt.shortLabel}</span>
                          {isLongTerm && (
                            <span
                              className={`text-[8px] mt-0.5 font-medium ${
                                isSelected ? "text-emerald-300 dark:text-emerald-700" : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              Long-Term
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly Stay Rate Row */}
              <div className="rf-uc-summary-row">
                <div className="rf-uc-row-left items-start">
                  <Wallet size={15} className="rf-uc-icon mt-0.5" />
                  <div>
                    <span className="rf-uc-label block">Monthly Stay Rate</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 whitespace-nowrap">
                      {pricingInfo.applianceFees > 0
                        ? `Starts Month 2 · Incl. ₱${pricingInfo.applianceFees.toLocaleString()}/mo appliances`
                        : "Starts Month 2 (excl. utilities)"}
                    </span>
                  </div>
                </div>
                <div className="rf-uc-row-right self-start pt-0.5">
                  <span className="rf-uc-val-primary whitespace-nowrap">{pricingInfo.formattedMonthlyRate}</span>
                </div>
              </div>

              <div className="rf-uc-summary-row rf-uc-total-row">
                <div className="rf-uc-row-left">
                  <div>
                    <span className="rf-uc-total-label block">Total Due Today</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal block">
                      Slot Reservation Fee
                    </span>
                  </div>
                </div>
                <div className="rf-uc-row-right">
                  <span className="rf-uc-total-amount whitespace-nowrap">{formatCurrency(reservationFeeAmount)}</span>
                </div>
              </div>
            </div>

            {/* Checkout Action Section */}
            {!paymentAvailable && !readOnly ? (
              <div className="rf-locked-banner rf-payment-locked-box my-3">
                <div className="info-box-title">
                  <Lock size={16} /> Payment Locked — Application Under Review
                </div>
                <div className="info-text">
                  Your application is currently under admin review. Payment will automatically unlock once approved.
                  {applicationReviewReason ? ` Latest note: ${applicationReviewReason}` : ""}
                </div>
              </div>
            ) : (
              !readOnly && (
                <div className="rf-uc-actions">
                  {/* Unified Reservation Policy & Terms Container */}
                  <div className="rf-policy-unified-card">
                    {/* Credit Reassurance Row */}
                    <div className="rf-policy-credit-row">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        This <strong>{formatCurrency(reservationFeeAmount)}</strong> reservation fee will be automatically credited toward your move-in balance upon check-in.
                      </span>
                    </div>

                    <div className="rf-policy-divider" aria-hidden="true" />

                    {/* Non-Refundable Fee Policy Checkbox Row */}
                    <div
                      className={`rf-policy-check-row ${agreedToFeePolicy ? "is-checked" : ""} ${
                        isLoading || payingOnline ? "is-disabled" : ""
                      }`}
                      role="checkbox"
                      aria-checked={Boolean(agreedToFeePolicy)}
                      tabIndex={isLoading || payingOnline ? -1 : 0}
                      onKeyDown={(e) => {
                        if ((e.key === " " || e.key === "Enter") && !isLoading && !payingOnline) {
                          e.preventDefault();
                          setAgreedToFeePolicy(!agreedToFeePolicy);
                        }
                      }}
                      onClick={() => {
                        if (!isLoading && !payingOnline) {
                          setAgreedToFeePolicy(!agreedToFeePolicy);
                        }
                      }}
                    >
                      <div className="rf-policy-checkbox-wrapper">
                        <input
                          type="checkbox"
                          id="agreedToFeePolicy"
                          checked={Boolean(agreedToFeePolicy)}
                          onChange={(e) => setAgreedToFeePolicy(e.target.checked)}
                          disabled={isLoading || payingOnline}
                          tabIndex={-1}
                          className="rf-policy-checkbox"
                        />
                        <div className="rf-policy-custom-check" aria-hidden="true">
                          {agreedToFeePolicy && <Check size={12} strokeWidth={3.5} />}
                        </div>
                      </div>
                      <label htmlFor="agreedToFeePolicy" className="rf-policy-label" onClick={(e) => e.stopPropagation()}>
                        <span>
                          I acknowledge that the <strong className="whitespace-nowrap">{formatCurrency(reservationFeeAmount)}</strong> reservation fee is non-refundable.
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Accepted Payment Methods (Positioned directly above payment button as trust badges) */}
                  <div className="rf-payment-methods-bar">
                    <span className="rf-payment-methods-label">Accepted Payment Methods:</span>
                    <div className="rf-payment-methods-pills">
                      <span className="rf-pay-pill">GCash</span>
                      <span className="rf-pay-pill">Maya</span>
                      <span className="rf-pay-pill">Cards</span>
                    </div>
                  </div>

                  {/* Minimalist State Hint (Simple text, no background box, no color callout) */}
                  {!agreedToFeePolicy && (
                    <div className="rf-payment-footer-note" id="reservation-payment-help">
                      <p className="rf-hint-text-minimal">
                        Please check the policy box above to proceed.
                      </p>
                    </div>
                  )}

                  {/* Pay Button */}
                  <button
                    onClick={handlePayClick}
                    className={`btn btn-success btn-pay-online-reservation ${payingOnline ? "is-loading" : ""} ${!canPay ? "is-disabled-btn" : ""}`}
                    disabled={!canPay}
                    aria-describedby="reservation-payment-help"
                    title={
                      !agreedToFeePolicy
                        ? "Please acknowledge the non-refundable fee policy above to proceed"
                        : !paymentAvailable
                        ? "Payment is locked pending application review"
                        : ""
                    }
                  >
                    {payingOnline ? (
                      <span className="rf-pay-btn-inner rf-pay-btn-icon">
                        <RefreshCw size={18} className="rf-spin" aria-hidden="true" />
                        <span>Redirecting to PayMongo...</span>
                      </span>
                    ) : (
                      <span className="rf-pay-btn-inner rf-pay-btn-icon">
                        <CreditCard size={18} aria-hidden="true" />
                        <span className="whitespace-nowrap">{payButtonLabel}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {onPrev && !readOnly && (
        <div className="flex items-center justify-start pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onPrev}
            className="w-full sm:w-auto min-h-[48px] h-12 px-5 rounded-xl font-medium text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} />
            <span>Back to Application</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ReservationPaymentStep;


