import { useEffect } from "react";

/**
 * Close a modal/panel when the user presses the Escape key.
 *
 * @param {boolean}    isOpen   – Whether the modal is currently visible
 * @param {() => void} onClose – Callback to close / dismiss
 */
export default function useEscapeClose(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);
}
