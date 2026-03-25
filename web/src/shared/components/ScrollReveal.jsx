import { useEffect, useRef } from "react";

/**
 * ScrollReveal — animates children into view using IntersectionObserver.
 * Supports variants: fade-up, fade-left, fade-right, fade, zoom
 */
export default function ScrollReveal({ children, variant = "fade-up", delay = 0, threshold = 0.1 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const getTransform = () => {
      switch (variant) {
        case "fade-up": return "translateY(32px)";
        case "fade-left": return "translateX(-32px)";
        case "fade-right": return "translateX(32px)";
        case "zoom": return "scale(0.95)";
        default: return "none";
      }
    };

    Object.assign(el.style, {
      opacity: "0",
      transform: getTransform(),
      transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
    });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          Object.assign(el.style, { opacity: "1", transform: "none" });
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [variant, delay, threshold]);

  return <div ref={ref}>{children}</div>;
}
