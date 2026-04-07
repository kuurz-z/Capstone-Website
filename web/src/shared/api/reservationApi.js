/**
 * Reservation API - Domain-specific reservation operations
 */

import { authFetch } from "./httpClient.js";

export const reservationApi = {
  /**
   * Get all reservations
   */
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `/reservations?${queryString}` : "/reservations";
    return authFetch(url);
  },

  /**
   * Get current checked-in residents for admin tenants page
   */
  getCurrentResidents: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.branch && params.branch !== "all") {
      searchParams.set("branch", params.branch);
    }
    const query = searchParams.toString();
    return authFetch(`/reservations/current-residents${query ? `?${query}` : ""}`);
  },

  /**
   * Get reservation by ID
   */
  getById: (reservationId) => authFetch(`/reservations/${reservationId}`),

  /**
   * Create new reservation
   */
  create: (reservationData) =>
    authFetch("/reservations", {
      method: "POST",
      body: JSON.stringify(reservationData),
    }),

  /**
   * Update reservation (admin only)
   */
  update: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Update reservation (tenant only)
   */
  updateByUser: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/user`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Cancel reservation
   */
  cancel: (reservationId) =>
    authFetch(`/reservations/${reservationId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    }),

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
    authFetch(`/reservations/${reservationId}/extend`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Release reservation slot (admin only)
   */
  release: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/release`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Archive (soft delete) reservation (admin only)
   */
  archive: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/archive`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Renew a tenant's contract / extend lease (admin only)
   */
  renew: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/renew`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Check out a tenant (admin only)
   */
  checkout: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/checkout`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /**
   * Transfer tenant to a different room/bed (admin only)
   */
  transfer: (reservationId, data) =>
    authFetch(`/reservations/${reservationId}/transfer`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
