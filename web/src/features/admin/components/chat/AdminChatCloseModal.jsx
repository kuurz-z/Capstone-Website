import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Lock, X, LoaderCircle } from "lucide-react";

export default function AdminChatCloseModal({
  isOpen,
  onClose,
  onConfirm,
  tenantName,
  closing = false,
}) {
  const [closeNote, setCloseNote] = useState("");
  const [closeNoteError, setCloseNoteError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCloseNote("");
      setCloseNoteError("");
    }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleConfirm = () => {
    const note = closeNote.trim();
    if (!note) {
      setCloseNoteError("A closing note is required.");
      return;
    }
    if (note.length < 5) {
      setCloseNoteError("Closing note must be at least 5 characters long.");
      return;
    }
    onConfirm(note, setCloseNoteError);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg space-y-4 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 items-center justify-center text-rose-600 dark:text-rose-400">
              <Lock size={18} />
            </div>
            <h3 className="text-sm font-bold text-foreground">Close Conversation</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closing}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Administratively closing this conversation with{" "}
          <strong className="text-foreground">{tenantName}</strong>{" "}
          will archive the active thread and lock future replies. This closes the thread without marking the concern resolved. Please enter a closing note for auditing.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground block">
            Closing Note <span className="text-destructive">*</span>
          </label>
          <textarea
            value={closeNote}
            onChange={(e) => {
              setCloseNote(e.target.value);
              if (closeNoteError) setCloseNoteError("");
            }}
            placeholder="Explain why this conversation is being closed..."
            rows={4}
            maxLength={500}
            className="w-full rounded-lg border border-border bg-input-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border resize-none"
          />
          <div className="flex items-center justify-between text-[11px]">
            {closeNoteError ? (
              <span className="text-destructive font-medium">{closeNoteError}</span>
            ) : (
              <span className="text-muted-foreground">Min. 5 characters</span>
            )}
            <span className="text-muted-foreground">{closeNote.trim().length} / 500</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={closing}
            className="rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={closing || !closeNote.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {closing ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Lock size={14} />
            )}
            <span>{closing ? "Closing..." : "Confirm Close"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
