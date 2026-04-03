/**
 * =============================================================================
 * API CLIENT - Centralized Re-export Hub
 * =============================================================================
 *
 * This file re-exports all domain-specific API modules for backward
 * compatibility. Existing imports like:
 *
 *   import { roomApi, reservationApi } from "../shared/api/apiClient";
 *
 * continue to work without any changes.
 *
 * For new code, you can import directly from the domain-specific files:
 *
 *   import { roomApi } from "../shared/api/roomApi";
 *   import { reservationApi } from "../shared/api/reservationApi";
 *
 * =============================================================================
 */

// Core HTTP client
export { authFetch, publicFetch, useApiClient } from "./httpClient.js";

// Domain-specific API modules
export { authApi } from "./authApi.js";
export { roomApi } from "./roomApi.js";
export { reservationApi } from "./reservationApi.js";
export { inquiryApi } from "./inquiryApi.js";
export { userApi } from "./userApi.js";
export { auditApi } from "./auditApi.js";
export { billingApi } from "./billingApi.js";
export { announcementApi } from "./announcementApi.js";
export { maintenanceApi } from "./maintenanceApi.js";
export { notificationApi } from "./notificationApi.js";
export { utilityApi } from "./utilityApi.js";
export { settingsApi } from "./settingsApi.js";

// =============================================================================
// DEFAULT EXPORT (backward compatibility)
// =============================================================================

import { authApi } from "./authApi.js";
import { roomApi } from "./roomApi.js";
import { reservationApi } from "./reservationApi.js";
import { inquiryApi } from "./inquiryApi.js";
import { userApi } from "./userApi.js";
import { auditApi } from "./auditApi.js";
import { billingApi } from "./billingApi.js";
import { announcementApi } from "./announcementApi.js";
import { maintenanceApi } from "./maintenanceApi.js";
import { notificationApi } from "./notificationApi.js";
import { utilityApi } from "./utilityApi.js";
import { settingsApi } from "./settingsApi.js";
import { useApiClient } from "./httpClient.js";

const apiClient = {
  authApi,
  roomApi,
  reservationApi,
  inquiryApi,
  userApi,
  auditApi,
  billingApi,
  announcementApi,
  maintenanceApi,
  notificationApi,
  utilityApi,
  settingsApi,
  useApiClient,
};

export default apiClient;
