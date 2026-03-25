/**
 * Digital Twin API — domain-specific digital twin operations
 */

import { authFetch } from "./httpClient.js";

export const digitalTwinApi = {
  /**
   * Get branch snapshot with all rooms enriched with health scores
   * @param {string|null} branch - "gil-puyat", "guadalupe", or null for all
   */
  getSnapshot: (branch = null) => {
    const params = branch ? `?branch=${branch}` : "";
    return authFetch(`/digital-twin/snapshot${params}`);
  },

  /**
   * Get deep-dive detail for a single room
   * @param {string} roomId
   */
  getRoomDetail: (roomId) => authFetch(`/digital-twin/room/${roomId}`),
};
