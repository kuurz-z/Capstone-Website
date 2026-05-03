import React from "react";
import { Link } from "react-router-dom";
import { Bed, History, LayoutDashboard, LogOut, User } from "lucide-react";

const ProfileSidebar = ({
  activeTab,
  setActiveTab,
  fullName,
  email,
  handleLogout,
}) => (
  <aside
    className="w-64 bg-white border-r flex flex-col h-screen sticky top-0 self-start overflow-y-auto"
    style={{ borderColor: "var(--border-card, #E8EBF0)" }}
  >
    <div className="p-6 border-b" style={{ borderColor: "var(--border-card, #E8EBF0)" }}>
      <Link to="/applicant/check-availability" className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#0A1628" }}
        >
          <Bed className="w-5 h-5 text-white" />
        </div>
        <span className="font-semibold text-lg" style={{ color: "var(--text-heading, #0A1628)" }}>
          Lilycrest
        </span>
      </Link>
    </div>

    <div className="p-4 border-b" style={{ borderColor: "var(--border-card, #E8EBF0)" }}>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#0A1628" }}
        >
          <User className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-heading, #1F2937)" }}
          >
            {fullName}
          </p>
          <p className="text-xs text-gray-500 truncate">{email}</p>
        </div>
      </div>
    </div>

    <nav className="flex-1 p-4 space-y-6">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">
          Menu
        </p>
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === "dashboard"
                ? "text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            style={
              activeTab === "dashboard" ? { backgroundColor: "#FF8C42" } : {}
            }
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <Link
            to="/applicant/check-availability"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Bed className="w-5 h-5" />
            <span>Browse Rooms</span>
          </Link>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">
          Account
        </p>
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab("personal")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === "personal"
                ? "text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            style={
              activeTab === "personal" ? { backgroundColor: "#FF8C42" } : {}
            }
          >
            <User className="w-5 h-5" />
            <span>Personal Details</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === "history"
                ? "text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            style={
              activeTab === "history" ? { backgroundColor: "#FF8C42" } : {}
            }
          >
            <History className="w-5 h-5" />
            <span>Activity Log</span>
          </button>
        </div>
      </div>
    </nav>

    <div className="p-4 border-t" style={{ borderColor: "var(--border-card, #E8EBF0)" }}>
      <Link
        to="/signin"
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        <span>Sign Out</span>
      </Link>
    </div>
  </aside>
);

export default ProfileSidebar;
