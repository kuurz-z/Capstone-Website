import { useState } from "react";
import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

const ACTION_CONFIG = {
  suspend: {
    title: "Suspend Account",
    description:
      "This will temporarily disable the user's access. They won't be able to log in or use any features until reactivated.",
    confirmLabel: "Suspend Account",
    icon: "S",
    iconBg: "#fff7ed",
    btnClass: "btn-suspend-confirm",
    showReason: true,
    reasonPlaceholder:
      "Reason for suspension (e.g., policy violation, non-payment)...",
  },
  ban: {
    title: "Ban Account",
    description:
      "This will permanently disable the user's access. This is a severe action and only an owner can reverse it.",
    confirmLabel: "Ban Account",
    icon: "B",
    iconBg: "#fef2f2",
    btnClass: "btn-ban-confirm",
    showReason: true,
    reasonPlaceholder:
      "Reason for ban (e.g., repeated violations, fraud)...",
  },
  reactivate: {
    title: "Reactivate Account",
    description:
      "This will restore the user's access. They'll be able to log in and use all features again.",
    confirmLabel: "Reactivate",
    icon: "A",
    iconBg: "#ecfdf5",
    btnClass: "btn-reactivate-confirm",
    showReason: false,
  },
};

export default function AccountActionModal({
  action,
  user,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useBodyScrollLock(!!(action && user));
  useEscapeClose(!!(action && user), onClose);

  if (!action || !user || typeof document === "undefined") return null;

  const config = ACTION_CONFIG[action];
  if (!config) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(action, user._id, reason);
      onClose();
    } catch (err) {
      console.error(`Account action '${action}' failed:`, err);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content modal-small"
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{config.title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div
          className="modal-body"
          style={{ textAlign: "center", padding: "1.5rem" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: config.iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              fontSize: 24,
            }}
          >
            {config.icon}
          </div>

          <p
            style={{
              margin: "0 0 0.5rem",
              fontWeight: 600,
              color: "#1e293b",
              fontSize: "0.9375rem",
            }}
          >
            {user.firstName} {user.lastName}
          </p>
          <p
            style={{
              margin: "0 0 1rem",
              color: "#6b7280",
              fontSize: "0.8125rem",
            }}
          >
            @{user.username || "user"} · {user.email}
          </p>

          <p
            style={{
              margin: "0 0 1rem",
              color: "#64748b",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
            }}
          >
            {config.description}
          </p>

          {config.showReason && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={config.reasonPlaceholder}
              rows={3}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                marginBottom: "0.25rem",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#2e7cf6";
                e.target.style.boxShadow = "0 0 0 3px rgba(10, 22, 40, 0.08)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#d1d5db";
                e.target.style.boxShadow = "none";
              }}
            />
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={config.btnClass}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
