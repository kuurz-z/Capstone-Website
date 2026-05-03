import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  User,
  ChevronDown,
  LogOut,
} from "lucide-react";
import logo from "../../../../assets/images/LOGO.svg";

/**
 * Redesigned header — single row: Logo | Filter Bar | Sign In
 * Price slider uses local state to prevent jitter.
 */
const AvailabilityHeader = ({
  user,
  searchQuery,
  setSearchQuery,
  selectedBranch,
  onBranchFilter,
  selectedRoomType,
  onRoomTypeFilter,
  availableRoomTypes,
  maxPrice,
  setMaxPrice,
  onClearAll,
  onLogout,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // Local slider state — only commits to parent on release (prevents jitter)
  const [localPrice, setLocalPrice] = useState(maxPrice);
  useEffect(() => { setLocalPrice(maxPrice); }, [maxPrice]);

  const handleSliderChange = (e) => setLocalPrice(Number(e.target.value));
  const handleSliderCommit = () => setMaxPrice(localPrice);

  const priceLabel =
    localPrice >= 15000
      ? "Any Price"
      : `Up to ₱${localPrice.toLocaleString()}`;

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
      owner: { bg: "#FEF3C7", color: "#92400E", label: "Owner" },
      branch_admin: { bg: "#DBEAFE", color: "#1E40AF", label: "Branch Admin" },
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

  const hasActiveFilters =
    selectedBranch !== "All" ||
    selectedRoomType !== "All" ||
    maxPrice !== 15000 ||
    searchQuery.trim() !== "";

  return (
    <header className="sticky top-0 z-50" style={{ backgroundColor: "var(--surface-card)", borderBottom: "1px solid var(--border-divider)" }}>
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Single row: Logo | Filter Bar | Sign In */}
        <div className="ca-header-row">
          {/* Logo */}
          <Link
            to="/"
            className="ca-logo"
          >
            <img
              src={logo}
              alt="Lilycrest logo"
              className="w-8 h- object-contain"
            />
            <span
              className="text-lg font-semibold"
              style={{ color: "var(--text-heading)" }}
            >
              Lilycrest
            </span>
          </Link>

          {/* Unified Filter Bar */}
          <div className="ca-filter-bar">
            {/* Search */}
            <div className="ca-search-wrap">
              <Search className="ca-search-icon" />
              <input
                type="text"
                placeholder="Search rooms, locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ca-search-input"
              />
            </div>

            {/* Branch dropdown */}
            <select
              className="ca-filter-select"
              value={selectedBranch}
              onChange={(e) => onBranchFilter(e.target.value)}
            >
              <option value="All">All Branches</option>
              <option value="Gil Puyat">Gil Puyat</option>
              <option value="Guadalupe">Guadalupe</option>
            </select>

            {/* Room Type dropdown */}
            <select
              className="ca-filter-select"
              value={selectedRoomType}
              onChange={(e) => onRoomTypeFilter(e.target.value)}
            >
              {availableRoomTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "All" ? "All Types" : type}
                </option>
              ))}
            </select>

            {/* Price range slider — local state, commits on release */}
            <div className="ca-price-slider-wrap">
              <span className="ca-price-label">{priceLabel}</span>
              <input
                type="range"
                className="ca-price-slider"
                min={3000}
                max={15000}
                step={500}
                value={localPrice}
                onChange={handleSliderChange}
                onMouseUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
              />
            </div>

            {/* Clear — always rendered to prevent layout shift */}
            <button
              className="ca-clear-btn"
              onClick={onClearAll}
              style={{ visibility: hasActiveFilters ? "visible" : "hidden" }}
            >
              Clear
            </button>
          </div>

          {/* User menu / Sign In */}
          <div className="ca-header-user">
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full transition-all duration-200"
                  style={{
                    width: "260px",
                    border: showUserMenu
                      ? "1.5px solid var(--color-accent)"
                      : "1.5px solid var(--border-card, transparent)",
                    backgroundColor: showUserMenu ? "rgba(212,175,55,0.14)" : "var(--surface-card)",
                    boxShadow: showUserMenu ? "none" : "0 1px 4px rgba(0,0,0,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                      e.currentTarget.style.borderColor = "var(--border-card)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "var(--surface-card)";
                      e.currentTarget.style.borderColor = "var(--border-card, transparent)";
                    }
                  }}
                  aria-label="User menu"
                  aria-expanded={showUserMenu}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #D4AF37 0%, #B88A1A 100%)",
                      boxShadow: "0 1px 3px rgba(212, 175, 55, 0.34)",
                    }}
                  >
                    {userInitials}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate leading-tight text-left" style={{ color: "var(--text-heading)" }}>
                    {userDisplayName}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
                  />
                </button>

                {showUserMenu && (
                  <div
                    className="absolute right-0 mt-1.5 w-full rounded-2xl shadow-xl z-50 overflow-hidden"
                    style={{
                      backgroundColor: "var(--surface-elevated)",
                      border: "1px solid var(--border-card)",
                      animation: "fadeIn 0.18s ease-out",
                      boxShadow: "0 10px 40px -8px rgba(0,0,0,0.3), 0 4px 12px -2px rgba(0,0,0,0.2)",
                    }}
                  >
                    {/* User identity */}
                    <div
                      className="px-3 pt-3 pb-3.5"
                      style={{
                        background: "var(--surface-muted)",
                        borderBottom: "1px solid var(--border-divider)",
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{
                            background:
                              "linear-gradient(135deg, #D4AF37 0%, #B88A1A 100%)",
                            boxShadow: "0 2px 6px rgba(212, 175, 55, 0.3)",
                          }}
                        >
                          {userInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p
                              className="text-[13px] font-semibold truncate leading-none"
                              style={{ color: "var(--text-heading)" }}
                            >
                              {userDisplayName}
                            </p>
                            {roleBadge(user?.role)}
                          </div>
                          <p
                            className="text-[11px] truncate mt-1.5 leading-tight"
                            style={{ color: "var(--text-muted)" }}
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
                        style={{ color: "var(--text-body)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(148, 163, 184, 0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => setShowUserMenu(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "var(--surface-muted)" }}
                        >
                          <User
                            className="w-4 h-4"
                            style={{ color: "var(--text-secondary)" }}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">
                            My Profile
                          </p>
                          <p
                            className="text-[11px] leading-tight mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            View your dashboard
                          </p>
                        </div>
                      </Link>
                    </div>
                    {/* Sign Out */}
                    <div
                      className="px-2 pb-2 pt-1"
                      style={{ borderTop: "1px solid var(--border-divider)" }}
                    >
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
                        style={{ color: "#EF4444" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
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
                style={{ color: "var(--text-heading)" }}
              >
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AvailabilityHeader;
