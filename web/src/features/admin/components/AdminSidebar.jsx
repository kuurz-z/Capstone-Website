import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { showNotification } from "../../../shared/utils/notification";
import { buildSignOutSuccessFlash } from "../../../shared/utils/authToasts";
import LilycrestLogo from "../../../shared/components/LilycrestLogo";
import { LogOut, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  NAV_GROUPS,
  getSidebarBrandMeta,
  getVisibleNavItems,
} from "./sidebarConfig.mjs";
import "../styles/admin-sidebar.css";

export default function AdminSidebar({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}) {
  const { user, logout, globalLoading } = useAuth();
  const { can } = usePermissions();
  const appNavigate = useAppNavigation();
  const isOwner = user?.role === "owner";
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const logoutCalledRef = React.useRef(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  const visibleItems = getVisibleNavItems({ isOwner, can });
  const groupedItems = visibleItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const handleLogout = async () => {
    if (logoutCalledRef.current) return;
    logoutCalledRef.current = true;
    try {
      const result = await logout();
      if (result?.success) {
        appNavigate("/signin", {
          replace: true,
          ...buildSignOutSuccessFlash(),
        });
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

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username ||
      "Admin"
    : "Admin";
  const brandMeta = getSidebarBrandMeta(isOwner);
  const roleLabel = brandMeta.roleLabel;
  const initials = user
    ? `${(user.firstName || "A")[0]}${(user.lastName || "")[0] || ""}`.toUpperCase()
    : "A";

  const renderGroup = (group) => {
    const items = groupedItems[group.id] || [];
    if (items.length === 0) return null;

    return (
      <div className="sb-group" key={group.id}>
        {!collapsed && <span className="sb-group-label">{group.label}</span>}
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
                {!collapsed && (
                  <span className="sb-link-text">{item.text}</span>
                )}
                {collapsed && hoveredItem === item.to && (
                  <span className="sb-tooltip">{item.text}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <aside
      className={`sb ${isOpen ? "sb--open" : ""} ${collapsed ? "sb--collapsed" : ""}`}
    >
      <div className="sb-header">
        <div className="sb-brand">
          <LilycrestLogo className="sb-logo" aria-label="Lilycrest Logo" />
          {!collapsed && (
            <div className="sb-brand-text">
              <span className="sb-title">{brandMeta.title}</span>
              <span className="sb-subtitle">{brandMeta.subtitle}</span>
            </div>
          )}
        </div>
        <button
          className="sb-close"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="sb-nav">
        {NAV_GROUPS.slice()
          .sort((a, b) => a.priority - b.priority)
          .map((group) => renderGroup(group))}
      </nav>

      <div className="sb-footer">
        <button
          className="sb-collapse-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>

        <div className="sb-profile">
          <div
            className="sb-avatar"
            onMouseEnter={() => collapsed && setHoveredItem("__profile")}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {initials}
          </div>
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

      {showLogoutConfirm &&
        createPortal(
          <div className="sb-logout-overlay" onClick={cancelLogout}>
            <div
              className="sb-logout-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sb-logout-modal-icon">
                <LogOut size={22} />
              </div>
              <h3 className="sb-logout-modal-title">Sign Out</h3>
              <p className="sb-logout-modal-text">
                You will be signed out and redirected to the login page. Are you
                sure?
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
                  {logoutInProgress || globalLoading
                    ? "Signing out..."
                    : "Sign Out"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}
