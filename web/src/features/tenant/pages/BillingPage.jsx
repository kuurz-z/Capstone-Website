import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { billingApi } from "../../../shared/api/apiClient";
import { useMyUtilityBills, useMyUtilityBreakdownByBillId } from "../../../shared/hooks/queries/useUtility";
import { showNotification } from "../../../shared/utils/notification";
import { formatPaymentMethod } from "../../../shared/utils/formatPaymentMethod";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  History,
  Zap,
  Droplets,
  Home,
  CreditCard,
  Download,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import BillingPageSkeleton from "../components/billing/BillingPageSkeleton";
import "../styles/tenant-billing.css";

const BillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [payingOnline, setPayingOnline] = useState(false);

  // Handle PayMongo return (success or cancelled)
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const sessionId = searchParams.get("session_id");

    if (paymentStatus === "success" && sessionId) {
      billingApi
        .checkPaymentStatus(sessionId)
        .then((result) => {
          if (result.status === "paid") {
            showNotification(
              "Payment successful! Your bill has been paid.",
              "success",
              5000,
            );
            loadBills();
          } else {
            showNotification(
              "Payment is being processed. It may take a moment.",
              "info",
              5000,
            );
          }
        })
        .catch(() => {
          showNotification(
            "Could not verify payment. Please refresh.",
            "warning",
            5000,
          );
        });
      setSearchParams({}, { replace: true });
    } else if (paymentStatus === "cancelled") {
      showNotification(
        "Payment was cancelled. You can try again.",
        "info",
        3000,
      );
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePayOnline = async (billId) => {
    try {
      setPayingOnline(true);
      const { checkoutUrl } = await billingApi.createCheckout(billId);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Failed to create checkout:", error);
      showNotification(
        error.message || "Failed to start online payment. Try again.",
        "error",
        3000,
      );
      setPayingOnline(false);
    }
  };

  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const data = await billingApi.getMyBills();
      setBills(data.bills || []);
    } catch (error) {
      console.error("Failed to load bills:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const fmtCurrency = (amount) =>
    `₱${(amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const fmtMonth = (date) =>
    new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
    });

  const fmtDate = (date) =>
    new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const fmtCycle = (bill) => {
    if (!bill?.billingCycleStart || !bill?.billingCycleEnd) return null;
    return `${fmtDate(bill.billingCycleStart)} - ${fmtDate(bill.billingCycleEnd)}`;
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      paid: "Paid",
      overdue: "Overdue",
      "partially-paid": "Partially Paid",
    };
    return labels[status] || status;
  };

  const currentBill =
    bills.find((b) => (b.remainingAmount ?? b.totalAmount ?? 0) > 0) || bills[0];
  const pastBills = bills.filter((b) => b !== currentBill);

  if (loading) {
    return <BillingPageSkeleton />;
  }

  if (bills.length === 0) {
    return (
      <TenantLayout>
        <div className="tenant-billing">
          <div className="billing-page-header">
            <h1>Billing & Payments</h1>
            <p>View your bills and make payments online</p>
          </div>
          <div className="no-bills-state">
            <FileText size={48} />
            <h3>No bills yet</h3>
            <p>
              Your billing statements will appear here once your admin generates
              them.
            </p>
          </div>
        </div>
      </TenantLayout>
    );
  }

  return (
    <TenantLayout>
      <div className="tenant-billing">
        <div className="billing-page-header">
          <h1>Billing & Payments</h1>
          <p>View your bills, charge breakdowns, and pay online</p>
        </div>

        {/* ─── Current Bill Hero Card ─── */}
        {currentBill && (
          <CurrentBillHero
            bill={currentBill}
            fmtCurrency={fmtCurrency}
            fmtMonth={fmtMonth}
            fmtDate={fmtDate}
            fmtCycle={fmtCycle}
            getStatusLabel={getStatusLabel}
            onPayOnline={() => handlePayOnline(currentBill.id)}
            payingOnline={payingOnline}
          />
        )}

        {/* ─── Charge Breakdown ─── */}
        {currentBill && (
          <ChargeBreakdown bill={currentBill} fmtCurrency={fmtCurrency} />
        )}

        {/* ─── Electricity Segment Breakdown ─── */}
        {currentBill?.charges?.electricity > 0 && (
          <ElectricityBreakdown
            billId={currentBill.id || currentBill._id}
            fmtCurrency={fmtCurrency}
          />
        )}

        {currentBill?.charges?.water > 0 && (
          <WaterBreakdown
            billId={currentBill.id || currentBill._id}
            fmtCurrency={fmtCurrency}
          />
        )}

        {/* ─── Payment Receipt (for paid bills) ─── */}
        {currentBill && currentBill.status === "paid" && (
          <PaymentReceipt
            bill={currentBill}
            fmtCurrency={fmtCurrency}
            fmtMonth={fmtMonth}
            fmtDate={fmtDate}
          />
        )}

        {/* ─── Bill History ─── */}
        {pastBills.length > 0 && (
          <div className="bill-history-section">
            <h3>
              <History size={16} /> Bill History
            </h3>
            <div className="bill-history-list">
              {pastBills.map((bill) => (
                <div key={bill.id} className="bill-history-item">
                  <div className="bill-history-left">
                    <span className="bill-month">
                      {fmtMonth(bill.billingMonth)}
                    </span>
                    <span className="bill-room">
                      {bill.room} • {bill.branch}
                      {fmtCycle(bill) ? ` • ${fmtCycle(bill)}` : ""}
                      {bill.dueDate ? ` • Due ${fmtDate(bill.dueDate)}` : ""}
                    </span>
                  </div>
                  <div className="bill-history-right">
                    <span className="bill-amount">
                      {fmtCurrency(bill.totalAmount)}
                    </span>
                    <span className={`bill-status-badge ${bill.status}`}>
                      {getStatusLabel(bill.status)}
                    </span>
                    <button
                      className="btn-download-receipt"
                      title="Download billing statement PDF"
                      onClick={async () => {
                        const { generateBillingPDF } = await import(
                          "../../../shared/utils/pdfUtils"
                        );
                        generateBillingPDF(bill);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        color: "#64748B",
                        fontSize: "12px",
                      }}
                    >
                      <Download size={12} /> PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Electricity History ─── */}
        <ElectricityHistory fmtCurrency={fmtCurrency} />
      </div>
    </TenantLayout>
  );
};

/* ─── Sub-components ─── */

function CurrentBillHero({
  bill,
  fmtCurrency,
  fmtMonth,
  fmtDate,
  fmtCycle,
  getStatusLabel,
  onPayOnline,
  payingOnline,
}) {
  const canPay = (bill.remainingAmount ?? bill.totalAmount ?? 0) > 0;

  return (
    <div className="current-bill-hero">
      <div className="bill-hero-top">
        <div className="bill-period">
          Current Bill
          <strong>{fmtMonth(bill.billingMonth)}</strong>
        </div>
        <span className={`bill-status-badge ${bill.status}`}>
          {getStatusLabel(bill.status)}
        </span>
      </div>

      <div className="bill-hero-amount">
        {fmtCurrency(bill.remainingAmount ?? bill.totalAmount)}
      </div>
      <div className="bill-hero-due">
        Due: <strong>{bill.dueDate ? fmtDate(bill.dueDate) : "To be confirmed"}</strong>
        {bill.room && <> • Room {bill.room}</>}
      </div>
      {fmtCycle(bill) && (
        <div className="bill-hero-due">
          Cycle: <strong>{fmtCycle(bill)}</strong>
        </div>
      )}
      {bill.reservationCreditApplied > 0 && (
        <div className="bill-hero-due">
          First bill credit applied: <strong>-{fmtCurrency(bill.reservationCreditApplied)}</strong>
          {" "}from your reservation fee
        </div>
      )}

      <div className="bill-hero-actions">
        {canPay && (
          <button
            className="btn-pay-online"
            onClick={onPayOnline}
            disabled={payingOnline}
          >
            <CreditCard size={16} />
            {payingOnline
              ? "Redirecting to payment..."
              : "Pay Online (GCash / Maya / Card)"}
          </button>
        )}

        <button
          className="btn-download-receipt"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            cursor: "pointer",
            color: "#475569",
            fontSize: "13px",
            fontWeight: 500,
          }}
          onClick={async () => {
            const { generateBillingPDF } = await import(
              "../../../shared/utils/pdfUtils"
            );
            generateBillingPDF(bill);
          }}
        >
          <Download size={14} /> Download Statement
        </button>

        {bill.status === "paid" && (
          <div className="proof-status-inline paid-status">
            <CheckCircle size={14} /> Payment confirmed ✓
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ElectricityBreakdown — Collapsible kWh segment detail panel
 * Fetches the breakdown using the bill's own ID so the tenant
 * doesn't need to know the periodId.
 */
function ElectricityBreakdown({ billId, fmtCurrency }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useMyUtilityBreakdownByBillId("electricity", open ? billId : null);

  const fmtKwh = (n) =>
    `${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kWh`;

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div className="charges-card electricity-breakdown-card">
      <button
        className="electricity-breakdown-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="electricity-breakdown-toggle__label">
          <Zap size={15} className="electricity-breakdown-toggle__icon" />
          Electricity Breakdown
        </span>
        <span className="electricity-breakdown-toggle__hint">
          {open ? "Hide details" : "How was this calculated?"}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="electricity-breakdown-body">
          {isLoading && (
            <div className="electricity-breakdown-loading">
              <Activity size={14} /> Loading breakdown…
            </div>
          )}

          {isError && (
            <div className="electricity-breakdown-error">
              <AlertCircle size={14} /> Could not load breakdown. Try again later.
            </div>
          )}

          {data && (
            <>
              {/* Summary bar */}
              <div className="electricity-breakdown-summary">
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Your kWh</span>
                  <span className="electricity-breakdown-stat__value">{fmtKwh(data.myTotalKwh)}</span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Rate</span>
                  <span className="electricity-breakdown-stat__value">₱{data.ratePerKwh}/kWh</span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Your Total</span>
                  <span className="electricity-breakdown-stat__value electricity-breakdown-stat__value--accent">
                    {fmtCurrency(data.myBillAmount)}
                  </span>
                </div>
                {data.period?.startDate && (
                  <div className="electricity-breakdown-stat">
                    <span className="electricity-breakdown-stat__label">Period</span>
                    <span className="electricity-breakdown-stat__value electricity-breakdown-stat__value--small">
                      {fmtDate(data.period.startDate)} – {fmtDate(data.period.endDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Per-segment table */}
              {data.segments?.length > 0 && (
                <div className="electricity-segment-table-wrap">
                  <table className="electricity-segment-table">
                    <thead>
                      <tr>
                        <th>Segment</th>
                        <th>Co-tenants</th>
                        <th>Your kWh</th>
                        <th>Your Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.segments.map((seg, i) => (
                        <tr key={i}>
                          <td>{seg.periodLabel}</td>
                          <td className="electricity-segment-table__center">{seg.activeTenantCount}</td>
                          <td className="electricity-segment-table__num">{fmtKwh(seg.sharePerTenantKwh)}</td>
                          <td className="electricity-segment-table__num electricity-segment-table__num--bold">
                            {fmtCurrency(seg.sharePerTenantCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="electricity-breakdown-note">
                    <Info size={12} /> Electricity cost is split equally among tenants present during each interval.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WaterBreakdown({ billId, fmtCurrency }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useMyUtilityBreakdownByBillId("water", open ? billId : null);
  const record = data?.record || null;

  const fmtShortDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

  return (
    <div className="charges-card electricity-breakdown-card water-breakdown-card">
      <button
        className="electricity-breakdown-toggle water-breakdown-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="electricity-breakdown-toggle__label">
          <Droplets
            size={15}
            className="electricity-breakdown-toggle__icon water-breakdown-toggle__icon"
          />
          Water Breakdown
        </span>
        <span className="electricity-breakdown-toggle__hint">
          {open ? "Hide details" : "See room water split"}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="electricity-breakdown-body">
          {isLoading && (
            <div className="electricity-breakdown-loading">
              <Activity size={14} /> Loading breakdown...
            </div>
          )}

          {isError && (
            <div className="electricity-breakdown-error">
              <AlertCircle size={14} /> Could not load water breakdown. Try again later.
            </div>
          )}

          {record && (
            <>
              <div className="electricity-breakdown-summary">
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Cycle</span>
                  <span className="electricity-breakdown-stat__value electricity-breakdown-stat__value--small">
                    {fmtShortDate(record.cycleStart)} - {fmtShortDate(record.cycleEnd)}
                  </span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Room Usage</span>
                  <span className="electricity-breakdown-stat__value">
                    {Number(record.usage || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} units
                  </span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Rate</span>
                  <span className="electricity-breakdown-stat__value">
                    {fmtCurrency(record.ratePerUnit)}/unit
                  </span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Room Total</span>
                  <span className="electricity-breakdown-stat__value">
                    {fmtCurrency(record.roomTotal)}
                  </span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Tenants Sharing</span>
                  <span className="electricity-breakdown-stat__value">
                    {record.tenantsSharing}
                  </span>
                </div>
                <div className="electricity-breakdown-stat">
                  <span className="electricity-breakdown-stat__label">Your Share</span>
                  <span className="electricity-breakdown-stat__value electricity-breakdown-stat__value--accent">
                    {fmtCurrency(record.myShare)}
                  </span>
                </div>
              </div>
              <p className="electricity-breakdown-note">
                <Info size={12} /> Water is split equally among eligible tenants covered by this room cycle.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChargeBreakdown({ bill, fmtCurrency }) {
  const c = bill.charges || {};
  return (
    <div className="charges-card">
      <h3>
        <CreditCard size={16} /> Charge Breakdown
      </h3>

      <div className="charge-line">
        <span className="charge-label">
          <Home size={14} /> Monthly Rent
        </span>
        <span className="charge-amount">{fmtCurrency(c.rent)}</span>
      </div>

      {(c.electricity || 0) > 0 && (
        <div className="charge-line">
          <span className="charge-label">
            <Zap size={14} /> Electricity
          </span>
          <span className="charge-amount">{fmtCurrency(c.electricity)}</span>
        </div>
      )}

      {(c.water || 0) > 0 && (
        <div className="charge-line">
          <span className="charge-label">
            <Droplets size={14} /> Water (room reading)
          </span>
          <span className="charge-amount">{fmtCurrency(c.water)}</span>
        </div>
      )}

      {(bill.additionalCharges || []).map((charge, idx) => (
        <div className="charge-line" key={idx}>
          <span className="charge-label">{charge.name}</span>
          <span className="charge-amount">{fmtCurrency(charge.amount)}</span>
        </div>
      ))}

      {(c.penalty || 0) > 0 && (
        <div className="charge-line penalty">
          <span className="charge-label">
            <AlertCircle size={14} /> Penalty (
            {bill.penaltyDetails?.daysLate || 0} days × ₱
            {bill.penaltyDetails?.ratePerDay || 50}/day)
          </span>
          <span className="charge-amount">+{fmtCurrency(c.penalty)}</span>
        </div>
      )}

      {(c.discount || 0) > 0 && (
        <div className="charge-line discount">
          <span className="charge-label">Discount</span>
          <span className="charge-amount">-{fmtCurrency(c.discount)}</span>
        </div>
      )}

      {(bill.grossAmount || 0) > 0 && bill.reservationCreditApplied > 0 && (
        <>
          <div className="charge-line total">
            <span className="charge-label">Gross Charges</span>
            <span className="charge-amount">{fmtCurrency(bill.grossAmount)}</span>
          </div>
          <div className="charge-line discount">
            <span className="charge-label">Reservation Credit Applied</span>
            <span className="charge-amount">-{fmtCurrency(bill.reservationCreditApplied)}</span>
          </div>
        </>
      )}

      <div className="charge-line total">
        <span className="charge-label">Total Amount Due</span>
        <span className="charge-amount">{fmtCurrency(bill.totalAmount)}</span>
      </div>

      {bill.paidAmount > 0 && bill.status !== "paid" && (
        <div className="charge-line" style={{ color: "#16a34a" }}>
          <span className="charge-label">Amount Paid</span>
          <span className="charge-amount">{fmtCurrency(bill.paidAmount)}</span>
        </div>
      )}

      {(bill.remainingAmount ?? 0) > 0 && (
        <div className="charge-line total">
          <span className="charge-label">Remaining Balance</span>
          <span className="charge-amount">
            {fmtCurrency(bill.remainingAmount)}
          </span>
        </div>
      )}

      {bill.proRataDays && (
        <div className="prorate-info">
          <Info size={14} />
          <span>
            Your utility charges are pro-rated based on{" "}
            <strong>{bill.proRataDays} days</strong> of occupancy during this
            billing period. Utilities are split fairly among all tenants based on
            length of stay.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * PaymentReceipt — Embedded receipt card for paid bills with download support
 */
function PaymentReceipt({ bill, fmtCurrency, fmtMonth, fmtDate }) {
  const handleDownload = async () => {
    const { generateBillingReceipt } = await import(
      "../../../shared/utils/pdfReceipt.js"
    );
    generateBillingReceipt(bill);
  };

  return (
    <div className="receipt-card">
      <div className="receipt-header">
        <div className="receipt-badge">
          <CheckCircle size={16} /> Payment Receipt
        </div>
        <button className="btn-download-receipt" onClick={handleDownload}>
          <Download size={14} /> Download
        </button>
      </div>

      <div className="receipt-body">
        <div className="receipt-row">
          <span className="receipt-label">Receipt No.</span>
          <span className="receipt-value">
            {bill.paymongoPaymentId
              ? bill.paymongoPaymentId.slice(-12).toUpperCase()
              : bill.id?.slice(-8).toUpperCase() || "N/A"}
          </span>
        </div>
        <div className="receipt-row">
          <span className="receipt-label">Date Paid</span>
          <span className="receipt-value">
            {fmtDate(bill.paymentDate || bill.updatedAt)}
          </span>
        </div>
        <div className="receipt-row">
          <span className="receipt-label">Billing Period</span>
          <span className="receipt-value">
            {bill.billingCycleStart && bill.billingCycleEnd
              ? `${fmtDate(bill.billingCycleStart)} - ${fmtDate(bill.billingCycleEnd)}`
              : fmtMonth(bill.billingMonth)}
          </span>
        </div>
        {bill.reservationCreditApplied > 0 && (
          <div className="receipt-row">
            <span className="receipt-label">Reservation Credit</span>
            <span className="receipt-value">
              -{fmtCurrency(bill.reservationCreditApplied)}
            </span>
          </div>
        )}
        <div className="receipt-row">
          <span className="receipt-label">Payment Method</span>
          <span className="receipt-value">
            {formatPaymentMethod(bill.paymentMethod)}
          </span>
        </div>
        <div className="receipt-row total">
          <span className="receipt-label">Amount Paid</span>
          <span className="receipt-value">
            {fmtCurrency(bill.paidAmount || bill.totalAmount)}
          </span>
        </div>
      </div>

      <div className="receipt-footer">
        Thank you for your payment — Lilycrest Dormitory
      </div>
    </div>
  );
}

export default BillingPage;

/* ─── Electricity History Section ──────────────────── */

/**
 * ElectricityHistory — Shows all past electricity billing periods.
 * Each row expands to reveal the per-segment breakdown.
 * Uses the existing tenant-scoped hooks: no new backend needed.
 */
function ElectricityHistory({ fmtCurrency }) {
  const { data, isLoading } = useMyUtilityBills("electricity");
  const periods = data?.bills || [];

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const fmtKwh = (n) =>
    `${(n || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} kWh`;

  if (isLoading) return null;
  if (periods.length === 0) return null;

  return (
    <div className="elec-history">
      <h3 className="elec-history__title">
        <Zap size={16} className="elec-history__icon" />
        Electricity Billing History
      </h3>
      <div className="elec-history__list">
        {periods.map((period) => (
          <ElectricityPeriodRow
            key={period.billingPeriodId || period.billingResultId}
            period={period}
            fmtCurrency={fmtCurrency}
            fmtDate={fmtDate}
            fmtKwh={fmtKwh}
          />
        ))}
      </div>
    </div>
  );
}

function ElectricityPeriodRow({ period, fmtCurrency, fmtDate, fmtKwh }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMyBillBreakdown(open ? period.billingPeriodId : null);

  const mySegments = data
    ? data.segments || []
    : [];

  return (
    <div className={`elec-period-row${open ? " elec-period-row--open" : ""}`}>
      {/* Header — always visible */}
      <button className="elec-period-row__header" onClick={() => setOpen((v) => !v)}>
        <Zap size={13} className="elec-period-row__icon" />
        <div className="elec-period-row__meta">
          <span className="elec-period-row__room">{period.room}</span>
          <span className="elec-period-row__date">{fmtDate(period.computedAt)}</span>
        </div>
        <div className="elec-period-row__stats">
          <span className="elec-period-row__kwh">{fmtKwh(period.totalKwh)}</span>
          <span className="elec-period-row__amount">{fmtCurrency(period.billAmount)}</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expandable breakdown */}
      {open && (
        <div className="elec-period-row__body">
          {isLoading && (
            <div className="electricity-breakdown-loading">
              <Activity size={13} /> Loading segments…
            </div>
          )}

          {!isLoading && data && (
            <>
              {/* Summary row */}
              <div className="elec-period-summary">
                <span>Rate: <strong>₱{data.ratePerKwh}/kWh</strong></span>
                <span>Your kWh: <strong>{fmtKwh(data.myTotalKwh)}</strong></span>
                <span>Your total: <strong className="elec-period-summary__accent">{fmtCurrency(data.myBillAmount)}</strong></span>
              </div>

              {/* Segment table */}
              {mySegments.length > 0 ? (
                <div className="electricity-segment-table-wrap">
                  <table className="electricity-segment-table">
                    <thead>
                      <tr>
                        <th>Segment</th>
                        <th>Co-tenants</th>
                        <th>Your kWh</th>
                        <th>Your Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mySegments.map((seg, i) => (
                        <tr key={i}>
                          <td>{seg.periodLabel}</td>
                          <td className="electricity-segment-table__center">{seg.activeTenantCount}</td>
                          <td className="electricity-segment-table__num">
                            {fmtKwh(seg.sharePerTenantKwh)}
                          </td>
                          <td className="electricity-segment-table__num electricity-segment-table__num--bold">
                            {fmtCurrency(seg.sharePerTenantCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="elec-period-row__no-segments">
                  No segment data available for this period.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
