/**
 * Maintenance API - Domain-specific maintenance operations
 */

import { authFetch } from "./httpClient.js";

export const maintenanceApi = {
  /**
   * Get current tenant's maintenance requests
   */
  getMyRequests: (limit = 50, status = null) => {
    let url = `/maintenance/my-requests?limit=${limit}`;
    if (status) url += `&status=${status}`;
    return authFetch(url);
  },

  /**
   * Get all maintenance requests by branch (admin only)
   */
  getByBranch: (limit = 50, status = null, category = null) => {
    let url = `/maintenance/branch?limit=${limit}`;
    if (status) url += `&status=${status}`;
    if (category) url += `&category=${category}`;
    return authFetch(url);
  },

  /**
   * Create maintenance request
   */
  createRequest: (requestData) =>
    authFetch("/maintenance/requests", {
      method: "POST",
      body: JSON.stringify(requestData),
    }),

  /**
   * Get maintenance request details
   */
  getRequest: (requestId) => authFetch(`/maintenance/requests/${requestId}`),

  /**
   * Update maintenance request status (admin only)
   */
  updateRequest: (requestId, status, completionNote) =>
    authFetch(`/maintenance/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, completionNote }),
    }),

  /**
   * Get completion statistics by branch (admin only)
   */
  getCompletionStats: (days = 30) =>
    authFetch(`/maintenance/stats/completion?days=${days}`),

  /**
   * Get issue frequency for predictive maintenance (admin only)
   */
  getIssueFrequency: (limit = 12, months = 6) =>
    authFetch(
      `/maintenance/stats/issue-frequency?limit=${limit}&months=${months}`,
    ),
};
