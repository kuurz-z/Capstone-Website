/**
 * Maintenance API - Domain-specific maintenance operations
 */

import { authFetch } from "./httpClient.js";

const buildQueryString = (filters = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

export const maintenanceApi = {
  /**
   * Get current tenant's maintenance requests
   */
  getMyRequests: (filters = {}) =>
    authFetch(`/m/maintenance/me${buildQueryString(filters)}`),

  /**
   * Create maintenance request
   */
  createRequest: (requestData) =>
    authFetch("/m/maintenance", {
      method: "POST",
      body: JSON.stringify(requestData),
    }),

  /**
   * Update a pending maintenance request
   */
  updateMyRequest: (requestId, requestData) =>
    authFetch(`/m/maintenance/${requestId}`, {
      method: "PUT",
      body: JSON.stringify(requestData),
    }),

  /**
   * Cancel a pending maintenance request
   */
  cancelRequest: (requestId) =>
    authFetch(`/m/maintenance/${requestId}/cancel`, {
      method: "PATCH",
    }),

  /**
   * Reopen a resolved/completed maintenance request
   */
  reopenRequest: (requestId, note) =>
    authFetch(`/m/maintenance/${requestId}/reopen`, {
      method: "PATCH",
      body: JSON.stringify({ reopen_note: note }),
    }),

  /**
   * Get maintenance request details
   */
  getRequest: (requestId) => authFetch(`/m/maintenance/${requestId}`),

  /**
   * Get all admin maintenance requests
   */
  getAdminAll: (filters = {}) =>
    authFetch(`/m/maintenance/admin/all${buildQueryString(filters)}`),

  /**
   * Update maintenance request status/notes/assignment (admin only)
   */
  updateAdminRequestStatus: (requestId, payload) =>
    authFetch(`/m/maintenance/admin/${requestId}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /**
   * Bulk update maintenance requests (admin only)
   */
  bulkUpdateAdminRequests: (payload) =>
    authFetch("/m/maintenance/admin/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /**
   * Legacy compatibility methods retained for untouched callers.
   */
  getByBranch: (filters = {}) =>
    authFetch(`/maintenance/branch${buildQueryString(filters)}`),

  updateRequest: (requestId, status, completionNote) =>
    authFetch(`/maintenance/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, completionNote }),
    }),

  getCompletionStats: (days = 30) =>
    authFetch(`/maintenance/stats/completion?days=${days}`),

  getIssueFrequency: (limit = 12, months = 6) =>
    authFetch(
      `/maintenance/stats/issue-frequency?limit=${limit}&months=${months}`,
    ),
};
