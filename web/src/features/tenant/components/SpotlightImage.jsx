import { useRef } from "react";

/**
 * SpotlightImage — wraps children with a mouse-following radial gradient spotlight effect.
 * Used by FacilitiesSection.jsx facility cards.
 */
function SpotlightImage({ children, spotlightColor = "rgba(255, 255, 255, 0.15)", className = "" }) {
 const containerRef = useRef(null);

 const handleMouseMove = (e) => {
 const el = containerRef.current;
 if (!el) return;
 const rect = el.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 el.style.setProperty("--spot-x", `${x}px`);
 el.style.setProperty("--spot-y", `${y}px`);
 };

 return (
 <div
 ref={containerRef}
 className={className}
 onMouseMove={handleMouseMove}
 style={{ position: "relative", overflow: "hidden" }}
 >
 {children}
 <div
 style={{
 position: "absolute",
 inset: 0,
 background: `radial-gradient(circle 120px at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlightColor}, transparent 70%)`,
 pointerEvents: "none",
 transition: "opacity 0.2s",
 }}
 />
 </div>
 );
}

export default SpotlightImage;
