import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { billingApi } from "../../../../shared/api/apiClient";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";
import {
  useMyUtilityBreakdownByBillId,
} from "../../../../shared/hooks/queries/useUtility";
import { showNotification } from "../../../../shared/utils/notification";
import {
  Zap,
  Droplets,
  CreditCard,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Package,
  Download,
  Activity,
  Home,
} from "lucide-react";

/* ── Helpers ───────────────────────────────────────── */

const fmt = (n) =>
  `₱${(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtMonth = (d) =>
  new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long" });

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const fmtShortDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      })
    : "";

const fmtDateOnly = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const fmtCycle = (item) => {
  if (item?.cycleText) return item.cycleText;
  const start = item?.billingCycleStart || item?.startDate;
  const end = item?.billingCycleEnd || item?.endDate;
  if (start && end) return `${fmtDate(start)} - ${fmtDate(end)}`;
  return null;
};

const getUtilityDisplayStart = (item) =>
  item?.utilityCycleStart || item?.startDate || item?.billingCycleStart || null;

const getUtilityDisplayEnd = (item) =>
  item?.utilityCycleEnd || item?.endDate || item?.billingCycleEnd || null;

const fmtUtilityCycle = (item) => {
  const start = getUtilityDisplayStart(item);
  const end = getUtilityDisplayEnd(item);
  if (start && end) return `${fmtDate(start)} - ${fmtDate(end)}`;
  return null;
};

const fmtKwh = (n) =>
  `${(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} kWh`;

const STATUS_STYLES = {
  overdue: { bg: "#FEF2F2", color: "#DC2626", label: "Overdue" },
  pending: { bg: "#FFFBEB", color: "#D97706", label: "Pending" },
  paid: { bg: "#F0FDF4", color: "#059669", label: "Paid" },
  "partially-paid": { bg: "#EFF6FF", color: "#2563EB", label: "Partial" },
};

const DASHBOARD_SKELETON_CARDS = [1, 2];
const BILL_SKELETON_ROWS = [1, 2, 3];
const UTILITY_SKELETON_ROWS = [1, 2, 3, 4];
const BILL_FILTER_OPTIONS = ["all", "unpaid", "paid"];
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getOutstandingAmount = (bill) =>
  Number(bill?.remainingAmount ?? bill?.totalAmount ?? 0);

const isPaidBill = (bill) =>
  bill?.status === "paid" || getOutstandingAmount(bill) <= 0;

const getBillFilterGroups = (bills = [], filter = "all") => {
  const paid = bills.filter((bill) => isPaidBill(bill));
  const unpaid = bills.filter((bill) => !isPaidBill(bill));
  const filtered =
    filter === "unpaid" ? unpaid : filter === "paid" ? paid : bills;

  return { paid, unpaid, filtered };
};

const getEmptyFilterTitle = (filter = "all", label = "bills") =>
  filter === "all" ? `No ${label} found` : `No ${filter} ${label} found`;

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
  const rentAndFeesTotal = roundMoney(
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

  return {
    rentAndFeesTotal,
    electricityTotal,
    waterTotal,
    utilitiesTotal,
    statementTotal,
    remaining,
    outstandingBySection,
    hasRentCharges: rentAndFeesTotal > 0,
    hasElectricityCharge: electricityTotal > 0,
    hasWaterCharge: waterTotal > 0,
    hasUtilityCharges: utilitiesTotal > 0,
    isCombinedStatement: populatedSections.length > 1,
  };
};

const BillingTabSkeleton = () => (
  <div style={{ width: "100%" }} aria-busy="true" aria-live="polite">
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "20px",
        marginBottom: "24px",
      }}
    >
      {DASHBOARD_SKELETON_CARDS.map((card) => (
        <div key={card} style={dash.wrapper}>
          <div style={{ marginBottom: 16 }}>
            <SkeletonPulse width="45%" height="14px" style={{ marginBottom: 12 }} />
            <SkeletonPulse width="55%" height="34px" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <SkeletonPulse width="100%" height="54px" borderRadius="10px" />
          </div>
          <SkeletonPulse width="100%" height="44px" borderRadius="8px" />
        </div>
      ))}
    </div>

    <div style={nav.container}>
      <div style={nav.pillBg}>
        <SkeletonPulse width="130px" height="36px" borderRadius="24px" />
        <SkeletonPulse width="110px" height="36px" borderRadius="24px" />
        <SkeletonPulse width="80px" height="36px" borderRadius="24px" />
      </div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {BILL_SKELETON_ROWS.map((row) => (
        <div key={row} style={s.billCard}>
          <div style={{ padding: "16px 20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <SkeletonPulse width="170px" height="14px" style={{ marginBottom: 8 }} />
                <SkeletonPulse width="min(220px, 65vw)" height="12px" />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <SkeletonPulse width="70px" height="12px" />
                <SkeletonPulse width="95px" height="14px" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const UtilityListSkeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true" aria-live="polite">
    {UTILITY_SKELETON_ROWS.map((row) => (
      <div key={row} style={s.billCard}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <SkeletonPulse width="160px" height="14px" style={{ marginBottom: 8 }} />
            <SkeletonPulse width="min(200px, 60vw)" height="12px" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SkeletonPulse width="74px" height="12px" />
            <SkeletonPulse width="88px" height="14px" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ── Dashboard Components ─────────────────────────── */

const StatementScopeNotice = ({ remainingAmount, label }) => (
  <div style={s.scopeNotice}>
    <AlertCircle size={14} color="#B45309" />
    <span>
      This statement also includes {label}. Checkout pays the full remaining statement
      balance of {fmt(remainingAmount)}.
    </span>
  </div>
);

const SplitDashboard = ({
  unpaidRent,
  unpaidElec,
  unpaidWater,
  hasWaterBilling,
  onPay,
  payingOnline,
  combinedStatementCount = 0,
}) => {
  const unpaidUtilities = unpaidElec + unpaidWater;
  return (
    <div>
      {combinedStatementCount > 0 && (
        <div style={dash.notice}>
          <AlertCircle size={16} color="#B45309" />
          <span>
            {combinedStatementCount === 1
              ? "1 open statement combines multiple charge types."
              : `${combinedStatementCount} open statements combine multiple charge types.`}{" "}
            Checkout always pays the full remaining balance of the statement you open.
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
      {/* Rent Panel */}
      <div style={dash.wrapper}>
        <div style={dash.headerRow}>
          <div>
            <h2 style={{...dash.title, color: "#F57C00", display: "flex", gap: "6px", alignItems: "center"}}>
              <Home size={16} /> Rent & Fees Due
            </h2>
            <div style={dash.amount}>{fmt(unpaidRent)}</div>
          </div>
        </div>
        <div style={dash.helperText}>
          Opens the oldest unpaid statement that includes rent or fees. Monthly
          bills are paid through online checkout.
        </div>
        {unpaidRent > 0 && (
          <button
            onClick={() => onPay("rent")}
            disabled={payingOnline === "rent" || payingOnline === "all"}
            style={{
              ...dash.payBtn,
              width: "100%",
              opacity: payingOnline ? 0.6 : 1,
              cursor: payingOnline ? "not-allowed" : "pointer",
            }}
          >
            <CreditCard size={18} />
            {payingOnline === "rent" ? "Processing..." : "Pay Oldest Rent Statement"}
          </button>
        )}
      </div>

      {/* Utilities Panel */}
      <div style={dash.wrapper}>
        <div style={dash.headerRow}>
          <div>
            <h2 style={{...dash.title, color: "#3B82F6", display: "flex", gap: "6px", alignItems: "center"}}>
              <Activity size={16} /> Utilities Due
            </h2>
            <div style={dash.amount}>{fmt(unpaidUtilities)}</div>
          </div>
        </div>
        <div style={dash.helperText}>
          Opens the oldest unpaid statement that includes electricity or water
          charges. Offline settlements are recorded by branch staff after
          confirmation.
        </div>
        
        {(unpaidUtilities > 0 || hasWaterBilling) && (
          <div style={{...dash.breakdownRow, marginBottom: "16px"}}>
            <div style={dash.breakdownItem}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b" }}>
                <Zap size={14} color="#F59E0B" /> <span style={{ fontSize: 12, fontWeight: 500 }}>Electricity</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-heading)" }}>{fmt(unpaidElec)}</div>
            </div>
            {hasWaterBilling && (
              <>
                <div style={dash.divider} />
                <div style={dash.breakdownItem}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b" }}>
                    <Droplets size={14} color="#3B82F6" /> <span style={{ fontSize: 12, fontWeight: 500 }}>Water</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-heading)" }}>{fmt(unpaidWater)}</div>
                </div>
              </>
            )}
          </div>
        )}

        {unpaidUtilities > 0 && (
          <button
            onClick={() => onPay("utilities")}
            disabled={payingOnline === "utilities" || payingOnline === "all"}
            style={{
              ...dash.payBtn,
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
              width: "100%",
              opacity: payingOnline ? 0.6 : 1,
              cursor: payingOnline ? "not-allowed" : "pointer",
            }}
          >
            <CreditCard size={18} />
            {payingOnline === "utilities" ? "Processing..." : "Pay Oldest Utility Statement"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
};

/* ── Monthly Payment View ──────────────────────────── */

const BillStatusFilters = ({ bills, filter, setFilter }) => {
  const { unpaid } = getBillFilterGroups(bills, filter);

  return (
    <div style={s.filterRow}>
      {BILL_FILTER_OPTIONS.map((value) => (
        <button
          key={value}
          onClick={() => setFilter(value)}
          style={{
            ...s.chip,
            ...(filter === value ? s.chipActive : {}),
          }}
        >
          {value === "all" ? "All Bills" : value === "unpaid" ? "Unpaid" : "Paid"}
          {value === "unpaid" && unpaid.length > 0 && (
            <span style={s.chipCount}>{unpaid.length}</span>
          )}
        </button>
      ))}
    </div>
  );
};

const MonthlyPaymentView = ({ bills, filter, setFilter }) => {
  const { filtered } = getBillFilterGroups(bills, filter);

  return (
    <div>
      <BillStatusFilters bills={bills} filter={filter} setFilter={setFilter} />

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          <CreditCard size={40} color="#D1D5DB" />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            {getEmptyFilterTitle(filter, "bills")}
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#94a3b8", maxWidth: 420 }}>
            Rent bills appear once your current stay is billed. Utility charges only show here after they are issued, not while they are still in draft review.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((bill) => (
            <MonthlyBillCard key={bill.id || bill._id} bill={bill} />
          ))}
        </div>
      )}
    </div>
  );
};

const MonthlyBillCard = ({ bill }) => {
  const [open, setOpen] = useState((bill.remainingAmount ?? bill.totalAmount) > 0);
  const status = STATUS_STYLES[bill.status] || STATUS_STYLES.pending;
  const charges = bill.charges || {};
  const summary = getBillChargeSummary(bill);

  // Compute the strictly Rent-focused total for this separated tab
  const rentBase =
    (charges.rent || 0) + (charges.applianceFees || 0) + (charges.corkageFees || 0);
  let rentOnlyTotal = rentBase + (charges.penalty || 0) - (charges.discount || 0);
  if (bill.grossAmount > 0) {
    rentOnlyTotal -= (bill.reservationCreditApplied || 0);
  }
  // Floor it at 0 just in case
  if (rentOnlyTotal < 0) rentOnlyTotal = 0;

  return (
    <div style={{ ...s.billCard, borderColor: open ? "#cbd5e1" : "var(--border-card)" }}>
      <button onClick={() => setOpen(!open)} style={s.billHeader}>
        <Package size={16} color="#64748b" />
        <div style={{ flex: 1, marginLeft: 10, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading)" }}>
            {fmtMonth(bill.billingMonth)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Cycle: {fmtCycle(bill) || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Due: {bill.dueDate ? fmtDate(bill.dueDate) : "â€”"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: status.color, textTransform: "uppercase" }}>
            {status.label}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading)" }}>
            {fmt(rentOnlyTotal)}
          </span>
        </div>
        {open ? <ChevronUp size={16} color="#94a3b8" style={{ marginLeft: 8 }} /> : <ChevronDown size={16} color="#94a3b8" style={{ marginLeft: 8 }} />}
      </button>

      {open && (
        <div style={s.breakdown}>
          <div style={{ ...elecS.segmentCard, marginBottom: 16 }}>
            <div style={elecS.segmentHeader}>
              <span>Statement Breakdown</span>
              <span style={{ fontWeight: 700 }}>{fmtMonth(bill.billingMonth)}</span>
            </div>
            <div style={{ padding: "0 16px" }}>
              <div style={elecS.tableHeader}>
                <span style={{ ...elecS.tableHeaderCell, gridColumn: "span 2" }}>charge type</span>
                <span style={{ ...elecS.tableHeaderCell, textAlign: "right" }}>amount</span>
              </div>
              <div style={elecS.tableRow2}>
                <span style={elecS.tableCell2}>Rent & Fees</span>
                <span style={{ ...elecS.tableCell2, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(rentBase)}
                </span>
              </div>
              
              {charges.penalty > 0 && (
                <div style={elecS.tableRow2}>
                  <span style={{ ...elecS.tableCell2, color: "#DC2626" }}>Late Penalty</span>
                  <span style={{ ...elecS.tableCell2, color: "#DC2626", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(charges.penalty)}
                  </span>
                </div>
              )}
              {charges.discount > 0 && (
                <div style={elecS.tableRow2}>
                  <span style={{ ...elecS.tableCell2, color: "#059669" }}>Discount</span>
                  <span style={{ ...elecS.tableCell2, color: "#059669", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    -{fmt(charges.discount)}
                  </span>
                </div>
              )}
              {bill.grossAmount > 0 && bill.reservationCreditApplied > 0 && (
                <div style={elecS.tableRow2}>
                  <span style={{ ...elecS.tableCell2, color: "#059669" }}>Reservation Credit Applied</span>
                  <span style={{ ...elecS.tableCell2, color: "#059669", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    -{fmt(bill.reservationCreditApplied)}
                  </span>
                </div>
              )}
              <div style={elecS.segmentFooter}>
                <span>Monthly Rent Due</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(rentOnlyTotal)}</span>
              </div>
            </div>
          </div>

          <button
            style={s.downloadBtn}
            onClick={async () => {
              const { generateBillingPDF } = await import("../../../../shared/utils/pdfUtils");
              generateBillingPDF(bill);
            }}
          >
            <Download size={13} /> Download Statement
          </button>

          {summary.isCombinedStatement && (
            <StatementScopeNotice
              remainingAmount={summary.remaining}
              label="additional charge types"
            />
          )}

          {bill.status === "paid" && bill.paymentDate && (
            <div style={s.paidInfo}>
              <CheckCircle size={14} color="#059669" />
              <span>
                Paid {fmtDate(bill.paymentDate)}
                {bill.paymentMethod ? ` via ${formatPaymentMethod(bill.paymentMethod)}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Electricity Tab (Detailed Breakdown) ──────────── */

const ElectricitySegmentCard = ({ seg, ratePerKwh }) => {
  const sDateStr = seg.startDate ? seg.startDate : seg.periodLabel ? seg.periodLabel.split(/[-–]/)[0].trim() : "";
  const eDateStr = seg.endDate ? seg.endDate : seg.periodLabel ? seg.periodLabel.split(/[-–]/)[1]?.trim() : "";

  return (
    <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      {/* Occupants Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>
          No. of occupants in the room
        </span>
        <span style={{ backgroundColor: "#ffedd5", color: "#ea580c", padding: "4px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
          {seg.activeTenantCount}
        </span>
      </div>

      {/* Table Data */}
      <div style={{ padding: "8px 16px" }}>
        {/* Readings */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dashed #e2e8f0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>1st reading</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtDateOnly(sDateStr)}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
            {(seg.readingFrom || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>kWh</span>
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dashed #e2e8f0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>2nd reading</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtDateOnly(eDateStr)}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
            {(seg.readingTo || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>kWh</span>
          </span>
        </div>

        {/* Total Consumption */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Total consumption</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
            {(seg.kwhConsumed || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>kWh</span>
          </span>
        </div>
      </div>

      {/* Amount Due Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", backgroundColor: "#0f172a" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>
          Amount due (₱{ratePerKwh}/kWh) per person
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>
          {fmt(seg.sharePerTenantCost)}
        </span>
      </div>
    </div>
  );
};

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
    <div style={elecS.referenceCard}>
      <div style={elecS.referenceIntro}>Segment billing details</div>
      <table style={elecS.referenceTable}>
        <tbody>
          <tr>
            <td style={{ ...elecS.referenceLabelCell, ...elecS.referenceSectionCell }} colSpan={2}>
              No. of occupants in the room:
            </td>
            <td style={{ ...elecS.referenceValueCell, ...elecS.referenceSectionCell }}>
              {seg.activeTenantCount}
            </td>
          </tr>
          <tr>
            <td style={elecS.referenceSpacerCell} />
            <td style={elecS.referenceHeaderCell}>Date</td>
            <td style={elecS.referenceHeaderCell}>kWh</td>
          </tr>
          <tr>
            <td style={elecS.referenceLabelCell}>1st reading</td>
            <td style={elecS.referenceValueCell}>{fmtDateOnly(seg.startDate)}</td>
            <td style={elecS.referenceValueCell}>
              {Number(seg.readingFrom || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
          <tr>
            <td style={elecS.referenceLabelCell}>2nd reading</td>
            <td style={elecS.referenceValueCell}>{fmtDateOnly(seg.endDate)}</td>
            <td style={elecS.referenceValueCell}>
              {Number(seg.readingTo || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
          <tr>
            <td style={{ ...elecS.referenceLabelCell, fontStyle: "italic" }}>Total consumption</td>
            <td style={elecS.referenceValueCell} />
            <td style={elecS.referenceValueCell}>
              {totalConsumption.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
          <tr>
            <td style={elecS.referenceLabelCell} colSpan={2}>
              Room total (kWh x rate)
            </td>
            <td style={elecS.referenceValueCell}>{fmt(segmentRoomTotal)}</td>
          </tr>
          <tr>
            <td style={elecS.referenceLabelCell} colSpan={2}>
              Your share for this segment (room total / {tenantsSharing || 0})
            </td>
            <td style={{ ...elecS.referenceValueCell, fontWeight: 700 }}>
              {fmt(segmentShare)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const ElectricityFinalBreakdownCard = ({ data, period, electricityAmount }) => {
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
      label: `Segment ${idx + 1} (${fmtDateOnly(seg.startDate)} - ${fmtDateOnly(seg.endDate)})`,
      value: share,
    };
  });
  const totalSegmentKwh = segments.reduce(
    (sum, seg) => sum + Number(seg.segmentTotalKwh ?? seg.kwhConsumed ?? ((seg.readingTo || 0) - (seg.readingFrom || 0)) ?? 0),
    0,
  );
  const totalFromSegments = segmentTotals.reduce((sum, seg) => sum + Number(seg.value || 0), 0);

  const finalUsage = Number(data?.myTotalKwh ?? period?.totalKwh ?? period?.totalUsage ?? totalSegmentKwh ?? 0);
  const finalRate = Number(data?.ratePerKwh || 0);
  const finalDue = Number(data?.myBillAmount ?? electricityAmount ?? totalFromSegments ?? 0);
  const adjustment = finalDue - totalFromSegments;

  return (
    <div style={elecS.finalBreakdownCard}>
      <div style={elecS.finalBreakdownHeader}>Final breakdown</div>
      <div style={elecS.finalBreakdownBody}>
        <div style={elecS.finalBreakdownRow}>
          <span style={elecS.finalBreakdownLabel}>Total usage (your share)</span>
          <span style={elecS.finalBreakdownValue}>{fmtKwh(finalUsage)}</span>
        </div>
        <div style={elecS.finalBreakdownRow}>
          <span style={elecS.finalBreakdownLabel}>Rate applied</span>
          <span style={elecS.finalBreakdownValue}>₱{finalRate.toLocaleString("en-PH", { maximumFractionDigits: 2 })}/kWh</span>
        </div>
        {segmentTotals.length > 0 && <div style={elecS.finalBreakdownSectionTitle}>Segment totals</div>}
        {segmentTotals.map((segmentTotal) => (
          <div style={elecS.finalBreakdownRow} key={segmentTotal.key}>
            <span style={elecS.finalBreakdownLabel}>{segmentTotal.label}</span>
            <span style={elecS.finalBreakdownValue}>{fmt(segmentTotal.value)}</span>
          </div>
        ))}
        <div style={{ ...elecS.finalBreakdownRow, borderTop: "1px dashed #ead7bc", paddingTop: 8, marginTop: 2 }}>
          <span style={elecS.finalBreakdownLabel}>Subtotal of segment totals</span>
          <span style={elecS.finalBreakdownValue}>{fmt(totalFromSegments)}</span>
        </div>
        {Math.abs(adjustment) >= 0.01 && (
          <div style={elecS.finalBreakdownRow}>
            <span style={elecS.finalBreakdownLabel}>Adjustment</span>
            <span style={{ ...elecS.finalBreakdownValue, color: adjustment > 0 ? "#b45309" : "#047857" }}>
              {adjustment > 0 ? "+" : "-"}{fmt(Math.abs(adjustment))}
            </span>
          </div>
        )}
      </div>
      <div style={elecS.finalBreakdownFooter}>
        <span>Final amount due</span>
        <span style={elecS.finalBreakdownTotal}>{fmt(finalDue)}</span>
      </div>
    </div>
  );
};

const ElectricityPeriodRow = ({ period }) => {
  const [open, setOpen] = useState(false);
  const { data: fetchedData, isLoading } = useMyUtilityBreakdownByBillId(
    "electricity",
    open ? (period.id || period._id) : null,
  );
  const data = period.utilityBreakdowns?.electricity || fetchedData;
  const summary = getBillChargeSummary(period);
  const electricityAmount = period.billAmount ?? period.charges?.electricity ?? 0;
  const electricityKwh = period.totalKwh ?? period.totalUsage ?? data?.myTotalKwh ?? null;

  return (
    <div style={{ ...s.billCard, borderColor: open ? "#fcd34d" : "var(--border-card)" }}>
      <button onClick={() => setOpen((v) => !v)} style={s.billHeader}>
        <Zap size={16} color="#F59E0B" />
        <div style={{ flex: 1, marginLeft: 10, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading)" }}>
            {fmtMonth(getUtilityDisplayEnd(period) || period.billingMonth || period.computedAt)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Cycle: {fmtUtilityCycle(period) || fmtCycle(period) || "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {electricityKwh != null ? fmtKwh(electricityKwh) : "Usage pending"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading)" }}>{fmt(electricityAmount)}</span>
        </div>
        {open ? <ChevronUp size={16} color="#94a3b8" style={{ marginLeft: 8 }} /> : <ChevronDown size={16} color="#94a3b8" style={{ marginLeft: 8 }} />}
      </button>

      {open && (
        <div style={s.breakdown}>
          {isLoading ? (
            <div style={elecS.loadingRow}><Activity size={14} /> Loading breakdown...</div>
          ) : data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#64748b", padding: "4px 0" }}>
                <span>Rate: <strong style={{ color: "var(--text-heading)" }}>₱{data.ratePerKwh}/kWh</strong></span>
                <span>Your Share: <strong style={{ color: "var(--text-heading)" }}>{fmtKwh(data.myTotalKwh)}</strong></span>
                <span>Total Due: <strong style={{ color: "#F59E0B" }}>{fmt(data.myBillAmount)}</strong></span>
              </div>
              {(data.segments || []).map((seg, i) => (
                <ElectricityReferenceSegmentCard key={i} seg={seg} ratePerKwh={data.ratePerKwh} />
              ))}
              <ElectricityFinalBreakdownCard
                data={data}
                period={period}
                electricityAmount={electricityAmount}
              />
            </div>
          ) : (
            <div style={elecS.loadingRow}>
              {electricityAmount > 0
                ? `Electricity charge recorded: ${fmt(electricityAmount)}. Detailed segment data is not available for this statement.`
                : "Details not available."}
            </div>
          )}

          {summary.isCombinedStatement && (
            <StatementScopeNotice
              remainingAmount={summary.remaining}
              label="additional charge types"
            />
          )}
        </div>
      )}
    </div>
  );
};

const ElectricityTabContent = ({
  bills = [],
  isLoading = false,
  filter = "all",
  setFilter,
}) => {
  if (isLoading) return <UtilityListSkeleton />;
  const { filtered } = getBillFilterGroups(bills, filter);

  return (
    <>
      <BillStatusFilters bills={bills} filter={filter} setFilter={setFilter} />

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          <CreditCard size={40} color="#D1D5DB" />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            {getEmptyFilterTitle(filter, "electricity bills")}
          </h3>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((bill) => (
            <ElectricityPeriodRow key={bill.id || bill._id} period={bill} />
          ))}
        </div>
      )}
    </>
  );
};

/* ── Water Tab (Detailed Breakdown) ────────────────── */

const WaterPeriodRow = ({ period }) => {
  const [open, setOpen] = useState(false);
  const { data: fetchedData, isLoading } = useMyUtilityBreakdownByBillId("water", open ? period.id || period._id : null);
  const data = period.utilityBreakdowns?.water || fetchedData;
  const record = data?.record;
  const summary = getBillChargeSummary(period);

  return (
    <div style={{ ...s.billCard, borderColor: open ? "#93c5fd" : "var(--border-card)" }}>
      <button onClick={() => setOpen((v) => !v)} style={s.billHeader}>
        <Droplets size={16} color="#3B82F6" />
        <div style={{ flex: 1, marginLeft: 10, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading)" }}>
            {fmtMonth(period.billingMonth || period.endDate || period.createdAt)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Cycle: {fmtCycle(period) || "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>{period.myShare ? "Billed" : "Pending"}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading)" }}>{fmt(period.myShare || period.billAmount || 0)}</span>
        </div>
        {open ? <ChevronUp size={16} color="#94a3b8" style={{ marginLeft: 8 }} /> : <ChevronDown size={16} color="#94a3b8" style={{ marginLeft: 8 }} />}
      </button>

      {open && (
        <div style={s.breakdown}>
          {isLoading ? (
            <div style={elecS.loadingRow}><Activity size={14} /> Loading breakdown...</div>
          ) : record ? (
            <div style={elecS.segmentCard}>
              <div style={elecS.segmentHeader}>
                <span>Occupants sharing:</span>
                <span style={{ fontWeight: 700 }}>{record.tenantsSharing}</span>
              </div>
              <div style={{ padding: "0 16px" }}>
                <div style={elecS.tableHeader}>
                  <span style={{ ...elecS.tableHeaderCell, gridColumn: "span 2" }}>metric</span>
                  <span style={{ ...elecS.tableHeaderCell, textAlign: "right" }}>value</span>
                </div>
                <div style={elecS.tableRow2}>
                  <span style={elecS.tableCell2}>Total Room Usage</span>
                  <span style={{ ...elecS.tableCell2, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {Number(record.usage || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} units
                  </span>
                </div>
                <div style={elecS.tableRow2}>
                  <span style={elecS.tableCell2}>Rate per Unit</span>
                  <span style={{ ...elecS.tableCell2, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(record.ratePerUnit)}
                  </span>
                </div>
                <div style={{ ...elecS.tableRow2, borderBottom: "none" }}>
                  <span style={{ ...elecS.tableCell2, color: "#0A1628", fontWeight: 600 }}>Total Room Cost</span>
                  <span style={{ ...elecS.tableCell2, textAlign: "right", color: "#0A1628", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(record.roomTotal)}
                  </span>
                </div>
                <div style={{ ...elecS.segmentFooter, borderTop: "1px solid #f1f5f9", marginTop: 4 }}>
                  <span>Your share (split among {record.tenantsSharing})</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(record.myShare)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={elecS.loadingRow}>Details not available.</div>
          )}

          {summary.isCombinedStatement && (
            <StatementScopeNotice
              remainingAmount={summary.remaining}
              label="additional charge types"
            />
          )}
        </div>
      )}
    </div>
  );
};

const WaterTabContent = ({
  bills = [],
  isLoading = false,
  filter = "all",
  setFilter,
}) => {
  if (isLoading) return <UtilityListSkeleton />;
  const { filtered } = getBillFilterGroups(bills, filter);

  return (
    <>
      <BillStatusFilters bills={bills} filter={filter} setFilter={setFilter} />

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          <CreditCard size={40} color="#D1D5DB" />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            {getEmptyFilterTitle(filter, "water bills")}
          </h3>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((bill) => (
            <WaterPeriodRow key={bill.id || bill._id} period={bill} />
          ))}
        </div>
      )}
    </>
  );
};

/* ── Main Component ────────────────────────────────── */

const BillingTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [subTab, setSubTab] = useState("monthly"); // monthly | electricity | water
  const [monthlyFilter, setMonthlyFilter] = useState("all");
  const [electricityFilter, setElectricityFilter] = useState("all");
  const [waterFilter, setWaterFilter] = useState("all");
  const [payingOnline, setPayingOnline] = useState(false);

  // Handle PayMongo return
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const sessionId = searchParams.get("session_id");

    if (paymentStatus === "success" && sessionId) {
      billingApi
        .checkPaymentStatus(sessionId)
        .then((result) => {
          if (result.status === "paid") {
            showNotification("Payment successful! Your bill has been paid.", "success", 5000);
            loadBills();
          } else {
            showNotification("Payment is being processed.", "info", 5000);
          }
        })
        .catch(() => {
          showNotification("Could not verify payment. Please refresh.", "warning", 5000);
        });
      setSearchParams({}, { replace: true });
    } else if (paymentStatus === "cancelled") {
      showNotification("Payment was cancelled.", "info", 3000);
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const data = await billingApi.getMyBills();
      setBills(data.bills || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const billSummaries = bills.map((bill) => ({
    bill,
    summary: getBillChargeSummary(bill),
  }));
  const openBillSummaries = billSummaries.filter(({ bill }) => !isPaidBill(bill));

  const unpaidRent = roundMoney(
    openBillSummaries.reduce(
      (sum, { summary }) => sum + summary.outstandingBySection.rent,
      0,
    ),
  );

  const unpaidElec = roundMoney(
    openBillSummaries.reduce(
      (sum, { summary }) => sum + summary.outstandingBySection.electricity,
      0,
    ),
  );

  const unpaidWater = roundMoney(
    openBillSummaries.reduce(
      (sum, { summary }) => sum + summary.outstandingBySection.water,
      0,
    ),
  );
  const combinedStatementCount = openBillSummaries.filter(
    ({ summary }) => summary.isCombinedStatement,
  ).length;

  const monthlyBills = billSummaries
    .filter(({ summary }) => summary.hasRentCharges)
    .map(({ bill }) => bill);

  const electricityBills = billSummaries
    .filter(({ summary }) => summary.hasElectricityCharge)
    .map(({ bill }) => bill);
  const waterBills = billSummaries
    .filter(({ summary }) => summary.hasWaterCharge)
    .map(({ bill }) => bill);
  // Show water tab only if this tenant has ever been billed for water.
  // If all water bills are paid, the tab still shows with ₱0 balance.
  const hasWaterBilling = waterBills.length > 0;
  const payableRentBills = openBillSummaries
    .filter(({ summary }) => summary.hasRentCharges)
    .map(({ bill }) => bill)
    .sort(sortBillsOldestFirst);
  const payableUtilityBills = openBillSummaries
    .filter(({ summary }) => summary.hasUtilityCharges)
    .map(({ bill }) => bill)
    .sort(sortBillsOldestFirst);
  const payableBills = openBillSummaries
    .map(({ bill }) => bill)
    .sort(sortBillsOldestFirst);

  const handlePay = async (type = "all") => {
    try {
      setPayingOnline(type);
      
      let billsToPay = [];
      if (type === "rent") {
        billsToPay = payableRentBills;
      } else if (type === "utilities") {
        billsToPay = payableUtilityBills;
      } else {
        billsToPay = payableBills;
      }

      if (billsToPay.length === 0) {
        showNotification("No unpaid bills in this category.", "info");
        setPayingOnline(null);
        return;
      }

      const firstUnpaid = billsToPay[0];
      const { checkoutUrl } = await billingApi.createCheckout(firstUnpaid.id || firstUnpaid._id);
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error("Checkout error:", err);
      showNotification(err.message || "Failed to start online payment.", "error", 3000);
      setPayingOnline(null);
    }
  };

  if (loading) {
    return <BillingTabSkeleton />;
  }

  return (
    <div style={{ width: "100%" }}>
      {/* 1. Top Dashboard */}
      <SplitDashboard
        unpaidRent={unpaidRent}
        unpaidElec={unpaidElec}
        unpaidWater={unpaidWater}
        hasWaterBilling={hasWaterBilling}
        onPay={handlePay}
        payingOnline={payingOnline}
        combinedStatementCount={combinedStatementCount}
      />

      {/* 2. Embedded Sub-Tabs */}
      <div style={nav.container}>
        <div style={nav.pillBg}>
          <button
            style={subTab === "monthly" ? nav.tabActive : nav.tab}
            onClick={() => setSubTab("monthly")}
          >
            Monthly Payment
          </button>
          <button
            style={subTab === "electricity" ? nav.tabActive : nav.tab}
            onClick={() => setSubTab("electricity")}
          >
            Electricity
          </button>
          {hasWaterBilling && (
            <button
              style={subTab === "water" ? nav.tabActive : nav.tab}
              onClick={() => setSubTab("water")}
            >
              Water
            </button>
          )}
        </div>
      </div>

      {/* 3. Content */}
      <div style={{ minHeight: 400 }}>
        {subTab === "monthly" && (
          <MonthlyPaymentView
            bills={monthlyBills}
            filter={monthlyFilter}
            setFilter={setMonthlyFilter}
          />
        )}
        {subTab === "electricity" && (
          <ElectricityTabContent
            bills={electricityBills}
            isLoading={loading}
            filter={electricityFilter}
            setFilter={setElectricityFilter}
          />
        )}
        {subTab === "water" && hasWaterBilling && (
          <WaterTabContent
            bills={waterBills}
            isLoading={loading}
            filter={waterFilter}
            setFilter={setWaterFilter}
          />
        )}
      </div>
    </div>
  );
};

/* ── Styles ─────────────────────────────────────────── */

const dash = {
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 16,
    borderRadius: 12,
    border: "1px solid #FCD34D",
    background: "#FFFBEB",
    color: "#92400E",
    fontSize: 13,
    lineHeight: 1.5,
  },
  wrapper: {
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    padding: "24px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "#64748b",
    margin: "0 0 4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  amount: {
    fontSize: 32,
    fontWeight: 800,
    color: "#0A1628",
    lineHeight: 1,
  },
  helperText: {
    marginBottom: 16,
    fontSize: 12,
    lineHeight: 1.5,
    color: "#64748b",
  },
  payBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "linear-gradient(135deg, #FF8C42 0%, #F57C00 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: "0 4px 12px rgba(255, 140, 66, 0.3)",
    transition: "transform 0.1s, box-shadow 0.1s",
  },
  breakdownRow: {
    display: "flex",
    alignItems: "center",
    background: "#f8fafc",
    borderRadius: 10,
    padding: "16px",
    border: "1px solid #f1f5f9",
  },
  breakdownItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  divider: {
    width: 1,
    height: 30,
    background: "#e2e8f0",
    margin: "0 24px",
  },
};

const nav = {
  container: {
    marginBottom: 24,
    display: "flex",
    justifyContent: "flex-start",
  },
  pillBg: {
    display: "flex",
    background: "#f1f5f9",
    padding: 4,
    borderRadius: 30,
    gap: 4,
  },
  tab: {
    padding: "8px 20px",
    borderRadius: 24,
    border: "none",
    background: "transparent",
    color: "#64748b",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  tabActive: {
    padding: "8px 20px",
    borderRadius: 24,
    border: "none",
    background: "#fff",
    color: "#0A1628",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    cursor: "default",
  },
};

const s = {
  filterRow: { display: "flex", gap: 8, marginBottom: 16 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #E5E7EB",
    background: "#fff",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chipActive: {
    background: "#0A1628",
    color: "#fff",
    border: "1px solid #0A1628",
  },
  chipCount: {
    background: "rgba(255,255,255,0.2)",
    padding: "1px 7px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
  },

  billCard: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    transition: "border-color 0.2s ease",
  },
  billHeader: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "16px 20px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  badge: {
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },

  breakdown: { padding: "0 20px 20px", borderTop: "1px solid #f1f5f9" },
  chargeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0 0",
    fontSize: 14,
    color: "var(--text-heading)",
  },
  subChargeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    fontSize: 13,
    color: "#475569",
  },

  downloadBtn: {
    width: "100%",
    padding: "10px 0",
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    transition: "all 0.15s",
  },
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
  scopeNotice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#FFFBEB",
    border: "1px solid #FDE68A",
    color: "#92400E",
    fontSize: 12,
    lineHeight: 1.5,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "64px 24px",
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
  segmentCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "#0A1628",
    color: "#fff",
    fontSize: 13,
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    padding: "8px 0",
    borderBottom: "1px solid #e2e8f0",
  },
  tableHeaderCell: { fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    padding: "8px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  tableCell: { fontSize: 13, color: "#475569" },
  tableRow2: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    padding: "8px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  tableCell2: { fontSize: 13, color: "#475569" },
  segmentFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0 16px",
    color: "#FF8C42",
    fontSize: 13,
  },
  referenceCard: {
    background: "#fffdf7",
    border: "1px solid #ead7bc",
    borderRadius: 10,
    padding: "12px",
  },
  referenceIntro: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 8,
  },
  referenceTable: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  referenceSectionCell: {
    background: "#f7e3c8",
    fontWeight: 700,
  },
  referenceHeaderCell: {
    border: "1px solid #7c6b58",
    background: "#f3f4f6",
    color: "#1e293b",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 8px",
    textAlign: "center",
  },
  referenceSpacerCell: {
    border: "1px solid #7c6b58",
    background: "#f9fafb",
    padding: "6px 8px",
  },
  referenceLabelCell: {
    border: "1px solid #7c6b58",
    color: "#1f2937",
    fontSize: 13,
    padding: "6px 8px",
  },
  referenceValueCell: {
    border: "1px solid #7c6b58",
    color: "#111827",
    fontSize: 13,
    padding: "6px 8px",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  statChip: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 12px",
  },
  statLabel: { display: "block", fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 },
  statValue: { display: "block", fontSize: 13, fontWeight: 600, color: "#1e293b" },
  finalBreakdownCard: {
    border: "1px solid #f1e2c8",
    borderRadius: 10,
    background: "#fffaf0",
    overflow: "hidden",
  },
  finalBreakdownHeader: {
    padding: "10px 12px",
    background: "#f7e3c8",
    color: "#7c2d12",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  finalBreakdownBody: {
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  finalBreakdownSectionTitle: {
    color: "#7c2d12",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginTop: 2,
  },
  finalBreakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  finalBreakdownLabel: {
    color: "#475569",
    fontSize: 13,
  },
  finalBreakdownValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  finalBreakdownFooter: {
    borderTop: "1px solid #f1e2c8",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#7c2d12",
    fontSize: 13,
    fontWeight: 700,
  },
  finalBreakdownTotal: {
    color: "#9a3412",
    fontSize: 16,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
};

export default BillingTab;
