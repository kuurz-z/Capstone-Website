import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";

/**
 * DetailDrawer — Overlay detail panel rendered as a modal dialog.
 *
 * Props:
 * open: boolean
 * onClose: () => void
 * title: string
 * width: number (default 760)
 * children: content
 * footer: ReactNode (optional sticky footer with action buttons)
 */
export default function DetailDrawer({ open, onClose, title, subtitle, width = 760, children, footer }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const bodyEl = drawerRef.current.querySelector(".detail-drawer__body");
    if (bodyEl) bodyEl.scrollTop = 0;
  }, [open, children]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open — compensate for scrollbar width
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="fixed left-1/2 top-1/2 z-[1000] flex flex-col w-full max-w-[92vw] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : "Details"}
        style={{ maxWidth: width ? `${width}px` : '760px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-6 py-5 bg-[var(--bg-card)]">
          <div className="space-y-1">
            {typeof title === 'string' ? (
              <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight tracking-tight">{title}</h2>
            ) : (
              title
            )}
            {subtitle && (
              <p className="text-xs font-medium text-[var(--text-muted)]">{subtitle}</p>
            )}
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all duration-200"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-7 scrollbar-thin scrollbar-thumb-[var(--border-strong)] scrollbar-track-transparent">
          <div className="space-y-0 text-[var(--text-primary)]">
            {children}
          </div>
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-[var(--border-light)] bg-[var(--bg-card)] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * DetailDrawer.Section — A labeled group within the drawer body.
 */
DetailDrawer.Section = function Section({ label, children }) {
  return (
    <div className="mb-8 last:mb-0">
      {label && (
        <h3 className="mb-4 flex items-center gap-2 border-b border-[var(--border-light)] pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </h3>
      )}
      <div className="space-y-0">
        {children}
      </div>
    </div>
  );
};

/**
 * DetailDrawer.Row — A key/value row for displaying fields.
 */
DetailDrawer.Row = function Row({ label, value, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border-light)] py-3 last:border-b-0 group">
      <span className="min-w-[120px] text-sm font-medium text-[var(--text-muted)]">{label}</span>
      <span className="text-right text-sm font-semibold text-[var(--text-primary)]">
        {children || value || "—"}
      </span>
    </div>
  );
};
