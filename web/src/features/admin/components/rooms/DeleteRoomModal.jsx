import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function DeleteRoomModal({ room, onDelete, onClose }) {
  const [deleting, setDeleting] = useState(false);
  useEscapeClose(true, onClose);
  const hasOccupants = room?.currentOccupancy > 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(room._id);
    } catch (err) {
      console.error("Failed to delete room:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-content room-delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h2>Delete Room</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body">
          {hasOccupants && (
            <div className="room-delete-warning">
              <AlertTriangle size={18} />
              <span>
                This room currently has <strong>{room.currentOccupancy}</strong> occupant(s).
                Deleting it may cause data issues.
              </span>
            </div>
          )}
          <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Are you sure you want to delete room{" "}
            <strong>{room?.name}</strong>? This action cannot be undone.
          </p>
        </div>

        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
