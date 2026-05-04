/**
 * Billing API - Domain-specific billing operations
 */

import { getSessionHeaders } from "./authSession";
import { API_URL, authFetch, getFreshToken } from "./httpClient.js";

const getDownloadFilename = (response, fallback) => {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const billingApi = {
  // ── Tenant Endpoints ──

  /**
   * Get current month's billing for logged-in tenant
   */
  getCurrentBilling: () => authFetch("/billing/current"),

  /**
   * Get billing history
   */
  getHistory: (limit = 50) => authFetch(`/billing/history?limit=${limit}`),

  /**
   * Get all bills for logged-in tenant with full breakdown
   */
  getMyBills: () => authFetch("/billing/my-bills"),

  getMyUtilityBreakdownByBillId: (billId, utilityType) =>
    authFetch(`/billing/${billId}/utility-breakdown/${utilityType}`),

  // ── Admin Endpoints ──

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
   * Apply penalties to overdue bills (admin only)
   */
  applyPenalties: () =>
    authFetch("/billing/apply-penalties", { method: "POST" }),

  /**
   * Get billing report (admin only)
   */
  getBillingReport: () => authFetch("/billing/report"),

  getPendingVerifications: (branch = null) =>
    authFetch(`/billing/pending-verifications${branch ? `?branch=${branch}` : ""}`),

  getRentBills: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/billing/rent${query ? `?${query}` : ""}`);
  },

  getRentBillableTenants: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/billing/rent/tenants${query ? `?${query}` : ""}`);
  },

  generateRentBill: (data) =>
    authFetch("/billing/rent/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  previewRentBill: (data) =>
    authFetch("/billing/rent/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateAllRentBills: (data) =>
    authFetch("/billing/rent/generate-all", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sendRentBill: (billId) =>
    authFetch(`/billing/rent/${billId}/send`, {
      method: "POST",
    }),

  downloadBillPdf: async (billId, fallbackFilename = "billing-statement.pdf") => {
    const token = await getFreshToken();
    if (!token) throw new Error("No authorization header provided - user not authenticated");

    const response = await fetch(`${API_URL}/billing/${billId}/pdf`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...getSessionHeaders(),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || "Failed to download PDF.");
    }

    const blob = await response.blob();
    const filename = getDownloadFilename(response, fallbackFilename);
    downloadBlob(blob, filename);
    return { filename };
  },

  verifyPayment: (billId, data) =>
    authFetch(`/billing/${billId}/verify`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── PayMongo Online Payment ──

  /**
   * Create a PayMongo checkout session for a bill
   */
  createCheckout: (billId) =>
    authFetch(`/payments/bill/${billId}/checkout`, { method: "POST" }),

  /**
   * Check PayMongo session payment status
   */
  checkPaymentStatus: (sessionId) =>
    authFetch(`/payments/session/${sessionId}/status`),

  /**
   * Create a PayMongo checkout session for a reservation deposit
   */
  createDepositCheckout: (reservationId) =>
    authFetch(`/payments/deposit/${reservationId}/checkout`, { method: "POST" }),

  // ── Payment History ──

  /**
   * Get payment history for the logged-in tenant
   */
  getPaymentHistory: (limit = 50) =>
    authFetch(`/payments/history?limit=${limit}`),

  /**
   * Get all payments for a specific bill
   */
  getPaymentsForBill: (billId) =>
    authFetch(`/payments/bill/${billId}/payments`),

  // ── Admin Export & Utilities ──

  /**
   * Get flattened billing data for CSV export (admin only)
   */
  getExportData: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/billing/export?${query}`);
  },

  /**
   * Get expected vacancy dates for all beds (admin only)
   */
  getVacancyDates: () =>
    authFetch("/payments/vacancy-dates"),
};
