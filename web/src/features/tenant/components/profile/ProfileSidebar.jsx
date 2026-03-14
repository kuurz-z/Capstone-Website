import React, { useRef, useState } from "react";
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
  ArrowRight,
  ChevronRight,
  Settings,
  Camera,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Account",
    items: [
      { id: "personal", label: "Personal Details", icon: User },
      { id: "room", label: "Room & Payment", icon: CreditCard, hasBadge: true },
      { id: "history", label: "Activity Log", icon: History },
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

const NavButton = ({ item, isActive, onClick, hasActiveBadge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
    style={{
      backgroundColor: isActive ? "#D4982B" : "transparent",
      color: isActive ? "#fff" : "#4B5563",
      fontWeight: isActive ? 600 : 500,
    }}
    onMouseEnter={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = "#F3F4F6";
    }}
    onMouseLeave={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
    }}
  >
    <item.icon className="w-[18px] h-[18px]" />
    <span>{item.label}</span>
    {hasActiveBadge && !isActive && (
      <span
        className="ml-auto w-2 h-2 rounded-full"
        style={{ backgroundColor: "#10B981" }}
      />
    )}
    {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-60" />}
  </button>
);

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

  return (
  <aside
    className="w-64 bg-white border-r flex flex-col"
    style={{
      borderColor: "#E8EBF0",
      minHeight: "100vh",
      position: "sticky",
      top: 0,
    }}
  >
    {/* Logo → Home */}
    <div className="p-5 border-b" style={{ borderColor: "#E8EBF0" }}>
      <Link
        to="/"
        className="flex items-center gap-3 group"
        style={{ textDecoration: "none" }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
          style={{ backgroundColor: "#183153" }}
        >
          <Bed className="w-5 h-5 text-white" />
        </div>
        <span
          className="font-semibold text-lg"
          style={{ color: "#183153", letterSpacing: "-0.01em" }}
        >
          Lilycrest
        </span>
      </Link>
    </div>

    {/* User Card */}
    <div className="px-5 py-4 border-b" style={{ borderColor: "#E8EBF0" }}>
      <div className="flex items-center gap-3">
        {/* Avatar with upload overlay */}
        <div
          onClick={handleAvatarClick}
          style={{
            position: "relative",
            width: 40,
            height: 40,
            borderRadius: "50%",
            cursor: onUpdateImage ? "pointer" : "default",
            flexShrink: 0,
            overflow: "hidden",
          }}
          title={onUpdateImage ? "Click to change photo" : undefined}
        >
          {profileData.profileImage ? (
            <img
              src={profileData.profileImage}
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #D4982B 0%, #D35400 100%)",
                boxShadow: "0 2px 6px rgba(212,152,43,0.25)",
                width: "100%",
                height: "100%",
              }}
            >
              {(profileData.firstName?.[0] || "").toUpperCase()}
              {(profileData.lastName?.[0] || "").toUpperCase()}
            </div>
          )}
          {/* Camera overlay (shown on hover) */}
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
              {uploading ? (
                <span style={{ color: "#fff", fontSize: 10 }}>...</span>
              ) : (
                <Camera className="w-4 h-4" style={{ color: "#fff" }} />
              )}
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
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "#1F2937", margin: 0 }}
          >
            {fullName}
          </p>
          <p
            className="text-xs truncate"
            style={{ color: "#94A3B8", margin: "2px 0 0" }}
          >
            {profileData.email}
          </p>
        </div>
      </div>
    </div>

    {/* Browse Rooms CTA */}
    <div className="px-4 pt-4 pb-2">
      <Link
        to="/applicant/check-availability"
        className="flex items-center gap-2.5 w-full py-2.5 px-3.5 rounded-lg text-sm font-semibold transition-all duration-200"
        style={{
          backgroundColor: "transparent",
          color: "#183153",
          textDecoration: "none",
          border: "1.5px solid #183153",
          borderLeft: "3.5px solid #D4982B",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#183153";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(24,49,83,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "#183153";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <Search className="w-4 h-4" />
        Browse Rooms
        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60" />
      </Link>
    </div>

    {/* Navigation */}
    <nav className="flex-1 px-4 py-3 space-y-5 overflow-y-auto">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2 px-3"
            style={{ color: "#94A3B8" }}
          >
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
                hasActiveBadge={item.hasBadge && hasActiveReservation}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>

    {/* Sign Out */}
    <div className="px-4 py-3 border-t" style={{ borderColor: "#E8EBF0" }}>
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
        style={{ color: "#EF4444", fontWeight: 500 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#FEF2F2";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <LogOut className="w-[18px] h-[18px]" />
        <span>Sign Out</span>
      </button>
    </div>
  </aside>
  );
};

export default ProfileSidebar;
