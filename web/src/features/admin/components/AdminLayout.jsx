import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./AdminSidebar";
import NotificationBell from "../../../shared/components/NotificationBell";
import useSocketClient from "../../../shared/hooks/useSocketClient";
import "../styles/admin-layout.css";
import "../styles/admin-common.css";

const PAGE_META = {
  "/admin/dashboard": {
    title: "Dashboard",
    description: "Monitor branch activity, queue pressure, and urgent follow-up from one operations view.",
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
    description: "Track available capacity, assignments, and turnover across rooms without leaving operations.",
  },
  "/admin/audit-logs": {
    title: "Activity Log",
    description: "Review system activity, administrative changes, and user-facing events.",
  },
  "/admin/billing": {
    title: "Billing",
    description: "Generate statements, review balances, and follow payment progress without leaving the admin workspace.",
  },
  "/admin/analytics": {
    title: "Analytics",
    description: "Review branch KPIs, occupancy trends, billing performance, and operating signals in one workspace.",
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
    description: "Control platform defaults, safeguards, and shared operational behavior.",
  },
};

function getPageMeta(location) {
  if (location.pathname === "/admin/analytics") {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab") || "overview";
    const analyticsMeta = {
      overview: {
        title: "Analytics",
        description: "Review branch KPIs, occupancy trends, billing performance, and operating signals in one workspace.",
      },
      occupancy: {
        title: "Analytics · Occupancy",
        description: "Track room utilization, capacity shifts, and current availability from the analytics workspace.",
      },
      billing: {
        title: "Analytics · Billing",
        description: "Monitor collections, overdue balances, and branch billing performance without leaving analytics.",
      },
      operations: {
        title: "Analytics · Operations",
        description: "Inspect reservation flow, inquiry timing, and maintenance workload in one operations view.",
      },
      financials: {
        title: "Analytics · Financials",
        description: "Review owner financial performance, overdue exposure, and collection trends across branches.",
      },
      monitoring: {
        title: "Analytics · System Monitoring",
        description: "Inspect owner-level audit activity, security signals, and operational anomalies from analytics.",
      },
    };

    return analyticsMeta[tab] || analyticsMeta.overview;
  }

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
