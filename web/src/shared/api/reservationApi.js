/**
 * Reservation API - Domain-specific reservation operations
 */

import { authFetch } from "./httpClient.js";
import { normalizeLifecyclePayload } from "../utils/lifecycleNaming.js";

const withLifecycleNormalization = (promise) =>
  promise.then((payload) => normalizeLifecyclePayload(payload));

export const reservationApi = {
  /**
   * Get all reservations
   */
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `/reservations?${queryString}` : "/reservations";
    return withLifecycleNormalization(authFetch(url));
  },

  /**
   * Get current moved-in residents for admin tenants page
   */
  getCurrentResidents: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.branch && params.branch !== "all") {
      searchParams.set("branch", params.branch);
    }
    const query = searchParams.toString();
    return withLifecycleNormalization(
      authFetch(`/reservations/current-residents${query ? `?${query}` : ""}`),
    );
  },

  /**
   * Get tenancy workspace rows for the admin tenants page.
   */
  getTenantWorkspace: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.branch && params.branch !== "all") {
      searchParams.set("branch", params.branch);
    }
    const query = searchParams.toString();
    return authFetch(`/reservations/tenant-workspace${query ? `?${query}` : ""}`);
  },

  /**
   * Get a single tenancy workspace detail payload.
   */
  getTenantWorkspaceById: (reservationId) =>
    authFetch(`/reservations/tenant-workspace/${reservationId}`),

  getTenantActionContext: (reservationId) =>
    authFetch(`/reservations/${reservationId}/tenant-actions/context`),

  getVisitAvailability: (params = {}) => {
    const queryString = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    ).toString();
    return authFetch(`/reservations/visit-availability${queryString ? `?${queryString}` : ""}`);
  },

  getVisitAvailabilitySettings: (branch) => {
    const queryString = new URLSearchParams({ branch }).toString();
    return authFetch(`/reservations/visit-availability/settings?${queryString}`);
  },

  updateVisitAvailabilitySettings: (branch, data) => {
    const queryString = new URLSearchParams({ branch }).toString();
    return authFetch(`/reservations/visit-availability/settings?${queryString}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /**
   * Get reservation by ID
   */
  getById: (reservationId) =>
    withLifecycleNormalization(authFetch(`/reservations/${reservationId}`)),

  /**
   * Create new reservation
   */
  create: (reservationData) =>
    withLifecycleNormalization(
      authFetch("/reservations", {
      method: "POST",
      body: JSON.stringify(reservationData),
      }),
    ),

  /**
   * Update reservation (admin only)
   */
  update: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Update reservation (tenant only)
   */
  updateByUser: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/user`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Validate applicant valid ID using backend OCR/Google Vision.
   */
  validateIdDocument: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/id-validation`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),

  cancelByUser: (reservationId, reason = "") =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      }),
    ),

  /**
   * Cancel reservation — legacy alias kept for backward compatibility.
   * New code should use cancelByUser instead.
   * @deprecated Use cancelByUser
   */
  cancel: (reservationId) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    ),

  /**
   * Delete reservation
   */
  delete: (reservationId) =>
    authFetch(`/reservations/${reservationId}`, {
      method: "DELETE",
    }),

  /**
   * Extend reservation move-in date (admin only)
   */
  extend: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/extend`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Release reservation slot (admin only)
   */
  release: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/release`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Archive (soft delete) reservation (admin only)
   */
  archive: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/archive`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Renew a tenant's contract / extend lease (admin only)
   */
  renew: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/renew`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Move out a tenant (admin only)
   * Uses the legacy /checkout route for compatibility.
   */
  moveOut: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/checkout`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  // Legacy alias for the move-out route.
  checkout: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/checkout`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),

  /**
   * Transfer tenant to a different room/bed (admin only)
   */
  transfer: (reservationId, data) =>
    withLifecycleNormalization(
      authFetch(`/reservations/${reservationId}/transfer`, {
      method: "PUT",
      body: JSON.stringify(data),
      }),
    ),
};
