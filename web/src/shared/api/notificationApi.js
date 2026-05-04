/**
 * ============================================================================
 * NOTIFICATION API CLIENT
 * ============================================================================
 *
 * Frontend API module for the notification system.
 * Connects to the existing backend endpoints:
 *   GET    /api/notifications
 *   GET    /api/notifications/unread-count
 *   PATCH  /api/notifications/read-all
 *   PATCH  /api/notifications/:id/read
 *
 * ============================================================================
 */

import { authFetch } from "./httpClient.js";

export const notificationApi = {
  /**
   * Get paginated notifications for the current user
   * @param {Object} params - { page, limit, unreadOnly }
   * @returns {Promise<{ notifications, unreadCount, pagination }>}
   */
  getAll: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", params.page);
    if (params.limit) query.set("limit", params.limit);
    if (params.unreadOnly) query.set("unreadOnly", "true");

    const url = `/notifications${query.toString() ? `?${query}` : ""}`;
    const response = await authFetch(url);
    return response;
  },

  /**
   * Get unread notification count
   * @returns {Promise<{ unreadCount: number }>}
   */
  getUnreadCount: async () => {
    const response = await authFetch("/notifications/unread-count");
    return response;
  },

  /**
   * Mark a single notification as read
   * @param {string} notificationId
   */
  markAsRead: async (notificationId) => {
    const response = await authFetch(`/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
    return response;
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async () => {
    const response = await authFetch("/notifications/read-all", {
      method: "PATCH",
    });
    return response;
  },
};
