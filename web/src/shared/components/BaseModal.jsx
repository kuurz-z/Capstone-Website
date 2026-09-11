import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertCircle, AlertTriangle, CheckCircle, Info, Loader2 } from "lucide-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

/**
 * Standard BaseModal component for Lilycrest DMS.
 *
 * Enforces:
 * 1. React Portal mounting to document.body (prevents z-index / overflow clipping)
 * 2. Body scroll locking (useBodyScrollLock)
 * 3. Escape key listener for graceful closing
 * 4. Consistent backdrop blur overlay aesthetics
 * 5. Semantic situation color icons & themes:
 *    - primary / success: Emerald Green (#059669) for primary form submissions & approvals
 *    - danger: Danger Red (#DC2626) for destructive permanent deletions
 *    - warning: Amber Gold (#D97706) for status warnings & archives
 *    - info: Deep Navy (#0A1628) for detail inspection dialogs
 * 6. Action button order: Cancel / Secondary (LEFT), Confirm / Primary (RIGHT)
 */
export default function BaseModal({
  isOpen,
  onClose,
  onCancel,
  closeOnBackdrop = true,
  closeOnEscape = true,
  title,
  subtitle,
  variant = "primary", // "primary" | "danger" | "warning" | "success" | "info"
  size = "md", // "sm" (440px) | "md" (560px) | "lg" (760px) | "xl" (960px)
  showCloseButton,
  children,
  footer,
  confirmText,
  loadingText,
  cancelText = "Cancel",
  onConfirm,
  loading = false,
  confirmDisabled = false,
  className = "",
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (closeOnEscape && e.key === "Escape" && !loading) {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, loading, onClose, closeOnEscape]);

  // Lock background scroll when modal is open
  useBodyScrollLock(isOpen);

  if (!isOpen || typeof document === "undefined") return null;

  // Size mapping
  const sizeMaxWidths = {
    sm: 440,
    md: 560,
    lg: 760,
    xl: 960,
    "2xl": 1040,
    full: 1120,
  };
  const maxWidth = sizeMaxWidths[size] || 560;

  // Variant-based styling tokens
  const variantTokens = {
    primary: {
      icon: <CheckCircle size={20} color="#059669" />,
      btnBg: "var(--color-success, #059669)",
      btnHoverBg: "#047857",
      btnText: "#ffffff",
    },
    danger: {
      icon: <AlertCircle size={20} color="#DC2626" />,
      btnBg: "var(--color-danger, #DC2626)",
      btnHoverBg: "#b91c1c",
      btnText: "#ffffff",
    },
    warning: {
      icon: <AlertTriangle size={20} color="#D97706" />,
      btnBg: "var(--color-warning, #D97706)",
      btnHoverBg: "#b45309",
      btnText: "#ffffff",
    },
    success: {
      icon: <CheckCircle size={20} color="#059669" />,
      btnBg: "var(--color-success, #059669)",
      btnHoverBg: "#047857",
      btnText: "#ffffff",
    },
    info: {
      icon: <Info size={20} color="#059669" />,
      btnBg: "var(--color-success, #059669)",
      btnHoverBg: "#047857",
      btnText: "#ffffff",
    },
  };

  const v = variantTokens[variant] || variantTokens.primary;

  // Intelligent close button derivation:
  // If showCloseButton is explicitly provided (true/false), use it.
  // Otherwise, hide 'X' when a footer Cancel button is already present to prevent redundancy.
  const hasFooterCancel = Boolean(cancelText && (onConfirm || footer !== undefined));
  const shouldShowCloseButton =
    typeof showCloseButton === "boolean" ? showCloseButton : !hasFooterCancel;

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        padding: "16px",
        animation: "baseModalFadeIn 0.15s ease-out",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-busy={loading ? "true" : undefined}
      aria-labelledby={title ? "base-modal-title" : undefined}
    >
      <style>{`
        @keyframes baseModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes baseModalSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className={`base-modal-container ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-card, #ffffff)",
          borderRadius: 14,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
          border: "1px solid var(--border-card, #e2e8f0)",
          width: "100%",
          maxWidth,
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          animation: "baseModalSlideIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        {(title || shouldShowCloseButton) && (
          <div
            style={{
              padding: "20px 24px 16px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              borderBottom: "1px solid var(--border-subtle, #f1f5f9)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {variant && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {v.icon}
                </div>
              )}
              <div>
                {title && (
                  <h3
                    id="base-modal-title"
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 600,
                      color: "var(--text-heading, #0f172a)",
                      lineHeight: 1.35,
                    }}
                  >
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "var(--text-muted, #64748b)",
                      lineHeight: 1.45,
                    }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {shouldShowCloseButton && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                aria-label="Close modal"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 6,
                  borderRadius: 6,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  color: "var(--text-muted, #64748b)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "var(--surface-muted, #f1f5f9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            color: "var(--text-primary, #334155)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer !== undefined ? (
          footer
        ) : (onConfirm || cancelText) ? (
          <div
            style={{
              padding: "14px 24px",
              background: "var(--surface-muted, #f8fafc)",
              borderTop: "1px solid var(--border-subtle, #f1f5f9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {cancelText && (
              <button
                type="button"
                onClick={onCancel || onClose}
                disabled={loading}
                style={{
                  padding: "9px 18px",
                  border: "1px solid var(--border-card, #e2e8f0)",
                  borderRadius: 9999,
                  background: "var(--surface-card, #ffffff)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary, #475569)",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--surface-card, #ffffff)";
                }}
              >
                {cancelText}
              </button>
            )}

            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading || confirmDisabled}
                style={{
                  padding: "9px 20px",
                  border: "none",
                  borderRadius: 9999,
                  background: confirmDisabled ? "#cbd5e1" : v.btnBg,
                  fontSize: 13,
                  fontWeight: 600,
                  color: v.btnText,
                  cursor: loading || confirmDisabled ? "not-allowed" : "pointer",
                  opacity: loading ? 0.85 : 1,
                  transition: "all 0.15s",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  minWidth: 90,
                }}
                onMouseEnter={(e) => {
                  if (!loading && !confirmDisabled) e.currentTarget.style.background = v.btnHoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!confirmDisabled) e.currentTarget.style.background = v.btnBg;
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{loadingText || "Processing..."}</span>
                  </>
                ) : (
                  confirmText || "Confirm"
                )}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
