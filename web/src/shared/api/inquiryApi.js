/**
 * Inquiry API - Domain-specific inquiry operations
 */

import { authFetch, publicFetch } from "./httpClient.js";

export const inquiryApi = {
  /**
   * Get all inquiries (admin only)
   */
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `/inquiries?${queryString}` : "/inquiries";
    return authFetch(url);
  },

  /**
   * Get inquiry by ID (admin only)
   */
  getById: (inquiryId) => authFetch(`/inquiries/${inquiryId}`),

  /**
   * Get inquiry statistics (admin only)
   */
  getStats: () => authFetch("/inquiries/stats"),

  /**
   * Create new inquiry (public - no auth required)
   */
  create: (inquiryData) =>
    publicFetch("/inquiries", {
      method: "POST",
      body: JSON.stringify(inquiryData),
    }),

  /**
   * Update inquiry (admin only)
   */
  update: (inquiryId, data) =>
    authFetch(`/inquiries/${inquiryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Archive inquiry (admin only) - soft delete
   */
  archive: (inquiryId) =>
    authFetch(`/inquiries/${inquiryId}`, { method: "DELETE" }),

  /**
   * Respond to inquiry (admin only)
   */
  respond: (inquiryId, response) =>
    authFetch(`/inquiries/${inquiryId}`, {
      method: "PUT",
      body: JSON.stringify({ response }),
    }),
};
