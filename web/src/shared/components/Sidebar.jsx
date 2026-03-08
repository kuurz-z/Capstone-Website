import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import ConfirmModal from "./ConfirmModal";
import "./Sidebar.css";

const Sidebar = ({ isOpen, toggleSidebar, isCollapsed, toggleCollapse }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Determine if user is a tenant (has active or past stay)
  const isTenant =
    user?.role === "tenant" ||
    user?.tenantStatus === "active" ||
    user?.tenantStatus === "inactive";

  // Navigation items for Pre-Tenant (Registered User)
  const preTenantNavItems = [
    { path: "/tenant/dashboard", icon: "fas fa-home", label: "Home" },
    { path: "/tenant/profile", icon: "fas fa-user", label: "Profile" },
    {
      path: "/tenant/reservation",
      icon: "fas fa-calendar-check",
      label: "Reservation",
    },
    { path: "/tenant/settings", icon: "fas fa-cog", label: "Settings" },
  ];

  // Navigation items for Tenant (Active/Former)
  const tenantNavItems = [
    { path: "/tenant/dashboard", icon: "fas fa-home", label: "Home" },
    { path: "/tenant/profile", icon: "fas fa-user", label: "Profile" },
    {
      path: "/tenant/billing",
      icon: "fas fa-file-invoice-dollar",
      label: "Billing",
    },
    { path: "/tenant/maintenance", icon: "fas fa-tools", label: "Maintenance" },
    {
      path: "/tenant/announcements",
      icon: "fas fa-bullhorn",
      label: "Announcements",
    },
    { path: "/tenant/settings", icon: "fas fa-cog", label: "Settings" },
  ];

  const navItems = isTenant ? tenantNavItems : preTenantNavItems;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${isOpen ? "open" : ""} ${
          isCollapsed ? "collapsed" : ""
        }`}
      >
        {/* Logo Section */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <i className="fas fa-building"></i>
            {!isCollapsed && (
              <span className="sidebar-logo-text">LilyCrest</span>
            )}
          </div>
          <button className="sidebar-close" onClick={toggleSidebar}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Desktop Collapse Toggle */}
        <button className="sidebar-collapse-toggle" onClick={toggleCollapse}>
          <i className={`fas fa-chevron-${isCollapsed ? "right" : "left"}`}></i>
        </button>

        {/* User Info */}
        {!isCollapsed && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="Profile" />
              ) : (
                <div className="sidebar-user-initials">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </div>
              )}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="sidebar-user-role">
                {isTenant ? "Tenant" : "Registered User"}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? "active" : ""}`
              }
              onClick={() => window.innerWidth < 768 && toggleSidebar()}
              title={isCollapsed ? item.label : ""}
            >
              <i className={item.icon}></i>
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="sidebar-footer">
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title={isCollapsed ? "Logout" : ""}
          >
            <i className="fas fa-sign-out-alt"></i>
            {!isCollapsed && (
              <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Logout Confirm Modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        variant="warning"
        confirmText="Log Out"
        loading={isLoggingOut}
      />
    </>
  );
};

export default Sidebar;
