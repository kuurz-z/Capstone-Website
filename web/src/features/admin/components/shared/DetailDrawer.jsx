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
 <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-[4px]" onClick={onClose} />

 {/* Drawer panel */}
 <div
 ref={drawerRef}
 className="fixed left-1/2 top-1/2 z-[1000] flex max-h-[88vh] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_64px_rgba(17,24,39,0.18)]"
 role="dialog"
 aria-modal="true"
 aria-label={title || "Details"}
 style={{ width: `${width}px` }}
 >
 {/* Header */}
 <div className="flex items-center justify-between border-b border-border px-6 py-4">
 <div>
 <h2 className="text-lg font-semibold text-foreground">{title}</h2>
 {subtitle ? (
 <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
 ) : null}
 </div>
 <button
 className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground"
 onClick={onClose}
 aria-label="Close"
 >
 <X size={18} />
 </button>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto px-6 py-6">
 {children}
 </div>

 {/* Footer (optional) */}
 {footer && (
 <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
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
 <div className="mb-6 last:mb-0">
 {label && (
 <h3 className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
 {label}
 </h3>
 )}
 {children}
 </div>
 );
};

/**
 * DetailDrawer.Row — A key/value row for displaying fields.
 */
DetailDrawer.Row = function Row({ label, value, children }) {
 return (
 <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-b-0">
 <span className="min-w-[100px] text-sm font-medium text-muted-foreground">{label}</span>
 <span className="text-right text-sm font-medium text-card-foreground">
 {children || value || "—"}
 </span>
 </div>
 );
};
