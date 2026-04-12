import React, { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Logo from "../../../../assets/images/LOGO.svg";
import { showNotification } from "../../../../shared/utils/notification";
import {
  User,
  Bell,
  History,
  Bed,
  LogOut,
  LayoutDashboard,
  CreditCard,
  ChevronLeft,
  Settings,
  Camera,
  FileText,
  Menu,
  X,
  Wrench,
  Megaphone,
} from "lucide-react";

/* ── Timing ─────────────────────────────────────────────────────────────── */
const TRANSITION = "0.3s cubic-bezier(0.4, 0, 0.2, 1)";
const MOBILE_BP = 768;
const LIGHT_THEME = {
  border: "#E8EBF0",
  brand: "#0C375F",
  active: "#D4AF37",
  activeText: "#FFFFFF",
  panel: "#FFFFFF",
  text: "#4B5563",
  heading: "#1F2937",
  subText: "#6B7280",
  sectionLabel: "#9CA3AF",
  hover: "#F9FAFB",
  danger: "#EF4444",
  dangerHover: "#FEF2F2",
  toggleShadow: "rgba(12, 55, 95, 0.16)",
};

const DARK_THEME = {
  border: "#2A3B57",
  brand: "#E0B84C",
  active: "#E0B84C",
  activeText: "#0F1B2D",
  panel: "#0F1B2D",
  text: "#C8D3E4",
  heading: "#F8F5EC",
  subText: "#AFC0D8",
  sectionLabel: "#8FA4C2",
  hover: "#1A2B43",
  danger: "#FCA5A5",
  dangerHover: "#2A1315",
  toggleShadow: "rgba(0, 0, 0, 0.35)",
};

/* ── Navigation structure ───────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: "Main",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Account",
    items: [
      { id: "personal", label: "Personal Details", icon: User },
      { id: "billing", label: "My Bills", icon: CreditCard },
      { id: "maintenance", label: "Maintenance", icon: Wrench },
      { id: "announcements", label: "Announcements", icon: Megaphone },
      { id: "reservation", label: "My Reservation", icon: Bed },
      { id: "contract", label: "My Contract", icon: FileText },
      { id: "history", label: "My History", icon: History },
    ],
  },
  {
    label: "Preferences",
    items: [
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

/* ── NavButton ──────────────────────────────────────────────────────────── */
const NavButton = ({ item, isActive, onClick, collapsed, theme }) => (
  <button
    onClick={onClick}
    title={collapsed ? item.label : undefined}
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: collapsed ? 0 : 11,
      padding: collapsed ? "9px" : "8px 11px",
      justifyContent: collapsed ? "center" : "flex-start",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      backgroundColor: isActive ? theme.active : "transparent",
      color: isActive ? theme.activeText : theme.text,
      fontWeight: isActive ? 600 : 500,
      fontSize: 14,
      transition: "background 0.15s, color 0.15s",
      whiteSpace: "nowrap",
      overflow: "hidden",
      minHeight: 36,
    }}
    onMouseEnter={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = theme.hover;
    }}
    onMouseLeave={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
    }}
  >
    <item.icon style={{ width: collapsed ? 18 : 18, height: collapsed ? 18 : 18, flexShrink: 0 }} />
    <span
      style={{
        opacity: collapsed ? 0 : 1,
        width: collapsed ? 0 : "auto",
        transition: `opacity ${TRANSITION}`,
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: collapsed ? "none" : "inline",
      }}
    >
      {item.label}
    </span>
  </button>
);

/* ── ProfileSidebar ─────────────────────────────────────────────────────── */
const ProfileSidebar = ({
  activeTab,
  setActiveTab,
  profileData,
  fullName,
  hasActiveReservation,
  canViewAnnouncements = false,
  onLogout,
  onUpdateImage,
}) => {
  // Guard: render nothing if profile data hasn't loaded yet
  if (!profileData) return null;

  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );

  /* ── Mobile detection ──────────────────────── */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BP);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const root = document.documentElement;
    return root.getAttribute("data-theme") === "dark" || root.classList.contains("dark");
  });

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth <= MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false); // close drawer if resizing to desktop
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setIsDark(root.getAttribute("data-theme") === "dark" || root.classList.contains("dark"));
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    syncTheme();
    return () => observer.disconnect();
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const handleNavClick = useCallback((tabId) => {
    setActiveTab(tabId);
    if (isMobile) setDrawerOpen(false);
  }, [setActiveTab, isMobile]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", prev ? "false" : "true");
      return !prev;
    });
  };

  const handleAvatarClick = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateImage) return;
    setUploading(true);
    try {
      const { uploadToImageKit } = await import("../../../../shared/utils/imageUpload");
      const result = await uploadToImageKit(file, `profile/${profileData.email}`);
      if (result?.url) {
        await onUpdateImage(result.url);
      }
    } catch (err) {
      console.error("Profile image upload failed:", err);
      showNotification("Failed to upload photo. Please try again.", "error", 3000);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  /* ── Sidebar inner content (shared between desktop & mobile drawer) ── */
  const sidebarContent = (showCollapsed) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ── Logo row ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 12px",
          borderBottom: `1px solid ${theme.border}`,
          minHeight: 60,
          backgroundColor: theme.panel,
        }}
      >
        <Link
          to="/"
          style={{ display: "flex", alignItems: "center", gap: showCollapsed ? 0 : 8, textDecoration: "none", flexShrink: 0, width: showCollapsed ? "100%" : "auto", justifyContent: showCollapsed ? "center" : "flex-start" }}
          title="Lilycrest — Home"
        >
          <div
            style={{
              width: 25,
              height: 25,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <img
              src={Logo}
              alt="Lilycrest Logo"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: theme.brand,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              opacity: showCollapsed ? 0 : 1,
              width: showCollapsed ? 0 : "auto",
              transition: `opacity ${TRANSITION}`,
              overflow: "hidden",
            }}
          >
            Lilycrest
          </span>
        </Link>

        {/* Close button on mobile */}
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#64748B",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* ── User Card ───────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          gap: 11,
          justifyContent: showCollapsed ? "center" : "flex-start",
          backgroundColor: theme.panel,
        }}
      >
        <div
          onClick={handleAvatarClick}
          title={onUpdateImage ? "Click to change photo" : undefined}
          style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: "50%",
            cursor: onUpdateImage ? "pointer" : "default",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {profileData.profileImage ? (
            <img
              src={profileData.profileImage}
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            />
          ) : (
            <div
              style={{
                background: theme.brand,
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
              {(profileData.firstName?.[0] || "").toUpperCase()}
              {(profileData.lastName?.[0] || "").toUpperCase()}
            </div>
          )}
          {onUpdateImage && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: uploading ? 1 : 0,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.opacity = "0"; }}
            >
              {uploading
                ? <span style={{ color: "#fff", fontSize: 10 }}>...</span>
                : <Camera style={{ width: 14, height: 14, color: "#fff" }} />}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div
          style={{
            flex: showCollapsed ? 0 : 1,
            minWidth: showCollapsed ? 0 : "auto",
            opacity: showCollapsed ? 0 : 1,
            width: showCollapsed ? 0 : "auto",
            transition: `opacity ${TRANSITION}`,
            overflow: "hidden",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: theme.heading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fullName}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: theme.subText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profileData.email}
          </p>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav
        style={{
          flex: 1,
          padding: "10px 8px",
          overflowY: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          backgroundColor: theme.panel,
        }}
      >
        {NAV_SECTIONS.map((section) => (
          (() => {
            const visibleItems = section.items.filter(
              (item) => item.id !== "announcements" || canViewAnnouncements,
            );

            if (visibleItems.length === 0) {
              return null;
            }

            return (
          <div key={section.label}>
            {/* Section label — fades out */}
            <p
              style={{
                margin: "0 0 2px 4px",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: theme.sectionLabel,
                whiteSpace: "nowrap",
                overflow: "hidden",
                opacity: showCollapsed ? 0 : 1,
                height: showCollapsed ? 0 : 16,
                marginBottom: showCollapsed ? 0 : 4,
                transition: `opacity ${TRANSITION}, height ${TRANSITION}, margin ${TRANSITION}`,
              }}
            >
              {section.label}
            </p>
            {/* Divider when collapsed */}
            <div
              style={{
                height: 1,
                backgroundColor: theme.border,
                margin: showCollapsed ? "2px 6px 6px" : "0 6px",
                opacity: showCollapsed ? 0.35 : 0,
                transition: `opacity ${TRANSITION}, margin ${TRANSITION}`,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {visibleItems.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  onClick={() => handleNavClick(item.id)}
                  collapsed={showCollapsed}
                  theme={theme}
                />
              ))}
            </div>
          </div>
            );
          })()
        ))}
      </nav>

      {/* ── Sign Out ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 8px 12px", borderTop: `1px solid ${theme.border}`, backgroundColor: theme.panel }}>
        <button
          onClick={onLogout}
          title="Sign Out"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: showCollapsed ? "center" : "flex-start",
            gap: showCollapsed ? 0 : 10,
            padding: showCollapsed ? "9px" : "8px 11px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            backgroundColor: "transparent",
            color: theme.danger,
            fontWeight: 500,
            fontSize: 14,
            transition: "background 0.15s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.dangerHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span
            style={{
              opacity: showCollapsed ? 0 : 1,
              width: showCollapsed ? 0 : "auto",
              transition: `opacity ${TRANSITION}`,
              display: showCollapsed ? "none" : "inline",
            }}
          >
            Sign Out
          </span>
        </button>
      </div>
    </div>
  );

  const W = collapsed ? 68 : 272;

  /* ── MOBILE: Hamburger + Drawer ─────────────────────────────────────── */
  if (isMobile) {
    return (
      <>
        {/* Fixed top bar with hamburger */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            backgroundColor: theme.panel,
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            zIndex: 40,
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: theme.brand,
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <Link
            to="/"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                backgroundColor: theme.brand,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bed style={{ width: 16, height: 16, color: "#fff" }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16, color: theme.brand }}>
              Lilycrest
            </span>
          </Link>
        </div>

        {/* Backdrop */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              zIndex: 49,
              transition: "opacity 0.2s",
            }}
          />
        )}

        {/* Drawer */}
        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: 280,
            backgroundColor: theme.panel,
            borderRight: `1px solid ${theme.border}`,
            zIndex: 50,
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: `transform ${TRANSITION}`,
            display: "flex",
            flexDirection: "column",
            overflowY: "hidden",
          }}
        >
          {sidebarContent(false)}
        </aside>
      </>
    );
  }

  /* ── DESKTOP: Sticky sidebar ────────────────────────────────────────── */
  return (
    <aside
      style={{
        width: W,
        minWidth: W,
        maxWidth: W,
        backgroundColor: theme.panel,
        borderRight: `1px solid ${theme.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        transition: `width ${TRANSITION}, min-width ${TRANSITION}, max-width ${TRANSITION}`,
        overflow: "visible",
        zIndex: 10,
        alignSelf: "flex-start",
      }}
    >
      {sidebarContent(collapsed)}

      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translate(50%, -50%)",
          width: 38,
          height: 38,
          borderRadius: "999px",
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.panel,
          color: theme.brand,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: `0 4px 14px ${theme.toggleShadow}`,
          zIndex: 20,
        }}
      >
        <ChevronLeft
          style={{
            width: 19,
            height: 19,
            transition: `transform ${TRANSITION}`,
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
    </aside>
  );
};

export default ProfileSidebar;