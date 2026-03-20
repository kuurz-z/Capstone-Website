import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { billingApi } from "../../../../shared/api/billingApi";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";
import {
  Home,
  Zap,
  Droplets,
  CreditCard,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  Package,
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

const STATUS_STYLES = {
  overdue: { bg: "#FEF2F2", color: "#DC2626", label: "Overdue" },
  pending: { bg: "#FFFBEB", color: "#D97706", label: "Pending" },
  paid: { bg: "#F0FDF4", color: "#059669", label: "Paid" },
  "partially-paid": { bg: "#EFF6FF", color: "#2563EB", label: "Partial" },
};

const CHARGE_ITEMS = [
  { key: "rent", label: "Rent", icon: Home, color: "#0A1628" },
  { key: "electricity", label: "Electricity", icon: Zap, color: "#F59E0B" },
  { key: "water", label: "Water", icon: Droplets, color: "#3B82F6" },
  { key: "applianceFees", label: "Appliance Fee", icon: Package, color: "#8B5CF6" },
];

/* ── Stat Card ─────────────────────────────────────── */

const StatCard = ({ label, value, accent, icon: Icon }) => (
  <div style={s.statCard}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${accent}14`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={16} color={accent} />
      </div>
      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
  </div>
);

/* ── Bill Card ─────────────────────────────────────── */

const BillCard = ({ bill, onPay, payingOnline }) => {
  const [open, setOpen] = useState(bill.status !== "paid");
  const status = STATUS_STYLES[bill.status] || STATUS_STYLES.pending;
  const charges = bill.charges || {};
  const isUnpaid = bill.status !== "paid";

  return (
    <div style={{ ...s.billCard, borderLeft: `3px solid ${status.color}` }}>
      {/* Header row */}
      <button onClick={() => setOpen(!open)} style={s.billHeader}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0A1628" }}>
            {fmtMonth(bill.billingMonth)}
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
            Due: {fmtDate(bill.dueDate)}
          </div>
        </div>
        <span
          style={{
            ...s.badge,
            background: status.bg,
            color: status.color,
          }}
        >
          {status.label}
        </span>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#0A1628", marginLeft: 12 }}>
          {fmt(bill.totalAmount)}
        </span>
        {open ? (
          <ChevronUp size={16} color="#9CA3AF" style={{ marginLeft: 8 }} />
        ) : (
          <ChevronDown size={16} color="#9CA3AF" style={{ marginLeft: 8 }} />
        )}
      </button>

      {/* Expanded breakdown */}
      {open && (
        <div style={s.breakdown}>
          {CHARGE_ITEMS.map(({ key, label, icon: Icon, color }) => {
            const amount = charges[key];
            if (!amount) return null;
            return (
              <div key={key} style={s.chargeRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={14} color={color} />
                  <span style={{ color: "#4B5563", fontSize: 13 }}>{label}</span>
                </div>
                <span style={{ color: "#0A1628", fontSize: 13, fontWeight: 500 }}>
                  {fmt(amount)}
                </span>
              </div>
            );
          })}

          {/* Additional charges */}
          {(bill.additionalCharges || []).map((ch, i) => (
            <div key={i} style={s.chargeRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CreditCard size={14} color="#6B7280" />
                <span style={{ color: "#4B5563", fontSize: 13 }}>{ch.name}</span>
              </div>
              <span style={{ color: "#0A1628", fontSize: 13, fontWeight: 500 }}>
                {fmt(ch.amount)}
              </span>
            </div>
          ))}

          {/* Penalty */}
          {charges.penalty > 0 && (
            <div style={s.chargeRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={14} color="#DC2626" />
                <span style={{ color: "#DC2626", fontSize: 13 }}>Late Penalty</span>
              </div>
              <span style={{ color: "#DC2626", fontSize: 13, fontWeight: 500 }}>
                {fmt(charges.penalty)}
              </span>
            </div>
          )}

          {/* Discount */}
          {charges.discount > 0 && (
            <div style={s.chargeRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle size={14} color="#059669" />
                <span style={{ color: "#059669", fontSize: 13 }}>Discount</span>
              </div>
              <span style={{ color: "#059669", fontSize: 13, fontWeight: 500 }}>
                −{fmt(charges.discount)}
              </span>
            </div>
          )}

          {/* Total divider */}
          <div style={s.totalRow}>
            <span style={{ fontWeight: 700, color: "#0A1628", fontSize: 14 }}>Total</span>
            <span style={{ fontWeight: 700, color: "#0A1628", fontSize: 16 }}>
              {fmt(bill.totalAmount)}
            </span>
          </div>

          {/* Pay button for unpaid */}
          {isUnpaid && (
            <button
              onClick={() => onPay(bill._id)}
              disabled={payingOnline}
              style={{
                ...s.payBtn,
                opacity: payingOnline ? 0.6 : 1,
                cursor: payingOnline ? "not-allowed" : "pointer",
              }}
            >
              {payingOnline ? "Processing..." : "Pay Now →"}
            </button>
          )}

          {/* Payment info for paid */}
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

/* ── Main Component ────────────────────────────────── */

const BillingTab = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [payingOnline, setPayingOnline] = useState(false);
  const [filter, setFilter] = useState("all");

  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const data = await billingApi.getMyBills();
      setBills(data.bills || []);
    } catch {
      // Silently fail — tenant may not have bills yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handlePay = async (billId) => {
    try {
      setPayingOnline(true);
      const { checkoutUrl } = await billingApi.createCheckout(billId);
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error("Checkout error:", err);
      setPayingOnline(false);
    }
  };

  /* ── Computed values ── */
  const unpaid = bills.filter((b) => b.status !== "paid");
  const paid = bills.filter((b) => b.status === "paid");
  const totalOutstanding = unpaid.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalPaid = paid.reduce((sum, b) => sum + (b.paidAmount || b.totalAmount || 0), 0);

  const filtered =
    filter === "unpaid" ? unpaid : filter === "paid" ? paid : bills;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div style={{ width: "100%" }}>
        <div style={s.heading}>
          <h1 style={s.title}>My Bills</h1>
          <p style={s.subtitle}>Loading your billing information...</p>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              ...s.billCard,
              height: 72,
              background: "#F3F4F6",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    );
  }

  /* ── Empty state ── */
  if (bills.length === 0) {
    return (
      <div style={{ width: "100%" }}>
        <div style={s.heading}>
          <h1 style={s.title}>My Bills</h1>
          <p style={s.subtitle}>Track your monthly charges and payments</p>
        </div>
        <div style={s.emptyState}>
          <CreditCard size={48} color="#D1D5DB" />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            No bills yet
          </h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 280 }}>
            Your monthly bills will appear here once you're checked in as a tenant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={s.heading}>
        <h1 style={s.title}>My Bills</h1>
        <p style={s.subtitle}>Track your monthly charges and payments</p>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <StatCard
          label="Outstanding"
          value={fmt(totalOutstanding)}
          accent={totalOutstanding > 0 ? "#E8734A" : "#059669"}
          icon={AlertCircle}
        />
        <StatCard
          label="Unpaid Bills"
          value={unpaid.length}
          accent="#FF8C42"
          icon={Clock}
        />
        <StatCard
          label="Total Paid"
          value={fmt(totalPaid)}
          accent="#059669"
          icon={CheckCircle}
        />
      </div>

      {/* Filter chips */}
      <div style={s.filterRow}>
        {["all", "unpaid", "paid"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...s.chip,
              ...(filter === f ? s.chipActive : {}),
            }}
          >
            {f === "all" ? "All" : f === "unpaid" ? "Unpaid" : "Paid"}
            {f === "unpaid" && unpaid.length > 0 && (
              <span style={s.chipCount}>{unpaid.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Bill cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((bill) => (
          <BillCard
            key={bill._id}
            bill={bill}
            onPay={handlePay}
            payingOnline={payingOnline}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ ...s.emptyState, padding: 32 }}>
          <p style={{ fontSize: 13, color: "#9CA3AF" }}>
            No {filter} bills to show.
          </p>
        </div>
      )}

      {/* Link to full billing page */}
      <button
        onClick={() => navigate("/applicant/billing")}
        style={s.viewAllLink}
      >
        View full billing page <ExternalLink size={13} />
      </button>
    </div>
  );
};

/* ── Styles ─────────────────────────────────────────── */
const s = {
  heading: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "var(--text-heading)", margin: 0 },
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: "var(--surface-card)",
    borderRadius: 10,
    border: "1px solid var(--border-card)",
    padding: "16px 18px",
  },

  filterRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #E5E7EB",
    background: "var(--surface-card)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chipActive: {
    background: "#FF8C42",
    color: "#fff",
    border: "1px solid #FF8C42",
  },
  chipCount: {
    background: "rgba(255,255,255,0.25)",
    padding: "1px 7px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
  },

  billCard: {
    background: "var(--surface-card)",
    borderRadius: 10,
    border: "1px solid var(--border-card)",
    overflow: "hidden",
  },
  billHeader: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "14px 18px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  badge: {
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },

  breakdown: {
    padding: "0 18px 16px",
    borderTop: "1px solid var(--border-divider)",
  },
  chargeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-divider)",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 0 10px",
    borderTop: "1px solid var(--border-card)",
    marginTop: 4,
  },

  payBtn: {
    width: "100%",
    padding: "11px 0",
    background: "#FF8C42",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    marginTop: 8,
    transition: "all 0.15s",
  },
  paidInfo: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    fontSize: 12,
    color: "#059669",
    fontWeight: 500,
  },

  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "56px 24px",
    background: "var(--surface-card)",
    borderRadius: 10,
    border: "1px solid var(--border-card)",
  },

  viewAllLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    marginTop: 16,
    padding: "10px 0",
    background: "none",
    border: "none",
    color: "#FF8C42",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default BillingTab;
