/**
 * ============================================================================
 * ZUSTAND — NOTIFICATION STORE
 * ============================================================================
 *
 * Global state for notifications, replacing scattered useState + prop drilling.
 *
 * USAGE:
 *   import { useNotificationStore } from "@/shared/stores/notificationStore";
 *
 *   // In component:
 *   const { unreadCount, notifications, markAsRead } = useNotificationStore();
 *
 * ============================================================================
 */

import { create } from "zustand";

const useNotificationStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────
  notifications: [],
  unreadCount: 0,
  isConnected: false,

  // ── Actions ────────────────────────────────────────────────

  /** Replace entire notification list (on initial fetch) */
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),

  /** Add a new real-time notification (from Socket.IO) */
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),

  /** Mark a single notification as read */
  markAsRead: (notificationId) =>
    set((state) => {
      const updated = state.notifications.map((n) =>
        n._id === notificationId ? { ...n, read: true } : n,
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }),

  /** Mark all notifications as read */
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  /** Set socket connection status */
  setConnected: (connected) => set({ isConnected: connected }),

  /** Clear all notifications (e.g., on logout) */
  clear: () => set({ notifications: [], unreadCount: 0, isConnected: false }),
}));

export default useNotificationStore;
