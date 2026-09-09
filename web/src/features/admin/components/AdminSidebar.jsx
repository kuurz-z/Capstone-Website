import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { prefetchRoute } from "../../../shared/lib/routePrefetch";
import LilycrestLogo from "../../../shared/components/LilycrestLogo";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { showNotification } from "../../../shared/utils/notification";
import {
  AUTH_TOAST_DURATION,
  SIGN_OUT_SUCCESS_MESSAGE,
} from "../../../shared/utils/authToasts";
import { X, ChevronLeft, LogOut } from "lucide-react";
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
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const appNavigate = useAppNavigation();
  const { can } = usePermissions();
  const isOwner = user?.role === "owner";
  const [hoveredItem, setHoveredItem] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    if (logoutInProgress) return;
    setLogoutInProgress(true);
    try {
      const result = await logout();
      if (result?.success) {
        showNotification(
          SIGN_OUT_SUCCESS_MESSAGE,
          "success",
          AUTH_TOAST_DURATION,
        );
        appNavigate("/signin", {
          replace: true,
        });
      }
    } catch (error) {
      console.error("Admin logout error:", error);
      showNotification("Sign out failed. Please try again.", "error");
    } finally {
      setLogoutInProgress(false);
      setShowLogoutConfirm(false);
    }
  };

  const visibleItems = getVisibleNavItems({ isOwner, can });
  const groupedItems = visibleItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const brandMeta = getSidebarBrandMeta(isOwner);
  const sidebarClasses = [
    "admin-sidebar",
    collapsed ? "admin-sidebar-collapsed" : "",
    isOpen ? "open" : "",
  ].filter(Boolean).join(" ");

  return (
    <aside className={sidebarClasses}>
      <div className="admin-sidebar-header">
        <Link
          to="/admin/dashboard"
          className="admin-sidebar-brand"
          onClick={() => {
            if (isOpen) onClose?.();
          }}
        >
          <div className="admin-sidebar-brand-mark">
            <LilycrestLogo className="w-full h-full object-contain" aria-hidden="true" />
          </div>
          <span className="admin-sidebar-brand-name">
            {brandMeta.title}
          </span>
        </Link>

        <button
          className="admin-sidebar-collapse-toggle"
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={12}
            style={{
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.24s ease",
            }}
          />
        </button>

        <button
          className="admin-sidebar-close"
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <nav
        className="admin-sidebar-nav sidebar-scroll"
        aria-label="Admin navigation"
      >
        {NAV_GROUPS.slice()
          .sort((a, b) => a.priority - b.priority)
          .map((group) => {
            const items = groupedItems[group.id] || [];
            if (items.length === 0) return null;

            return (
              <div
                key={group.id}
                className="admin-sidebar-group"
              >
                <div className="admin-sidebar-group-label">{group.label}</div>
                <div className="admin-sidebar-group-items">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `admin-sidebar-nav-item ${isActive ? "active" : ""}`
                        }
                        title={collapsed ? item.text : undefined}
                        aria-label={item.text}
                        onClick={onClose}
                        onMouseEnter={() => {
                          if (collapsed) setHoveredItem(item.to);
                          prefetchRoute(item.to, queryClient, user);
                        }}
                        onFocus={() => {
                          prefetchRoute(item.to, queryClient, user);
                        }}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className="admin-sidebar-nav-icon"
                              aria-hidden="true"
                            />
                            <span className="admin-sidebar-nav-label">
                              {item.text}
                            </span>
                            {collapsed && hoveredItem === item.to && (
                              <span className="sb-tooltip">{item.text}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </nav>

      {/* Sidebar Footer with Sign Out */}
      <div className="admin-sidebar-footer">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          disabled={logoutInProgress}
          className="admin-sidebar-logout"
          title={collapsed ? "Sign Out" : undefined}
          aria-label="Sign Out"
          onMouseEnter={() => collapsed && setHoveredItem("__signout")}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <LogOut className="admin-sidebar-nav-icon" aria-hidden="true" />
          <span className="admin-sidebar-nav-label">Sign Out</span>
          {collapsed && hoveredItem === "__signout" && (
            <span className="sb-tooltip">Sign Out</span>
          )}
        </button>
      </div>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => {
          if (!logoutInProgress) setShowLogoutConfirm(false);
        }}
        onConfirm={handleLogout}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        variant="danger"
        confirmText="Sign Out"
        cancelText="Cancel"
        loading={logoutInProgress}
      />
    </aside>
  );
}
