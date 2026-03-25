import { useState } from "react";

/**
 * ImageWithFallback — renders an img with a graceful placeholder on error.
 * Used by FacilitiesSection.jsx for facility card images.
 */
export function ImageWithFallback({ src, alt, className = "", style = {}, ...props }) {
  const [errored, setErrored] = useState(false);

  if (errored || !src) {
    return (
      <div
        className={className}
        style={{
          backgroundColor: "var(--lp-icon-bg, #f1f5f9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
        aria-label={alt}
      >
        <span style={{ color: "var(--lp-text-muted, #94a3b8)", fontSize: "12px" }}>
          {alt || "Image unavailable"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setErrored(true)}
      {...props}
    />
  );
}

export default ImageWithFallback;
