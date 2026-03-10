export default function DeleteUserModal({ user, onDelete, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-small"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete User</h2>
          <button onClick={onClose} className="modal-close">
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
    </div>
  );
}
