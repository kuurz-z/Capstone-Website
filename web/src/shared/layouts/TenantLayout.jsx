import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        {/* Top Navigation Bar */}
        <header className="tenant-topbar">
          <button className="tenant-menu-toggle" onClick={toggleSidebar}>
            <i className="fas fa-bars"></i>
          </button>

          <div className="tenant-topbar-title">
            <h1>LilyCrest Dormitory</h1>
          </div>

          <div className="tenant-topbar-user">
            <NotificationBell />
            <div className="tenant-topbar-avatar">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="Profile" />
              ) : (
                <div className="tenant-topbar-initials">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </div>
              )}
            </div>
            <span className="tenant-topbar-name">
              {user?.firstName} {user?.lastName}
            </span>
          </div>
        </header>

        {/* Account Status Banner */}
        {(user?.accountStatus === "suspended" || user?.accountStatus === "banned") && (
          <AccountBlockedBanner accountStatus={user.accountStatus} />
        )}

        {/* Main Content */}
        <main className="tenant-content">{children}</main>
      </div>
    </div>
  );
};

export default TenantLayout;
