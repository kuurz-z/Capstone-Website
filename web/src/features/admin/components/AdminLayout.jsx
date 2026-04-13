import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import NotificationBell from "../../../shared/components/NotificationBell";
import useSocketClient from "../../../shared/hooks/useSocketClient";
import "../styles/admin-layout.css";
import "../styles/admin-common.css";

const PAGE_META = {
  "/admin/dashboard": {
    title: "Dashboard",
    description: "Monitor branch activity, incoming work, and unresolved exceptions at a glance.",
  },
  "/admin/reservations": {
    title: "Reservations",
    description: "Review applications, confirm documents, and move accepted residents toward assignment.",
  },
  "/admin/tenants": {
    title: "Tenants",
    description: "Handle renewals, transfers, move-out actions, and current-stay visibility in one workspace.",
  },
  "/admin/users": {
    title: "Accounts",
    description: "Manage access, verify account states, and resolve sign-in or lifecycle issues.",
  },
  "/admin/room-availability": {
    title: "Room Management",
    description: "Track available capacity, assignments, and demand trends by room and branch.",
  },
  "/admin/audit-logs": {
    title: "Activity Log",
    description: "Review system activity, administrative changes, and user-facing events.",
  },
  "/admin/billing": {
    title: "Billing",
    description: "Generate statements, review balances, and follow payment progress without leaving the admin workspace.",
  },
  "/admin/maintenance": {
    title: "Maintenance",
    description: "Review tenant repair requests, assign work, and keep the tenant-visible admin response up to date.",
  },
  "/admin/announcements": {
    title: "Announcements",
    description: "Publish notices with clearer targeting and follow-up visibility.",
  },
  "/admin/branches": {
    title: "Branches",
    description: "Manage branch-level details that affect room inventory and resident operations.",
  },
  "/admin/roles": {
    title: "Permissions",
    description: "Adjust role capabilities carefully so admin actions remain predictable and auditable.",
  },
  "/admin/settings": {
    title: "Settings",
    description: "Control platform-wide behavior, defaults, and operational safeguards.",
  },
};

function getPageMeta(location) {
  if (location.pathname === "/admin/room-availability") {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab") || "rooms";
    if (tab === "occupancy") {
      return {
        title: "Room Occupancy",
        description: "See who is assigned where and catch room-level conflicts early.",
      };
    }
    if (tab === "forecast") {
      return {
        title: "Vacancy Forecast",
        description: "Plan around expected openings, pending reservations, and room turnover.",
      };
    }
    return PAGE_META[location.pathname];
  }

  return (
    PAGE_META[location.pathname] || {
      title: "Admin",
      description: "Manage daily operations, resident workflows, and branch performance.",
    }
  );
}

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export default function AdminLayout() {
  useSocketClient();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const pageMeta = getPageMeta(location);

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
