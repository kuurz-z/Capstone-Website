/**
 * ============================================================================
 * NotificationsTab — Real Notification Display
 * ============================================================================
 *
 * Connects to the existing notification backend via useNotifications hooks.
 *
 * Features:
 * - Paginated notification list
 * - Unread dot indicator
 * - "Mark all as read" button
 * - Type-based icons
 * - Grouped by date
 * - Empty state
 *
 * ============================================================================
 */

import React, { useState, useMemo } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Calendar,
  CreditCard,
  Wrench,
  Home,
  Megaphone,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "../../../../shared/hooks/queries/useNotifications";

// ── Notification type → icon + color mapping ──
const TYPE_CONFIG = {
  reservation_confirmed: { icon: Calendar, color: "#10B981", label: "Reservation" },
  reservation_cancelled: { icon: Calendar, color: "#EF4444", label: "Reservation" },
  visit_approved: { icon: Home, color: "#10B981", label: "Visit" },
  visit_rejected: { icon: Home, color: "#EF4444", label: "Visit" },
  payment_approved: { icon: CreditCard, color: "#10B981", label: "Payment" },
  payment_rejected: { icon: CreditCard, color: "#EF4444", label: "Payment" },
  bill_generated: { icon: CreditCard, color: "#F59E0B", label: "Billing" },
  bill_due_reminder: { icon: AlertCircle, color: "#EF4444", label: "Billing" },
  grace_period_warning: { icon: AlertCircle, color: "#EF4444", label: "Warning" },
  move_in_reminder: { icon: Home, color: "#6366F1", label: "Move-in" },
  account_suspended: { icon: AlertCircle, color: "#EF4444", label: "Account" },
  account_reactivated: { icon: Check, color: "#10B981", label: "Account" },
  maintenance_update: { icon: Wrench, color: "#8B5CF6", label: "Maintenance" },
  announcement: { icon: Megaphone, color: "#FF8C42", label: "Announcement" },
  general: { icon: Bell, color: "#6B7280", label: "General" },
};

// ── Date grouping helper ──
const getDateLabel = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

const formatTime = (dateStr) => {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// ── Component ──

const NotificationsTab = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useNotifications(page);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.notifications || [];
  const pagination = data?.pagination || {};
  const unreadCount = data?.unreadCount || 0;

  // Group notifications by date
  const grouped = useMemo(() => {
    const groups = {};
    notifications.forEach((n) => {
      const label = getDateLabel(n.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(n);
    });
    return groups;
  }, [notifications]);

  const handleMarkRead = (id) => {
    markAsRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
  };

  // ── Styles ──
  const cardStyle = {
    backgroundColor: "var(--surface-card, #fff)",
    borderRadius: "12px",
    border: "1px solid var(--border-card, #E8EBF0)",
    overflow: "hidden",
  };

  return (
    <div style={{ maxWidth: "1200px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-heading, #1F2937)",
              margin: "0 0 4px",
            }}
          >
            Notifications
            {unreadCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: "8px",
                  backgroundColor: "#EF4444",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 700,
                  borderRadius: "999px",
                  padding: "2px 8px",
                  minWidth: "20px",
                  verticalAlign: "middle",
                }}
              >
                {unreadCount}
              </span>
            )}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-muted, #94A3B8)", margin: 0 }}>
            Stay updated on your reservations, payments, and more
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markAllAsRead.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "transparent",
              border: "1px solid var(--border-card, #E8EBF0)",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary, #6B7280)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--surface-muted, #F8FAFC)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <CheckCheck style={{ width: "14px", height: "14px" }} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ ...cardStyle, padding: "48px", textAlign: "center" }}>
          <p style={{ color: "#94A3B8", fontSize: "14px" }}>Loading notifications...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ ...cardStyle, padding: "48px", textAlign: "center" }}>
          <AlertCircle style={{ width: "32px", height: "32px", color: "#EF4444", margin: "0 auto 12px" }} />
          <p style={{ color: "#EF4444", fontSize: "14px" }}>Failed to load notifications</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && notifications.length === 0 && (
        <div
          style={{
            ...cardStyle,
            padding: "64px 32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "var(--surface-muted, #F8FAFC)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Bell style={{ width: "28px", height: "28px", color: "#CBD5E1" }} />
          </div>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-heading, #1F2937)", margin: "0 0 4px" }}>
            No notifications yet
          </p>
          <p style={{ fontSize: "14px", color: "var(--text-muted, #94A3B8)", margin: 0 }}>
            You're all caught up! We'll notify you when something happens.
          </p>
        </div>
      )}

      {/* Notification list grouped by date */}
      {!isLoading && !error && notifications.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#94A3B8",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  margin: "0 0 8px",
                }}
              >
                {dateLabel}
              </p>
              <div style={{ ...cardStyle, overflow: "hidden" }}>
                {items.map((notification, idx) => {
                  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.general;
                  const Icon = config.icon;

                  return (
                    <div
                      key={notification._id}
                      onClick={() => !notification.isRead && handleMarkRead(notification._id)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        padding: "16px 20px",
                        borderBottom:
                          idx < items.length - 1 ? "1px solid var(--border-subtle, #F1F5F9)" : "none",
                        backgroundColor: notification.isRead ? "var(--surface-card, #fff)" : "rgba(255, 140, 66, 0.04)",
                        cursor: notification.isRead ? "default" : "pointer",
                        transition: "background-color 0.15s",
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          backgroundColor: `${config.color}10`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          style={{
                            width: "18px",
                            height: "18px",
                            color: config.color,
                          }}
                        />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "2px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: notification.isRead ? 500 : 600,
                              color: "var(--text-heading, #1F2937)",
                            }}
                          >
                            {notification.title}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: config.color,
                              backgroundColor: `${config.color}15`,
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {config.label}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary, #6B7280)",
                            margin: "0 0 4px",
                            lineHeight: 1.4,
                          }}
                        >
                          {notification.message}
                        </p>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#94A3B8",
                          }}
                        >
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>

                      {/* Unread dot */}
                      {!notification.isRead && (
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#FF8C42",
                            flexShrink: 0,
                            marginTop: "6px",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                paddingTop: "8px",
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  border: "1px solid var(--border-card, #E8EBF0)",
                  borderRadius: "8px",
                  backgroundColor: "var(--surface-card, #fff)",
                  fontSize: "13px",
                  color: page <= 1 ? "#CBD5E1" : "#6B7280",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                <ChevronLeft style={{ width: "14px", height: "14px" }} />
                Previous
              </button>
              <span style={{ fontSize: "13px", color: "#6B7280" }}>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                disabled={page >= pagination.totalPages}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  border: "1px solid var(--border-card, #E8EBF0)",
                  borderRadius: "8px",
                  backgroundColor: "var(--surface-card, #fff)",
                  fontSize: "13px",
                  color: page >= pagination.totalPages ? "#CBD5E1" : "#6B7280",
                  cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
                <ChevronRight style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsTab;
