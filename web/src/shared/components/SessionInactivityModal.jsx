import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { Clock } from "lucide-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock.js";

/**
 * SessionInactivityModal
 *
 * Accessible, minimalist, high-contrast modal dialog displayed when
 * user inactivity reaches the 15-minute threshold.
 * Strictly adheres to Lilycrest DMS design rules:
 * - Mounted via createPortal to document.body to prevent clipping or stacking bugs.
 * - Reference-counted body scroll locking via useBodyScrollLock.
 * - Solid neutral container with neutral 1px border.
 * - Strictly no gradients.
 * - Standalone clean icon with no background container or colored glow rings.
 * - Solid primary button ("Sign In Again") and subtle neutral outline button ("Go to Homepage").
 * - Fully trapped keyboard navigation (Tab/Shift-Tab loop; Escape prevented).
 */
export default function SessionInactivityModal({
  isOpen,
  onSignInAgain,
  onGoHome,
}) {
  const modalContainerRef = useRef(null);
  const signInAgainButtonRef = useRef(null);
  const goHomeButtonRef = useRef(null);

  // Lock body scroll when modal is visible
  useBodyScrollLock(isOpen);

  // Focus trap: auto-focus primary action button on dialog open
  useEffect(() => {
    if (isOpen && signInAgainButtonRef.current) {
      signInAgainButtonRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard navigation: Escape is inert; Tab/Shift-Tab loops within modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }

      if (e.key === "Tab") {
        const firstElement = goHomeButtonRef.current;
        const lastElement = signInAgainButtonRef.current;
        const isInsideModal = modalContainerRef.current?.contains(document.activeElement);

        if (!isInsideModal) {
          e.preventDefault();
          lastElement?.focus();
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-modal-title"
      aria-describedby="inactivity-modal-description"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalContainerRef}
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-6 text-slate-900 dark:text-slate-100"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5 text-amber-500">
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="inactivity-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Session Expired
            </h3>
            <p
              id="inactivity-modal-description"
              className="mt-2 text-sm text-slate-600 dark:text-slate-400"
            >
              Your session has ended due to inactivity.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            ref={goHomeButtonRef}
            type="button"
            onClick={onGoHome}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-600"
          >
            Go to Homepage
          </button>
          <button
            ref={signInAgainButtonRef}
            type="button"
            onClick={onSignInAgain}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
          >
            Sign In Again
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}

SessionInactivityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSignInAgain: PropTypes.func.isRequired,
  onGoHome: PropTypes.func.isRequired,
};
