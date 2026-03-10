import { motion, useInView } from "framer-motion";
import { useRef } from "react";

/**
 * ScrollReveal — wraps any section and animates it into view on scroll.
 *
 * Variants:
 *   "fade-up"   — fades in + slides up (default)
 *   "fade-left" — fades in + slides from left
 *   "fade-right"— fades in + slides from right
 *   "zoom"      — fades in + scales up slightly
 *   "fade"      — simple fade-in, no movement
 *
 * Props:
 *   delay   — extra delay in seconds (default 0)
 *   width   — "fit" | "full" (default "full")
 *   once    — animate only once (default true)
 */

const variants = {
  "fade-up": {
    hidden: { opacity: 0, y: 60 },
    visible: { opacity: 1, y: 0 },
  },
  "fade-left": {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0 },
  },
  "fade-right": {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0 },
  },
  zoom: {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
};

export default function ScrollReveal({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 0.7,
  once = true,
  className = "",
  style = {},
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-80px 0px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variants[variant] || variants["fade-up"]}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for buttery smooth
      }}
      className={className}
      style={{ ...style, willChange: "opacity, transform" }}
    >
      {children}
    </motion.div>
  );
}
