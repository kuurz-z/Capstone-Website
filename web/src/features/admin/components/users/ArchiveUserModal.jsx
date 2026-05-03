import { useState } from "react";
import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function ArchiveUserModal({ user, isOwner, onDelete, onClose }) {
 const [hardDelete, setHardDelete] = useState(false);

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
 aria-label="Archive user"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="modal-header">
 <h2>Archive User</h2>
 <button onClick={onClose} className="modal-close" aria-label="Close">
 &times;
 </button>
 </div>
 <div className="modal-body">
 <p>
 This will archive{" "}
 <strong>
 {user?.firstName} {user?.lastName}
 </strong>
 . Archived users cannot sign in, but their financial and reservation
 records stay intact.
 </p>
 <p style={{ marginTop: 12, color: "var(--text-secondary)" }}>
 Archived accounts can be restored later from the Archived status
 filter.
 </p>
 {isOwner && (
 <label
 style={{
 display: "flex",
 gap: 8,
 alignItems: "flex-start",
 marginTop: 12,
 fontSize: 14,
 color: "var(--text-secondary)",
 }}
 >
 <input
 type="checkbox"
 checked={hardDelete}
 onChange={(e) => setHardDelete(e.target.checked)}
 />
 <span>
 Permanently delete instead (owner only, blocked when active
 reservations or issued bills exist).
 </span>
 </label>
 )}
 </div>
 <div className="modal-footer">
 <button onClick={onClose} className="btn-cancel">
 Cancel
 </button>
 <button
 onClick={() => onDelete({ hardDelete })}
 className="btn-delete-confirm"
 >
 {hardDelete ? "Permanently Delete" : "Archive User"}
 </button>
 </div>
 </div>
 </div>,
 document.body,
 );
}
