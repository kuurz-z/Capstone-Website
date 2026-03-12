import React, { useState, useRef, useEffect } from "react";
import { useUnreadCount, useNotifications, useMarkAsRead, useMarkAllAsRead } from "../hooks/queries/useNotifications";
import "./NotificationBell.css";

// ── Icon helpers ──
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Notification type icon mapping ──
const TYPE_ICONS = {
  reservation_created: "📋",
  reservation_approved: "✅",
  reservation_rejected: "❌",
  payment_received: "💳",
  payment_verified: "✅",
  visit_approved: "🏠",
  visit_rejected: "🚫",
  account_suspended: "⚠️",
  account_reactivated: "🔓",
  account_banned: "🚫",
  system: "ℹ️",
};

// ── Time formatting ──
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

/**
 * NotificationBell — bell icon with unread badge + dropdown panel.
 * Works in both tenant and admin layouts.
 */
export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // ── Data ──
  const { data: unreadData } = useUnreadCount();
  const { data: notifData, isLoading } = useNotifications(1, { limit: 8, enabled: isOpen });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const unreadCount = unreadData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];

  // ── Click outside to close ──
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // ── Handlers ──
  const handleBellClick = () => setIsOpen((prev) => !prev);

  const handleMarkRead = (id) => {
    markAsRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
  };

  return (
    <div className="nb-container">
      <button
        ref={buttonRef}
        className="nb-bell-btn"
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        title="Notifications"
      >
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="nb-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className="nb-dropdown">
          {/* Header */}
          <div className="nb-dropdown-header">
            <h3 className="nb-dropdown-title">Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="nb-mark-all-btn"
                onClick={handleMarkAllRead}
                disabled={markAllAsRead.isPending}
              >
                <CheckAllIcon />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="nb-dropdown-list">
            {isLoading ? (
              <div className="nb-empty">
                <div className="nb-loading-dots">
                  <span /><span /><span />
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="nb-empty">
                <span className="nb-empty-icon">🔔</span>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`nb-item ${notif.isRead ? "read" : "unread"}`}
                  onClick={() => !notif.isRead && handleMarkRead(notif._id)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="nb-item-icon">
                    {TYPE_ICONS[notif.type] || "📌"}
                  </span>
                  <div className="nb-item-content">
                    <p className="nb-item-title">{notif.title}</p>
                    <p className="nb-item-message">{notif.message}</p>
                    <span className="nb-item-time">{timeAgo(notif.createdAt)}</span>
                  </div>
                  {!notif.isRead && <span className="nb-item-dot" />}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="nb-dropdown-footer">
              <button className="nb-view-all-btn" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
