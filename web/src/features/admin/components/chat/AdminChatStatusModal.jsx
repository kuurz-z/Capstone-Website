import { allowedSupportStatuses } from '../../../../shared/utils/supportConcern.js';
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Tag, X, Check, LoaderCircle } from "lucide-react";
import { STATUS_OPTIONS, STATUS_DESCRIPTIONS } from "./chatConstants";

export default function AdminChatStatusModal({
  isOpen,
  onClose,
  onConfirm,
  currentStatus = "open",
  concern,
  tenantName,
  updating = false,
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pendingStatus, setPendingStatus] = useState(currentStatus || "open");

  useEffect(() => {
    if (isOpen) {
      setNote("");
      setError("");
      setPendingStatus(currentStatus || "open");
    }
  }, [isOpen, currentStatus]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleConfirm = () => {
    onConfirm(pendingStatus, note, setError);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg space-y-4 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-primary shrink-0" />
            <h3 className="text-sm font-bold text-foreground">Update Ticket Status</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={updating}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Select the new status for conversation with{" "}
          <strong className="text-foreground">{tenantName}</strong>:
        </p>

        <div className="space-y-2">
          {STATUS_OPTIONS.filter((opt) => allowedSupportStatuses(concern).includes(opt.value)).map((opt) => {
            const isSelected = pendingStatus === opt.value;
            const isCurrent = currentStatus === opt.value;

            return (
              <button
                type="button"
                key={opt.value}
                disabled={updating}
                onClick={() => setPendingStatus(opt.value)}
                className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isSelected
                    ? "bg-muted/90 border-primary/60 shadow-2xs"
                    : "bg-card border-border hover:bg-muted/40"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white dark:bg-slate-900" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-foreground">
                      {opt.label}
                    </span>
                    {isCurrent && (
                      <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground uppercase">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {STATUS_DESCRIPTIONS[opt.value]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {pendingStatus === "resolved" && <label className="block text-sm">Resolution note (required)<textarea aria-label="Resolution note" value={note} maxLength={1000} disabled={updating} onChange={(event) => setNote(event.target.value)} className="w-full border rounded p-2 bg-card" /></label>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={updating}
            className="rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={updating || pendingStatus === currentStatus || (pendingStatus === "resolved" && !note.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {updating ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            <span>
              {pendingStatus === "closed"
                ? "Proceed to Close Note"
                : "Confirm Status Change"}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
