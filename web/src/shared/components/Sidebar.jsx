import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Megaphone,
  Search,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import ConfirmModal from "./ConfirmModal";
import { showNotification } from "../utils/notification";
import "./Sidebar.css";

const Sidebar = ({ isOpen, toggleSidebar, isCollapsed, toggleCollapse }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isTenant =
    user?.role === "tenant" ||
    user?.tenantStatus === "active" ||
    user?.tenantStatus === "inactive";

  const roleLabel = isTenant ? "Resident Portal" : "Applicant Portal";
  const fullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.email ||
    "Lilycrest User";
  const initials =
    `${user?.firstName?.[0] || "L"}${user?.lastName?.[0] || "C"}`.toUpperCase();

  const navSections = useMemo(
    () =>
      isTenant
        ? [
            {
              label: "Current Stay",
              items: [
                { path: "/applicant/profile", label: "Overview", icon: Home },
                { path: "/applicant/billing", label: "Billing", icon: CreditCard },
                { path: "/applicant/contracts", label: "Contracts", icon: FileText },
                { path: "/applicant/maintenance", label: "Maintenance", icon: Wrench },
                {
                  path: "/applicant/announcements",
                  label: "Announcements",
                  icon: Megaphone,
                },
              ],
            },
            {
              label: "Explore",
              items: [
                {
                  path: "/applicant/check-availability",
                  label: "Browse Rooms",
                  icon: Search,
                },
              ],
            },
          ]
        : [
            {
              label: "Get Started",
              items: [
                { path: "/applicant/profile", label: "Profile", icon: UserRound },
                {
                  path: "/applicant/check-availability",
                  label: "Browse Rooms",
                  icon: Search,
                },
                {
                  path: "/applicant/reservation",
                  label: "Reservation",
                  icon: CalendarCheck2,
                },
              ],
            },
          ],
    [isTenant],
  );

  const handleLogout = () => {
    if (isLoggingOut) return;
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setIsLoggingOut(true);
    try {
      await logout();
      showNotification("You have been signed out successfully.", "success", 3000);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      showNotification("Logout failed. Please try again.", "error", 3000);
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {isOpen ? <div className="sidebar-overlay" onClick={toggleSidebar} /> : null}

      <aside className={`sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">
              <Building2 size={18} />
            </div>
            {!isCollapsed ? (
              <div className="sidebar-brand-copy">
                <span className="sidebar-logo-text">Lilycrest</span>
                <span className="sidebar-brand-subtitle">{roleLabel}</span>
              </div>
            ) : null}
          </div>
          <button className="sidebar-close" onClick={toggleSidebar} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <button
          className="sidebar-collapse-toggle"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt="Profile"
                onError={(e) => {
                  e.target.style.display = "none";
                  if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="sidebar-user-initials"
              style={{ display: user?.profileImage ? "none" : "flex" }}
            >
              {initials}
            </div>
          </div>
          {!isCollapsed ? (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{fullName}</div>
              <div className="sidebar-user-role">{roleLabel}</div>
            </div>
          ) : null}
        </div>

        <nav className="sidebar-nav" aria-label="Tenant navigation">
          {navSections.map((section) => (
            <div key={section.label} className="sidebar-group">
              {!isCollapsed ? (
                <div className="sidebar-group-label">{section.label}</div>
              ) : null}
              <div className="sidebar-group-items">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                      onClick={() => {
                        if (window.innerWidth < 768) toggleSidebar();
                      }}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className="sidebar-nav-icon" size={18} />
                      {!isCollapsed ? <span>{item.label}</span> : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title={isCollapsed ? "Sign out" : undefined}
          >
            <LogOut size={18} />
            {!isCollapsed ? (
              <span>{isLoggingOut ? "Signing out..." : "Sign Out"}</span>
            ) : null}
          </button>
        </div>
      </aside>

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
