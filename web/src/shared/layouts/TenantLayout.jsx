import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import useSocketClient from "../hooks/useSocketClient";
import Sidebar from "../components/Sidebar";
import NotificationBell from "../components/NotificationBell";
import AccountBlockedBanner from "../components/AccountBlockedBanner";
import "./TenantLayout.css";

/**
 * TenantLayout - Layout wrapper for tenant pages
 * Provides sidebar navigation, top bar, and main content area
 * Responsive design with mobile menu toggle
 */
const TenantLayout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  useSocketClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pageMeta = useMemo(() => {
    const meta = {
      "/applicant/profile": {
        eyebrow: "Overview",
        title: "Your resident dashboard",
        description: "Track your status, profile progress, and next required steps.",
      },
      "/applicant/billing": {
        eyebrow: "Billing",
        title: "Bills and payments",
        description: "See current charges, past statements, and payment status in one place.",
      },
      "/applicant/contracts": {
        eyebrow: "Contracts",
        title: "Lease records",
        description: "Review active terms, upcoming stays, and completed agreements.",
      },
      "/applicant/maintenance": {
        eyebrow: "Maintenance",
        title: "Request support",
        description: "Submit room issues and monitor updates without leaving the portal.",
      },
      "/applicant/announcements": {
        eyebrow: "Updates",
        title: "Property announcements",
        description: "Read notices, reminders, and important operational updates.",
      },
      "/applicant/check-availability": {
        eyebrow: "Explore",
        title: "Browse available rooms",
        description: "Compare room options, pricing, and branch availability before you reserve.",
      },
      "/applicant/reservation": {
        eyebrow: "Reservation",
        title: "Complete your booking",
        description: "Finish your documents, payment steps, and move-in preparation.",
      },
    };

    return (
      meta[location.pathname] || {
        eyebrow: "Lilycrest",
        title: "Resident portal",
        description: "Manage your stay, requests, and account details.",
      }
    );
  }, [location.pathname]);

  const accountMode =
    user?.role === "tenant" || user?.tenantStatus === "active"
      ? { label: "Active stay", tone: "is-active" }
      : { label: "Application in progress", tone: "is-pending" };

  const initials =
    `${user?.firstName?.[0] || "L"}${user?.lastName?.[0] || "C"}`.toUpperCase();
  const displayName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.email ||
    "Lilycrest User";
  const branchLabel =
    (typeof user?.branch === "string" ? user.branch : user?.branch?.name) ||
    user?.branchName ||
    "Lilycrest";

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

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
        <header className="tenant-topbar">
          <div className="tenant-topbar-left">
            <button
              className="tenant-menu-toggle"
              onClick={toggleSidebar}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            <div className="tenant-topbar-copy">
              <span className="tenant-topbar-eyebrow">{pageMeta.eyebrow}</span>
              <div className="tenant-topbar-heading">
                <h1>{pageMeta.title}</h1>
                <p>{pageMeta.description}</p>
              </div>
            </div>
          </div>

          <div className="tenant-topbar-right">
            <div className="tenant-topbar-meta">
              <span className={`tenant-topbar-chip ${accountMode.tone}`}>
                {accountMode.label}
              </span>
              <span className="tenant-topbar-branch">{branchLabel}</span>
            </div>

            <div className="tenant-topbar-user">
              <NotificationBell />
              <div className="tenant-topbar-avatar">
                {user?.profileImage ? (
                  <>
                    <img
                      src={user.profileImage}
                      alt="Profile"
                      onError={(event) => {
                        event.target.style.display = "none";
                        if (event.target.nextSibling) {
                          event.target.nextSibling.style.display = "flex";
                        }
                      }}
                    />
                    <div
                      className="tenant-topbar-initials"
                      style={{ display: "none" }}
                    >
                      {initials}
                    </div>
                  </>
                ) : (
                  <div className="tenant-topbar-initials">{initials}</div>
                )}
              </div>

              <div className="tenant-topbar-user-copy">
                <span className="tenant-topbar-name">{displayName}</span>
                <span className="tenant-topbar-role">
                  {user?.role === "tenant" ? "Resident" : "Applicant"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {(user?.accountStatus === "suspended" || user?.accountStatus === "banned") && (
          <AccountBlockedBanner accountStatus={user.accountStatus} />
        )}

        <main className="tenant-content">{children}</main>
      </div>
    </div>
  );
};

export default TenantLayout;
