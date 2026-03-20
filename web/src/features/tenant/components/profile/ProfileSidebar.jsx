import React, { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { showNotification } from "../../../../shared/utils/notification";
import {
  User,
  Bell,
  History,
  Bed,
  LogOut,
  Search,
  LayoutDashboard,
  CreditCard,
  ChevronLeft,
  Settings,
  Camera,
  FileText,
  Home,
  Menu,
  X,
} from "lucide-react";

/* ── Timing ─────────────────────────────────────────────────────────────── */
const TRANSITION = "0.3s cubic-bezier(0.4, 0, 0.2, 1)";
const MOBILE_BP = 768;

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
const NavButton = ({ item, isActive, onClick, collapsed }) => (
  <button
    onClick={onClick}
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
      backgroundColor: isActive ? "var(--surface-card)" : "transparent",
      color: isActive ? "#FF8C42" : "var(--text-body)",
      fontWeight: isActive ? 600 : 500,
      fontSize: 14,
      transition: "background 0.15s, color 0.15s",
      whiteSpace: "nowrap",
      overflow: "hidden",
    }}
    onMouseEnter={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = "var(--surface-hover)";
    }}
    onMouseLeave={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
    }}
  >
    <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
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

/* ── ProfileSidebar ─────────────────────────────────────────────────────── */
const ProfileSidebar = ({
  activeTab,
  setActiveTab,
  profileData,
  fullName,
  hasActiveReservation,
  onLogout,
  onUpdateImage,
}) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );

  /* ── Mobile detection ──────────────────────── */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BP);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth <= MOBILE_BP;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false); // close drawer if resizing to desktop
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
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
      localStorage.setItem("sidebar-collapsed", !prev);
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

  /* ── Sidebar inner content (shared between desktop & mobile drawer) ── */
  const sidebarContent = (showCollapsed) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ── Logo row ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          minHeight: 68,
        }}
      >
        <Link
          to="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}
          title="Lilycrest — Home"
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: "var(--color-primary)",
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
              color: "var(--text-heading)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              opacity: showCollapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
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
          padding: "14px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 12,
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
            flex: 1,
            minWidth: 0,
            opacity: showCollapsed ? 0 : 1,
            transition: `opacity ${TRANSITION}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-heading)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fullName}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profileData.email}
          </p>
        </div>
      </div>

      {/* ── Browse Rooms CTA ─────────────────────────────────────────────── */}
      <div style={{ padding: "12px 8px 4px" }}>
        <Link
          to="/applicant/check-availability"
          title="Browse Rooms"
          onClick={() => isMobile && setDrawerOpen(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-heading)",
            border: "1.5px solid var(--text-heading)",
            borderLeft: "3.5px solid #FF8C42",
            transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
            e.currentTarget.style.backgroundColor = isDark ? "#FF8C42" : "var(--color-primary)";
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.borderColor = isDark ? "#FF8C42" : "var(--color-primary)";
            e.currentTarget.style.boxShadow = isDark
              ? "0 2px 10px rgba(255,140,66,0.3)"
              : "0 2px 8px rgba(10,22,40,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text-heading)";
            e.currentTarget.style.borderColor = "var(--text-heading)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <Search style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span
            style={{
              opacity: showCollapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Browse Rooms
          </span>
        </Link>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav
        style={{
          flex: 1,
          padding: "8px 8px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {/* Section label — fades out */}
            <p
              style={{
                margin: "0 0 4px 4px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                opacity: showCollapsed ? 0 : 1,
                height: showCollapsed ? 0 : 18,
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
                backgroundColor: "var(--border-subtle)",
                margin: showCollapsed ? "4px 6px 8px" : "0 6px",
                opacity: showCollapsed ? 0.8 : 0,
                transition: `opacity ${TRANSITION}, margin ${TRANSITION}`,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  onClick={() => handleNavClick(item.id)}
                  collapsed={showCollapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Sign Out ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 8px 12px", borderTop: "1px solid var(--border-card)" }}>
        <button
          onClick={onLogout}
          title="Sign Out"
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
            transition: "background 0.15s",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FEF2F2"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span
            style={{
              opacity: showCollapsed ? 0 : 1,
              transition: `opacity ${TRANSITION}`,
            }}
          >
            Sign Out
          </span>
        </button>
      </div>

      {/* ── Collapse toggle (desktop only) ─────────────────────────────── */}
      {!isMobile && (
        <div style={{ padding: "8px 8px 12px", borderTop: "1px solid var(--border-card)" }}>
          <button
            onClick={toggleCollapsed}
            title={showCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              color: "var(--text-secondary)",
              fontWeight: 500,
              fontSize: 14,
              transition: `background 0.15s, color 0.15s`,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--surface-muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <ChevronLeft
              style={{
                width: 18,
                height: 18,
                flexShrink: 0,
                transition: `transform ${TRANSITION}`,
                transform: showCollapsed ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
            <span
              style={{
                opacity: showCollapsed ? 0 : 1,
                transition: `opacity ${TRANSITION}`,
              }}
            >
              Collapse
            </span>
          </button>
        </div>
      )}
    </div>
  );

  const W = collapsed ? 64 : 256;

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
            backgroundColor: "var(--surface-sidebar)",
            borderBottom: "1px solid var(--border-subtle)",
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
              color: "var(--text-heading)",
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
                backgroundColor: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bed style={{ width: 16, height: 16, color: "#fff" }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16, color: "var(--text-heading)" }}>
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
            backgroundColor: "var(--surface-sidebar)",
            borderRight: "1px solid var(--border-subtle)",
            zIndex: 50,
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: `transform ${TRANSITION}`,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
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
        backgroundColor: "var(--surface-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        transition: `width ${TRANSITION}, min-width ${TRANSITION}, max-width ${TRANSITION}`,
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {sidebarContent(collapsed)}
    </aside>
  );
};

export default ProfileSidebar;
