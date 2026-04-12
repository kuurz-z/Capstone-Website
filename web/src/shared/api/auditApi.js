/**
 * Audit Log API - Domain-specific audit log operations
 */

import { authFetch } from "./httpClient.js";

/**
 * Audit Log API for viewing and managing audit logs (admin only)
 */
export const auditApi = {
  /**
   * Get audit logs with filters
   */
  getLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/audit-logs${query ? `?${query}` : ""}`);
  },

  /**
   * Get audit log statistics
   */
  getStats: (branch = null) => {
    const query = branch ? `?branch=${branch}` : "";
    return authFetch(`/audit-logs/stats${query}`);
  },

  /**
   * Get specific audit log by ID
   */
  getById: (logId) => authFetch(`/audit-logs/${logId}`),

  /**
   * Export audit logs
   */
  export: (filters = {}) =>
    authFetch("/audit-logs/export", {
      method: "POST",
      body: JSON.stringify({ filters }),
    }),

  /**
   * Get failed login attempts (security)
   */
  getFailedLogins: (hours = 24) =>
    authFetch(`/audit-logs/security/failed-logins?hours=${hours}`),

  /**
   * Cleanup old logs (owner only)
   */
  cleanup: (daysToKeep = 90) =>
    authFetch(`/audit-logs/cleanup?daysToKeep=${daysToKeep}`, {
      method: "DELETE",
    }),
};
