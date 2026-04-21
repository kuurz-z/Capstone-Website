import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bed,
  ChevronLeft,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAppNavigation } from "../hooks/useAppNavigation";
import ConfirmModal from "./ConfirmModal";
import { showNotification } from "../utils/notification";
import { buildSignOutSuccessFlash } from "../utils/authToasts";

const MOBILE_BP = 768;
const TRANSITION = "0.24s cubic-bezier(0.22, 1, 0.36, 1)";

const buildNavSections = (canViewAnnouncements) => [
  {
    label: "Main",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        path: "/applicant/profile",
        tab: "dashboard",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        id: "personal",
        label: "Personal Details",
        icon: User,
        path: "/applicant/profile",
        tab: "personal",
      },
      {
        id: "billing",
        label: "My Bills",
        icon: CreditCard,
        path: "/applicant/billing",
      },
      {
        id: "maintenance",
        label: "Maintenance",
        icon: Wrench,
        path: "/applicant/maintenance",
      },
      ...(canViewAnnouncements
        ? [
            {
              id: "announcements",
              label: "Announcements",
              icon: Megaphone,
              path: "/applicant/announcements",
            },
          ]
        : []),
      {
        id: "reservation",
        label: "My Reservation",
        icon: Bed,
        path: "/applicant/profile",
        tab: "reservation",
      },
      {
        id: "contract",
        label: "My Contract",
        icon: FileText,
        path: "/applicant/contracts",
      },
      {
        id: "history",
        label: "My History",
        icon: History,
        path: "/applicant/profile",
        tab: "history",
      },
    ],
  },
  {
    label: "Preferences",
    items: [
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        path: "/applicant/profile",
        tab: "notifications",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        path: "/applicant/profile",
        tab: "settings",
      },
    ],
  },
];

const styles = {
  desktopAside: (collapsed) => ({
    width: collapsed ? 64 : 250,
    minWidth: collapsed ? 64 : 250,
    maxWidth: collapsed ? 64 : 250,
    backgroundColor: "var(--surface-sidebar, #F8FAFC)",
    borderRight: "1px solid var(--border-subtle, #E2E8F0)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "sticky",
    top: 0,
    flexShrink: 0,
    transition: `width ${TRANSITION}, min-width ${TRANSITION}, max-width ${TRANSITION}`,
    overflow: "hidden",
    zIndex: 10,
  }),
  mobileTopbar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: "var(--surface-sidebar, #F8FAFC)",
    borderBottom: "1px solid var(--border-subtle, #E2E8F0)",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: 12,
    zIndex: 40,
  },
  mobileDrawer: (open) => ({
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: "var(--surface-sidebar, #F8FAFC)",
    borderRight: "1px solid var(--border-subtle, #E2E8F0)",
    zIndex: 50,
    transform: open ? "translateX(0)" : "translateX(-100%)",
    transition: `transform ${TRANSITION}`,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  }),
  backdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 49,
  },
};

function Sidebar({ isOpen, toggleSidebar, isCollapsed, toggleCollapse }) {
  const { user, logout } = useAuth();
  const appNavigate = useAppNavigation();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_BP,
  );

  const canViewAnnouncements = user?.role === "tenant";
  const navSections = useMemo(
    () => buildNavSections(canViewAnnouncements),
    [canViewAnnouncements],
  );

  const currentTab = location.state?.tab || "dashboard";
  const fullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "User";
  const email = user?.email || "";
  const initials =
    `${user?.firstName?.[0] || "U"}${user?.lastName?.[0] || ""}`.toUpperCase();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile && isOpen) {
        toggleSidebar();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, toggleSidebar]);

  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }

    document.body.style.overflow = "";
    return undefined;
  }, [isMobile, isOpen]);

  const isItemActive = (item) => {
    if (item.path !== location.pathname) {
      return false;
    }

    if (item.path === "/applicant/profile" && item.tab) {
      return currentTab === item.tab;
    }

    return true;
  };

  const handleItemClick = (item) => {
    appNavigate(item.path, {
      state: item.tab ? { tab: item.tab } : undefined,
    });

    if (isMobile && isOpen) {
      toggleSidebar();
    }
  };

  const handleLogout = () => {
    if (!isLoggingOut) {
      setShowLogoutConfirm(true);
    }
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setIsLoggingOut(true);

    try {
      await logout();
      appNavigate("/", buildSignOutSuccessFlash());
    } catch (error) {
      console.error("Logout error:", error);
      showNotification("Logout failed. Please try again.", "error", 3000);
      setIsLoggingOut(false);
    }
  };

  const renderShell = (collapsed, mobile) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 14px",
          borderBottom: "1px solid var(--border-subtle, #E2E8F0)",
          minHeight: 68,
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: "var(--color-primary, #0F172A)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Bed style={{ width: 20, height: 20, color: "#fff" }} />
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: "var(--text-heading, #0F172A)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              opacity: collapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
            }}
          >
            Lilycrest
          </span>
        </Link>

        {mobile ? (
          <button
            type="button"
            onClick={toggleSidebar}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#64748B",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <div
        style={{
          padding: "14px 14px",
          borderBottom: "1px solid var(--border-subtle, #E2E8F0)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {user?.profileImage ? (
            <img
              src={user.profileImage}
              alt="Profile"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "50%",
              }}
            />
          ) : (
            <div
              style={{
                background: "linear-gradient(135deg, #FF8C42 0%, #D35400 100%)",
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: "50%",
              }}
            >
              {initials}
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            opacity: collapsed ? 0 : 1,
            transition: `opacity ${TRANSITION}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-heading, #0F172A)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fullName}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: "var(--text-muted, #64748B)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email}
          </p>
        </div>
      </div>

      <div style={{ padding: "12px 8px 4px" }}>
        <button
          type="button"
          onClick={() =>
            handleItemClick({ path: "/applicant/check-availability" })
          }
          title="Browse Rooms"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-heading, #0F172A)",
            border: "1.5px solid var(--text-heading, #0F172A)",
            borderLeft: "3.5px solid #FF8C42",
            background: "transparent",
            cursor: "pointer",
            transition: `background ${TRANSITION}, color ${TRANSITION}, box-shadow ${TRANSITION}`,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <Search style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span
            style={{
              opacity: collapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Browse Rooms
          </span>
        </button>
      </div>

      <nav
        aria-label="Tenant navigation"
        style={{
          flex: 1,
          padding: "8px 8px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {navSections.map((section) => (
          <div key={section.label}>
            <p
              style={{
                margin: "0 0 4px 4px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted, #64748B)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                opacity: collapsed ? 0 : 1,
                height: collapsed ? 0 : 18,
                marginBottom: collapsed ? 0 : 4,
                transition: `opacity ${TRANSITION}, height ${TRANSITION}, margin ${TRANSITION}`,
              }}
            >
              {section.label}
            </p>

            <div
              style={{
                height: 1,
                backgroundColor: "var(--border-subtle, #E2E8F0)",
                margin: collapsed ? "4px 6px 8px" : "0 6px",
                opacity: collapsed ? 0.8 : 0,
                transition: `opacity ${TRANSITION}, margin ${TRANSITION}`,
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map((item) => {
                const active = isItemActive(item);
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    title={collapsed ? item.label : undefined}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 12px",
                      justifyContent: "flex-start",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: active
                        ? "var(--surface-card, #FFFFFF)"
                        : "transparent",
                      color: active ? "#FF8C42" : "var(--text-body, #334155)",
                      fontWeight: active ? 600 : 500,
                      fontSize: 14,
                      transition: `background ${TRANSITION}, color ${TRANSITION}`,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                    <span
                      style={{
                        opacity: collapsed ? 0 : 1,
                        transition: `opacity ${TRANSITION}`,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        style={{
          padding: "16px 8px 12px",
          borderTop: "1px solid var(--border-card, #E2E8F0)",
        }}
      >
        <button
          type="button"
          onClick={handleLogout}
          title="Sign Out"
          disabled={isLoggingOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            padding: "8px 12px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "#EF4444",
            fontWeight: 500,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span
            style={{
              opacity: collapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
            }}
          >
            {isLoggingOut ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </div>

      {!mobile ? (
        <div
          style={{
            padding: "8px 8px 12px",
            borderTop: "1px solid var(--border-card, #E2E8F0)",
          }}
        >
          <button
            type="button"
            onClick={toggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 10,
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              backgroundColor: "transparent",
              color: "var(--text-secondary, #64748B)",
              fontWeight: 500,
              fontSize: 14,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <ChevronLeft
              style={{
                width: 18,
                height: 18,
                flexShrink: 0,
                transition: `transform ${TRANSITION}`,
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
            <span
              style={{
                opacity: collapsed ? 0 : 1,
                transition: `opacity ${TRANSITION}`,
              }}
            >
              Collapse
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {isMobile ? (
        <>
          <div style={styles.mobileTopbar}>
            <button
              type="button"
              onClick={toggleSidebar}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--text-heading, #0F172A)",
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <Link
              to="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  backgroundColor: "var(--color-primary, #0F172A)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bed style={{ width: 16, height: 16, color: "#fff" }} />
              </div>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  color: "var(--text-heading, #0F172A)",
                }}
              >
                Lilycrest
              </span>
            </Link>
          </div>

          {isOpen ? (
            <div style={styles.backdrop} onClick={toggleSidebar} />
          ) : null}

          <aside style={styles.mobileDrawer(isOpen)}>
            {renderShell(false, true)}
          </aside>
        </>
      ) : (
        <aside style={styles.desktopAside(isCollapsed)}>
          {renderShell(isCollapsed, false)}
        </aside>
      )}

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
}

export default Sidebar;
