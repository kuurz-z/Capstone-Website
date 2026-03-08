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
   * Delete room (admin only)
   */
  delete: (roomId) => authFetch(`/rooms/${roomId}`, { method: "DELETE" }),

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
};
