import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useUnreadCount,
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "../hooks/queries/useNotifications";
import useNotificationStore from "../stores/notificationStore";
import "./NotificationBell.css";

const TYPE_ICONS = {
  reservation_created: "📋",
  reservation_approved: "✅",
  reservation_rejected: "❌",
  payment_received: "💳",
  payment_verified: "✅",
  visit_approved: "🏠",
  visit_rejected: "🚫",
  account_suspended: "⚠️",
  account_reactivated: "🔔",
  account_banned: "🚫",
  announcement: "📢",
  system: "ℹ️",
};

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

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

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
  const mergedNotifications = [
    ...realtimeNotifs.filter((notification) => !polledIds.has(notification._id)),
    ...polledNotifs,
  ].slice(0, 12);

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

    if (notification.actionUrl) {
      setIsOpen(false);
      navigate(notification.actionUrl);
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

      {isOpen ? (
        <div ref={dropdownRef} className="nb-dropdown">
          <div className="nb-dropdown-header">
            <h3 className="nb-dropdown-title">Notifications</h3>
            {unreadCount > 0 ? (
              <button
                className="nb-mark-all-btn"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
              >
                <CheckAllIcon />
                <span>Mark all read</span>
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
                <span className="nb-empty-icon">🔔</span>
                <p>No notifications yet</p>
              </div>
            ) : (
              mergedNotifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`nb-item ${notification.isRead ? "read" : "unread"}`}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="nb-item-icon">
                    {TYPE_ICONS[notification.type] || "•"}
                  </span>
                  <div className="nb-item-content">
                    <p className="nb-item-title">{notification.title}</p>
                    <p className="nb-item-message">{notification.message}</p>
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
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
