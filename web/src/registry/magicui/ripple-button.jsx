import { useState, useRef, useEffect } from "react";

export function RippleButton({
  children,
  rippleColor = "#ffffff",
  className = "",
  ...props
}) {
  const [ripples, setRipples] = useState([]);
  const buttonRef = useRef(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ripple {
        from {
          transform: scale(0);
          opacity: 0.6;
        }
        to {
          transform: scale(1);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  const handleClick = (e) => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height);
    const radius = size / 2;

    const newRipple = {
      id: Date.now() + Math.random(),
      x: x - radius,
      y: y - radius,
      size,
    };

    setRipples((prev) => [...prev, newRipple]);

    // Remove ripple after animation
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);

    // Call original onClick if provided
    if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      className={`relative ${className}`}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            style={{
              position: "absolute",
              left: `${ripple.x}px`,
              top: `${ripple.y}px`,
              width: `${ripple.size}px`,
              height: `${ripple.size}px`,
              backgroundColor: rippleColor,
              borderRadius: "50%",
              animation: "ripple 600ms ease-out forwards",
            }}
          />
        ))}
      </div>
      <span className="relative zIndex-10">{children}</span>
    </button>
  );
}
