import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import LilycrestLogo from "../../../shared/components/LilycrestLogo";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Receipt,
  UserCog,
  FileText,
  Building2,
  Shield,
  Settings,
  LogOut,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import "../styles/admin-sidebar.css";

/* ─── Navigation structure ─── */
const NAV_ITEMS = [
  // WORKSPACE group
  { to: "/admin/dashboard",          icon: LayoutDashboard, text: "Dashboard",    group: "workspace" },
  { to: "/admin/reservations",       icon: CalendarCheck,   text: "Reservations", group: "workspace" },
  { to: "/admin/room-availability",  icon: BedDouble,       text: "Rooms",        group: "workspace" },
  { to: "/admin/tenants",            icon: Users,           text: "Tenants",      group: "workspace" },
  { to: "/admin/billing",            icon: Receipt,         text: "Billing",      group: "workspace" },
  // SYSTEM group
  { to: "/admin/users",              icon: UserCog,         text: "Accounts",     group: "system" },
  { to: "/admin/audit-logs",         icon: FileText,        text: "Activity Log", group: "system" },
  { to: "/admin/branches",           icon: Building2,       text: "Branches",     group: "system", saOnly: true },
  { to: "/admin/roles",              icon: Shield,          text: "Permissions",  group: "system", saOnly: true },
  { to: "/admin/settings",           icon: Settings,        text: "Settings",     group: "system", saOnly: true },
];

const STORAGE_KEY = "sidebar-collapsed";

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }) {
  const { user, logout, globalLoading } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const logoutCalledRef = React.useRef(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  // Filter items based on role
  const visibleItems = NAV_ITEMS.filter((item) => !item.saOnly || isSuperAdmin);

  // Group items
  const workspaceItems = visibleItems.filter((i) => i.group === "workspace");
  const systemItems = visibleItems.filter((i) => i.group === "system");

  /* ── Logout logic (unchanged) ── */
  const handleLogout = async () => {
    if (logoutCalledRef.current) return;
    logoutCalledRef.current = true;
    try {
      const result = await logout();
      if (result?.success) {
        setTimeout(() => {
          showNotification("You have been logged out successfully", "success");
          setTimeout(() => {
            window.location.href = "/signin";
          }, 300);
        }, 400);
      }
    } catch (error) {
      console.error("Admin logout error:", error);
      showNotification("Logout failed. Please try again.", "error");
      logoutCalledRef.current = false;
    }
  };

  const confirmLogout = () => {
    logoutCalledRef.current = false;
    setShowLogoutConfirm(true);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
    logoutCalledRef.current = false;
  };

  const proceedLogout = () => {
    if (logoutInProgress || logoutCalledRef.current) return;
    setLogoutInProgress(true);
    setShowLogoutConfirm(false);
    requestAnimationFrame(() => {
      handleLogout().finally(() => {
        setLogoutInProgress(false);
      });
    });
  };

  /* ── User display name ── */
  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Admin"
    : "Admin";
  const roleLabel = isSuperAdmin ? "Super Admin" : "Branch Admin";
  const initials = user
    ? `${(user.firstName || "A")[0]}${(user.lastName || "")[0] || ""}`.toUpperCase()
    : "A";

  /* ── Render a nav group ── */
  const renderGroup = (label, items) => (
    <div className="sb-group" key={label}>
      {!collapsed && <span className="sb-group-label">{label}</span>}
      <ul className="sb-menu">
        {items.map((item) => (
          <li key={item.to} className="sb-menu-item">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `sb-link ${isActive ? "active" : ""}`
              }
              onClick={onClose}
              onMouseEnter={() => collapsed && setHoveredItem(item.to)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <span className="sb-link-indicator" />
              <item.icon className="sb-link-icon" />
              {!collapsed && <span className="sb-link-text">{item.text}</span>}
              {/* Tooltip in collapsed mode */}
              {collapsed && hoveredItem === item.to && (
                <span className="sb-tooltip">{item.text}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <aside className={`sb ${isOpen ? "sb--open" : ""} ${collapsed ? "sb--collapsed" : ""}`}>
      {/* ── Brand header ── */}
      <div className="sb-header">
        <div className="sb-brand">
          <LilycrestLogo className="sb-logo" aria-label="Lilycrest Logo" />
          {!collapsed && (
            <div className="sb-brand-text">
              <span className="sb-title">Lilycrest</span>
              <span className="sb-subtitle">{isSuperAdmin ? "Super Admin" : "Admin Panel"}</span>
            </div>
          )}
        </div>
        {/* Mobile close */}
        <button className="sb-close" onClick={onClose} aria-label="Close sidebar">
          <X size={18} />
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="sb-nav">
        {renderGroup("Workspace", workspaceItems)}
        {renderGroup("System", systemItems)}
      </nav>

      {/* ── Footer ── */}
      <div className="sb-footer">
        {/* Collapse toggle (desktop only) */}
        <button
          className="sb-collapse-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>

        {/* User profile pill */}
        <div className="sb-profile">
          <div className="sb-avatar">{initials}</div>
          {!collapsed && (
            <div className="sb-profile-info">
              <span className="sb-profile-name">{displayName}</span>
              <span className="sb-profile-role">{roleLabel}</span>
            </div>
          )}
          {collapsed && hoveredItem === "__profile" && (
            <span className="sb-tooltip">
              {displayName} · {roleLabel}
            </span>
          )}
        </div>

        {/* Sign out */}
        <button
          className="sb-signout"
          onClick={confirmLogout}
          onMouseEnter={() => collapsed && setHoveredItem("__signout")}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign Out</span>}
          {collapsed && hoveredItem === "__signout" && (
            <span className="sb-tooltip">Sign Out</span>
          )}
        </button>
      </div>

      {/* ── Logout confirmation modal ── */}
      {showLogoutConfirm &&
        createPortal(
          <div className="sb-logout-overlay" onClick={cancelLogout}>
            <div className="sb-logout-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sb-logout-modal-icon">
                <LogOut size={22} />
              </div>
              <h3 className="sb-logout-modal-title">Sign Out</h3>
              <p className="sb-logout-modal-text">
                You will be signed out and redirected to the login page. Are you sure?
              </p>
              <div className="sb-logout-modal-actions">
                <button
                  className="sb-logout-modal-cancel"
                  onClick={cancelLogout}
                  disabled={logoutInProgress || globalLoading}
                >
                  Cancel
                </button>
                <button
                  className="sb-logout-modal-confirm"
                  onClick={proceedLogout}
                  disabled={logoutInProgress || globalLoading}
                >
                  {logoutInProgress || globalLoading ? "Signing out…" : "Sign Out"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}
