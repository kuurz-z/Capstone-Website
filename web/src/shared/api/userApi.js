/**
 * User API - Domain-specific user management operations
 */

import { authFetch, publicFetch } from "./httpClient.js";

export const userApi = {
  /**
   * Get all users (admin only, filtered by branch)
   */
  getAll: (filters = {}) => {
    const queryString = new URLSearchParams(filters).toString();
    const url = queryString ? `/users?${queryString}` : "/users";
    return authFetch(url);
  },

  /**
   * Get user by ID (admin only)
   */
  getById: (userId) => authFetch(`/users/${userId}`),

  /**
   * Get user statistics (admin only)
   */
  getStats: () => authFetch("/users/stats"),

  /**
   * Get current user's stay history and information
   */
  getMyStays: () => authFetch("/users/my-stays"),

  /**
   * Update user (admin only)
   */
  update: (userId, userData) =>
    authFetch(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),

  /**
   * Delete user (owner only)
   */
  delete: (userId, options = {}) => {
    const query = options.hardDelete ? "?hardDelete=true" : "";
    return authFetch(`/users/${userId}${query}`, { method: "DELETE" });
  },

  /**
   * Get email by username (public - for login)
   */
  getEmailByUsername: (username) =>
    publicFetch(
      `/users/email-by-username?username=${encodeURIComponent(username)}`,
    ),

  /**
   * Suspend user account (admin only)
   */
  suspend: (userId, reason) =>
    authFetch(`/users/${userId}/suspend`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),

  /**
   * Ban user account (admin only)
   */
  ban: (userId, reason) =>
    authFetch(`/users/${userId}/ban`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),

  /**
   * Reactivate user account (admin only)
   */
  reactivate: (userId) =>
    authFetch(`/users/${userId}/reactivate`, {
      method: "PATCH",
    }),

  /**
   * Restore archived user account (owner only)
   */
  restore: (userId) =>
    authFetch(`/users/${userId}/restore`, {
      method: "PATCH",
    }),

  /**
   * Update branch admin permissions (owner only)
   */
  updatePermissions: (userId, permissions) =>
    authFetch(`/users/${userId}/permissions`, {
      method: "PATCH",
      body: JSON.stringify({ permissions }),
    }),
};
