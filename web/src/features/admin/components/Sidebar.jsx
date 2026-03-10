import React from "react";
import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import LilycrestLogo from "../../../shared/components/LilycrestLogo";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  ShieldCheck,
  BedDouble,
  FileText,
  DollarSign,
  LogOut,
  X,
} from "lucide-react";
import "../styles/admin-sidebar.css";

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { to: "/admin/dashboard", icon: LayoutDashboard, text: "Dashboard" },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/admin/reservations", icon: CalendarCheck, text: "Reservations" },
      { to: "/admin/room-availability", icon: BedDouble, text: "Rooms" },
      { to: "/admin/tenants", icon: Users, text: "Tenants" },
      { to: "/admin/billing", icon: DollarSign, text: "Billing" },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/users", icon: ShieldCheck, text: "Accounts" },
      { to: "/admin/audit-logs", icon: FileText, text: "Activity Log" },
    ],
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const { logout, globalLoading } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [logoutInProgress, setLogoutInProgress] = React.useState(false);
  const logoutCalledRef = React.useRef(false);

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

  return (
    <aside className={`admin-sidebar ${isOpen ? "open" : ""}`}>
      {/* Brand Header */}
      <div className="admin-sidebar-header">
        <div className="admin-sidebar-brand">
          <LilycrestLogo
            className="admin-sidebar-logo"
            aria-label="Lilycrest Logo"
          />
          <div className="admin-sidebar-brand-text">
            <span className="admin-sidebar-title">Lilycrest</span>
            <span className="admin-sidebar-subtitle">Admin Panel</span>
          </div>
        </div>
        <button
          className="admin-sidebar-close"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="admin-sidebar-section">
            <span className="admin-sidebar-section-label">{section.label}</span>
            <ul className="admin-sidebar-menu">
              {section.items.map((item) => (
                <li key={item.to} className="admin-sidebar-menu-item">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `admin-sidebar-link ${isActive ? "active" : ""}`
                    }
                    onClick={onClose}
                  >
                    <span className="admin-sidebar-link-indicator" />
                    <item.icon className="admin-sidebar-link-icon" />
                    <span className="admin-sidebar-link-text">{item.text}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="admin-sidebar-footer">
        <button className="admin-sidebar-logout" onClick={confirmLogout}>
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Logout Modal */}
      {showLogoutConfirm &&
        createPortal(
          <div className="admin-logout-overlay" onClick={cancelLogout}>
            <div
              className="admin-logout-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="admin-logout-modal-icon">
                <LogOut size={22} />
              </div>
              <h3 className="admin-logout-modal-title">Sign Out</h3>
              <p className="admin-logout-modal-message">
                You will be signed out and redirected to the login page. Are you
                sure?
              </p>
              <div className="admin-logout-modal-actions">
                <button
                  className="admin-logout-modal-cancel"
                  onClick={cancelLogout}
                  disabled={logoutInProgress || globalLoading}
                >
                  Cancel
                </button>
                <button
                  className="admin-logout-modal-confirm"
                  onClick={proceedLogout}
                  disabled={logoutInProgress || globalLoading}
                >
                  {logoutInProgress || globalLoading
                    ? "Signing out…"
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
