import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

/**
 * ScrollToTopButton — sticky floating button that appears after scrolling down.
 * Smoothly scrolls the page back to the top when clicked.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      style={{
        position: "fixed",
        bottom: "32px",
        right: "32px",
        zIndex: 999,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        border: "none",
        background: "var(--lp-accent, #FF8C42)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        transition: "opacity 0.2s, transform 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <ArrowUp size={20} />
    </button>
  );
}
