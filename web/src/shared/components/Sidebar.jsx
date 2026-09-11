import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bed,
  ChevronLeft,
  CreditCard,
  FileText,
  History,
  Home,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useUnreadCount } from "../hooks/queries/useNotifications";
import { tenantContractApi } from "../../features/tenant/api/tenantContractApi";
import { useReservations } from "../hooks/queries/useReservations";
import { prefetchRoute } from "../lib/routePrefetch";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { USER_ROLES } from "../utils/constants";
import ConfirmModal from "./ConfirmModal";
import { showNotification } from "../utils/notification";
import { buildSignOutSuccessFlash } from "../utils/authToasts";
import { formatDisplayName } from "../utils/formatDate";
import ProfileAvatar, { getProfileInitials } from "./ProfileAvatar";

import "./Sidebar.css";
import logo from "../../assets/images/LOGO.svg";

const MOBILE_BP = 768;

const buildNavSections = (isTenant, hasContract = false) => [
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
  ...(isTenant
    ? [
        {
          label: "Community",
          items: [
            {
              id: "announcements",
              label: "Announcements",
              icon: Megaphone,
              path: "/applicant/announcements",
            },
          ],
        },
      ]
    : []),
  {
    label: "My Stay",
    items: [
      {
        id: "reservation",
        label: "My Reservation",
        icon: Bed,
        path: "/applicant/profile",
        tab: "reservation",
      },
      ...(isTenant || hasContract
        ? [
            {
              id: "contract",
              label: "My Contract",
              icon: FileText,
              path: "/applicant/contracts",
            },
          ]
        : []),
      ...(isTenant
        ? [
            {
              id: "maintenance",
              label: "Maintenance",
              icon: Wrench,
              path: "/applicant/maintenance",
            },
          ]
        : []),
      {
        id: "history",
        label: "Activity & History",
        icon: History,
        path: "/applicant/profile",
        tab: "history",
      },
    ],
  },
  ...(isTenant
    ? [
        {
          label: "Billing & Payments",
          items: [
            {
              id: "billing",
              label: "My Bills",
              icon: CreditCard,
              path: "/applicant/billing",
            },
          ],
        },
      ]
    : []),
  {
    label: "Account",
    items: [
      {
        id: "personal",
        label: "My Profile",
        icon: User,
        path: "/applicant/profile",
        tab: "personal",
      },
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

export default function Sidebar({ isOpen, toggleSidebar, isCollapsed, toggleCollapse }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const appNavigate = useAppNavigation();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BP);

  const isTenant = user?.role === USER_ROLES.TENANT;
  const { data: contractData } = useQuery({
    queryKey: ["contracts", "myCurrentContract"],
    queryFn: async () => {
      try {
        const res = await tenantContractApi.getMyCurrentContract();
        return res?.contract || null;
      } catch {
        return null;
      }
    },
    staleTime: 15 * 1000,
    enabled: !!user,
  });

  const { data: reservationsData } = useReservations({}, { enabled: !!user && !isTenant });

  const hasSettledReservation = useMemo(() => {
    if (isTenant) return false;
    const list = Array.isArray(reservationsData)
      ? reservationsData
      : (reservationsData?.reservations || []);
    return list.some(
      (r) =>
        r.status !== "cancelled" &&
        r.status !== "rejected" &&
        r.status !== "archived" &&
        (r.initialPaymentStatus === "paid" ||
          r.advanceRentPaid === true ||
          r.status === "moveIn")
    );
  }, [isTenant, reservationsData]);

  const hasContract = isTenant || (hasSettledReservation && Boolean(contractData));

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", "myCurrentContract"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    };
    window.addEventListener("lilycrest:contract-updated", handleUpdate);
    window.addEventListener("lilycrest:payment-updated", handleUpdate);
    window.addEventListener("lilycrest:reservation-updated", handleUpdate);
    return () => {
      window.removeEventListener("lilycrest:contract-updated", handleUpdate);
      window.removeEventListener("lilycrest:payment-updated", handleUpdate);
      window.removeEventListener("lilycrest:reservation-updated", handleUpdate);
    };
  }, [queryClient]);

  const navSections = useMemo(() => buildNavSections(isTenant, hasContract), [isTenant, hasContract]);
  const { data: unreadData } = useUnreadCount();
  const sidebarUnreadCount = unreadData?.unreadCount ?? 0;

  const urlTab = new URLSearchParams(location.search).get("tab");
  const currentTab = urlTab || location.state?.tab || "dashboard";
  const rawFullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.name ||
    user?.fullName ||
    user?.username ||
    "User";
  const fullName = formatDisplayName(rawFullName);
  const email = user?.email || "";
  const initials = useMemo(() => getProfileInitials(user, "U"), [user]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile && isOpen) toggleSidebar();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, toggleSidebar]);

  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, isOpen, toggleSidebar]);

  useBodyScrollLock(isMobile && isOpen);

  const isItemActive = (item) => {
    if (item.path !== location.pathname) return false;
    if (item.path === "/applicant/profile" && item.tab) {
      return currentTab === item.tab;
    }
    return true;
  };

  const handleItemClick = (item) => {
    const targetPath =
      item.tab && item.path === "/applicant/profile"
        ? `${item.path}?tab=${item.tab}`
        : item.path;
    appNavigate(targetPath, { state: item.tab ? { tab: item.tab } : undefined });
    if (isMobile && isOpen) toggleSidebar();
  };

  const handleLogout = () => {
    if (!isLoggingOut) setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setIsLoggingOut(true);
    try {
      await logout();
      appNavigate("/signin", buildSignOutSuccessFlash());
    } catch (error) {
      console.error("Logout error:", error);
      showNotification("Logout failed. Please try again.", "error", 3000);
      setIsLoggingOut(false);
    }
  };

  const sidebarClasses = [
    "sidebar",
    isCollapsed && !isMobile ? "collapsed" : "",
    isMobile && isOpen ? "open" : "",
  ].filter(Boolean).join(" ");

  const renderSidebarContent = () => (
    <>
      <div className="sidebar-header">
        <Link
          to="/"
          className="sidebar-brand"
          onClick={() => {
            if (isMobile && isOpen) toggleSidebar();
          }}
        >
          <div className="sidebar-brand-mark">
            <img src={logo} alt="Lilycrest logo" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
          <span className="sidebar-brand-name">Lilycrest</span>
        </Link>

        {isMobile ? (
          <button type="button" className="sidebar-close" onClick={toggleSidebar} aria-label="Close menu">
            <X size={18} />
          </button>
        ) : (
          <button type="button" className="sidebar-collapse-toggle" onClick={toggleCollapse} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <ChevronLeft size={12} style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.52s cubic-bezier(0.4, 0, 0.2, 1)" }} />
          </button>
        )}
      </div>

      <button
        type="button"
        className="sidebar-identity"
        onClick={() => handleItemClick({ path: "/applicant/profile", tab: "personal" })}
        onMouseEnter={() => prefetchRoute("/applicant/profile", queryClient, user)}
        onFocus={() => prefetchRoute("/applicant/profile", queryClient, user)}
        title="View My Profile"
        aria-label="View My Profile"
      >
        <ProfileAvatar user={user} initials={initials} size={36} className="sidebar-avatar" />
        <div className="sidebar-identity-text">
          <p className="sidebar-identity-name capitalize">{fullName}</p>
          <p className="sidebar-identity-email">{email}</p>
        </div>
      </button>

      <div className="sidebar-cta-wrap">
        <button
          type="button"
          className="sidebar-cta"
          onClick={() => handleItemClick({ path: "/applicant/check-availability" })}
          onMouseEnter={() => prefetchRoute("/applicant/check-availability", queryClient, user)}
          onFocus={() => prefetchRoute("/applicant/check-availability", queryClient, user)}
          title="Browse Rooms"
        >
          <Search size={15} style={{ flexShrink: 0 }} />
          <span>Browse Rooms</span>
        </button>
      </div>

      <nav aria-label="Tenant navigation" className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.label} className="sidebar-group">
            <p className="sidebar-group-label">{section.label}</p>
            <div className="sidebar-group-items">
              {section.items.map((item) => {
                const active = isItemActive(item);
                const Icon = item.icon;
                const badge = item.id === "notifications" && sidebarUnreadCount > 0 ? sidebarUnreadCount : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => prefetchRoute(item.path, queryClient, user)}
                    onFocus={() => prefetchRoute(item.path, queryClient, user)}
                    title={isCollapsed && !isMobile ? item.label : undefined}
                    className={`sidebar-nav-item${active ? " active" : ""}`}
                  >
                    <Icon size={17} className="sidebar-nav-icon" />
                    <span className="sidebar-nav-label">{item.label}</span>
                    {badge && (
                      <span className="sidebar-badge" aria-label={`${badge} unread notifications`}>
                        <span className="sidebar-badge-text">{badge > 99 ? "99+" : badge}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-logout"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title={isCollapsed && !isMobile ? "Sign Out" : undefined}
          aria-label="Sign Out"
        >
          <LogOut size={17} className="sidebar-nav-icon" />
          <span className="sidebar-nav-label">{isLoggingOut ? "Signing out…" : "Sign Out"}</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {isMobile && isOpen && <div className="sidebar-overlay" onClick={toggleSidebar} aria-hidden="true" />}

      <aside className={sidebarClasses}>{renderSidebarContent()}</aside>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        variant="danger"
        confirmText="Log Out"
        loading={isLoggingOut}
      />
    </>
  );
}
