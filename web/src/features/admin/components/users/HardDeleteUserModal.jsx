import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function HardDeleteUserModal({ user, onDelete, onClose }) {
  useBodyScrollLock(true);
  useEscapeClose(true, onClose);

  if (typeof document === "undefined") return null;

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
        aria-label="Permanently delete user"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Permanently Delete User</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to permanently delete{" "}
            <strong>
              {user?.firstName} {user?.lastName}
            </strong>
            ?
          </p>
          <p style={{ marginTop: 12, color: "var(--text-secondary)" }}>
            This action cannot be undone. User records will be removed from the system.
          </p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">
            Cancel
          </button>
          <button
            onClick={() => onDelete({ hardDelete: true })}
            className="btn-delete-confirm"
          >
            Permanently Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}