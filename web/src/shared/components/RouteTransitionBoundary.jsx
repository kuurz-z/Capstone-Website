import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function RouteTransitionBoundary({
 children,
 routeKey,
 className = "",
}) {
 const location = useLocation();
 const prefersReducedMotion = useReducedMotion();
 const contentKey = routeKey || `${location.pathname}${location.search}`;

 return (
 <AnimatePresence mode="wait" initial={false}>
 <motion.div
 key={contentKey}
 className={className}
 initial={
 prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }
 }
 animate={{ opacity: 1, y: 0 }}
 exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
 transition={{
 duration: prefersReducedMotion ? 0.01 : 0.22,
 ease: [0.22, 1, 0.36, 1],
 }}
 >
 {children}
 </motion.div>
 </AnimatePresence>
 );
}
