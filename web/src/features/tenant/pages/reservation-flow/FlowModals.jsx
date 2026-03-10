import React from "react";

/**
 * Inline confirmation modals for the reservation flow:
 * - LoginConfirmModal — prompts unauthenticated users to sign in
 * - CancelConfirmModal — confirms discard of unsaved changes
 * - StageConfirmModal — confirms room selection / reservation submission
 */

// ── Shared overlay + card styles ────────────────────────────
const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const cardStyle = {
  background: "white",
  borderRadius: "12px",
  padding: "32px",
  maxWidth: "400px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  textAlign: "center",
};

const btnLight = {
  padding: "10px 24px",
  border: "2px solid #ddd",
  background: "white",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "500",
  color: "#333",
};

// ── Login Confirm ────────────────────────────────────────────
export const LoginConfirmModal = ({ show, onLogin, onDismiss }) => {
  if (!show) return null;
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔐</div>
        <h2
          style={{ marginBottom: "12px", fontSize: "20px", fontWeight: "600" }}
        >
          Login Required
        </h2>
        <p style={{ marginBottom: "24px", color: "#666", lineHeight: "1.6" }}>
          You need to be logged in to complete your reservation. Your
          reservation data will be saved.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={onDismiss} style={btnLight}>
            Go Back
          </button>
          <button
            onClick={onLogin}
            style={{
              ...btnLight,
              background: "#4CAF50",
              color: "white",
              border: "none",
            }}
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Cancel Confirm ───────────────────────────────────────────
export const CancelConfirmModal = ({ show, onConfirm, onDismiss }) => {
  if (!show) return null;
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
        <h2
          style={{ marginBottom: "12px", fontSize: "20px", fontWeight: "600" }}
        >
          Discard Changes?
        </h2>
        <p style={{ marginBottom: "24px", color: "#666", lineHeight: "1.6" }}>
          Are you sure you want to go back? Your current progress will be lost
          and you'll need to start over.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={onDismiss} style={btnLight}>
            Continue
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...btnLight,
              background: "#FF6B6B",
              color: "white",
              border: "none",
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Stage Confirm ────────────────────────────────────────────
export const StageConfirmModal = ({
  show,
  pendingAction,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  const isStage1 = pendingAction === "stage1";
  const title = isStage1
    ? "Confirm Room Selection"
    : "Confirm Reservation Submission";
  const message = isStage1
    ? "Are you sure you want to proceed with this room selection? A reservation draft will be created."
    : "Are you sure you want to submit your reservation? Once submitted, you will need to wait for admin confirmation.";
  const icon = isStage1 ? "🏠" : "✅";

  return (
    <div style={overlayStyle}>
      <div
        style={{
          ...cardStyle,
          borderRadius: "16px",
          width: "90%",
          boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#FEF3C7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: "24px",
          }}
        >
          {icon}
        </div>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: "#1F2937",
            margin: "0 0 8px",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: "14px",
            color: "#6B7280",
            margin: "0 0 24px",
            lineHeight: "1.5",
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              background: "#F3F4F6",
              color: "#374151",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
              fontSize: "14px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "12px",
              background: "#E7710F",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            Yes, Proceed
          </button>
        </div>
      </div>
    </div>
  );
};
