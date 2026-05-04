import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";
import { PublicRoutes } from "./publicRoutes";
import { LegacyRoutes } from "./legacyRoutes";
import { AdminRoutes } from "./adminRoutes";
import { TenantRoutes } from "./tenantRoutes";
import { RouteShell } from "./RouteShell";
import { NotFoundPage } from "../lazyPages";

export function AppRoutes() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const routeGroup = location.pathname.startsWith("/admin")
    ? "admin"
    : location.pathname.startsWith("/applicant")
      ? "applicant"
      : "public";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeGroup}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
        transition={{
          duration: prefersReducedMotion ? 0.01 : 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <Routes location={location}>
          {PublicRoutes()}
          {LegacyRoutes()}
          {AdminRoutes()}
          {TenantRoutes()}
          <Route
            path="*"
            element={
              <RouteShell name="NotFound">
                <NotFoundPage />
              </RouteShell>
            }
          />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
