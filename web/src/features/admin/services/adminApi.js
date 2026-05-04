/**
 * =============================================================================
 * ADMIN API SERVICE (Legacy Compatibility)
 * =============================================================================
 *
 * DEPRECATION NOTICE:
 * This file uses axios without proper Firebase authentication.
 * For authenticated admin calls, use the API objects from apiClient.js.
 *
 * Migration Guide:
 * - Old: import { adminApi } from '../services/adminApi'
 * - New: import { inquiryApi, reservationApi, userApi } from '../../../shared/api/apiClient'
 *
 * The admin-specific endpoints have been consolidated:
 * - getInquiries → inquiryApi.getAll()
 * - getReservations → reservationApi.getAll()
 * - getTenants → userApi.getAll()
 *
 * @deprecated Use apiClient.js API objects instead
 * =============================================================================
 */

import axios from "axios";
import { API_BASE_URL } from "../../../shared/api/baseUrl";

/**
 * Admin API methods.
 * WARNING: These methods lack proper Firebase token authentication.
 * @deprecated Use apiClient.js inquiryApi, reservationApi, userApi instead
 */
export const adminApi = {
 /**
 * Get all inquiries for admin's branch
 * @deprecated Use inquiryApi.getAll() from apiClient.js
 */
 getInquiries: async () => {
 const response = await axios.get(`${API_BASE_URL}/inquiries`);
 return response.data;
 },

 /**
 * Get all reservations for admin's branch
 * @deprecated Use reservationApi.getAll() from apiClient.js
 */
 getReservations: async () => {
 const response = await axios.get(`${API_BASE_URL}/reservations`);
 return response.data;
 },

 /**
 * Get all tenants/users for admin's branch
 * @deprecated Use userApi.getAll() from apiClient.js
 */
 getTenants: async () => {
 const response = await axios.get(`${API_BASE_URL}/users`);
 return response.data;
 },
};
