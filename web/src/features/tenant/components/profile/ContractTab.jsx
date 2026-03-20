import React, { useState, useEffect, useMemo } from "react";
import { FileText, RefreshCw, Download, Clock } from "lucide-react";
import dayjs from "dayjs";

/* ─── Circular Progress Ring ─────────────────────────── */
const ProgressRing = ({ percent, monthsCompleted, totalMonths }) => {
  const radius = 58;
  const stroke = 6;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: "relative", width: radius * 2, height: radius * 2 }}>
      <svg width={radius * 2} height={radius * 2} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          stroke="#E8EBF0"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress */}
        <circle
          stroke="#E8734A"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: "stroke-dashoffset 0.8s ease" }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, color: "#0A1628", lineHeight: 1 }}>
          {monthsCompleted}/{totalMonths}
        </span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>months</span>
      </div>
    </div>
  );
};

/* ─── Status Badge ───────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const config = {
    active: { bg: "#ECFDF5", color: "#059669", label: "Active" },
    expiring: { bg: "#FFF7ED", color: "#EA580C", label: "Expiring Soon" },
    expired: { bg: "#FEF2F2", color: "#DC2626", label: "Expired" },
  };
  const { bg, color, label } = config[status] || config.active;

  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 12px",
        borderRadius: 20,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </span>
  );
};

/* ─── Info Block ─────────────────────────────────────── */
const InfoBlock = ({ label, value, highlight = false }) => (
  <div style={{ borderTop: "2.5px solid #E8734A", paddingTop: 12 }}>
    <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4, fontWeight: 500 }}>{label}</p>
    <p
      style={{
        fontSize: 15,
        fontWeight: highlight ? 700 : 600,
        color: highlight ? "#E8734A" : "#0A1628",
        margin: 0,
      }}
    >
      {value}
    </p>
  </div>
);

/* ─── Main Component ─────────────────────────────────── */
const ContractTab = () => {
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        setLoading(true);
        // Use authFetch for authenticated requests
        const { authFetch } = await import("../../../../shared/api/apiClient");
        const data = await authFetch("/api/reservations/my-contract");
        setContract(data);
      } catch (err) {
        console.error("Contract fetch error:", err);
        setError(err.message || "Could not load contract");
      } finally {
        setLoading(false);
      }
    };
    fetchContract();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center", color: "#94A3B8" }}>
          <RefreshCw className="w-6 h-6 animate-spin" style={{ margin: "0 auto 12px", color: "#E8734A" }} />
          <p style={{ fontSize: 14 }}>Loading contract...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0A1628", margin: "0 0 4px" }}>My Contract</h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Your lease agreement and progress</p>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "56px 24px",
          background: "#fff", borderRadius: 10, border: "1px solid #E8EBF0",
        }}>
          <FileText size={48} color="#D1D5DB" />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "16px 0 8px" }}>
            No Active Contract
          </h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 320, margin: 0 }}>
            Your lease contract will appear here once you've been checked in by the admin. If you have questions, contact your branch manager.
          </p>
        </div>
      </div>
    );
  }

  const monthsLeft = contract.leaseDuration - contract.monthsCompleted;

  return (
    <div style={{ width: "100%" }}>
      {/* ── Header ──────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E8EBF0",
          padding: "24px 28px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0A1628", margin: 0 }}>My Contract</h2>
              <StatusBadge status={contract.contractStatus} />
            </div>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
              Your lease agreement and progress
            </p>
          </div>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0, fontWeight: 500 }}>
            {contract.room} · {contract.bed} · {contract.branch}
          </p>
        </div>
      </div>

      {/* ── Body (2 columns) ────────────────────────── */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E8EBF0",
          padding: "28px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Left: Lease Details (2x2 grid) */}
          <div style={{ flex: "1 1 320px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#0A1628", marginBottom: 20 }}>Lease Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 24px" }}>
              <InfoBlock label="Start Date" value={contract.leaseStart} />
              <InfoBlock label="End Date" value={contract.leaseEnd} />
              <InfoBlock label="Duration" value={`${contract.leaseDuration} months`} />
              <InfoBlock label="Monthly Rent" value={`₱${contract.monthlyRent.toLocaleString()}`} highlight />
            </div>
          </div>

          {/* Right: Progress Ring */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 16,
            }}
          >
            <ProgressRing
              percent={contract.progressPercent}
              monthsCompleted={contract.monthsCompleted}
              totalMonths={contract.leaseDuration}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, color: "#94A3B8" }}>
              <Clock className="w-3.5 h-3.5" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {contract.daysRemaining} days remaining
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Renewal Nudge Card ──────────────────────── */}
      <div
        style={{
          background: "#F8FAFC",
          borderRadius: 12,
          border: "1px solid #E8EBF0",
          padding: "24px 28px",
        }}
      >
        <p style={{ color: "#334155", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          {contract.contractStatus === "expired"
            ? "Your lease has expired. Please contact your admin for renewal options."
            : contract.contractStatus === "expiring"
              ? `Your lease expires in ${contract.daysRemaining} days. Consider renewing early for the best rates.`
              : `Your lease expires in ${monthsLeft} month${monthsLeft !== 1 ? "s" : ""}. Consider renewing early for the best rates.`}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            style={{
              background: "#E8734A",
              color: "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#D4622F";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#E8734A";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Request Renewal
          </button>
          <button
            style={{
              background: "transparent",
              color: "#0A1628",
              border: "1.5px solid #0A1628",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#0A1628";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#0A1628";
            }}
          >
            Download Summary
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContractTab;
