import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";
import "./DetailDrawer.css";

/**
 * DetailDrawer — Slide-in side panel from the right.
 *
 * Props:
 *   open:     boolean
 *   onClose:  () => void
 *   title:    string
 *   width:    number (default 420)
 *   children: content
 *   footer:   ReactNode (optional sticky footer with action buttons)
 */
export default function DetailDrawer({ open, onClose, title, width = 420, children, footer }) {
  const drawerRef = useRef(null);

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

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="detail-drawer__backdrop" onClick={onClose} />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="detail-drawer"
        style={{ width: `${width}px` }}
      >
        {/* Header */}
        <div className="detail-drawer__header">
          <h2 className="detail-drawer__title">{title}</h2>
          <button className="detail-drawer__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="detail-drawer__body">
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className="detail-drawer__footer">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * DetailDrawer.Section — A labeled group within the drawer body.
 */
DetailDrawer.Section = function Section({ label, children }) {
  return (
    <div className="detail-drawer__section">
      {label && <h3 className="detail-drawer__section-label">{label}</h3>}
      {children}
    </div>
  );
};

/**
 * DetailDrawer.Row — A key/value row for displaying fields.
 */
DetailDrawer.Row = function Row({ label, value, children }) {
  return (
    <div className="detail-drawer__row">
      <span className="detail-drawer__row-label">{label}</span>
      <span className="detail-drawer__row-value">{children || value || "—"}</span>
    </div>
  );
};
