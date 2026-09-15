import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  Wrench,
  Receipt,
  MessageSquareText,
  CalendarCheck,
  ShieldAlert,
  Info,
  Loader2,
  Inbox,
  Search,
  X as XIcon,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useUnreadCount,
} from "../../../shared/hooks/queries/useNotifications";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  OWNER_BRANCH_FILTER_OPTIONS,
  BRANCH_DISPLAY_NAMES,
} from "../../../shared/utils/constants";
import SummaryBar from "../components/shared/SummaryBar";
import { AdminTablePageSkeleton } from "../components/AdminContentSkeletons";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import {
  cleanNotificationMessage,
  formatNotificationTitle,
} from "../../../shared/utils/notification";
import "../styles/design-tokens.css";
import "../styles/admin-notifications.css";

// ── Notification Type & Category Metadata ─────────────────────────────────────

const TYPE_META = {
  sla_breach: {
    label: "Turnaround Delay",
    icon: AlertTriangle,
    priority: "critical",
    variant: "critical",
    actionLabel: "View Ticket",
    category: "maintenance",
    isPrimaryAction: true,
  },
  account_suspended: {
    label: "Account Suspended",
    icon: ShieldAlert,
    priority: "critical",
    variant: "critical",
    actionLabel: "View Account",
    category: "general",
    isPrimaryAction: true,
  },
  reservation_cancellation_requested: {
    label: "Cancellation Request",
    icon: AlertTriangle,
    priority: "critical",
    variant: "critical",
    actionLabel: "Review Request",
    category: "cancellations",
    isPrimaryAction: true,
  },
  grace_period_warning: {
    label: "Grace Period",
    icon: AlertTriangle,
    priority: "high",
    variant: "warning",
    actionLabel: "View Reservation",
    category: "reservations",
    isPrimaryAction: true,
  },
  maintenance_update: {
    label: "Maintenance",
    icon: Wrench,
    priority: "high",
    variant: "info",
    actionLabel: "View Maintenance",
    category: "maintenance",
    isPrimaryAction: false,
  },
  maintenance_new: {
    label: "Maintenance Request",
    icon: Wrench,
    priority: "high",
    variant: "warning",
    actionLabel: "Review Request",
    category: "maintenance",
    isPrimaryAction: true,
  },
  penalty_applied: {
    label: "Penalty Applied",
    icon: Receipt,
    priority: "high",
    variant: "warning",
    actionLabel: "View Billing",
    category: "billing",
    isPrimaryAction: true,
  },
  chat_unresponded: {
    label: "Unread Chat",
    icon: MessageSquareText,
    priority: "high",
    variant: "warning",
    actionLabel: "Open Chat",
    category: "chat",
    isPrimaryAction: true,
  },
  inquiry_new: {
    label: "New Inquiry",
    icon: MessageSquareText,
    priority: "high",
    variant: "info",
    actionLabel: "Review Inquiry",
    category: "chat",
    isPrimaryAction: true,
  },
  payment_proof_submitted: {
    label: "Payment Proof",
    icon: Receipt,
    priority: "high",
    variant: "warning",
    actionLabel: "Verify Proof",
    category: "billing",
    isPrimaryAction: true,
  },
  payment_rejected: {
    label: "Payment Rejected",
    icon: Receipt,
    priority: "high",
    variant: "critical",
    actionLabel: "View Billing",
    category: "billing",
    isPrimaryAction: true,
  },
  application_submitted: {
    label: "New Application",
    icon: CalendarCheck,
    priority: "high",
    variant: "info",
    actionLabel: "Review Application",
    category: "reservations",
    isPrimaryAction: true,
  },
  contract_incomplete: {
    label: "Contract Incomplete",
    icon: AlertTriangle,
    priority: "high",
    variant: "warning",
    actionLabel: "Review Contract",
    category: "reservations",
    isPrimaryAction: true,
  },
  contract_error: {
    label: "Contract Error",
    icon: AlertTriangle,
    priority: "high",
    variant: "critical",
    actionLabel: "Fix Contract",
    category: "reservations",
    isPrimaryAction: true,
  },
  reservation_noshow: {
    label: "No-Show Recorded",
    icon: CalendarCheck,
    priority: "high",
    variant: "critical",
    actionLabel: "View Reservation",
    category: "reservations",
    isPrimaryAction: true,
  },
  bill_due_reminder: {
    label: "Due Reminder",
    icon: Receipt,
    priority: "medium",
    variant: "warning",
    actionLabel: "View Bill",
    category: "billing",
    isPrimaryAction: false,
  },
  bill_generated: {
    label: "Bill Generated",
    icon: Receipt,
    priority: "medium",
    variant: "info",
    actionLabel: "View Bill",
    category: "billing",
    isPrimaryAction: false,
  },
  contract_signed: {
    label: "Contract Signed",
    icon: CalendarCheck,
    priority: "medium",
    variant: "success",
    actionLabel: "View Contract",
    category: "reservations",
    isPrimaryAction: false,
  },
  contract_expiring: {
    label: "Contract Expiring",
    icon: CalendarCheck,
    priority: "medium",
    variant: "warning",
    actionLabel: "View Tenant",
    category: "reservations",
    isPrimaryAction: false,
  },
  contract_prepared: {
    label: "Contract Prepared",
    icon: CalendarCheck,
    priority: "medium",
    variant: "info",
    actionLabel: "View Contract",
    category: "reservations",
    isPrimaryAction: false,
  },
  reservation_cancelled: {
    label: "Reservation Cancelled",
    icon: CalendarCheck,
    priority: "medium",
    variant: "neutral",
    actionLabel: "View Reservation",
    category: "cancellations",
    isPrimaryAction: false,
  },
  reservation_cancellation_rejected: {
    label: "Cancellation Rejected",
    icon: CalendarCheck,
    priority: "medium",
    variant: "neutral",
    actionLabel: "View Reservation",
    category: "cancellations",
    isPrimaryAction: false,
  },
  reservation_expired: {
    label: "Reservation Expired",
    icon: CalendarCheck,
    priority: "medium",
    variant: "neutral",
    actionLabel: "View Reservation",
    category: "reservations",
    isPrimaryAction: false,
  },
  visit_requested: {
    label: "Visit Request",
    icon: CalendarCheck,
    priority: "medium",
    variant: "info",
    actionLabel: "Review Visit",
    category: "reservations",
    isPrimaryAction: true,
  },
  visit_scheduled: {
    label: "Visit Request",
    icon: CalendarCheck,
    priority: "medium",
    variant: "info",
    actionLabel: "Review Visit",
    category: "reservations",
    isPrimaryAction: true,
  },
  visit_rejected: {
    label: "Visit Rejected",
    icon: CalendarCheck,
    priority: "medium",
    variant: "neutral",
    actionLabel: "View Visit",
    category: "reservations",
    isPrimaryAction: false,
  },
  payment_approved: {
    label: "Payment Confirmed",
    icon: Receipt,
    priority: "low",
    variant: "success",
    actionLabel: "View Billing",
    category: "billing",
    isPrimaryAction: false,
  },
  payment_confirmed: {
    label: "Payment Confirmed",
    icon: Receipt,
    priority: "low",
    variant: "success",
    actionLabel: "View Billing",
    category: "billing",
    isPrimaryAction: false,
  },
  reservation_confirmed: {
    label: "Reservation Confirmed",
    icon: CalendarCheck,
    priority: "low",
    variant: "success",
    actionLabel: "View Reservation",
    category: "reservations",
    isPrimaryAction: false,
  },
  visit_approved: {
    label: "Visit Approved",
    icon: CalendarCheck,
    priority: "low",
    variant: "success",
    actionLabel: "View Visit",
    category: "reservations",
    isPrimaryAction: false,
  },
  account_reactivated: {
    label: "Account Reactivated",
    icon: ShieldAlert,
    priority: "low",
    variant: "success",
    actionLabel: "View Account",
    category: "general",
    isPrimaryAction: false,
  },
  general: {
    label: "General Notice",
    icon: Info,
    priority: "low",
    variant: "neutral",
    actionLabel: "View Details",
    category: "general",
    isPrimaryAction: false,
  },
};

const CATEGORY_TABS = [
  { key: "all", label: "All" },
  { key: "cancellations", label: "Cancellations" },
  { key: "reservations", label: "Reservations" },
  { key: "maintenance", label: "Maintenance" },
  { key: "billing", label: "Billing" },
  { key: "chat", label: "Chat & Inquiries" },
  { key: "general", label: "General" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical Priority" },
  { value: "high", label: "High Priority" },
  { value: "medium", label: "Medium / Routine" },
  { value: "low", label: "Informational" },
];

const ACTION_URLS = {
  sla_breach: "/admin/maintenance?quickFilter=delayed",
  maintenance_update: "/admin/maintenance",
  maintenance_new: "/admin/maintenance",
  chat_unresponded: "/admin/chat",
  inquiry_new: "/admin/reservations?tab=inquiries",
  bill_generated: "/admin/billing",
  bill_due_reminder: "/admin/billing",
  penalty_applied: "/admin/billing",
  payment_approved: "/admin/billing",
  payment_confirmed: "/admin/billing",
  payment_rejected: "/admin/billing",
  payment_proof_submitted: "/admin/billing",
  application_submitted: "/admin/reservations",
  contract_signed: "/admin/tenants",
  contract_prepared: "/admin/tenants",
  contract_incomplete: "/admin/tenants",
  contract_error: "/admin/tenants",
  visit_requested: "/admin/reservations?tab=visits",
  visit_scheduled: "/admin/reservations?tab=visits",
  reservation_confirmed: "/admin/reservations",
  reservation_cancelled: "/admin/reservations",
  reservation_cancellation_requested: "/admin/reservations",
  reservation_cancellation_rejected: "/admin/reservations",
  reservation_expired: "/admin/reservations",
  reservation_noshow: "/admin/reservations",
  visit_approved: "/admin/reservations",
  visit_rejected: "/admin/reservations",
  contract_expiring: "/admin/tenants",
  grace_period_warning: "/admin/reservations",
  account_suspended: "/admin/users",
  account_reactivated: "/admin/users",
};

function getMeta(type) {
  return (
    TYPE_META[type] || {
      label: "System Alert",
      icon: Bell,
      priority: "low",
      variant: "neutral",
      actionLabel: "View Details",
      category: "general",
      isPrimaryAction: false,
    }
  );
}

function getActionUrl(notification) {
  if (
    notification.type === "reservation_cancellation_requested" &&
    notification.entityId
  ) {
    return `/admin/reservations?reservationId=${encodeURIComponent(
      notification.entityId
    )}&focus=cancellation`;
  }
  if (
    (notification.type === "visit_requested" || notification.type === "visit_scheduled") &&
    notification.entityId
  ) {
    return `/admin/reservations?reservationId=${encodeURIComponent(
      notification.entityId
    )}&tab=visits`;
  }
  if (
    notification.type === "contract_prepared" ||
    notification.type === "contract_incomplete" ||
    notification.type === "contract_signed" ||
    notification.type === "contract_error" ||
    notification.type === "contract_expiring" ||
    notification.entityType === "contract"
  ) {
    if (notification.actionUrl && notification.actionUrl.startsWith("/admin/tenants")) {
      return notification.actionUrl;
    }
    if (notification.reservationId) {
      return `/admin/tenants?reservationId=${encodeURIComponent(notification.reservationId)}`;
    }
    return "/admin/tenants";
  }
  const rawUrl = notification.actionUrl;
  if (rawUrl && rawUrl.startsWith("/admin/")) {
    return rawUrl === "/admin/contracts" ? "/admin/tenants" : rawUrl;
  }
  return notification.actionUrl || ACTION_URLS[notification.type] || null;
}

function resolveNotificationBranch(notification = {}) {
  if (notification.branch) return String(notification.branch).toLowerCase().trim();
  const url = String(notification.actionUrl || "").toLowerCase();
  if (url.includes("branch=gil-puyat") || url.includes("/gil-puyat")) return "gil-puyat";
  if (url.includes("branch=guadalupe") || url.includes("/guadalupe")) return "guadalupe";

  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();
  if (text.includes("gil puyat") || text.includes("gil-puyat")) return "gil-puyat";
  if (text.includes("guadalupe")) return "guadalupe";

  return "";
}

function fmtRelative(dateValue) {
  if (!dateValue) return "";
  const diff = Date.now() - new Date(dateValue).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateValue).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function fmtFullDateTime(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  return d.toLocaleString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminNotificationsPage() {
  const navigate = useNavigate();
  const { user, isOwner } = useAuth();
  const isOwnerUser = Boolean(isOwner && isOwner());
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useNotifications(page, { unreadOnly });
  const { data: countData } = useUnreadCount();
  const markAsReadMutation = useMarkAsRead();
  const markAllMutation = useMarkAllAsRead();

  const notifications = useMemo(
    () => data?.notifications || [],
    [data?.notifications]
  );
  const totalPages = data?.pagination?.totalPages || 1;
  const totalNotifications = data?.pagination?.total || notifications.length;
  const unreadCount = countData?.unreadCount ?? 0;

  // Compute category counts for tab badges
  const categoryCounts = useMemo(() => {
    const counts = { all: notifications.length };
    CATEGORY_TABS.forEach((tab) => {
      if (tab.key !== "all") counts[tab.key] = 0;
    });

    notifications.forEach((n) => {
      const meta = getMeta(n.type);
      const cat = meta.category || "general";
      if (counts[cat] !== undefined) {
        counts[cat] += 1;
      }
    });
    return counts;
  }, [notifications]);

  // Compute KPI metrics for top SummaryBar
  const kpiMetrics = useMemo(() => {
    const criticalOrHighCount = notifications.filter((n) => {
      const p = getMeta(n.type).priority;
      return p === "critical" || p === "high";
    }).length;

    const opsCount = notifications.filter((n) => {
      const cat = getMeta(n.type).category;
      return ["maintenance", "billing", "reservations", "chat"].includes(cat);
    }).length;

    return {
      total: totalNotifications,
      unread: unreadCount,
      actionRequired: criticalOrHighCount,
      operations: opsCount,
    };
  }, [notifications, totalNotifications, unreadCount]);


  // Filtered notifications list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const meta = getMeta(n.type);

      // Branch filter (Dorm Owner can select; Branch Admin is scoped by server)
      if (isOwnerUser && branchFilter !== "all") {
        const notifBranch = resolveNotificationBranch(n);
        if (notifBranch && notifBranch !== branchFilter) {
          return false;
        }
      }

      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const titleMatch = (n.title || "").toLowerCase().includes(query);
        const msgMatch = (n.message || "").toLowerCase().includes(query);
        const idMatch = (n.entityId || "").toLowerCase().includes(query);
        const labelMatch = (meta.label || "").toLowerCase().includes(query);
        if (!titleMatch && !msgMatch && !idMatch && !labelMatch) return false;
      }

      // Category filter
      if (categoryFilter !== "all") {
        if (categoryFilter === "cancellations") {
          if (
            ![
              "reservation_cancellation_requested",
              "reservation_cancellation_rejected",
              "reservation_cancelled",
            ].includes(n.type)
          ) {
            return false;
          }
        } else if (categoryFilter === "billing") {
          if (
            ![
              "bill_generated",
              "bill_due_reminder",
              "penalty_applied",
              "payment_approved",
              "payment_confirmed",
              "payment_rejected",
              "payment_proof_submitted",
            ].includes(n.type)
          ) {
            return false;
          }
        } else if (categoryFilter === "maintenance") {
          if (
            ![
              "maintenance_update",
              "maintenance_new",
              "sla_breach",
            ].includes(n.type)
          ) {
            return false;
          }
        } else if (categoryFilter === "chat") {
          if (!["chat_unresponded", "inquiry_new"].includes(n.type)) {
            return false;
          }
        } else if (categoryFilter === "reservations") {
          if (
            ![
              "reservation_confirmed",
              "reservation_expired",
              "reservation_noshow",
              "application_submitted",
              "contract_signed",
              "contract_expiring",
              "contract_prepared",
              "contract_incomplete",
              "contract_error",
              "visit_requested",
              "visit_scheduled",
              "visit_approved",
              "visit_rejected",
              "grace_period_warning",
            ].includes(n.type)
          ) {
            return false;
          }
        } else if (categoryFilter === "general") {
          if (
            !["account_suspended", "account_reactivated", "general"].includes(
              n.type
            )
          ) {
            return false;
          }
        }
      }

      // Priority filter
      if (priorityFilter !== "all") {
        if (meta.priority !== priorityFilter) return false;
      }

      return true;
    });
  }, [notifications, searchTerm, categoryFilter, priorityFilter, branchFilter, isOwnerUser]);

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(String(notification._id || notification.id));
    }
    const url = getActionUrl(notification);
    if (url) navigate(url);
  };

  const handleSingleMarkRead = (e, notification) => {
    e.stopPropagation();
    if (!notification.isRead) {
      markAsReadMutation.mutate(String(notification._id || notification.id));
    }
  };

  const handleMarkAllRead = () => {
    markAllMutation.mutate();
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setPriorityFilter("all");
    setBranchFilter("all");
    setUnreadOnly(false);
    setPage(1);
  };

  if (isLoading && !data) {
    return <AdminTablePageSkeleton />;
  }

  const summaryItems = [
    {
      key: "total",
      label: "Total Notifications",
      value: kpiMetrics.total,
      icon: Bell,
      color: "neutral",
      description: "Logged alerts & events",
    },
    {
      key: "unread",
      label: "Unread Alerts",
      value: kpiMetrics.unread,
      icon: ShieldAlert,
      color: "amber",
      description: "Awaiting administrator review",
    },
    {
      key: "action_required",
      label: "Action Required",
      value: kpiMetrics.actionRequired,
      icon: AlertTriangle,
      color: "rose",
      description: "Cancellations & turnaround delays",
    },
    {
      key: "operations",
      label: "Operations & Workflows",
      value: kpiMetrics.operations,
      icon: Wrench,
      color: "blue",
      description: "Maintenance, billing & chat",
    },
  ];

  return (
    <div className="admin-notif-page">
      {/* ── Sticky Sub-Header ── */}
      <AdminPageHeader
        title="Notifications"
        subtitle="Review turnaround delays, billing alerts, maintenance updates, and system events."
        actions={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="admin-notif-page__unread-badge">
                {unreadCount} Unread
              </span>
            )}
            <button
              type="button"
              className="admin-notif-page__mark-all-btn"
              onClick={handleMarkAllRead}
              disabled={markAllMutation.isPending || unreadCount === 0}
              title={
                unreadCount === 0
                  ? "All notifications are already marked as read"
                  : "Mark all unread notifications as read"
              }
            >
              {markAllMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCheck size={14} />
              )}
              <span>
                {markAllMutation.isPending ? "Marking as read..." : "Mark all read"}
              </span>
            </button>
          </div>
        }
      />

      {/* ── SummaryBar KPI Metrics ── */}
      <section className="admin-notif-page__summary" aria-label="Key Metrics">
        <SummaryBar items={summaryItems} />
      </section>

      {/* ── Search & Filter Controls ── */}
      <section
        className="admin-notif-page__controls"
        aria-label="Filter Controls"
      >
        {/* Row 1: Category Segmented Tabs & Active Results Count */}
        <div className="admin-notif-page__tabs-row">
          <div className="admin-notif-page__category-tabs">
            {CATEGORY_TABS.map((tab) => {
              const count = categoryCounts[tab.key] || 0;
              const isActive = categoryFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`admin-notif-page__category-tab ${
                    isActive ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setCategoryFilter(tab.key);
                    setPage(1);
                  }}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span className="admin-notif-page__tab-badge">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="admin-notif-page__count-status">
            <span>
              Showing <strong>{filteredNotifications.length}</strong> of{" "}
              <strong>{totalNotifications}</strong> alerts
            </span>
          </div>
        </div>

        {/* Row 2: Search Input, Severity Filter, and Unread Toggle */}
        <div className="admin-notif-page__controls-row">
          {/* Live Search Input */}
          <div className="admin-notif-page__search-wrap">
            <Search size={15} className="admin-notif-page__search-icon" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by keyword, tenant name, or reference code..."
              className="admin-notif-page__search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="admin-notif-page__search-clear"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>

          {/* Auxiliary Dropdowns & Toggles */}
          <div className="admin-notif-page__aux-filters">
            {/* Branch Filter: Selector for Dorm Owner; static badge for Branch Admin */}
            {isOwnerUser ? (
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="admin-notif-page__select"
                title="Filter notifications by branch location"
              >
                {OWNER_BRANCH_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : user?.branch ? (
              <span
                className="admin-notif-page__branch-badge"
                title={`Notifications scoped to ${BRANCH_DISPLAY_NAMES[user.branch] || user.branch} branch`}
              >
                <Building2 size={13} />
                <span>{BRANCH_DISPLAY_NAMES[user.branch] || user.branch}</span>
              </span>
            ) : null}

            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="admin-notif-page__select"
              title="Filter by severity level"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`admin-notif-page__unread-toggle ${
                unreadOnly ? "is-active" : ""
              }`}
              onClick={() => {
                setUnreadOnly((v) => !v);
                setPage(1);
              }}
              title={
                unreadOnly
                  ? "Showing unread alerts only. Click to show all."
                  : "Filter by unread notifications"
              }
            >
              <span className="admin-notif-item__dot" />
              <span>Unread only</span>
              <span className="admin-notif-page__unread-count-badge">
                {unreadCount}
              </span>
            </button>

            {(searchTerm ||
              categoryFilter !== "all" ||
              priorityFilter !== "all" ||
              (isOwnerUser && branchFilter !== "all") ||
              unreadOnly) && (
              <button
                type="button"
                className="admin-notif-page__clear-filters-btn"
                onClick={handleResetFilters}
                title="Reset all search and filter criteria"
              >
                <XIcon size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Notification List ── */}
      <main className="admin-notif-page__list" aria-label="Notifications List">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`notif-skel-${i}`}
              className="admin-notif-item opacity-60 p-4 flex items-start gap-4"
            >
              <div className="h-10 w-10 rounded-lg bg-muted animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-52 rounded bg-muted animate-pulse mb-2" />
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse mb-2" />
                <div className="h-3 w-28 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="admin-notif-page__state">
            <div className="admin-notif-page__state-icon">
              <Inbox size={26} />
            </div>
            <h2 className="admin-notif-page__state-title">
              No notifications found
            </h2>
            <p className="admin-notif-page__state-subtitle">
              {searchTerm ||
              categoryFilter !== "all" ||
              priorityFilter !== "all" ||
              (isOwnerUser && branchFilter !== "all") ||
              unreadOnly
                ? "No notifications match your selected filter criteria. Try resetting the filters or modifying your search query."
                : "You are all caught up! There are currently no new notifications or alerts requiring your attention."}
            </p>
            {(searchTerm ||
              categoryFilter !== "all" ||
              priorityFilter !== "all" ||
              (isOwnerUser && branchFilter !== "all") ||
              unreadOnly) && (
              <button
                type="button"
                className="admin-notif-page__reset-btn"
                onClick={handleResetFilters}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const meta = getMeta(notification.type);
            const Icon = meta.icon;
            const isUnread = !notification.isRead;
            const actionUrl = getActionUrl(notification);
            const isClickable = Boolean(actionUrl);
            const fullDateTooltip = fmtFullDateTime(notification.createdAt);
            const relativeTime = fmtRelative(notification.createdAt);
            const cleanedTitle = formatNotificationTitle(
              notification.title || meta.label
            );
            const cleanedMessage = cleanNotificationMessage(
              notification.message
            );
            const variant = meta.variant || meta.priority || "neutral";
            const notifBranch = resolveNotificationBranch(notification);

            return (
              <article
                key={notification._id || notification.id}
                role={isClickable ? "button" : "article"}
                tabIndex={isClickable ? 0 : undefined}
                className={[
                  "admin-notif-item",
                  isUnread ? "admin-notif-item--unread" : "admin-notif-item--read",
                  isClickable ? "admin-notif-item--clickable" : "",
                ].join(" ")}
                onClick={
                  isClickable
                    ? () => handleNotificationClick(notification)
                    : undefined
                }
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }
                    : undefined
                }
              >
                {/* Clean Neutral Icon Box */}
                <div className="admin-notif-item__icon-wrap">
                  <Icon size={18} />
                </div>

                {/* Body Content */}
                <div className="admin-notif-item__body">
                  <div className="admin-notif-item__title-row">
                    <span className="admin-notif-item__title">
                      {cleanedTitle}
                    </span>
                    {isUnread && (
                      <span
                        className="admin-notif-item__dot"
                        title="Unread notification"
                        aria-label="Unread"
                      />
                    )}
                  </div>

                  <p className="admin-notif-item__message">{cleanedMessage}</p>

                  <div className="admin-notif-item__meta-row">
                    <span className="admin-notif-tag">
                      <span className={`admin-notif-tag__dot admin-notif-tag__dot--${variant}`} />
                      <span>{meta.label}</span>
                    </span>

                    {notifBranch && (
                      <span className="admin-notif-tag">
                        <Building2 size={11} className="admin-notif-tag__branch-icon" />
                        <span>{BRANCH_DISPLAY_NAMES[notifBranch] || notifBranch}</span>
                      </span>
                    )}

                    {notification.entityId && (
                      <span
                        className="admin-notif-item__entity-ref"
                        title={`Reference Code: ${notification.entityId}`}
                      >
                        Ref: {notification.entityId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Column: Persistent Timestamp & Action Controls */}
                <div className="admin-notif-item__right">
                  <time
                    className="admin-notif-item__time"
                    title={fullDateTooltip}
                    dateTime={notification.createdAt}
                  >
                    {relativeTime}
                  </time>

                  <div className="admin-notif-item__actions">
                    {isUnread && (
                      <button
                        type="button"
                        className="admin-notif-item__mark-read-btn"
                        onClick={(e) => handleSingleMarkRead(e, notification)}
                        title="Mark as read"
                        aria-label="Mark notification as read"
                      >
                        <Check size={14} />
                      </button>
                    )}

                    {isClickable && (
                      <button
                        type="button"
                        className="admin-notif-item__action-btn"
                        onClick={() => handleNotificationClick(notification)}
                        title="View Details"
                      >
                        <span>View Details</span>
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* ── Pagination Bar ── */}
      {totalPages > 1 && (
        <footer
          className="admin-notif-page__pagination"
          aria-label="Pagination Navigation"
        >
          <div className="admin-notif-page__pagination-info">
            Showing page <strong>{page}</strong> of{" "}
            <strong>{totalPages}</strong> (
            <strong>{filteredNotifications.length}</strong> items displayed)
          </div>

          <div className="admin-notif-page__pagination-controls">
            <button
              type="button"
              className="admin-notif-page__page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              title={page <= 1 ? "Already on first page" : "Go to previous page"}
            >
              Previous
            </button>

            <span className="admin-notif-page__page-label">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              className="admin-notif-page__page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              title={
                page >= totalPages
                  ? "Already on last page"
                  : "Go to next page"
              }
            >
              Next
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
