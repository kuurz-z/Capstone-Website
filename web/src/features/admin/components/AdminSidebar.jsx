import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
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
  const { user } = useAuth();
  const { can } = usePermissions();
  const isOwner = user?.role === "owner";
  const [hoveredItem, setHoveredItem] = useState(null);

  const visibleItems = getVisibleNavItems({ isOwner, can });
  const groupedItems = visibleItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

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

  const shellWidthClass = collapsed ? "w-16" : "w-64";
  const shellVisibilityClass = isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0";
  const sectionLabelClass = "px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]";
  const navButtonBase =
    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-0";
  const navButtonActive =
    "bg-[#d1b23d] text-[#0f1a2f]";
  const navButtonIdle =
    "text-[var(--text-primary)] hover:bg-[rgba(209,178,61,0.14)] hover:text-[var(--text-primary)] dark:hover:bg-[rgba(209,178,61,0.2)]";

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--border-subtle,var(--border-light))] bg-[var(--surface-sidebar,var(--bg-sidebar))] transition-all duration-300 ease-out ${shellWidthClass} ${shellVisibilityClass}`}
    >
      <div className="flex min-h-[74px] items-center justify-between gap-3 border-b border-[var(--border-subtle,var(--border-light))] px-4 py-4">
        <div className={`flex min-w-0 items-center gap-3 whitespace-nowrap ${collapsed ? "justify-center" : ""}`}>
          <span
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#d1b23d] text-base font-semibold text-[#0f1a2f]"
            aria-label="Lilycrest Logo"
          >
            L
          </span>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[30px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                {brandMeta.title}
              </span>
            </div>
          )}
        </div>
        <button
          className="hidden h-8 w-8 items-center justify-center rounded-md text-[var(--text-primary)] transition-colors duration-200 hover:bg-[rgba(209,178,61,0.12)] md:inline-flex"
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-primary)] transition-colors duration-200 hover:bg-[rgba(209,178,61,0.12)] md:hidden"
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <nav
        className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-2"
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
                className={group.id === "system" ? "mt-6 pt-2" : ""}
              >
                {!collapsed && group.id === "system" && (
                  <div className={sectionLabelClass}>{group.label}</div>
                )}
                {collapsed && group.id === "system" && (
                  <div className="mx-2 mb-3 border-t border-[var(--border-subtle,var(--border-light))]" />
                )}
                <div className="space-y-1.5 px-2">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `${navButtonBase} ${isActive ? navButtonActive : navButtonIdle} ${collapsed ? "justify-center px-2" : ""}`
                        }
                        title={collapsed ? item.text : undefined}
                        aria-label={item.text}
                        onClick={onClose}
                        onMouseEnter={() => collapsed && setHoveredItem(item.to)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-[#0f1a2f]" : "text-[var(--text-primary)]"}`} />
                            {!collapsed && (
                              <span className="truncate leading-tight">{item.text}</span>
                            )}
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
    </aside>
  );
}
