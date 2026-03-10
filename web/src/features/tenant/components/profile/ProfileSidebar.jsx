import React from "react";
import { Link } from "react-router-dom";
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
    items: [{ id: "notifications", label: "Notifications", icon: Bell }],
  },
];

const NavButton = ({ item, isActive, onClick, hasActiveBadge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
    style={{
      backgroundColor: isActive ? "#E7710F" : "transparent",
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
}) => (
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
          style={{ backgroundColor: "#0C375F" }}
        >
          <Bed className="w-5 h-5 text-white" />
        </div>
        <span
          className="font-semibold text-lg"
          style={{ color: "#0C375F", letterSpacing: "-0.01em" }}
        >
          Lilycrest
        </span>
      </Link>
    </div>

    {/* User Card */}
    <div className="px-5 py-4 border-b" style={{ borderColor: "#E8EBF0" }}>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{
            background: "linear-gradient(135deg, #E7710F 0%, #D35400 100%)",
            boxShadow: "0 2px 6px rgba(231,113,15,0.25)",
          }}
        >
          {(profileData.firstName?.[0] || "").toUpperCase()}
          {(profileData.lastName?.[0] || "").toUpperCase()}
        </div>
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
        to="/tenant/check-availability"
        className="flex items-center gap-2.5 w-full py-2.5 px-3.5 rounded-lg text-sm font-semibold transition-all duration-200"
        style={{
          backgroundColor: "transparent",
          color: "#0C375F",
          textDecoration: "none",
          border: "1.5px solid #0C375F",
          borderLeft: "3.5px solid #E7710F",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#0C375F";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(12,55,95,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "#0C375F";
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

export default ProfileSidebar;
