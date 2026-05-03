import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./AdminSidebar";
import NotificationBell from "../../../shared/components/NotificationBell";
import RouteTransitionBoundary from "../../../shared/components/RouteTransitionBoundary";
import useSocketClient from "../../../shared/hooks/useSocketClient";
import { useRouteFlash } from "../../../shared/hooks/useRouteFlash";
import { getPageMeta } from "./adminShellMeta.mjs";
import "../styles/admin-layout.css";
import "../styles/admin-common.css";

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export default function AdminLayout() {
  useSocketClient();
  const location = useLocation();
  useRouteFlash();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const pageMeta = getPageMeta(location.pathname, location.search);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  return (
    <div className={`admin-layout ${collapsed ? "admin-layout--collapsed" : ""}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className="admin-layout-main">
        {/* Top Bar */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="admin-menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="admin-topbar-copy">
              <h1 className="admin-topbar-title">{pageMeta.title}</h1>
              <p className="admin-topbar-subtitle">{pageMeta.description}</p>
            </div>
          </div>
          <div className="admin-topbar-right">
            <NotificationBell />
            <span className="admin-topbar-date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main
          ref={contentRef}
          className="admin-content"
        >
          <RouteTransitionBoundary
            routeKey={`${location.pathname}${location.search}`}
          >
            <Outlet />
          </RouteTransitionBoundary>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
