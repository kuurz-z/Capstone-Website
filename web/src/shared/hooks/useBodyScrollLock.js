import { useEffect } from "react";

/**
 * Lock body scroll when `isLocked` is true.
 * Targets both the body and the .admin-content container.
 * Compensates for the scrollbar width so content doesn't shift.
 */
export default function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return;

    // Lock body scroll
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarW}px`;

    // Also lock the admin content container (the actual scrolling element)
    const adminContent = document.querySelector(".admin-content");
    if (adminContent) {
      adminContent.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      if (adminContent) {
        adminContent.style.overflow = "";
      }
    };
  }, [isLocked]);
}
