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
};
