import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import useSocketClient from "../hooks/useSocketClient";
import Sidebar from "../components/Sidebar";
import RouteTransitionBoundary from "../components/RouteTransitionBoundary";
import AccountBlockedBanner from "../components/AccountBlockedBanner";
import { useRouteFlash } from "../hooks/useRouteFlash";
import "./TenantLayout.css";

/**
 * TenantLayout - Layout wrapper for tenant portal pages
 * Provides the restored resident sidebar shell and route content area
 */
const TenantLayout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  useSocketClient();
  useRouteFlash();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const content = children ?? <Outlet />;
  const contentRef = useRef(null);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  return (
    <div className="tenant-layout">
      <Sidebar
        isOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
        isCollapsed={sidebarCollapsed}
        toggleCollapse={toggleCollapse}
      />

      <div
        className={`tenant-layout-main ${
          sidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <main ref={contentRef} className="tenant-content">
          {(user?.accountStatus === "suspended" ||
            user?.accountStatus === "banned") && (
            <AccountBlockedBanner accountStatus={user.accountStatus} />
          )}
          <RouteTransitionBoundary
            routeKey={`${location.pathname}${location.search}`}
            className="tenant-route-transition"
          >
            {content}
          </RouteTransitionBoundary>
        </main>
      </div>
    </div>
  );
};

export default TenantLayout;
