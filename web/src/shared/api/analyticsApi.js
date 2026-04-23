import { authFetch } from "./httpClient.js";

export const analyticsApi = {
  getDashboard: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/dashboard${query ? `?${query}` : ""}`);
  },
  getOccupancyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/reports/occupancy${query ? `?${query}` : ""}`);
  },
  getBillingReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/reports/billing${query ? `?${query}` : ""}`);
  },
  getOperationsReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/reports/operations${query ? `?${query}` : ""}`);
  },
  getOccupancyForecast: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/forecast/occupancy${query ? `?${query}` : ""}`);
  },
  getFinancials: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/financials${query ? `?${query}` : ""}`);
  },
  getAuditSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/analytics/audit${query ? `?${query}` : ""}`);
  },
};
