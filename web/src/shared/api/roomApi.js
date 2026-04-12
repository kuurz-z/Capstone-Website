/**
 * Room API - Domain-specific room operations
 */

import { authFetch, publicFetch } from "./httpClient.js";

export const roomApi = {
  /**
   * Get all rooms (public)
   */
  getAll: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return publicFetch(`/rooms?${params}`);
  },

  /**
   * Get room by ID (public)
   */
  getById: (roomId) => publicFetch(`/rooms/${roomId}`),

  /**
   * Create new room (admin only)
   */
  create: (roomData) =>
    authFetch("/rooms", {
      method: "POST",
      body: JSON.stringify(roomData),
    }),

  /**
   * Update room (admin only)
   */
  update: (roomId, roomData) =>
    authFetch(`/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify(roomData),
    }),

  /**
   * Update a single bed maintenance status through the dedicated room route.
   */
  updateBedStatus: (roomId, bedId, status) =>
    authFetch(`/rooms/${roomId}/beds/${bedId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  /**
   * Delete room (admin only)
   */
  delete: (roomId) => authFetch(`/rooms/${roomId}`, { method: "DELETE" }),

  /**
   * Get read-only occupancy consistency diagnostics for rooms.
   */
  getOccupancyConsistency: (filters = {}) => {
    const params = new URLSearchParams(filters);
    const query = params.toString();
    return authFetch(`/rooms/occupancy-consistency${query ? `?${query}` : ""}`);
  },

  /**
   * Get occupancy status for a specific room
   */
  getOccupancy: (roomId) => authFetch(`/reservations/occupancy/${roomId}`),

  /**
   * Get branch occupancy statistics
   */
  getBranchOccupancy: (branch = null) => {
    const url = branch
      ? `/reservations/stats/occupancy?branch=${branch}`
      : "/reservations/stats/occupancy";
    return authFetch(url);
  },

  /**
   * Get vacancy forecast for a branch or a single room
   */
  getVacancyForecast: ({ branch = null, roomId = null } = {}) => {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (roomId) params.set("roomId", roomId);
    const query = params.toString();
    return authFetch(`/reservations/vacancy-forecast${query ? `?${query}` : ""}`);
  },
};
