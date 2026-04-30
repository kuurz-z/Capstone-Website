import React from "react";
import "./SkeletonPulse.css";

/**
 * SkeletonPulse — shimmer placeholder primitive.
 * Replaces content with a shimmering gray bar while loading.
 *
 * @param {string|number} width — CSS width (default "100%")
 * @param {string|number} height — CSS height (default "16px")
 * @param {string} borderRadius — CSS border-radius (default "8px")
 * @param {string} variant — "text" | "circle" | "rect" (shortcuts)
 * @param {object} style — extra inline styles
 * @param {string} className — extra class names
 */
export default function SkeletonPulse({
 width,
 height,
 borderRadius,
 variant,
 style = {},
 className = "",
}) {
 let w = width ?? "100%";
 let h = height ?? "16px";
 let r = borderRadius ?? "8px";

 if (variant === "circle") {
 const size = width ?? "40px";
 w = size;
 h = size;
 r = "50%";
 } else if (variant === "text") {
 h = height ?? "14px";
 r = "4px";
 }

 return (
 <div
 className={`skeleton-pulse ${className}`}
 style={{
 width: w,
 height: h,
 borderRadius: r,
 ...style,
 }}
 />
 );
}
