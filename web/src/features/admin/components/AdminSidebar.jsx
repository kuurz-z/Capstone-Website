import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import LilycrestLogo from "../../../shared/components/LilycrestLogo";
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
  const headerPaddingClass = collapsed ? "p-2.5" : "p-4";
  const navPaddingClass = collapsed ? "py-2" : "py-4";
  const sectionLabelClass = "px-3 mb-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]";
  const navButtonBase =
    `group relative flex w-full items-center gap-3 rounded-md text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outline)] focus-visible:ring-offset-0 ${collapsed ? "justify-center py-1.5 px-2" : "py-2.5 px-3"}`;
  const navButtonActive =
    "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]";
  const navButtonIdle =
    "text-[var(--text-primary)] hover:bg-[rgba(209,178,61,0.14)] hover:text-[var(--text-primary)]";
  const iconSizeClass = collapsed ? "h-5.5 w-5.5" : "h-5 w-5";
  const groupMarginClass = collapsed ? "mt-3" : "mt-6";
  const dividerMarginClass = collapsed ? "my-2" : "my-4";

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--border-subtle,var(--border-light))] bg-white transition-all duration-300 ease-out ${shellWidthClass} ${shellVisibilityClass}`}
    >
      <div className={`flex items-center justify-between border-b border-[var(--border-subtle,var(--border-light))] ${headerPaddingClass}`}>
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <span
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              aria-label="Lilycrest Logo"
            >
              <LilycrestLogo className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[20px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                {brandMeta.title}
              </span>
            </div>
          </div>
        )}
        <button
          className="hidden rounded-md p-1.5 text-[var(--text-primary)] transition-colors duration-200 hover:bg-[rgba(209,178,61,0.12)] md:inline-flex"
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
        <button
          className="inline-flex rounded-md p-1.5 text-[var(--text-primary)] transition-colors duration-200 hover:bg-[rgba(209,178,61,0.12)] md:hidden"
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav
        className={`flex-1 overflow-x-hidden ${navPaddingClass} ${collapsed ? "overflow-y-hidden" : "sidebar-scroll overflow-y-auto"}`}
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
                className={group.id === "system" ? groupMarginClass : ""}
              >
                {!collapsed && (
                  <div className={sectionLabelClass}>{group.label}</div>
                )}
                {collapsed && group.id === "system" && (
                  <div className={`mx-2 border-t border-[var(--border-subtle,var(--border-light))] ${dividerMarginClass}`} />
                )}
                <div className="space-y-1 px-2">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `${navButtonBase} ${isActive ? navButtonActive : navButtonIdle}`
                        }
                        title={collapsed ? item.text : undefined}
                        aria-label={item.text}
                        onClick={onClose}
                        onMouseEnter={() => collapsed && setHoveredItem(item.to)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon className={`${iconSizeClass} flex-shrink-0 ${isActive ? "text-[#0f1a2f]" : "text-[var(--text-primary)]"}`} />
                            {!collapsed && (
                              <span className="truncate text-sm leading-tight">{item.text}</span>
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
