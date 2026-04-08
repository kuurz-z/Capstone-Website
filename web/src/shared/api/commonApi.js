/**
 * =============================================================================
 * COMMON API SERVICE (Legacy Compatibility)
 * =============================================================================
 *
 * DEPRECATION NOTICE:
 * This file uses axios without authentication. For authenticated calls,
 * use the API objects from apiClient.js (roomApi, inquiryApi, etc.).
 *
 * Migration Guide:
 * - Old: import { commonApi } from '../api/commonApi'
 * - New: import { roomApi, inquiryApi } from '../api/apiClient'
 *
 * These methods are PUBLIC endpoints (no auth required).
 * @deprecated Use apiClient.js for new implementations
 * =============================================================================
 */

import axios from "axios";
import { API_BASE_URL } from "./baseUrl";

/**
 * Public API methods for unauthenticated requests.
 * @deprecated Use apiClient.js roomApi and inquiryApi instead
 */
export const commonApi = {
  /**
   * Get all rooms with optional branch filter
   * @param {string} branch - Branch filter ('gil-puyat' or 'guadalupe')
   * @returns {Promise<Array>} List of rooms
   */
  getRooms: async (branch) => {
    const response = await axios.get(`${API_BASE_URL}/rooms`, {
      params: { branch },
    });
    return response.data;
  },

  /**
   * Get room details by ID
   * @param {string} roomId - MongoDB ObjectId of the room
   * @returns {Promise<Object>} Room details
   */
  getRoomDetails: async (roomId) => {
    const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}`);
    return response.data;
  },

  /**
   * Submit a new inquiry (public endpoint)
   * @param {Object} inquiryData - Inquiry form data
   * @returns {Promise<Object>} Created inquiry
   */
  submitInquiry: async (inquiryData) => {
    const response = await axios.post(`${API_BASE_URL}/inquiries`, inquiryData);
    return response.data;
  },
};
