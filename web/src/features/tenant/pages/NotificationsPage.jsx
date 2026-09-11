import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Slash,
  Home,
  CreditCard,
  FileText,
  AlertTriangle,
  FileSpreadsheet,
  Wrench,
  Lock,
  Unlock,
  Megaphone,
  Info,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from "../../../shared/hooks/queries/useNotifications";
import { getVisibleNotificationsForUser } from "../../../shared/utils/notificationVisibility";
import {
  formatNotificationTitle,
  cleanNotificationMessage,
} from "../../../shared/utils/notification";
import { ListSkeleton } from "../../../shared/components/LoadingSkeletons";
import "../../admin/styles/design-tokens.css";

const ALL_FILTER_TABS = [
  { key: "all", label: "All", roles: ["applicant", "tenant"] },
  { key: "reservation", label: "Reservations", roles: ["applicant", "tenant"] },
  { key: "application", label: "Applications", roles: ["applicant"] },
  { key: "visit", label: "Visits", roles: ["applicant", "tenant"] },
  { key: "payment", label: "Payments", roles: ["applicant", "tenant"] },
  { key: "billing", label: "Billing", roles: ["tenant"] },
  { key: "maintenance", label: "Maintenance", roles: ["tenant"] },
  { key: "announcement", label: "Announcements", roles: ["tenant"] },
];

function NotificationIcon({ type }) {
  const iconProps = { size: 18, strokeWidth: 2 };
  switch (type) {
    case "reservation_confirmed":
    case "visit_approved":
    case "payment_approved":
    case "payment_confirmed":
    case "account_reactivated":
    case "renewal_effective":
      return <CheckCircle2 {...iconProps} style={{ color: "#059669" }} />;
    case "reservation_cancelled":
    case "reservation_noshow":
    case "reservation_cancellation_rejected":
    case "visit_rejected":
    case "payment_rejected":
    case "tenant_violation":
      return <XCircle {...iconProps} style={{ color: "#DC2626" }} />;
    case "account_suspended":
      return <Lock {...iconProps} style={{ color: "#DC2626" }} />;
    case "reservation_expired":
    case "reservation_cancellation_requested":
    case "visit_requested":
    case "bill_due_reminder":
    case "penalty_applied":
    case "grace_period_warning":
    case "contract_expiring":
      return <Clock {...iconProps} style={{ color: "#D97706" }} />;
    case "bill_generated":
    case "contract_document_ready":
      return <FileText {...iconProps} style={{ color: "#2563EB" }} />;
    case "move_in_reminder":
      return <Home {...iconProps} style={{ color: "#2563EB" }} />;
    case "maintenance_update":
      return <Wrench {...iconProps} style={{ color: "#2563EB" }} />;
    case "announcement":
    case "chat_reply":
      return <Megaphone {...iconProps} style={{ color: "#2563EB" }} />;
    default:
      return <Info {...iconProps} style={{ color: "#64748B" }} />;
  }
}


function matchesFilter(notification, filter) {
  if (filter === "all") return true;
  if (filter === "reservation") {
    return notification.type.startsWith("reservation_") ||
      notification.title?.toLowerCase().includes("reservation") ||
      notification.title?.toLowerCase().includes("renewal");
  }
  if (filter === "application") {
    return notification.type === "general" && notification.title?.toLowerCase().includes("application");
  }
  if (filter === "visit") {
    return notification.type.startsWith("visit_") ||
      notification.title?.toLowerCase().includes("viewing") ||
      notification.title?.toLowerCase().includes("visit");
  }
  if (filter === "payment") {
    return notification.type === "payment_approved" || notification.type === "payment_confirmed" || notification.type === "payment_rejected";
  }
  if (filter === "billing") {
    return ["bill_generated", "bill_due_reminder", "penalty_applied",
            "contract_expiring", "grace_period_warning", "contract_document_ready", "renewal_effective"].includes(notification.type);
  }
  if (filter === "maintenance") {
    return notification.type === "maintenance_update";
  }
  if (filter === "announcement") {
    return notification.type === "announcement" || notification.type === "chat_reply";
  }
  return notification.type === filter;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isApplicant = user?.role === "applicant";
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useNotifications(page, { unreadOnly });
  const { data: countData } = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();

  const currentRole = isApplicant ? "applicant" : "tenant";
  const filterTabs = useMemo(
    () => ALL_FILTER_TABS.filter((t) => t.roles.includes(currentRole)),
    [currentRole]
  );

  const filterScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDragged = useRef(false);

  const updateScrollButtons = useCallback(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    setCanScrollLeft((prev) => (prev ? el.scrollLeft > 4 : el.scrollLeft > 18));
    setCanScrollRight((prev) => {
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      return prev ? remaining > 4 : remaining > 18;
    });
  }, []);

  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;

    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateScrollButtons();
      });
      ro.observe(el);
    }

    // Translate vertical mouse wheel into horizontal scroll for mouse users
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.85;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      el.removeEventListener("wheel", onWheel);
      if (ro) ro.disconnect();
    };
  }, [updateScrollButtons, filterTabs]);

  const scrollFilters = (direction) => {
    const el = filterScrollRef.current;
    if (!el) return;
    const offset = direction === "left" ? -180 : 180;
    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = filterScrollRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    hasDragged.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const el = filterScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.2;
    if (Math.abs(walk) > 4) {
      hasDragged.current = true;
    }
    el.scrollLeft = dragScrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    if (hasDragged.current) {
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
    }
  };

  const allNotifications = getVisibleNotificationsForUser(data?.notifications || [], user);
  const totalPages = data?.pagination?.totalPages || 1;
  const unreadCount = countData?.unreadCount ?? 0;

  const filtered = allNotifications.filter((n) => matchesFilter(n, typeFilter));

  const handleClick = (notification) => {
    if (!notification.isRead) markAsRead.mutate(String(notification._id));
    if (notification.type === "announcement") {
      navigate("/applicant/announcements");
    } else if (
      notification.type === "contract_document_ready" ||
      notification.type === "renewal_effective" ||
      notification.entityType === "contract"
    ) {
      navigate("/applicant/contracts");
    } else if (notification.actionUrl) {
      const rawUrl = notification.actionUrl;
      if (rawUrl === "/tenant/documents" || rawUrl === "/tenant/contracts" || rawUrl === "/documents" || rawUrl === "/contracts") {
        navigate("/applicant/contracts");
      } else if (rawUrl.startsWith("/tenant/reservation")) {
        navigate(rawUrl.replace(/^\/tenant\/reservation/, "/applicant/reservation"));
      } else if (rawUrl.startsWith("/tenant/billing") || rawUrl.startsWith("/bill-details")) {
        navigate("/applicant/billing");
      } else if (rawUrl.startsWith("/tenant/maintenance")) {
        navigate(rawUrl.replace(/^\/tenant\/maintenance/, "/applicant/maintenance"));
      } else if (rawUrl.startsWith("/tenant/announcements")) {
        navigate(rawUrl.replace(/^\/tenant\/announcements/, "/applicant/announcements"));
      } else if (rawUrl.startsWith("/tenant/account") || rawUrl.startsWith("/tenant/profile")) {
        navigate("/applicant/profile");
      } else {
        navigate(rawUrl);
      }
    }
  };

  return (
    <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
            <Bell size={20} className="text-slate-900 dark:text-slate-100" />
            Notifications
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 mb-0">
            {isApplicant
              ? "Reservation, visit, and application updates from Lilycrest"
              : "Billing, maintenance, contract, and account notices"}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer flex-shrink-0"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Mobile Filter Controls (< 640px) */}
      <div className="sm:hidden flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <label htmlFor="notifications-page-filter" className="sr-only">
            Filter notifications
          </label>
          <select
            id="notifications-page-filter"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-full sm:hidden appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-all cursor-pointer"
          >
            {filterTabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
            <Filter size={13} />
          </div>
        </div>

        <button
          onClick={() => { setUnreadOnly((prev) => !prev); setPage(1); }}
          type="button"
          className={`px-3 py-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            unreadOnly
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100"
              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
          }`}
        >
          Unread only
        </button>
      </div>

      {/* Desktop Filter Pills Carousel with Arrows & Smooth Scrolling (>= 640px) */}
      <div className="hidden sm:flex notif-filter-carousel notif-filter-scroll-wrapper mb-5">
        <button
          type="button"
          className={`notif-filter-carousel-arrow notif-filter-carousel-arrow--left ${
            canScrollLeft ? "is-visible" : ""
          }`}
          onClick={() => scrollFilters("left")}
          aria-label="Scroll filters left"
          title="Scroll filters left"
          tabIndex={canScrollLeft ? 0 : -1}
          aria-hidden={!canScrollLeft}
        >
          <ChevronLeft size={15} />
        </button>

        <div
          ref={filterScrollRef}
          className={`notif-filter-scroll ${isDragging ? "is-dragging" : ""}`}
          role="tablist"
          aria-label="Filter notifications"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        >
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={typeFilter === tab.key}
              onClick={(e) => {
                if (hasDragged.current) {
                  e.preventDefault();
                  return;
                }
                setTypeFilter(tab.key);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all duration-150 cursor-pointer ${
                typeFilter === tab.key
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium"
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Separator */}
          <span
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "var(--border, #e2e8f0)",
              margin: "0 2px",
              flexShrink: 0,
            }}
          />

          {/* Unread only toggle */}
          <button
            type="button"
            onClick={(e) => {
              if (hasDragged.current) {
                e.preventDefault();
                return;
              }
              setUnreadOnly((prev) => !prev);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all duration-150 cursor-pointer ${
              unreadOnly
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium"
            }`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Filter style={{ width: "12px", height: "12px" }} />
              Unread only
            </span>
          </button>
        </div>

        <button
          type="button"
          className={`notif-filter-carousel-arrow notif-filter-carousel-arrow--right ${
            canScrollRight ? "is-visible" : ""
          }`}
          onClick={() => scrollFilters("right")}
          aria-label="Scroll filters right"
          title="Scroll filters right"
          tabIndex={canScrollRight ? 0 : -1}
          aria-hidden={!canScrollRight}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* List */}
      <div style={{ backgroundColor: "white", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 12 }}>
            <ListSkeleton rows={5} avatar />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "56px 24px", textAlign: "center" }}>
            <Bell size={36} style={{ color: "#D1D5DB", margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 15, fontWeight: 500, color: "#374151", margin: "0 0 4px" }}>
              No notifications
            </p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
              {unreadOnly ? "No unread notifications in this category." : "Nothing here yet — updates will appear as they happen."}
            </p>
          </div>
        ) : (
          filtered.map((n, index) => (
            <div
              key={n._id}
              onClick={() => handleClick(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(n); }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "14px 16px",
                borderBottom: index < filtered.length - 1 ? "1px solid #F3F4F6" : "none",
                cursor: "pointer",
                backgroundColor: n.isRead ? "white" : "#F8FAFC",
                transition: "background-color 0.15s",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}>
                <NotificationIcon type={n.type} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: n.isRead ? 500 : 700, color: "#111827", margin: 0 }}>
                  {formatNotificationTitle(n.title)}
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "3px 0 0", lineHeight: 1.5 }}>
                  {cleanNotificationMessage(n.message)}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
              </div>
              {!n.isRead && (
                <span
                  style={{
                    width: 7, height: 7, borderRadius: "50%",
                    backgroundColor: "#0A1628", flexShrink: 0, marginTop: 6,
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid #E5E7EB", backgroundColor: "white",
              fontSize: 13, color: "#374151",
              cursor: page === 1 ? "not-allowed" : "pointer",
              opacity: page === 1 ? 0.4 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "#6B7280" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid #E5E7EB", backgroundColor: "white",
              fontSize: 13, color: "#374151",
              cursor: page === totalPages ? "not-allowed" : "pointer",
              opacity: page === totalPages ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
