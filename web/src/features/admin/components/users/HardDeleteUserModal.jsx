import { useState } from "react";
import { createPortal } from "react-dom";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function HardDeleteUserModal({
 user,
 isOwner = false,
 onDelete,
 onClose,
}) {
 const [forceDelete, setForceDelete] = useState(false);
 const [confirmationText, setConfirmationText] = useState("");

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
 This action cannot be undone. Accounts with significant history are blocked by default unless the owner explicitly force deletes them.
 </p>
 {isOwner && (
 <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
 <label
 style={{
 display: "flex",
 gap: 8,
 alignItems: "flex-start",
 fontSize: 14,
 color: "var(--text-secondary)",
 }}
 >
 <input
 type="checkbox"
 checked={forceDelete}
 onChange={(event) => {
 setForceDelete(event.target.checked);
 if (!event.target.checked) setConfirmationText("");
 }}
 />
 <span>
 Force delete even if the account has significant history. Historical tables will show <strong>Deleted account</strong>.
 </span>
 </label>

 {forceDelete && (
 <label style={{ display: "grid", gap: 6 }}>
 <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
 Type <strong>DELETE</strong> to confirm force delete
 </span>
 <input
 type="text"
 value={confirmationText}
 onChange={(event) => setConfirmationText(event.target.value)}
 placeholder="DELETE"
 className="form-input"
 />
 </label>
 )}
 </div>
 )}
 </div>
 <div className="modal-footer">
 <button onClick={onClose} className="btn-cancel">
 Cancel
 </button>
 <button
 onClick={() =>
 onDelete({ hardDelete: true, forceDelete, confirmationText })
 }
 className="btn-delete-confirm"
 disabled={forceDelete && confirmationText !== "DELETE"}
 >
 {forceDelete ? "Force Delete" : "Permanently Delete"}
 </button>
 </div>
 </div>
 </div>,
 document.body,
 );
}
