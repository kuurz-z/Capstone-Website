import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { billingApi } from "../../../../shared/api/apiClient";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";
import StatusChip from "../../../../shared/components/StatusChip";
import DeadlineBadge from "../../../../shared/components/DeadlineBadge";
import { useMyUtilityBreakdownByBillId } from "../../../../shared/hooks/queries/useUtility";
import { showNotification } from "../../../../shared/utils/notification";
import BillingPageSkeleton from "../billing/BillingPageSkeleton";
import PaymentTimerBanner from "../../../../shared/components/PaymentTimerBanner";
import PaymentVerifyingModal from "../../../../shared/components/PaymentVerifyingModal";
import "../../styles/tenant-billing.css";
import {
  Zap,
  Droplets,
  CreditCard,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Package,
  Download,
  Activity,
  Home,
  X,
  ShieldCheck,
  LoaderCircle,
  Receipt,
  FileText,
  Filter,
} from "lucide-react";

/* ── Helpers & Formatting ───────────────────────────── */

const fmt = (n) =>
  `₱${(Number(n) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtMonth = (d) => {
  if (!d) return "Statement";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "long" });
};

const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const fmtDateOnly = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const fmtCycle = (item) => {
  if (item?.cycleText) return item.cycleText;
  const start = item?.billingCycleStart || item?.startDate;
  const end = item?.billingCycleEnd || item?.endDate;
  if (start && end) {
    const formattedStart = fmtDate(start);
    const formattedEnd = fmtDate(end);
    if (formattedStart === formattedEnd) {
      return formattedStart;
    }
    return `${formattedStart} – ${formattedEnd}`;
  }
  if (start) return fmtDate(start);
  if (item?.billingMonth) return fmtMonth(item.billingMonth);
  return null;
};

const fmtKwh = (n) =>
  `${(Number(n) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} kWh`;

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getOutstandingAmount = (bill) => {
  if (bill?.status === "voided") return 0;
  const remaining = Number(bill?.remainingAmount);
  if (Number.isFinite(remaining)) return roundMoney(Math.max(0, remaining));
  const total = Number(bill?.totalAmount || 0);
  const paid = Number(bill?.paidAmount || 0);
  return roundMoney(Math.max(0, total - paid));
};

const isPaidBill = (bill) => {
  if (!bill) return true;
  if (bill?.status === "voided") return true;
  const remaining = getOutstandingAmount(bill);
  if (remaining > 0) return false;
  return bill?.status === "paid" || remaining <= 0;
};

const getBillSortTimestamp = (bill = {}) => {
  const candidates = [
    bill?.dueDate,
    bill?.billingCycleStart,
    bill?.billingMonth,
    bill?.createdAt,
  ];

  for (const value of candidates) {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return Number.POSITIVE_INFINITY;
};

const sortBillsOldestFirst = (left, right) =>
  getBillSortTimestamp(left) - getBillSortTimestamp(right);

const getBillChargeSummary = (bill = {}) => {
  const charges = bill?.charges || {};
  const isInitialPayment = bill?.billType === "initial_payment";
  const initial = bill?.initialPaymentBreakdown || {};
  const initialGross = Number(
    initial.grossInitialAmount ||
      bill?.grossAmount ||
      (Number(initial.advanceRent || 0) + Number(initial.securityDeposit || 0) + Number(initial.approvedInitialCharges || 0)) ||
      0,
  );
  const initialCredit = Number(initial.reservationFeeCredit || bill?.reservationCreditApplied || 0);
  const initialTotal = Number(
    initial.initialPaymentTotal ||
      bill?.totalAmount ||
      bill?.paidAmount ||
      Math.max(initialGross - initialCredit, 0) ||
      0,
  );

  const rentAndFeesTotal = isInitialPayment
    ? roundMoney(initialTotal || Number(bill?.totalAmount || bill?.paidAmount || 0))
    : roundMoney(
        Math.max(
          Number(charges.rent || 0) +
            Number(charges.applianceFees || 0) +
            Number(charges.corkageFees || 0) +
            Number(charges.penalty || 0) -
            Number(charges.discount || 0) -
            Number(bill?.reservationCreditApplied || 0),
          0,
        ),
      );
  const electricityTotal = roundMoney(Number(charges.electricity || 0));
  const waterTotal = roundMoney(Number(charges.water || 0));
  const utilitiesTotal = roundMoney(electricityTotal + waterTotal);
  const statementTotal = roundMoney(
    Number(bill?.totalAmount ?? rentAndFeesTotal + utilitiesTotal),
  );
  const remaining = roundMoney(getOutstandingAmount(bill));
  const chargeSections = [
    { key: "rent", amount: rentAndFeesTotal },
    { key: "electricity", amount: electricityTotal },
    { key: "water", amount: waterTotal },
  ];
  const populatedSections = chargeSections.filter((section) => section.amount > 0);
  const allocationBasis = roundMoney(
    chargeSections.reduce((sum, section) => sum + section.amount, 0) || statementTotal,
  );
  const outstandingBySection = { rent: 0, electricity: 0, water: 0 };

  if (remaining > 0 && allocationBasis > 0 && populatedSections.length > 0) {
    let unallocated = remaining;

    populatedSections.forEach((section, index) => {
      const allocated =
        index === populatedSections.length - 1
          ? unallocated
          : roundMoney((remaining * section.amount) / allocationBasis);
      const safeAllocated = roundMoney(
        Math.min(Math.max(allocated, 0), unallocated),
      );

      outstandingBySection[section.key] = safeAllocated;
      unallocated = roundMoney(unallocated - safeAllocated);
    });
  }

  // Key fixes: hasRentCharges only if rentAndFeesTotal > 0 or initial payment
  const hasRentCharges = rentAndFeesTotal > 0 || isInitialPayment;
  const hasElectricityCharge = electricityTotal > 0;
  const hasWaterCharge = waterTotal > 0;
  const isCombinedStatement = populatedSections.length > 1;

  return {
    rentAndFeesTotal,
    electricityTotal,
    waterTotal,
    utilitiesTotal,
    statementTotal,
    remaining,
    outstandingBySection,
    hasRentCharges,
    hasElectricityCharge,
    hasWaterCharge,
    hasUtilityCharges: utilitiesTotal > 0,
    isCombinedStatement,
  };
};

/* ── Centralized Dynamic Statement Presentation Resolver ─ */

const getStatementPresentation = (bill = {}) => {
  const summary = getBillChargeSummary(bill);
  const isInitial = bill.billType === "initial_payment";
  const isTransferSettlement = bill.billType === "transfer_settlement";
  const monthText = fmtMonth(bill.billingMonth);

  if (isInitial) {
    return {
      title: "Initial Move-In Settlement",
      badgeType: "type-movein",
      badgeLabel: "Move-In",
      category: "movein",
      icon: Package,
      dotColor: "#059669",
    };
  }

  if (isTransferSettlement) {
    return {
      title: "Room Transfer Settlement",
      badgeType: "type-transfer",
      badgeLabel: "Transfer",
      category: "transfer",
      icon: Receipt,
      dotColor: "#2563eb",
    };
  }

  const hasRent = summary.hasRentCharges && summary.rentAndFeesTotal > 0;
  const hasElec = summary.hasElectricityCharge && summary.electricityTotal > 0;
  const hasWater = summary.hasWaterCharge && summary.waterTotal > 0;
  const rentOutstanding = Number(summary.outstandingBySection?.rent || 0);
  const elecOutstanding = Number(summary.outstandingBySection?.electricity || 0);
  const waterOutstanding = Number(summary.outstandingBySection?.water || 0);
  const isOnlyElecOutstanding = hasElec && elecOutstanding > 0 && rentOutstanding === 0 && waterOutstanding === 0;
  const isOnlyWaterOutstanding = hasWater && waterOutstanding > 0 && rentOutstanding === 0 && elecOutstanding === 0;

  if (isOnlyElecOutstanding || (hasElec && !hasRent && !hasWater)) {
    return {
      title: `${monthText} Electricity Statement`,
      badgeType: "type-electricity",
      badgeLabel: "Electricity",
      category: "electricity",
      icon: Zap,
      dotColor: "#d97706",
    };
  }

  if (isOnlyWaterOutstanding || (hasWater && !hasRent && !hasElec)) {
    return {
      title: `${monthText} Water Statement`,
      badgeType: "type-water",
      badgeLabel: "Water",
      category: "water",
      icon: Droplets,
      dotColor: "#0284c7",
    };
  }

  if (hasRent && (hasElec || hasWater)) {
    return {
      title: `${monthText} Rent & Utilities Statement`,
      badgeType: "type-combined",
      badgeLabel: "Combined",
      category: "combined",
      icon: Receipt,
      dotColor: "#0A1628",
    };
  }

  if (hasElec && hasWater && !hasRent) {
    return {
      title: `${monthText} Utilities Statement`,
      badgeType: "type-combined",
      badgeLabel: "Utilities",
      category: "utilities",
      icon: Receipt,
      dotColor: "#0A1628",
    };
  }

  return {
    title: `${monthText} Rent Statement`,
    badgeType: "type-rent",
    badgeLabel: "Rent",
    category: "rent",
    icon: Home,
    dotColor: "#64748b",
  };
};

/* ── Electricity Reference Breakdown Sub-Component ── */

const ElectricityReferenceSegmentCard = ({ seg, ratePerKwh }) => {
  const totalConsumption = Number(
    seg.segmentTotalKwh ?? seg.kwhConsumed ?? ((seg.readingTo || 0) - (seg.readingFrom || 0)),
  );
  const tenantsSharing = Number(seg.activeTenantCount || 0);
  const segmentRoomTotal = totalConsumption * Number(ratePerKwh || 0);
  const segmentShare = Number(
    seg.sharePerTenantCost ?? (tenantsSharing > 0 ? segmentRoomTotal / tenantsSharing : 0),
  );

  return (
    <div className="statement-breakdown-card" style={{ marginBottom: 10 }}>
      <div className="statement-breakdown-header">
        <span className="statement-breakdown-header__title">
          <Zap size={14} color="#d97706" />
          Segment Billing Details
        </span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          {tenantsSharing <= 1 ? "Single Occupancy" : `${tenantsSharing} Occupants (Shared Room)`}
        </span>
      </div>
      <div className="statement-breakdown-body">
        <div className="statement-breakdown-row">
          <span className="statement-breakdown-label">Opening Reading ({fmtDateOnly(seg.startDate)})</span>
          <span className="statement-breakdown-value">
            {Number(seg.readingFrom || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
          </span>
        </div>
        <div className="statement-breakdown-row">
          <span className="statement-breakdown-label">Closing Reading ({fmtDateOnly(seg.endDate)})</span>
          <span className="statement-breakdown-value">
            {Number(seg.readingTo || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
          </span>
        </div>
        <div className="statement-breakdown-row">
          <span className="statement-breakdown-label">Room Consumption</span>
          <span className="statement-breakdown-value">
            {totalConsumption.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
          </span>
        </div>
        <div className="statement-breakdown-row">
          <span className="statement-breakdown-label">Room Subtotal ({totalConsumption.toFixed(2)} kWh × ₱{ratePerKwh}/kWh)</span>
          <span className="statement-breakdown-value">{fmt(segmentRoomTotal)}</span>
        </div>
      </div>
      <div className="statement-breakdown-footer">
        <span>
          {tenantsSharing <= 1
            ? "Segment Amount Due (Sole Occupant)"
            : `Your Allocated Share (Split across ${tenantsSharing} occupants)`}
        </span>
        <span style={{ color: "#d97706", fontSize: 14 }}>{fmt(segmentShare)}</span>
      </div>
    </div>
  );
};

const ElectricityFinalBreakdownCard = ({ data, electricityAmount }) => {
  const segments = data?.segments || [];
  const segmentTotals = segments.map((seg, idx) => {
    const totalConsumption = Number(
      seg.segmentTotalKwh ?? seg.kwhConsumed ?? ((seg.readingTo || 0) - (seg.readingFrom || 0)),
    );
    const tenantsSharing = Number(seg.activeTenantCount || 0);
    const segmentRoomTotal = totalConsumption * Number(data?.ratePerKwh || 0);
    const share = Number(seg.sharePerTenantCost ?? (tenantsSharing > 0 ? segmentRoomTotal / tenantsSharing : 0));
    return {
      key: `${seg.startDate || "seg"}-${idx}`,
      share,
    };
  });

  const subtotal = segmentTotals.reduce((sum, item) => sum + item.share, 0);
  const finalDue = electricityAmount || data?.myBillAmount || subtotal;

  return (
    <div className="statement-breakdown-card" style={{ marginTop: 6, marginBottom: 0 }}>
      <div className="statement-breakdown-header">
        <span className="statement-breakdown-header__title">
          <Activity size={14} color="#0A1628" />
          Overall Electricity Summary
        </span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          Rate: ₱{data?.ratePerKwh || 0}/kWh
        </span>
      </div>
      <div className="statement-breakdown-body">
        <div className="statement-breakdown-row">
          <span className="statement-breakdown-label">Total Individual Electricity Due</span>
          <span className="statement-breakdown-value">{fmt(finalDue)}</span>
        </div>
      </div>
      <div className="statement-breakdown-footer">
        <span>Electricity Amount Due</span>
        <span style={{ color: "#d97706", fontSize: 15 }}>{fmt(finalDue)}</span>
      </div>
    </div>
  );
};

/* ── Pre-Checkout Review Modal (Choice 2: B) ────────── */

const PreCheckoutModal = ({
  isOpen,
  onClose,
  billsToPay = [],
  onConfirm,
  isSubmitting = false,
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || billsToPay.length === 0) return null;

  const totalAmount = roundMoney(
    billsToPay.reduce((sum, b) => sum + getOutstandingAmount(b), 0),
  );

  return (
    <div
      className="precheckout-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="precheckout-modal-title"
    >
      <div className="precheckout-modal" ref={modalRef}>
        <div className="precheckout-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Receipt size={20} color="#0A1628" />
            <h3 id="precheckout-modal-title" className="precheckout-modal__title">
              Review Selected Statements for Payment
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "none",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              color: "#64748b",
            }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="precheckout-modal__body">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Please confirm the statements you wish to settle. You will be redirected to the secure <strong>PayMongo</strong> gateway to complete your payment.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {billsToPay.map((bill, index) => {
              const presentation = getStatementPresentation(bill);
              const remaining = getOutstandingAmount(bill);

              return (
                <div key={bill.id || bill._id || index} className="precheckout-item-row">
                  <div>
                    <div className="precheckout-item-title">
                      {index + 1}. {presentation.title}
                    </div>
                    <div className="precheckout-item-meta" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span>{bill.dueDate ? `Due: ${fmtDate(bill.dueDate)}` : "No due date"}</span>
                      <span className={`statement-type-badge ${presentation.badgeType}`} style={{ padding: "1px 6px", fontSize: 10 }}>
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor: presentation.dotColor || "#64748b",
                            flexShrink: 0,
                          }}
                        />
                        {presentation.badgeLabel}
                      </span>
                    </div>
                  </div>
                  <div className="precheckout-item-amount">{fmt(remaining)}</div>
                </div>
              );
            })}
          </div>

          <PaymentTimerBanner
            title="Payment Checkout Window"
            subtitle="Your billing payment checkout session is active for 15 minutes."
            className="mb-4"
          />

          <div className="precheckout-summary-box">
            <div className="precheckout-summary-row">
              <span>Payment Gateway</span>
              <span>PayMongo (GCash, Maya, Cards, Online Banking)</span>
            </div>
            <div className="precheckout-summary-total">
              <span>Total Payable Amount</span>
              <span>{fmt(totalAmount)}</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ShieldCheck size={16} color="#059669" style={{ flexShrink: 0 }} />
            <span>
              Transactions are encrypted and settled automatically once completed on PayMongo.
            </span>
          </div>
        </div>

        <div className="precheckout-modal__footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "#ffffff",
              border: "1px solid var(--border-card)",
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(billsToPay)}
            disabled={isSubmitting}
            className="btn-review-pay"
            style={{ padding: "9px 20px" }}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle size={15} className="animate-spin" />
                Initiating Secure Checkout...
              </>
            ) : (
              <>
                <CreditCard size={15} />
                Proceed to PayMongo ({fmt(totalAmount)})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Top Statement Ledger Hero Component (Streamlined V4) ── */

const StatementLedgerHero = ({
  totalBalance,
  unpaidRent,
  unpaidElec,
  unpaidWater,
  hasElectricityBilling = false,
  hasWaterBilling = false,
  onPayAll,
  unpaidCount = 0,
}) => {
  const isAllCaughtUp = totalBalance <= 0;

  return (
    <div className="statement-ledger-hero" style={dash.wrapper}>
      <div className="statement-ledger-hero__top" style={dash.heroTop}>
        <div>
          <div className="statement-ledger-hero__label" style={dash.heroLabel}>
            <Receipt size={15} color="#0A1628" />
            Total Outstanding Balance
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div className="statement-ledger-hero__amount" style={dash.heroAmount}>{fmt(totalBalance)}</div>
            {isAllCaughtUp ? (
              <span style={dash.allCaughtUpBadge}>
                <CheckCircle size={14} color="#059669" /> All Caught Up • No Pending Balance
              </span>
            ) : (
              <span style={dash.unpaidBadge}>
                <Clock size={13} color="#d97706" /> {unpaidCount} unpaid statement{unpaidCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {!isAllCaughtUp && (
            <button
              type="button"
              onClick={onPayAll}
              className="btn-review-pay"
              style={dash.payAllBtn}
            >
              <CreditCard size={17} />
              Pay All Statements ({fmt(totalBalance)})
            </button>
          )}
        </div>
      </div>

      <div className="statement-ledger-hero__chips" style={dash.chipsContainer}>
        <div style={dash.chipItem}>
          <Home size={15} color="#0A1628" />
          <span>Rent:</span>
          <strong style={{ color: "#0A1628", fontWeight: 700 }}>
            {fmt(unpaidRent)}
          </strong>
        </div>

        {hasElectricityBilling && (
          <>
            <div style={dash.chipDivider} />
            <div style={dash.chipItem}>
              <Zap size={15} color="#d97706" />
              <span>Electricity:</span>
              <strong style={{ color: "#0A1628", fontWeight: 700 }}>
                {fmt(unpaidElec)}
              </strong>
            </div>
          </>
        )}

        {hasWaterBilling && (
          <>
            <div style={dash.chipDivider} />
            <div style={dash.chipItem}>
              <Droplets size={15} color="#2563eb" />
              <span>Water:</span>
              <strong style={{ color: "#0A1628", fontWeight: 700 }}>
                {fmt(unpaidWater)}
              </strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


/* ── Dual Filter Toolbar (Status & Category Dropdown) ─ */

const StatementFilters = ({
  bills = [],
  statusFilter = "all",
  setStatusFilter,
  categoryFilter = "all",
  setCategoryFilter,
  hasElectricityBilling = false,
  hasWaterBilling = false,
}) => {
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [dropdownAlign, setDropdownAlign] = useState("right");
  const filterMenuRef = useRef(null);
  const filterScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDragged = useRef(false);

  const unpaidCount = useMemo(
    () => bills.filter((b) => !isPaidBill(b)).length,
    [bills]
  );
  const paidCount = useMemo(
    () => bills.filter((b) => isPaidBill(b)).length,
    [bills]
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Statements", count: bills.length },
      { value: "unpaid", label: "Unpaid", count: unpaidCount },
      { value: "paid", label: "Paid History", count: paidCount },
    ],
    [bills.length, unpaidCount, paidCount]
  );

  const rentCount = useMemo(
    () =>
      bills.filter((b) => {
        const cs = getBillChargeSummary(b);
        return (
          cs.hasRentCharges ||
          b.billType === "initial_payment" ||
          b.billType === "monthly" ||
          (!b.charges?.electricity && !b.charges?.water)
        );
      }).length,
    [bills]
  );

  const elecCount = useMemo(
    () =>
      bills.filter((b) => {
        const cs = getBillChargeSummary(b);
        return (
          cs.hasElectricityCharge ||
          b.billType === "electricity" ||
          Boolean(b.utilityBreakdowns?.electricity)
        );
      }).length,
    [bills]
  );

  const waterCount = useMemo(
    () =>
      bills.filter((b) => {
        const cs = getBillChargeSummary(b);
        return (
          cs.hasWaterCharge ||
          b.billType === "water" ||
          Boolean(b.utilityBreakdowns?.water)
        );
      }).length,
    [bills]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: "All Kinds", count: bills.length },
      { value: "rent", label: "Rent", icon: Home, count: rentCount },
      ...(hasElectricityBilling ? [{ value: "electricity", label: "Electricity", icon: Zap, count: elecCount }] : []),
      ...(hasWaterBilling ? [{ value: "water", label: "Water", icon: Droplets, count: waterCount }] : []),
    ],
    [bills.length, rentCount, elecCount, waterCount, hasElectricityBilling, hasWaterBilling]
  );

  const activeCategory = useMemo(
    () => categoryOptions.find((c) => c.value === categoryFilter),
    [categoryOptions, categoryFilter]
  );

  // Measure category toggle position to prevent clipping off-screen
  const updateDropdownPosition = useCallback(() => {
    if (!filterMenuRef.current) return;
    const rect = filterMenuRef.current.getBoundingClientRect();
    // If right edge of button is < 240px from viewport left, right:0 would clip off left screen
    if (rect.right < 240 || rect.left < 16) {
      setDropdownAlign("left");
    } else {
      setDropdownAlign("right");
    }
  }, []);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    return () => window.removeEventListener("resize", updateDropdownPosition);
  }, [isCategoryMenuOpen, updateDropdownPosition]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        setIsCategoryMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsCategoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Update carousel scroll buttons state with asymmetric hysteresis
  const updateScrollButtons = useCallback(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    setCanScrollLeft((prev) => (prev ? el.scrollLeft > 4 : el.scrollLeft > 18));
    setCanScrollRight((prev) => {
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      return prev ? remaining > 4 : remaining > 18;
    });
  }, []);

  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;

    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateScrollButtons();
      });
      ro.observe(el);
    }

    // Translate vertical mouse wheel into horizontal scroll for mouse users
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.85;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      el.removeEventListener("wheel", onWheel);
      if (ro) ro.disconnect();
    };
  }, [updateScrollButtons, statusOptions]);

  const scrollFilters = (direction) => {
    const el = filterScrollRef.current;
    if (!el) return;
    const offset = direction === "left" ? -180 : 180;
    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = filterScrollRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    hasDragged.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const el = filterScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.2;
    if (Math.abs(walk) > 4) {
      hasDragged.current = true;
    }
    el.scrollLeft = dragScrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    if (hasDragged.current) {
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
    }
  };

  return (
    <div className="statement-filters-container">
      {/* Mobile Dropdown Selectors (< 640px) */}
      <div className="sm:hidden flex items-center gap-2 mb-3">
        {/* Status Dropdown */}
        <div className="relative flex-1 min-w-0">
          <label htmlFor="mobile-statement-status-filter" className="sr-only">
            Filter statements by status
          </label>
          <select
            id="mobile-statement-status-filter"
            value={statusOptions.some((opt) => opt.value === statusFilter) ? statusFilter : "all"}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:hidden appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-all cursor-pointer truncate"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 dark:text-slate-500">
            <ChevronDown size={13} />
          </div>
        </div>

        {/* Category Dropdown */}
        <div className="relative flex-1 min-w-0">
          <label htmlFor="mobile-statement-category-filter" className="sr-only">
            Filter statements by category
          </label>
          <select
            id="mobile-statement-category-filter"
            value={categoryOptions.some((cat) => cat.value === categoryFilter) ? categoryFilter : "all"}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:hidden appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-all cursor-pointer truncate"
          >
            {categoryOptions.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label} ({cat.count})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 dark:text-slate-500">
            <Filter size={13} />
          </div>
        </div>
      </div>

      {/* Desktop Filter Toolbar (>= 640px): Status Carousel + Category Dropdown */}
      <div className="hidden sm:flex statement-filters-toolbar items-center justify-between gap-3">
        {/* Horizontally Slidable Status Pills Carousel */}
        <div className="statement-filter-carousel">
          <button
            type="button"
            className={`statement-filter-carousel-arrow statement-filter-carousel-arrow--left ${
              canScrollLeft ? "is-visible" : ""
            }`}
            onClick={() => scrollFilters("left")}
            aria-label="Scroll filters left"
            title="Scroll filters left"
            tabIndex={canScrollLeft ? 0 : -1}
            aria-hidden={!canScrollLeft}
          >
            <ChevronLeft size={15} />
          </button>

          <div
            ref={filterScrollRef}
            className={`statement-filter-scroll ${isDragging ? "is-dragging" : ""}`}
            role="tablist"
            aria-label="Filter statements by status"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
          >
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === opt.value}
                onClick={(e) => {
                  if (hasDragged.current) {
                    e.preventDefault();
                    return;
                  }
                  setStatusFilter(opt.value);
                }}
                className={`ledger-filter-chip ${statusFilter === opt.value ? "is-active" : ""}`}
              >
                <span>{opt.label}</span>
                <span className="ledger-filter-chip__count">{opt.count}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`statement-filter-carousel-arrow statement-filter-carousel-arrow--right ${
              canScrollRight ? "is-visible" : ""
            }`}
            onClick={() => scrollFilters("right")}
            aria-label="Scroll filters right"
            title="Scroll filters right"
            tabIndex={canScrollRight ? 0 : -1}
            aria-hidden={!canScrollRight}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Clickable Filter Category Dropdown Toggle */}
        <div className="statement-category-filter-wrap relative flex-shrink-0" ref={filterMenuRef}>
          <button
            type="button"
            onClick={() => {
              if (!isCategoryMenuOpen) {
                updateDropdownPosition();
              }
              setIsCategoryMenuOpen((prev) => !prev);
            }}
            className={`ledger-filter-category-btn ${categoryFilter !== "all" ? "is-active" : ""}`}
            aria-expanded={isCategoryMenuOpen}
            aria-haspopup="true"
          >
            {categoryFilter !== "all" && activeCategory?.icon ? (
              <activeCategory.icon size={13} color="currentColor" />
            ) : (
              <Filter size={13} color="currentColor" />
            )}
            <span>
              {categoryFilter !== "all" ? activeCategory?.label || "Filtered" : "Filter Category"}
            </span>

            {categoryFilter !== "all" ? (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCategoryFilter("all");
                  setIsCategoryMenuOpen(false);
                }}
                className="category-clear-btn"
                title="Clear category filter"
              >
                <X size={10} strokeWidth={2.5} />
              </span>
            ) : (
              <ChevronDown
                size={13}
                style={{
                  transform: isCategoryMenuOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                  color: "currentColor",
                  opacity: 0.7,
                }}
              />
            )}
          </button>

          {/* Category Dropdown Menu */}
          {isCategoryMenuOpen && (
            <div
              className={`category-dropdown-menu ${dropdownAlign === "left" ? "align-left" : ""}`}
              role="menu"
              aria-label="Filter statements by category"
            >
              <div className="category-dropdown-header" role="presentation">
                Filter by Category
              </div>
              {categoryOptions.map((cat) => {
                const Icon = cat.icon;
                const isActive = categoryFilter === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => {
                      setCategoryFilter(cat.value);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`category-dropdown-item ${isActive ? "is-active" : ""}`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {Icon ? (
                        <Icon size={15} color="currentColor" />
                      ) : (
                        <Filter size={14} color="currentColor" />
                      )}
                      <span>{cat.label}</span>
                    </div>
                    <span className="category-dropdown-item__count">
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Unified Statement Ledger Card ─────────────────── */

const StatementLedgerCard = ({
  bill,
  isSelected = false,
  onToggleSelect,
  onPaySingle,
  isOpen = false,
  onToggleOpen,
}) => {
  const charges = bill.charges || {};
  const summary = getBillChargeSummary(bill);
  const presentation = getStatementPresentation(bill);
  const isInitialPayment = bill.billType === "initial_payment";
  const isTransferSettlement = bill.billType === "transfer_settlement";
  const initial = bill.initialPaymentBreakdown || {};

  const resolvedAdvanceRent = Number(
    initial.advanceRent ||
      bill.advanceRent ||
      bill.monthlyRent ||
      bill.rentAmount ||
      charges.rent ||
      (isInitialPayment && bill.grossAmount ? bill.grossAmount / 2 : 0) ||
      0,
  );

  const resolvedSecurityDeposit = Number(
    initial.securityDeposit ||
      bill.securityDeposit ||
      bill.monthlyRent ||
      bill.rentAmount ||
      (isInitialPayment && bill.grossAmount ? bill.grossAmount / 2 : 0) ||
      0,
  );

  const resolvedApprovedCharges = Number(
    initial.approvedInitialCharges ||
      bill.approvedInitialCharges ||
      0,
  );

  const resolvedReservationCredit = Number(
    initial.reservationFeeCredit ||
      bill.reservationCreditApplied ||
      0,
  );

  const resolvedGrossAmount = Number(
    initial.grossInitialAmount ||
      bill.grossAmount ||
      (resolvedAdvanceRent + resolvedSecurityDeposit + resolvedApprovedCharges) ||
      0,
  );

  const resolvedInitialTotal = Number(
    initial.initialPaymentTotal ||
      bill.totalAmount ||
      bill.paidAmount ||
      Math.max(resolvedGrossAmount - resolvedReservationCredit, 0) ||
      0,
  );

  const isPaid = isPaidBill(bill);
  const remaining = getOutstandingAmount(bill);
  const totalDisplayAmount = isPaid
    ? Number(bill.paidAmount || bill.totalAmount || (isInitialPayment ? resolvedInitialTotal : summary.statementTotal) || 0)
    : (remaining || (isInitialPayment ? resolvedInitialTotal : 0));

  // Hook for utility breakdown if electricity or water is present
  const { data: elecData, isLoading: elecLoading } = useMyUtilityBreakdownByBillId(
    "electricity",
    isOpen && summary.hasElectricityCharge ? (bill.id || bill._id) : null,
  );
  const resolvedElecData = bill.utilityBreakdowns?.electricity || elecData;

  const { data: waterData, isLoading: waterLoading } = useMyUtilityBreakdownByBillId(
    "water",
    isOpen && summary.hasWaterCharge ? (bill.id || bill._id) : null,
  );
  const resolvedWaterData = bill.utilityBreakdowns?.water || waterData;

  const CategoryIcon = presentation.icon;

  return (
    <div
      className={`statement-card ${bill.status === "overdue" ? "is-overdue" : ""} ${isSelected ? "is-selected" : ""}`}
      style={{
        background: isSelected ? "#f8fafc" : "#ffffff",
        border: `1px solid ${isSelected ? "#0A1628" : "#e2e8f0"}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        marginBottom: 12,
        transition: "border-color 0.15s ease",
      }}
    >
      <div
        className="statement-card__header"
        onClick={onToggleOpen}
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "16px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          gap: 14,
        }}
      >
        {/* Checkbox / Status Icon */}
        <div
          className="statement-card__check-wrap"
          onClick={(e) => {
            e.stopPropagation();
            if (!isPaid) onToggleSelect(bill.id || bill._id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isPaid ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          {isPaid ? (
            <CheckCircle size={20} color="#059669" />
          ) : (
            <input
              type="checkbox"
              className="ledger-custom-checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(bill.id || bill._id)}
              aria-label={`Select ${presentation.title}`}
              style={{
                width: 18,
                height: 18,
                accentColor: "#0A1628",
                cursor: "pointer",
              }}
            />
          )}
        </div>

        {/* Standalone Category Icon */}
        <div
          style={{
            color: isPaid ? "#059669" : "#0A1628",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            flexShrink: 0,
          }}
        >
          <CategoryIcon size={18} color={isPaid ? "#059669" : "#0A1628"} />
        </div>

        {/* Title & Metadata */}
        <div className="statement-card__info" style={{ flex: 1, minWidth: 160 }}>
          <div className="statement-card__title-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span className="statement-card__title" style={{ fontSize: 14, fontWeight: 700, color: "#0A1628" }}>
              {presentation.title}
            </span>
            <StatusChip status={isPaid ? "paid" : (bill.status === "paid" && remaining > 0 ? "partial" : bill.status || "pending")} variant="text" />
            <span className={`statement-type-badge ${presentation.badgeType}`}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: presentation.dotColor || "#64748b",
                  flexShrink: 0,
                }}
              />
              {presentation.badgeLabel}
            </span>
          </div>
          <div className="statement-card__cycle" style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
            {isInitialPayment
              ? "Advance rent, security deposit, and initial charges"
              : isTransferSettlement
                ? "Room transfer settlement components"
                : `Cycle: ${fmtCycle(bill) || "—"}`}
          </div>
          {bill.dueDate && (
            <div style={{ marginTop: 2 }}>
              <DeadlineBadge
                dueDate={bill.dueDate}
                status={bill.status}
                type="bill"
                penaltyRate={bill.penaltyDetails?.ratePerDay || 50}
              />
            </div>
          )}
        </div>

        {/* Amount & Actions */}
        <div
          className="statement-card__actions"
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}
        >
          <div style={{ textAlign: "right" }}>
            <span className="statement-card__amount" style={{ fontSize: 15, fontWeight: 800, color: "#0A1628", display: "block" }}>
              {fmt(totalDisplayAmount)}
            </span>
            {isPaid && (
              <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
                Settled
              </span>
            )}
          </div>

          {!isPaid && (
            <button
              type="button"
              className="statement-card__pay-btn"
              onClick={() => onPaySingle(bill)}
              title="Pay this statement only"
            >
              <CreditCard size={13} />
              Pay
            </button>
          )}

          <button
            type="button"
            className="statement-card__toggle-btn"
            onClick={onToggleOpen}
            aria-label={isOpen ? "Collapse breakdown" : "Expand breakdown"}
            style={{
              background: "none",
              border: "none",
              padding: 4,
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Accordion Body Breakdown */}
      {isOpen && (
        <div className="statement-card__body" style={{ padding: "0 20px 20px", borderTop: "1px solid #f1f5f9" }}>
          {/* Rent Breakdown - ONLY rendered when rent actually exists */}
          {(summary.hasRentCharges || isInitialPayment || isTransferSettlement) && (
            <div className="statement-breakdown-card" style={{ marginTop: 14 }}>
              <div className="statement-breakdown-header">
                <span className="statement-breakdown-header__title">
                  <Home size={14} color="#0A1628" />
                  {isTransferSettlement ? "Room Transfer Settlement Breakdown" : "Rental Statement Breakdown"}
                </span>
                <span style={{ fontWeight: 700 }}>{fmtMonth(bill.billingMonth)}</span>
              </div>
              <div className="statement-breakdown-body">
                <div className="statement-breakdown-table-header">
                  <span>Charge Type</span>
                  <span>Amount</span>
                </div>
                {isInitialPayment ? (
                  <>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Advance Rent</span>
                      <span className="statement-breakdown-value">
                        {fmt(resolvedAdvanceRent)}
                      </span>
                    </div>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Security Deposit</span>
                      <span className="statement-breakdown-value">
                        {fmt(resolvedSecurityDeposit)}
                      </span>
                    </div>
                    {resolvedApprovedCharges > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Approved Initial Charges</span>
                        <span className="statement-breakdown-value">
                          {fmt(resolvedApprovedCharges)}
                        </span>
                      </div>
                    )}
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Less: Reservation Fee Credit</span>
                      <span className="statement-breakdown-value" style={{ color: "#059669" }}>
                        -{fmt(resolvedReservationCredit)}
                      </span>
                    </div>
                  </>
                ) : isTransferSettlement ? (
                  <>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Rent Adjustment</span>
                      <span className="statement-breakdown-value">{fmt(Number(charges.rent || 0))}</span>
                    </div>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Security Deposit Top-up</span>
                      <span className="statement-breakdown-value">{fmt(Number(charges.securityDeposit || 0))}</span>
                    </div>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">Finalized Electricity</span>
                      <span className="statement-breakdown-value">{fmt(Number(charges.electricity || 0))}</span>
                    </div>
                    {Number(charges.applianceFees || 0) > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Transfer-specific Appliance Fees</span>
                        <span className="statement-breakdown-value">{fmt(charges.applianceFees)}</span>
                      </div>
                    )}
                    {Number(charges.corkageFees || 0) > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Other Transfer-specific Charges</span>
                        <span className="statement-breakdown-value">{fmt(charges.corkageFees)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="statement-breakdown-row">
                      <span className="statement-breakdown-label">
                        Base Rent
                        {bill.proRataDays ? ` (${bill.proRataDays} days pro-rata)` : ""}
                      </span>
                      <span className="statement-breakdown-value">
                        {fmt(
                          Number(
                            charges.rent ??
                            bill.rentAmount ??
                            bill.rent ??
                            (
                              summary.rentAndFeesTotal -
                              Number(charges.penalty || 0) +
                              Number(charges.discount || 0) -
                              Number(charges.applianceFees || 0) -
                              Number(charges.corkageFees || 0) +
                              Number(bill?.reservationCreditApplied || 0)
                            )
                          )
                        )}
                      </span>
                    </div>

                    {Number(charges.applianceFees || 0) > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Appliance Fees</span>
                        <span className="statement-breakdown-value">
                          {fmt(charges.applianceFees)}
                        </span>
                      </div>
                    )}

                    {Number(charges.corkageFees || 0) > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Corkage & Surcharges</span>
                        <span className="statement-breakdown-value">
                          {fmt(charges.corkageFees)}
                        </span>
                      </div>
                    )}

                    {Number(bill.reservationCreditApplied || 0) > 0 && (
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label">Less: Reservation Fee Credit</span>
                        <span className="statement-breakdown-value" style={{ color: "#059669" }}>
                          -{fmt(bill.reservationCreditApplied)}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {charges.penalty > 0 && (() => {
                  const daysLate = Number(bill.penaltyDetails?.daysLate || 0);
                  const ratePerDay = Number(bill.penaltyDetails?.ratePerDay || 0);
                  const billableDays = Number(bill.penaltyDetails?.billableDays || (daysLate > 1 ? daysLate - 1 : daysLate));
                  return (
                    <>
                      <div className="statement-breakdown-row">
                        <span className="statement-breakdown-label" style={{ color: "#DC2626" }}>
                          Late Payment Penalty
                          {billableDays > 0 && ratePerDay > 0 && (
                            <span style={{ fontWeight: 400, fontSize: 11, color: "#ef4444", marginLeft: 4 }}>
                              ({billableDays} billable day{billableDays === 1 ? "" : "s"} late × ₱{ratePerDay.toLocaleString("en-PH")}/day)
                            </span>
                          )}
                        </span>
                        <span className="statement-breakdown-value" style={{ color: "#DC2626" }}>
                          {fmt(charges.penalty)}
                        </span>
                      </div>
                      <div style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "10px 14px", margin: "6px 0 8px",
                        background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8,
                        fontSize: 12, lineHeight: 1.5, color: "#991b1b",
                      }}>
                        <AlertCircle size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                          {daysLate > 0 && ratePerDay > 0
                            ? `This statement is ${daysLate} day${daysLate === 1 ? "" : "s"} overdue. A late penalty fee of ₱${ratePerDay.toLocaleString("en-PH")} per day applies after the 1-day grace period.`
                            : "A late payment penalty has been applied to this statement."}
                        </span>
                      </div>
                    </>
                  );
                })()}

                {charges.discount > 0 && (
                  <div className="statement-breakdown-row">
                    <span className="statement-breakdown-label" style={{ color: "#059669" }}>Applied Discount</span>
                    <span className="statement-breakdown-value" style={{ color: "#059669" }}>
                      -{fmt(charges.discount)}
                    </span>
                  </div>
                )}
              </div>
              <div className="statement-breakdown-footer">
                <span>{isInitialPayment ? "Total Move-In Settlement" : "Rental Statement Total"}</span>
                <span>{fmt(isInitialPayment ? (isPaid ? (bill.paidAmount || resolvedInitialTotal) : resolvedInitialTotal) : summary.rentAndFeesTotal)}</span>
              </div>
            </div>
          )}

          {/* Electricity Breakdown */}
          {summary.hasElectricityCharge && (
            <div style={{ marginTop: 14 }}>
              {elecLoading ? (
                <div style={elecS.loadingRow}>
                  <Activity size={14} /> Loading electricity breakdown...
                </div>
              ) : resolvedElecData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#64748b", padding: "4px 0" }}>
                    <span>Rate: <strong style={{ color: "#0A1628" }}>₱{resolvedElecData.ratePerKwh}/kWh</strong></span>
                    <span>Your Consumption: <strong style={{ color: "#0A1628" }}>{fmtKwh(resolvedElecData.myTotalKwh)}</strong></span>
                    <span>Total Electricity Due: <strong style={{ color: "#d97706" }}>{fmt(summary.electricityTotal)}</strong></span>
                  </div>
                  {(resolvedElecData.segments || []).map((seg, i) => (
                    <ElectricityReferenceSegmentCard key={i} seg={seg} ratePerKwh={resolvedElecData.ratePerKwh} />
                  ))}
                  <ElectricityFinalBreakdownCard
                    data={resolvedElecData}
                    electricityAmount={summary.electricityTotal}
                  />
                </div>
              ) : (
                <div className="statement-breakdown-card">
                  <div className="statement-breakdown-header">
                    <span className="statement-breakdown-header__title">
                      <Zap size={14} color="#d97706" />
                      Electricity Utility Charge
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#d97706" }}>{fmt(summary.electricityTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Water Breakdown */}
          {summary.hasWaterCharge && (
            <div style={{ marginTop: 14 }}>
              {waterLoading ? (
                <div style={elecS.loadingRow}>
                  <Activity size={14} /> Loading water breakdown...
                </div>
              ) : resolvedWaterData?.record ? (
                (() => {
                  const occupantsCount = Number(resolvedWaterData.record.tenantsSharing || 1);
                  const isSingleOccupant = occupantsCount <= 1;
                  return (
                    <div className="statement-breakdown-card">
                      <div className="statement-breakdown-header">
                        <span className="statement-breakdown-header__title">
                          <Droplets size={14} color="#2563eb" />
                          Water Utility Breakdown
                        </span>
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          {isSingleOccupant ? "Single Occupancy" : `${occupantsCount} Occupants (Shared Room)`}
                        </span>
                      </div>
                      <div className="statement-breakdown-body">
                        <div className="statement-breakdown-row">
                          <span className="statement-breakdown-label">
                            {isSingleOccupant ? "Total Water Consumption" : "Room Water Consumption"}
                          </span>
                          <span className="statement-breakdown-value">
                            {Number(resolvedWaterData.record.usage || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} units
                          </span>
                        </div>
                        <div className="statement-breakdown-row">
                          <span className="statement-breakdown-label">Water Rate per Unit</span>
                          <span className="statement-breakdown-value">
                            {fmt(resolvedWaterData.record.ratePerUnit)}
                          </span>
                        </div>
                        <div className="statement-breakdown-row">
                          <span className="statement-breakdown-label">Total Room Cost</span>
                          <span className="statement-breakdown-value">
                            {fmt(resolvedWaterData.record.roomTotal)}
                          </span>
                        </div>
                      </div>
                      <div className="statement-breakdown-footer">
                        <span>
                          {isSingleOccupant ? "Water Amount Due" : `Your Allocated Share (${occupantsCount} occupants)`}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#2563eb" }}>{fmt(summary.waterTotal)}</span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="statement-breakdown-card">
                  <div className="statement-breakdown-header">
                    <span className="statement-breakdown-header__title">
                      <Droplets size={14} color="#2563eb" />
                      Water Utility Charge
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#2563eb" }}>{fmt(summary.waterTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download Statement & Receipt Actions */}
          <div className="statement-card__download-actions">
            <button
              type="button"
              className="statement-card__download-btn"
              onClick={async () => {
                try {
                  const { generateBillingPDF } = await import("../../../../shared/utils/pdfUtils");
                  await generateBillingPDF(bill);
                } catch (error) {
                  showNotification(error?.message || "Could not download this billing statement.", "error", 4000);
                }
              }}
            >
              <Download size={13} /> Download Statement (PDF)
            </button>

            {isPaid && (
              <button
                type="button"
                className="statement-card__download-btn"
                onClick={async () => {
                  try {
                    const { generateBillingReceipt } = await import("../../../../shared/utils/pdfReceipt");
                    await generateBillingReceipt(bill);
                  } catch (error) {
                    showNotification(error?.message || "Could not download this payment receipt.", "error", 4000);
                  }
                }}
              >
                <Receipt size={13} /> Download Payment Receipt (PDF)
              </button>
            )}
          </div>

          {/* Paid banner */}
          {isPaid && bill.paymentDate && (
            <div style={s.paidInfo}>
              <CheckCircle size={14} color="#059669" />
              <span>
                Paid on {fmtDate(bill.paymentDate)}
                {bill.paymentMethod ? ` via ${formatPaymentMethod(bill.paymentMethod)}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Main BillingTab Component ─────────────────────── */

export default function BillingTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all"); // all | unpaid | paid
  const [categoryFilter, setCategoryFilter] = useState("all"); // all | rent | electricity | water
  const [selectedBillIds, setSelectedBillIds] = useState([]);
  const [expandedBillIds, setExpandedBillIds] = useState(new Set());
  const [payingOnline, setPayingOnline] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [billsToCheckout, setBillsToCheckout] = useState([]);
  const masterCheckboxRef = useRef(null);

  const [verifyingPayment, setVerifyingPayment] = useState(
    searchParams.get("payment") === "success" && Boolean(searchParams.get("session_id")),
  );

  // Load Bills
  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const data = await billingApi.getMyBills();
      const loadedBills = data.bills || [];
      setBills(loadedBills);

      // Choice 2: Option A - Auto-expand ONLY the single most urgent (oldest) unpaid bill
      const defaultExpanded = new Set();
      const unpaidList = loadedBills.filter((b) => !isPaidBill(b)).sort(sortBillsOldestFirst);
      if (unpaidList.length > 0) {
        defaultExpanded.add(unpaidList[0].id || unpaidList[0]._id);
      }
      setExpandedBillIds(defaultExpanded);
    } catch (err) {
      console.error("Failed to load bills:", err);
      showNotification("Could not load your bills. Please refresh the page.", "error", 5000);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // Handle PayMongo return redirect
  useEffect(() => {
    if (authLoading) return;

    const paymentStatus = searchParams.get("payment");
    const rawUrlSessionId = searchParams.get("session_id");
    const storedSessionId = sessionStorage.getItem("activeBillPaymongoSessionId");
    const urlSessionId = rawUrlSessionId === "{id}" ? null : rawUrlSessionId;
    const sessionId = urlSessionId || storedSessionId;

    if (paymentStatus === "success" && sessionId) {
      billingApi
        .checkPaymentStatus(sessionId)
        .then((result) => {
          if (result?.status === "paid" || result?.paid) {
            try {
              sessionStorage.setItem("lilycrest_last_settled_payment_time", String(Date.now()));
            } catch {}
            const refText = result?.referenceNumber ? ` Reference #${result.referenceNumber}.` : "";
            showNotification(
              `Payment confirmed!${refText} Your statement balance has been settled. Official receipt sent to your email.`,
              "success",
              6000,
            );
            loadBills();
          } else if (result?.status === "unpaid") {
            showNotification("Payment was not completed. You can try again anytime.", "info", 4000);
          } else {
            showNotification("Payment is being verified. Refreshing records...", "info", 4000);
            loadBills();
          }
        })
        .catch((err) => {
          console.warn("[BILLING] Payment verification warning:", err);
          try {
            sessionStorage.setItem("lilycrest_last_settled_payment_time", String(Date.now()));
          } catch {}
          showNotification("Payment completed. Refreshing statements.", "success", 5000);
          loadBills();
        })
        .finally(() => {
          sessionStorage.removeItem("activeBillPaymongoSessionId");
          setVerifyingPayment(false);
        });
      setSearchParams({}, { replace: true });
    } else {
      sessionStorage.removeItem("activeBillPaymongoSessionId");
      setVerifyingPayment(false);
      if (paymentStatus === "cancelled") {
        showNotification("Payment was cancelled.", "info", 3000);
      }
      if (paymentStatus) {
        setSearchParams({}, { replace: true });
      }
    }
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculations
  const billSummaries = useMemo(
    () => bills.map((bill) => ({ bill, summary: getBillChargeSummary(bill) })),
    [bills],
  );

  const unpaidBillSummaries = useMemo(
    () => billSummaries.filter(({ bill }) => !isPaidBill(bill)),
    [billSummaries],
  );

  const unpaidBills = useMemo(
    () => unpaidBillSummaries.map(({ bill }) => bill).sort(sortBillsOldestFirst),
    [unpaidBillSummaries],
  );

  const totalUnpaidBalance = useMemo(
    () => roundMoney(unpaidBillSummaries.reduce((sum, { summary }) => sum + summary.remaining, 0)),
    [unpaidBillSummaries],
  );

  const unpaidRent = useMemo(
    () => roundMoney(unpaidBillSummaries.reduce((sum, { summary }) => sum + summary.outstandingBySection.rent, 0)),
    [unpaidBillSummaries],
  );

  const unpaidElec = useMemo(
    () => roundMoney(unpaidBillSummaries.reduce((sum, { summary }) => sum + summary.outstandingBySection.electricity, 0)),
    [unpaidBillSummaries],
  );

  const unpaidWater = useMemo(
    () => roundMoney(unpaidBillSummaries.reduce((sum, { summary }) => sum + summary.outstandingBySection.water, 0)),
    [unpaidBillSummaries],
  );

  const hasElectricityBilling = useMemo(
    () => billSummaries.some(({ summary }) => summary.hasElectricityCharge),
    [billSummaries],
  );

  const hasWaterBilling = useMemo(
    () => billSummaries.some(({ summary }) => summary.hasWaterCharge),
    [billSummaries],
  );

  // Combined Filtered Bills
  const filteredBills = useMemo(() => {
    return bills
      .filter((b) => {
        // 1. Status Filter
        if (statusFilter === "unpaid" && isPaidBill(b)) return false;
        if (statusFilter === "paid" && !isPaidBill(b)) return false;

        // 2. Category Filter
        if (categoryFilter === "rent") {
          const s = getBillChargeSummary(b);
          return (
            s.hasRentCharges ||
            b.billType === "initial_payment" ||
            b.billType === "monthly" ||
            (!b.charges?.electricity && !b.charges?.water)
          );
        }
        if (categoryFilter === "electricity") {
          const s = getBillChargeSummary(b);
          return (
            s.hasElectricityCharge ||
            b.billType === "electricity" ||
            Boolean(b.utilityBreakdowns?.electricity)
          );
        }
        if (categoryFilter === "water") {
          const s = getBillChargeSummary(b);
          return (
            s.hasWaterCharge ||
            b.billType === "water" ||
            Boolean(b.utilityBreakdowns?.water)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (statusFilter === "unpaid") return sortBillsOldestFirst(a, b);
        return getBillSortTimestamp(b) - getBillSortTimestamp(a);
      });
  }, [bills, statusFilter, categoryFilter]);

  // Selection Logic
  const allUnpaidSelected =
    unpaidBills.length > 0 &&
    unpaidBills.every((b) => selectedBillIds.includes(b.id || b._id));

  const isIndeterminate =
    selectedBillIds.length > 0 && !allUnpaidSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleToggleSelectAll = () => {
    if (allUnpaidSelected) {
      setSelectedBillIds([]);
    } else {
      setSelectedBillIds(unpaidBills.map((b) => b.id || b._id));
    }
  };

  const handleToggleSelectBill = (id) => {
    setSelectedBillIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleToggleCategory = (categoryBills) => {
    const categoryUnpaidIds = categoryBills
      .filter((b) => !isPaidBill(b))
      .map((b) => b.id || b._id);
    const allSelected = categoryUnpaidIds.every((id) => selectedBillIds.includes(id));

    if (allSelected) {
      setSelectedBillIds((prev) => prev.filter((id) => !categoryUnpaidIds.includes(id)));
    } else {
      setSelectedBillIds((prev) => Array.from(new Set([...prev, ...categoryUnpaidIds])));
    }
  };

  const handleToggleOpenCard = (id) => {
    setExpandedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selected Total
  const selectedBills = useMemo(
    () => unpaidBills.filter((b) => selectedBillIds.includes(b.id || b._id)),
    [unpaidBills, selectedBillIds],
  );

  const selectedTotal = useMemo(
    () => roundMoney(selectedBills.reduce((sum, b) => sum + getOutstandingAmount(b), 0)),
    [selectedBills],
  );

  // Checkout Triggers
  const handleOpenReviewForSelected = () => {
    if (selectedBills.length === 0) {
      showNotification("Please select at least one unpaid statement to pay.", "info");
      return;
    }
    setBillsToCheckout(selectedBills);
    setIsReviewModalOpen(true);
  };

  const handleOpenReviewForSingle = (bill) => {
    setBillsToCheckout([bill]);
    setIsReviewModalOpen(true);
  };

  const handleOpenReviewForCategory = (categoryBills) => {
    const targetBills = categoryBills.filter((b) => !isPaidBill(b));
    if (targetBills.length === 0) {
      showNotification("All statements in this category are already settled.", "info");
      return;
    }
    setBillsToCheckout(targetBills);
    setIsReviewModalOpen(true);
  };

  const handleOpenReviewForAll = () => {
    if (unpaidBills.length === 0) {
      showNotification("You have no unpaid statements.", "info");
      return;
    }
    setBillsToCheckout(unpaidBills);
    setIsReviewModalOpen(true);
  };

  // Execute PayMongo Checkout (from Modal)
  const handleExecuteCheckout = async (targetBills) => {
    try {
      setPayingOnline(true);
      const validIds = targetBills.map((b) => b.id || b._id);

      let checkoutUrl, sessionId;
      if (validIds.length === 1) {
        const res = await billingApi.createCheckout(validIds[0]);
        checkoutUrl = res.checkoutUrl;
        sessionId = res.sessionId;
      } else {
        const res = await billingApi.createBatchCheckout(validIds);
        checkoutUrl = res.checkoutUrl;
        sessionId = res.sessionId;
      }

      if (sessionId) {
        sessionStorage.setItem("activeBillPaymongoSessionId", sessionId);
      }

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error("No checkout URL returned from payment server.");
      }
    } catch (err) {
      console.error("PayMongo Checkout error:", err);
      const errCode = err?.response?.data?.error?.code || err?.code;
      if (errCode === "ALREADY_PAID") {
        showNotification("Selected statement is already settled! Refreshing...", "success", 4000);
        loadBills();
        setIsReviewModalOpen(false);
      } else {
        showNotification(
          err?.response?.data?.error || err.message || "Failed to start online payment checkout.",
          "error",
          4000,
        );
      }
      setPayingOnline(false);
    }
  };

  if (verifyingPayment) {
    return (
      <PaymentVerifyingModal
        show={verifyingPayment}
        step={2}
        title="Verifying Statement Payment"
      />
    );
  }

  if (loading) {
    return <BillingPageSkeleton />;
  }

  return (
    <div className="tenant-billing">
      {/* 1. Account Summary Ledger Hero */}
      <StatementLedgerHero
        totalBalance={totalUnpaidBalance}
        unpaidRent={unpaidRent}
        unpaidElec={unpaidElec}
        unpaidWater={unpaidWater}
        hasElectricityBilling={hasElectricityBilling}
        hasWaterBilling={hasWaterBilling}
        unpaidCount={unpaidBills.length}
        onPayAll={handleOpenReviewForAll}
      />

      {/* 2. Dual Filter Toolbar (Status & Clickable Category Dropdown) */}
      <StatementFilters
        bills={bills}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        hasElectricityBilling={hasElectricityBilling}
        hasWaterBilling={hasWaterBilling}
      />

      {/* 3. Selection Toolbar (only when unpaid statements exist and not viewing paid history) */}
      {unpaidBills.length > 0 && statusFilter !== "paid" && (
        <div className="ledger-selection-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label
              className="ledger-select-all-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                fontWeight: 600,
                color: "#0A1628",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                ref={masterCheckboxRef}
                className="ledger-custom-checkbox"
                checked={allUnpaidSelected}
                onChange={handleToggleSelectAll}
                aria-label="Select all unpaid statements"
                style={{
                  width: 18,
                  height: 18,
                  accentColor: "#0A1628",
                  cursor: "pointer",
                }}
              />
              {selectedBillIds.length === 0 ? (
                <span>Select All ({unpaidBills.length})</span>
              ) : (
                <span className="ledger-selection-counter">
                  {selectedBillIds.length} of {unpaidBills.length} selected
                </span>
              )}
            </label>

            {selectedBillIds.length > 0 && (
              <button
                type="button"
                className="ledger-deselect-btn"
                onClick={() => setSelectedBillIds([])}
                title="Deselect all chosen statements"
              >
                Deselect all
              </button>
            )}
          </div>

          {selectedBillIds.length > 0 && (
            <div
              className="ledger-selection-actions"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <button
                type="button"
                className="btn-review-pay"
                onClick={handleOpenReviewForSelected}
                disabled={payingOnline}
                title={`Pay selected statements (${fmt(selectedTotal)})`}
              >
                <CreditCard size={15} />
                Pay Selected ({fmt(selectedTotal)})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Unified Statement Stream */}
      {filteredBills.length === 0 ? (
        <div style={s.emptyState}>
          <CreditCard size={40} color="#D1D5DB" />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            {categoryFilter !== "all"
              ? `No ${categoryFilter === "rent" ? "Rent" : categoryFilter === "electricity" ? "Electricity" : "Water"} statements found`
              : statusFilter === "unpaid"
                ? "No unpaid statements found"
                : statusFilter === "paid"
                  ? "No paid history records found"
                  : "No statements found"}
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#94a3b8", maxWidth: 420 }}>
            {categoryFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters above to see more statement records."
              : "Rent and utility statements will appear here once issued by management. All payments are recorded into your permanent ledger."}
          </p>
          {(categoryFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              style={{
                marginTop: 14,
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#334155",
                cursor: "pointer",
              }}
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredBills.map((bill) => {
            const billId = bill.id || bill._id;
            return (
              <StatementLedgerCard
                key={billId}
                bill={bill}
                isSelected={selectedBillIds.includes(billId)}
                onToggleSelect={handleToggleSelectBill}
                onPaySingle={handleOpenReviewForSingle}
                isOpen={expandedBillIds.has(billId)}
                onToggleOpen={() => handleToggleOpenCard(billId)}
              />
            );
          })}
        </div>
      )}

      {/* 5. Pre-Checkout Review Modal (Choice 2: B) */}
      <PreCheckoutModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        billsToPay={billsToCheckout}
        onConfirm={handleExecuteCheckout}
        isSubmitting={payingOnline}
      />
    </div>
  );
}

/* ── Inline Styles for Breakdowns & Components ──────── */

const dash = {
  wrapper: {
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    marginBottom: 24,
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: 800,
    color: "#0A1628",
    lineHeight: 1.1,
  },
  allCaughtUpBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#059669",
    background: "transparent",
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
  },
  unpaidBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#d97706",
    background: "transparent",
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
  },
  payAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "#059669",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "12px 22px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  chipsContainer: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "12px 16px",
    background: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #f1f5f9",
  },
  chipItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#64748b",
  },
  chipDivider: {
    width: 1,
    height: 18,
    background: "#e2e8f0",
  },
};

const s = {
  paidInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    fontSize: 12,
    color: "#059669",
    fontWeight: 600,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "50px 24px",
    background: "#fff",
    borderRadius: 12,
    border: "1px dashed #cbd5e1",
  },
};

const elecS = {
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#64748b",
    padding: "16px",
    justifyContent: "center",
  },
};

