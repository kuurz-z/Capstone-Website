import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  LayoutDashboard,
  Users,
  FileText,
  DoorOpen,
  Calendar,
  CreditCard,
  Wrench,
  MessageSquare,
  Megaphone,
  BarChart3,
  MessageCircle,
  UserCog,
  Settings,
  Shield,
  Building2,
  Lock,
  Database,
  Sun,
  Moon,
  Sparkles,
  ArrowRight,
  PlusCircle,
  AlertCircle,
  CornerDownLeft,
  LoaderCircle,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useTheme } from "../../public/context/ThemeContext";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { authFetch } from "../../../shared/api/httpClient.js";
import "../styles/admin-command-palette.css";

const BASE_NAV_ITEMS = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    subtext: "Overview of occupancy, revenue, and queue pressure",
    to: "/admin/dashboard",
    icon: LayoutDashboard,
    group: "Navigation",
    keywords: ["home", "main", "stats", "kpi", "overview"],
  },
  {
    id: "nav-tenants",
    label: "Tenants Workspace",
    subtext: "Manage active tenants, room transfers, and move-outs",
    to: "/admin/tenants",
    icon: Users,
    group: "Navigation",
    permission: "manageTenants",
    keywords: ["tenants", "occupants", "move out", "transfer", "profiles"],
  },
  {
    id: "nav-rooms",
    label: "Room Availability",
    subtext: "Inspect bed occupancy, floor maps, and room configs",
    to: "/admin/room-availability",
    icon: DoorOpen,
    group: "Navigation",
    permission: "manageRooms",
    keywords: ["rooms", "beds", "inventory", "occupancy", "floors", "capacity"],
  },
  {
    id: "nav-reservations",
    label: "Reservations",
    subtext: "Review applicant bookings, visits, and approvals",
    to: "/admin/reservations",
    icon: Calendar,
    group: "Navigation",
    permission: "manageReservations",
    keywords: ["reservations", "bookings", "applications", "visits", "applicants"],
  },
  {
    id: "nav-billing",
    label: "Billing & Invoices",
    subtext: "Manage rent, utility charges, and payment verification",
    to: "/admin/billing",
    icon: CreditCard,
    group: "Navigation",
    permission: "manageBilling",
    keywords: ["billing", "rent", "invoices", "payments", "utilities", "electricity", "water"],
  },
  {
    id: "nav-maintenance",
    label: "Maintenance Work Orders",
    subtext: "Track repair tickets, facility requests, and resolutions",
    to: "/admin/maintenance",
    icon: Wrench,
    group: "Navigation",
    permission: "manageMaintenance",
    keywords: ["maintenance", "repairs", "tickets", "issues", "facilities", "plumbing"],
  },
  {
    id: "nav-inquiries",
    label: "Inquiries & Leads",
    subtext: "Review incoming questions from prospective tenants",
    to: "/admin/inquiries",
    icon: MessageSquare,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["inquiries", "questions", "leads", "prospective", "messages"],
  },
  {
    id: "nav-inquiries-reservations",
    label: "Inquiries",
    subtext: "Review applicant inquiries inside the Reservations workspace",
    to: "/admin/reservations?tab=inquiries",
    icon: MessageSquare,
    group: "Navigation",
    permission: "manageReservations",
    branchAdminOnly: true,
    keywords: ["inquiries", "questions", "leads", "prospective", "messages"],
  },
  {
    id: "nav-announcements",
    label: "Announcements",
    subtext: "Publish dormitory updates and notice board posts",
    to: "/admin/announcements",
    icon: Megaphone,
    group: "Navigation",
    permission: "manageAnnouncements",
    keywords: ["announcements", "notices", "broadcasts", "bulletin", "updates"],
  },
  {
    id: "nav-analytics",
    label: "Analytics & Reports",
    subtext: "Occupancy trends, revenue reports, and operations insights",
    to: "/admin/analytics",
    icon: BarChart3,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["analytics", "reports", "insights", "trends", "financials", "revenue"],
  },
  {
    id: "nav-chat",
    label: "Tenant Support Chat",
    subtext: "Live messaging thread with dormitory tenants",
    to: "/admin/chat",
    icon: MessageCircle,
    group: "Navigation",
    keywords: ["chat", "support", "conversations", "messages", "live chat"],
  },
  {
    id: "nav-users",
    label: "User Management",
    subtext: "Manage staff, tenant accounts, and credentials",
    to: "/admin/users",
    icon: UserCog,
    group: "Navigation",
    permission: "manageUsers",
    keywords: ["users", "accounts", "staff", "admins", "profiles"],
  },
  {
    id: "nav-settings",
    label: "Settings & Policies",
    subtext: "Dormitory policies, rules, and global configurations",
    to: "/admin/settings",
    icon: Settings,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["settings", "policies", "rules", "system", "configuration"],
  },
  {
    id: "nav-roles",
    label: "Roles & Permissions",
    subtext: "Configure staff access rights and role definitions",
    to: "/admin/roles",
    icon: Lock,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["roles", "permissions", "access", "privileges", "security"],
  },
  {
    id: "nav-branches",
    label: "Branch Management",
    subtext: "Manage Gil Puyat, Guadalupe, and dormitory locations",
    to: "/admin/branches",
    icon: Building2,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["branches", "locations", "properties", "buildings", "gil puyat", "guadalupe"],
  },
  {
    id: "nav-audit",
    label: "Security Audit Logs",
    subtext: "Review admin action histories and system event trails",
    to: "/admin/audit-logs",
    icon: Shield,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["audit", "logs", "security", "history", "tracking", "events"],
  },
  {
    id: "nav-backups",
    label: "System Backups",
    subtext: "Database snapshots and data recovery management",
    to: "/admin/backups",
    icon: Database,
    group: "Navigation",
    ownerOnly: true,
    keywords: ["backups", "database", "export", "restore", "recovery"],
  },
];

export default function AdminCommandPalette({
  isOpen,
  onClose,
  onOpenAssistant,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { theme, toggleTheme } = useTheme();
  const isOwner = user?.role === "owner" || user?.role === "super_admin";

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveResults, setLiveResults] = useState({ tenants: [], rooms: [], maintenance: [] });
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  const branchDisplayName = useMemo(() => {
    if (isOwner) return "All Branches";
    if (user?.branch === "guadalupe") return "Guadalupe Branch";
    if (user?.branch === "gil-puyat" || user?.branch === "gil_puyat") return "Gil Puyat Branch";
    return "Branch";
  }, [isOwner, user?.branch]);

  // Live entity search with debouncing
  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 1) {
      setLiveResults({ tenants: [], rooms: [], maintenance: [] });
      setIsSearchingLive(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingLive(true);
        const res = await authFetch(`/search/quick?query=${encodeURIComponent(trimmed)}`);
        if (res?.success && res?.data) {
          setLiveResults({
            tenants: res.data.tenants || [],
            rooms: res.data.rooms || [],
            maintenance: res.data.maintenance || [],
          });
        }
      } catch (err) {
        console.warn("Live quick search error:", err?.message);
      } finally {
        setIsSearchingLive(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Filter allowed navigation items by role and permissions
  const allowedNavItems = useMemo(() => {
    return BASE_NAV_ITEMS.filter((item) => {
      if (item.ownerOnly && !isOwner) return false;
      if (item.branchAdminOnly && isOwner) return false;
      if (item.permission && !isOwner && !can(item.permission)) return false;
      return true;
    });
  }, [can, isOwner]);

  // Define Quick Actions with role and permission filtering
  const quickActions = useMemo(() => {
    const actions = [];

    // Operations Assistant
    if (onOpenAssistant) {
      actions.push({
        id: "act-open-assistant",
        label: isOwner ? "Open Executive Operations Assistant" : `Open ${branchDisplayName} Assistant`,
        subtext: isOwner
          ? "Cross-branch standup, revenue insights & policy guidance"
          : "Daily shift briefing, tenant lookups & branch SOP procedures",
        icon: Sparkles,
        group: "Quick Actions",
        keywords: ["assistant", "briefing", "sop", "help", "chat bot", "shift summary", "standup"],
        action: () => onOpenAssistant(),
      });
    }

    // Owner-Only Quick Actions
    if (isOwner) {
      actions.push(
        {
          id: "act-backups",
          label: "System Backups & Recovery",
          subtext: "Create database snapshots or manage automated backup schedule",
          icon: Database,
          group: "Owner Controls",
          keywords: ["backups", "database", "export", "restore", "snapshot"],
          action: () => navigate("/admin/backups"),
        },
        {
          id: "act-audit-logs",
          label: "Security Audit Logs",
          subtext: "Inspect administrator event trails and security history",
          icon: Shield,
          group: "Owner Controls",
          keywords: ["audit", "logs", "security", "history", "admin events"],
          action: () => navigate("/admin/audit-logs"),
        },
        {
          id: "act-manage-branches",
          label: "Branch Properties & Submeters",
          subtext: "Configure Gil Puyat & Guadalupe properties and billing modes",
          icon: Building2,
          group: "Owner Controls",
          keywords: ["branches", "properties", "locations", "submeter", "buildings"],
          action: () => navigate("/admin/branches"),
        },
        {
          id: "act-manage-roles",
          label: "Roles & Staff Permissions",
          subtext: "Customize access rights and permissions for branch administrators",
          icon: Lock,
          group: "Owner Controls",
          keywords: ["roles", "permissions", "staff", "privileges"],
          action: () => navigate("/admin/roles"),
        }
      );
    }

    // Billing Quick Actions (Owner or manageBilling)
    if (isOwner || can("manageBilling")) {
      actions.push(
        {
          id: "act-verify-payments",
          label: "Review Pending Payments",
          subtext: "Verify uploaded reservation and rent payment receipts",
          icon: CreditCard,
          group: "Quick Actions",
          keywords: ["verify", "receipts", "pending payments", "approve payment"],
          action: () => navigate("/admin/billing?tab=reservation-payments"),
        },
        {
          id: "act-overdue",
          label: "Review Overdue Accounts",
          subtext: "View overdue notices and outstanding tenant balances",
          icon: AlertCircle,
          group: "Quick Actions",
          keywords: ["overdue", "late", "penalties", "outstanding", "escalations"],
          action: () => navigate("/admin/billing?tab=overdue-escalations"),
        }
      );
    }

    // Tenant / Lease Actions (Owner or manageTenants)
    if (isOwner || can("manageTenants")) {
      actions.push({
        id: "act-expiring-leases",
        label: "View Expiring Leases (Next 14 Days)",
        subtext: "Filter active tenants whose leases are expiring soon",
        icon: Calendar,
        group: "Quick Actions",
        keywords: ["expiring", "renew", "lease end", "extend"],
        action: () => navigate("/admin/tenants?filter=expiring_soon"),
      });
    }

    // Announcements (Owner or manageAnnouncements)
    if (isOwner || can("manageAnnouncements")) {
      actions.push({
        id: "act-new-announcement",
        label: "Create Announcement",
        subtext: "Publish a new bulletin notice to dormitory tenants",
        icon: Megaphone,
        group: "Quick Actions",
        keywords: ["post announcement", "broadcast", "publish notice"],
        action: () => navigate("/admin/announcements"),
      });
    }

    // Maintenance (Owner or manageMaintenance)
    if (isOwner || can("manageMaintenance")) {
      actions.push({
        id: "act-report-maintenance",
        label: "Log Maintenance Work Order",
        subtext: "Create a new facility repair or inspection ticket",
        icon: Wrench,
        group: "Quick Actions",
        keywords: ["new ticket", "report issue", "repair", "maintenance work order"],
        action: () => navigate("/admin/maintenance"),
      });
    }

    // Preferences
    actions.push({
      id: "act-toggle-theme",
      label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
      subtext: `Toggle visual theme interface to ${theme === "dark" ? "light" : "dark"}`,
      icon: theme === "dark" ? Sun : Moon,
      group: "Preferences",
      keywords: ["theme", "dark mode", "light mode", "color scheme"],
      action: () => toggleTheme(),
    });

    return actions;
  }, [branchDisplayName, can, isOwner, navigate, onOpenAssistant, theme, toggleTheme]);

  // Combine static commands and live entity search results
  const filteredItems = useMemo(() => {
    const rawQuery = query.trim().toLowerCase();

    // Map live results
    const liveTenantItems = (liveResults.tenants || []).map((t) => ({
      ...t,
      icon: Users,
      action: () => navigate(t.to),
    }));

    const liveRoomItems = (liveResults.rooms || []).map((r) => ({
      ...r,
      icon: DoorOpen,
      action: () => navigate(r.to),
    }));

    const liveMaintItems = (liveResults.maintenance || []).map((m) => ({
      ...m,
      icon: Wrench,
      action: () => navigate(m.to),
    }));

    const allStatic = [
      ...quickActions,
      ...allowedNavItems.map((item) => ({
        ...item,
        action: () => navigate(item.to),
      })),
    ];

    if (!rawQuery) {
      return allStatic;
    }

    const filteredStatic = allStatic.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(rawQuery);
      const matchSubtext = item.subtext?.toLowerCase().includes(rawQuery);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(rawQuery));
      return matchLabel || matchSubtext || matchKeywords;
    });

    // Merge live results with static filtered items
    return [
      ...liveTenantItems,
      ...liveRoomItems,
      ...liveMaintItems,
      ...filteredStatic,
    ];
  }, [allowedNavItems, liveResults, navigate, query, quickActions]);

  // Group filtered results
  const groupedResults = useMemo(() => {
    const map = new Map();
    filteredItems.forEach((item) => {
      const group = item.group || "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(item);
    });
    return map;
  }, [filteredItems]);

  // Reset selected index when query changes or modal opens
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setLiveResults({ tenants: [], rooms: [], maintenance: [] });
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const selectedEl = resultsRef.current.querySelector(".cmd-palette-item.is-selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        onClose();
        target.action();
      }
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return createPortal(
    <div
      className="cmd-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Admin Command Palette"
    >
      <div className="cmd-palette-modal" onKeyDown={handleKeyDown}>
        {/* Search Header */}
        <div className="cmd-palette-search-wrap">
          {isSearchingLive ? (
            <LoaderCircle className="cmd-palette-search-icon animate-spin text-[var(--primary)]" aria-hidden="true" />
          ) : (
            <Search className="cmd-palette-search-icon" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder={
              isOwner
                ? "Search all branches, tenants, rooms, tickets, or commands..."
                : `Search ${branchDisplayName} pages, tenants, rooms, or actions...`
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="cmd-palette-results"
          />
          <kbd className="cmd-palette-esc-badge" onClick={onClose} title="Close palette">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div id="cmd-palette-results" className="cmd-palette-results" ref={resultsRef} role="listbox">
          {filteredItems.length === 0 ? (
            <div className="cmd-palette-empty">
              <Search className="cmd-palette-empty-icon" aria-hidden="true" />
              <p className="cmd-palette-empty-title">No matching commands or records</p>
              <p className="cmd-palette-empty-text">
                {isOwner
                  ? "Try searching for a tenant name, room number, ticket, or system command"
                  : `Try searching for ${branchDisplayName} tenants, rooms, billing, or maintenance`}
              </p>
            </div>
          ) : (
            Array.from(groupedResults.entries()).map(([groupName, items]) => (
              <div key={groupName} className="cmd-palette-group" role="group" aria-label={groupName}>
                <div className="cmd-palette-section-title">{groupName}</div>
                {items.map((item) => {
                  const currentIndex = flatIndex;
                  flatIndex += 1;
                  const isSelected = currentIndex === selectedIndex;
                  const Icon = item.icon || ArrowRight;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`cmd-palette-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        onClose();
                        item.action();
                      }}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <div className="cmd-palette-item-left">
                        <Icon className="cmd-palette-item-icon" aria-hidden="true" />
                        <div className="cmd-palette-item-text">
                          <span className="cmd-palette-item-label">{item.label}</span>
                          {item.subtext && (
                            <span className="cmd-palette-item-subtext">{item.subtext}</span>
                          )}
                        </div>
                      </div>
                      <div className="cmd-palette-item-right">
                        {item.branch && isOwner ? (
                          <span className="cmd-palette-tag">{item.branch}</span>
                        ) : (
                          <span className="cmd-palette-tag">{groupName}</span>
                        )}
                        <span className="cmd-palette-enter-hint" aria-hidden="true">
                          <CornerDownLeft size={13} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Keyboard Navigation Footer */}
        <div className="cmd-palette-footer">
          <div className="cmd-palette-shortcuts">
            <div className="cmd-palette-shortcut-item">
              <kbd className="cmd-palette-kbd">↑</kbd>
              <kbd className="cmd-palette-kbd">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="cmd-palette-shortcut-item">
              <kbd className="cmd-palette-kbd">↵</kbd>
              <span>Select</span>
            </div>
            <div className="cmd-palette-shortcut-item">
              <kbd className="cmd-palette-kbd">Esc</kbd>
              <span>Close</span>
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {isOwner ? "Lilycrest Command Center · Multi-Branch" : `Lilycrest Command Center · ${branchDisplayName}`}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
