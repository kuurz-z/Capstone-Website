/**
 * =============================================================================
 * TENANT API SERVICE (Legacy Compatibility)
 * =============================================================================
 *
 * DEPRECATION NOTICE:
 * This file uses axios without proper Firebase authentication.
 * For authenticated calls, use authApi from apiClient.js.
 *
 * Migration Guide:
 * - Old: import { tenantApi } from '../api/tenantApi'
 * - New: import { authApi } from '../api/apiClient'
 *
 * Note: Tenant-specific endpoints map to auth endpoints:
 * - getProfile → authApi.getProfile()
 * - updateProfile → authApi.updateProfile()
 *
 * @deprecated Use apiClient.js authApi instead
 * =============================================================================
 */

import axios from "axios";
import { API_BASE_URL } from "./baseUrl";

/**
 * Tenant API methods.
 * WARNING: These methods lack proper Firebase token authentication.
 * @deprecated Use apiClient.js authApi for authenticated profile operations
 */
export const tenantApi = {
  /**
   * Get tenant profile
   * @deprecated Use authApi.getProfile() from apiClient.js
   */
  getProfile: async () => {
    const response = await axios.get(`${API_BASE_URL}/auth/profile`);
    return response.data;
  },

  /**
   * Update tenant profile
   * @deprecated Use authApi.updateProfile() from apiClient.js
   */
  updateProfile: async (profileData) => {
    const response = await axios.put(
      `${API_BASE_URL}/auth/profile`,
      profileData,
    );
    return response.data;
  },

  /**
   * Get billing information
   * Note: Endpoint not yet implemented in backend
   */
  getBilling: async () => {
    const response = await axios.get(`${API_BASE_URL}/tenant/billing`);
    return response.data;
  },

  /**
   * Get contracts
   * Note: Endpoint not yet implemented in backend
   */
  getContracts: async () => {
    const response = await axios.get(`${API_BASE_URL}/tenant/contracts`);
    return response.data;
  },
};
