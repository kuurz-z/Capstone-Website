import React from "react";

/* ─── reusable inline-style constants ──────────── */
const TH_STYLE = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: "600",
  color: "#6B7280",
  textTransform: "uppercase",
};
const TD = { padding: "14px 16px" };
const NAME = { fontWeight: "500", color: "#1F2937", margin: 0 };
const SUB = (sz = "12px") => ({
  fontSize: sz,
  color: "#6B7280",
  margin: "2px 0 0",
});
const AMOUNT = {
  fontWeight: "600",
  color: "#059669",
  margin: 0,
  fontSize: "15px",
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

/**
 * Reusable payment table — renders either pending or verified data with
 * optional action buttons. Extracted from PaymentRequestsTab.jsx.
 */
const PaymentTable = ({
  title,
  subtitle,
  headerBg,
  headerColor,
  subColor,
  emptyText,
  payments,
  showActions = false,
  actionLoading,
  onVerify,
  onReject,
  onViewProof,
}) => (
  <div
    style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "1px solid #E5E7EB",
      marginBottom: "24px",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        padding: "16px 20px",
        borderBottom: "1px solid #E5E7EB",
        backgroundColor: headerBg,
      }}
    >
      <h3
        style={{
          fontSize: "16px",
          fontWeight: "600",
          color: headerColor,
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: "13px", color: subColor, margin: "4px 0 0" }}>
        {subtitle}
      </p>
    </div>

    {payments.length === 0 ? (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "#6B7280" }}>{emptyText}</p>
      </div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={TH_STYLE}>Customer</th>
              <th style={TH_STYLE}>Room</th>
              <th style={TH_STYLE}>Amount</th>
              {showActions ? <th style={TH_STYLE}>Move-in Date</th> : null}
              {showActions ? <th style={TH_STYLE}>Proof</th> : null}
              {showActions ? (
                <th style={{ ...TH_STYLE, textAlign: "center" }}>Actions</th>
              ) : (
                <th style={TH_STYLE}>Status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(showActions ? payments : payments.slice(0, 10)).map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                <td style={TD}>
                  <p style={NAME}>{p.customer}</p>
                  <p style={SUB()}>{p.reservationCode}</p>
                  {showActions && <p style={SUB("11px")}>{p.email}</p>}
                </td>
                <td style={TD}>
                  <p style={NAME}>{p.room}</p>
                  <p style={SUB()}>{p.branch}</p>
                </td>
                <td style={TD}>
                  <p style={AMOUNT}>₱{p.totalPrice.toLocaleString()}</p>
                </td>

                {showActions && (
                  <td style={TD}>
                    <p
                      style={{ fontSize: "13px", color: "#1F2937", margin: 0 }}
                    >
                      {fmtDate(p.checkInDate)}
                    </p>
                  </td>
                )}

                {showActions && (
                  <td style={TD}>
                    {p.proofOfPaymentUrl ? (
                      <button
                        onClick={() => onViewProof?.(p.proofOfPaymentUrl)}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#EFF6FF",
                          color: "#0C375F",
                          border: "1px solid #BFDBFE",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "500",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        📎 View Proof
                      </button>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
                        No proof
                      </span>
                    )}
                  </td>
                )}

                {showActions ? (
                  <td style={{ ...TD, textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        onClick={() => onVerify?.(p.id)}
                        disabled={actionLoading === p.id}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#10B981",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "500",
                          cursor:
                            actionLoading === p.id ? "not-allowed" : "pointer",
                          opacity: actionLoading === p.id ? 0.6 : 1,
                        }}
                      >
                        ✓ Verify
                      </button>
                      <button
                        onClick={() => onReject?.(p.id)}
                        disabled={actionLoading === p.id}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "white",
                          color: "#DC2626",
                          border: "1px solid #DC2626",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "500",
                          cursor:
                            actionLoading === p.id ? "not-allowed" : "pointer",
                          opacity: actionLoading === p.id ? 0.6 : 1,
                        }}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </td>
                ) : (
                  <td style={TD}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "500",
                        backgroundColor: "#D1FAE5",
                        color: "#059669",
                      }}
                    >
                      ✓ Paid & Confirmed
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default PaymentTable;
