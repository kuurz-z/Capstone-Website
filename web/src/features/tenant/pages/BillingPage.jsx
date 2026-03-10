import { useState, useEffect, useCallback, useRef } from "react";
import { billingApi } from "../../../shared/api/apiClient";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import {
  FileText,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Info,
  History,
  Zap,
  Droplets,
  Home,
  CreditCard,
} from "lucide-react";
import "../styles/tenant-billing.css";

const BillingPage = () => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showProofModal, setShowProofModal] = useState(false);

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

  const getDisplayStatus = (bill) => {
    if (bill.paymentProof?.verificationStatus === "pending-verification")
      return "pending-verification";
    return bill.status;
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      paid: "Paid",
      overdue: "Overdue",
      "partially-paid": "Partially Paid",
      "pending-verification": "Awaiting Verification",
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
            <p>View your bills and submit payment proofs</p>
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
          <p>View your bills, charge breakdowns, and submit payment proofs</p>
        </div>

        {/* ─── Current Bill Hero Card ─── */}
        {currentBill && (
          <CurrentBillHero
            bill={currentBill}
            fmtCurrency={fmtCurrency}
            fmtMonth={fmtMonth}
            fmtDate={fmtDate}
            getDisplayStatus={getDisplayStatus}
            getStatusLabel={getStatusLabel}
            onUploadProof={() => {
              setSelectedBill(currentBill);
              setShowProofModal(true);
            }}
          />
        )}

        {/* ─── Charge Breakdown ─── */}
        {currentBill && (
          <ChargeBreakdown bill={currentBill} fmtCurrency={fmtCurrency} />
        )}

        {/* ─── Bill History ─── */}
        {pastBills.length > 0 && (
          <div className="bill-history-section">
            <h3>
              <History size={16} /> Bill History
            </h3>
            <div className="bill-history-list">
              {pastBills.map((bill) => (
                <div
                  key={bill.id}
                  className="bill-history-item"
                  onClick={() => {
                    setSelectedBill(bill);
                  }}
                >
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
                    <span
                      className={`bill-status-badge ${getDisplayStatus(bill)}`}
                    >
                      {getStatusLabel(getDisplayStatus(bill))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Payment Proof Modal ─── */}
        {showProofModal && selectedBill && (
          <PaymentProofModal
            bill={selectedBill}
            fmtCurrency={fmtCurrency}
            onClose={() => {
              setShowProofModal(false);
              setSelectedBill(null);
            }}
            onSubmitted={() => {
              setShowProofModal(false);
              setSelectedBill(null);
              loadBills();
            }}
          />
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
  getDisplayStatus,
  getStatusLabel,
  onUploadProof,
}) {
  const status = getDisplayStatus(bill);
  const canUpload =
    bill.status !== "paid" &&
    bill.paymentProof?.verificationStatus !== "pending-verification" &&
    bill.paymentProof?.verificationStatus !== "approved";

  return (
    <div className="current-bill-hero">
      <div className="bill-hero-top">
        <div className="bill-period">
          Current Bill
          <strong>{fmtMonth(bill.billingMonth)}</strong>
        </div>
        <span className={`bill-status-badge ${status}`}>
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="bill-hero-amount">{fmtCurrency(bill.totalAmount)}</div>
      <div className="bill-hero-due">
        Due: <strong>{fmtDate(bill.dueDate)}</strong>
        {bill.room && <> • Room {bill.room}</>}
      </div>

      <div className="bill-hero-actions">
        {canUpload && (
          <button className="btn-upload-proof" onClick={onUploadProof}>
            <Upload size={16} /> Upload Proof of Payment
          </button>
        )}

        {bill.paymentProof?.verificationStatus === "pending-verification" && (
          <div className="proof-status-inline">
            <Clock size={14} /> Payment proof submitted — awaiting admin
            verification
          </div>
        )}

        {bill.paymentProof?.verificationStatus === "approved" && (
          <div className="proof-status-inline">
            <CheckCircle size={14} /> Payment verified ✓
          </div>
        )}

        {bill.paymentProof?.verificationStatus === "rejected" && (
          <div
            className="proof-status-inline"
            style={{ background: "rgba(239,68,68,0.2)" }}
          >
            <XCircle size={14} /> Payment rejected:{" "}
            {bill.paymentProof.rejectionReason || "Please resubmit"}
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

      {/* Dynamic additional charges (appliance fees, etc.) */}
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
            billing period. Utilities are split fairly among all tenants based
            on length of stay.
          </span>
        </div>
      )}
    </div>
  );
}

function PaymentProofModal({ bill, fmtCurrency, onClose, onSubmitted }) {
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [amount, setAmount] = useState(bill.totalAmount || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, etc.)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      // For now, use base64 as the URL. In production, this would upload to cloud storage.
      setImageUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
    setError("");
  };

  const handleSubmit = async () => {
    if (!imageUrl) {
      setError("Please upload proof of payment");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await billingApi.submitPaymentProof(bill.id, {
        imageUrl,
        amount: Number(amount),
      });
      onSubmitted();
    } catch (err) {
      setError(err.error || err.message || "Failed to submit payment proof");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="proof-modal-overlay" onClick={onClose}>
      <div className="proof-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Upload Payment Proof</h2>
        <p className="modal-subtitle">
          Submit your proof of payment for {fmtCurrency(bill.totalAmount)}
        </p>

        {/* Upload Zone */}
        <div
          className={`proof-upload-zone ${imagePreview ? "has-image" : ""}`}
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Payment proof preview" />
          ) : (
            <div className="upload-placeholder">
              <Upload size={32} />
              <span>Click to upload payment receipt</span>
              <span style={{ fontSize: "0.75rem" }}>
                JPG, PNG, or screenshot
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* Amount */}
        <div className="form-group">
          <label>Payment Amount (₱)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount paid"
          />
        </div>

        {error && (
          <p
            style={{
              color: "#dc2626",
              fontSize: "0.85rem",
              margin: "0 0 0.5rem",
            }}
          >
            {error}
          </p>
        )}

        <div className="proof-modal-actions">
          <button className="btn-cancel-proof" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-submit-proof"
            onClick={handleSubmit}
            disabled={submitting || !imageUrl}
          >
            {submitting ? "Submitting..." : "Submit Proof"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BillingPage;
