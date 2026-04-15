import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function RestoreUserModal({ user, onConfirm, onClose }) {
  useBodyScrollLock(true);
  useEscapeClose(true, onClose);

  if (!user || typeof document === "undefined") return null;

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
        aria-label="Restore archived user"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Restore Archived Account</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body" style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              fontSize: 24,
              color: "#2563eb",
              fontWeight: 700,
            }}
          >
            R
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
            @{user.username || "user"} - {user.email}
          </p>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
            }}
          >
            This restores the archived account and returns it to active status.
            Permanently deleted accounts cannot be restored.
          </p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-reactivate-confirm">
            Restore Account
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
