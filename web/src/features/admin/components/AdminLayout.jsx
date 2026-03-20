import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import NotificationBell from "../../../shared/components/NotificationBell";
import "../styles/admin-layout.css";
import "../styles/admin-common.css";

const PAGE_TITLES = {
  "/admin/dashboard": "Dashboard",
  "/admin/reservations": "Reservations",
  "/admin/tenants": "Tenants",
  "/admin/users": "Accounts",
  "/admin/room-availability": "Rooms",
  "/admin/audit-logs": "Activity Log",
  "/admin/billing": "Billing",
  "/admin/branches": "Branches",
  "/admin/roles": "Permissions",
  "/admin/settings": "Settings",
};

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export default function AdminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const pageTitle = PAGE_TITLES[location.pathname] || "Admin";

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

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
            <h1 className="admin-topbar-title">{pageTitle}</h1>
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
        <main className="admin-content">
          <Outlet />
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
