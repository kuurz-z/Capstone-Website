import { useRef } from "react";

/**
 * SpotlightCard — card container with a mouse-following radial gradient spotlight effect.
 * Used by RoomDetailsModal.jsx for image display containers.
 */
function SpotlightCard({
 children,
 spotlightColor = "rgba(255, 255, 255, 0.1)",
 className = "",
 style = {},
 ...props
}) {
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
 style={{
 position: "relative",
 overflow: "hidden",
 borderRadius: "16px",
 border: "1px solid rgba(0,0,0,0.08)",
 ...style,
 }}
 {...props}
 >
 {children}
 <div
 style={{
 position: "absolute",
 inset: 0,
 background: `radial-gradient(circle 180px at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlightColor}, transparent 70%)`,
 pointerEvents: "none",
 }}
 />
 </div>
 );
}

export default SpotlightCard;
