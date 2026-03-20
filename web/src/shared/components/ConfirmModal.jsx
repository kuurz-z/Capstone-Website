import { useEffect } from "react";
import useBodyScrollLock from "../../shared/hooks/useBodyScrollLock";

/**
 * Minimal, professional confirmation modal.
 *
 * Props:
 *   isOpen       – boolean
 *   onClose      – () => void   (cancel / backdrop click)
 *   onConfirm    – () => void   (primary action)
 *   title        – string       (e.g. "Delete Reservation")
 *   message      – string       (body text)
 *   confirmText  – string       (default "Confirm")
 *   cancelText   – string       (default "Cancel")
 *   variant      – "danger" | "warning" | "info" | "success"
 *   loading      – boolean      (shows spinner on confirm button)
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  loading = false,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open — compensate for scrollbar width
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  // Variant-based color mapping — muted, professional tones
  const palette = {
    danger: {
      icon: "#DC2626",
      iconBg: "rgba(220, 38, 38, 0.08)",
      btn: "#DC2626",
      btnHover: "#B91C1C",
    },
    warning: {
      icon: "#D97706",
      iconBg: "rgba(217, 119, 6, 0.08)",
      btn: "#D97706",
      btnHover: "#B45309",
    },
    info: {
      icon: "#0A1628",
      iconBg: "rgba(10, 22, 40, 0.06)",
      btn: "#0A1628",
      btnHover: "#092d4f",
    },
    success: {
      icon: "#059669",
      iconBg: "rgba(5, 150, 105, 0.08)",
      btn: "#059669",
      btnHover: "#047857",
    },
  };
  const c = palette[variant] || palette.info;

  const icons = {
    danger: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.icon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.icon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    info: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.icon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.icon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.3)",
        animation: "cmFadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes cmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-card, #fff)",
          borderRadius: 12,
          boxShadow:
            "0 4px 24px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06)",
          width: "100%",
          maxWidth: 400,
          margin: "0 16px",
          animation: "cmSlideIn 0.2s ease",
          overflow: "hidden",
        }}
      >
        {/* Content */}
        <div style={{ padding: "24px 24px 16px" }}>
          {/* Icon + Title row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: message ? 10 : 0,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: c.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {icons[variant] || icons.info}
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-heading, #0f172a)",
                lineHeight: 1.4,
              }}
            >
              {title}
            </h3>
          </div>

          {/* Message */}
          {message && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text-muted, #64748b)",
                lineHeight: 1.5,
                paddingLeft: 46,
              }}
            >
              {message}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border-subtle, #f1f5f9)", margin: "0 24px" }} />

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "14px 24px",
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "8px 18px",
              border: "1px solid var(--border-card, #e2e8f0)",
              borderRadius: 6,
              background: "var(--surface-card, #fff)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary, #475569)",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "var(--surface-muted, #f8fafc)")}
            onMouseLeave={(e) => (e.target.style.background = "var(--surface-card, #fff)")}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "8px 18px",
              border: "none",
              borderRadius: 6,
              background: c.btn,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "background 0.15s",
              minWidth: 80,
            }}
            onMouseEnter={(e) =>
              !loading && (e.target.style.background = c.btnHover)
            }
            onMouseLeave={(e) =>
              !loading && (e.target.style.background = c.btn)
            }
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
