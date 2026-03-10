import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Bed,
  Search,
  SlidersHorizontal,
  User,
  ChevronDown,
  LogOut,
} from "lucide-react";

/**
 * Header with logo, search bar, filter toggle, and user menu dropdown.
 */
const AvailabilityHeader = ({
  user,
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,
  onLogout,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const userInitials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() ||
      (user.email || "?")[0].toUpperCase()
    : "?";
  const userDisplayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      "User"
    : "Guest";

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target))
        setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const roleBadge = (role) => {
    const map = {
      superAdmin: { bg: "#FEF3C7", color: "#92400E", label: "Super Admin" },
      admin: { bg: "#DBEAFE", color: "#1E40AF", label: "Admin" },
      tenant: { bg: "#E0E7FF", color: "#3730A3", label: "Tenant" },
    };
    const cfg = map[role] || {
      bg: "#ECFDF5",
      color: "#065F46",
      label: "Applicant",
    };
    return (
      <span
        className="shrink-0 px-1.5 py-px text-[9px] font-semibold rounded uppercase tracking-wide"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        {cfg.label}
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#0C375F" }}
            >
              <Bed className="w-6 h-6 text-white" />
            </div>
            <span
              className="text-xl font-semibold"
              style={{ color: "#0C375F" }}
            >
              Lilycrest
            </span>
          </Link>

          {/* Desktop search + filter */}
          <div className="hidden md:flex items-center gap-4 flex-1 max-w-2xl mx-8">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search rooms, locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-5 py-3 rounded-full border border-gray-300 hover:border-gray-400 transition-colors"
            >
              <SlidersHorizontal className="w-5 h-5" />
              <span className="text-sm font-medium">Filters</span>
            </button>
          </div>

          {/* User menu / Sign In */}
          <div className="flex items-center gap-4">
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full transition-all duration-200"
                  style={{
                    width: "260px",
                    border: showUserMenu
                      ? "1.5px solid #E7710F"
                      : "1.5px solid transparent",
                    backgroundColor: showUserMenu ? "#FFF7ED" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                      e.currentTarget.style.borderColor = "#E5E7EB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }
                  }}
                  aria-label="User menu"
                  aria-expanded={showUserMenu}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #E7710F 0%, #D35400 100%)",
                      boxShadow: "0 1px 3px rgba(231, 113, 15, 0.3)",
                    }}
                  >
                    {userInitials}
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate leading-tight text-left">
                    {userDisplayName}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
                  />
                </button>

                {showUserMenu && (
                  <div
                    className="absolute right-0 mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
                    style={{
                      animation: "fadeIn 0.18s ease-out",
                      boxShadow:
                        "0 10px 40px -8px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)",
                    }}
                  >
                    {/* User identity */}
                    <div
                      className="px-3 pt-3 pb-2.5"
                      style={{
                        background:
                          "linear-gradient(180deg, #FAFBFC 0%, #FFFFFF 100%)",
                        borderBottom: "1px solid #F3F4F6",
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{
                            background:
                              "linear-gradient(135deg, #E7710F 0%, #D35400 100%)",
                            boxShadow: "0 2px 6px rgba(231, 113, 15, 0.25)",
                          }}
                        >
                          {userInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p
                              className="text-[13px] font-semibold truncate leading-none"
                              style={{ color: "#1A1A2E" }}
                            >
                              {userDisplayName}
                            </p>
                            {roleBadge(user?.role)}
                          </div>
                          <p
                            className="text-[11px] truncate mt-1 leading-none"
                            style={{ color: "#9CA3AF" }}
                          >
                            {user?.email || ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Nav links */}
                    <div className="py-1.5 px-2">
                      <Link
                        to="/applicant/profile"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
                        style={{ color: "#374151" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#F9FAFB";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => setShowUserMenu(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#F3F4F6" }}
                        >
                          <User
                            className="w-4 h-4"
                            style={{ color: "#6B7280" }}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">
                            My Profile
                          </p>
                          <p
                            className="text-[11px] leading-tight mt-0.5"
                            style={{ color: "#9CA3AF" }}
                          >
                            View your dashboard
                          </p>
                        </div>
                      </Link>
                    </div>
                    {/* Sign Out */}
                    <div
                      className="px-2 pb-2 pt-1"
                      style={{ borderTop: "1px solid #F3F4F6" }}
                    >
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
                        style={{ color: "#EF4444" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#FEF2F2";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#FEF2F2" }}
                        >
                          <LogOut
                            className="w-4 h-4"
                            style={{ color: "#EF4444" }}
                          />
                        </div>
                        <p className="font-medium text-sm leading-tight">
                          Sign Out
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/signin"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-300 hover:border-gray-400 transition-colors text-sm font-medium"
                style={{ color: "#0C375F" }}
              >
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile search */}
        <div className="md:hidden pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 focus:border-gray-400 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default AvailabilityHeader;
