import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating scroll-to-top button — appears when user scrolls down 400px.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: "32px",
        right: "32px",
        zIndex: 40,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        border: "none",
        backgroundColor: "#E7710F",
        color: "white",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(231, 113, 15, 0.3)",
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(12px) scale(0.8)",
        pointerEvents: visible ? "auto" : "none",
        transition:
          "opacity 0.3s ease, transform 0.3s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 6px 24px rgba(231, 113, 15, 0.45)";
        e.currentTarget.style.transform = "translateY(-2px) scale(1.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(231, 113, 15, 0.3)";
        e.currentTarget.style.transform = visible
          ? "translateY(0) scale(1)"
          : "translateY(12px) scale(0.8)";
      }}
    >
      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
    </button>
  );
}
