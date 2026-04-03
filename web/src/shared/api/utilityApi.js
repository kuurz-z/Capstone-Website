import { authFetch } from "./httpClient.js";

export const utilityApi = {
  // ── Meter Readings ──
  recordReading: (utilityType, data) =>
    authFetch(`/utilities/${utilityType}/readings`, { method: "POST", body: JSON.stringify(data) }),

  getReadings: (utilityType, roomId, periodId) =>
    authFetch(`/utilities/${utilityType}/readings/${roomId}${periodId ? `?periodId=${periodId}` : ""}`),

  getLatestReading: (utilityType, roomId) =>
    authFetch(`/utilities/${utilityType}/readings/${roomId}/latest`),

  deleteReading: (utilityType, readingId) =>
    authFetch(`/utilities/${utilityType}/readings/${readingId}`, { method: "DELETE" }),

  updateReading: (utilityType, readingId, data) =>
    authFetch(`/utilities/${utilityType}/readings/${readingId}`, { method: "PATCH", body: JSON.stringify(data) }),

  // ── Billing Periods ──
  openPeriod: (utilityType, data) =>
    authFetch(`/utilities/${utilityType}/periods`, { method: "POST", body: JSON.stringify(data) }),

  closePeriod: (utilityType, periodId, data) =>
    authFetch(`/utilities/${utilityType}/periods/${periodId}/close`, { method: "PATCH", body: JSON.stringify(data) }),

  batchClose: (utilityType, data) =>
    authFetch(`/utilities/${utilityType}/batch-close`, { method: "POST", body: JSON.stringify(data) }),

  getPeriods: (utilityType, roomId) =>
    authFetch(`/utilities/${utilityType}/periods/${roomId}`),

  updatePeriod: (utilityType, periodId, data) =>
    authFetch(`/utilities/${utilityType}/periods/${periodId}`, { method: "PATCH", body: JSON.stringify(data) }),

  deletePeriod: (utilityType, periodId) =>
    authFetch(`/utilities/${utilityType}/periods/${periodId}`, { method: "DELETE" }),

  // ── Results ──
  getResult: (utilityType, periodId) =>
    authFetch(`/utilities/${utilityType}/results/${periodId}`),

  reviseResult: (utilityType, periodId, revisionNote) =>
    authFetch(`/utilities/${utilityType}/results/${periodId}/revise`, { method: "POST", body: JSON.stringify({ revisionNote }) }),

  // ── Rooms ──
  getRooms: (utilityType, branch) =>
    authFetch(`/utilities/${utilityType}/rooms${branch ? `?branch=${branch}` : ""}`),

  exportRows: (utilityType, params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") search.set(key, value);
    });
    const query = search.toString();
    return authFetch(`/utilities/${utilityType}/export${query ? `?${query}` : ""}`);
  },

  getDiagnostics: (branch) =>
    authFetch(`/utilities/diagnostics${branch ? `?branch=${branch}` : ""}`),
};
