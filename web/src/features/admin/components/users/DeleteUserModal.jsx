import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function DeleteUserModal({ user, onDelete, onClose }) {
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
        aria-label="Delete user"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete User</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to delete user{" "}
            <strong>
              {user?.firstName} {user?.lastName}
            </strong>
            ? This action cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">
            Cancel
          </button>
          <button onClick={onDelete} className="btn-delete-confirm">
            Delete User
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
