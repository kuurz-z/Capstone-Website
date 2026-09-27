import { supportNotificationUrl } from "../utils/supportConcern.js";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  useUnreadCount,
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "../hooks/queries/useNotifications";
import useNotificationStore from "../stores/notificationStore";
import { useAuth } from "../hooks/useAuth";
import { getVisibleNotificationsForUser } from "../utils/notificationVisibility";
import {
  cleanNotificationMessage,
  formatNotificationTitle,
} from "../utils/notification";
import "./NotificationBell.css";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  Home,
  Lock,
  Unlock,
  Megaphone,
  Info,
  FileText,
  Slash,
  Wrench,
} from "lucide-react";

function NotificationBellIcon({ type }) {
  const iconProps = { size: 15, strokeWidth: 2 };
  switch (type) {
    case "reservation_created":
    case "application_submitted":
    case "bill_generated":
    case "contract_document_ready":
      return <FileText {...iconProps} style={{ color: "#2563EB" }} />;
    case "maintenance_update":
    case "maintenance_new":
      return <Wrench {...iconProps} style={{ color: "#2563EB" }} />;
    case "reservation_approved":
    case "reservation_confirmed":
    case "payment_verified":
    case "payment_approved":
    case "payment_confirmed":
    case "visit_approved":
    case "account_reactivated":
    case "renewal_effective":
      return <CheckCircle2 {...iconProps} style={{ color: "#059669" }} />;
    case "reservation_rejected":
    case "reservation_cancelled":
    case "reservation_cancellation_rejected":
    case "payment_rejected":
    case "visit_rejected":
    case "tenant_violation":
      return <XCircle {...iconProps} style={{ color: "#DC2626" }} />;
    case "reservation_expired":
    case "reservation_cancellation_requested":
    case "visit_requested":
    case "visit_scheduled":
    case "bill_due_reminder":
    case "penalty_applied":
    case "grace_period_warning":
    case "contract_expiring":
      return <Clock {...iconProps} style={{ color: "#D97706" }} />;
    case "reservation_noshow":
      return <Slash {...iconProps} style={{ color: "#DC2626" }} />;
    case "payment_received":
      return <CreditCard {...iconProps} style={{ color: "#059669" }} />;
    case "account_suspended":
    case "account_banned":
      return <Lock {...iconProps} style={{ color: "#DC2626" }} />;
    case "announcement":
    case "chat_reply":
      return <Megaphone {...iconProps} style={{ color: "#2563EB" }} />;
    default:
      return <Info {...iconProps} style={{ color: "#64748B" }} />;
  }
}

const BellIcon = ({ hasUnread }) => (
 <svg
 width="20"
 height="20"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 className={hasUnread ? "nb-bell-ring" : ""}
 >
 <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
 <path d="M13.73 21a2 2 0 0 1-3.46 0" />
 </svg>
);

const CheckAllIcon = () => (
 <svg
 width="14"
 height="14"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <polyline points="20 6 9 17 4 12" />
 </svg>
);

function timeAgo(dateStr) {
 const now = new Date();
 const date = new Date(dateStr);
 const seconds = Math.floor((now - date) / 1000);

 if (seconds < 60) return "Just now";
 const minutes = Math.floor(seconds / 60);
 if (minutes < 60) return `${minutes}m ago`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours}h ago`;
 const days = Math.floor(hours / 24);
 if (days < 7) return `${days}d ago`;
 return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getNotificationActionUrl(notification, isAdminUser = false) {
  if (isAdminUser) {
    if (
      notification?.type === "reservation_cancellation_requested" &&
      notification?.entityId
    ) {
      return `/admin/reservations?reservationId=${encodeURIComponent(
        notification.entityId,
      )}&focus=cancellation`;
    }

    if (
      (notification?.type === "visit_requested" || notification?.type === "visit_scheduled") &&
      notification?.entityId
    ) {
      return `/admin/reservations?reservationId=${encodeURIComponent(
        notification.entityId,
      )}&tab=visits`;
    }

    if (
      notification?.type === "contract_prepared" ||
      notification?.type === "contract_incomplete" ||
      notification?.type === "contract_signed" ||
      notification?.type === "contract_error" ||
      notification?.type === "contract_expiring" ||
      notification?.entityType === "contract"
    ) {
      if (notification?.actionUrl && notification.actionUrl.startsWith("/admin/tenants")) {
        return notification.actionUrl;
      }
      if (notification?.reservationId) {
        return `/admin/tenants?reservationId=${encodeURIComponent(notification.reservationId)}`;
      }
      return "/admin/tenants";
    }

    const supportUrl = supportNotificationUrl(notification);
    if (supportUrl) return supportUrl;
    const rawUrl = notification?.actionUrl;
    if (rawUrl && rawUrl.startsWith("/admin/")) {
      return rawUrl === "/admin/contracts" ? "/admin/tenants" : rawUrl;
    }

    const ADMIN_ACTION_URLS = {
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
      contract_expiring: "/admin/tenants",
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
      grace_period_warning: "/admin/reservations",
      account_suspended: "/admin/users",
      account_reactivated: "/admin/users",
    };

    if (notification?.type && ADMIN_ACTION_URLS[notification.type]) {
      return ADMIN_ACTION_URLS[notification.type];
    }

    return "/admin/notifications";
  }

  if (
    notification?.type === "contract_document_ready" ||
    notification?.type === "renewal_effective" ||
    notification?.entityType === "contract"
  ) {
    return "/applicant/contracts";
  }

  const rawUrl = notification?.actionUrl;
  if (!rawUrl) return null;

  if (rawUrl === "/tenant/documents" || rawUrl === "/tenant/contracts" || rawUrl === "/documents" || rawUrl === "/contracts") {
    return "/applicant/contracts";
  }
  if (rawUrl.startsWith("/tenant/reservation")) {
    return rawUrl.replace(/^\/tenant\/reservation/, "/applicant/reservation");
  }
  if (rawUrl.startsWith("/tenant/billing") || rawUrl.startsWith("/bill-details")) {
    return "/applicant/billing";
  }
  if (rawUrl.startsWith("/tenant/maintenance")) {
    return rawUrl.replace(/^\/tenant\/maintenance/, "/applicant/maintenance");
  }
  if (rawUrl.startsWith("/tenant/announcements")) {
    return rawUrl.replace(/^\/tenant\/announcements/, "/applicant/announcements");
  }
  if (rawUrl.startsWith("/tenant/account") || rawUrl.startsWith("/tenant/profile")) {
    return "/applicant/profile";
  }

  return rawUrl;
}

export default function NotificationBell() {
 const [isOpen, setIsOpen] = useState(false);
 const dropdownRef = useRef(null);
 const buttonRef = useRef(null);
 const navigate = useNavigate();
 const prefersReducedMotion = useReducedMotion();
 const { user, isAdmin } = useAuth();

 const { data: unreadData } = useUnreadCount();
 const { data: notifData, isLoading } = useNotifications(1, {
 limit: 8,
 enabled: isOpen,
 });
 const markAsRead = useMarkAsRead();
 const markAllAsRead = useMarkAllAsRead();

 const realtimeNotifs = useNotificationStore((state) => state.notifications);
 const unreadCount = unreadData?.unreadCount ?? 0;

 const polledNotifs = notifData?.notifications ?? [];
 const polledIds = new Set(polledNotifs.map((notification) => notification._id));
 const mergedNotifications = getVisibleNotificationsForUser([
 ...realtimeNotifs.filter((notification) => !polledIds.has(notification._id)),
 ...polledNotifs,
 ], user).slice(0, 12);

 useEffect(() => {
 const handleClickOutside = (event) => {
 if (
 dropdownRef.current &&
 !dropdownRef.current.contains(event.target) &&
 buttonRef.current &&
 !buttonRef.current.contains(event.target)
 ) {
 setIsOpen(false);
 }
 };

 if (isOpen) {
 document.addEventListener("mousedown", handleClickOutside);
 return () =>
 document.removeEventListener("mousedown", handleClickOutside);
 }

 return undefined;
 }, [isOpen]);

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead.mutate(notification._id);
    }

    setIsOpen(false);
    const resolvedUrl = getNotificationActionUrl(notification, isAdmin());
    if (!isAdmin() && notification.type === "announcement") {
      navigate("/applicant/announcements");
    } else if (resolvedUrl) {
      navigate(resolvedUrl);
    } else {
      navigate(isAdmin() ? "/admin/notifications" : "/applicant/profile", isAdmin() ? undefined : { state: { tab: "notifications" } });
    }
  };

 return (
 <div className="nb-container">
 <button
 ref={buttonRef}
 className="nb-bell-btn"
 onClick={() => setIsOpen((previous) => !previous)}
 aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
 title="Notifications"
 >
 <BellIcon hasUnread={unreadCount > 0} />
 {unreadCount > 0 ? (
 <span className="nb-badge">
 {unreadCount > 99 ? "99+" : unreadCount}
 </span>
 ) : null}
 </button>

 <AnimatePresence initial={false}>
 {isOpen ? (
 <motion.div
 ref={dropdownRef}
 className="nb-dropdown"
 initial={
 prefersReducedMotion
 ? { opacity: 0 }
 : { opacity: 0, y: -8, scale: 0.985 }
 }
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={
 prefersReducedMotion
 ? { opacity: 0 }
 : { opacity: 0, y: -6, scale: 0.985 }
 }
 transition={{
 duration: prefersReducedMotion ? 0.01 : 0.18,
 ease: [0.22, 1, 0.36, 1],
 }}
 >
 <div className="nb-dropdown-header">
 <h3 className="nb-dropdown-title">Notifications</h3>
 {unreadCount > 0 ? (
 <button
 className="nb-mark-all-btn"
 onClick={() => markAllAsRead.mutate()}
 disabled={markAllAsRead.isPending}
 title="Mark all as read"
 >
 <CheckAllIcon />
 <span>Read all</span>
 </button>
 ) : null}
 </div>

 <div className="nb-dropdown-list">
 {isLoading ? (
 <div className="nb-empty">
 <div className="nb-loading-dots">
 <span />
 <span />
 <span />
 </div>
 </div>
 ) : mergedNotifications.length === 0 ? (
 <div className="nb-empty">
 <span className="nb-empty-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Bell size={24} style={{ color: "#9CA3AF" }} /></span>
 <p>No notifications yet</p>
 </div>
 ) : (
 mergedNotifications.map((notification) => (
 <div
 key={notification._id}
 className={`nb-item ${notification.isRead ? "read" : "unread"}`}
 onClick={() => handleNotificationClick(notification)}
 onKeyDown={(event) => {
 if (event.key === "Enter" || event.key ===" ") {
 event.preventDefault();
 handleNotificationClick(notification);
 }
 }}
 role="button"
 tabIndex={0}
 >
 <span className="nb-item-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
 <NotificationBellIcon type={notification.type} />
 </span>
 <div className="nb-item-content">
 <p className="nb-item-title">{formatNotificationTitle(notification.title)}</p>
 <p className="nb-item-message">{cleanNotificationMessage(notification.message)}</p>
 <span className="nb-item-time">
 {timeAgo(notification.createdAt)}
 </span>
 </div>
 {!notification.isRead ? <span className="nb-item-dot" /> : null}
 </div>
 ))
 )}
 </div>

 {mergedNotifications.length > 0 ? (
 <div className="nb-dropdown-footer">
 <button
 className="nb-view-all-btn"
 onClick={() => {
  setIsOpen(false);
  navigate(isAdmin() ? "/admin/notifications" : "/applicant/profile", isAdmin() ? undefined : { state: { tab: "notifications" } });
 }}
 >
 View all
 </button>
 </div>
 ) : null}
 </motion.div>
 ) : null}
 </AnimatePresence>
 </div>
 );
}
