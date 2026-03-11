import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { billingApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
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
} from "lucide-react";
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

  const getStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      paid: "Paid",
      overdue: "Overdue",
      "partially-paid": "Partially Paid",
    };
    return labels[status] || status;
  };

  // Current bill = latest unpaid
  const currentBill =
    bills.find((b) => b.status !== "paid" && b.status !== "partially-paid") ||
    bills[0];
  const pastBills = bills.filter((b) => b !== currentBill);

  if (loading) {
    return (
      <TenantLayout>
        <div className="tenant-billing">
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <div
              className="spinner"
              style={{
                width: 32,
                height: 32,
                border: "3px solid #e2e8f0",
                borderTopColor: "#E7710F",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 1rem",
              }}
            />
            <p style={{ color: "#64748b" }}>Loading your billing...</p>
          </div>
        </div>
      </TenantLayout>
    );
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
            getStatusLabel={getStatusLabel}
            onPayOnline={() => handlePayOnline(currentBill.id)}
            payingOnline={payingOnline}
          />
        )}

        {/* ─── Charge Breakdown ─── */}
        {currentBill && (
          <ChargeBreakdown bill={currentBill} fmtCurrency={fmtCurrency} />
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
                    </span>
                  </div>
                  <div className="bill-history-right">
                    <span className="bill-amount">
                      {fmtCurrency(bill.totalAmount)}
                    </span>
                    <span className={`bill-status-badge ${bill.status}`}>
                      {getStatusLabel(bill.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
  getStatusLabel,
  onPayOnline,
  payingOnline,
}) {
  const canPay = bill.status !== "paid";

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

      <div className="bill-hero-amount">{fmtCurrency(bill.totalAmount)}</div>
      <div className="bill-hero-due">
        Due: <strong>{fmtDate(bill.dueDate)}</strong>
        {bill.room && <> • Room {bill.room}</>}
      </div>

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

        {bill.status === "paid" && (
          <div className="proof-status-inline paid-status">
            <CheckCircle size={14} /> Payment confirmed ✓
          </div>
        )}
      </div>
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
            <Droplets size={14} /> Water
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
  const handleDownload = () => {
    const receiptContent = `
LILYCREST DORMITORY
═══════════════════════════════════
        PAYMENT RECEIPT
═══════════════════════════════════

Receipt No:    ${bill.paymongoPaymentId || bill.id || "N/A"}
Date:          ${fmtDate(bill.paymentDate || bill.updatedAt)}
Billing Month: ${fmtMonth(bill.billingMonth)}

Room:          ${bill.room || "N/A"}
Branch:        ${bill.branch || "N/A"}

───────────────────────────────────
CHARGES
───────────────────────────────────
Rent:          ${fmtCurrency(bill.charges?.rent)}${(bill.charges?.electricity || 0) > 0 ? `\nElectricity:   ${fmtCurrency(bill.charges.electricity)}` : ""}${(bill.charges?.water || 0) > 0 ? `\nWater:         ${fmtCurrency(bill.charges.water)}` : ""}${(bill.charges?.penalty || 0) > 0 ? `\nPenalty:       ${fmtCurrency(bill.charges.penalty)}` : ""}${(bill.charges?.discount || 0) > 0 ? `\nDiscount:     -${fmtCurrency(bill.charges.discount)}` : ""}

───────────────────────────────────
TOTAL PAID:    ${fmtCurrency(bill.paidAmount || bill.totalAmount)}
Method:        ${(bill.paymentMethod || "online").toUpperCase()}
Status:        PAID ✓
═══════════════════════════════════

Thank you for your payment!
Lilycrest Dormitory Management
    `.trim();

    const blob = new Blob([receiptContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${fmtMonth(bill.billingMonth).replace(/\s/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <span className="receipt-value">{fmtMonth(bill.billingMonth)}</span>
        </div>
        <div className="receipt-row">
          <span className="receipt-label">Payment Method</span>
          <span className="receipt-value">
            {(bill.paymentMethod || "online").charAt(0).toUpperCase() +
              (bill.paymentMethod || "online").slice(1)}
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
