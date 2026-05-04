import { useRef } from "react";

/**
 * RippleButton — button with a Material-style ripple effect on click.
 * Used by Navbar.js for the "Book Now" button.
 */
export function RippleButton({
  children,
  rippleColor = "rgba(255, 255, 255, 0.5)",
  className = "",
  style = {},
  onClick,
  ...props
}) {
  const buttonRef = useRef(null);

  const handleClick = (e) => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;

    const ripple = document.createElement("span");
    Object.assign(ripple.style, {
      position: "absolute",
      width: `${size}px`,
      height: `${size}px`,
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      borderRadius: "50%",
      backgroundColor: rippleColor,
      transform: "scale(0)",
      animation: "ripple-expand 0.5s linear",
      pointerEvents: "none",
    });

    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    if (onClick) onClick(e);
  };

  return (
    <>
      <style>{`
        @keyframes ripple-expand {
          to { transform: scale(2); opacity: 0; }
        }
      `}</style>
      <button
        ref={buttonRef}
        className={className}
        style={{ position: "relative", overflow: "hidden", cursor: "pointer", border: "none", ...style }}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    </>
  );
}

export default RippleButton;
