/**
 * Announcement API - Domain-specific announcement operations
 */

import { authFetch } from "./httpClient.js";

export const announcementApi = {
  /**
   * Get announcements for user's branch
   */
  getAll: (limit = 50, category = null) => {
    let url = `/announcements?limit=${limit}`;
    if (category) url += `&category=${category}`;
    return authFetch(url);
  },

  /**
   * Get recent admin announcements
   */
  getAdminList: (limit = 20, branch = null) => {
    let url = `/announcements/admin?limit=${limit}`;
    if (branch) url += `&branch=${branch}`;
    return authFetch(url);
  },

  /**
   * Get unacknowledged announcements
   */
  getUnacknowledged: () => authFetch("/announcements/unacknowledged"),

  /**
   * Mark announcement as read
   */
  markAsRead: (announcementId) =>
    authFetch(`/announcements/${announcementId}/read`, {
      method: "POST",
    }),

  /**
   * Acknowledge announcement
   */
  acknowledge: (announcementId) =>
    authFetch(`/announcements/${announcementId}/acknowledge`, {
      method: "POST",
    }),

  /**
   * Get user's engagement statistics
   */
  getUserEngagementStats: (days = 30) =>
    authFetch(`/announcements/user/engagement-stats?days=${days}`),

  /**
   * Create new announcement (admin only)
   */
  create: (announcementData) =>
    authFetch("/announcements", {
      method: "POST",
      body: JSON.stringify(announcementData),
    }),

  /**
   * Update announcement (admin only)
   */
  update: (id, announcementData) =>
    authFetch(`/announcements/${id}`, {
      method: "PUT",
      body: JSON.stringify(announcementData),
    }),

  /**
   * Delete announcement (admin only)
   */
  delete: (id) =>
    authFetch(`/announcements/${id}`, {
      method: "DELETE",
    }),
};
