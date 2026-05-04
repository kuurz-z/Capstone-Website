import { authFetch } from "./httpClient.js";
import { normalizeLifecyclePayload } from "../utils/lifecycleNaming.js";

const withLifecycleNormalization = (promise) =>
  promise.then((payload) => normalizeLifecyclePayload(payload));

export const utilityApi = {
  // ── Meter Readings ──
  recordReading: (utilityType, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/readings`, { method: "POST", body: JSON.stringify(data) }),
    ),

  getReadings: (utilityType, roomId, periodId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/readings/${roomId}${periodId ? `?periodId=${periodId}` : ""}`),
    ),

  getLatestReading: (utilityType, roomId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/readings/${roomId}/latest`),
    ),

  deleteReading: (utilityType, readingId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/readings/${readingId}`, { method: "DELETE" }),
    ),

  updateReading: (utilityType, readingId, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/readings/${readingId}`, { method: "PATCH", body: JSON.stringify(data) }),
    ),

  // ── Billing Periods ──
  openPeriod: (utilityType, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods`, { method: "POST", body: JSON.stringify(data) }),
    ),

  closePeriod: (utilityType, periodId, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods/${periodId}/close`, { method: "PATCH", body: JSON.stringify(data) }),
    ),

  sendPeriod: (utilityType, periodId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods/${periodId}/send`, { method: "POST" }),
    ),

  batchClose: (utilityType, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/batch-close`, { method: "POST", body: JSON.stringify(data) }),
    ),

  getPeriods: (utilityType, roomId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods/${roomId}`),
    ),

  updatePeriod: (utilityType, periodId, data) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods/${periodId}`, { method: "PATCH", body: JSON.stringify(data) }),
    ),

  deletePeriod: (utilityType, periodId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/periods/${periodId}`, { method: "DELETE" }),
    ),

  // ── Results ──
  getResult: (utilityType, periodId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/results/${periodId}`),
    ),

  reviseResult: (utilityType, periodId, revisionNote) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/results/${periodId}/revise`, { method: "POST", body: JSON.stringify({ revisionNote }) }),
    ),

  // ── Rooms ──
  getRooms: (utilityType, branch) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/rooms${branch ? `?branch=${branch}` : ""}`),
    ),

  getRoomHistory: (utilityType, roomId) =>
    withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/rooms/${roomId}/history`),
    ),

  exportRows: (utilityType, params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") search.set(key, value);
    });
    const query = search.toString();
    return withLifecycleNormalization(
      authFetch(`/utilities/${utilityType}/export${query ? `?${query}` : ""}`),
    );
  },

  getDiagnostics: (branch) =>
    withLifecycleNormalization(
      authFetch(`/utilities/diagnostics${branch ? `?branch=${branch}` : ""}`),
    ),
};

