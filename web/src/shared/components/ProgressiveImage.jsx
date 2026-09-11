import { useState, useRef, useEffect } from "react";
import { getOptimizedUrl, getImageFallbackUrl } from "../utils/imageOptimizer.js";

/**
 * ProgressiveImage
 *
 * A drop-in replacement for <img> that:
 *  - Shows a shimmer skeleton while the image is loading
 *  - Applies a fade-in on reveal (no layout shift)
 *  - Gracefully falls back to a neutral placeholder on error
 *  - Accepts `priority` prop to switch between eager/lazy loading
 *  - Passes through all standard img attributes
 *
 * @example
 * // Above-the-fold (e.g. hero card) — load immediately
 * <ProgressiveImage src={room.images[0]} alt={room.title} priority />
 *
 * // Below-the-fold — lazy load (default)
 * <ProgressiveImage src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
 */
export function ProgressiveImage({
  src,
  alt = "",
  className = "",
  style = {},
  priority = false,
  optimizerOpts = {},
  fallbackLabel,
  ...rest
}) {
  const [status, setStatus] = useState("loading"); // "loading" | "loaded" | "error"
  const imgRef = useRef(null);
  const hasRetriedRef = useRef(false);

  const optimizedSrc = getOptimizedUrl(src, optimizerOpts);
  const [currentSrc, setCurrentSrc] = useState(optimizedSrc);

  useEffect(() => {
    setCurrentSrc(optimizedSrc);
    setStatus("loading");
    hasRetriedRef.current = false;
  }, [optimizedSrc]);

  const handleError = () => {
    if (
      !hasRetriedRef.current &&
      currentSrc &&
      currentSrc.includes("/api/rooms/photos/optimize")
    ) {
      hasRetriedRef.current = true;
      const fallback = getImageFallbackUrl(currentSrc);
      if (fallback && fallback !== currentSrc) {
        setCurrentSrc(fallback);
        return;
      }
    }
    setStatus("error");
  };

  // ── Solid neutral placeholder (strictly no gradients, no CPU animation overhead) ────
  const placeholderStyle = {
    position: "absolute",
    inset: 0,
    backgroundColor: "var(--card-muted, #f1f5f9)",
    borderRadius: "inherit",
    transition: "opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    opacity: status === "loaded" ? 0 : 1,
    pointerEvents: "none",
    zIndex: 1,
    willChange: "opacity",
  };

  // ── Error fallback ─────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--card-muted, #f1f5f9)",
          color: "var(--text-muted, #94a3b8)",
          fontSize: "12px",
          fontWeight: 500,
          ...style,
        }}
        aria-label={alt}
        role="img"
      >
        {fallbackLabel || alt || "Photo preview unavailable"}
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative", overflow: "hidden", ...style }}
      className={className}
    >
      {/* Solid neutral placeholder — visible until image loads */}
      <div style={placeholderStyle} aria-hidden="true" />

      {/* Actual image */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "low"}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={handleError}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "inherit",
          objectPosition: "inherit",
          opacity: status === "loaded" ? 1 : 0,
          transition: "opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "opacity",
          display: "block",
        }}
        {...rest}
      />
    </div>
  );
}

export default ProgressiveImage;
