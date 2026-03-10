/**
 * Billing API - Domain-specific billing operations
 */

import { authFetch } from "./httpClient.js";

export const billingApi = {
  /**
   * Get current month's billing for logged-in tenant
   */
  getCurrentBilling: () => authFetch("/billing/current"),

  /**
   * Get billing history
   */
  getHistory: (limit = 50) => authFetch(`/billing/history?limit=${limit}`),

  /**
   * Get billing statistics by branch (admin only)
   */
  getStats: () => authFetch("/billing/stats"),

  /**
   * Mark a bill as paid (admin only)
   */
  markAsPaid: (billId, amount, note) =>
    authFetch(`/billing/${billId}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),

  // ── Admin Billing ──

  /**
   * Get all bills for a branch (admin only)
   */
  getBillsByBranch: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/billing/branch?${query}`);
  },

  /**
   * Get rooms with occupants for bill generation (admin only)
   */
  getRoomsWithTenants: (branch) =>
    authFetch(`/billing/rooms${branch ? `?branch=${branch}` : ""}`),

  /**
   * Generate room-based bills (admin only)
   */
  generateRoomBill: (billData) =>
    authFetch("/billing/generate-room", {
      method: "POST",
      body: JSON.stringify(billData),
    }),
};
